'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Search, Filter, BookOpen, Upload, Download, Sparkles } from 'lucide-react';

export default function QuestionsPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<any[]>([]);
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
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (userProfile) setProfile(userProfile);

        await fetchQuestions();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    let result = [...questions];

    if (searchQuery.trim()) {
      result = result.filter(q => q.question_text.toLowerCase().includes(searchQuery.toLowerCase()));
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
    const { data } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
    if (data) {
      setQuestions(data);
      setFilteredQuestions(data);
    }
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
      const { error: insertError } = await supabase.from('questions').insert({
        question_text: questionText,
        option1,
        option2,
        option3: option3 || '',
        option4: option4 || '',
        correct_option: correctOption,
        difficulty,
        category,
        created_by: profile.id
      });

      if (insertError) throw insertError;

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

  const handleDelete = async (id: number) => {
    if (!profile || profile.role !== 'admin') {
      setError('عذراً، الأدمن فقط يمكنه مسح الأسئلة.');
      return;
    }

    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟')) return;

    try {
      const { error: deleteError } = await supabase.from('questions').delete().eq('id', id);
      if (deleteError) throw deleteError;

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
        
        // Skip header
        const rows = lines.slice(1);
        const listToInsert = rows.map(row => {
          // simple csv parse (split by comma)
          const cols = row.split(',').map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 7) return null;

          return {
            question_text: cols[0],
            option1: cols[1],
            option2: cols[2],
            option3: cols[3] || '',
            option4: cols[4] || '',
            correct_option: parseInt(cols[5], 10) || 1,
            difficulty: (cols[6] || 'medium').toLowerCase() as any,
            category: cols[7] || 'general',
            created_by: profile.id
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (listToInsert.length === 0) {
          setError('لم يتم العثور على أسطر صالحة للاستيراد.');
          return;
        }

        const { error: bulkError } = await supabase.from('questions').insert(listToInsert);
        if (bulkError) throw bulkError;

        setSuccess(`تم استيراد ${listToInsert.length} سؤال بنجاح من الملف!`);
        await fetchQuestions();
      } catch (err: any) {
        setError(err.message || 'خطأ في معالجة أو رفع ملف CSV.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-purple-500 border-white/5 animate-spin" />
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="space-y-10">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-purple-400" />
            بنك الأسئلة المركزي
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            {isAdmin 
              ? 'بصفتك مديراً للنظام (Admin)، يمكنك إضافة أسئلة جديدة، حذفها، أو استيرادها دفعة واحدة.' 
              : 'بصفتك مقدماً (Presenter)، يمكنك تصفح كافة الأسئلة المتوفرة لبناء تحدياتك.'}
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <label className="px-4 py-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" />
              رفع ملف CSV 📄
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </label>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/20 text-red-300 text-sm text-center">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 text-sm text-center">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Form: Add Question (Admin Only) */}
        {isAdmin && (
          <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-6">
            <h3 className="text-lg font-bold text-slate-200 flex items-center gap-1.5">
              <Plus className="w-5 h-5 text-purple-400" />
              إضافة سؤال جديد
            </h3>

            <form onSubmit={handleAddQuestion} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">نص السؤال</label>
                <textarea
                  required
                  placeholder="اكتب نص السؤال هنا..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500 transition-all h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">الخيار الأول (إجباري)</label>
                  <input
                    type="text"
                    required
                    value={option1}
                    onChange={(e) => setOption1(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">الخيار الثاني (إجباري)</label>
                  <input
                    type="text"
                    required
                    value={option2}
                    onChange={(e) => setOption2(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">الخيار الثالث (اختياري)</label>
                  <input
                    type="text"
                    value={option3}
                    onChange={(e) => setOption3(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">الخيار الرابع (اختياري)</label>
                  <input
                    type="text"
                    value={option4}
                    onChange={(e) => setOption4(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">الإجابة الصحيحة</label>
                <select
                  value={correctOption}
                  onChange={(e) => setCorrectOption(parseInt(e.target.value, 10))}
                  className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                >
                  <option value={1}>الخيار الأول</option>
                  <option value={2}>الخيار الثاني</option>
                  {option3.trim() && <option value={3}>الخيار الثالث</option>}
                  {option4.trim() && <option value={4}>الخيار الرابع</option>}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">مستوى الصعوبة</label>
                  <select
                    value={difficulty}
                    onChange={(e: any) => setDifficulty(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  >
                    <option value="easy">سهل 🟢</option>
                    <option value="medium">متوسط 🟡</option>
                    <option value="hard">صعب 🔴</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-300 font-medium">التصنيف / النوع</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                  >
                    <option value="general">عام 🌐</option>
                    <option value="islamic">🕌 إسلامية</option>
                    <option value="riddles">🧩 ألغاز</option>
                    <option value="science">🔬 علوم</option>
                    <option value="family">👪 عائلية</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-all mt-4"
              >
                إدراج في بنك الأسئلة
              </button>
            </form>
          </div>
        )}

        {/* Right Area: Table & Filters */}
        <div className={`space-y-6 ${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-64">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="ابحث عن سؤال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-9 py-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 text-xs outline-none focus:border-purple-500"
              />
            </div>

            {/* Select Filters */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Filter className="w-4 h-4 text-slate-400 hidden md:block" />
              <select
                value={filterDifficulty}
                onChange={(e) => setFilterDifficulty(e.target.value)}
                className="flex-1 md:w-36 p-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 text-xs outline-none"
              >
                <option value="all">كل الصعوبات 🌐</option>
                <option value="easy">سهل 🟢</option>
                <option value="medium">متوسط 🟡</option>
                <option value="hard">صعب 🔴</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="flex-1 md:w-36 p-2 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 text-xs outline-none"
              >
                <option value="all">كل التصنيفات 🌐</option>
                <option value="general">عام 🌐</option>
                <option value="islamic">🕌 إسلامية</option>
                <option value="riddles">🧩 ألغاز</option>
                <option value="science">🔬 علوم</option>
                <option value="family">👪 عائلية</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            {filteredQuestions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                لا توجد أسئلة تطابق الفلاتر المحددة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-white/5 text-slate-400 uppercase tracking-wider">
                      <th className="p-4 font-semibold">نص السؤال</th>
                      <th className="p-4 font-semibold">التصنيف</th>
                      <th className="p-4 font-semibold">الصعوبة</th>
                      {isAdmin && <th className="p-4 font-semibold">الإجراء</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-200">
                    {filteredQuestions.map((q) => (
                      <tr key={q.id} className="hover:bg-white/5 transition-all">
                        <td className="p-4 max-w-sm">
                          <p className="font-bold">{q.question_text}</p>
                          <div className="flex gap-2.5 text-[10px] text-slate-400 mt-1 font-medium">
                            <span className="text-green-400">1: {q.option1}</span>
                            <span className="text-green-400">2: {q.option2}</span>
                            {q.option3 && <span>3: {q.option3}</span>}
                            {q.option4 && <span>4: {q.option4}</span>}
                          </div>
                        </td>
                        <td className="p-4 font-medium">
                          {q.category === 'islamic' ? '🕌 إسلامية' :
                           q.category === 'riddles' ? '🧩 ألغاز' :
                           q.category === 'science' ? '🔬 علوم' :
                           q.category === 'family' ? '👪 عائلية' : 'عام 🌐'}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            q.difficulty === 'easy' ? 'bg-green-500/10 text-green-400 border border-green-500/10' :
                            q.difficulty === 'medium' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/10' :
                            'bg-red-500/10 text-red-400 border border-red-500/10'
                          }`}>
                            {q.difficulty === 'easy' ? 'سهل' :
                             q.difficulty === 'medium' ? 'متوسط' : 'صعب'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-4">
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="p-2 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 transition-all"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
