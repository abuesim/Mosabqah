"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  getUserProfile,
  getQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  bulkAddQuestions,
  deleteTop10Question,
  getTop10Questions,
} from "@/lib/db";
import type { Question, Top10Question } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Pencil,
  Search,
  BookOpen,
  Upload,
  Filter,
  X,
  Download,
  FileSpreadsheet,
  Image as ImageIcon,
  Puzzle,
  Check,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card, { CardHeader } from "@/components/ui/Card";
import { Field, Input, Textarea, Select } from "@/components/ui/Input";
import DifficultyBadge from "@/components/ui/DifficultyBadge";
import CategoryIcon from "@/components/ui/CategoryIcon";
import Spinner from "@/components/ui/Spinner";

const CATEGORIES = [
  { value: "all", label: "🗂️ الكل" },
  { value: "عامة", label: "🌍 عامة" },
  { value: "إسلامية", label: "🕌 إسلامية" },
  { value: "ألغاز", label: "🧩 ألغاز" },
  { value: "علوم", label: "🔬 علوم" },
  { value: "عائلية", label: "🏠 عائلية" },
  { value: "تاريخ", label: "📜 تاريخ" },
  { value: "جغرافيا", label: "🗺️ جغرافيا" },
  { value: "رياضة", label: "⚽ رياضة" },
];

export function normalizeCategory(cat: string): string {
  if (!cat) return "عامة";
  const c = cat.trim().toLowerCase();
  if (c === "general" || c === "general" || c === "عام" || c === "عامة")
    return "عامة";
  if (c === "islamic" || c === "إسلامي" || c === "إسلامية") return "إسلامية";
  if (c === "riddles" || c === "لغز" || c === "ألغاز") return "ألغاز";
  if (c === "science" || c === "علم" || c === "علوم") return "علوم";
  if (c === "family" || c === "عائلة" || c === "عائلية") return "عائلية";
  if (c === "history" || c === "التاريخ" || c === "تاريخ") return "تاريخ";
  if (c === "geography" || c === "الجغرافيا" || c === "جغرافيا")
    return "جغرافيا";
  if (c === "sports" || c === "الرياضة" || c === "رياضة") return "رياضة";
  return cat.trim();
}

export default function QuestionsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<{
    id: string;
    username: string;
    role: string;
  } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [top10Questions, setTop10Questions] = useState<Top10Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form Fields
  const [questionText, setQuestionText] = useState("");
  const [questionType, setQuestionType] = useState<"text" | "image" | "word">(
    "text",
  );
  const [questionBankTab, setQuestionBankTab] = useState<
    "all" | "word" | "image-reveal" | "top10"
  >("all");
  const [imageOption4Enabled, setImageOption4Enabled] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");
  const [option4, setOption4] = useState("");
  const [wordHint, setWordHint] = useState("");
  const [correctOption, setCorrectOption] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium",
  );
  const [category, setCategory] = useState("عامة");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(
    null,
  );

  // Filter Fields
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterQuestionType, setFilterQuestionType] = useState("all");
  const [templateCategory, setTemplateCategory] = useState("عامة");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        window.location.href = "/auth";
        return;
      }
      try {
        const [userProfile, tokenResult] = await Promise.all([
          getUserProfile(user.uid),
          user.getIdTokenResult(),
        ]);
        const resolvedRole =
          tokenResult.claims.admin === true
            ? "admin"
            : userProfile?.role || "presenter";
        setProfile({
          id: user.uid,
          username:
            userProfile?.username ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "مدير النظام",
          role: resolvedRole,
        });
        await fetchQuestions({
          id: user.uid,
          username: userProfile?.username || "",
          role: resolvedRole,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    let result = [...questions];
    if (searchQuery.trim()) {
      result = result.filter((q) =>
        q.questionText.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    if (filterDifficulty !== "all") {
      result = result.filter((q) => q.difficulty === filterDifficulty);
    }
    if (filterCategory !== "all") {
      result = result.filter(
        (q) => normalizeCategory(q.category) === filterCategory,
      );
    }
    if (filterQuestionType !== "all") {
      result = result.filter(
        (q) => (q.questionType || "text") === filterQuestionType,
      );
    }
    if (questionBankTab === "word")
      result = result.filter((q) => q.questionType === "word");
    if (questionBankTab === "image-reveal")
      result = result.filter(
        (q) => q.questionType === "image" && Boolean(q.option4),
      );
    setFilteredQuestions(result);
  }, [
    searchQuery,
    filterDifficulty,
    filterCategory,
    filterQuestionType,
    questionBankTab,
    questions,
  ]);

  const fetchQuestions = async (viewer = profile) => {
    const [questionList, top10QuestionList] = await Promise.all([
      getQuestions(),
      getTop10Questions(),
    ]);
    const data = questionList.filter(
      (question) =>
        !question.temporarySessionId &&
        (question.visibility !== "presenter-private" ||
          viewer?.role === "admin" ||
          question.createdBy === viewer?.id),
    );
    setQuestions(data);
    setFilteredQuestions(data);
    setTop10Questions(top10QuestionList);
  };

  const resetQuestionForm = () => {
    setQuestionText("");
    setQuestionType("text");
    setImageOption4Enabled(false);
    setImageUrl("");
    setImageFile(null);
    setOption1("");
    setOption2("");
    setOption3("");
    setOption4("");
    setWordHint("");
    setCorrectOption(1);
    setDifficulty("medium");
    setCategory("عامة");
    setEditingQuestionId(null);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !["admin", "presenter"].includes(profile.role)) {
      setError("يلزم تسجيل الدخول بحساب مدير أو مقدم لإضافة سؤال.");
      return;
    }
    setError("");
    setSuccess("");
    try {
      if (questionType === "image" && !imageFile && !imageUrl)
        throw new Error("اختر صورة السؤال أولاً.");
      let storedImageUrl = imageUrl;
      if (imageFile) {
        setUploadingImage(true);
        storedImageUrl = await uploadImageFile(imageFile);
      }
      const questionData = {
        questionText,
        questionType,
        imageUrl: storedImageUrl,
        option1,
        option2,
        option3,
        option4,
        correctOption,
        difficulty,
        category,
        hint: questionType === "word" ? wordHint.trim() : "",
      };
      if (editingQuestionId) {
        await updateQuestion(editingQuestionId, questionData);
        setSuccess("تم تعديل السؤال بنجاح.");
      } else {
        await addQuestion({ ...questionData, createdBy: profile.id });
        setSuccess("تم إضافة السؤال بنجاح إلى بنك الأسئلة!");
      }
      resetQuestionForm();
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إضافة السؤال");
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadImageFile = async (file: File) => {
    const user = auth.currentUser;
    if (!user) throw new Error("انتهت جلسة الدخول.");
    const form = new FormData();
    form.append("image", file);
    const response = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: { Authorization: `Bearer ${await user.getIdToken(true)}` },
      body: form,
    });
    const payload = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !payload.url)
      throw new Error(payload.error || "تعذر رفع الصورة.");
    return payload.url;
  };

  const importImageFromUrl = async (sourceUrl: string) => {
    const user = auth.currentUser;
    if (!user) throw new Error("انتهت جلسة الدخول.");
    const response = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken(true)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceUrl }),
    });
    const payload = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !payload.url)
      throw new Error(payload.error || "تعذر نسخ صورة السؤال إلى التخزين.");
    return payload.url;
  };

  const handleEdit = (question: Question) => {
    if (
      !profile ||
      (profile.role !== "admin" && question.createdBy !== profile.id)
    )
      return;
    setError("");
    setSuccess("");
    setEditingQuestionId(question.id);
    setQuestionText(question.questionText);
    setQuestionType(question.questionType || "text");
    setImageOption4Enabled(Boolean(question.option4));
    setImageUrl(question.imageUrl || "");
    setImageFile(null);
    setOption1(question.option1);
    setOption2(question.option2);
    setOption3(question.option3 || "");
    setOption4(question.option4 || "");
    setWordHint(question.hint || "");
    setCorrectOption(question.correctOption);
    setDifficulty(question.difficulty);
    setCategory(question.category || "عامة");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    const question = questions.find((item) => item.id === id);
    if (
      !profile ||
      (profile.role !== "admin" && question?.createdBy !== profile.id)
    ) {
      setError("يمكنك حذف أسئلتك الخاصة فقط.");
      return;
    }
    if (!confirm("هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟")) return;
    try {
      await deleteQuestion(id);
      setSuccess("تم حذف السؤال بنجاح.");
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء حذف السؤال");
    }
  };

  const handleDeleteTop10 = async (id: string) => {
    if (profile?.role !== "admin") {
      setError("حذف أسئلة TOP 10 متاح لمدير النظام فقط.");
      return;
    }
    if (!confirm("هل تريد حذف سؤال TOP 10 هذا نهائياً من البنك؟")) return;
    try {
      await deleteTop10Question(id);
      setSuccess("تم حذف سؤال TOP 10 من البنك.");
      await fetchQuestions();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف سؤال TOP 10.",
      );
    }
  };

  const downloadExcelTemplate = (
    type: "text" | "image" | "word" | "imageReveal",
  ) => {
    const headers = [
      "نوع السؤال",
      "نص السؤال",
      "رابط الصورة",
      "الخيار الأول",
      "الخيار الثاني",
      "الخيار الثالث",
      "الخيار الرابع",
      "الإجابة الصحيحة",
      "التصنيف",
      "الصعوبة",
    ];
    const sample =
      type === "word"
        ? ["word", "مهن ووظائف", "", "مهندس", "", "", "", 1, "مهن", "medium"]
        : type === "imageReveal"
          ? [
              "image",
              "ما اسم هذا العلم؟",
              "https://example.com/flag.png",
              "الإجابة الأولى",
              "الإجابة الثانية",
              "الإجابة الثالثة",
              "الإجابة الرابعة",
              1,
              templateCategory,
              "medium",
            ]
          : type === "image"
            ? [
                "image",
                "ما اسم هذا العلم؟",
                "https://example.com/flag.png",
                "الإجابة الأولى",
                "الإجابة الثانية",
                "الإجابة الثالثة",
                "",
                1,
                templateCategory,
                "medium",
              ]
            : [
                "text",
                "اكتب نص السؤال هنا",
                "",
                "الخيار الأول",
                "الخيار الثاني",
                "الخيار الثالث",
                "الخيار الرابع",
                1,
                templateCategory,
                "medium",
              ];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    worksheet["!cols"] = [
      { wch: 16 },
      { wch: 42 },
      { wch: 48 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      type === "word"
        ? "كلمات مفقودة"
        : type === "imageReveal"
          ? "تخمين الصور"
          : type === "image"
            ? "أسئلة صور"
            : "أسئلة نصية",
    );
    XLSX.writeFile(
      workbook,
      type === "word"
        ? `قالب_كلمات_${templateCategory}.xlsx`
        : type === "imageReveal"
          ? `قالب_تخمين_صور_${templateCategory}.xlsx`
          : type === "image"
            ? `قالب_صور_${templateCategory}.xlsx`
            : `قالب_نصي_${templateCategory}.xlsx`,
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !["admin", "presenter"].includes(profile.role)) {
      setError("يلزم حساب مقدم أو مدير لاستيراد الأسئلة.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setSuccess("");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Parse worksheet into rows (header: 1 returns 2D array of strings/numbers)
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          setError("الملف فارغ أو لا يحتوي على أسطر صالحة.");
          return;
        }

        // Detect column indices based on header names (case-insensitive & clean)
        const headers = rows[0].map((h) =>
          String(h || "")
            .trim()
            .toLowerCase(),
        );

        const textIdx = headers.findIndex(
          (h) =>
            h.includes("text") || h.includes("سؤال") || h === "question_text",
        );
        const opt1Idx = headers.findIndex(
          (h) =>
            h === "option1" ||
            h.includes("خيار1") ||
            h.includes("الاول") ||
            h.includes("الأول"),
        );
        const opt2Idx = headers.findIndex(
          (h) => h === "option2" || h.includes("خيار2") || h.includes("الثاني"),
        );
        const opt3Idx = headers.findIndex(
          (h) => h === "option3" || h.includes("خيار3") || h.includes("الثالث"),
        );
        const opt4Idx = headers.findIndex(
          (h) => h === "option4" || h.includes("خيار4") || h.includes("الرابع"),
        );
        const correctIdx = headers.findIndex(
          (h) =>
            h.includes("correct") ||
            h.includes("صحيح") ||
            h === "correct_option",
        );
        const catIdx = headers.findIndex(
          (h) =>
            h === "category" ||
            h.includes("قسم") ||
            h.includes("تصنيف") ||
            h === "التصنيف",
        );
        const diffIdx = headers.findIndex(
          (h) => h === "difficulty" || h.includes("صعوب") || h === "الصعوبة",
        );
        const typeIdx = headers.findIndex(
          (h) =>
            h === "question_type" || h.includes("نوع السؤال") || h === "type",
        );
        const imageIdx = headers.findIndex(
          (h) =>
            h === "image_url" ||
            h.includes("رابط الصورة") ||
            h.includes("صورة"),
        );

        const getColVal = (
          row: any[],
          headerIdx: number,
          fallbackIdx: number,
        ) => {
          const idx = headerIdx !== -1 ? headerIdx : fallbackIdx;
          return row[idx] !== undefined && row[idx] !== null
            ? String(row[idx]).trim()
            : "";
        };
        const getHeaderVal = (row: any[], headerIdx: number) =>
          headerIdx === -1 ? "" : String(row[headerIdx] ?? "").trim();

        const listToInsert = rows
          .slice(1)
          .map((row) => {
            if (!row || row.length < 3) return null;

            const qText = getColVal(row, textIdx, 0);
            if (!qText) return null;

            const opt1 = getColVal(row, opt1Idx, 1);
            const opt2 = getColVal(row, opt2Idx, 2);
            const opt3 = getColVal(row, opt3Idx, 3);
            const opt4 = getColVal(row, opt4Idx, 4);

            const correctStr = getColVal(row, correctIdx, 5);
            const correctOption = parseInt(correctStr, 10) || 1;

            const rawCat = getColVal(row, catIdx, 6) || "عامة";
            const cat = normalizeCategory(rawCat);

            const diffRaw = getColVal(row, diffIdx, 7).toLowerCase();
            let difficulty: "easy" | "medium" | "hard" = "medium";
            if (diffRaw.includes("سهل") || diffRaw.includes("easy"))
              difficulty = "easy";
            else if (diffRaw.includes("صعب") || diffRaw.includes("hard"))
              difficulty = "hard";

            const rawType = getHeaderVal(row, typeIdx).toLowerCase();
            const imageUrl = getHeaderVal(row, imageIdx);
            const questionType: "text" | "image" | "word" =
              rawType.includes("word") || rawType.includes("كلمة")
                ? "word"
                : rawType.includes("image") ||
                    rawType.includes("صور") ||
                    rawType.includes("صورة") ||
                    rawType.includes("علم") ||
                    Boolean(imageUrl)
                  ? "image"
                  : "text";
            if (
              !opt1 ||
              (questionType === "word"
                ? false
                : !opt2 ||
                  !opt3 ||
                  (questionType === "text" && !opt4) ||
                  (questionType === "image" && !imageUrl))
            )
              return null;
            const maxCorrectOption =
              questionType === "word"
                ? 1
                : questionType === "image" && !opt4
                  ? 3
                  : 4;

            return {
              questionText: qText,
              questionType,
              imageUrl,
              option1: opt1,
              option2: questionType === "word" ? "" : opt2,
              option3: questionType === "word" ? "" : opt3,
              option4: questionType === "word" ? "" : opt4,
              correctOption:
                correctOption >= 1 && correctOption <= maxCorrectOption
                  ? correctOption
                  : 1,
              difficulty,
              category: cat,
              createdBy: profile.id,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        if (listToInsert.length === 0) {
          setError(
            "لم يتم العثور على أسطر صالحة للاستيراد. تأكد من تطابق عناوين الأعمدة.",
          );
          return;
        }

        const questionsWithStoredImages = await Promise.all(
          listToInsert.map(async (question) => {
            if (question.questionType !== "image") return question;
            return {
              ...question,
              imageUrl: await importImageFromUrl(question.imageUrl || ""),
            };
          }),
        );
        const count = await bulkAddQuestions(questionsWithStoredImages);
        setSuccess(`تم استيراد ${count} سؤال بنجاح من الملف!`);
        await fetchQuestions();
      } catch (err: any) {
        console.error("Error parsing file:", err);
        setError(err.message || "خطأ في معالجة أو رفع ملف Excel/CSV.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل بنك الأسئلة..." />
      </div>
    );
  }

  const isAdmin = profile?.role === "admin";
  const canManageQuestions =
    profile?.role === "admin" || profile?.role === "presenter";
  const canEditQuestion = (question: Question) =>
    isAdmin || question.createdBy === profile?.id;

  return (
    <div className="anim-rise space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <BookOpen className="h-6 w-6 text-neon-bright" />
            بنك الأسئلة المركزي
          </h2>
          <p className="mt-1 text-xs text-ink-mute">
            {isAdmin
              ? "بصفتك مديراً للنظام، يمكنك إضافة أسئلة جديدة، حذفها، أو استيرادها دفعة واحدة."
              : "بصفتك مقدماً، يمكنك إضافة أسئلة خاصة بك وإدارتها، واستخدام البنك المركزي لبناء تحدياتك."}
          </p>
        </div>
        {canManageQuestions && questionBankTab !== "top10" && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neon/30 bg-neon/10 px-4 py-2.5 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20">
            <Upload className="h-4 w-4" />
            استيراد أسئلة (Excel / CSV)
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        )}
      </div>

      <Card className="border border-cyan/20 bg-cyan/5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-ink">
              <FileSpreadsheet className="h-5 w-5 text-cyan" /> قوالب Excel لبنك
              الأسئلة
            </h3>
            <p className="mt-1 text-xs leading-6 text-ink-mute">
              اختر التصنيف ثم نزّل القالب المناسب. يوجد قالب مستقل للكلمات
              المفقودة (فئة + كلمة)، وقالب تخمين الصور بأربعة خيارات.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="تصنيف القالب">
              <Select
                value={templateCategory}
                onChange={(event) => setTemplateCategory(event.target.value)}
                className="min-w-36"
              >
                {CATEGORIES.slice(1).map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadExcelTemplate("text")}
            >
              <Download className="h-4 w-4" /> قالب نصي (4 خيارات)
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => downloadExcelTemplate("image")}
            >
              <ImageIcon className="h-4 w-4" /> قالب صور (3 خيارات)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadExcelTemplate("word")}
            >
              <Puzzle className="h-4 w-4" /> قالب كلمات
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadExcelTemplate("imageReveal")}
            >
              <ImageIcon className="h-4 w-4" /> قالب تخمين صور
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        {(
          [
            {
              id: "all",
              label: "بنك الأسئلة العام",
              description: "الأسئلة النصية والصور",
            },
            {
              id: "word",
              label: "الكلمات المفقودة",
              description: "فئة + كلمة تخمينية",
            },
            {
              id: "image-reveal",
              label: "تخمين الصور / كشف الستار",
              description: "الأسئلة المصورة + 4 خيارات",
            },
            {
              id: "top10",
              label: "TOP 10",
              description: "سؤال رئيسي + 10 إجابات ومرادفات",
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setQuestionBankTab(tab.id);
              if (tab.id === "word") {
                setQuestionType("word");
                setCorrectOption(1);
              }
              if (tab.id === "image-reveal") {
                setQuestionType("image");
                setImageOption4Enabled(true);
              }
            }}
            className={cn(
              "rounded-xl border px-4 py-2.5 text-right transition-all",
              questionBankTab === tab.id
                ? "border-neon/40 bg-neon/10 text-neon-bright shadow-[var(--shadow-neon-soft)]"
                : "border-line bg-void/30 text-ink-mute hover:text-ink",
            )}
          >
            <span className="block text-xs font-extrabold">{tab.label}</span>
            <span className="mt-1 block text-[10px] opacity-75">
              {tab.description}
            </span>
          </button>
        ))}
      </div>

      {/* Notifications */}
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

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Form */}
        {canManageQuestions && (
          <Card glow="neon" className="space-y-5 p-6 lg:col-span-1">
            <CardHeader
              title={editingQuestionId ? "تعديل السؤال" : "إضافة سؤال جديد"}
              icon={
                editingQuestionId ? (
                  <Pencil className="h-5 w-5" />
                ) : (
                  <Plus className="h-5 w-5" />
                )
              }
              action={
                editingQuestionId ? (
                  <button
                    type="button"
                    onClick={resetQuestionForm}
                    className="flex items-center gap-1 text-xs font-bold text-ink-mute hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" /> إلغاء
                  </button>
                ) : undefined
              }
            />
            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <Field
                label={
                  questionType === "word"
                    ? "التصنيف / الفئة"
                    : questionBankTab === "image-reveal"
                      ? "وصف الصورة أو السؤال"
                      : "نص السؤال"
                }
                required
              >
                <Textarea
                  required
                  placeholder={
                    questionType === "word"
                      ? "مثال: مهن ووظائف"
                      : questionBankTab === "image-reveal"
                        ? "مثال: ما هذه الدولة أو المعلم؟"
                        : "اكتب نص السؤال هنا..."
                  }
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="h-20"
                />
              </Field>

              <Field label="نوع السؤال">
                <div
                  className="grid grid-cols-3 rounded-xl border border-line bg-void/50 p-1"
                  role="tablist"
                  aria-label="نوع السؤال"
                >
                  {(
                    [
                      { value: "text", label: "سؤال نصي", icon: BookOpen },
                      { value: "image", label: "سؤال صورة", icon: ImageIcon },
                      { value: "word", label: "الكلمة المفقودة", icon: Puzzle },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => {
                    const active = questionType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => {
                          setQuestionType(value);
                          if (value !== "image") setImageOption4Enabled(false);
                          if (value === "image" && correctOption === 4)
                            setCorrectOption(1);
                          if (value === "word") setCorrectOption(1);
                        }}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-extrabold transition-all",
                          active
                            ? "bg-neon text-void shadow-[var(--shadow-neon-soft)]"
                            : "text-ink-mute hover:bg-white/5 hover:text-ink",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              {questionType === "image" && (
                <Field
                  label="رفع العلم أو الصورة"
                  required
                  hint="تُصغّر تلقائياً إلى حد أقصى 1600 بكسل وتُحوّل إلى WebP أقل من 2 ميغابايت لتظهر بسرعة للمتسابقين."
                >
                  <input
                    required={!imageUrl}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(event) =>
                      setImageFile(event.target.files?.[0] || null)
                    }
                    className="block w-full cursor-pointer rounded-xl border border-line bg-void/50 px-3 py-2 text-xs text-ink-soft file:ml-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-neon/15 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-neon-bright"
                  />
                </Field>
              )}

              {questionType === "image" && (imageFile || imageUrl) && (
                <img
                  src={imageFile ? URL.createObjectURL(imageFile) : imageUrl}
                  alt="معاينة السؤال"
                  className="mx-auto max-h-36 rounded-xl border border-line object-contain"
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={
                    questionType === "word" ? "الكلمة الصحيحة" : "الخيار الأول"
                  }
                  required
                >
                  <Input
                    required
                    placeholder={
                      questionType === "word" ? "مثال: مهندس" : undefined
                    }
                    value={option1}
                    onChange={(e) => setOption1(e.target.value)}
                  />
                </Field>
                {questionType !== "word" && (
                  <Field label="الخيار الثاني" required>
                    <Input
                      required
                      value={option2}
                      onChange={(e) => setOption2(e.target.value)}
                    />
                  </Field>
                )}
              </div>

              {questionType === "word" && (
                <Field label="التلميح (اختياري)">
                  <Input
                    value={wordHint}
                    onChange={(e) => setWordHint(e.target.value)}
                    placeholder="مثال: يستخدم المخططات والحسابات"
                  />
                </Field>
              )}

              {questionType !== "word" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="الخيار الثالث" required>
                    <Input
                      required
                      value={option3}
                      onChange={(e) => setOption3(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="الخيار الرابع"
                    required={
                      questionType === "text" ||
                      imageOption4Enabled ||
                      questionBankTab === "image-reveal"
                    }
                  >
                    <div className="flex gap-2">
                      <Input
                        required={
                          questionType === "text" ||
                          imageOption4Enabled ||
                          questionBankTab === "image-reveal"
                        }
                        disabled={
                          questionType === "image" &&
                          !imageOption4Enabled &&
                          questionBankTab !== "image-reveal"
                        }
                        value={option4}
                        onChange={(e) => setOption4(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            questionType === "image" &&
                            questionBankTab !== "image-reveal"
                          ) {
                            setImageOption4Enabled((enabled) => !enabled);
                            if (imageOption4Enabled) setOption4("");
                          }
                        }}
                        disabled={
                          questionType !== "image" ||
                          questionBankTab === "image-reveal"
                        }
                        className={cn(
                          "grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition",
                          imageOption4Enabled ||
                            questionBankTab === "image-reveal"
                            ? "border-success/40 bg-success/10 text-success-bright"
                            : "border-line bg-void/40 text-ink-mute",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                        title="تفعيل الخيار الرابع"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </Field>
                </div>
              )}

              {questionType !== "word" && (
                <Field label="الإجابة الصحيحة">
                  <Select
                    value={correctOption}
                    onChange={(e) =>
                      setCorrectOption(parseInt(e.target.value, 10))
                    }
                  >
                    <option value={1}>الخيار الأول</option>
                    <option value={2}>الخيار الثاني</option>
                    <option value={3}>الخيار الثالث</option>
                    {(questionType === "text" ||
                      imageOption4Enabled ||
                      questionBankTab === "image-reveal") && (
                      <option value={4}>الخيار الرابع</option>
                    )}
                  </Select>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="مستوى الصعوبة">
                  <Select
                    value={difficulty}
                    onChange={(e: any) => setDifficulty(e.target.value)}
                  >
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </Select>
                </Field>
                <Field
                  label={questionType === "word" ? "تصنيف الكلمات" : "التصنيف"}
                >
                  {questionType === "word" ? (
                    <Input
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="مثال: مهن"
                    />
                  ) : (
                    <Select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="عامة">عامة</option>
                      <option value="إسلامية">إسلامية</option>
                      <option value="علوم">علوم</option>
                      <option value="ألغاز">ألغاز</option>
                      <option value="عائلية">عائلية</option>
                      <option value="تاريخ">تاريخ</option>
                      <option value="جغرافيا">جغرافيا</option>
                      <option value="رياضة">رياضة</option>
                    </Select>
                  )}
                </Field>
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                size="lg"
                disabled={uploadingImage}
              >
                {uploadingImage
                  ? "جاري حفظ الصورة..."
                  : editingQuestionId
                    ? "حفظ التعديلات"
                    : "إدراج في بنك الأسئلة"}
              </Button>
            </form>
          </Card>
        )}

        {/* Filters + Table */}
        <div
          className={cn(
            "space-y-5",
            canManageQuestions && questionBankTab !== "top10"
              ? "lg:col-span-2"
              : "lg:col-span-3",
          )}
        >
          {questionBankTab === "top10" ? (
            <>
              <div className="glass flex flex-col gap-3 rounded-[var(--radius-card)] p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-black text-cyan">
                    بنك TOP 10 — {top10Questions.length} سؤال
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    كل بطاقة تحتوي سؤالاً رئيسياً و10 إجابات مع المرادفات.
                  </p>
                </div>
                <div className="w-full md:w-80">
                  <Input
                    type="text"
                    placeholder="ابحث في السؤال أو الإجابات..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {top10Questions
                  .filter((question) => {
                    const needle = searchQuery.trim().toLocaleLowerCase("ar");
                    return (
                      !needle ||
                      question.prompt
                        .toLocaleLowerCase("ar")
                        .includes(needle) ||
                      question.items.some((item) =>
                        item.answer.toLocaleLowerCase("ar").includes(needle),
                      )
                    );
                  })
                  .map((question) => (
                    <Card key={question.id} className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="rounded-lg border border-cyan/25 bg-cyan/10 px-2 py-1 text-[10px] font-black text-cyan">
                            TOP 10
                          </span>
                          <h3 className="mt-3 text-sm font-black leading-7 text-ink">
                            {question.prompt}
                          </h3>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteTop10(question.id)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-danger/25 bg-danger/10 text-danger-bright transition hover:bg-danger/20"
                            title="حذف سؤال TOP 10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {question.items.map((item, index) => (
                          <div
                            key={`${question.id}-${index}`}
                            className="rounded-xl border border-line bg-void/35 p-2.5"
                          >
                            <span className="font-display text-[10px] font-black text-gold">
                              #{index + 1}
                            </span>
                            <p className="mt-1 text-[11px] font-extrabold text-ink">
                              {item.answer}
                            </p>
                            {item.aliases.length > 0 && (
                              <p className="mt-1 text-[9px] leading-4 text-ink-faint">
                                {item.aliases.join("، ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="glass flex flex-col gap-3 rounded-[var(--radius-card)] p-4 md:flex-row md:items-center md:justify-between">
                <div className="w-full md:w-64">
                  <Input
                    type="text"
                    placeholder="ابحث عن سؤال..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<Search className="h-4 w-4" />}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="hidden h-4 w-4 text-ink-mute md:block" />
                  <Select
                    value={filterQuestionType}
                    onChange={(e) => setFilterQuestionType(e.target.value)}
                    className="md:w-40"
                  >
                    <option value="all">كل أنواع الأسئلة</option>
                    <option value="text">أسئلة نصية</option>
                    <option value="image">صور وأعلام</option>
                    <option value="word">الكلمة المفقودة</option>
                  </Select>
                  <Select
                    value={filterDifficulty}
                    onChange={(e) => setFilterDifficulty(e.target.value)}
                    className="md:w-36"
                  >
                    <option value="all">كل الصعوبات</option>
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </Select>
                </div>
              </div>

              {/* Category Tabs / Buttons */}
              <div className="flex flex-wrap gap-2 pb-1 overflow-x-auto no-scrollbar">
                {CATEGORIES.map((cat) => {
                  const isActive = filterCategory === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFilterCategory(cat.value)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none",
                        isActive
                          ? "bg-neon/15 text-neon-bright border-neon/40 shadow-[var(--shadow-neon-soft)]"
                          : "bg-void/40 text-ink-mute border-line hover:text-ink hover:bg-void/60",
                      )}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              <div className="glass overflow-hidden rounded-[var(--radius-card)]">
                {filteredQuestions.length === 0 ? (
                  <div className="p-12 text-center text-sm text-ink-mute">
                    لا توجد أسئلة تطابق الفلاتر المحددة.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="border-b border-line bg-void/40 text-ink-mute">
                          <th className="p-4 font-semibold">نص السؤال</th>
                          <th className="p-4 font-semibold">التصنيف</th>
                          <th className="p-4 font-semibold">الصعوبة</th>
                          {canManageQuestions && (
                            <th className="p-4 font-semibold">الإجراء</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-ink-soft">
                        {filteredQuestions.map((q) => (
                          <tr
                            key={q.id}
                            className="transition-colors hover:bg-white/5"
                          >
                            <td className="max-w-sm p-4">
                              <div className="flex items-start gap-3">
                                {q.questionType === "image" && q.imageUrl && (
                                  <img
                                    src={q.imageUrl}
                                    alt="علم السؤال"
                                    className="h-12 w-16 shrink-0 rounded-lg border border-line bg-white object-contain"
                                  />
                                )}
                                <div>
                                  <p className="font-bold text-ink">
                                    {q.questionText}
                                  </p>
                                  {q.questionType === "image" && (
                                    <span className="mt-1 inline-block rounded-md border border-cyan/25 bg-cyan/10 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                                      صورة / علم
                                    </span>
                                  )}
                                  {q.questionType === "word" && (
                                    <span className="mt-1 inline-block rounded-md border border-gold/25 bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold text-gold">
                                      الكلمة المفقودة
                                    </span>
                                  )}
                                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-faint">
                                    {[
                                      q.option1,
                                      q.option2,
                                      q.option3,
                                      q.option4,
                                    ].map(
                                      (option, index) =>
                                        option && (
                                          <span
                                            key={index}
                                            className={cn(
                                              q.correctOption === index + 1 &&
                                                "font-extrabold text-success-bright",
                                            )}
                                          >
                                            {index + 1}: {option}
                                          </span>
                                        ),
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <CategoryIcon category={q.category} />
                            </td>
                            <td className="p-4">
                              <DifficultyBadge difficulty={q.difficulty} />
                            </td>
                            {canManageQuestions && (
                              <td className="p-4">
                                {canEditQuestion(q) ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleEdit(q)}
                                      className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-neon/20 bg-neon/10 text-neon-bright transition-all hover:bg-neon/20"
                                      title="تعديل"
                                      aria-label="تعديل السؤال"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(q.id)}
                                      className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger-bright transition-all hover:bg-danger/20"
                                      title="حذف"
                                      aria-label="حذف السؤال"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-ink-faint">
                                    سؤال البنك المركزي
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
