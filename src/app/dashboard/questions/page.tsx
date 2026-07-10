'use client';

import { useEffect, useState } from 'react';
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
  const [category, setCategory] = useState('general');

  // Filter Fields
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
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
      result = result.filter(q => q.category === filterCategory);
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

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const rows = lines.slice(1);
        const listToInsert = rows.map(row => {
          const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 7) return null;
          return {
            questionText: cols[0],
            option1: cols[1],
            option2: cols[2],
            option3: cols[3] || '',
            option4: cols[4] || '',
            correctOption: parseInt(cols[5], 10) || 1,
            difficulty: (cols[6] || 'medium').toLowerCase() as 'easy' | 'medium' | 'hard',
            category: cols[7] || 'general',
            createdBy: profile.id,
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (listToInsert.length === 0) {
          setError('لم يتم العثور على أسطر صالحة للاستيراد.');
          return;
        }
        const count = await bulkAddQuestions(listToInsert);
        setSuccess(`تم استيراد ${count} سؤال بنجاح من الملف!`);
        await fetchQuestions();
      } catch (err: any) {
        setError(err.message || 'خطأ في معالجة أو رفع ملف CSV.');
      }
    };
    reader.readAsText(file, 'UTF-8');
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
            رفع ملف CSV
            <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
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
                    <option value="general">عام</option>
                    <option value="islamic">إسلامية</option>
                    <option value="riddles">ألغاز</option>
                    <option value="science">علوم</option>
                    <option value="family">عائلية</option>
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
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="md:w-36">
                <option value="all">كل التصنيفات</option>
                <option value="general">عام</option>
                <option value="islamic">إسلامية</option>
                <option value="riddles">ألغاز</option>
                <option value="science">علوم</option>
                <option value="family">عائلية</option>
              </Select>
            </div>
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
