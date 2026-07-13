"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  createSession,
  getQuestions,
  getTop10Questions,
  getUserProfile,
} from "@/lib/db";
import type { Question, Top10Question, UserProfile } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  Armchair,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Dices,
  Image as ImageIcon,
  Heart,
  Layers,
  Search,
  Shuffle,
  Sparkles,
  Timer,
  WandSparkles,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import DifficultyBadge from "@/components/ui/DifficultyBadge";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Spinner from "@/components/ui/Spinner";
import Top10BankPicker, {
  type Top10SelectionMode,
} from "@/components/game/Top10BankPicker";

const getTarkeebaAnswer = (question: Question) =>
  (question.answerWord || question.option1 || "").trim();

const getArabicWordLength = (value: string) =>
  Array.from(value.normalize("NFKC").replace(/[\u064B-\u065F\u0670\sـ]/g, ""))
    .length;

const MONEY_DIFFICULTY_RANK: Record<Question["difficulty"], number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

function pickMoneyQuestions(pool: Question[], random = false) {
  if (random)
    return [...pool]
      .sort(() => Math.random() - 0.5)
      .slice(0, 5)
      .sort(
        (first, second) =>
          MONEY_DIFFICULTY_RANK[first.difficulty] -
          MONEY_DIFFICULTY_RANK[second.difficulty],
      )
      .map((question) => question.id);
  const remaining = [...pool];
  const picked: Question[] = [];
  (["easy", "easy", "medium", "medium", "hard"] as const).forEach(
    (difficulty) => {
      const index = remaining.findIndex(
        (question) => question.difficulty === difficulty,
      );
      if (index >= 0) picked.push(...remaining.splice(index, 1));
    },
  );
  picked.push(
    ...remaining
      .sort(
        (first, second) =>
          MONEY_DIFFICULTY_RANK[first.difficulty] -
          MONEY_DIFFICULTY_RANK[second.difficulty],
      )
      .slice(0, 5 - picked.length),
  );
  return picked
    .sort(
      (first, second) =>
        MONEY_DIFFICULTY_RANK[first.difficulty] -
        MONEY_DIFFICULTY_RANK[second.difficulty],
    )
    .map((question) => question.id);
}

type GameMode =
  | "quiz"
  | "chairs"
  | "survival"
  | "faction"
  | "impostor"
  | "roulette"
  | "word"
  | "image-reveal"
  | "tarkeeba"
  | "baathra"
  | "money"
  | "top10";
type PickMode = "manual" | "random" | "custom";
type GameQuestionRule = {
  categories?: string[];
  questionTypes?: Array<"text" | "image" | "word">;
  bankEnabled?: boolean;
};

const MODE_INFO: Array<{
  id: GameMode;
  title: string;
  description: string;
  icon: typeof Layers;
  tone: string;
}> = [
  {
    id: "quiz",
    title: "تحدي الأسئلة والإعلام",
    description: "أسئلة نصية، صور أو أعلام مع خيارات.",
    icon: ImageIcon,
    tone: "text-neon-bright border-neon/35 bg-neon/10",
  },
  {
    id: "chairs",
    title: "لعبة الكراسي",
    description: "اختر رقم كرسي؛ أول لاعب يحجزه يتأهل.",
    icon: Armchair,
    tone: "text-gold border-gold/35 bg-gold/10",
  },
  {
    id: "survival",
    title: "الزنزانة",
    description: "خطأ واحد أو تأخر في الوقت يعني الإقصاء.",
    icon: Dices,
    tone: "text-danger-bright border-danger/35 bg-danger/10",
  },
  {
    id: "faction",
    title: "حرب الفواكه / الدول",
    description: "فريقان يتنافسان بنقاط إجاباتهم السريعة.",
    icon: Layers,
    tone: "text-success-bright border-success/35 bg-success/10",
  },
  {
    id: "impostor",
    title: "أمبوستر",
    description: "كلمة سرية، مناقشة، ثم تصويت لكشف الخائن.",
    icon: Dices,
    tone: "text-danger-bright border-danger/35 bg-danger/10",
  },
  {
    id: "roulette",
    title: "عجلة الروليت",
    description: "مكافأة عشوائية يتحكم بها الفائز من جواله.",
    icon: Sparkles,
    tone: "text-gold border-gold/35 bg-gold/10",
  },
  {
    id: "word",
    title: "الكلمة المفقودة",
    description: "أكمل الكلمة من الحروف بأسرع وقت.",
    icon: WandSparkles,
    tone: "text-cyan border-cyan/35 bg-cyan/10",
  },
  {
    id: "image-reveal",
    title: "تخمين الصورة — كشف الستار",
    description: "صورة مخفية بمربعات تنكشف تدريجياً مع 4 خيارات.",
    icon: ImageIcon,
    tone: "text-pink-400 border-pink-400/35 bg-pink-500/10",
  },
  {
    id: "tarkeeba",
    title: "تركيبة",
    description: "خمن الكلمة السرية خلال 6 محاولات مع تلميحات الألوان.",
    icon: Dices,
    tone: "text-gold border-gold/35 bg-gold/10",
  },
  {
    id: "baathra",
    title: "بعثرة",
    description: "رتّب الكلمة بسرعة أو كوّن اسماً من الحروف المتاحة.",
    icon: WandSparkles,
    tone: "text-magenta border-magenta/35 bg-magenta/10",
  },
  {
    id: "money",
    title: "فلوسك على المحك",
    description: "لوحة فئات ومبالغ بين الفرق مع تقييم شفهي.",
    icon: Sparkles,
    tone: "text-success-bright border-success/35 bg-success/10",
  },
  {
    id: "top10",
    title: "TOP 10",
    description: "اكتشف عناصر القائمة المخفية قبل بقية المتسابقين.",
    icon: Layers,
    tone: "text-cyan border-cyan/35 bg-cyan/10",
  },
];

function QuestionSelectionPreview({
  question,
  gameTitle,
}: {
  question: Question;
  gameTitle: string;
}) {
  const options = [
    question.option1,
    question.option2,
    question.option3,
    question.option4,
  ];
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {question.questionType === "image" && question.imageUrl ? (
        <img
          src={question.imageUrl}
          alt="معاينة السؤال"
          className="h-20 w-28 shrink-0 rounded-xl border border-line bg-white object-contain sm:h-24 sm:w-36"
        />
      ) : (
        <span className="grid h-16 w-20 shrink-0 place-items-center rounded-xl border border-line bg-void/50 text-2xl">
          {question.questionType === "word" ? "🧩" : "❔"}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-6 text-ink">{question.questionText}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-[9px] font-extrabold text-success-bright">
            ✓ متوافق مع {gameTitle}
          </span>
          <CategoryIcon category={question.category} />
          <DifficultyBadge difficulty={question.difficulty} />
        </div>
        {question.questionType === "word" ? (
          <p className="mt-2 rounded-lg border border-success/25 bg-success/10 px-2.5 py-1.5 text-[11px] font-extrabold text-success-bright">
            الإجابة: {question.answerWord || question.option1}
          </p>
        ) : (
          <div className="mt-2 grid gap-1 sm:grid-cols-2">
            {options.map((option, index) =>
              option ? (
                <span
                  key={index}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[10px] font-bold",
                    question.correctOption === index + 1
                      ? "border-success/40 bg-success/15 text-success-bright"
                      : "border-line bg-void/40 text-ink-mute",
                  )}
                >
                  {option}
                  {question.correctOption === index + 1 && " ✓"}
                </span>
              ) : null,
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GamesOfficePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [gameMode, setGameMode] = useState<GameMode>("quiz");
  const [title, setTitle] = useState("");
  const [timerDuration, setTimerDuration] = useState(30);
  const [timerChoice, setTimerChoice] = useState("30");
  const [pickMode, setPickMode] = useState<PickMode>("manual");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [randomSelectionApplied, setRandomSelectionApplied] = useState(false);
  const [customCandidateIds, setCustomCandidateIds] = useState<string[]>([]);
  const [customCandidateSelectedIds, setCustomCandidateSelectedIds] = useState<
    string[]
  >([]);
  const [randomCount, setRandomCount] = useState(10);
  const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [questionTypeFilter, setQuestionTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [savingRoomCode, setSavingRoomCode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameModeVisibility, setGameModeVisibility] = useState<
    Record<string, boolean>
  >({});
  const [gameQuestionRules, setGameQuestionRules] = useState<
    Record<string, GameQuestionRule>
  >({});
  const [gameInstructions, setGameInstructions] = useState<
    Record<string, string>
  >({});
  const [helpMode, setHelpMode] = useState<GameMode | null>(null);
  const [favoriteModes, setFavoriteModes] = useState<GameMode[]>([]);
  const [impostorWord, setImpostorWord] = useState("");
  const [impostorCategory, setImpostorCategory] = useState("");
  const [discussionDuration, setDiscussionDuration] = useState(90);
  const [roulettePrizes, setRoulettePrizes] = useState(
    "جائزة ذهبية، 50 نقطة إضافية، بطاقة حظ، مفاجأة",
  );
  const [wordMaxAttempts, setWordMaxAttempts] = useState(7);
  const [imageRevealGrid, setImageRevealGrid] = useState<4 | 6 | 8>(6);
  const [tarkeebaWord, setTarkeebaWord] = useState("");
  const [tarkeebaCategory, setTarkeebaCategory] = useState("كلمات عامة");
  const [baathraMode, setBaathraMode] = useState<"speed" | "requests">("speed");
  const [baathraSecret, setBaathraSecret] = useState("");
  const [baathraLetters, setBaathraLetters] = useState("");
  const [baathraCategory, setBaathraCategory] = useState("اسم ولد");
  const [baathraScoring, setBaathraScoring] = useState<"first" | "ranked">(
    "ranked",
  );
  const [moneyCategories, setMoneyCategories] = useState<string[]>([]);
  const [moneyQuestionSelections, setMoneyQuestionSelections] = useState<
    Record<string, string[]>
  >({});
  const [moneyValues, setMoneyValues] = useState([400, 800, 1200, 1600, 2000]);
  const [moneyScoring, setMoneyScoring] = useState<"fastest" | "ranked">(
    "ranked",
  );
  const [top10Prompt, setTop10Prompt] = useState("");
  const [top10Questions, setTop10Questions] = useState<Top10Question[]>([]);
  const [top10SelectionMode, setTop10SelectionMode] =
    useState<Top10SelectionMode>("selected");
  const [top10SelectedId, setTop10SelectedId] = useState("");
  const [top10Entries, setTop10Entries] = useState(
    Array.from({ length: 10 }, () => ({ answer: "", aliases: "" })),
  );

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/auth");
        return;
      }
      try {
        const [
          userProfile,
          questionList,
          top10QuestionList,
          tokenResult,
          modesResponse,
        ] = await Promise.all([
          getUserProfile(user.uid),
          getQuestions(),
          getTop10Questions(),
          user.getIdTokenResult(),
          fetch("/api/game-modes"),
        ]);
        setProfile(userProfile);
        setFavoriteModes(
          (userProfile?.favoriteGameModes || []).filter(
            (mode): mode is GameMode =>
              MODE_INFO.some((item) => item.id === mode),
          ),
        );
        setRoomCode(userProfile?.roomCode || "");
        setQuestions(
          questionList.filter(
            (question) =>
              !question.temporarySessionId &&
              (question.visibility !== "presenter-private" ||
                tokenResult.claims.admin === true ||
                question.createdBy === user.uid),
          ),
        );
        setTop10Questions(top10QuestionList);
        setIsAdmin(tokenResult.claims.admin === true);
        if (modesResponse.ok) {
          const settings = (await modesResponse.json()) as {
            enabled?: Record<string, boolean>;
            questionRules?: Record<string, GameQuestionRule>;
            gameInstructions?: Record<string, string>;
          };
          setGameModeVisibility(settings.enabled || {});
          setGameQuestionRules(settings.questionRules || {});
          setGameInstructions(settings.gameInstructions || {});
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "تعذر تحميل مكتبة الألعاب.",
        );
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  const gameCompatibleQuestions = useMemo(
    () =>
      questions.filter((question) => {
        const rule = gameQuestionRules[gameMode];
        if (rule?.bankEnabled === false) return false;
        if (
          ["quiz", "survival", "faction"].includes(gameMode) &&
          question.questionType === "word"
        )
          return false;
        if (gameMode === "word" && question.questionType !== "word")
          return false;
        if (
          gameMode === "tarkeeba" &&
          (question.questionType !== "word" ||
            getArabicWordLength(getTarkeebaAnswer(question)) !== 5)
        )
          return false;
        if (
          gameMode === "image-reveal" &&
          (question.questionType !== "image" ||
            !question.imageUrl ||
            !question.option4)
        )
          return false;
        if (
          rule?.categories?.length &&
          !rule.categories.includes(question.category)
        )
          return false;
        if (
          rule?.questionTypes?.length &&
          !rule.questionTypes.includes(question.questionType || "text")
        )
          return false;
        return true;
      }),
    [questions, gameMode, gameQuestionRules],
  );
  const filteredQuestions = useMemo(
    () =>
      gameCompatibleQuestions.filter((question) => {
        if (category !== "all" && question.category !== category) return false;
        if (difficulty !== "all" && question.difficulty !== difficulty)
          return false;
        if (
          questionTypeFilter !== "all" &&
          (question.questionType || "text") !== questionTypeFilter
        )
          return false;
        return (
          !search.trim() ||
          question.questionText
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        );
      }),
    [gameCompatibleQuestions, category, difficulty, questionTypeFilter, search],
  );

  const moneyEligibleQuestions = useMemo(
    () =>
      gameCompatibleQuestions.filter(
        (question) => question.questionType !== "word",
      ),
    [gameCompatibleQuestions],
  );
  const moneyAvailableCategories = useMemo(
    () =>
      [...new Set(moneyEligibleQuestions.map((question) => question.category))]
        .filter(
          (item) =>
            moneyEligibleQuestions.filter(
              (question) => question.category === item,
            ).length >= 5,
        )
        .sort((first, second) => first.localeCompare(second, "ar")),
    [moneyEligibleQuestions],
  );
  const moneyQuestionIds = useMemo(
    () =>
      moneyCategories.flatMap((moneyCategory) =>
        (moneyQuestionSelections[moneyCategory] || []).filter(Boolean),
      ),
    [moneyCategories, moneyQuestionSelections],
  );

  const chosenIds = useMemo(() => {
    if (gameMode === "money") return moneyQuestionIds;
    if (
      ![
        "quiz",
        "survival",
        "faction",
        "word",
        "image-reveal",
        "tarkeeba",
      ].includes(gameMode)
    )
      return [];
    return selectedIds;
  }, [gameMode, moneyQuestionIds, selectedIds]);
  const usesQuestions = [
    "quiz",
    "survival",
    "faction",
    "word",
    "image-reveal",
    "tarkeeba",
    "money",
  ].includes(gameMode);
  const visibleModes = isAdmin
    ? MODE_INFO
    : MODE_INFO.filter((mode) => gameModeVisibility[mode.id] !== false);
  const availableModes = [...visibleModes].sort((first, second) => {
    const firstFavorite = favoriteModes.includes(first.id) ? 1 : 0;
    const secondFavorite = favoriteModes.includes(second.id) ? 1 : 0;
    return secondFavorite - firstFavorite;
  });
  const helpModeInfo = MODE_INFO.find((mode) => mode.id === helpMode);
  const selectedModeInfo = MODE_INFO.find((mode) => mode.id === gameMode)!;

  const toggleFavoriteMode = async (mode: GameMode) => {
    if (!profile) return;
    const previous = favoriteModes;
    const next = previous.includes(mode)
      ? previous.filter((item) => item !== mode)
      : [...previous, mode];
    setFavoriteModes(next);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("انتهت جلسة الدخول.");
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${await user.getIdToken(true)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ favoriteGameModes: next }),
      });
      const payload = (await response.json()) as {
        favoriteGameModes?: GameMode[];
        error?: string;
      };
      if (!response.ok || !payload.favoriteGameModes)
        throw new Error(payload.error || "تعذر حفظ المفضلة.");
      setFavoriteModes(payload.favoriteGameModes);
    } catch {
      setFavoriteModes(previous);
      setError("تعذر حفظ اللعبة في المفضلة. حاول مرة أخرى.");
    }
  };

  const customCandidateQuestions = customCandidateIds.flatMap((id) => {
    const question = questions.find((item) => item.id === id);
    return question ? [question] : [];
  });

  const applyRandomSelection = () => {
    if (filteredQuestions.length === 0) {
      setError("لا توجد أسئلة تطابق الفلترة الحالية.");
      return;
    }
    const pool = [...filteredQuestions].sort(() => Math.random() - 0.5);
    setSelectedIds(
      pool
        .slice(0, Math.min(randomCount, pool.length))
        .map((question) => question.id),
    );
    setRandomSelectionApplied(true);
    setError("");
  };

  const generateCustomCandidates = () => {
    const pool = filteredQuestions.filter(
      (question) => !selectedIds.includes(question.id),
    );
    if (pool.length === 0) {
      setError(
        "لا توجد أسئلة جديدة تطابق الفلترة الحالية. غيّر الفلترة أو احذف سؤالاً من المجموعة.",
      );
      return;
    }
    const ids = [...pool]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(randomCount, pool.length))
      .map((question) => question.id);
    setCustomCandidateIds(ids);
    setCustomCandidateSelectedIds([]);
    setError("");
  };

  const commitCustomCandidates = () => {
    if (customCandidateSelectedIds.length === 0) {
      setError("اختر سؤالاً واحداً على الأقل من الاقتراحات قبل الاعتماد.");
      return;
    }
    setSelectedIds((ids) => [
      ...new Set([...ids, ...customCandidateSelectedIds]),
    ]);
    setCustomCandidateIds((ids) =>
      ids.filter((id) => !customCandidateSelectedIds.includes(id)),
    );
    setCustomCandidateSelectedIds([]);
    setError("");
  };

  const toggleMoneyCategory = (selectedCategory: string) => {
    setMoneyCategories((current) => {
      if (current.includes(selectedCategory)) {
        setMoneyQuestionSelections((selections) => {
          const next = { ...selections };
          delete next[selectedCategory];
          return next;
        });
        return current.filter((item) => item !== selectedCategory);
      }
      if (current.length >= 5) {
        setError("يمكن اختيار 5 تصنيفات فقط.");
        return current;
      }
      setMoneyQuestionSelections((selections) => ({
        ...selections,
        [selectedCategory]: selections[selectedCategory] || [
          "",
          "",
          "",
          "",
          "",
        ],
      }));
      setError("");
      return [...current, selectedCategory];
    });
  };

  const setMoneyQuestionAt = (
    selectedCategory: string,
    index: number,
    questionId: string,
  ) => {
    setMoneyQuestionSelections((current) => {
      const nextCategory = [
        ...(current[selectedCategory] || ["", "", "", "", ""]),
      ];
      nextCategory[index] = questionId;
      return { ...current, [selectedCategory]: nextCategory };
    });
  };

  // Move a question from one slot to another within the same category (reorder).
  const moveMoneyQuestion = (
    selectedCategory: string,
    fromIndex: number,
    toIndex: number,
  ) => {
    if (fromIndex === toIndex) return;
    setMoneyQuestionSelections((current) => {
      const list = [...(current[selectedCategory] || ["", "", "", "", ""])];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { ...current, [selectedCategory]: list };
    });
  };

  const fillMoneyCategory = (selectedCategory: string, random = false) => {
    const pool = moneyEligibleQuestions.filter(
      (question) => question.category === selectedCategory,
    );
    setMoneyQuestionSelections((current) => ({
      ...current,
      [selectedCategory]: pickMoneyQuestions(pool, random),
    }));
    setError("");
  };

  const fillAllMoneyCategories = (random = false) => {
    setMoneyQuestionSelections((current) => {
      const next = { ...current };
      moneyCategories.forEach((selectedCategory) => {
        next[selectedCategory] = pickMoneyQuestions(
          moneyEligibleQuestions.filter(
            (question) => question.category === selectedCategory,
          ),
          random,
        );
      });
      return next;
    });
    setError("");
  };

  const applyTop10BankQuestion = (
    question: Top10Question,
    mode: Exclude<Top10SelectionMode, "custom">,
  ) => {
    setTop10SelectionMode(mode);
    setTop10SelectedId(question.id);
    setTop10Prompt(question.prompt);
    setTop10Entries(
      question.items.map((item) => ({
        answer: item.answer,
        aliases: item.aliases.join("، "),
      })),
    );
    setError("");
  };

  const saveRoomCode = async () => {
    if (!/^\d{4}$/.test(roomCode)) {
      setError("رمز الغرفة يتكون من 4 أرقام.");
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setSavingRoomCode(true);
    setError("");
    try {
      const response = await fetch("/api/presenter/room-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken(true)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomCode }),
      });
      const data = (await response.json()) as {
        roomCode?: string;
        error?: string;
      };
      if (!response.ok || !data.roomCode)
        throw new Error(data.error || "تعذر حفظ رمز الغرفة.");
      setProfile((current) =>
        current ? { ...current, roomCode: data.roomCode } : current,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "تعذر حفظ الرمز.",
      );
    } finally {
      setSavingRoomCode(false);
    }
  };

  const createGame = async (openControl = true) => {
    if (!profile?.roomCode) {
      setError("احجز رمز الغرفة أولاً.");
      setStep(1);
      return;
    }
    if (!title.trim()) {
      setError("اكتب اسم التحدي.");
      setStep(1);
      return;
    }
    if (usesQuestions && chosenIds.length === 0) {
      setError("اختر سؤالاً واحداً على الأقل.");
      setStep(gameMode === "money" ? 3 : 2);
      return;
    }
    if (
      gameMode === "tarkeeba" &&
      chosenIds.some((id) => {
        const question = questions.find((item) => item.id === id);
        return (
          !question || getArabicWordLength(getTarkeebaAnswer(question)) !== 5
        );
      })
    ) {
      setError("لعبة تركيبة تقبل كلمات مكوّنة من 5 أحرف فقط.");
      setStep(2);
      return;
    }
    if (gameMode === "impostor" && !impostorWord.trim()) {
      setError("اكتب الكلمة السرية للعبة أمبوستر.");
      setStep(2);
      return;
    }
    if (
      gameMode === "baathra" &&
      !(baathraMode === "speed" ? baathraSecret.trim() : baathraLetters.trim())
    ) {
      setError("أدخل كلمة البعثرة أو الأحرف المتاحة.");
      setStep(2);
      return;
    }
    if (
      gameMode === "top10" &&
      (!top10Prompt.trim() ||
        top10Entries.some((entry) => !entry.answer.trim()) ||
        new Set(
          top10Entries.map((entry) =>
            entry.answer.trim().toLocaleLowerCase("ar"),
          ),
        ).size !== 10)
    ) {
      setError("اكتب السؤال الرئيسي و10 إجابات مختلفة للعبة TOP 10.");
      setStep(2);
      return;
    }
    if (gameMode === "money" && moneyCategories.length !== 5) {
      setError("اختر 5 فئات بالضبط للعبة فلوسك على المحك.");
      setStep(2);
      return;
    }
    if (
      gameMode === "money" &&
      (moneyQuestionIds.length !== 25 || new Set(moneyQuestionIds).size !== 25)
    ) {
      setError("اختر 5 أسئلة مختلفة لكل تصنيف — 25 سؤالاً بالمجموع.");
      setStep(3);
      return;
    }
    if (
      gameMode === "money" &&
      (moneyValues.some((value) => !Number.isFinite(value) || value <= 0) ||
        moneyValues.some(
          (value, index) => index > 0 && value <= moneyValues[index - 1],
        ))
    ) {
      setError("قيم المبالغ يجب أن تكون موجبة ومتزايدة من الأقل إلى الأعلى.");
      setStep(3);
      return;
    }
    setCreating(true);
    setError("");
    try {
      const id = await createSession({
        title: title.trim(),
        roomCode: profile.roomCode,
        timerDuration,
        createdBy: profile.uid,
        status: "waiting",
        currentQuestionId: null,
        questionStatus: "idle",
        showScoreboard: false,
        questionIds: chosenIds,
        gameMode,
        chairCount: 0,
        chairRound: 0,
        joiningLocked: false,
        isDraft: !openControl,
        ...(gameMode === "faction"
          ? { teamsEnabled: true, teamSize: 999 }
          : {}),
        ...(gameMode === "impostor"
          ? {
              impostorWord: impostorWord.trim(),
              impostorCategory: impostorCategory.trim(),
              impostorPhase: "waiting" as const,
              discussionDuration,
            }
          : {}),
        ...(gameMode === "roulette"
          ? { rouletteStatus: "idle" as const, roulettePrize: roulettePrizes }
          : {}),
        ...(gameMode === "word" ? { wordMaxAttempts } : {}),
        ...(gameMode === "image-reveal" ? { imageRevealGrid } : {}),
        ...(gameMode === "tarkeeba"
          ? {
              tarkeebaSecret: "",
              tarkeebaCategory: "جولات كلمات",
              tarkeebaHint: "",
              tarkeebaMaxAttempts: 6,
            }
          : {}),
        ...(gameMode === "baathra"
          ? {
              baathraMode,
              baathraSecret:
                baathraMode === "speed"
                  ? btoa(unescape(encodeURIComponent(baathraSecret.trim())))
                  : "",
              baathraLetters:
                baathraMode === "requests"
                  ? baathraLetters.replace(/[،,\s]+/g, "").split("")
                  : [],
              baathraCategory,
              baathraScoring,
            }
          : {}),
        ...(gameMode === "money"
          ? {
              moneyCategories,
              moneyTeams: [
                {
                  id: "red",
                  name: "الفريق الأحمر",
                  color: "#ef4444",
                  balance: 0,
                },
                {
                  id: "green",
                  name: "الفريق الأخضر",
                  color: "#22c55e",
                  balance: 0,
                },
              ],
              moneyBoard: moneyCategories.flatMap((moneyCategory) =>
                (moneyQuestionSelections[moneyCategory] || []).map(
                  (questionId, index) => ({
                    id: `${moneyCategory}-${index + 1}`,
                    questionId,
                    category: moneyCategory,
                    value: moneyValues[index],
                    status: "available" as const,
                  }),
                ),
              ),
              moneyScoring,
              moneyActiveTeamId: "red",
              moneyCurrentCellId: null,
            }
          : {}),
        ...(gameMode === "top10"
          ? {
              top10Prompt: top10Prompt.trim(),
              top10BankQuestionId:
                top10SelectionMode === "custom" ? null : top10SelectedId,
              top10SelectionMode,
              top10Items: top10Entries.map((entry, index) => ({
                id: `top10-${index + 1}`,
                answer: entry.answer.trim(),
                aliases: entry.aliases
                  .split(/[،,]/)
                  .map((alias) => alias.trim())
                  .filter(Boolean),
                points: index + 1,
                revealed: false,
              })),
            }
          : {}),
      });
      router.push(
        openControl ? `/dashboard/sessions?id=${id}` : "/dashboard/sessions",
      );
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "تعذر إنشاء التحدي.",
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading)
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري فتح مكتب الألعاب..." />
      </div>
    );

  return (
    <div className="anim-rise mx-auto max-w-5xl space-y-7">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-neon/25 bg-neon/10 px-4 py-1.5 text-xs font-bold text-neon-bright">
          <WandSparkles className="h-4 w-4" /> مكتب الألعاب
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-ink">
          أنشئ تحديك خطوة بخطوة
        </h1>
        <p className="mt-2 text-sm text-ink-mute">
          اختر اللعبة، جهّز محتواها، ثم ابدأ التحكم المباشر.
        </p>
      </div>
      <Card glow="subtle" className="p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="اسم التحدي" required>
            <Input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثال: تحدي مساء الجمعة"
            />
          </Field>
          <Field label="رمز الغرفة (4 أرقام)">
            <div className="flex gap-2" dir="ltr">
              <Input
                maxLength={4}
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.replace(/\D/g, ""))
                }
                className="w-28 text-center font-display font-bold tracking-[.25em]"
                placeholder="0000"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={saveRoomCode}
                disabled={savingRoomCode || !/^\d{4}$/.test(roomCode)}
              >
                {savingRoomCode
                  ? "..."
                  : profile?.roomCode === roomCode
                    ? "محفوظ"
                    : "حفظ"}
              </Button>
            </div>
          </Field>
        </div>
      </Card>
      {error && (
        <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">
          {error}
        </div>
      )}

      {helpModeInfo && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-void/85 p-4 pt-16 backdrop-blur-md sm:pt-20"
          onClick={() => setHelpMode(null)}
        >
          <Card
            strong
            className="w-full max-w-lg p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-12 w-12 place-items-center rounded-xl border",
                    helpModeInfo.tone,
                  )}
                >
                  <helpModeInfo.icon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-bold text-neon-bright">
                    شرح المسابقة
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold text-ink">
                    {helpModeInfo.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHelpMode(null)}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-mute hover:bg-white/5 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 whitespace-pre-wrap rounded-2xl border border-line bg-void/40 p-4 text-sm leading-8 text-ink-soft">
              {gameInstructions[helpModeInfo.id] || helpModeInfo.description}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={() => setHelpMode(null)}>فهمت</Button>
            </div>
          </Card>
        </div>
      )}

      {step === 1 && (
        <Card glow="neon" className="space-y-6 p-6">
          <CardHeader
            title="1. اختر نوع التحدي"
            icon={<Sparkles className="h-5 w-5" />}
          />
          {favoriteModes.length > 0 && (
            <p className="flex items-center gap-2 text-xs font-bold text-pink-400">
              <Heart className="h-4 w-4 fill-current" /> ألعابك المفضلة تظهر
              أولاً
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            {availableModes.map((mode) => {
              const Icon = mode.icon;
              return (
                <div
                  key={mode.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2 transition-all",
                    gameMode === mode.id
                      ? `${mode.tone} shadow-md`
                      : "border-line bg-void/30 text-ink-mute hover:border-white/25",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setGameMode(mode.id);
                      setQuestionTypeFilter("all");
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-right"
                  >
                    <span
                      className={cn(
                        "grid h-11 w-11 shrink-0 place-items-center rounded-xl border",
                        mode.tone,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <strong className="truncate text-sm text-ink">
                          {mode.title}
                        </strong>
                        {gameMode === mode.id && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-success-bright" />
                        )}
                      </span>
                      <span className="mt-1 block truncate text-[11px] leading-5 text-ink-mute">
                        {mode.description}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFavoriteMode(mode.id)}
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition",
                      favoriteModes.includes(mode.id)
                        ? "border-pink-400/50 bg-pink-500/15 text-pink-400"
                        : "border-line bg-void/40 text-ink-faint hover:border-pink-400/40 hover:text-pink-400",
                    )}
                    title={
                      favoriteModes.includes(mode.id)
                        ? `إزالة ${mode.title} من المفضلة`
                        : `إضافة ${mode.title} إلى المفضلة`
                    }
                    aria-label={
                      favoriteModes.includes(mode.id)
                        ? `إزالة ${mode.title} من المفضلة`
                        : `إضافة ${mode.title} إلى المفضلة`
                    }
                  >
                    <Heart
                      className={cn(
                        "h-4 w-4",
                        favoriteModes.includes(mode.id) && "fill-current",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpMode(mode.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-void/40 text-gold transition hover:border-gold/40 hover:bg-gold/10"
                    title={`شرح ${mode.title}`}
                    aria-label={`شرح ${mode.title}`}
                  >
                    <CircleAlert className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => {
                if (!title.trim()) {
                  setError("اكتب اسم التحدي.");
                  return;
                }
                if (!profile?.roomCode) {
                  setError("احجز رمز الغرفة أولاً.");
                  return;
                }
                setError("");
                setStep(2);
              }}
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-5 p-6">
          <CardHeader
            title={
              gameMode === "chairs"
                ? "2. إعداد جولات الكراسي"
                : gameMode === "impostor"
                  ? "2. إعداد الكلمة السرية"
                  : gameMode === "roulette"
                    ? "2. إعداد المكافآت"
                    : gameMode === "money"
                      ? "2. اختر خمسة تصنيفات"
                      : gameMode === "top10"
                        ? "2. جهّز قائمة TOP 10"
                        : "2. اختر أسئلة التحدي"
            }
            icon={
              gameMode === "chairs" ? (
                <Armchair className="h-5 w-5" />
              ) : (
                <Dices className="h-5 w-5" />
              )
            }
          />
          {gameMode === "chairs" ? (
            <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5">
              <Armchair className="h-9 w-9 text-gold" />
              <h3 className="mt-3 font-bold text-ink">
                عدد الكراسي يُحدّد تلقائياً
              </h3>
              <p className="mt-2 text-sm leading-7 text-ink-mute">
                عند بدء الجولة يحسب النظام عدد الحضور الفعليين ويضع كرسيين أقل
                منهم: 10 متسابقين = 8 كراسٍ. يعاد الحساب في كل جولة بحسب
                المتأهلين.
              </p>
            </div>
          ) : gameMode === "impostor" ? (
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="الكلمة السرية" required>
                <Input
                  value={impostorWord}
                  onChange={(event) => setImpostorWord(event.target.value)}
                  placeholder="مثال: تفاحة"
                />
              </Field>
              <Field label="التصنيف">
                <Input
                  value={impostorCategory}
                  onChange={(event) => setImpostorCategory(event.target.value)}
                  placeholder="مثال: فواكه"
                />
              </Field>
              <Field label="مدة النقاش">
                <Select
                  value={discussionDuration}
                  onChange={(event) =>
                    setDiscussionDuration(Number(event.target.value))
                  }
                >
                  <option value={60}>دقيقة</option>
                  <option value={90}>90 ثانية</option>
                  <option value={120}>دقيقتان</option>
                </Select>
              </Field>
            </div>
          ) : false ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="الكلمة السرية" required>
                <Input
                  value={tarkeebaWord}
                  onChange={(event) =>
                    setTarkeebaWord(event.target.value.replace(/\s/g, ""))
                  }
                  placeholder="مثال: زهور"
                />
              </Field>
              <Field label="الفئة">
                <Input
                  value={tarkeebaCategory}
                  onChange={(event) => setTarkeebaCategory(event.target.value)}
                  placeholder="مثال: نباتات"
                />
              </Field>
              <p className="md:col-span-2 text-xs leading-6 text-ink-mute">
                لدى كل متسابق 6 محاولات. النقاط من 6 في المحاولة الأولى إلى نقطة
                في السادسة.
              </p>
            </div>
          ) : gameMode === "baathra" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={baathraMode === "speed" ? "primary" : "ghost"}
                  onClick={() => setBaathraMode("speed")}
                >
                  الأسرع
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={baathraMode === "requests" ? "primary" : "ghost"}
                  onClick={() => setBaathraMode("requests")}
                >
                  كوّن اسماً
                </Button>
              </div>
              {baathraMode === "speed" ? (
                <>
                  <Field label="الكلمة الصحيحة">
                    <Input
                      value={baathraSecret}
                      onChange={(event) =>
                        setBaathraSecret(event.target.value.replace(/\s/g, ""))
                      }
                      placeholder="مثال: تفاح"
                    />
                  </Field>
                  <Field label="نظام النقاط">
                    <Select
                      value={baathraScoring}
                      onChange={(event) =>
                        setBaathraScoring(
                          event.target.value as "first" | "ranked",
                        )
                      }
                    >
                      <option value="first">الأسرع فقط</option>
                      <option value="ranked">3، 2، 1 حسب الترتيب</option>
                    </Select>
                  </Field>
                </>
              ) : (
                <>
                  <Field label="الأحرف المتاحة">
                    <Input
                      value={baathraLetters}
                      onChange={(event) =>
                        setBaathraLetters(event.target.value)
                      }
                      placeholder="مثال: س، ر، ب، ح، ا، د"
                    />
                  </Field>
                  <Field label="التصنيف المطلوب">
                    <Input
                      value={baathraCategory}
                      onChange={(event) =>
                        setBaathraCategory(event.target.value)
                      }
                      placeholder="مثال: اسم ولد"
                    />
                  </Field>
                </>
              )}
            </div>
          ) : gameMode === "top10" ? (
            <Top10BankPicker
              questions={
                gameQuestionRules.top10?.bankEnabled === false
                  ? []
                  : top10Questions
              }
              mode={top10SelectionMode}
              onModeChange={(mode) => {
                setTop10SelectionMode(mode);
                if (mode === "custom") setTop10SelectedId("");
              }}
              selectedId={top10SelectedId}
              onChooseQuestion={applyTop10BankQuestion}
              prompt={top10Prompt}
              onPromptChange={setTop10Prompt}
              entries={top10Entries}
              onEntriesChange={setTop10Entries}
            />
          ) : gameMode === "money" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-black text-gold">
                      اختر 5 تصنيفات بالضبط
                    </h3>
                    <p className="mt-2 text-xs leading-6 text-ink-mute">
                      لا يظهر هنا إلا التصنيف الذي يحتوي على 5 أسئلة صالحة على
                      الأقل. بعد الاختيار ستحدد خمسة أسئلة لكل تصنيف.
                    </p>
                  </div>
                  <span className="rounded-xl border border-gold/35 bg-gold/10 px-4 py-2 font-display text-xl font-black text-gold">
                    {moneyCategories.length} / 5
                  </span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {moneyAvailableCategories.map((item, index) => {
                  const selected = moneyCategories.includes(item);
                  const questionCount = moneyEligibleQuestions.filter(
                    (question) => question.category === item,
                  ).length;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleMoneyCategory(item)}
                      className={cn(
                        "anim-option-enter flex items-center justify-between rounded-2xl border p-4 text-right transition-all",
                        selected
                          ? "border-gold/60 bg-gold/15 text-gold shadow-[var(--shadow-gold)]"
                          : "border-line bg-void/35 text-ink hover:border-gold/35",
                      )}
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      <span>
                        <strong className="block text-sm">{item}</strong>
                        <span className="mt-1 block text-[10px] text-ink-mute">
                          {questionCount} سؤال متاح
                        </span>
                      </span>
                      <span
                        className={cn(
                          "grid h-8 w-8 place-items-center rounded-full border",
                          selected
                            ? "border-gold bg-gold text-void"
                            : "border-line text-ink-faint",
                        )}
                      >
                        {selected ? <Check className="h-4 w-4" /> : "+"}
                      </span>
                    </button>
                  );
                })}
              </div>
              {moneyAvailableCategories.length < 5 && (
                <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs font-bold text-danger-bright">
                  يلزم وجود خمسة تصنيفات على الأقل، وفي كل تصنيف 5 أسئلة نصية أو
                  مصورة.
                </p>
              )}
            </div>
          ) : gameMode === "roulette" ? (
            <Field label="الجوائز (افصل بينها بفاصلة)">
              <Input
                value={roulettePrizes}
                onChange={(event) => setRoulettePrizes(event.target.value)}
              />
            </Field>
          ) : (
            <>
              {gameMode === "tarkeeba" && (
                <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                  <p className="text-sm font-bold text-gold">جولات تركيبة</p>
                  <p className="mt-2 text-xs leading-6 text-ink-mute">
                    اختر عدة كلمات من البنك؛ كل كلمة تصبح جولة مستقلة، وتُجمع
                    نقاط المتسابقين عبر جميع الجولات. تظهر هنا الكلمات فقط ويمكن
                    فلترتها حسب الفئة والصعوبة.
                  </p>
                </div>
              )}
              {gameMode === "image-reveal" && (
                <div className="rounded-2xl border border-pink-400/25 bg-pink-500/5 p-4">
                  <p className="text-sm font-bold text-pink-400">
                    إعداد شبكة كشف الصورة
                  </p>
                  <div className="mt-3 max-w-xs">
                    <Field label="مستوى الصعوبة">
                      <Select
                        value={imageRevealGrid}
                        onChange={(event) =>
                          setImageRevealGrid(
                            Number(event.target.value) as 4 | 6 | 8,
                          )
                        }
                      >
                        <option value={4}>🟢 سهل — 4×4</option>
                        <option value={6}>🟡 متوسط — 6×6</option>
                        <option value={8}>🔴 صعب — 8×8</option>
                      </Select>
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-ink-mute">
                    يختفي مربع كل 3 ثوانٍ، وفي الصعب تختفي 3 مربعات في كل مرة.
                    تظهر هنا فقط أسئلة الصور ذات 4 خيارات.
                  </p>
                </div>
              )}
              {gameMode === "word" && (
                <div className="rounded-2xl border border-cyan/25 bg-cyan/5 p-4">
                  <p className="text-sm font-bold text-cyan">تخمين الأحرف</p>
                  <div className="mt-3 max-w-xs">
                    <Field label="عدد القلوب لكل متسابق">
                      <Select
                        value={wordMaxAttempts}
                        onChange={(event) =>
                          setWordMaxAttempts(Number(event.target.value))
                        }
                      >
                        <option value={5}>5 قلوب</option>
                        <option value={7}>7 قلوب</option>
                        <option value={10}>10 قلوب</option>
                      </Select>
                    </Field>
                  </div>
                  <p className="mt-2 text-xs text-ink-mute">
                    اختر كلمات من نوع «الكلمة المفقودة». كل متسابق يكشف الحروف
                    بشكل مستقل.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={pickMode === "manual" ? "primary" : "ghost"}
                  onClick={() => setPickMode("manual")}
                >
                  اختيار يدوي
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pickMode === "random" ? "primary" : "ghost"}
                  onClick={() => {
                    setPickMode("random");
                    setRandomSelectionApplied(false);
                  }}
                >
                  اختيار عشوائي
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={pickMode === "custom" ? "primary" : "ghost"}
                  onClick={() => setPickMode("custom")}
                >
                  مخصص
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3">
                <div>
                  <p className="text-xs font-extrabold text-success-bright">
                    الأسئلة المناسبة لـ «{selectedModeInfo.title}» فقط
                  </p>
                  <p className="mt-1 text-[10px] text-ink-mute">
                    تم إخفاء أنواع الأسئلة غير المتوافقة تلقائياً. المتاح
                    حالياً: {gameCompatibleQuestions.length} سؤال.
                  </p>
                </div>
                <span className="rounded-lg border border-success/30 bg-success/10 px-3 py-1 text-[10px] font-bold text-success-bright">
                  توافق اللعبة ✓
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث..."
                  icon={<Search className="h-4 w-4" />}
                />
                <Select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="all">كل التصنيفات</option>
                  {[
                    ...new Set(
                      gameCompatibleQuestions.map(
                        (question) => question.category,
                      ),
                    ),
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
                <Select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                >
                  <option value="all">كل الصعوبات</option>
                  <option value="easy">سهل</option>
                  <option value="medium">متوسط</option>
                  <option value="hard">صعب</option>
                </Select>
                <Select
                  value={questionTypeFilter}
                  onChange={(event) =>
                    setQuestionTypeFilter(event.target.value)
                  }
                >
                  <option value="all">كل أنواع الأسئلة</option>
                  <option value="text">سؤال نصي</option>
                  <option value="image">سؤال صورة</option>
                  <option value="word">كلمة / تخمين</option>
                </Select>
                {(pickMode === "random" || pickMode === "custom") && (
                  <Input
                    type="number"
                    min={1}
                    max={filteredQuestions.length || 1}
                    value={randomCount}
                    onChange={(event) =>
                      setRandomCount(
                        Math.max(1, Number(event.target.value) || 1),
                      )
                    }
                  />
                )}
              </div>
              {pickMode === "random" && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neon/25 bg-neon/5 p-3">
                  <p className="text-xs leading-6 text-ink-mute">
                    حدّد الفلترة والعدد، ثم نفّذ الاختيار. بعد ذلك راجع الأسئلة
                    واحذف ما لا تحتاجه.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyRandomSelection}
                  >
                    نفّذ الاختيار العشوائي
                  </Button>
                </div>
              )}
              {pickMode === "custom" && (
                <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">ابنِ مجموعتك بعناية</p>
                      <p className="mt-1 text-xs leading-6 text-ink-mute">
                        اعرض اقتراحات من هذه الفلترة، اختر منها ما تريد، ثم
                        اعتمدها في مجموعتك. غيّر الفلترة وكرر العملية حتى تكتمل
                        الجلسة.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={generateCustomCandidates}
                    >
                      عرض {randomCount} اقتراحات
                    </Button>
                  </div>
                  {customCandidateQuestions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-gold">
                          اختر من الاقتراحات:{" "}
                          {customCandidateSelectedIds.length}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          onClick={commitCustomCandidates}
                          disabled={customCandidateSelectedIds.length === 0}
                        >
                          اعتماد المختار وإضافته للمجموعة
                        </Button>
                      </div>
                      {customCandidateQuestions.map((question) => (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() =>
                            setCustomCandidateSelectedIds((ids) =>
                              ids.includes(question.id)
                                ? ids.filter((id) => id !== question.id)
                                : [...ids, question.id],
                            )
                          }
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right text-sm transition-all",
                            customCandidateSelectedIds.includes(question.id)
                              ? "border-gold/50 bg-gold/10"
                              : "border-line bg-void/40 hover:border-gold/30",
                          )}
                        >
                          <QuestionSelectionPreview
                            question={question}
                            gameTitle={selectedModeInfo.title}
                          />
                          {customCandidateSelectedIds.includes(question.id) && (
                            <Check className="h-4 w-4 shrink-0 text-gold" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs font-bold text-neon-bright">
                {pickMode === "manual"
                  ? `اخترت ${selectedIds.length} سؤال`
                  : pickMode === "custom"
                    ? `المجموعة المعتمدة: ${selectedIds.length} سؤال`
                    : randomSelectionApplied
                      ? `تم اختيار ${selectedIds.length} سؤال — يمكنك حذف أي سؤال أدناه.`
                      : `سيُختار ${randomCount} سؤال عند الضغط على «نفّذ الاختيار العشوائي».`}
              </p>
              {pickMode === "random" && randomSelectionApplied && (
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-neon/30 bg-neon/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">
                      الأسئلة المختارة
                    </p>
                    <span className="text-xs font-bold text-neon-bright">
                      {selectedIds.length} سؤال
                    </span>
                  </div>
                  {selectedIds.length === 0 ? (
                    <p className="py-6 text-center text-xs text-ink-mute">
                      حُذفت جميع الأسئلة. نفّذ اختياراً جديداً أو أضف يدوياً.
                    </p>
                  ) : (
                    selectedIds.map((id, index) => {
                      const question = questions.find((item) => item.id === id);
                      return question ? (
                        <div
                          key={id}
                          className="flex items-center gap-3 rounded-xl border border-line bg-void/40 p-3"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neon/15 text-[10px] font-bold text-neon-bright">
                            {index + 1}
                          </span>
                          <QuestionSelectionPreview
                            question={question}
                            gameTitle={selectedModeInfo.title}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIds((ids) =>
                                ids.filter((item) => item !== id),
                              )
                            }
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-danger/15 hover:text-danger-bright"
                            aria-label="حذف السؤال"
                            title="حذف السؤال"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null;
                    })
                  )}
                </div>
              )}
              {pickMode === "custom" && (
                <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-gold/30 bg-gold/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">
                      مجموعتك المعتمدة
                    </p>
                    <span className="text-xs font-bold text-gold">
                      {selectedIds.length} سؤال
                    </span>
                  </div>
                  {selectedIds.length === 0 ? (
                    <p className="py-6 text-center text-xs leading-6 text-ink-mute">
                      لا توجد أسئلة معتمدة بعد. اعرض اقتراحات، اختر ما يناسبك،
                      ثم اضغط «اعتماد المختار».
                    </p>
                  ) : (
                    selectedIds.map((id, index) => {
                      const question = questions.find((item) => item.id === id);
                      return question ? (
                        <div
                          key={id}
                          className="flex items-center gap-3 rounded-xl border border-line bg-void/40 p-3"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">
                            {index + 1}
                          </span>
                          <QuestionSelectionPreview
                            question={question}
                            gameTitle={selectedModeInfo.title}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedIds((ids) =>
                                ids.filter((item) => item !== id),
                              )
                            }
                            className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-danger/15 hover:text-danger-bright"
                            aria-label="حذف السؤال من المجموعة"
                            title="حذف السؤال من المجموعة"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : null;
                    })
                  )}
                </div>
              )}
              {pickMode === "manual" && (
                <div className="max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-line p-3">
                  {filteredQuestions.map((question) => (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() =>
                        setSelectedIds((ids) =>
                          ids.includes(question.id)
                            ? ids.filter((id) => id !== question.id)
                            : [...ids, question.id],
                        )
                      }
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right text-sm transition-all",
                        selectedIds.includes(question.id)
                          ? "border-neon/40 bg-neon/10"
                          : "border-line bg-void/30",
                      )}
                    >
                      <QuestionSelectionPreview
                        question={question}
                        gameTitle={selectedModeInfo.title}
                      />
                      {selectedIds.includes(question.id) && (
                        <Check className="h-4 w-4 shrink-0 text-neon-bright" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <Button
              onClick={() => {
                if (gameMode === "top10") {
                  if (
                    !top10Prompt.trim() ||
                    top10Entries.some((entry) => !entry.answer.trim()) ||
                    new Set(
                      top10Entries.map((entry) =>
                        entry.answer.trim().toLocaleLowerCase("ar"),
                      ),
                    ).size !== 10
                  ) {
                    setError("اكتب السؤال الرئيسي و10 إجابات مختلفة.");
                    return;
                  }
                  setError("");
                  setStep(3);
                  return;
                }
                if (gameMode === "money") {
                  if (moneyCategories.length !== 5) {
                    setError("اختر 5 تصنيفات بالضبط قبل المتابعة.");
                    return;
                  }
                  setError("");
                  setStep(3);
                  return;
                }
                if (usesQuestions && chosenIds.length === 0) {
                  setError("اختر سؤالاً واحداً على الأقل.");
                  return;
                }
                if (
                  gameMode === "tarkeeba" &&
                  chosenIds.some((id) => {
                    const question = questions.find((item) => item.id === id);
                    return (
                      !question ||
                      getArabicWordLength(getTarkeebaAnswer(question)) !== 5
                    );
                  })
                ) {
                  setError("اختر كلمات مكوّنة من 5 أحرف فقط.");
                  return;
                }
                if (gameMode === "impostor" && !impostorWord.trim()) {
                  setError("اكتب الكلمة السرية.");
                  return;
                }
                setError("");
                setStep(3);
              }}
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && gameMode === "money" && (
        <Card className="space-y-6 p-6">
          <CardHeader
            title="3. اختر خمسة أسئلة لكل تصنيف"
            icon={<Sparkles className="h-5 w-5" />}
          />
          <div className="rounded-2xl border border-cyan/25 bg-cyan/5 p-4">
            <p className="font-bold text-cyan">لوحة 5 × 5</p>
            <p className="mt-2 text-xs leading-6 text-ink-mute">
              عيّن سؤالاً مختلفاً لكل مبلغ. القيم موحّدة على جميع التصنيفات ويجب
              أن تكون متزايدة.
            </p>
            <div className="mt-4 grid grid-cols-5 gap-2" dir="ltr">
              {moneyValues.map((value, index) => (
                <Input
                  key={index}
                  type="number"
                  min={1}
                  value={value}
                  onChange={(event) =>
                    setMoneyValues((current) =>
                      current.map((item, valueIndex) =>
                        valueIndex === index
                          ? Math.max(1, Number(event.target.value) || 1)
                          : item,
                      ),
                    )
                  }
                  className="text-center font-display font-black text-gold"
                />
              ))}
            </div>
          </div>
          <Field label="طريقة اعتماد الإجابات">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMoneyScoring("ranked")}
                className={cn(
                  "anim-option-enter group flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-right transition-all duration-300 hover:scale-[1.02]",
                  moneyScoring === "ranked"
                    ? "border-gold/60 bg-gold/15 text-gold shadow-[var(--shadow-gold)]"
                    : "border-gold/20 bg-gold/5 text-ink-mute hover:border-gold/40 hover:bg-gold/10 hover:text-gold",
                )}
              >
                <span className="text-sm font-bold">حسب ترتيب السرعة</span>
                <span className="text-[11px] opacity-80">
                  كل إجابة صحيحة تربح المبلغ
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMoneyScoring("fastest")}
                className={cn(
                  "anim-option-enter group flex cursor-pointer flex-col gap-1 rounded-xl border p-4 text-right transition-all duration-300 hover:scale-[1.02]",
                  moneyScoring === "fastest"
                    ? "border-cyan/60 bg-cyan/15 text-cyan shadow-[var(--shadow-cyan)]"
                    : "border-cyan/20 bg-cyan/5 text-ink-mute hover:border-cyan/40 hover:bg-cyan/10 hover:text-cyan",
                )}
              >
                <span className="text-sm font-bold">الأسرع فقط</span>
                <span className="text-[11px] opacity-80">
                  أول إجابة صحيحة تربح المبلغ
                </span>
              </button>
            </div>
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neon/25 bg-neon/5 p-4">
            <p className="text-xs leading-6 text-ink-mute">
              التعبئة التلقائية توزّع الأسئلة من السهل إلى الصعب. والعشوائية
              تختار مجموعة جديدة ثم ترتبها حسب الصعوبة.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="success"
                onClick={() => fillAllMoneyCategories(false)}
              >
                تعبئة تلقائية
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fillAllMoneyCategories(true)}
              >
                <Shuffle className="h-4 w-4" /> اختيار عشوائي
              </Button>
            </div>
          </div>
          <div className="space-y-5">
            {moneyCategories.map((moneyCategory, categoryIndex) => {
              const categoryQuestions = moneyEligibleQuestions
                .filter((question) => question.category === moneyCategory)
                .sort(
                  (first, second) =>
                    MONEY_DIFFICULTY_RANK[first.difficulty] -
                    MONEY_DIFFICULTY_RANK[second.difficulty],
                );
              const selections = moneyQuestionSelections[moneyCategory] || [
                "",
                "",
                "",
                "",
                "",
              ];
              return (
                <section
                  key={moneyCategory}
                  className="anim-option-enter rounded-2xl border border-line bg-void/30 p-4"
                  style={{ animationDelay: `${categoryIndex * 60}ms` }}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-black text-ink">{moneyCategory}</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="success"
                        onClick={() => fillMoneyCategory(moneyCategory, false)}
                      >
                        تعبئة تلقائية
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => fillMoneyCategory(moneyCategory, true)}
                      >
                        عشوائي
                      </Button>
                      <span className="text-xs font-bold text-gold">
                        {selections.filter(Boolean).length} / 5
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-3">
                    {moneyValues.map((value, index) => {
                      const selectedElsewhere = new Set(
                        selections.filter(
                          (questionId, selectionIndex) =>
                            selectionIndex !== index && questionId,
                        ),
                      );
                      const selectedQuestion = categoryQuestions.find(
                        (question) => question.id === selections[index],
                      );
                      return (
                        <div
                          key={`${moneyCategory}-${index}`}
                          className="anim-option-enter grid items-center gap-2 rounded-xl border border-line bg-void/30 p-2 transition-all duration-300 hover:border-neon/30 sm:grid-cols-[100px_64px_1fr_auto]"
                        >
                          <span className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-3 text-center font-display font-black text-gold">
                            {value}
                          </span>
                          {selectedQuestion?.imageUrl ? (
                            <img
                              src={selectedQuestion.imageUrl}
                              alt="صورة مصغرة للسؤال"
                              className="h-14 w-16 rounded-lg border border-line bg-white object-contain"
                            />
                          ) : (
                            <span className="grid h-14 w-16 place-items-center rounded-lg border border-line bg-void/45 text-xl">
                              ❔
                            </span>
                          )}
                          <Select
                            value={selections[index] || ""}
                            onChange={(event) =>
                              setMoneyQuestionAt(
                                moneyCategory,
                                index,
                                event.target.value,
                              )
                            }
                          >
                            <option value="">اختر سؤال هذا المبلغ...</option>
                            {categoryQuestions.map((question) => (
                              <option
                                key={question.id}
                                value={question.id}
                                disabled={selectedElsewhere.has(question.id)}
                              >
                                {question.questionType === "image" ? "🖼️ " : ""}
                                {question.questionText} —{" "}
                                {question.difficulty === "easy"
                                  ? "سهل"
                                  : question.difficulty === "medium"
                                    ? "متوسط"
                                    : "صعب"}
                              </option>
                            ))}
                          </Select>
                          {/* Reorder arrows */}
                          <div className="flex gap-1 sm:flex-col">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveMoneyQuestion(moneyCategory, index, index - 1)}
                              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-neon/30 bg-neon/10 text-neon-bright transition-all hover:bg-neon/25 hover:shadow-[var(--shadow-neon)] disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="تحريك لأعلى"
                              title="تحريك لأعلى"
                            >
                              <ChevronRight className="h-4 w-4 rotate-[-90deg]" />
                            </button>
                            <button
                              type="button"
                              disabled={index === moneyValues.length - 1}
                              onClick={() => moveMoneyQuestion(moneyCategory, index, index + 1)}
                              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-neon/30 bg-neon/10 text-neon-bright transition-all hover:bg-neon/25 hover:shadow-[var(--shadow-neon)] disabled:opacity-20 disabled:cursor-not-allowed"
                              aria-label="تحريك لأسفل"
                              title="تحريك لأسفل"
                            >
                              <ChevronRight className="h-4 w-4 rotate-90" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <Button
              onClick={() => {
                if (
                  moneyQuestionIds.length !== 25 ||
                  new Set(moneyQuestionIds).size !== 25
                ) {
                  setError("أكمل اختيار 5 أسئلة مختلفة لكل تصنيف.");
                  return;
                }
                if (
                  moneyValues.some(
                    (value, index) =>
                      value <= 0 ||
                      (index > 0 && value <= moneyValues[index - 1]),
                  )
                ) {
                  setError("اجعل المبالغ موجبة ومتزايدة من الأقل إلى الأعلى.");
                  return;
                }
                setError("");
                setStep(4);
              }}
            >
              التالي <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === (gameMode === "money" ? 4 : 3) && (
        <Card className="space-y-6 p-6">
          <CardHeader
            title={`${gameMode === "money" ? 4 : 3}. الوقت والمراجعة`}
            icon={<Timer className="h-5 w-5" />}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="مدة كل جولة">
              <div className="space-y-3">
                <Select
                  value={timerChoice}
                  onChange={(event) => {
                    const choice = event.target.value;
                    setTimerChoice(choice);
                    if (choice !== "custom") setTimerDuration(Number(choice));
                  }}
                >
                  <option value="15">15 ثانية — سريع</option>
                  <option value="20">20 ثانية</option>
                  <option value="30">30 ثانية</option>
                  <option value="45">45 ثانية</option>
                  <option value="60">دقيقة</option>
                  <option value="90">دقيقة ونصف</option>
                  <option value="120">دقيقتان</option>
                  <option value="180">3 دقائق</option>
                  <option value="custom">مخصص — أدخل عدد الثواني</option>
                </Select>
                {timerChoice === "custom" && (
                  <Input
                    type="number"
                    min={5}
                    max={600}
                    value={timerDuration}
                    onChange={(event) =>
                      setTimerDuration(
                        Math.min(
                          600,
                          Math.max(5, Number(event.target.value) || 5),
                        ),
                      )
                    }
                    placeholder="اكتب عدد الثواني"
                  />
                )}
              </div>
            </Field>
            <div className="rounded-xl border border-line bg-void/30 p-4 text-sm">
              <p className="font-bold text-ink">{title}</p>
              <p className="mt-2 text-xs text-ink-mute">
                {gameMode === "chairs"
                  ? "لعبة الكراسي • العدد يُحسب تلقائياً عند البدء"
                  : gameMode === "money"
                    ? `فلوسك على المحك • 5 تصنيفات • ${chosenIds.length} سؤال`
                    : gameMode === "top10"
                      ? "TOP 10 • سؤال رئيسي • 10 بطاقات مخفية"
                      : `تحدي أسئلة • ${chosenIds.length} سؤال`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setStep(gameMode === "money" ? 3 : 2)}
            >
              <ChevronRight className="h-4 w-4" /> السابق
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void createGame(false)}
                disabled={creating}
              >
                {creating ? "جاري الحفظ..." : "حفظ كمسودة"}
              </Button>
              <Button
                variant="success"
                onClick={() => void createGame(true)}
                disabled={creating}
              >
                {creating ? "جاري الإنشاء..." : "إنشاء وفتح التحكم"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
