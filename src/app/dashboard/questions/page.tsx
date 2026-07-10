'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  getUserProfile, getQuestions, addQuestion, deleteQuestion, bulkAddQuestions,
} from '@/lib/db';
import type { Question } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Search, BookOpen, Upload, Filter } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea, Select } from '@/components/ui/Input';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';

const CATEGORIES = [
  { value: 'all', label: '🗂️ الكل' },
  { value: 'عامة', label: '🌍 عامة' },
  { value: 'إسلامية', label: '🕌 إسلامية' },
  { value: 'ألغاز', label: '🧩 ألغاز' },
  { value: 'علوم', label: '🔬 علوم' },
  { value: 'عائلية', label: '🏠 عائلية' },
  { value: 'تاريخ', label: '📜 تاريخ' },
  { value: 'جغرافيا', label: '🗺️ جغرافيا' },
  { value: 'رياضة', label: '⚽ رياضة' }
];

export function normalizeCategory(cat: string): string {
  if (!cat) return 'عامة';
  const c = cat.trim().toLowerCase();
  if (c === 'general' || c === 'general' || c === 'عام' || c === 'عامة') return 'عامة';
  if (c === 'islamic' || c === 'إسلامي' || c === 'إسلامية') return 'إسلامية';
  if (c === 'riddles' || c === 'لغز' || c === 'ألغاز') return 'ألغاز';
  if (c === 'science' || c === 'علم' || c === 'علوم') return 'علوم';
  if (c === 'family' || c === 'عائلة' || c === 'عائلية') return 'عائلية';
  if (c === 'history' || c === 'التاريخ' || c === 'تاريخ') return 'تاريخ';
  if (c === 'geography' || c === 'الجغرافيا' || c === 'جغرافيا') return 'جغرافيا';
  if (c === 'sports' || c === 'الرياضة' || c === 'رياضة') return 'رياضة';
  return cat.trim();
}

export default function QuestionsPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form Fields
  const [questionText, setQuestionText] = useState('');
  const [option1, setOption1] = useState('');
  const [option2, setOption2] = useState('');
  const [option3, setOption3] = useState('');
  const [option4, setOption4] = useState('');
  const [correctOption, setCorrectOption] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [category, setCategory] = useState('عامة');

  // Filter Fields
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); window.location.href = '/auth'; return; }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) setProfile({ id: userProfile.uid, username: userProfile.username, role: userProfile.role });
        await fetchQuestions();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let result = [...questions];
    if (searchQuery.trim()) {
      result = result.filter(q => q.questionText.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterDifficulty !== 'all') {
      result = result.filter(q => q.difficulty === filterDifficulty);
    }
    if (filterCategory !== 'all') {
      result = result.filter(q => normalizeCategory(q.category) === filterCategory);
    }
    setFilteredQuestions(result);
  }, [searchQuery, filterDifficulty, filterCategory, questions]);

  const fetchQuestions = async () => {
    const data = await getQuestions();
    setQuestions(data);
    setFilteredQuestions(data);
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || profile.role !== 'admin') {
      setError('خطأ: الأدمن فقط يمكنه إضافة أسئلة للبنك المركزي.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      await addQuestion({
        questionText,
        option1,
        option2,
        option3: option3 || '',
        option4: option4 || '',
        correctOption,
        difficulty,
        category,
        createdBy: profile.id,
      });
      setSuccess('تم إضافة السؤال بنجاح إلى بنك الأسئلة!');
      setQuestionText('');
      setOption1('');
      setOption2('');
      setOption3('');
      setOption4('');
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إضافة السؤال');
    }
  };

  const handleDelete = async (id: string) => {
    if (!profile || profile.role !== 'admin') {
      setError('عذراً، الأدمن فقط يمكنه مسح الأسئلة.');
      return;
    }
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟')) return;
    try {
      await deleteQuestion(id);
      setSuccess('تم حذف السؤال بنجاح.');
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حذف السؤال');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || profile.role !== 'admin') {
      setError('عذراً، الأدمن فقط يمكنه رفع الأسئلة.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse worksheet into rows (header: 1 returns 2D array of strings/numbers)
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          setError('الملف فارغ أو لا يحتوي على أسطر صالحة.');
          return;
        }

        // Detect column indices based on header names (case-insensitive & clean)
        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        
        const textIdx = headers.findIndex(h => h.includes('text') || h.includes('سؤال') || h === 'question_text');
        const opt1Idx = headers.findIndex(h => h === 'option1' || h.includes('خيار1') || h.includes('الاول') || h.includes('الأول'));
        const opt2Idx = headers.findIndex(h => h === 'option2' || h.includes('خيار2') || h.includes('الثاني'));
        const opt3Idx = headers.findIndex(h => h === 'option3' || h.includes('خيار3') || h.includes('الثالث'));
        const opt4Idx = headers.findIndex(h => h === 'option4' || h.includes('خيار4') || h.includes('الرابع'));
        const correctIdx = headers.findIndex(h => h.includes('correct') || h.includes('صحيح') || h === 'correct_option');
        const catIdx = headers.findIndex(h => h === 'category' || h.includes('قسم') || h.includes('تصنيف') || h === 'التصنيف');
        const diffIdx = headers.findIndex(h => h === 'difficulty' || h.includes('صعوب') || h === 'الصعوبة');

        const getColVal = (row: any[], headerIdx: number, fallbackIdx: number) => {
          const idx = headerIdx !== -1 ? headerIdx : fallbackIdx;
          return row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
        };

        const listToInsert = rows.slice(1).map(row => {
          if (!row || row.length < 3) return null;
          
          const qText = getColVal(row, textIdx, 0);
          if (!qText) return null;

          const opt1 = getColVal(row, opt1Idx, 1);
          const opt2 = getColVal(row, opt2Idx, 2);
          const opt3 = getColVal(row, opt3Idx, 3);
          const opt4 = getColVal(row, opt4Idx, 4);

          const correctStr = getColVal(row, correctIdx, 5);
          const correctOption = parseInt(correctStr, 10) || 1;

          const rawCat = getColVal(row, catIdx, 6) || 'عامة';
          const cat = normalizeCategory(rawCat);

          const diffRaw = getColVal(row, diffIdx, 7).toLowerCase();
          let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
          if (diffRaw.includes('سهل') || diffRaw.includes('easy')) difficulty = 'easy';
          else if (diffRaw.includes('صعب') || diffRaw.includes('hard')) difficulty = 'hard';

          return {
            questionText: qText,
            option1: opt1,
            option2: opt2,
            option3: opt3,
            option4: opt4,
            correctOption,
            difficulty,
            category: cat,
            createdBy: profile.id,
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (listToInsert.length === 0) {
          setError('لم يتم العثور على أسطر صالحة للاستيراد. تأكد من تطابق عناوين الأعمدة.');
          return;
        }

        const count = await bulkAddQuestions(listToInsert);
        setSuccess(`تم استيراد ${count} سؤال بنجاح من الملف!`);
        await fetchQuestions();
      } catch (err: any) {
        console.error('Error parsing file:', err);
        setError(err.message || 'خطأ في معالجة أو رفع ملف Excel/CSV.');
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

  const isAdmin = profile?.role === 'admin';

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
              ? 'بصفتك مديراً للنظام، يمكنك إضافة أسئلة جديدة، حذفها، أو استيرادها دفعة واحدة.'
              : 'بصفتك مقدماً، يمكنك تصفح كافة الأسئلة المتوفرة لبناء تحدياتك.'}
          </p>
        </div>
        {isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neon/30 bg-neon/10 px-4 py-2.5 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20">
            <Upload className="h-4 w-4" />
            استيراد أسئلة (Excel / CSV)
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          </label>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="anim-shake rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-center text-sm text-success-bright">{success}</div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Form */}
        {isAdmin && (
          <Card glow="neon" className="space-y-5 p-6 lg:col-span-1">
            <CardHeader title="إضافة سؤال جديد" icon={<Plus className="h-5 w-5" />} />
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <Field label="نص السؤال" required>
                <Textarea
                  required
                  placeholder="اكتب نص السؤال هنا..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="h-20"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="الخيار الأول" required>
                  <Input required value={option1} onChange={(e) => setOption1(e.target.value)} />
                </Field>
                <Field label="الخيار الثاني" required>
                  <Input required value={option2} onChange={(e) => setOption2(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="الخيار الثالث (اختياري)">
                  <Input value={option3} onChange={(e) => setOption3(e.target.value)} />
                </Field>
                <Field label="الخيار الرابع (اختياري)">
                  <Input value={option4} onChange={(e) => setOption4(e.target.value)} />
                </Field>
              </div>

              <Field label="الإجابة الصحيحة">
                <Select value={correctOption} onChange={(e) => setCorrectOption(parseInt(e.target.value, 10))}>
                  <option value={1}>الخيار الأول</option>
                  <option value={2}>الخيار الثاني</option>
                  {option3.trim() && <option value={3}>الخيار الثالث</option>}
                  {option4.trim() && <option value={4}>الخيار الرابع</option>}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="مستوى الصعوبة">
                  <Select value={difficulty} onChange={(e: any) => setDifficulty(e.target.value)}>
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </Select>
                </Field>
                <Field label="التصنيف">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="عامة">عامة</option>
                    <option value="إسلامية">إسلامية</option>
                    <option value="علوم">علوم</option>
                    <option value="ألغاز">ألغاز</option>
                    <option value="عائلية">عائلية</option>
                    <option value="تاريخ">تاريخ</option>
                    <option value="جغرافيا">جغرافيا</option>
                    <option value="رياضة">رياضة</option>
                  </Select>
                </Field>
              </div>

              <Button type="submit" variant="primary" fullWidth size="lg">إدراج في بنك الأسئلة</Button>
            </form>
          </Card>
        )}

        {/* Filters + Table */}
        <div className={cn('space-y-5', isAdmin ? 'lg:col-span-2' : 'lg:col-span-3')}>
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
            <div className="flex items-center gap-2">
              <Filter className="hidden h-4 w-4 text-ink-mute md:block" />
              <Select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="md:w-36">
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
                      : "bg-void/40 text-ink-mute border-line hover:text-ink hover:bg-void/60"
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {filteredQuestions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لا توجد أسئلة تطابق الفلاتر المحددة.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-line bg-void/40 text-ink-mute">
                      <th className="p-4 font-semibold">نص السؤال</th>
                      <th className="p-4 font-semibold">التصنيف</th>
                      <th className="p-4 font-semibold">الصعوبة</th>
                      {isAdmin && <th className="p-4 font-semibold">الإجراء</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink-soft">
                    {filteredQuestions.map((q) => (
                      <tr key={q.id} className="transition-colors hover:bg-white/5">
                        <td className="max-w-sm p-4">
                          <p className="font-bold text-ink">{q.questionText}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-faint">
                            <span className="text-success-bright">1: {q.option1}</span>
                            <span className="text-success-bright">2: {q.option2}</span>
                            {q.option3 && <span>3: {q.option3}</span>}
                            {q.option4 && <span>4: {q.option4}</span>}
                          </div>
                        </td>
                        <td className="p-4"><CategoryIcon category={q.category} /></td>
                        <td className="p-4"><DifficultyBadge difficulty={q.difficulty} /></td>
                        {isAdmin && (
                          <td className="p-4">
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger-bright transition-all hover:bg-danger/20"
                              title="حذف"
                              aria-label="حذف السؤال"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
