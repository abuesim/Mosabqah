"use client";

import { useEffect, useState, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  getSessions,
  getQuestions,
  getTop10Questions,
  createSession,
  updateSession,
  activateSessionExclusively,
  deleteSession,
  addQuestion,
  getSessionById,
  getSessionQuestions,
  getPlayers,
  getAnswerCount,
  getAnswersForQuestion,
  archiveWinner,
  incrementCumulativeScore,
  updatePlayer,
  deletePlayer,
  subscribeSession,
  subscribeSessionPlayers,
  subscribeAnswerCount,
  subscribeQuestionAnswers,
} from "@/lib/db";
import type {
  Session,
  Question,
  Player,
  UserProfile,
  Answer,
  Top10Question,
} from "@/lib/db";
import { cn } from "@/lib/utils";
import { TEAM_OPTIONS, getTeam, getTeamFromColor } from "@/lib/teams";
import {
  Layers,
  Plus,
  Play,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Users,
  Radio,
  Flame,
  Sparkles,
  Search,
  GripVertical,
  X,
  Wifi,
  WifiOff,
  TriangleAlert,
  Armchair,
  QrCode,
  Copy,
  Share2,
  Clock,
  Scissors,
  PlusCircle,
  Shuffle,
  CheckCircle2,
  Hourglass,
  Trash2,
  KeyRound,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import StatusDot from "@/components/ui/StatusDot";
import DifficultyBadge from "@/components/ui/DifficultyBadge";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Spinner from "@/components/ui/Spinner";
import Top10BankPicker, {
  type Top10SelectionMode,
} from "@/components/game/Top10BankPicker";
import type { Unsubscribe } from "firebase/firestore";

import { Suspense } from "react";
import baathraNameRounds from "@/data/baathra-name-rounds.json";

function decodeWordSecret(value?: string) {
  if (!value) return "";
  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

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

function pickMoneySessionQuestions(pool: Question[], random = false) {
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

const SESSION_CATEGORIES = [
  { value: "all", label: "كل التصنيفات" },
  { value: "عامة", label: "عامة" },
  { value: "إسلامية", label: "إسلامية" },
  { value: "ألغاز", label: "ألغاز" },
  { value: "علوم", label: "علوم" },
  { value: "عائلية", label: "عائلية" },
  { value: "تاريخ", label: "تاريخ" },
  { value: "جغرافيا", label: "جغرافيا" },
  { value: "رياضة", label: "رياضة" },
];

const QUICK_HINTS = [
  "🧐 ركزوا في الكلمة الأخيرة!",
  "🎯 لا يخدعكم طول السؤال!",
  "🧘‍♂️ العبوها بهدوء وتركيز عالي!",
  "🪤 الخيار الأول مجرد فخ!",
  "✂️ استبعدوا الإجابات المستحيلة فوراً!",
  "⚖️ اختاروا الأقرب للمنطق دائماً!",
  "⚡️ اعتمدوا على حدسكم الأول!",
  "⏳ الوقت ينفد.. قرر الآن!",
  "👻 ترا الأغلبية مجاوبين غلط!",
  "📈 الرقم أكبر مما تتوقعون!",
];

const MANUAL_SESSION_STATUSES = [
  { value: "draft", label: "مسودة" },
  { value: "ready", label: "جاهزة للبدء" },
  { value: "waiting", label: "بانتظار المتسابقين" },
  { value: "active", label: "مباشرة الآن" },
  { value: "paused", label: "متوقفة مؤقتاً" },
  { value: "scheduled", label: "مجدولة" },
  { value: "finished", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "archived", label: "مؤرشفة" },
] as const;
type ManualSessionStatus = (typeof MANUAL_SESSION_STATUSES)[number]["value"];
type GameQuestionRule = {
  categories?: string[];
  questionTypes?: Array<"text" | "image" | "word">;
};

const GAME_MODE_LABELS: Record<
  NonNullable<Session["gameMode"]>,
  { label: string; icon: string }
> = {
  quiz: { label: "تحدي الأسئلة", icon: "❓" },
  chairs: { label: "لعبة الكراسي", icon: "🪑" },
  survival: { label: "لعبة الإقصاءات", icon: "🛡️" },
  faction: { label: "حرب الفرق", icon: "⚔️" },
  impostor: { label: "أمبوستر", icon: "🕵️" },
  roulette: { label: "عجلة الحظ", icon: "🎁" },
  word: { label: "الكلمة المفقودة", icon: "🧩" },
  "image-reveal": { label: "تخمين الصور / كشف الستار", icon: "🖼️" },
  tarkeeba: { label: "تركيبة", icon: "🔤" },
  baathra: { label: "بعثرة", icon: "🔀" },
  money: { label: "فلوسك على المحك", icon: "💸" },
  top10: { label: "TOP 10", icon: "🔟" },
};

const getGameModeLabel = (mode?: Session["gameMode"]) =>
  GAME_MODE_LABELS[mode || "quiz"] || GAME_MODE_LABELS.quiz;

const toSuperscript = (value: number) =>
  String(value).replace(/\d/g, (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)]);

function normalizeSessionCategory(category: string) {
  const value = category.trim().toLowerCase();
  const categories: Record<string, string> = {
    general: "عامة",
    عام: "عامة",
    عامة: "عامة",
    islamic: "إسلامية",
    إسلامي: "إسلامية",
    إسلامية: "إسلامية",
    riddles: "ألغاز",
    لغز: "ألغاز",
    ألغاز: "ألغاز",
    science: "علوم",
    علم: "علوم",
    علوم: "علوم",
    family: "عائلية",
    عائلة: "عائلية",
    عائلية: "عائلية",
    history: "تاريخ",
    التاريخ: "تاريخ",
    تاريخ: "تاريخ",
    geography: "جغرافيا",
    الجغرافيا: "جغرافيا",
    جغرافيا: "جغرافيا",
    sports: "رياضة",
    الرياضة: "رياضة",
    رياضة: "رياضة",
  };
  return categories[value] || category;
}

type ConnectionState = "online" | "unstable" | "offline";

function getTimestampMillis(value: unknown): number {
  const timestamp = value as
    { toMillis?: () => number; seconds?: number } | undefined;
  if (timestamp?.toMillis) return timestamp.toMillis();
  return (timestamp?.seconds || 0) * 1000;
}

function getPlayerConnection(
  player: Player,
  now: number,
): { state: ConnectionState; label: string } {
  const lastSeen = getTimestampMillis(player.lastSeenAt || player.createdAt);
  const age = lastSeen ? now - lastSeen : Number.POSITIVE_INFINITY;
  if (age <= 35_000) return { state: "online", label: "متصل" };
  if (age <= 75_000) return { state: "unstable", label: "اتصال ضعيف" };
  return { state: "offline", label: "غير متصل" };
}

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get("id");

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [gameQuestionRules, setGameQuestionRules] = useState<
    Record<string, GameQuestionRule>
  >({});

  // New Session Form
  const [title, setTitle] = useState("");
  const [presenterRoomCode, setPresenterRoomCode] = useState("");
  const [savingRoomCode, setSavingRoomCode] = useState(false);
  const [timerDuration, setTimerDuration] = useState(30);
  const [gameMode, setGameMode] = useState<"quiz" | "chairs">("quiz");
  const [chairCount, setChairCount] = useState(5);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryDifficulty, setLibraryDifficulty] = useState("all");
  const [libraryCategory, setLibraryCategory] = useState("all");
  const [isQuestionDropActive, setIsQuestionDropActive] = useState(false);
  const [endingGame, setEndingGame] = useState(false);
  const [activatingExclusive, setActivatingExclusive] = useState(false);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  const [teamSize, setTeamSize] = useState(10);
  const [savingTeams, setSavingTeams] = useState(false);
  const [rouletteWinnerId, setRouletteWinnerId] = useState("");
  const [showJoinQr, setShowJoinQr] = useState(false);
  const [showRecoveryQr, setShowRecoveryQr] = useState(false);
  const [showTvQr, setShowTvQr] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<
    "control" | "questions" | "players" | "settings"
  >("control");
  const [editSessionTitle, setEditSessionTitle] = useState("");
  const [editSessionTimer, setEditSessionTimer] = useState(30);
  const [editQuestionSearch, setEditQuestionSearch] = useState("");
  const [editQuestionCategory, setEditQuestionCategory] = useState("all");
  const [editQuestionDifficulty, setEditQuestionDifficulty] = useState("all");
  const [moneyEditCategories, setMoneyEditCategories] = useState<string[]>([]);
  const [moneyEditSelections, setMoneyEditSelections] = useState<
    Record<string, string[]>
  >({});
  const [moneyEditValues, setMoneyEditValues] = useState([
    400, 800, 1200, 1600, 2000,
  ]);
  const [moneyEditScoring, setMoneyEditScoring] = useState<
    "fastest" | "ranked"
  >("ranked");
  const [savingMoneyBoard, setSavingMoneyBoard] = useState(false);
  const [top10Questions, setTop10Questions] = useState<Top10Question[]>([]);
  const [top10EditMode, setTop10EditMode] =
    useState<Top10SelectionMode>("selected");
  const [top10EditSelectedId, setTop10EditSelectedId] = useState("");
  const [top10EditPrompt, setTop10EditPrompt] = useState("");
  const [top10EditEntries, setTop10EditEntries] = useState(
    Array.from({ length: 10 }, () => ({ answer: "", aliases: "" })),
  );
  const [savingTop10, setSavingTop10] = useState(false);
  const [showRoundResults, setShowRoundResults] = useState(false);
  const [showUsedQuestions, setShowUsedQuestions] = useState(false);
  const [showEmergencyQuestion, setShowEmergencyQuestion] = useState(false);
  const [emergencyQuestion, setEmergencyQuestion] = useState({
    text: "",
    option1: "",
    option2: "",
    option3: "",
    option4: "",
    correctOption: 1,
    category: "عامة",
    difficulty: "medium" as "easy" | "medium" | "hard",
    permanent: false,
  });

  // Active Session Control State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);
  const [questionAnswers, setQuestionAnswers] = useState<Answer[]>([]);

  // Presenter controls
  const [hintInput, setHintInput] = useState("");
  const [tvBgColorInput, setTvBgColorInput] = useState("#090514");
  const [tvLogoTextInput, setTvLogoTextInput] = useState("مسابقة عصومي");
  const [tvShowQuestionsInput, setTvShowQuestionsInput] = useState(true);
  const [baathraControlWord, setBaathraControlWord] = useState("");
  const [baathraControlMode, setBaathraControlMode] = useState<
    "speed" | "requests"
  >("speed");
  const [baathraControlLetters, setBaathraControlLetters] = useState<string[]>(
    [],
  );
  const [baathraNameRoundId, setBaathraNameRoundId] = useState(0);
  const [baathraControlRequests, setBaathraControlRequests] = useState([
    "اسم الولد",
    "اسم البنت",
    "دولة أو مدينة",
    "حيوان",
    "نبات",
    "جماد",
  ]);
  const [baathraActiveRequestIndexes, setBaathraActiveRequestIndexes] =
    useState<number[]>([0]);
  const [tvFontSizeInput, setTvFontSizeInput] = useState<
    "sm" | "md" | "lg" | "xl"
  >("lg");
  const [tvChromaInput, setTvChromaInput] = useState<
    "normal" | "chroma" | "transparent"
  >("normal");

  // Initial load (profile + question bank + own sessions)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        window.location.href = "/auth";
        return;
      }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) {
          setProfile(userProfile);
          setPresenterRoomCode(userProfile.roomCode || "");
        }

        const [qData, top10Data, mySessions, rulesResponse] = await Promise.all(
          [
            getQuestions(),
            getTop10Questions(),
            getSessions(user.uid),
            fetch("/api/game-modes"),
          ],
        );
        if (rulesResponse.ok) {
          const payload = (await rulesResponse.json()) as {
            questionRules?: Record<string, GameQuestionRule>;
          };
          setGameQuestionRules(payload.questionRules || {});
        }
        setQuestions(
          qData.filter(
            (question) =>
              !question.temporarySessionId &&
              (question.visibility !== "presenter-private" ||
                userProfile?.role === "admin" ||
                question.createdBy === user.uid),
          ),
        );
        setTop10Questions(top10Data);
        setSessions(mySessions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeSession?.startedAt || activeSession.status === "finished")
      return;
    const ticker = setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [activeSession?.startedAt, activeSession?.status]);

  useEffect(() => {
    if (!activeSession) return;
    setEditSessionTitle(activeSession.title);
    setEditSessionTimer(activeSession.timerDuration || 30);
    if (activeSession.gameMode === "money") {
      const categories = activeSession.moneyCategories || [
        ...new Set(
          (activeSession.moneyBoard || []).map((cell) => cell.category),
        ),
      ];
      setMoneyEditCategories(categories);
      setMoneyEditSelections(
        Object.fromEntries(
          categories.map((moneyCategory) => [
            moneyCategory,
            (activeSession.moneyBoard || [])
              .filter((cell) => cell.category === moneyCategory)
              .sort((first, second) => first.value - second.value)
              .map((cell) => cell.questionId),
          ]),
        ),
      );
      const firstCategoryValues = (activeSession.moneyBoard || [])
        .filter((cell) => cell.category === categories[0])
        .sort((first, second) => first.value - second.value)
        .map((cell) => cell.value);
      if (firstCategoryValues.length === 5)
        setMoneyEditValues(firstCategoryValues);
      setMoneyEditScoring(activeSession.moneyScoring || "ranked");
    }
    if (activeSession.gameMode === "top10") {
      setTop10EditMode(activeSession.top10SelectionMode || "custom");
      setTop10EditSelectedId(activeSession.top10BankQuestionId || "");
      setTop10EditPrompt(activeSession.top10Prompt || "");
      setTop10EditEntries(
        (activeSession.top10Items || []).map((item) => ({
          answer: item.answer,
          aliases: (item.aliases || []).join("، "),
        })),
      );
    }
    // Only reset the edit form when opening another session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  useEffect(() => {
    if (
      activeSession?.questionStatus !== "revealed" ||
      !activeSession.currentQuestionId
    )
      return;
    setShowRoundResults(true);
    const revealedQuestionId = activeSession.currentQuestionId;
    const timeout = setTimeout(async () => {
      setShowRoundResults(false);
      // Return contestants to the motivational waiting screen after results.
      // Re-read first so a presenter launching the next question is never overwritten.
      const latest = await getSessionById(activeSession.id);
      if (
        latest?.questionStatus === "revealed" &&
        latest.currentQuestionId === revealedQuestionId
      ) {
        await updateSession(activeSession.id, {
          questionStatus: "idle",
          currentQuestionId: null,
          ...(latest.gameMode === "money" ? { moneyCurrentCellId: null } : {}),
        });
      }
    }, 10_000);
    return () => clearTimeout(timeout);
  }, [
    activeSession?.id,
    activeSession?.questionStatus,
    activeSession?.currentQuestionId,
  ]);

  useEffect(() => {
    const ticker = setInterval(() => setPresenceNow(Date.now()), 1_000);
    return () => clearInterval(ticker);
  }, []);

  // Active session loader + realtime subscriptions
  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      setQuestionAnswers([]);
      return;
    }

    let unsubs: Unsubscribe[] = [];

    async function loadActiveSession() {
      if (!activeSessionId) return;
      const session = await getSessionById(activeSessionId);
      if (!session) return;
      setActiveSession(session);
      if ((session as any).tvBgColor)
        setTvBgColorInput((session as any).tvBgColor);
      if ((session as any).tvLogoText)
        setTvLogoTextInput((session as any).tvLogoText);
      if ((session as any).tvFontSize)
        setTvFontSizeInput((session as any).tvFontSize);
      setTvShowQuestionsInput(session.tvShowQuestions !== false);
      if ((session as any).overlayMode)
        setTvChromaInput((session as any).overlayMode);
      if (session.teamSize) setTeamSize(session.teamSize);

      // Load session's questions
      if (session.questionIds?.length) {
        const qList = await getSessionQuestions(session.questionIds);
        setActiveQuestions(qList);
        if (session.currentQuestionId) {
          setCurrentQuestion(
            qList.find((q) => q.id === session.currentQuestionId) || null,
          );
        }
      }

      // Load players
      const playerData = await getPlayers(activeSessionId);
      setPlayers(playerData);

      // Load answer count for current question
      if (session.currentQuestionId) {
        const count = await getAnswerCount(
          activeSessionId,
          session.currentQuestionId,
        );
        setAnswersCount(count);
      }
    }

    loadActiveSession();

    // 1. Subscribe to session doc changes (replaces session-info-changes)
    unsubs.push(
      subscribeSession(activeSessionId, async (sess) => {
        if (!sess) return;
        setActiveSession(sess);
        if (sess.currentQuestionId && sess.gameMode !== "top10") {
          // fetch the current question doc if we don't have it locally
          setCurrentQuestion((prev) => {
            if (prev?.id === sess.currentQuestionId) return prev;
            // lazy load
            getSessionQuestions([sess.currentQuestionId!]).then((list) => {
              if (list[0]) setCurrentQuestion(list[0]);
            });
            return prev;
          });
        } else {
          setCurrentQuestion(null);
        }
      }),
    );

    // 2. Subscribe to players list (replaces players-changes)
    unsubs.push(
      subscribeSessionPlayers(activeSessionId, (newPlayers) => {
        setPlayers(newPlayers);
      }),
    );

    // 3. Subscribe to answer count for current question (replaces answers-changes)
    // We use a getter for currentQuestionId so the subscription stays fresh.
    const currentQidGetter = () => activeSession?.currentQuestionId;
    const qid = currentQidGetter();
    if (qid) {
      unsubs.push(
        subscribeAnswerCount(activeSessionId, qid, (count) => {
          setAnswersCount(count);
        }),
      );
      unsubs.push(
        subscribeQuestionAnswers(activeSessionId, qid, (answers) => {
          setQuestionAnswers(answers);
        }),
      );
    } else {
      setAnswersCount(0);
      setQuestionAnswers([]);
    }

    return () => {
      unsubs.forEach((u) => u && u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, activeSession?.currentQuestionId]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError("");
    setSuccess("");
    if (gameMode === "quiz" && selectedQuestionIds.length === 0) {
      setError("يرجى تحديد سؤال واحد على الأقل من مكتبة الأسئلة المتاحة.");
      return;
    }
    if (!profile.roomCode) {
      setError("احجز رمز غرفتك الدائم أولاً، ثم أنشئ جلسة المسابقة.");
      return;
    }
    try {
      await createSession({
        title,
        roomCode: profile.roomCode,
        timerDuration,
        createdBy: profile.uid,
        status: "waiting",
        currentQuestionId: null,
        questionStatus: "idle",
        showScoreboard: false,
        joiningLocked: false,
        questionIds: gameMode === "quiz" ? selectedQuestionIds : [],
        gameMode,
        chairCount: gameMode === "chairs" ? chairCount : undefined,
        chairRound: 0,
      });
      setSuccess("تم إنشاء الجلسة بنجاح!");
      setTitle("");
      setSelectedQuestionIds([]);
      setGameMode("quiz");
      const fresh = await getSessions(profile.uid);
      setSessions(fresh);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إنشاء الجلسة.");
    }
  };

  const handleReuseSession = async (session: Session) => {
    if (!profile) return;
    const baseTitle = session.title.replace(
      /\s*—\s*S\d+$|\s*[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/u,
      "",
    );
    const reuseCount =
      sessions.filter(
        (item) => item.title.startsWith(baseTitle) && item.title !== baseTitle,
      ).length + 1;
    try {
      const id = await createSession({
        title: `${baseTitle}${toSuperscript(reuseCount)}`,
        roomCode: session.roomCode,
        timerDuration: session.timerDuration,
        createdBy: profile.uid,
        status: "waiting",
        currentQuestionId: null,
        questionStatus: "idle",
        showScoreboard: false,
        joiningLocked: false,
        isDraft: false,
        questionIds: session.questionIds || [],
        gameMode: session.gameMode,
        chairCount:
          session.gameMode === "chairs" ? session.chairCount || 0 : undefined,
        chairRound: 0,
        teamsEnabled: session.teamsEnabled,
        teamSize: session.teamSize,
        wordMaxAttempts: session.wordMaxAttempts,
        imageRevealGrid: session.imageRevealGrid,
        impostorWord: session.impostorWord,
        impostorCategory: session.impostorCategory,
        impostorPhase: session.gameMode === "impostor" ? "waiting" : undefined,
        discussionDuration: session.discussionDuration,
        rouletteStatus: session.gameMode === "roulette" ? "idle" : undefined,
        roulettePrize: session.roulettePrize,
      });
      router.push(`/dashboard/sessions?id=${id}`);
    } catch (reuseError) {
      setError(
        reuseError instanceof Error
          ? reuseError.message
          : "تعذر إعادة استخدام الجلسة.",
      );
    }
  };

  const handleDeleteSession = async (session: Session) => {
    if (!window.confirm(`هل تريد حذف تحدي «${session.title}» نهائياً؟`)) return;
    try {
      await deleteSession(session.id);
      setSessions((current) =>
        current.filter((item) => item.id !== session.id),
      );
      setSuccess("تم حذف التحدي.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "تعذر حذف التحدي.",
      );
    }
  };

  const handlePauseListedSession = async (session: Session) => {
    try {
      await updateSession(session.id, {
        status: "paused",
        questionStatus: "idle",
        currentQuestionId: null,
      });
      if (profile?.uid) setSessions(await getSessions(profile.uid));
      setSuccess(`تم إيقاف «${session.title}» مؤقتاً.`);
    } catch (pauseError) {
      setError(
        pauseError instanceof Error ? pauseError.message : "تعذر إيقاف الجلسة.",
      );
    }
  };

  const handleMakeSessionExclusive = async (session: Session) => {
    try {
      await activateSessionExclusively(session.id, session.createdBy, {
        ...(session.startedAt ? {} : { startedAt: new Date() }),
      });
      if (profile?.uid) setSessions(await getSessions(profile.uid));
      setSuccess(`أصبح «${session.title}» هو التحدي النشط الوحيد.`);
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "تعذر اعتماد الجلسة الحالية.",
      );
    }
  };

  const handleManualSessionStatus = async (
    session: Session,
    nextStatus: ManualSessionStatus,
  ) => {
    try {
      if (nextStatus === "active") {
        await activateSessionExclusively(session.id, session.createdBy, {
          ...(session.startedAt ? {} : { startedAt: new Date() }),
        });
      } else if (nextStatus === "draft") {
        await updateSession(session.id, {
          status: "waiting",
          isDraft: true,
          questionStatus: "idle",
          currentQuestionId: null,
        });
      } else {
        await updateSession(session.id, {
          status: nextStatus,
          isDraft: false,
          questionStatus: "idle",
          currentQuestionId: null,
        });
      }
      if (profile?.uid) setSessions(await getSessions(profile.uid));
      const label =
        MANUAL_SESSION_STATUSES.find((option) => option.value === nextStatus)
          ?.label || nextStatus;
      setSuccess(`تم تغيير حالة «${session.title}» إلى «${label}».`);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "تعذر تغيير حالة الجلسة.",
      );
    }
  };

  const handleSavePresenterRoomCode = async () => {
    if (!/^\d{4}$/.test(presenterRoomCode.trim())) {
      setError("رمز الغرفة يجب أن يتكون من 4 أرقام.");
      return;
    }
    const user = auth.currentUser;
    if (!user) return;
    setError("");
    setSuccess("");
    setSavingRoomCode(true);
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/presenter/room-code", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ roomCode: presenterRoomCode.trim() }),
      });
      const payload = response.headers
        .get("content-type")
        ?.includes("application/json")
        ? ((await response.json()) as { roomCode?: string; error?: string })
        : { error: "تعذر الاتصال بخدمة حجز الرمز." };
      if (!response.ok || !payload.roomCode)
        throw new Error(payload.error || "تعذر حفظ رمز الغرفة.");
      setProfile((previous) =>
        previous ? { ...previous, roomCode: payload.roomCode } : previous,
      );
      setPresenterRoomCode(payload.roomCode);
      setSuccess(`تم حجز رمز غرفتك الدائم: ${payload.roomCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ رمز الغرفة.");
    } finally {
      setSavingRoomCode(false);
    }
  };

  const addQuestionToSession = (questionId: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev : [...prev, questionId],
    );
  };

  const removeQuestionFromSession = (questionId: string) => {
    setSelectedQuestionIds((prev) => prev.filter((id) => id !== questionId));
  };

  const handleQuestionDragStart = (
    event: DragEvent<HTMLElement>,
    questionId: string,
  ) => {
    event.dataTransfer.setData("text/plain", questionId);
    event.dataTransfer.effectAllowed = "move";
  };

  const handleDropIntoSession = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsQuestionDropActive(false);
    const questionId = event.dataTransfer.getData("text/plain");
    if (questions.some((question) => question.id === questionId))
      addQuestionToSession(questionId);
  };

  const handleDropIntoLibrary = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const questionId = event.dataTransfer.getData("text/plain");
    if (selectedQuestionIds.includes(questionId))
      removeQuestionFromSession(questionId);
  };

  // GAME CONSOLE ACTION HANDLERS
  const handleShowQuestion = async (qid: string, practice = false) => {
    if (!activeSession) return;
    const selectedQuestion = activeQuestions.find(
      (question) => question.id === qid,
    );
    const moneyCell =
      activeSession.gameMode === "money"
        ? activeSession.moneyBoard?.find(
            (cell) => cell.questionId === qid && cell.status === "available",
          )
        : undefined;
    if (activeSession.gameMode === "money" && !moneyCell) {
      setError("هذا المربع مستخدم أو غير موجود في لوحة فلوسك على المحك.");
      return;
    }
    if (activeSession.gameMode === "tarkeeba") {
      if (!selectedQuestion) {
        setError("تعذر العثور على كلمة هذا السؤال.");
        return;
      }
      const answer = getTarkeebaAnswer(selectedQuestion);
      if (getArabicWordLength(answer) !== 5) {
        setError("لعبة تركيبة تقبل إجابة مكوّنة من 5 أحرف فقط.");
        return;
      }
    }
    if (activeSession.questionStatus === "showing") {
      setError(
        "السؤال الحالي ما زال معروضاً. اكشف الإجابة أو انتظر انتهاء الوقت قبل طرح سؤال جديد.",
      );
      return;
    }
    if (!practice && (activeSession.usedQuestionIds || []).includes(qid)) {
      setError("تم استخدام هذا السؤال في هذه الجلسة ولا يمكن عرضه مرة أخرى.");
      return;
    }
    if (
      activeSession.gameMode === "faction" &&
      players.some((player) => !player.teamId)
    ) {
      const factionTeams = TEAM_OPTIONS.filter(
        (team) => team.id === "red" || team.id === "green",
      );
      await Promise.all(
        players.map((player, index) => {
          const team =
            factionTeams[index < Math.ceil(players.length / 2) ? 0 : 1];
          return updatePlayer(activeSession.id, player.id, {
            teamId: team.id,
            color: team.color,
          });
        }),
      );
      await updateSession(activeSession.id, {
        teamsEnabled: true,
        teamSize: Math.ceil(players.length / 2),
      });
    }
    setAnswersCount(0);
    if (selectedQuestion) setCurrentQuestion(selectedQuestion);
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        currentQuestionId: qid,
        questionStatus: "showing",
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
        revealedCorrectOption: null,
        roundWinners: [],
        practiceQuestion: practice,
        usedQuestionIds: practice
          ? activeSession.usedQuestionIds || []
          : [...new Set([...(activeSession.usedQuestionIds || []), qid])],
        ...(activeSession.gameMode === "image-reveal"
          ? {
              // Start automatically after the same 3-second preparation countdown.
              // This prevents contestants from seeing a permanently black cover
              // when the presenter forgets to press a second start button.
              imageRevealStartedAt: new Date(Date.now() + 3_000),
              imageRevealOrder: Array.from(
                { length: (activeSession.imageRevealGrid || 6) ** 2 },
                (_, index) => index,
              ).sort(() => Math.random() - 0.5),
            }
          : {}),
        ...(activeSession.gameMode === "tarkeeba" && selectedQuestion
          ? {
              tarkeebaSecret: btoa(
                unescape(
                  encodeURIComponent(getTarkeebaAnswer(selectedQuestion)),
                ),
              ),
              tarkeebaCategory:
                selectedQuestion.category || "كلمات من خمسة أحرف",
              tarkeebaHint: selectedQuestion.hint || "",
              tarkeebaQuestionText:
                selectedQuestion.questionText || selectedQuestion.category,
              tarkeebaShowQuestion:
                activeSession.tarkeebaShowQuestion !== false,
              tarkeebaMaxAttempts: 6,
            }
          : {}),
        ...(activeSession.gameMode === "money" && moneyCell
          ? {
              moneyCurrentCellId: moneyCell.id,
              moneyBoard: (activeSession.moneyBoard || []).map((cell) =>
                cell.id === moneyCell.id
                  ? { ...cell, status: "open" as const }
                  : cell,
              ),
            }
          : {}),
        questionPlayerIds: players
          .filter((player) => player.isActive)
          .map((player) => player.id),
        // Players receive a short 3-second prep countdown before the actual timer starts.
        questionStartedAt: new Date(Date.now() + 3_000),
      },
    );
    setActiveTab("control");
    setSuccess(
      practice
        ? "تم طرح السؤال التجريبي بوقت مفتوح وبدون نقاط."
        : "تم طرح السؤال وانتقلت إلى لوحة التحكم.",
    );
  };

  const handleStartImageReveal = async () => {
    if (
      !activeSession?.currentQuestionId ||
      activeSession.questionStatus !== "showing"
    )
      return;
    await updateSession(activeSession.id, {
      imageRevealStartedAt: new Date(),
      questionStartedAt: new Date(),
    });
  };

  const handleShowRandomQuestion = async () => {
    if (!activeSession) return;
    const used = new Set(activeSession.usedQuestionIds || []);
    const remaining = activeQuestions.filter(
      (question) => !used.has(question.id),
    );
    if (!remaining.length) {
      setError(
        "تم استخدام جميع أسئلة هذه الجلسة. أضف أسئلة جديدة أو أنشئ جلسة أخرى.",
      );
      return;
    }
    await handleShowQuestion(
      remaining[Math.floor(Math.random() * remaining.length)].id,
    );
  };

  const handleStartTop10Round = async () => {
    if (!activeSession || activeSession.gameMode !== "top10") return;
    if (!activeSession.top10Prompt || activeSession.top10Items?.length !== 10) {
      setError("إعدادات TOP 10 غير مكتملة.");
      return;
    }
    const roundId = `top10-${Date.now()}`;
    setAnswersCount(0);
    setQuestionAnswers([]);
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        currentQuestionId: roundId,
        questionStatus: "showing",
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
        questionStartedAt: new Date(Date.now() + 3_000),
        questionPlayerIds: players
          .filter((player) => player.isActive)
          .map((player) => player.id),
        roundWinners: [],
        top10Items: activeSession.top10Items.map((item) => ({
          id: item.id,
          answer: item.answer,
          aliases: item.aliases || [],
          points: item.points,
          revealed: false,
        })),
      },
    );
    setSuccess("بدأت جولة TOP 10 وظهرت خانة الإجابة للمتسابقين.");
  };

  const handleFinishTop10Round = async (revealAll: boolean) => {
    if (
      !activeSession ||
      activeSession.gameMode !== "top10" ||
      activeSession.questionStatus !== "showing"
    )
      return;
    const items = activeSession.top10Items || [];
    const totals = new Map<
      string,
      { playerId: string; name: string; color: string; scoreAdded: number }
    >();
    items.forEach((item) => {
      if (!item.foundById) return;
      const current = totals.get(item.foundById) || {
        playerId: item.foundById,
        name: item.foundByName || "متسابق",
        color: item.foundByColor || "#a855f7",
        scoreAdded: 0,
      };
      current.scoreAdded += Number(item.points || 0);
      totals.set(item.foundById, current);
    });
    await updateSession(activeSession.id, {
      questionStatus: "revealed",
      top10Items: revealAll
        ? items.map((item) => ({
            ...item,
            revealed: true,
            ...(!item.foundById ? { revealedByPresenter: true } : {}),
          }))
        : items,
      roundWinners: [...totals.values()]
        .sort((first, second) => second.scoreAdded - first.scoreAdded)
        .slice(0, 3)
        .map((winner) => ({ ...winner, timeSpent: 0 })),
    });
  };

  const handleStartChairRound = async (randomStop = false) => {
    if (!activeSession) return;
    const activePlayers = players.filter((player) => player.isActive);
    if (activePlayers.length < 2) {
      setError("تحتاج لعبة الكراسي إلى متسابقين نشطين على الأقل.");
      return;
    }
    const round = (activeSession.chairRound || 0) + 1;
    // Half the active contestants can sit: 10 players → 5 chairs.
    const roundChairs = Math.max(1, Math.floor(activePlayers.length / 2));
    const randomDelay = randomStop
      ? 5_000 + Math.floor(Math.random() * 10_001)
      : 0;
    setAnswersCount(0);
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        currentQuestionId: `chairs-${round}`,
        questionStatus: "idle",
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
        chairRound: round,
        chairCount: roundChairs,
        chairResults: {},
        chairPhase: "spinning",
        chairReadyAt: null,
        chairAutoStopAt: randomDelay
          ? new Date(Date.now() + randomDelay)
          : null,
        questionPlayerIds: activePlayers.map((player) => player.id),
        questionStartedAt: null,
      },
    );
    if (randomDelay) {
      setSuccess(
        `بدأ الدوران. سيصدر أمر الجلوس عشوائياً خلال ${Math.ceil(randomDelay / 1000)} ثوانٍ تقريباً.`,
      );
      window.setTimeout(() => {
        void handleTriggerChairRound(activeSession.id, `chairs-${round}`);
      }, randomDelay);
    }
  };

  const handleTriggerChairRound = async (
    sessionId = activeSession?.id,
    roundId = activeSession?.currentQuestionId || "",
  ) => {
    if (!sessionId || !roundId) return;
    const latest = await getSessionById(sessionId);
    if (
      !latest ||
      latest.gameMode !== "chairs" ||
      latest.currentQuestionId !== roundId ||
      latest.chairPhase !== "spinning"
    )
      return;
    const now = new Date();
    await updateSession(sessionId, {
      chairPhase: "ready",
      chairReadyAt: now,
      chairAutoStopAt: null,
      questionStatus: "showing",
      questionStartedAt: now,
    });
  };

  const handleFakeChairStop = async () => {
    if (
      !activeSession?.currentQuestionId ||
      activeSession.chairPhase !== "spinning"
    )
      return;
    const roundId = activeSession.currentQuestionId;
    await updateSession(activeSession.id, { chairPhase: "fake" });
    window.setTimeout(async () => {
      const latest = await getSessionById(activeSession.id);
      if (latest?.chairPhase === "fake" && latest.currentQuestionId === roundId)
        await updateSession(activeSession.id, { chairPhase: "spinning" });
    }, 1200);
  };

  const handleRevealAnswer = async () => {
    if (!activeSession || !activeSession.currentQuestionId) return;
    if (activeSession.gameMode === "tarkeeba") {
      const winners = questionAnswers
        .filter((answer) => answer.isCorrect)
        .sort(
          (first, second) =>
            (first.tarkeebaAttempts || 99) - (second.tarkeebaAttempts || 99) ||
            (first.timeSpent || 0) - (second.timeSpent || 0),
        )
        .slice(0, 3)
        .flatMap((answer) => {
          const winner = players.find(
            (player) => player.id === answer.playerId,
          );
          return winner
            ? [
                {
                  playerId: winner.id,
                  name: winner.name,
                  color: winner.color,
                  scoreAdded: Math.max(1, 7 - (answer.tarkeebaAttempts || 6)),
                  timeSpent: answer.timeSpent || 0,
                },
              ]
            : [];
        });
      await updateSession(activeSession.id, {
        questionStatus: "revealed",
        roundWinners: winners,
      });
      return;
    }
    if (activeSession.gameMode === "baathra") {
      const pendingReviews = questionAnswers.filter(
        (answer) =>
          answer.baathraTextAnswer && answer.reviewStatus === "pending",
      );
      if (
        activeSession.baathraMode === "requests" &&
        pendingReviews.length > 0
      ) {
        setError(
          `صحّح جميع الإجابات أولاً — متبقي ${pendingReviews.length} إجابة معلّقة.`,
        );
        return;
      }
      const user = auth.currentUser;
      if (!user) throw new Error("يلزم تسجيل الدخول لإنهاء الجولة.");
      const response = await fetch("/api/game/reveal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken(true)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          questionId: activeSession.currentQuestionId,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "تعذر إنهاء جولة بعثرة.");
      if (activeSession.baathraMode === "requests") {
        setBaathraNameRoundId(0);
        setBaathraControlLetters([]);
      }
      return;
    }
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("يلزم تسجيل الدخول لكشف الإجابة.");
      const response = await fetch("/api/game/reveal", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken(true)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          questionId: activeSession.currentQuestionId,
        }),
      });
      const payload = response.headers
        .get("content-type")
        ?.includes("application/json")
        ? ((await response.json()) as { error?: string })
        : { error: "تعذر الاتصال بخدمة كشف الإجابة." };
      if (!response.ok) throw new Error(payload.error || "تعذر كشف الإجابة.");
    } catch (revealError) {
      setError(
        revealError instanceof Error
          ? revealError.message
          : "تعذر كشف الإجابة.",
      );
    }
  };

  const handleToggleScoreboard = async () => {
    if (!activeSession) return;
    const newState = !activeSession.showScoreboard;
    await updateSession(activeSession.id, { showScoreboard: newState });
    if (newState) {
      setTimeout(async () => {
        await updateSession(activeSession.id, { showScoreboard: false });
      }, 6000);
    }
  };

  const handleEnableTeams = async () => {
    if (!activeSession || players.length === 0) {
      setError("ينبغي انضمام متسابق واحد على الأقل قبل توزيع الفرق.");
      return;
    }
    setSavingTeams(true);
    setError("");
    try {
      const size = Math.max(1, teamSize);
      const factionTeams = TEAM_OPTIONS.filter(
        (team) => team.id === "red" || team.id === "green",
      );
      await Promise.all(
        players.map((player, index) => {
          const team =
            activeSession.gameMode === "faction"
              ? factionTeams[index < Math.ceil(players.length / 2) ? 0 : 1]
              : TEAM_OPTIONS[Math.floor(index / size) % TEAM_OPTIONS.length];
          return updatePlayer(activeSession.id, player.id, {
            teamId: team.id,
            color: team.color,
          });
        }),
      );
      await updateSession(activeSession.id, {
        teamsEnabled: true,
        teamSize:
          activeSession.gameMode === "faction"
            ? Math.ceil(players.length / 2)
            : size,
      });
      setSuccess(
        `تم توزيع ${players.length} متسابق على فرق بسعة ${size} متسابقين لكل لون.`,
      );
    } catch (teamError) {
      setError(
        teamError instanceof Error ? teamError.message : "تعذر توزيع الفرق.",
      );
    } finally {
      setSavingTeams(false);
    }
  };

  const handleMovePlayerToTeam = async (player: Player, teamId: string) => {
    if (!activeSession) return;
    const team = getTeam(teamId);
    if (!team) return;
    try {
      await updatePlayer(activeSession.id, player.id, {
        teamId: team.id,
        color: team.color,
      });
    } catch (moveError) {
      setError(
        moveError instanceof Error
          ? moveError.message
          : "تعذر نقل المتسابق للفريق.",
      );
    }
  };

  const handleAdjustPlayerScore = async (player: Player, direction: 1 | -1) => {
    if (!activeSession) return;
    const value = window.prompt(
      `اكتب عدد النقاط المراد ${direction === 1 ? "إضافتها" : "خصمها"} لـ ${player.name}:`,
      "10",
    );
    if (value === null) return;
    const amount = Math.abs(Number(value));
    if (!Number.isFinite(amount) || amount === 0) {
      setError("أدخل عدداً صحيحاً أكبر من صفر.");
      return;
    }
    try {
      await updatePlayer(activeSession.id, player.id, {
        score: Math.max(0, (player.score || 0) + direction * amount),
      });
    } catch (scoreError) {
      setError(
        scoreError instanceof Error ? scoreError.message : "تعذر تعديل النقاط.",
      );
    }
  };

  const handlePlayerApproval = async (
    player: Player,
    approvalStatus: "approved" | "rejected",
  ) => {
    if (!activeSession) return;
    try {
      await updatePlayer(activeSession.id, player.id, {
        approvalStatus,
        isActive: approvalStatus === "approved",
        lastSeenAt: new Date(),
      });
      setSuccess(
        approvalStatus === "approved"
          ? `تم قبول ${player.name} وإدخاله للمسابقة.`
          : `تم رفض طلب ${player.name}.`,
      );
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "تعذر تحديث طلب الانضمام.",
      );
    }
  };

  const handleDeletePlayer = async (player: Player) => {
    if (!activeSession) return;
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف المتسابق «${player.name}» من اللعبة؟\nلن يتمكن من متابعة هذه الجلسة إلا إذا انضم من جديد.`,
    );
    if (!confirmed) return;
    try {
      await deletePlayer(activeSession.id, player.id);
      setSuccess(`تم حذف المتسابق ${player.name} من اللعبة.`);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف المتسابق من اللعبة.",
      );
    }
  };

  const handleStartImpostor = async () => {
    if (!activeSession || players.length < 3) {
      setError("تحتاج لعبة أمبوستر إلى 3 متسابقين على الأقل.");
      return;
    }
    const impostor = players[Math.floor(Math.random() * players.length)];
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
        impostorPlayerId: impostor.id,
        impostorPhase: "discussion",
        impostorVotes: {},
      },
    );
  };

  const handleOpenImpostorVoting = async () => {
    if (!activeSession) return;
    await updateSession(activeSession.id, { impostorPhase: "voting" });
  };

  const handleRevealImpostor = async () => {
    if (!activeSession) return;
    const answers = await getAnswersForQuestion(
      activeSession.id,
      "impostor-vote",
    );
    const votes: Record<string, number> = {};
    answers.forEach((answer) => {
      const target = (answer as any).votedPlayerId;
      if (target) votes[target] = (votes[target] || 0) + 1;
    });
    await updateSession(activeSession.id, {
      impostorPhase: "revealed",
      impostorVotes: votes,
    });
  };

  const handleStartRoulette = async () => {
    if (!activeSession) return;
    const winnerId = rouletteWinnerId || players[0]?.id;
    if (!winnerId) {
      setError("اختر متسابقاً لتشغيل العجلة.");
      return;
    }
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
        rouletteWinnerId: winnerId,
        rouletteStatus: "spinning",
      },
    );
  };

  const handleStartAndLockJoining = async () => {
    if (!activeSession) return;
    if (players.length === 0) {
      setError("بانتظار انضمام متسابق واحد على الأقل قبل البدء.");
      return;
    }
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        joiningLocked: true,
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
      },
    );
    setSuccess(
      "بدأت المسابقة وتم إغلاق الانضمام. اختر الآن السؤال أو نمط اللعب الأول.",
    );
  };

  const handleAddEmergencyQuestion = async () => {
    if (!activeSession || !profile) return;
    const draft = emergencyQuestion;
    if (
      !draft.text.trim() ||
      !draft.option1.trim() ||
      !draft.option2.trim() ||
      !draft.option3.trim() ||
      !draft.option4.trim()
    ) {
      setError("أكمل نص السؤال والخيارات الأربعة.");
      return;
    }
    try {
      const questionId = await addQuestion({
        questionText: draft.text.trim(),
        questionType: "text",
        imageUrl: "",
        option1: draft.option1.trim(),
        option2: draft.option2.trim(),
        option3: draft.option3.trim(),
        option4: draft.option4.trim(),
        correctOption: draft.correctOption,
        category: draft.category.trim() || "عامة",
        difficulty: draft.difficulty,
        createdBy: profile.uid,
        visibility: "presenter-private",
        ...(!draft.permanent ? { temporarySessionId: activeSession.id } : {}),
      });
      await updateSession(activeSession.id, {
        questionIds: [
          ...new Set([...(activeSession.questionIds || []), questionId]),
        ],
      });
      const added: Question = {
        id: questionId,
        questionText: draft.text.trim(),
        questionType: "text",
        imageUrl: "",
        option1: draft.option1.trim(),
        option2: draft.option2.trim(),
        option3: draft.option3.trim(),
        option4: draft.option4.trim(),
        correctOption: draft.correctOption,
        category: draft.category.trim() || "عامة",
        difficulty: draft.difficulty,
        createdBy: profile.uid,
        visibility: "presenter-private",
        ...(!draft.permanent ? { temporarySessionId: activeSession.id } : {}),
      };
      setActiveQuestions((current) => [...current, added]);
      setShowEmergencyQuestion(false);
      setEmergencyQuestion({
        text: "",
        option1: "",
        option2: "",
        option3: "",
        option4: "",
        correctOption: 1,
        category: "عامة",
        difficulty: "medium",
        permanent: false,
      });
      setSuccess(
        draft.permanent
          ? "تم حفظ السؤال في مكتبتك الخاصة وإضافته للجلسة."
          : "تمت إضافة السؤال المؤقت لهذه الجلسة فقط.",
      );
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "تعذر إضافة السؤال الطارئ.",
      );
    }
  };

  const handleSaveSessionEdits = async () => {
    if (!activeSession || !editSessionTitle.trim()) return;
    try {
      await updateSession(activeSession.id, {
        title: editSessionTitle.trim(),
        timerDuration: Math.max(5, editSessionTimer),
      });
      setSuccess("تم حفظ اسم التحدي ومدة الأسئلة الجديدة.");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "تعذر حفظ تعديلات الجلسة.",
      );
    }
  };

  const getMoneyEditPool = (selectedCategory?: string) =>
    questions
      .filter((question) => {
        if (question.questionType === "word") return false;
        if (selectedCategory && question.category !== selectedCategory)
          return false;
        const rule = gameQuestionRules.money;
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
      })
      .sort(
        (first, second) =>
          MONEY_DIFFICULTY_RANK[first.difficulty] -
          MONEY_DIFFICULTY_RANK[second.difficulty],
      );

  const toggleMoneyEditCategory = (selectedCategory: string) => {
    setMoneyEditCategories((current) => {
      if (current.includes(selectedCategory)) {
        setMoneyEditSelections((selections) => {
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
      setMoneyEditSelections((selections) => ({
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

  const setMoneyEditQuestionAt = (
    selectedCategory: string,
    index: number,
    questionId: string,
  ) => {
    setMoneyEditSelections((current) => {
      const next = [...(current[selectedCategory] || ["", "", "", "", ""])];
      next[index] = questionId;
      return { ...current, [selectedCategory]: next };
    });
  };

  const fillMoneyEditCategory = (selectedCategory: string, random = false) => {
    setMoneyEditSelections((current) => ({
      ...current,
      [selectedCategory]: pickMoneySessionQuestions(
        getMoneyEditPool(selectedCategory),
        random,
      ),
    }));
  };

  const fillAllMoneyEditCategories = (random = false) => {
    setMoneyEditSelections((current) => {
      const next = { ...current };
      moneyEditCategories.forEach((selectedCategory) => {
        next[selectedCategory] = pickMoneySessionQuestions(
          getMoneyEditPool(selectedCategory),
          random,
        );
      });
      return next;
    });
  };

  const handleSaveMoneyBoard = async () => {
    if (!activeSession || activeSession.gameMode !== "money") return;
    if (activeSession.questionStatus === "showing") {
      setError("اعتمد السؤال الحالي أو أنهِه قبل تعديل لوحة اللعبة.");
      return;
    }
    const selectedIds = moneyEditCategories.flatMap((selectedCategory) =>
      (moneyEditSelections[selectedCategory] || []).filter(Boolean),
    );
    if (
      moneyEditCategories.length !== 5 ||
      selectedIds.length !== 25 ||
      new Set(selectedIds).size !== 25
    ) {
      setError("اختر 5 تصنيفات و5 أسئلة مختلفة لكل تصنيف.");
      return;
    }
    if (
      moneyEditValues.some(
        (value, index) =>
          value <= 0 || (index > 0 && value <= moneyEditValues[index - 1]),
      )
    ) {
      setError("المبالغ يجب أن تكون موجبة ومتزايدة.");
      return;
    }
    setSavingMoneyBoard(true);
    setError("");
    try {
      const existingByQuestion = new Map(
        (activeSession.moneyBoard || []).map((cell) => [cell.questionId, cell]),
      );
      const nextBoard = moneyEditCategories.flatMap((selectedCategory) =>
        (moneyEditSelections[selectedCategory] || []).map(
          (questionId, index) => {
            const existing = existingByQuestion.get(questionId);
            return {
              id: existing?.id || `${selectedCategory}-${index + 1}`,
              questionId,
              category: selectedCategory,
              value: moneyEditValues[index],
              status: existing?.status || ("available" as const),
              ...(existing?.isDouble ? { isDouble: true } : {}),
            };
          },
        ),
      );
      await updateSession(activeSession.id, {
        questionIds: selectedIds,
        moneyCategories: moneyEditCategories,
        moneyBoard: nextBoard,
        moneyScoring: moneyEditScoring,
      });
      setActiveQuestions(
        selectedIds.flatMap((id) => {
          const question = questions.find((item) => item.id === id);
          return question ? [question] : [];
        }),
      );
      setSuccess("تم حفظ تصنيفات وأسئلة ومبالغ لوحة فلوسك على المحك.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ لوحة اللعبة.",
      );
    } finally {
      setSavingMoneyBoard(false);
    }
  };

  const applyTop10EditQuestion = (
    question: Top10Question,
    mode: Exclude<Top10SelectionMode, "custom">,
  ) => {
    setTop10EditMode(mode);
    setTop10EditSelectedId(question.id);
    setTop10EditPrompt(question.prompt);
    setTop10EditEntries(
      question.items.map((item) => ({
        answer: item.answer,
        aliases: item.aliases.join("، "),
      })),
    );
    setError("");
  };

  const handleSaveTop10Settings = async () => {
    if (!activeSession || activeSession.gameMode !== "top10") return;
    if (activeSession.questionStatus === "showing") {
      setError("أنهِ جولة TOP 10 الحالية قبل تغيير سؤالها.");
      return;
    }
    const uniqueAnswers = new Set(
      top10EditEntries.map((entry) =>
        entry.answer.trim().toLocaleLowerCase("ar"),
      ),
    );
    if (
      !top10EditPrompt.trim() ||
      top10EditEntries.length !== 10 ||
      top10EditEntries.some((entry) => !entry.answer.trim()) ||
      uniqueAnswers.size !== 10
    ) {
      setError(
        "اختر سؤالاً من البنك أو أدخل سؤالاً مخصصاً مع 10 إجابات مختلفة.",
      );
      return;
    }
    setSavingTop10(true);
    setError("");
    try {
      await updateSession(activeSession.id, {
        top10Prompt: top10EditPrompt.trim(),
        top10SelectionMode: top10EditMode,
        top10BankQuestionId:
          top10EditMode === "custom" ? null : top10EditSelectedId,
        top10Items: top10EditEntries.map((entry, index) => ({
          id: `top10-${index + 1}`,
          answer: entry.answer.trim(),
          aliases: entry.aliases
            .split(/[،,]/)
            .map((alias) => alias.trim())
            .filter(Boolean),
          points: index + 1,
          revealed: false,
        })),
      });
      setSuccess("تم حفظ سؤال TOP 10 وإجاباته في الجلسة.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "تعذر حفظ إعدادات TOP 10.",
      );
    } finally {
      setSavingTop10(false);
    }
  };

  const handleAddQuestionToExistingSession = async (question: Question) => {
    if (!activeSession || activeSession.questionIds.includes(question.id))
      return;
    try {
      const nextQuestionIds = [...activeSession.questionIds, question.id];
      await updateSession(activeSession.id, { questionIds: nextQuestionIds });
      setActiveSession((current) =>
        current ? { ...current, questionIds: nextQuestionIds } : current,
      );
      setActiveQuestions((current) => [...current, question]);
      setSuccess(`تمت إضافة السؤال إلى «${activeSession.title}».`);
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "تعذر إضافة السؤال للجلسة.",
      );
    }
  };

  const handleRemoveQuestionFromExistingSession = async (
    question: Question,
  ) => {
    if (!activeSession) return;
    if (
      (activeSession.usedQuestionIds || []).includes(question.id) ||
      activeSession.currentQuestionId === question.id
    ) {
      setError("لا يمكن حذف سؤال تم استخدامه أو معروض حالياً.");
      return;
    }
    try {
      const nextQuestionIds = activeSession.questionIds.filter(
        (id) => id !== question.id,
      );
      await updateSession(activeSession.id, { questionIds: nextQuestionIds });
      setActiveSession((current) =>
        current ? { ...current, questionIds: nextQuestionIds } : current,
      );
      setActiveQuestions((current) =>
        current.filter((item) => item.id !== question.id),
      );
      setSuccess("تم حذف السؤال من الجلسة فقط، وبقي محفوظاً في بنك الأسئلة.");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "تعذر حذف السؤال من الجلسة.",
      );
    }
  };

  const handleMoveSessionQuestion = async (
    questionId: string,
    direction: "up" | "down",
  ) => {
    if (!activeSession) return;
    const currentIndex = activeSession.questionIds.indexOf(questionId);
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= activeSession.questionIds.length
    )
      return;
    const nextQuestionIds = [...activeSession.questionIds];
    [nextQuestionIds[currentIndex], nextQuestionIds[targetIndex]] = [
      nextQuestionIds[targetIndex],
      nextQuestionIds[currentIndex],
    ];
    await updateSession(activeSession.id, { questionIds: nextQuestionIds });
    setActiveSession((current) =>
      current ? { ...current, questionIds: nextQuestionIds } : current,
    );
    setActiveQuestions((current) => {
      const byId = new Map(current.map((question) => [question.id, question]));
      return nextQuestionIds.flatMap((id) => {
        const question = byId.get(id);
        return question ? [question] : [];
      });
    });
  };

  const refreshSessions = async () => {
    if (profile?.uid) setSessions(await getSessions(profile.uid));
  };

  const handlePauseSession = async () => {
    if (!activeSession) return;
    if (
      !confirm(
        "إيقاف الجلسة مؤقتاً؟ لن يظهر هذا التحدي للمتسابقين حتى تستأنفه.",
      )
    )
      return;
    try {
      await updateSession(activeSession.id, {
        status: "paused",
        questionStatus: "idle",
        currentQuestionId: null,
      });
      await refreshSessions();
      setSuccess("تم إيقاف الجلسة مؤقتاً وإخفاؤها عن المتسابقين.");
    } catch (pauseError) {
      setError(
        pauseError instanceof Error
          ? pauseError.message
          : "تعذر إيقاف الجلسة مؤقتاً.",
      );
    }
  };

  const handleActivateOnlyThisSession = async () => {
    if (!activeSession || !profile?.uid) return;
    setActivatingExclusive(true);
    setError("");
    try {
      await activateSessionExclusively(activeSession.id, profile.uid, {
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
      });
      await refreshSessions();
      const latest = await getSessionById(activeSession.id);
      if (latest) setActiveSession(latest);
      setSuccess(
        `تم اعتماد «${activeSession.title}» للبث وإيقاف جميع الجلسات الأخرى.`,
      );
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : "تعذر اعتماد الجلسة للبث.",
      );
    } finally {
      setActivatingExclusive(false);
    }
  };

  const handleStartTarkeeba = async () => {
    if (!activeSession) return;
    const used = new Set(activeSession.usedQuestionIds || []);
    const remaining = activeQuestions.filter(
      (question) =>
        question.questionType === "word" &&
        getArabicWordLength(getTarkeebaAnswer(question)) === 5 &&
        !used.has(question.id),
    );
    if (!remaining.length) {
      setError(
        activeQuestions.some(
          (question) =>
            question.questionType === "word" &&
            getArabicWordLength(getTarkeebaAnswer(question)) !== 5,
        )
          ? "لا توجد كلمة متبقية من 5 أحرف. أضف كلمات مناسبة من تبويب التعديلات."
          : "اكتملت جميع جولات تركيبة المختارة.",
      );
      return;
    }
    await handleShowQuestion(remaining[0].id);
  };

  const handleStartBaathra = async () => {
    if (!activeSession) return;
    const word = baathraControlWord.trim().replace(/\s+/g, "");
    const requestLetters = baathraControlLetters
      .map((letter) => letter.trim())
      .filter(Boolean);
    if (baathraControlMode === "speed" && Array.from(word).length < 2) {
      setError("اكتب كلمة من حرفين على الأقل لبدء بعثرة.");
      return;
    }
    if (
      baathraControlMode === "requests" &&
      (requestLetters.length < 1 || requestLetters.length > 8)
    ) {
      setError("وضع «كوّن اسماً» يحتاج من حرف واحد إلى 8 أحرف كحد أقصى.");
      return;
    }
    if (
      baathraControlMode === "requests" &&
      baathraControlRequests.some((request) => !request.trim())
    ) {
      setError("أكمل أسماء التصنيفات قبل بدء الجولة.");
      return;
    }
    if (
      baathraControlMode === "requests" &&
      (baathraActiveRequestIndexes.length < 1 ||
        baathraActiveRequestIndexes.length > 2)
    ) {
      setError("اختر طلباً واحداً أو طلبين فقط لهذه الجولة.");
      return;
    }
    const original =
      baathraControlMode === "speed" ? Array.from(word) : requestLetters;
    const selectedNameRound = baathraNameRounds.find(
      (round) => round.id === baathraNameRoundId,
    );
    const sameLetterSet =
      selectedNameRound &&
      [...selectedNameRound.letters].sort().join("") ===
        [...requestLetters].sort().join("");
    let shuffled = [...original].sort(() => Math.random() - 0.5);
    if (shuffled.join("") === original.join("") && shuffled.length > 1)
      shuffled = [...shuffled.slice(1), shuffled[0]];
    const roundId = `baathra-${Date.now()}`;
    await activateSessionExclusively(
      activeSession.id,
      activeSession.createdBy,
      {
        joiningLocked: true,
        currentQuestionId: roundId,
        questionStatus: "showing",
        questionPlayerIds: players
          .filter((player) => player.isActive)
          .map((player) => player.id),
        // Give contestant devices a synchronized three-second preparation window.
        questionStartedAt: new Date(Date.now() + 3000),
        baathraMode: baathraControlMode,
        baathraSecret:
          baathraControlMode === "speed"
            ? btoa(unescape(encodeURIComponent(word)))
            : "",
        baathraLetters: baathraControlMode === "requests" ? original : [],
        baathraRequests:
          baathraControlMode === "requests"
            ? baathraControlRequests.map((request) => request.trim())
            : [],
        baathraActiveRequestIndexes:
          baathraControlMode === "requests" ? baathraActiveRequestIndexes : [],
        baathraNameRoundId:
          baathraControlMode === "requests" && sameLetterSet
            ? selectedNameRound?.id
            : 0,
        baathraShuffledLetters: shuffled,
        baathraCorrectCount: 0,
        roundWinners: [],
        ...(activeSession.startedAt ? {} : { startedAt: new Date() }),
      },
    );
    setActiveTab("control");
    setSuccess("بدأت جولة بعثرة وظهرت الحروف للمتسابقين.");
  };

  const handleReviewBaathraRequest = async (
    answer: Answer,
    approved: boolean,
  ) => {
    if (!activeSession) return;
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("انتهت جلسة دخول المقدم.");
      const response = await fetch("/api/game/baathra-review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken(true)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: activeSession.id,
          answerId: answer.id,
          approved,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تقييم الإجابة.");
      return true;
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "تعذر تقييم الإجابة.",
      );
      return false;
    }
  };

  const handleStartNewBaathraAfterSkipping = async () => {
    if (!activeSession) return;
    const pending = questionAnswers.filter(
      (answer) => answer.baathraTextAnswer && answer.reviewStatus === "pending",
    );
    if (
      pending.length > 0 &&
      !confirm(
        `يوجد ${pending.length} إجابة غير مصححة. سيتم رفضها وبدء جولة جديدة، هل تريد المتابعة؟`,
      )
    )
      return;
    const reviewResults = await Promise.all(
      pending.map((answer) => handleReviewBaathraRequest(answer, false)),
    );
    if (reviewResults.some((result) => !result)) return;
    await updateSession(activeSession.id, {
      questionStatus: "idle",
      currentQuestionId: null,
      baathraUsedRounds: [
        ...(activeSession.baathraUsedRounds || []).filter(
          (round) => round.roundId !== activeSession.currentQuestionId,
        ),
        {
          roundId: activeSession.currentQuestionId || `baathra-${Date.now()}`,
          mode: "requests",
          label:
            activeSession.baathraNameRoundId &&
            activeSession.baathraNameRoundId > 0
              ? `جولة الأسماء ${activeSession.baathraNameRoundId}`
              : "حروف مخصصة",
          letters: activeSession.baathraLetters || [],
          ...(activeSession.baathraNameRoundId &&
          activeSession.baathraNameRoundId > 0
            ? { nameRoundId: activeSession.baathraNameRoundId }
            : {}),
        },
      ],
    });
    setBaathraNameRoundId(0);
    setBaathraControlLetters([]);
    setSuccess("تم نقل الجولة إلى المستخدمة. اختر حروفاً أو جولة جديدة.");
  };

  const handleToggleWordKeyboardPreview = async () => {
    if (!activeSession) return;
    await updateSession(activeSession.id, {
      wordKeyboardPreview: !activeSession.wordKeyboardPreview,
    });
    setSuccess(
      activeSession.wordKeyboardPreview
        ? "تم إخفاء لوحة تدريب الحروف."
        : "تم عرض لوحة تدريب الحروف للمتسابقين.",
    );
  };

  const handleToggleTarkeebaQuestion = async () => {
    if (!activeSession) return;
    const next = activeSession.tarkeebaShowQuestion === false;
    await updateSession(activeSession.id, { tarkeebaShowQuestion: next });
    setSuccess(
      next
        ? "تم إظهار نص السؤال للمتسابقين."
        : "تم إخفاء نص السؤال عن المتسابقين.",
    );
  };

  const handleEndGame = async () => {
    if (!activeSession || activeSession.status === "finished" || endingGame)
      return;
    if (!confirm("هل تريد إنهاء هذه المسابقة نهائياً وتتويج الفائزين؟")) return;
    setError("");
    setEndingGame(true);
    try {
      if (players.length > 0) {
        const winner = players[0];
        await archiveWinner({
          sessionId: activeSession.id,
          sessionTitle: activeSession.title,
          winnerName: winner.name,
          winnerScore: winner.score,
          totalPlayers: players.length,
          presenterId: profile?.uid || activeSession.createdBy,
          presenterName:
            profile?.displayName || profile?.username || "مقدم المسابقة",
          participants: players.map((player) => ({
            name: player.name,
            score: player.score || 0,
          })),
        });
        await Promise.all(
          players.map((p) => incrementCumulativeScore(p.name, p.score)),
        );
      }

      await updateSession(activeSession.id, {
        status: "finished",
        currentQuestionId: null,
        questionStatus: "idle",
      });
      router.push("/dashboard/sessions");
    } catch (endError) {
      setError(
        endError instanceof Error
          ? endError.message
          : "تعذر إنهاء الجلسة. حاول مرة أخرى.",
      );
    } finally {
      setEndingGame(false);
    }
  };

  const handleUpdateTvSettings = async () => {
    if (!activeSession) return;
    try {
      await updateSession(activeSession.id, {
        tvBgColor: tvBgColorInput,
        tvLogoText: tvLogoTextInput,
        tvFontSize: tvFontSizeInput,
        tvShowQuestions: tvShowQuestionsInput,
        overlayMode: tvChromaInput,
      });
      setSuccess("تم تحديث إعدادات شاشة العرض بنجاح!");
    } catch (err: any) {
      setError(err.message || "خطأ في تحديث إعدادات الشاشة");
    }
  };

  const handleBroadcastHint = async () => {
    if (!activeSession || !hintInput.trim()) return;
    const sentHint = hintInput.trim();
    try {
      await updateSession(activeSession.id, {
        currentHint: sentHint,
      });
      setHintInput("");
      setSuccess("تم بث التلميح للمتسابقين وشاشة التلفزيون بنجاح!");
      window.setTimeout(async () => {
        const latest = await getSessionById(activeSession.id);
        if (latest?.currentHint === sentHint)
          await updateSession(activeSession.id, { currentHint: null });
      }, 6000);
    } catch (hintError) {
      setError(
        hintError instanceof Error ? hintError.message : "خطأ في بث التلميح",
      );
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل الجلسات..." />
      </div>
    );
  }

  // ==========================================
  // VIEW: GAME CONSOLE
  // ==========================================
  if (activeSession) {
    const playerConnections = players.map((player) => ({
      player,
      ...getPlayerConnection(player, presenceNow),
    }));
    const playersWithIssues = playerConnections.filter(
      (connection) => connection.state !== "online",
    );
    const teamStandings = TEAM_OPTIONS.map((team) => {
      const members = players.filter(
        (player) =>
          (player.teamId || getTeamFromColor(player.color)?.id) === team.id,
      );
      return {
        ...team,
        members,
        score: members.reduce(
          (total, player) => total + (player.score || 0),
          0,
        ),
      };
    })
      .filter((team) => team.members.length > 0)
      .sort((a, b) => b.score - a.score);
    const joinUrl =
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/player?room=${activeSession.roomCode}`;
    const recoveryUrl =
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/player?room=${activeSession.roomCode}&recover=1`;
    const tvUrl =
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/tv?code=${activeSession.roomCode}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`انضم إلى ${activeSession.title}\nرمز الغرفة: ${activeSession.roomCode}\n${joinUrl}`)}`;
    const elapsedSeconds = activeSession.startedAt
      ? Math.max(
          0,
          Math.floor(
            (elapsedNow - getTimestampMillis(activeSession.startedAt)) / 1000,
          ),
        )
      : 0;
    const elapsedLabel = `${String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0")}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
    const roundPlayerIds =
      activeSession.questionPlayerIds ||
      players.filter((player) => player.isActive).map((player) => player.id);
    const roundPlayers = players.filter((player) =>
      roundPlayerIds.includes(player.id),
    );
    const answersByPlayer = new Map(
      questionAnswers.map((answer) => [answer.playerId, answer]),
    );
    const tarkeebaRoundWinners = questionAnswers
      .filter((answer) => answer.isCorrect)
      .sort(
        (first, second) =>
          (first.tarkeebaAttempts || 99) - (second.tarkeebaAttempts || 99) ||
          (first.timeSpent || 0) - (second.timeSpent || 0),
      );
    const baathraPendingReviewCount = questionAnswers.filter(
      (answer) => answer.baathraTextAnswer && answer.reviewStatus === "pending",
    ).length;
    const usedBaathraNameRoundIds = new Set(
      (activeSession.baathraUsedRounds || []).flatMap((round) =>
        round.nameRoundId ? [round.nameRoundId] : [],
      ),
    );
    const availableBaathraNameRounds = baathraNameRounds.filter(
      (round) => !usedBaathraNameRoundIds.has(round.id),
    );
    const selectedBaathraReferenceRound = baathraNameRounds.find(
      (round) => round.id === baathraNameRoundId,
    );
    const questionEndsAt =
      getTimestampMillis(activeSession.questionStartedAt) +
      (Number(activeSession.timerDuration) || 30) * 1000;
    const questionSecondsLeft =
      activeSession.questionStatus === "showing" && questionEndsAt > 0
        ? Math.max(0, Math.ceil((questionEndsAt - presenceNow) / 1000))
        : 0;
    const usedQuestionIds = new Set(activeSession.usedQuestionIds || []);
    const moneyBoardCategories = activeSession.moneyCategories || [
      ...new Set((activeSession.moneyBoard || []).map((cell) => cell.category)),
    ];
    const moneyEditAvailableCategories = [
      ...new Set(getMoneyEditPool().map((question) => question.category)),
    ]
      .filter(
        (selectedCategory) => getMoneyEditPool(selectedCategory).length >= 5,
      )
      .sort((first, second) => first.localeCompare(second, "ar"));
    const moneyStandings = [...players].sort(
      (first, second) =>
        (second.score || 0) - (first.score || 0) ||
        first.name.localeCompare(second.name, "ar"),
    );
    const activeMoneyCell = (activeSession.moneyBoard || []).find(
      (cell) => cell.id === activeSession.moneyCurrentCellId,
    );
    const remainingSessionQuestions = activeQuestions.filter(
      (question) => !usedQuestionIds.has(question.id),
    );
    const usedSessionQuestions = activeQuestions.filter((question) =>
      usedQuestionIds.has(question.id),
    );
    const sessionQuestionIds = new Set(activeSession.questionIds || []);
    const addableSessionQuestions = questions.filter((question) => {
      if (sessionQuestionIds.has(question.id)) return false;
      const mode = activeSession.gameMode || "quiz";
      const rule = gameQuestionRules[mode];
      if (
        ["word", "tarkeeba"].includes(mode) &&
        question.questionType !== "word"
      )
        return false;
      if (
        mode === "tarkeeba" &&
        getArabicWordLength(getTarkeebaAnswer(question)) !== 5
      )
        return false;
      if (
        activeSession.gameMode === "image-reveal" &&
        (question.questionType !== "image" || !question.option4)
      )
        return false;
      if (
        ["quiz", "survival", "faction"].includes(mode) &&
        question.questionType === "word"
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
      if (
        editQuestionSearch.trim() &&
        !question.questionText
          .toLowerCase()
          .includes(editQuestionSearch.trim().toLowerCase())
      )
        return false;
      if (
        editQuestionCategory !== "all" &&
        question.category !== editQuestionCategory
      )
        return false;
      return (
        editQuestionDifficulty === "all" ||
        question.difficulty === editQuestionDifficulty
      );
    });
    return (
      <div className="anim-rise space-y-7">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/dashboard/sessions"
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-line bg-void-2/60 text-ink-soft transition-all hover:bg-void-2"
              aria-label="الرجوع إلى قائمة الجلسات"
              title="الرجوع إلى قائمة الجلسات"
            >
              <ArrowRight className="h-4 w-4" />
            </a>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
                <Radio className="h-5 w-5 anim-pulse-neon text-danger-bright" />
                {activeSession.title}
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                رمز الغرفة:{" "}
                <span className="font-display font-bold tracking-widest text-neon-bright">
                  {activeSession.roomCode}
                </span>
              </p>
              {activeSession.startedAt && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-gold">
                  <Clock className="h-3.5 w-3.5" /> بدأت منذ{" "}
                  <span dir="ltr" className="font-display tracking-wider">
                    {elapsedLabel}
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeSession.showScoreboard ? "primary" : "outline"}
              size="sm"
              onClick={handleToggleScoreboard}
            >
              {activeSession.showScoreboard
                ? "النتائج ظاهرة"
                : "إظهار النتائج · 6ث"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJoinQr(true)}
            >
              <QrCode className="h-4 w-4" /> دخول المتسابقين
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRecoveryQr(true)}
            >
              <KeyRound className="h-4 w-4" /> استعادة لاعب
            </Button>
            {activeSession.status === "paused" ? (
              <Button
                variant="success"
                size="sm"
                onClick={() => void handleActivateOnlyThisSession}
                disabled={activatingExclusive}
              >
                {activatingExclusive
                  ? "جاري التشغيل..."
                  : "▶ استئناف واعتماد الجلسة"}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handlePauseSession}
              >
                ⏸ إيقاف مؤقت
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleActivateOnlyThisSession}
              disabled={activatingExclusive}
            >
              {activatingExclusive
                ? "جاري الاعتماد..."
                : "اعتماد هذه الجلسة للبث وإيقاف البقية"}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleEndGame}
              disabled={endingGame}
            >
              {endingGame ? "جاري الإنهاء..." : "إنهاء وتتويج الفائزين"}
            </Button>
          </div>
        </div>

        {showJoinQr && (
          <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-void/85 p-4 pt-16 backdrop-blur-md sm:pt-20"
            onClick={() => setShowJoinQr(false)}
          >
            <Card
              strong
              className="w-full max-w-sm space-y-5 p-6 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">
                  دخول المتسابقين
                </span>
                <button
                  onClick={() => setShowJoinQr(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs leading-6 text-ink-mute">
                امسح الرمز بالكاميرا للانضمام مباشرة إلى الغرفة.
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                <QRCodeSVG value={joinUrl} size={210} level="M" includeMargin />
              </div>
              <div className="rounded-xl border border-neon/25 bg-neon/10 p-3">
                <p className="text-[10px] text-ink-mute">رمز الغرفة</p>
                <p className="mt-1 font-display text-2xl font-black tracking-[.25em] text-neon-bright">
                  {activeSession.roomCode}
                </p>
              </div>
              <p
                dir="ltr"
                className="truncate rounded-lg border border-line bg-void/50 px-3 py-2 text-[10px] text-ink-mute"
              >
                {joinUrl}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(joinUrl);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  <Copy className="h-4 w-4" />{" "}
                  {linkCopied ? "تم النسخ" : "نسخ الرابط"}
                </Button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-success px-3 py-2 text-xs font-bold text-white transition hover:opacity-90"
                >
                  <Share2 className="h-4 w-4" /> واتساب
                </a>
              </div>
            </Card>
          </div>
        )}

        {showRecoveryQr && (
          <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-void/85 p-4 pt-16 backdrop-blur-md sm:pt-20"
            onClick={() => setShowRecoveryQr(false)}
          >
            <Card
              strong
              className="w-full max-w-sm space-y-5 p-6 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">
                  استعادة لاعب من جهاز آخر
                </span>
                <button
                  onClick={() => setShowRecoveryQr(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs leading-6 text-ink-mute">
                أرسل هذا الرابط أو الباركود للمتسابق، ثم زوّده برمزه الشخصي
                الظاهر لك في قائمة اللاعبين.
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                <QRCodeSVG
                  value={recoveryUrl}
                  size={210}
                  level="M"
                  includeMargin
                />
              </div>
              <p
                dir="ltr"
                className="truncate rounded-lg border border-line bg-void/50 px-3 py-2 text-[10px] text-ink-mute"
              >
                {recoveryUrl}
              </p>
              <Button
                variant="ghost"
                size="sm"
                fullWidth
                onClick={() => {
                  void navigator.clipboard.writeText(recoveryUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }}
              >
                <Copy className="h-4 w-4" />{" "}
                {linkCopied ? "تم النسخ" : "نسخ رابط الاستعادة"}
              </Button>
            </Card>
          </div>
        )}

        {showTvQr && (
          <div
            className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-void/85 p-4 pt-16 backdrop-blur-md sm:pt-20"
            onClick={() => setShowTvQr(false)}
          >
            <Card
              strong
              className="w-full max-w-sm space-y-5 p-6 text-center"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-ink">
                  شاشة العرض التلفزيونية
                </span>
                <button
                  onClick={() => setShowTvQr(false)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-white/5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs leading-6 text-ink-mute">
                افتح الرابط على شاشة البروجكتر أو امسح الباركود من جهاز العرض.
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                <QRCodeSVG value={tvUrl} size={210} level="M" includeMargin />
              </div>
              <div className="rounded-xl border border-cyan/25 bg-cyan/10 p-3">
                <p className="text-[10px] text-ink-mute">رابط شاشة التلفزيون</p>
                <p dir="ltr" className="mt-1 truncate text-[10px] text-cyan">
                  {tvUrl}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(tvUrl);
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                >
                  <Copy className="h-4 w-4" />{" "}
                  {linkCopied ? "تم النسخ" : "نسخ الرابط"}
                </Button>
                <a
                  href={tvUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-cyan px-3 py-2 text-xs font-bold text-void transition hover:opacity-90"
                >
                  <Radio className="h-4 w-4" /> فتح الشاشة
                </a>
              </div>
            </Card>
          </div>
        )}

        {showRoundResults &&
          (currentQuestion ||
            ["baathra", "top10"].includes(activeSession.gameMode || "")) &&
          activeSession.gameMode !== "chairs" && (
            <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-void/85 p-6 pt-16 text-center backdrop-blur-md sm:pt-20">
              <Card
                strong
                className={cn(
                  "anim-rise w-full max-w-xl space-y-5 p-7",
                  Boolean(activeSession.roundWinners?.length) &&
                    "winner-celebration",
                )}
              >
                <p className="text-3xl font-black text-gradient-gold">
                  نتائج الجولة
                </p>
                {activeSession.gameMode === "baathra" &&
                activeSession.baathraMode === "requests" ? (
                  <div className="space-y-2 text-right">
                    <p className="text-center text-sm font-bold text-ink-mute">
                      نتيجة تصحيح الإجابات
                    </p>
                    {activeSession.baathraRequestResults?.map((result) => (
                      <div
                        key={result.playerId}
                        className="flex items-center justify-between rounded-xl border border-line bg-white/5 px-4 py-3"
                      >
                        <span
                          className="font-bold"
                          style={{ color: result.color }}
                        >
                          {result.name}
                        </span>
                        <span
                          className={cn(
                            "text-sm font-black",
                            result.approved > 0
                              ? "text-success-bright"
                              : "text-danger-bright",
                          )}
                        >
                          {result.approved > 0
                            ? `✓ ${result.approved} صحيحة${result.rejected ? ` • ${result.rejected} خاطئة` : ""}${result.speedBonus ? " • ⚡ +1 سرعة" : ""}`
                            : "✕ الإجابة خاطئة"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-ink-mute">الإجابة الصحيحة</p>
                    <p className="mt-1 text-2xl font-black text-success-bright">
                      {activeSession.gameMode === "baathra"
                        ? decodeWordSecret(activeSession.baathraSecret)
                        : activeSession.gameMode === "top10"
                          ? "تم اعتماد قائمة TOP 10"
                          : (currentQuestion as any)?.[
                              `option${activeSession.revealedCorrectOption}`
                            ]}
                    </p>
                  </div>
                )}
                {activeSession.roundWinners?.length ? (
                  <div className="grid grid-cols-3 gap-3">
                    {activeSession.roundWinners.map((winner, index) => (
                      <div
                        key={winner.playerId}
                        className="anim-winner-card rounded-2xl border border-line bg-white/5 p-4"
                        style={{ animationDelay: `${index * 90}ms` }}
                      >
                        <p className="font-display text-lg text-gold">
                          #{index + 1}
                        </p>
                        <p
                          className="mt-2 truncate text-sm font-bold"
                          style={{ color: winner.color }}
                        >
                          {winner.name}
                        </p>
                        <p className="mt-2 text-xs font-bold text-success-bright">
                          +{winner.scoreAdded}{" "}
                          {activeSession.gameMode === "money" ? "مبلغ" : "نقطة"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="anim-count-pop text-7xl font-black text-danger-bright">
                      ✕
                    </div>
                    <p className="text-sm font-bold text-danger-bright">
                      لا توجد إجابات صحيحة في هذه الجولة.
                    </p>
                  </div>
                )}
                <button
                  onClick={() => setShowRoundResults(false)}
                  className="text-xs font-bold text-ink-mute hover:text-ink"
                >
                  إغلاق
                </button>
              </Card>
            </div>
          )}

        {activeSession.status === "waiting" && (
          <Card
            glow="subtle"
            className="overflow-hidden border-danger/35 bg-gradient-to-l from-danger/10 to-void-2/70 p-6 text-center"
          >
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-danger-bright">
              غرفة الانتظار
            </p>
            <h3 className="mt-2 text-2xl font-extrabold text-ink">
              للانضمام إلى {activeSession.title}
            </h3>
            <p className="mt-2 text-sm text-ink-mute">
              شارك رمز الغرفة{" "}
              <strong className="font-display tracking-[0.2em] text-neon-bright">
                {activeSession.roomCode}
              </strong>{" "}
              مع المتسابقين.
            </p>
            <div className="mt-5">
              <span className="font-display text-5xl font-black text-danger-bright">
                {players.length}
              </span>
              <span className="mr-2 text-xs text-ink-mute">لاعب انضم</span>
            </div>
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
              {players.length === 0 ? (
                <span className="text-xs text-ink-mute">
                  بانتظار أول متسابق...
                </span>
              ) : (
                players.map((player) => (
                  <span
                    key={player.id}
                    className="flex items-center gap-2 rounded-full border border-line bg-void/60 px-3 py-2 text-xs font-bold text-ink-soft"
                  >
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: player.color }}
                    />
                    {player.name}
                  </span>
                ))
              )}
            </div>
            <Button
              variant="success"
              size="lg"
              className="mt-7"
              onClick={handleStartAndLockJoining}
              disabled={players.length === 0}
            >
              ▶ بدء الجولة وإغلاق الانضمام
            </Button>
          </Card>
        )}

        <div className="flex flex-wrap gap-2 border-b border-line pb-4">
          {[
            { id: "control" as const, label: "التحكم" },
            { id: "questions" as const, label: "الأسئلة" },
            { id: "players" as const, label: `اللاعبون (${players.length})` },
            { id: "settings" as const, label: "التعديلات" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-bold transition-all",
                activeTab === tab.id
                  ? "border-neon/40 bg-neon/10 text-neon-bright shadow-[var(--shadow-neon-soft)]"
                  : "border-line bg-void/30 text-ink-mute hover:text-ink",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "settings" && (
          <div className="space-y-6">
            <Card className="p-6">
              <CardHeader
                title="تعديل إعدادات الجلسة"
                icon={<Clock className="h-5 w-5" />}
                accent="neon"
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="اسم التحدي">
                  <Input
                    value={editSessionTitle}
                    onChange={(event) =>
                      setEditSessionTitle(event.target.value)
                    }
                  />
                </Field>
                <Field label="مدة كل سؤال">
                  <Select
                    value={editSessionTimer}
                    onChange={(event) =>
                      setEditSessionTimer(Number(event.target.value))
                    }
                  >
                    <option value={5}>5 ثوانٍ</option>
                    <option value={10}>10 ثوانٍ</option>
                    <option value={15}>15 ثانية</option>
                    <option value={20}>20 ثانية</option>
                    <option value={30}>30 ثانية</option>
                    <option value={45}>45 ثانية</option>
                    <option value={60}>60 ثانية</option>
                    <option value={90}>90 ثانية</option>
                  </Select>
                </Field>
              </div>
              <p className="mt-3 text-xs text-ink-mute">
                المدة الجديدة تُطبق على الأسئلة التي تُطرح بعد الحفظ، ولا تغيّر
                مؤقت سؤال معروض حالياً.
              </p>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="success"
                  onClick={() => void handleSaveSessionEdits()}
                >
                  حفظ التعديلات
                </Button>
              </div>
            </Card>
            {activeSession.gameMode === "money" && (
              <Card className="space-y-6 p-6">
                <CardHeader
                  title="تعديل لوحة فلوسك على المحك"
                  icon={<Sparkles className="h-5 w-5" />}
                  accent="gold"
                />
                <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-gold">
                        اختر 5 تصنيفات بالضبط
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        ثم اختر خمسة أسئلة لكل تصنيف، أو استخدم التعبئة
                        التلقائية.
                      </p>
                    </div>
                    <span className="font-display text-2xl font-black text-gold">
                      {moneyEditCategories.length} / 5
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {moneyEditAvailableCategories.map((selectedCategory) => {
                      const selected =
                        moneyEditCategories.includes(selectedCategory);
                      return (
                        <button
                          key={selectedCategory}
                          type="button"
                          onClick={() =>
                            toggleMoneyEditCategory(selectedCategory)
                          }
                          className={cn(
                            "flex items-center justify-between rounded-xl border px-3 py-3 text-xs font-bold transition-all",
                            selected
                              ? "border-gold/50 bg-gold/15 text-gold"
                              : "border-line bg-void/35 text-ink-mute",
                          )}
                        >
                          {selectedCategory}
                          <span>{selected ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="المبالغ من الأسهل إلى الأصعب">
                    <div className="grid grid-cols-5 gap-2" dir="ltr">
                      {moneyEditValues.map((value, index) => (
                        <Input
                          key={index}
                          type="number"
                          min={1}
                          value={value}
                          onChange={(event) =>
                            setMoneyEditValues((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? Math.max(1, Number(event.target.value) || 1)
                                  : item,
                              ),
                            )
                          }
                          className="text-center font-display text-gold"
                        />
                      ))}
                    </div>
                  </Field>
                  <Field label="طريقة اعتماد الإجابات">
                    <Select
                      value={moneyEditScoring}
                      onChange={(event) =>
                        setMoneyEditScoring(
                          event.target.value as "fastest" | "ranked",
                        )
                      }
                    >
                      <option value="ranked">
                        كل الإجابات الصحيحة حسب السرعة
                      </option>
                      <option value="fastest">أول إجابة صحيحة فقط</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neon/25 bg-neon/5 p-4">
                  <p className="text-xs text-ink-mute">
                    التلقائي يرتب من السهل إلى الصعب، والعشوائي يغيّر المجموعة
                    مع إبقاء ترتيب الصعوبة.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="success"
                      onClick={() => fillAllMoneyEditCategories(false)}
                    >
                      تعبئة تلقائية
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fillAllMoneyEditCategories(true)}
                    >
                      <Shuffle className="h-4 w-4" /> عشوائي
                    </Button>
                  </div>
                </div>
                <div className="space-y-5">
                  {moneyEditCategories.map((selectedCategory) => {
                    const pool = getMoneyEditPool(selectedCategory);
                    const selections = moneyEditSelections[
                      selectedCategory
                    ] || ["", "", "", "", ""];
                    return (
                      <section
                        key={selectedCategory}
                        className="rounded-2xl border border-line bg-void/30 p-4"
                      >
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-black text-ink">
                            {selectedCategory}
                          </h3>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="success"
                              onClick={() =>
                                fillMoneyEditCategory(selectedCategory, false)
                              }
                            >
                              تلقائي
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                fillMoneyEditCategory(selectedCategory, true)
                              }
                            >
                              عشوائي
                            </Button>
                            <span className="text-xs font-bold text-gold">
                              {selections.filter(Boolean).length}/5
                            </span>
                          </div>
                        </div>
                        <div className="grid gap-3">
                          {moneyEditValues.map((value, index) => {
                            const selectedQuestion = pool.find(
                              (question) => question.id === selections[index],
                            );
                            const selectedElsewhere = new Set(
                              selections.filter(
                                (questionId, selectionIndex) =>
                                  selectionIndex !== index && questionId,
                              ),
                            );
                            return (
                              <div
                                key={`${selectedCategory}-${index}`}
                                className="grid items-center gap-2 sm:grid-cols-[90px_70px_1fr]"
                              >
                                <span className="rounded-xl border border-gold/30 bg-gold/10 px-2 py-3 text-center font-display font-black text-gold">
                                  {value}
                                </span>
                                {selectedQuestion?.imageUrl ? (
                                  <img
                                    src={selectedQuestion.imageUrl}
                                    alt="صورة السؤال"
                                    className="h-14 w-[70px] rounded-lg border border-line bg-white object-contain"
                                  />
                                ) : (
                                  <span className="grid h-14 w-[70px] place-items-center rounded-lg border border-line bg-void/45 text-xl">
                                    ❔
                                  </span>
                                )}
                                <Select
                                  value={selections[index] || ""}
                                  onChange={(event) =>
                                    setMoneyEditQuestionAt(
                                      selectedCategory,
                                      index,
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="">اختر السؤال...</option>
                                  {pool.map((question) => (
                                    <option
                                      key={question.id}
                                      value={question.id}
                                      disabled={selectedElsewhere.has(
                                        question.id,
                                      )}
                                    >
                                      {question.questionType === "image"
                                        ? "🖼️ "
                                        : ""}
                                      {question.questionText} —{" "}
                                      {question.difficulty === "easy"
                                        ? "سهل"
                                        : question.difficulty === "medium"
                                          ? "متوسط"
                                          : "صعب"}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="success"
                    onClick={() => void handleSaveMoneyBoard()}
                    disabled={savingMoneyBoard}
                  >
                    {savingMoneyBoard
                      ? "جاري حفظ اللوحة..."
                      : "حفظ التصنيفات والأسئلة والمبالغ"}
                  </Button>
                </div>
              </Card>
            )}
            {activeSession.gameMode === "top10" && (
              <Card className="space-y-5 p-6">
                <CardHeader
                  title="تعديل سؤال TOP 10"
                  icon={<Sparkles className="h-5 w-5" />}
                  accent="cyan"
                />
                <p className="text-xs leading-6 text-ink-mute">
                  اختر سؤالاً عشوائياً أو محدداً من بنك TOP 10، أو اكتب سؤالاً
                  مخصصاً. الحفظ يعيد البطاقات العشر إلى حالة غير مكشوفة.
                </p>
                <Top10BankPicker
                  questions={top10Questions}
                  mode={top10EditMode}
                  onModeChange={(mode) => {
                    setTop10EditMode(mode);
                    if (mode === "custom") setTop10EditSelectedId("");
                  }}
                  selectedId={top10EditSelectedId}
                  onChooseQuestion={applyTop10EditQuestion}
                  prompt={top10EditPrompt}
                  onPromptChange={setTop10EditPrompt}
                  entries={top10EditEntries}
                  onEntriesChange={setTop10EditEntries}
                />
                <div className="flex justify-end">
                  <Button
                    variant="success"
                    onClick={() => void handleSaveTop10Settings()}
                    disabled={savingTop10}
                  >
                    {savingTop10 ? "جاري الحفظ..." : "حفظ إعدادات TOP 10"}
                  </Button>
                </div>
              </Card>
            )}
            {!["money", "top10"].includes(activeSession.gameMode || "") && (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-5">
                  <CardHeader
                    title={`أسئلة الجلسة (${activeQuestions.length})`}
                    accent="cyan"
                  />
                  <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
                    {activeQuestions.map((question) => (
                      <div
                        key={question.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-line bg-void/35 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2.5">
                            {question.imageUrl && (
                              <img
                                src={question.imageUrl}
                                alt="صورة السؤال"
                                className="h-14 w-20 shrink-0 rounded-lg border border-line object-cover"
                              />
                            )}
                            <p className="text-xs font-bold leading-5 text-ink">
                              {question.questionText}
                            </p>
                          </div>
                          <div className="mt-1 flex gap-2">
                            <CategoryIcon category={question.category} />
                            <DifficultyBadge difficulty={question.difficulty} />
                          </div>
                          <p className="mt-2 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1.5 text-[11px] font-extrabold text-success-bright">
                            الإجابة الصحيحة:{" "}
                            {question.questionType === "word"
                              ? question.answerWord || question.option1
                              : question[
                                  `option${question.correctOption}` as keyof Question
                                ] || "غير محددة"}
                          </p>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={
                            usedQuestionIds.has(question.id) ||
                            activeSession.currentQuestionId === question.id
                          }
                          onClick={() =>
                            void handleRemoveQuestionFromExistingSession(
                              question,
                            )
                          }
                        >
                          حذف من الجلسة
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card className="p-5">
                  <CardHeader title="إضافة أسئلة من البنك" accent="neon" />
                  <div className="mt-3 rounded-xl border border-success/25 bg-success/5 px-4 py-3">
                    <p className="text-xs font-extrabold text-success-bright">
                      تُطبق صلاحيات أسئلة هذه اللعبة تلقائياً ✓
                    </p>
                    <p className="mt-1 text-[10px] leading-5 text-ink-mute">
                      لن تظهر هنا إلا أنواع الأسئلة والتصنيفات التي سمح بها
                      المدير للعبة «
                      {getGameModeLabel(activeSession.gameMode).label}».
                    </p>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <Input
                      value={editQuestionSearch}
                      onChange={(event) =>
                        setEditQuestionSearch(event.target.value)
                      }
                      placeholder="ابحث عن سؤال..."
                      icon={<Search className="h-4 w-4" />}
                    />
                    <Select
                      value={editQuestionCategory}
                      onChange={(event) =>
                        setEditQuestionCategory(event.target.value)
                      }
                    >
                      <option value="all">كل التصنيفات</option>
                      {[
                        ...new Set(
                          questions.map((question) => question.category),
                        ),
                      ].map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={editQuestionDifficulty}
                      onChange={(event) =>
                        setEditQuestionDifficulty(event.target.value)
                      }
                    >
                      <option value="all">كل الصعوبات</option>
                      <option value="easy">سهل</option>
                      <option value="medium">متوسط</option>
                      <option value="hard">صعب</option>
                    </Select>
                  </div>
                  <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto">
                    {addableSessionQuestions.length === 0 ? (
                      <p className="py-8 text-center text-xs text-ink-mute">
                        لا توجد أسئلة إضافية تطابق البحث.
                      </p>
                    ) : (
                      addableSessionQuestions.map((question) => (
                        <div
                          key={question.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-void/35 p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2.5">
                              {question.imageUrl && (
                                <img
                                  src={question.imageUrl}
                                  alt="صورة السؤال"
                                  className="h-14 w-20 shrink-0 rounded-lg border border-line object-cover"
                                />
                              )}
                              <p className="text-xs font-bold leading-5 text-ink">
                                {question.questionText}
                              </p>
                            </div>
                            <div className="mt-1 flex gap-2">
                              <CategoryIcon category={question.category} />
                              <DifficultyBadge
                                difficulty={question.difficulty}
                              />
                            </div>
                            <p className="mt-2 rounded-lg border border-success/30 bg-success/10 px-2.5 py-1.5 text-[11px] font-extrabold text-success-bright">
                              الإجابة الصحيحة:{" "}
                              {question.questionType === "word"
                                ? question.answerWord || question.option1
                                : question[
                                    `option${question.correctOption}` as keyof Question
                                  ] || "غير محددة"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              void handleAddQuestionToExistingSession(question)
                            }
                          >
                            <Plus className="h-3.5 w-3.5" /> إضافة
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            "grid grid-cols-1 gap-7 lg:grid-cols-3",
            activeTab === "settings" && "hidden",
          )}
        >
          {/* Left: current question + bank */}
          <div
            className={cn(
              "space-y-6 lg:col-span-2",
              activeTab === "players" && "hidden",
            )}
          >
            {activeSession.gameMode === "top10" && activeTab === "control" && (
              <Card glow="subtle" className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-cyan">TOP 10</p>
                    <h3 className="mt-1 text-xl font-black text-ink">
                      {activeSession.top10Prompt}
                    </h3>
                  </div>
                  {activeSession.questionStatus === "showing" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleFinishTop10Round(false)}
                      >
                        إنهاء الجولة
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleFinishTop10Round(true)}
                      >
                        👁 كشف الكل
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="success"
                      onClick={() => void handleStartTop10Round()}
                      disabled={
                        players.filter((player) => player.isActive).length === 0
                      }
                    >
                      ▶ بدء جولة TOP 10
                    </Button>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-5">
                  {(activeSession.top10Items || []).map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "anim-option-enter rounded-xl border p-3 text-center",
                        item.foundById
                          ? "border-success/40 bg-success/10"
                          : "border-gold/25 bg-gold/5",
                      )}
                      style={{ animationDelay: `${index * 45}ms` }}
                    >
                      <p className="font-display text-lg font-black text-gold">
                        #{index + 1} • {item.points}
                      </p>
                      <p className="mt-2 text-sm font-black text-ink">
                        {item.answer}
                      </p>
                      {item.aliases.length > 0 && (
                        <p className="mt-1 line-clamp-2 text-[9px] text-ink-mute">
                          {item.aliases.join("، ")}
                        </p>
                      )}
                      <p
                        className={cn(
                          "mt-2 text-[10px] font-bold",
                          item.foundById
                            ? "text-success-bright"
                            : "text-ink-faint",
                        )}
                      >
                        {item.foundByName || "لم تُكتشف"}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-line bg-void/35 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-ink">سجل الإجابات الحي</p>
                    <span className="text-xs font-bold text-cyan">
                      {questionAnswers.length} محاولة
                    </span>
                  </div>
                  <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
                    {questionAnswers.length === 0 ? (
                      <p className="py-5 text-center text-xs text-ink-mute">
                        ستظهر محاولات المتسابقين هنا فوراً.
                      </p>
                    ) : (
                      [...questionAnswers]
                        .sort(
                          (first, second) =>
                            getTimestampMillis(second.createdAt) -
                            getTimestampMillis(first.createdAt),
                        )
                        .map((answer) => {
                          const contestant = players.find(
                            (player) => player.id === answer.playerId,
                          );
                          return (
                            <div
                              key={answer.id}
                              className={cn(
                                "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs",
                                answer.top10Status === "captured"
                                  ? "border-success/30 bg-success/10"
                                  : answer.top10Status === "taken"
                                    ? "border-gold/30 bg-gold/10"
                                    : "border-danger/20 bg-danger/5",
                              )}
                            >
                              <span className="truncate font-bold text-ink">
                                {contestant?.name || "متسابق"}:{" "}
                                {answer.top10TextAnswer}
                              </span>
                              <span className="shrink-0 font-black">
                                {answer.top10Status === "captured"
                                  ? `✓ +${answer.top10Points || 0}`
                                  : answer.top10Status === "taken"
                                    ? "سبقوه عليها"
                                    : "✕"}
                              </span>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </Card>
            )}
            {activeSession.gameMode === "money" && activeTab === "control" && (
              <Card glow="subtle" className="overflow-hidden p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-gold">
                      لوحة فلوسك على المحك
                    </h3>
                    <p className="mt-1 text-xs text-ink-mute">
                      اختر أي مربع لطرح السؤال. الأزرق متاح والرمادي مستخدم.
                    </p>
                  </div>
                  {activeMoneyCell && (
                    <span className="anim-count-pop rounded-xl border border-gold/40 bg-gold/15 px-4 py-2 font-display font-black text-gold">
                      {activeMoneyCell.category} • {activeMoneyCell.value}
                    </span>
                  )}
                </div>
                <div className="mt-5 overflow-x-auto pb-2">
                  <div
                    className="grid min-w-[720px] gap-2"
                    style={{
                      gridTemplateColumns: `repeat(${Math.max(1, moneyBoardCategories.length)}, minmax(130px, 1fr))`,
                    }}
                  >
                    {moneyBoardCategories.map((moneyCategory) => (
                      <div key={moneyCategory} className="space-y-2">
                        <div className="rounded-xl border border-line bg-void-2 px-2 py-3 text-center text-xs font-black text-gold">
                          {moneyCategory}
                        </div>
                        {(activeSession.moneyBoard || [])
                          .filter((cell) => cell.category === moneyCategory)
                          .sort((first, second) => first.value - second.value)
                          .map((cell, index) => {
                            const available = cell.status === "available";
                            const open = cell.status === "open";
                            return (
                              <button
                                key={cell.id}
                                type="button"
                                onClick={() =>
                                  void handleShowQuestion(cell.questionId)
                                }
                                disabled={
                                  !available ||
                                  activeSession.questionStatus === "showing"
                                }
                                className={cn(
                                  "anim-option-enter flex h-20 w-full items-center justify-center rounded-xl border font-display text-2xl font-black transition-all",
                                  available &&
                                    "border-cyan/45 bg-gradient-to-b from-cyan/75 to-cyan/45 text-void shadow-[var(--shadow-cyan)] hover:-translate-y-0.5 hover:brightness-110",
                                  open &&
                                    "border-gold bg-gold/25 text-gold anim-pulse-neon",
                                  cell.status === "used" &&
                                    "cursor-not-allowed border-line bg-white/5 text-ink-faint opacity-35",
                                )}
                                style={{ animationDelay: `${index * 45}ms` }}
                              >
                                {cell.status === "used" ? "✓" : cell.value}
                              </button>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {moneyStandings.slice(0, 3).map((contestant, index) => (
                    <div
                      key={contestant.id}
                      className="anim-winner-card flex items-center justify-between rounded-xl border border-line bg-white/5 px-3 py-2"
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <span className="truncate text-xs font-bold text-ink">
                        {index + 1}. {contestant.name}
                      </span>
                      <span className="font-display font-black text-success-bright">
                        {contestant.score || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card
              glow="neon"
              className={cn("p-6", activeTab !== "control" && "hidden")}
            >
              <CardHeader title="السؤال النشط حالياً" accent="neon" />

              {["word", "tarkeeba"].includes(activeSession.gameMode || "") && (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-cyan/25 bg-cyan/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-cyan">لوحة تدريب الحروف</p>
                    <p className="mt-1 text-xs leading-6 text-ink-mute">
                      اعرض لوحة المفاتيح قبل بدء الكلمة ليحفظ المتسابقون أماكن
                      الحروف.
                    </p>
                  </div>
                  <Button
                    variant={
                      activeSession.wordKeyboardPreview ? "success" : "outline"
                    }
                    size="sm"
                    onClick={() => void handleToggleWordKeyboardPreview()}
                  >
                    {activeSession.wordKeyboardPreview
                      ? "إخفاء لوحة التدريب"
                      : "إظهار لوحة التدريب للمتسابقين"}
                  </Button>
                </div>
              )}

              {activeSession.gameMode === "tarkeeba" && (
                <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-gold/25 bg-gold/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-gold">نص سؤال تركيبة</p>
                    <p className="mt-1 text-xs text-ink-mute">
                      تحكم في ظهور نص السؤال أعلى لوحة المتسابق.
                    </p>
                  </div>
                  <Button
                    variant={
                      activeSession.tarkeebaShowQuestion === false
                        ? "outline"
                        : "success"
                    }
                    size="sm"
                    onClick={() => void handleToggleTarkeebaQuestion()}
                  >
                    {activeSession.tarkeebaShowQuestion === false
                      ? "إظهار السؤال"
                      : "إخفاء السؤال"}
                  </Button>
                </div>
              )}

              {activeSession.questionStatus === "showing" &&
                currentQuestion &&
                !["chairs", "impostor", "roulette"].includes(
                  activeSession.gameMode || "quiz",
                ) && (
                  <div className="mt-5 rounded-2xl border border-neon/30 bg-neon/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-xl border border-danger/35 bg-danger/10 text-danger-bright">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold tracking-[.16em] text-ink-mute">
                            متابعة الإجابات المباشرة
                          </p>
                          <p className="mt-1 text-xs font-bold text-ink-soft">
                            <span className="font-display text-neon-bright">
                              {answersCount}
                            </span>{" "}
                            أجابوا •{" "}
                            <span className="font-display text-gold">
                              {Math.max(0, roundPlayers.length - answersCount)}
                            </span>{" "}
                            بانتظار الإجابة
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-xl border px-3 py-2 font-display text-xl font-black",
                            activeSession.practiceQuestion
                              ? "border-gold/40 bg-gold/10 text-gold"
                              : questionSecondsLeft <= 10
                                ? "border-danger/40 bg-danger/10 text-danger-bright"
                                : "border-cyan/30 bg-cyan/10 text-cyan",
                          )}
                        >
                          {activeSession.practiceQuestion
                            ? "وقت مفتوح"
                            : `${questionSecondsLeft}ث`}
                        </span>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={handleRevealAnswer}
                        >
                          {activeSession.gameMode === "money"
                            ? "اعتماد الإجابات وحساب المبالغ"
                            : "إنهاء وكشف الإجابة"}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid max-h-44 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                      {roundPlayers.map((player) => {
                        const answer = answersByPlayer.get(player.id);
                        return (
                          <div
                            key={player.id}
                            className={cn(
                              "flex items-center justify-between rounded-xl border px-3 py-2 text-xs",
                              answer
                                ? "border-success/25 bg-success/5"
                                : "border-line bg-void/35",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: player.color }}
                              />
                              <span className="truncate font-bold text-ink">
                                {player.name}
                              </span>
                              {player.usedFiftyFifty && (
                                <Scissors
                                  className="h-3.5 w-3.5 shrink-0 text-magenta"
                                  aria-label="استخدم حذف إجابتين"
                                />
                              )}
                              {player.usedTimeExtension && (
                                <PlusCircle
                                  className="h-3.5 w-3.5 shrink-0 text-cyan"
                                  aria-label="استخدم تمديد الوقت"
                                />
                              )}
                            </span>
                            {answer ? (
                              activeSession.questionStatus === "revealed" ? (
                                answer.isCorrect ? (
                                  <span className="flex shrink-0 items-center gap-1 font-bold text-success-bright">
                                    <CheckCircle2 className="h-4 w-4" /> صحيح
                                  </span>
                                ) : (
                                  <span className="flex shrink-0 items-center gap-1 font-bold text-danger-bright">
                                    <X className="h-4 w-4" /> خطأ
                                  </span>
                                )
                              ) : (
                                <span
                                  className={cn(
                                    "flex shrink-0 items-center gap-1 font-bold",
                                    ["word", "tarkeeba"].includes(
                                      activeSession.gameMode || "",
                                    ) && !answer.isCorrect
                                      ? "text-danger-bright"
                                      : "text-success-bright",
                                  )}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />{" "}
                                  {["word", "tarkeeba"].includes(
                                    activeSession.gameMode || "",
                                  )
                                    ? answer.isCorrect
                                      ? "اكتشفها"
                                      : "نفدت المحاولات"
                                    : "أجاب"}
                                </span>
                              )
                            ) : (
                              <span className="flex shrink-0 items-center gap-1 text-ink-mute">
                                <Hourglass className="h-3.5 w-3.5" /> ينتظر
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              {activeSession.gameMode === "chairs" ? (
                <div className="mt-5 space-y-5 text-center">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl border border-gold/35 bg-gold/10 text-gold shadow-[var(--shadow-gold)]">
                    <Armchair className="h-10 w-10" />
                  </div>
                  <div>
                    <h4 className="text-xl font-extrabold text-ink">
                      كراسي السرعة — الجولة {activeSession.chairRound || 1}
                    </h4>
                    <p className="mt-2 text-sm text-ink-mute">
                      ابدأ الدوران، ثم أطلق أمر «اجلس» فجأة. أسرع{" "}
                      {activeSession.chairCount || 0} متسابقين يحجزون الكراسي.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {Array.from(
                      { length: activeSession.chairCount || 0 },
                      (_, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-gold/25 bg-gold/5 p-4"
                        >
                          <Armchair className="mx-auto h-6 w-6 text-gold" />
                          <p className="mt-2 font-display text-lg font-extrabold text-ink">
                            {index + 1}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 border-t border-line pt-4 text-xs text-ink-mute">
                    <span>
                      الضغطات المسجلة:{" "}
                      <strong className="font-display text-neon-bright">
                        {answersCount}
                      </strong>{" "}
                      / {activeSession.questionPlayerIds?.length || 0}
                    </span>
                    {(!activeSession.chairPhase ||
                      ["idle", "revealed"].includes(
                        activeSession.chairPhase,
                      )) && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void handleStartChairRound(false)}
                        >
                          🟡 بدء الدوران
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleStartChairRound(true)}
                        >
                          🎲 دوران وإيقاف عشوائي
                        </Button>
                      </>
                    )}
                    {activeSession.chairPhase === "spinning" && (
                      <>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => void handleTriggerChairRound()}
                        >
                          🔴 إيقاف فجائي — اجلس الآن!
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleFakeChairStop()}
                        >
                          🟠 إيقاف وهمي
                        </Button>
                      </>
                    )}
                    {activeSession.chairPhase === "fake" && (
                      <span className="font-bold text-orange-400">
                        إيقاف وهمي قيد العرض… لا تُفتح الكراسي.
                      </span>
                    )}
                    {activeSession.chairPhase === "ready" && (
                      <>
                        <span className="font-bold text-success-bright">
                          الكراسي مفتوحة الآن!
                        </span>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={handleRevealAnswer}
                        >
                          إنهاء الجولة وإعلان النتائج
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : activeSession.gameMode === "baathra" ? (
                <div className="mt-5 space-y-4 text-center">
                  <div className="text-5xl">🔀</div>
                  <h4 className="text-xl font-extrabold text-ink">
                    لعبة بعثرة
                  </h4>
                  <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-neon/25 bg-neon/5 p-4 text-right">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={activeSession.questionStatus === "showing"}
                        onClick={() => setBaathraControlMode("speed")}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-xs font-extrabold",
                          baathraControlMode === "speed"
                            ? "border-cyan/45 bg-cyan/15 text-cyan"
                            : "border-line text-ink-mute",
                        )}
                      >
                        كتابة سريعة
                      </button>
                      <button
                        type="button"
                        disabled={activeSession.questionStatus === "showing"}
                        onClick={() => setBaathraControlMode("requests")}
                        className={cn(
                          "rounded-xl border px-3 py-3 text-xs font-extrabold",
                          baathraControlMode === "requests"
                            ? "border-magenta/45 bg-magenta/15 text-magenta"
                            : "border-line text-ink-mute",
                        )}
                      >
                        كوّن اسماً
                      </button>
                    </div>
                    {baathraControlMode === "speed" ? (
                      <>
                        <Field label="كلمة الجولة">
                          <Input
                            value={baathraControlWord}
                            disabled={
                              activeSession.questionStatus === "showing"
                            }
                            placeholder="مثال: تفاحة"
                            onChange={(event) =>
                              setBaathraControlWord(event.target.value)
                            }
                            className="text-center text-lg font-extrabold"
                          />
                        </Field>
                        <Field label="أو استدعِ إجابة من بنك الأسئلة (5 أحرف)">
                          <Select
                            value=""
                            disabled={
                              activeSession.questionStatus === "showing"
                            }
                            onChange={(event) =>
                              setBaathraControlWord(event.target.value)
                            }
                          >
                            <option value="">اختر كلمة جاهزة...</option>
                            {questions
                              .filter(
                                (question) =>
                                  getArabicWordLength(
                                    getTarkeebaAnswer(question),
                                  ) === 5,
                              )
                              .map((question) => (
                                <option
                                  key={question.id}
                                  value={getTarkeebaAnswer(question)}
                                >
                                  {getTarkeebaAnswer(question)} —{" "}
                                  {question.category}
                                </option>
                              ))}
                          </Select>
                        </Field>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            disabled={
                              activeSession.questionStatus === "showing"
                            }
                            onClick={() =>
                              void updateSession(activeSession.id, {
                                baathraScoring: "first",
                              })
                            }
                            className={cn(
                              "rounded-xl border px-3 py-3 text-xs font-extrabold",
                              activeSession.baathraScoring === "first"
                                ? "border-gold/45 bg-gold/15 text-gold"
                                : "border-line text-ink-mute",
                            )}
                          >
                            الأسرع
                          </button>
                          <button
                            type="button"
                            disabled={
                              activeSession.questionStatus === "showing"
                            }
                            onClick={() =>
                              void updateSession(activeSession.id, {
                                baathraScoring: "ranked",
                              })
                            }
                            className={cn(
                              "rounded-xl border px-3 py-3 text-xs font-extrabold",
                              activeSession.baathraScoring !== "first"
                                ? "border-neon/45 bg-neon/15 text-neon-bright"
                                : "border-line text-ink-mute",
                            )}
                          >
                            النقاط
                          </button>
                        </div>
                        <p className="text-[11px] leading-5 text-ink-mute">
                          {activeSession.baathraScoring === "first"
                            ? "الأسرع: تنتهي الجولة فور وصول أول إجابة، ثم تظهر إن كانت صحيحة أو خاطئة."
                            : "النقاط: تستمر الجولة حتى انتهاء الوقت، أو إجابة جميع المتسابقين، أو إنهائها من المقدم."}
                        </p>
                      </>
                    ) : (
                      <>
                        <Field label="جولة جاهزة من قاموس الأسماء">
                          <div className="flex gap-2">
                            <Select
                              value={String(baathraNameRoundId)}
                              disabled={
                                activeSession.questionStatus === "showing"
                              }
                              onChange={(event) => {
                                const roundId = Number(event.target.value);
                                setBaathraNameRoundId(roundId);
                                const round = baathraNameRounds.find(
                                  (item) => item.id === roundId,
                                );
                                if (round) {
                                  setBaathraControlLetters(round.letters);
                                  setBaathraActiveRequestIndexes([0, 1]);
                                }
                              }}
                            >
                              <option value="0">
                                إدخال يدوي — مراجعة المقدم
                              </option>
                              {availableBaathraNameRounds.map((round) => (
                                <option key={round.id} value={round.id}>
                                  جولة {round.id} — {round.letters.join(" ")}
                                </option>
                              ))}
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={
                                activeSession.questionStatus === "showing" ||
                                availableBaathraNameRounds.length === 0
                              }
                              onClick={() => {
                                const round =
                                  availableBaathraNameRounds[
                                    Math.floor(
                                      Math.random() *
                                        availableBaathraNameRounds.length,
                                    )
                                  ];
                                if (!round) return;
                                setBaathraNameRoundId(round.id);
                                setBaathraControlLetters(round.letters);
                                setBaathraActiveRequestIndexes([0, 1]);
                              }}
                            >
                              عشوائي
                            </Button>
                          </div>
                        </Field>
                        {baathraNameRoundId > 0 && (
                          <p className="rounded-xl border border-success/25 bg-success/5 px-3 py-2 text-[10px] font-bold text-success-bright">
                            الأسماء المطابقة للقاموس تُقبل تلقائياً، وغيرها تظهر
                            للمقدم للمراجعة.
                          </p>
                        )}
                        <p className="rounded-xl border border-cyan/20 bg-cyan/5 px-3 py-2 text-[10px] font-bold leading-5 text-cyan">
                          كل اسم صحيح = نقطة. وأسرع متسابق يكمل جميع الأسماء
                          المطلوبة صحيحة يحصل على نقطة سرعة إضافية ⚡
                        </p>
                        <div>
                          <p className="mb-2 text-xs font-bold text-ink-soft">
                            الحروف المتاحة — حتى 8 أحرف
                          </p>
                          <div
                            className="flex flex-wrap items-start gap-2"
                            dir="rtl"
                          >
                            {baathraControlLetters.map((letter, index) => (
                              <div
                                key={index}
                                className="flex flex-col items-center gap-1"
                              >
                                <div className="relative">
                                  <input
                                    value={letter}
                                    maxLength={1}
                                    disabled={
                                      activeSession.questionStatus === "showing"
                                    }
                                    onChange={(event) =>
                                      setBaathraControlLetters((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? event.target.value.slice(-1)
                                            : item,
                                        ),
                                      )
                                    }
                                    className="h-12 w-12 rounded-xl border border-gold/40 bg-gold/10 text-center font-display text-xl font-black text-gold outline-none focus:border-gold"
                                    aria-label={`الحرف ${index + 1}`}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      activeSession.questionStatus === "showing"
                                    }
                                    onClick={() =>
                                      setBaathraControlLetters((current) =>
                                        current.filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        ),
                                      )
                                    }
                                    className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-danger text-[10px] font-black text-white"
                                  >
                                    ×
                                  </button>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    disabled={
                                      index === 0 ||
                                      activeSession.questionStatus === "showing"
                                    }
                                    onClick={() =>
                                      setBaathraControlLetters((current) => {
                                        const next = [...current];
                                        [next[index - 1], next[index]] = [
                                          next[index],
                                          next[index - 1],
                                        ];
                                        return next;
                                      })
                                    }
                                    className="text-xs text-cyan disabled:opacity-25"
                                  >
                                    →
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      index ===
                                        baathraControlLetters.length - 1 ||
                                      activeSession.questionStatus === "showing"
                                    }
                                    onClick={() =>
                                      setBaathraControlLetters((current) => {
                                        const next = [...current];
                                        [next[index], next[index + 1]] = [
                                          next[index + 1],
                                          next[index],
                                        ];
                                        return next;
                                      })
                                    }
                                    className="text-xs text-cyan disabled:opacity-25"
                                  >
                                    ←
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button
                              type="button"
                              disabled={
                                baathraControlLetters.length >= 8 ||
                                activeSession.questionStatus === "showing"
                              }
                              onClick={() =>
                                setBaathraControlLetters((current) => [
                                  ...current,
                                  "",
                                ])
                              }
                              className="grid h-12 w-12 place-items-center rounded-xl border border-dashed border-cyan/50 bg-cyan/10 text-2xl font-black text-cyan disabled:opacity-30"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {baathraControlRequests.map((request, index) => (
                            <button
                              type="button"
                              key={index}
                              disabled={
                                activeSession.questionStatus === "showing" ||
                                Boolean(
                                  selectedBaathraReferenceRound &&
                                  !selectedBaathraReferenceRound.answers[
                                    request as keyof typeof selectedBaathraReferenceRound.answers
                                  ]?.length,
                                )
                              }
                              onClick={() =>
                                setBaathraActiveRequestIndexes((current) =>
                                  current.includes(index)
                                    ? current.filter((item) => item !== index)
                                    : current.length < 2
                                      ? [...current, index]
                                      : current,
                                )
                              }
                              className={cn(
                                "rounded-xl border px-3 py-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35",
                                baathraActiveRequestIndexes.includes(index)
                                  ? "border-magenta/50 bg-magenta/20 text-magenta"
                                  : "border-line bg-void/35 text-ink-mute grayscale",
                              )}
                            >
                              {request}
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-ink-mute">
                          اختر طلباً واحداً أو طلبين؛ المختار فقط سيظهر
                          للمتسابق.
                        </p>
                        {selectedBaathraReferenceRound && (
                          <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                            <p className="mb-1 text-xs font-extrabold text-gold">
                              الإجابات المرجعية للمقدم فقط
                            </p>
                            <p className="mb-3 text-[10px] leading-5 text-ink-mute">
                              استخدمها لتقديم تلميحات للمتسابقين. لا تظهر هذه
                              القائمة في شاشة اللاعب أو التلفزيون.
                            </p>
                            <div className="space-y-3">
                              {baathraActiveRequestIndexes.map(
                                (requestIndex) => {
                                  const request =
                                    baathraControlRequests[requestIndex];
                                  const answers =
                                    selectedBaathraReferenceRound.answers[
                                      request as keyof typeof selectedBaathraReferenceRound.answers
                                    ] || [];
                                  return (
                                    <div key={requestIndex}>
                                      <p className="mb-1.5 text-[11px] font-extrabold text-cyan">
                                        {request}
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {answers.map((answer) => (
                                          <span
                                            key={answer}
                                            className="rounded-lg border border-line bg-void/45 px-2 py-1 text-[10px] font-bold text-ink-soft"
                                          >
                                            {answer}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {Boolean(activeSession.baathraUsedRounds?.length) && (
                    <div className="mx-auto max-w-md rounded-2xl border border-line bg-void/35 p-4 text-right">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-extrabold text-ink-soft">
                          الأسئلة المستخدمة
                        </p>
                        <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-ink-mute">
                          {activeSession.baathraUsedRounds?.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {activeSession.baathraUsedRounds?.map((round) => (
                          <div
                            key={round.roundId}
                            className="flex items-center justify-between rounded-xl border border-line bg-white/5 px-3 py-2"
                          >
                            <span className="text-[11px] font-bold text-ink-mute">
                              {round.label}
                            </span>
                            <span className="text-xs font-black tracking-[0.18em] text-ink-faint">
                              {round.letters.join(" ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeSession.questionStatus === "showing" ? (
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        variant="danger"
                        onClick={handleRevealAnswer}
                        disabled={
                          activeSession.baathraMode === "requests" &&
                          baathraPendingReviewCount > 0
                        }
                      >
                        {activeSession.baathraMode === "requests" &&
                        baathraPendingReviewCount > 0
                          ? `صحّح ${baathraPendingReviewCount} إجابة أولاً`
                          : "اعتماد الإجابات وإظهار النتائج"}
                      </Button>
                      {activeSession.baathraMode === "requests" && (
                        <Button
                          variant="outline"
                          onClick={() =>
                            void handleStartNewBaathraAfterSkipping()
                          }
                        >
                          تجاوز المعلّق والعودة للاختيار
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button variant="primary" onClick={handleStartBaathra}>
                      بدء جولة بعثرة
                    </Button>
                  )}
                  {questionAnswers.length > 0 && (
                    <div className="rounded-2xl border border-success/25 bg-success/5 p-4 text-right">
                      <p className="mb-3 text-sm font-extrabold text-success-bright">
                        النتائج المباشرة
                      </p>
                      {activeSession.baathraMode === "requests" ? (
                        <div
                          className="grid gap-3 overflow-x-auto pb-2"
                          style={{
                            gridTemplateColumns: `repeat(${Math.max(1, activeSession.baathraActiveRequestIndexes?.length || 1)}, minmax(260px, 1fr))`,
                          }}
                        >
                          {(
                            activeSession.baathraActiveRequestIndexes || []
                          ).map((requestIndex) => {
                            const requestAnswers = questionAnswers.filter(
                              (answer) =>
                                answer.baathraRequestIndex === requestIndex,
                            );
                            return (
                              <div
                                key={requestIndex}
                                className="min-w-0 rounded-xl border border-magenta/25 bg-void/35 p-3"
                              >
                                <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
                                  <p className="text-sm font-extrabold text-magenta">
                                    {
                                      activeSession.baathraRequests?.[
                                        requestIndex
                                      ]
                                    }
                                  </p>
                                  <span className="rounded-full bg-magenta/10 px-2 py-1 text-[10px] font-bold text-magenta">
                                    {requestAnswers.length} إجابة
                                  </span>
                                </div>
                                {requestAnswers.length === 0 ? (
                                  <p className="py-6 text-center text-xs text-ink-faint">
                                    لم تصل إجابات بعد
                                  </p>
                                ) : (
                                  <div className="space-y-2">
                                    {requestAnswers.map((answer) => {
                                      const contestant = players.find(
                                        (player) =>
                                          player.id === answer.playerId,
                                      );
                                      return contestant ? (
                                        <div
                                          key={answer.id}
                                          className={cn(
                                            "rounded-lg border p-2.5",
                                            answer.reviewStatus === "approved"
                                              ? "border-success/30 bg-success/5"
                                              : answer.reviewStatus ===
                                                  "rejected"
                                                ? "border-danger/30 bg-danger/5"
                                                : "border-gold/25 bg-gold/5",
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span
                                              className="truncate text-[11px] font-bold"
                                              style={{
                                                color: contestant.color,
                                              }}
                                            >
                                              {contestant.name}
                                            </span>
                                            <strong className="text-sm text-ink">
                                              {answer.baathraTextAnswer}
                                            </strong>
                                          </div>
                                          {answer.reviewStatus === "pending" ? (
                                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                                              <button
                                                onClick={() =>
                                                  void handleReviewBaathraRequest(
                                                    answer,
                                                    true,
                                                  )
                                                }
                                                className="rounded-md border border-success/35 bg-success/10 py-1.5 text-[10px] font-extrabold text-success-bright"
                                              >
                                                ✓ قبول
                                              </button>
                                              <button
                                                onClick={() =>
                                                  void handleReviewBaathraRequest(
                                                    answer,
                                                    false,
                                                  )
                                                }
                                                className="rounded-md border border-danger/35 bg-danger/10 py-1.5 text-[10px] font-extrabold text-danger-bright"
                                              >
                                                ✕ رفض
                                              </button>
                                            </div>
                                          ) : (
                                            <p
                                              className={cn(
                                                "mt-2 text-center text-[10px] font-extrabold",
                                                answer.reviewStatus ===
                                                  "approved"
                                                  ? "text-success-bright"
                                                  : "text-danger-bright",
                                              )}
                                            >
                                              {answer.reviewStatus ===
                                              "approved"
                                                ? answer.reviewedAutomatically
                                                  ? "مقبولة تلقائياً ✓"
                                                  : "مقبولة ✓"
                                                : "مرفوضة ✕"}
                                            </p>
                                          )}
                                        </div>
                                      ) : null;
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {[...questionAnswers]
                            .sort(
                              (a, b) =>
                                Number(b.isCorrect) - Number(a.isCorrect) ||
                                (a.timeSpent || 0) - (b.timeSpent || 0),
                            )
                            .map((answer) => {
                              const contestant = players.find(
                                (player) => player.id === answer.playerId,
                              );
                              return contestant ? (
                                <div
                                  key={answer.id}
                                  className="flex items-center justify-between rounded-xl border border-line bg-void/35 px-3 py-2 text-xs"
                                >
                                  <span style={{ color: contestant.color }}>
                                    {contestant.name}
                                    {answer.baathraTextAnswer && (
                                      <small className="mr-2 text-ink-mute">
                                        — الطلب:{" "}
                                        {
                                          activeSession.baathraRequests?.[
                                            answer.baathraRequestIndex || 0
                                          ]
                                        }
                                      </small>
                                    )}
                                  </span>
                                  <span
                                    className={
                                      answer.baathraTextAnswer
                                        ? "text-ink-mute"
                                        : answer.isCorrect
                                          ? "text-success-bright"
                                          : "text-danger-bright"
                                    }
                                  >
                                    {answer.baathraTextAnswer ? (
                                      <span className="flex items-center gap-2">
                                        <strong className="text-ink">
                                          {answer.baathraTextAnswer}
                                        </strong>
                                        {answer.reviewStatus === "pending" ? (
                                          <>
                                            <button
                                              onClick={() =>
                                                void handleReviewBaathraRequest(
                                                  answer,
                                                  true,
                                                )
                                              }
                                              className="text-success-bright"
                                            >
                                              ✓ قبول
                                            </button>
                                            <button
                                              onClick={() =>
                                                void handleReviewBaathraRequest(
                                                  answer,
                                                  false,
                                                )
                                              }
                                              className="text-danger-bright"
                                            >
                                              ✕ رفض
                                            </button>
                                          </>
                                        ) : answer.reviewStatus ===
                                          "approved" ? (
                                          <span className="text-success-bright">
                                            {answer.reviewedAutomatically
                                              ? "مقبولة تلقائياً ✓"
                                              : "مقبولة ✓"}
                                          </span>
                                        ) : (
                                          <span className="text-danger-bright">
                                            مرفوضة ✕
                                          </span>
                                        )}
                                      </span>
                                    ) : answer.isCorrect ? (
                                      `صحيح • ${answer.timeSpent.toFixed(1)}ث`
                                    ) : (
                                      "خطأ"
                                    )}
                                  </span>
                                </div>
                              ) : null;
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : activeSession.gameMode === "tarkeeba" ? (
                <div className="mt-5 space-y-4 text-center">
                  <div className="text-5xl">🧩</div>
                  <h4 className="text-xl font-extrabold text-ink">
                    لعبة تركيبة
                  </h4>
                  <p className="text-sm text-ink-mute">
                    الفئة: {activeSession.tarkeebaCategory || "كلمات عامة"} •
                    الكلمة السرية:{" "}
                    <strong className="text-gold">
                      {activeSession.questionStatus === "idle"
                        ? "تُحدد من السؤال عند بدء الجولة"
                        : typeof window === "undefined"
                          ? ""
                          : decodeURIComponent(
                              escape(atob(activeSession.tarkeebaSecret || "")),
                            )}
                    </strong>
                  </p>
                  <p className="text-xs font-bold text-gold">
                    الجولة {(activeSession.usedQuestionIds || []).length} من{" "}
                    {activeQuestions.length}
                  </p>
                  {activeSession.tarkeebaHint && (
                    <p className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm text-gold">
                      💡 التلميح: {activeSession.tarkeebaHint}
                    </p>
                  )}
                  {tarkeebaRoundWinners.length > 0 && (
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-right">
                      <p className="mb-3 text-sm font-extrabold text-success-bright">
                        🏆 الفائزون في الجولة
                      </p>
                      <div className="space-y-2">
                        {tarkeebaRoundWinners.map((answer, index) => {
                          const winner = players.find(
                            (player) => player.id === answer.playerId,
                          );
                          if (!winner) return null;
                          return (
                            <div
                              key={answer.id}
                              className="flex items-center justify-between rounded-xl border border-line bg-void/35 px-3 py-2"
                            >
                              <span
                                className="text-xs font-extrabold"
                                style={{ color: winner.color }}
                              >
                                #{index + 1} {winner.name}
                              </span>
                              <span className="text-[11px] font-bold text-ink-mute">
                                {answer.tarkeebaAttempts} محاولة •{" "}
                                {Number(answer.timeSpent || 0).toFixed(1)}ث
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {activeSession.questionStatus === "showing" ? (
                    <Button variant="danger" onClick={handleRevealAnswer}>
                      إنهاء الجولة وإظهار النتائج
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={handleStartTarkeeba}>
                      بدء الجولة التالية
                    </Button>
                  )}
                </div>
              ) : activeSession.gameMode === "impostor" ? (
                <div className="mt-5 space-y-5 text-center">
                  <div className="text-5xl">🕵️</div>
                  <h4 className="text-xl font-extrabold text-ink">
                    لعبة أمبوستر
                  </h4>
                  <p className="text-sm text-ink-mute">
                    التصنيف: {activeSession.impostorCategory || "عام"} • الكلمة
                    السرية:{" "}
                    <strong className="text-neon-bright">
                      {activeSession.impostorWord}
                    </strong>
                  </p>
                  <p className="rounded-xl border border-danger/25 bg-danger/5 p-3 text-xs text-ink-soft">
                    الإمبوستر:{" "}
                    <strong className="text-danger-bright">
                      {players.find(
                        (player) =>
                          player.id === activeSession.impostorPlayerId,
                      )?.name || "لم يُوزع بعد"}
                    </strong>
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {activeSession.impostorPhase === "waiting" && (
                      <Button variant="danger" onClick={handleStartImpostor}>
                        توزيع الأدوار وبدء النقاش
                      </Button>
                    )}
                    {activeSession.impostorPhase === "discussion" && (
                      <Button
                        variant="primary"
                        onClick={handleOpenImpostorVoting}
                      >
                        فتح التصويت
                      </Button>
                    )}
                    {activeSession.impostorPhase === "voting" && (
                      <Button variant="success" onClick={handleRevealImpostor}>
                        كشف الإمبوستر
                      </Button>
                    )}
                    {activeSession.impostorPhase === "revealed" && (
                      <span className="text-success-bright">تم الكشف</span>
                    )}
                  </div>
                </div>
              ) : activeSession.gameMode === "roulette" ? (
                <div className="mt-5 space-y-5 text-center">
                  <div className="text-5xl">🎁</div>
                  <h4 className="text-xl font-extrabold text-ink">
                    عجلة الروليت
                  </h4>
                  <p className="text-sm text-ink-mute">
                    اختر الفائز الذي يمنح صلاحية إيقاف العجلة من جواله.
                  </p>
                  <div className="mx-auto max-w-sm">
                    <Select
                      value={rouletteWinnerId}
                      onChange={(event) =>
                        setRouletteWinnerId(event.target.value)
                      }
                    >
                      <option value="">المتصدر تلقائياً</option>
                      {players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name} — {player.score} نقطة
                        </option>
                      ))}
                    </Select>
                  </div>
                  {activeSession.rouletteStatus === "spinning" ? (
                    <p className="font-bold text-gold">
                      العجلة تدور بانتظار الفائز...
                    </p>
                  ) : activeSession.rouletteStatus === "revealed" ? (
                    <p className="text-2xl font-black text-gold">
                      الجائزة: {activeSession.roulettePrize}
                    </p>
                  ) : (
                    <Button variant="primary" onClick={handleStartRoulette}>
                      إطلاق العجلة
                    </Button>
                  )}
                </div>
              ) : currentQuestion ? (
                <div className="mt-5 space-y-4">
                  <h4 className="text-lg font-bold text-ink md:text-xl">
                    {currentQuestion.questionText}
                  </h4>
                  {currentQuestion.questionType === "image" &&
                    currentQuestion.imageUrl && (
                      <img
                        src={currentQuestion.imageUrl}
                        alt="صورة السؤال"
                        className="mx-auto max-h-56 rounded-2xl border border-line object-contain"
                      />
                    )}

                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((n) => {
                      const opt = (currentQuestion as any)[`option${n}`];
                      if (!opt) return null;
                      const isCorrect = currentQuestion.correctOption === n;
                      return (
                        <div
                          key={n}
                          className={cn(
                            "rounded-xl border p-4 text-sm",
                            isCorrect
                              ? "border-success/40 bg-success/10 text-success-bright shadow-[var(--shadow-success)]"
                              : "border-line bg-void-2/50 text-ink-soft",
                          )}
                        >
                          <span className="font-display font-bold text-gold">
                            {n}.
                          </span>{" "}
                          {opt}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                    <div className="text-xs text-ink-mute">
                      الحالة:{" "}
                      <span className="font-bold text-ink-soft">
                        {activeSession.questionStatus === "showing"
                          ? "معروض للجميع"
                          : activeSession.questionStatus === "revealed"
                            ? "تم الكشف"
                            : "انتظار"}
                      </span>
                      <span className="mx-2">•</span>
                      الإجابات:{" "}
                      <span className="font-display font-bold text-neon-bright">
                        {answersCount}
                      </span>
                      {" / "}
                      <span className="font-display text-ink-mute">
                        {players.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSession.gameMode === "image-reveal" &&
                        activeSession.questionStatus === "showing" &&
                        !activeSession.imageRevealStartedAt && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleStartImageReveal}
                          >
                            <Play className="h-3.5 w-3.5" /> بدء الكشف
                          </Button>
                        )}
                      {activeSession.questionStatus === "showing" && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={handleRevealAnswer}
                        >
                          {activeSession.gameMode === "image-reveal"
                            ? "إيقاف وعرض النتيجة"
                            : "كشف الإجابة"}
                        </Button>
                      )}
                      {activeSession.gameMode === "word" &&
                        activeSession.questionStatus !== "showing" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab("questions")}
                          >
                            كلمة جديدة
                          </Button>
                        )}
                      <Button
                        variant={
                          activeSession.showScoreboard ? "primary" : "ghost"
                        }
                        size="sm"
                        onClick={handleToggleScoreboard}
                      >
                        {activeSession.showScoreboard
                          ? "إخفاء الترتيب"
                          : "عرض الترتيب"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-ink-mute">
                  لم يتم بث أي سؤال بعد. اختر سؤالاً من القائمة أدناه لبدء
                  التحدي.
                </div>
              )}
            </Card>

            {/* Question bank */}
            {activeTab === "questions" &&
              !["chairs", "impostor", "roulette"].includes(
                activeSession.gameMode || "quiz",
              ) && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                      <Layers className="h-5 w-5 text-cyan" />
                      أسئلة هذه الجلسة{" "}
                      <span className="rounded-md border border-cyan/25 bg-cyan/10 px-2 py-0.5 font-display text-xs text-cyan">
                        {remainingSessionQuestions.length}
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => setShowEmergencyQuestion(true)}
                      >
                        <Plus className="h-3.5 w-3.5" /> سؤال طارئ
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void handleShowRandomQuestion()}
                        disabled={
                          !remainingSessionQuestions.length ||
                          activeSession.questionStatus === "showing"
                        }
                      >
                        <Shuffle className="h-3.5 w-3.5" /> سؤال عشوائي
                      </Button>
                      <button
                        type="button"
                        onClick={() =>
                          setShowUsedQuestions((current) => !current)
                        }
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs font-bold transition",
                          showUsedQuestions
                            ? "border-gold/35 bg-gold/10 text-gold"
                            : "border-line bg-void/30 text-ink-mute hover:text-ink",
                        )}
                      >
                        {showUsedQuestions
                          ? `الأسئلة المستخدمة (${usedSessionQuestions.length})`
                          : "عرض المستخدمة"}
                      </button>
                      {playersWithIssues.length > 0 && (
                        <span className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {playersWithIssues.length} اتصالهم غير مستقر
                        </span>
                      )}
                    </div>
                  </div>
                  {showEmergencyQuestion && (
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-ink">
                            إضافة سؤال طارئ للجلسة
                          </p>
                          <p className="mt-1 text-[11px] text-ink-mute">
                            السؤال خاص بك ولن يظهر في بنك الأسئلة العام.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowEmergencyQuestion(false)}
                          className="text-ink-mute hover:text-ink"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="نص السؤال">
                          <Input
                            value={emergencyQuestion.text}
                            onChange={(event) =>
                              setEmergencyQuestion((current) => ({
                                ...current,
                                text: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="التصنيف">
                          <Input
                            value={emergencyQuestion.category}
                            onChange={(event) =>
                              setEmergencyQuestion((current) => ({
                                ...current,
                                category: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        {(
                          ["option1", "option2", "option3", "option4"] as const
                        ).map((field, index) => (
                          <Field key={field} label={`الخيار ${index + 1}`}>
                            <Input
                              value={emergencyQuestion[field]}
                              onChange={(event) =>
                                setEmergencyQuestion((current) => ({
                                  ...current,
                                  [field]: event.target.value,
                                }))
                              }
                            />
                          </Field>
                        ))}
                        <Field label="الإجابة الصحيحة">
                          <Select
                            value={emergencyQuestion.correctOption}
                            onChange={(event) =>
                              setEmergencyQuestion((current) => ({
                                ...current,
                                correctOption: Number(event.target.value),
                              }))
                            }
                          >
                            <option value={1}>الخيار الأول</option>
                            <option value={2}>الخيار الثاني</option>
                            <option value={3}>الخيار الثالث</option>
                            <option value={4}>الخيار الرابع</option>
                          </Select>
                        </Field>
                        <Field label="الصعوبة">
                          <Select
                            value={emergencyQuestion.difficulty}
                            onChange={(event) =>
                              setEmergencyQuestion((current) => ({
                                ...current,
                                difficulty: event.target.value as
                                  "easy" | "medium" | "hard",
                              }))
                            }
                          >
                            <option value="easy">سهل</option>
                            <option value="medium">متوسط</option>
                            <option value="hard">صعب</option>
                          </Select>
                        </Field>
                      </div>
                      <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs font-bold text-ink-soft">
                        <input
                          type="checkbox"
                          checked={emergencyQuestion.permanent}
                          onChange={(event) =>
                            setEmergencyQuestion((current) => ({
                              ...current,
                              permanent: event.target.checked,
                            }))
                          }
                        />{" "}
                        حفظ دائم في مكتبتي الخاصة
                      </label>
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowEmergencyQuestion(false)}
                        >
                          إلغاء
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => void handleAddEmergencyQuestion}
                        >
                          إضافة للجلسة
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
                    {(showUsedQuestions
                      ? usedSessionQuestions
                      : remainingSessionQuestions
                    ).length === 0 ? (
                      <div className="p-8 text-center text-sm text-ink-mute">
                        {showUsedQuestions
                          ? "لا توجد أسئلة مستخدمة بعد."
                          : "لا توجد أسئلة متاحة. تم استخدام كل الأسئلة المضافة لهذه الجلسة."}
                      </div>
                    ) : (
                      (showUsedQuestions
                        ? usedSessionQuestions
                        : remainingSessionQuestions
                      ).map((q) => {
                        const isCurrent =
                          activeSession.currentQuestionId === q.id;
                        const isUsed = usedQuestionIds.has(q.id);
                        return (
                          <div
                            key={q.id}
                            className={cn(
                              "flex items-center justify-between gap-3 p-4 transition-colors",
                              isCurrent
                                ? "bg-neon/5"
                                : isUsed
                                  ? "bg-void/30 opacity-60 grayscale"
                                  : "hover:bg-white/5",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-bold text-ink-soft">
                                {q.questionText}
                              </h4>
                              <div className="mt-1.5 flex items-center gap-3">
                                <DifficultyBadge difficulty={q.difficulty} />
                                <CategoryIcon category={q.category} />
                              </div>
                              {q.questionType === "word" ? (
                                <p className="mt-2 rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-xs font-extrabold text-success-bright">
                                  الإجابة: {q.answerWord || q.option1}
                                </p>
                              ) : (
                                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                  {[
                                    q.option1,
                                    q.option2,
                                    q.option3,
                                    q.option4,
                                  ].map((option, index) =>
                                    option ? (
                                      <span
                                        key={index}
                                        className={cn(
                                          "rounded-lg border px-2.5 py-1.5 text-[11px] font-bold",
                                          q.correctOption === index + 1
                                            ? "border-success/35 bg-success/10 text-success-bright"
                                            : "border-line bg-void/35 text-ink-mute",
                                        )}
                                      >
                                        {index + 1}. {option}
                                        {q.correctOption === index + 1 && " ✓"}
                                      </span>
                                    ) : null,
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                              {!showUsedQuestions && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    title="نقل السؤال للأعلى"
                                    aria-label="نقل السؤال للأعلى"
                                    disabled={
                                      isUsed ||
                                      activeSession.questionIds.indexOf(
                                        q.id,
                                      ) === 0
                                    }
                                    onClick={() =>
                                      void handleMoveSessionQuestion(q.id, "up")
                                    }
                                    className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-void-2/60 text-ink-soft transition hover:border-cyan/40 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    title="نقل السؤال للأسفل"
                                    aria-label="نقل السؤال للأسفل"
                                    disabled={
                                      isUsed ||
                                      activeSession.questionIds.indexOf(
                                        q.id,
                                      ) ===
                                        activeSession.questionIds.length - 1
                                    }
                                    onClick={() =>
                                      void handleMoveSessionQuestion(
                                        q.id,
                                        "down",
                                      )
                                    }
                                    className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-void-2/60 text-ink-soft transition hover:border-cyan/40 hover:text-cyan disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void handleShowQuestion(q.id, true)
                                }
                                disabled={
                                  isCurrent &&
                                  activeSession.questionStatus === "showing"
                                }
                                className="cursor-pointer rounded-lg border border-gold/35 bg-gold/10 px-3 py-1.5 text-xs font-bold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                تجريبي · وقت مفتوح
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleShowQuestion(q.id)}
                                disabled={
                                  isUsed ||
                                  (isCurrent &&
                                    activeSession.questionStatus === "showing")
                                }
                                className={cn(
                                  "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition-all",
                                  isUsed
                                    ? "border-line bg-void/40 text-ink-mute"
                                    : isCurrent
                                      ? "border-neon/40 bg-neon/20 text-neon-bright"
                                      : "border-line bg-void-2/60 text-ink-soft hover:border-neon/40 hover:text-neon-bright",
                                  "disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                              >
                                {isUsed
                                  ? "تم استخدامه"
                                  : isCurrent
                                    ? "معروض الآن"
                                    : "طرح السؤال"}
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Right: players */}
          <div
            className={cn(
              "space-y-6",
              activeTab === "questions" && "hidden",
              activeTab === "players" && "lg:col-span-3",
            )}
          >
            <Card className={cn("p-6", activeTab !== "players" && "hidden")}>
              <CardHeader
                title="الفرق والألوان"
                icon={<Users className="h-5 w-5" />}
                accent="neon"
              />
              {!activeSession.teamsEnabled ? (
                <div className="mt-4 space-y-3">
                  <p className="text-xs leading-6 text-ink-mute">
                    فعّل الفرق لتجميع نقاط المتسابقين حسب اللون. مثال: 30
                    متسابقاً وسعة 10 = 3 فرق.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={teamSize}
                      onChange={(event) =>
                        setTeamSize(
                          Math.max(1, Number(event.target.value) || 1),
                        )
                      }
                      className="w-24 text-center font-display"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleEnableTeams}
                      disabled={savingTeams}
                    >
                      {savingTeams ? "..." : "تفعيل وتوزيع"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {teamStandings.map((team, index) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between rounded-xl border border-line bg-void/35 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <div>
                          <p className="text-xs font-bold text-ink">
                            {index + 1}. {team.label}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-mute">
                            {team.members.length} متسابقين
                          </p>
                        </div>
                      </div>
                      <span
                        className="font-display text-sm font-extrabold"
                        style={{ color: team.color }}
                      >
                        {team.score}
                      </span>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={handleEnableTeams}
                    disabled={savingTeams}
                  >
                    {savingTeams ? "جاري التوزيع..." : "إعادة توزيع الفرق"}
                  </Button>
                </div>
              )}
            </Card>

            <Card className={cn("p-6", activeTab !== "players" && "hidden")}>
              <CardHeader
                title={<span>المتسابقون المتصلون ({players.length})</span>}
                icon={<Users className="h-5 w-5" />}
                accent="cyan"
              />
              {players.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-mute">
                  بانتظار انضمام المتسابقين...
                </div>
              ) : (
                <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {playerConnections.map(({ player: p, state, label }, idx) => (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center justify-between rounded-xl border border-line bg-void-2/50 p-3.5 transition-all",
                        p.approvalStatus === "pending" &&
                          "border-gold/45 bg-gold/5",
                        state === "offline" && "opacity-45 grayscale",
                        state === "unstable" && "border-gold/25",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold",
                            idx === 0
                              ? "bg-gold/20 text-gold"
                              : idx === 1
                                ? "bg-white/15 text-ink-soft"
                                : idx === 2
                                  ? "bg-amber-700/30 text-amber-500"
                                  : "bg-void text-ink-faint",
                          )}
                        >
                          {idx + 1}
                        </span>
                        <div>
                          <p
                            className="text-xs font-bold"
                            style={{ color: p.color }}
                          >
                            {p.name}
                          </p>
                          {p.approvalStatus === "pending" && (
                            <p className="mt-1 text-[10px] font-extrabold text-gold">
                              طلب انضمام جديد — بانتظار موافقتك
                            </p>
                          )}
                          {p.approvalStatus === "rejected" && (
                            <p className="mt-1 text-[10px] font-extrabold text-danger-bright">
                              تم رفض طلب الانضمام
                            </p>
                          )}
                          {p.rejoinCode && (
                            <p className="mt-2 inline-flex rounded-lg border border-cyan/25 bg-cyan/5 px-2.5 py-1 font-display text-base font-black tracking-[0.22em] text-cyan">
                              ID {p.rejoinCode}
                            </p>
                          )}
                          {activeSession.teamsEnabled && (
                            <select
                              value={
                                p.teamId || getTeamFromColor(p.color)?.id || ""
                              }
                              onChange={(event) =>
                                handleMovePlayerToTeam(p, event.target.value)
                              }
                              className="mt-1 max-w-32 rounded border border-line bg-void px-1 py-0.5 text-[10px] font-bold text-ink-soft"
                            >
                              {TEAM_OPTIONS.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.label}
                                </option>
                              ))}
                            </select>
                          )}
                          <span
                            className={cn(
                              "mt-1 flex items-center gap-1 text-[10px] font-bold",
                              state === "online"
                                ? "text-success-bright"
                                : state === "unstable"
                                  ? "text-gold"
                                  : "text-ink-faint",
                            )}
                          >
                            {state === "online" ? (
                              <Wifi className="h-3 w-3" />
                            ) : (
                              <WifiOff className="h-3 w-3" />
                            )}
                            {label}
                          </span>
                          {p.streak >= 3 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400">
                              <Flame className="h-3 w-3" /> {p.streak} متتالي
                            </span>
                          )}
                          {(p.usedFiftyFifty || p.usedTimeExtension) && (
                            <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-ink-mute">
                              {p.usedFiftyFifty && (
                                <span
                                  title="استخدم حذف إجابتين"
                                  className="flex items-center gap-0.5 text-magenta"
                                >
                                  <Scissors className="h-3 w-3" /> 50/50
                                </span>
                              )}
                              {p.usedTimeExtension && (
                                <span
                                  title="استخدم تمديد الوقت"
                                  className="flex items-center gap-0.5 text-cyan"
                                >
                                  <PlusCircle className="h-3 w-3" /> +20ث
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.approvalStatus === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                void handlePlayerApproval(p, "approved")
                              }
                              className="rounded-lg border border-success/35 bg-success/10 px-2.5 py-1.5 text-[10px] font-extrabold text-success-bright"
                            >
                              قبول
                            </button>
                            <button
                              onClick={() =>
                                void handlePlayerApproval(p, "rejected")
                              }
                              className="rounded-lg border border-danger/35 bg-danger/10 px-2.5 py-1.5 text-[10px] font-extrabold text-danger-bright"
                            >
                              رفض
                            </button>
                          </>
                        )}
                        {p.approvalStatus === "rejected" && (
                          <button
                            onClick={() =>
                              void handlePlayerApproval(p, "approved")
                            }
                            className="rounded-lg border border-success/35 bg-success/10 px-2.5 py-1.5 text-[10px] font-extrabold text-success-bright"
                          >
                            السماح الآن
                          </button>
                        )}
                        <button
                          onClick={() => void handleAdjustPlayerScore(p, -1)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-danger/25 bg-danger/10 text-sm font-black text-danger-bright"
                          title="خصم نقاط"
                        >
                          −
                        </button>
                        <span className="min-w-9 text-center font-display text-xs font-extrabold text-ink">
                          {p.score}
                        </span>
                        <button
                          onClick={() => void handleAdjustPlayerScore(p, 1)}
                          className="grid h-7 w-7 place-items-center rounded-lg border border-success/25 bg-success/10 text-sm font-black text-success-bright"
                          title="إضافة نقاط"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePlayer(p)}
                          className="mr-1 grid h-7 w-7 place-items-center rounded-lg border border-danger/30 bg-danger/10 text-danger-bright transition hover:bg-danger/20"
                          title={`حذف ${p.name} من اللعبة`}
                          aria-label={`حذف المتسابق ${p.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className={cn("p-6", activeTab !== "control" && "hidden")}>
              <CardHeader
                title="بث تلميح فوري للمتسابقين"
                icon={<Sparkles className="h-5 w-5" />}
                accent="neon"
              />
              <div className="mt-4 space-y-4">
                <p className="text-[11px] text-ink-mute">
                  يظهر التلميح فوراً على أجهزة المتسابقين وشاشة التلفزيون، في
                  الانتظار أو أثناء السؤال.
                </p>
                <div className="flex gap-2">
                  <Input
                    placeholder="اكتب التلميح هنا"
                    value={hintInput}
                    onChange={(event) => setHintInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleBroadcastHint();
                    }}
                  />
                  <Button
                    variant="primary"
                    onClick={() => void handleBroadcastHint()}
                    disabled={!hintInput.trim()}
                  >
                    بث 💡
                  </Button>
                </div>
                <div className="border-t border-line pt-3">
                  <p className="mb-2 text-[10px] font-bold text-ink-mute">
                    عبارات جاهزة
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_HINTS.map((quickHint) => (
                      <button
                        key={quickHint}
                        type="button"
                        onClick={() => setHintInput(quickHint)}
                        className="rounded-lg border border-line bg-void/35 px-2.5 py-1.5 text-[10px] font-bold text-ink-soft transition hover:border-neon/35 hover:bg-neon/10 hover:text-neon-bright"
                      >
                        {quickHint}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* TV Customize Settings */}
            <Card className={cn("p-6", activeTab !== "control" && "hidden")}>
              <CardHeader
                title="إعدادات الشاشة التلفزيونية"
                icon={<Layers className="h-5 w-5" />}
                accent="cyan"
              />
              <div className="mt-4 space-y-4">
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => setShowTvQr(true)}
                >
                  <QrCode className="h-4 w-4" /> رابط وباركود شاشة العرض
                </Button>
                <Field label="شعار / عنوان التلفزيون">
                  <Input
                    value={tvLogoTextInput}
                    onChange={(e) => setTvLogoTextInput(e.target.value)}
                    placeholder="شعار المسابقة المعروض"
                  />
                </Field>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tvShowQuestionsInput}
                  onClick={() => setTvShowQuestionsInput((current) => !current)}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-void/35 px-4 py-3 text-right transition hover:border-cyan/40"
                >
                  <span>
                    <span className="block text-sm font-bold text-ink">
                      إظهار الأسئلة على شاشة التلفزيون
                    </span>
                    <span className="mt-1 block text-[11px] text-ink-mute">
                      مفعّل تلقائياً، ويمكن إخفاؤها مع استمرار عرض حالة الجولة.
                    </span>
                  </span>
                  <span
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full transition",
                      tvShowQuestionsInput ? "bg-success" : "bg-white/10",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 h-5 w-5 rounded-full bg-white transition-all",
                        tvShowQuestionsInput ? "left-1" : "left-6",
                      )}
                    />
                  </span>
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="حجم الخط">
                    <Select
                      value={tvFontSizeInput}
                      onChange={(e: any) => setTvFontSizeInput(e.target.value)}
                    >
                      <option value="sm">صغير</option>
                      <option value="md">متوسط</option>
                      <option value="lg">كبير</option>
                      <option value="xl">ضخم</option>
                    </Select>
                  </Field>
                  <Field label="وضع الخلفية">
                    <Select
                      value={tvChromaInput}
                      onChange={(e: any) => setTvChromaInput(e.target.value)}
                    >
                      <option value="normal">افتراضية نيون</option>
                      <option value="chroma">كروما خضراء</option>
                      <option value="transparent">شفافة كاملة</option>
                    </Select>
                  </Field>
                </div>
                <Field label="لون الخلفية المخصص (HEX)">
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={tvBgColorInput}
                      onChange={(e) => setTvBgColorInput(e.target.value)}
                      className="w-12 h-9 p-0 bg-transparent border-0 cursor-pointer"
                    />
                    <Input
                      value={tvBgColorInput}
                      onChange={(e) => setTvBgColorInput(e.target.value)}
                      placeholder="#090514"
                      className="font-mono flex-1"
                    />
                  </div>
                </Field>
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleUpdateTvSettings}
                >
                  تطبيق الإعدادات على التلفزيون 📺
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: SESSIONS LIST & CREATION
  // ==========================================
  const selectedQuestionSet = new Set(selectedQuestionIds);
  const selectedQuestions = selectedQuestionIds.flatMap((id) => {
    const question = questions.find((item) => item.id === id);
    return question ? [question] : [];
  });
  const availableQuestions = questions.filter((question) => {
    if (selectedQuestionSet.has(question.id)) return false;
    if (
      librarySearch.trim() &&
      !question.questionText
        .toLowerCase()
        .includes(librarySearch.trim().toLowerCase())
    )
      return false;
    if (
      libraryDifficulty !== "all" &&
      question.difficulty !== libraryDifficulty
    )
      return false;
    return (
      libraryCategory === "all" ||
      normalizeSessionCategory(question.category) === libraryCategory
    );
  });
  const liveSessions = sessions.filter(
    (session) => session.status === "active",
  );

  return (
    <div className="anim-rise space-y-8">
      <div className="flex items-center gap-2">
        <Layers className="h-6 w-6 text-neon-bright" />
        <h2 className="text-2xl font-extrabold text-ink">إدارة جلسات اللعب</h2>
      </div>

      {error && (
        <div className="anim-shake rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-center text-sm text-success-bright">
          {success}
        </div>
      )}

      {liveSessions.length > 0 && (
        <div
          className={cn(
            "rounded-2xl border p-4",
            liveSessions.length > 1
              ? "border-danger/40 bg-danger/10"
              : "border-success/35 bg-success/10",
          )}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p
                className={cn(
                  "text-xs font-bold",
                  liveSessions.length > 1
                    ? "text-danger-bright"
                    : "text-success-bright",
                )}
              >
                {liveSessions.length > 1
                  ? `⚠ يوجد تعارض: ${liveSessions.length} جلسات نشطة`
                  : "● التحدي الذي يعمل حالياً"}
              </p>
              <p className="mt-1 text-lg font-extrabold text-ink">
                {liveSessions.map((session) => session.title).join("، ")}
              </p>
              <p className="mt-1 text-xs text-ink-mute">
                يجب أن تكون هناك جلسة نشطة واحدة فقط حتى لا يتكرر التحدي عند
                المتسابقين.
              </p>
            </div>
            {liveSessions.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {liveSessions.map((session) => (
                  <Button
                    key={session.id}
                    size="sm"
                    variant="danger"
                    onClick={() => void handleMakeSessionExclusive(session)}
                  >
                    اعتماد «{session.title}» فقط
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Creation now lives in the dedicated Games Office wizard. */}
        <Card className="space-y-4 p-6 lg:col-span-3">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-ink">
                <Sparkles className="h-5 w-5 text-neon-bright" /> أنشئ التحدي من
                مكتب الألعاب
              </h3>
              <p className="mt-1 text-xs text-ink-mute">
                اختر اللعبة والأسئلة والوقت عبر معالج مبسّط، ثم عد هنا للتحكم
                بالبث.
              </p>
            </div>
            <Button onClick={() => router.push("/dashboard/games")}>
              فتح مكتب الألعاب
            </Button>
          </div>
        </Card>

        {/* Legacy creator retained in code during migration, hidden from presenters. */}
        {false && (
          <Card glow="neon" className="space-y-5 p-6 lg:col-span-3">
            <CardHeader
              title="إنشاء جلسة جديدة"
              icon={<Plus className="h-5 w-5" />}
            />
            <form onSubmit={handleCreateSession} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_180px]">
                <Field label="عنوان الجلسة" required>
                  <Input
                    required
                    placeholder="مثال: تحدي الجمعة العائلي"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field
                  label="رمز غرفتك الدائم"
                  hint="يُستخدم لكل جلساتك القادمة."
                >
                  <div className="flex gap-2" dir="ltr">
                    <Input
                      maxLength={4}
                      inputMode="numeric"
                      placeholder="0000"
                      value={presenterRoomCode}
                      onChange={(event) =>
                        setPresenterRoomCode(
                          event.target.value.replace(/\D/g, ""),
                        )
                      }
                      className="text-center font-display font-bold tracking-[0.25em]"
                    />
                    <Button
                      type="button"
                      variant={
                        profile?.roomCode === presenterRoomCode
                          ? "ghost"
                          : "outline"
                      }
                      size="sm"
                      disabled={
                        savingRoomCode || !/^\d{4}$/.test(presenterRoomCode)
                      }
                      onClick={handleSavePresenterRoomCode}
                    >
                      {savingRoomCode
                        ? "..."
                        : profile?.roomCode
                          ? "تغيير"
                          : "حجز"}
                    </Button>
                  </div>
                </Field>
                <Field label="مدة المؤقت">
                  <Select
                    value={timerDuration}
                    onChange={(e) =>
                      setTimerDuration(parseInt(e.target.value, 10))
                    }
                  >
                    <option value={20}>20 ثانية</option>
                    <option value={30}>30 ثانية</option>
                    <option value={45}>45 ثانية</option>
                    <option value={60}>60 ثانية</option>
                  </Select>
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setGameMode("quiz")}
                  className={cn(
                    "rounded-2xl border p-4 text-right transition-all",
                    gameMode === "quiz"
                      ? "border-neon bg-neon/10 shadow-[var(--shadow-neon)]"
                      : "border-line bg-void/30 hover:border-neon/35",
                  )}
                >
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <Layers className="h-5 w-5 text-neon-bright" /> تحدّي
                    الأسئلة
                  </span>
                  <span className="mt-1 block text-xs text-ink-mute">
                    أسئلة نصية أو أعلام وصور مع خيارات.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setGameMode("chairs")}
                  className={cn(
                    "rounded-2xl border p-4 text-right transition-all",
                    gameMode === "chairs"
                      ? "border-gold bg-gold/10 shadow-[var(--shadow-gold)]"
                      : "border-line bg-void/30 hover:border-gold/35",
                  )}
                >
                  <span className="flex items-center gap-2 font-bold text-ink">
                    <Armchair className="h-5 w-5 text-gold" /> لعبة الكراسي
                  </span>
                  <span className="mt-1 block text-xs text-ink-mute">
                    يختار كل لاعب رقم كرسي بعد توقف الموسيقى.
                  </span>
                </button>
              </div>

              {gameMode === "chairs" && (
                <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <p className="font-bold text-ink">
                        عدد الكراسي في الجولة الأولى
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        في كل جولة تالية ينقص كرسي تلقائياً من عدد المتأهلين.
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={chairCount}
                      onChange={(e) =>
                        setChairCount(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-28 text-center font-display font-extrabold text-gold"
                    />
                  </div>
                </div>
              )}

              {gameMode === "quiz" && (
                <div className="space-y-3">
                  {profile?.roomCode && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan/25 bg-cyan/10 px-4 py-3 text-xs">
                      <span className="text-cyan">
                        رابط المتسابقين الثابت:{" "}
                        <strong
                          dir="ltr"
                          className="font-display tracking-wider"
                        >
                          /player?room={profile?.roomCode}
                        </strong>
                      </span>
                      <span className="text-ink-mute">
                        يبقى هذا الرابط في وضع الانتظار عند عدم وجود تحدٍ نشط.
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">
                        اختر أسئلة الجلسة من المكتبة
                      </p>
                      <p className="mt-1 text-xs text-ink-mute">
                        اسحب السؤال من المكتبة إلى سلة الجلسة، أو اضغط عليه
                        لإضافته.
                      </p>
                    </div>
                    <span className="rounded-full border border-neon/30 bg-neon/10 px-3 py-1.5 text-xs font-extrabold text-neon-bright">
                      تمت إضافة {selectedQuestionIds.length} سؤال
                    </span>
                  </div>

                  <div dir="ltr" className="grid gap-4 lg:grid-cols-2">
                    <div
                      dir="rtl"
                      className="rounded-2xl border border-line bg-void/35 p-3"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={handleDropIntoLibrary}
                    >
                      <div className="mb-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-ink">المكتبة</h4>
                          <span className="text-[11px] text-ink-mute">
                            {availableQuestions.length} متاح
                          </span>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input
                            value={librarySearch}
                            onChange={(event) =>
                              setLibrarySearch(event.target.value)
                            }
                            placeholder="ابحث..."
                            icon={<Search className="h-4 w-4" />}
                          />
                          <Select
                            value={libraryCategory}
                            onChange={(event) =>
                              setLibraryCategory(event.target.value)
                            }
                          >
                            <option value="all">كل التصنيفات</option>
                            {SESSION_CATEGORIES.slice(1).map((category) => (
                              <option
                                key={category.value}
                                value={category.value}
                              >
                                {category.label}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={libraryDifficulty}
                            onChange={(event) =>
                              setLibraryDifficulty(event.target.value)
                            }
                          >
                            <option value="all">كل الصعوبات</option>
                            <option value="easy">سهل</option>
                            <option value="medium">متوسط</option>
                            <option value="hard">صعب</option>
                          </Select>
                        </div>
                      </div>
                      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                        {questions.length === 0 ? (
                          <div className="p-8 text-center text-xs text-ink-faint">
                            لا توجد أسئلة متوفرة في البنك المركزي حالياً.
                          </div>
                        ) : availableQuestions.length === 0 ? (
                          <div className="p-8 text-center text-xs text-ink-faint">
                            لا توجد أسئلة تطابق الفلترة الحالية.
                          </div>
                        ) : (
                          availableQuestions.map((question) => (
                            <div
                              key={question.id}
                              draggable
                              onDragStart={(event) =>
                                handleQuestionDragStart(event, question.id)
                              }
                              onClick={() => addQuestionToSession(question.id)}
                              className="group flex cursor-grab items-center gap-3 rounded-xl border border-line bg-void-2/50 p-3 text-right transition-all hover:border-neon/35 hover:bg-neon/5 active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4 shrink-0 text-ink-faint group-hover:text-neon-bright" />
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-xs font-bold text-ink-soft">
                                  {question.questionText}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <CategoryIcon category={question.category} />
                                  <DifficultyBadge
                                    difficulty={question.difficulty}
                                  />
                                </div>
                              </div>
                              <span className="text-lg text-neon-bright">
                                +
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div
                      dir="rtl"
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsQuestionDropActive(true);
                      }}
                      onDragLeave={() => setIsQuestionDropActive(false)}
                      onDrop={handleDropIntoSession}
                      className={cn(
                        "min-h-[20rem] rounded-2xl border-2 border-dashed p-3 transition-all",
                        isQuestionDropActive
                          ? "border-neon bg-neon/10 shadow-[var(--shadow-neon)]"
                          : "border-neon/30 bg-neon/5",
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h4 className="font-bold text-ink">سلة أسئلة الجلسة</h4>
                        <span className="text-[11px] font-bold text-neon-bright">
                          {selectedQuestions.length} سؤال
                        </span>
                      </div>
                      {selectedQuestions.length === 0 ? (
                        <div className="grid min-h-52 place-items-center p-6 text-center text-xs leading-6 text-ink-mute">
                          اسحب الأسئلة هنا لإضافتها للجلسة
                          <br />
                          أو اضغط أي سؤال من المكتبة.
                        </div>
                      ) : (
                        <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                          {selectedQuestions.map((question, index) => (
                            <div
                              key={question.id}
                              draggable
                              onDragStart={(event) =>
                                handleQuestionDragStart(event, question.id)
                              }
                              className="flex cursor-grab items-center gap-3 rounded-xl border border-neon/20 bg-void-2/60 p-3 active:cursor-grabbing"
                            >
                              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neon/15 font-display text-[10px] font-bold text-neon-bright">
                                {index + 1}
                              </span>
                              <p className="min-w-0 flex-1 line-clamp-2 text-xs font-bold text-ink-soft">
                                {question.questionText}
                              </p>
                              <button
                                type="button"
                                onClick={() =>
                                  removeQuestionFromSession(question.id)
                                }
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger-bright"
                                title="إزالة السؤال"
                                aria-label="إزالة السؤال"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                disabled={!profile?.roomCode}
              >
                إنشاء الجلسة وحفظها
              </Button>
            </form>
          </Card>
        )}

        {/* Sessions list */}
        <div className="space-y-4 lg:col-span-2">
          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">
                لا توجد جلسات منشأة حالياً.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="truncate text-sm font-bold text-ink md:text-base">
                          {session.title}
                        </h4>
                        <span className="inline-flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5 text-[11px] font-extrabold text-gold shadow-[0_0_18px_rgba(245,158,11,.08)]">
                          <span className="text-base" aria-hidden>
                            {getGameModeLabel(session.gameMode).icon}
                          </span>
                          {getGameModeLabel(session.gameMode).label}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="rounded-md border border-line bg-void/60 px-2 py-0.5 font-display tracking-wider text-neon-bright">
                          {session.roomCode}
                        </span>
                        {session.isDraft && (
                          <span className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-bold text-gold">
                            مسودة محفوظة
                          </span>
                        )}
                        <StatusDot
                          status={session.status}
                          pulse={session.status === "active"}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <div className="w-44">
                        <Select
                          value={session.isDraft ? "draft" : session.status}
                          onChange={(event) =>
                            void handleManualSessionStatus(
                              session,
                              event.target.value as ManualSessionStatus,
                            )
                          }
                          aria-label={`تغيير حالة ${session.title}`}
                        >
                          {MANUAL_SESSION_STATUSES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <button
                        onClick={() =>
                          router.push(`/dashboard/sessions?id=${session.id}`)
                        }
                        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-4 py-2 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20 hover:shadow-[var(--shadow-neon)]"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        لوحة التحكم
                      </button>
                      {session.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handlePauseListedSession(session)}
                        >
                          ⏸ إيقاف
                        </Button>
                      )}
                      {session.status === "paused" && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() =>
                            void handleMakeSessionExclusive(session)
                          }
                        >
                          ▶ تشغيل وحدها
                        </Button>
                      )}
                      {session.status === "finished" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleReuseSession(session)}
                        >
                          تكرار الجلسة
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => void handleDeleteSession(session)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <Spinner label="جاري التحميل..." />
        </div>
      }
    >
      <SessionsPageContent />
    </Suspense>
  );
}
