'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createSession, getQuestions, getUserProfile } from '@/lib/db';
import type { Question, UserProfile } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Armchair, Check, ChevronLeft, ChevronRight, Dices, Image as ImageIcon, Layers, Search, Sparkles, Timer, WandSparkles, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';

type GameMode = 'quiz' | 'chairs' | 'survival' | 'faction' | 'impostor' | 'roulette' | 'word' | 'image-reveal' | 'tarkeeba' | 'baathra' | 'money';
type PickMode = 'manual' | 'random' | 'custom';
type GameQuestionRule = { categories?: string[]; questionTypes?: Array<'text' | 'image' | 'word'> };

const MODE_INFO: Array<{ id: GameMode; title: string; description: string; icon: typeof Layers; tone: string }> = [
  { id: 'quiz', title: 'تحدي الأسئلة والإعلام', description: 'أسئلة نصية، صور أو أعلام مع خيارات.', icon: ImageIcon, tone: 'text-neon-bright border-neon/35 bg-neon/10' },
  { id: 'chairs', title: 'لعبة الكراسي', description: 'اختر رقم كرسي؛ أول لاعب يحجزه يتأهل.', icon: Armchair, tone: 'text-gold border-gold/35 bg-gold/10' },
  { id: 'survival', title: 'الزنزانة', description: 'خطأ واحد أو تأخر في الوقت يعني الإقصاء.', icon: Dices, tone: 'text-danger-bright border-danger/35 bg-danger/10' },
  { id: 'faction', title: 'حرب الفواكه / الدول', description: 'فريقان يتنافسان بنقاط إجاباتهم السريعة.', icon: Layers, tone: 'text-success-bright border-success/35 bg-success/10' },
  { id: 'impostor', title: 'أمبوستر', description: 'كلمة سرية، مناقشة، ثم تصويت لكشف الخائن.', icon: Dices, tone: 'text-danger-bright border-danger/35 bg-danger/10' },
  { id: 'roulette', title: 'عجلة الروليت', description: 'مكافأة عشوائية يتحكم بها الفائز من جواله.', icon: Sparkles, tone: 'text-gold border-gold/35 bg-gold/10' },
  { id: 'word', title: 'الكلمة المفقودة', description: 'أكمل الكلمة من الحروف بأسرع وقت.', icon: WandSparkles, tone: 'text-cyan border-cyan/35 bg-cyan/10' },
  { id: 'image-reveal', title: 'تخمين الصورة — كشف الستار', description: 'صورة مخفية بمربعات تنكشف تدريجياً مع 4 خيارات.', icon: ImageIcon, tone: 'text-pink-400 border-pink-400/35 bg-pink-500/10' },
  { id: 'tarkeeba', title: 'تركيبة', description: 'خمن الكلمة السرية خلال 6 محاولات مع تلميحات الألوان.', icon: Dices, tone: 'text-gold border-gold/35 bg-gold/10' },
  { id: 'baathra', title: 'بعثرة', description: 'كوّن الكلمات في طور السرعة أو طور الطلبات الإبداعية.', icon: WandSparkles, tone: 'text-magenta border-magenta/35 bg-magenta/10' },
  { id: 'money', title: 'فلوسك على المحك', description: 'لوحة فئات ومبالغ بين الفرق مع تقييم شفهي.', icon: Sparkles, tone: 'text-success-bright border-success/35 bg-success/10' },
];

export default function GamesOfficePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [gameMode, setGameMode] = useState<GameMode>('quiz');
  const [title, setTitle] = useState('');
  const [timerDuration, setTimerDuration] = useState(30);
  const [pickMode, setPickMode] = useState<PickMode>('manual');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [randomSelectionApplied, setRandomSelectionApplied] = useState(false);
  const [customCandidateIds, setCustomCandidateIds] = useState<string[]>([]);
  const [customCandidateSelectedIds, setCustomCandidateSelectedIds] = useState<string[]>([]);
  const [randomCount, setRandomCount] = useState(10);
  const [category, setCategory] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [search, setSearch] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [savingRoomCode, setSavingRoomCode] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameModeVisibility, setGameModeVisibility] = useState<Record<string, boolean>>({});
  const [gameQuestionRules, setGameQuestionRules] = useState<Record<string, GameQuestionRule>>({});
  const [impostorWord, setImpostorWord] = useState('');
  const [impostorCategory, setImpostorCategory] = useState('');
  const [discussionDuration, setDiscussionDuration] = useState(90);
  const [roulettePrizes, setRoulettePrizes] = useState('جائزة ذهبية، 50 نقطة إضافية، بطاقة حظ، مفاجأة');
  const [wordMaxAttempts, setWordMaxAttempts] = useState(7);
  const [imageRevealGrid, setImageRevealGrid] = useState<4 | 6 | 8>(6);
  const [tarkeebaWord, setTarkeebaWord] = useState('');
  const [tarkeebaCategory, setTarkeebaCategory] = useState('كلمات عامة');
  const [baathraMode, setBaathraMode] = useState<'speed' | 'requests'>('speed');
  const [baathraSecret, setBaathraSecret] = useState('');
  const [baathraLetters, setBaathraLetters] = useState('');
  const [baathraCategory, setBaathraCategory] = useState('اسم ولد');
  const [baathraScoring, setBaathraScoring] = useState<'first' | 'ranked'>('ranked');
  const [moneyCategories, setMoneyCategories] = useState<string[]>(['عامة', 'إسلامية', 'ألغاز', 'علوم', 'تاريخ']);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/auth'); return; }
      try {
        const [userProfile, questionList, tokenResult, modesResponse] = await Promise.all([getUserProfile(user.uid), getQuestions(), user.getIdTokenResult(), fetch('/api/game-modes')]);
        setProfile(userProfile);
        setRoomCode(userProfile?.roomCode || '');
        setQuestions(questionList);
        setIsAdmin(tokenResult.claims.admin === true);
        if (modesResponse.ok) {
          const settings = await modesResponse.json() as { enabled?: Record<string, boolean>; questionRules?: Record<string, GameQuestionRule> };
          setGameModeVisibility(settings.enabled || {});
          setGameQuestionRules(settings.questionRules || {});
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل مكتبة الألعاب.');
      } finally { setLoading(false); }
    });
  }, [router]);

  const filteredQuestions = useMemo(() => questions.filter((question) => {
    const rule = gameQuestionRules[gameMode];
    if (gameMode === 'word' && question.questionType !== 'word') return false;
    if (gameMode === 'image-reveal' && (question.questionType !== 'image' || !question.imageUrl || !question.option4)) return false;
    if (rule?.categories?.length && !rule.categories.includes(question.category)) return false;
    if (rule?.questionTypes?.length && !rule.questionTypes.includes(question.questionType || 'text')) return false;
    if (category !== 'all' && question.category !== category) return false;
    if (difficulty !== 'all' && question.difficulty !== difficulty) return false;
    return !search.trim() || question.questionText.toLowerCase().includes(search.trim().toLowerCase());
  }), [questions, category, difficulty, search, gameMode, gameQuestionRules]);

  const chosenIds = useMemo(() => {
    if (!['quiz', 'survival', 'faction', 'word', 'image-reveal'].includes(gameMode)) return [];
    return selectedIds;
  }, [gameMode, selectedIds]);
  const usesQuestions = ['quiz', 'survival', 'faction', 'word', 'image-reveal'].includes(gameMode);
  const availableModes = isAdmin ? MODE_INFO : MODE_INFO.filter((mode) => gameModeVisibility[mode.id] !== false);

  const customCandidateQuestions = customCandidateIds.flatMap(id => {
    const question = questions.find(item => item.id === id);
    return question ? [question] : [];
  });

  const applyRandomSelection = () => {
    if (filteredQuestions.length === 0) {
      setError('لا توجد أسئلة تطابق الفلترة الحالية.');
      return;
    }
    const pool = [...filteredQuestions].sort(() => Math.random() - 0.5);
    setSelectedIds(pool.slice(0, Math.min(randomCount, pool.length)).map(question => question.id));
    setRandomSelectionApplied(true);
    setError('');
  };

  const generateCustomCandidates = () => {
    const pool = filteredQuestions.filter(question => !selectedIds.includes(question.id));
    if (pool.length === 0) {
      setError('لا توجد أسئلة جديدة تطابق الفلترة الحالية. غيّر الفلترة أو احذف سؤالاً من المجموعة.');
      return;
    }
    const ids = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(randomCount, pool.length)).map(question => question.id);
    setCustomCandidateIds(ids);
    setCustomCandidateSelectedIds([]);
    setError('');
  };

  const commitCustomCandidates = () => {
    if (customCandidateSelectedIds.length === 0) {
      setError('اختر سؤالاً واحداً على الأقل من الاقتراحات قبل الاعتماد.');
      return;
    }
    setSelectedIds(ids => [...new Set([...ids, ...customCandidateSelectedIds])]);
    setCustomCandidateIds(ids => ids.filter(id => !customCandidateSelectedIds.includes(id)));
    setCustomCandidateSelectedIds([]);
    setError('');
  };

  const saveRoomCode = async () => {
    if (!/^\d{4}$/.test(roomCode)) { setError('رمز الغرفة يتكون من 4 أرقام.'); return; }
    const user = auth.currentUser;
    if (!user) return;
    setSavingRoomCode(true); setError('');
    try {
      const response = await fetch('/api/presenter/room-code', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ roomCode }) });
      const data = await response.json() as { roomCode?: string; error?: string };
      if (!response.ok || !data.roomCode) throw new Error(data.error || 'تعذر حفظ رمز الغرفة.');
      setProfile(current => current ? { ...current, roomCode: data.roomCode } : current);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الرمز.'); }
    finally { setSavingRoomCode(false); }
  };

  const createGame = async (openControl = true) => {
    if (!profile?.roomCode) { setError('احجز رمز الغرفة أولاً.'); setStep(1); return; }
    if (!title.trim()) { setError('اكتب اسم التحدي.'); setStep(1); return; }
    if (usesQuestions && chosenIds.length === 0) { setError('اختر سؤالاً واحداً على الأقل.'); setStep(2); return; }
    if (gameMode === 'impostor' && !impostorWord.trim()) { setError('اكتب الكلمة السرية للعبة أمبوستر.'); setStep(2); return; }
    if (gameMode === 'tarkeeba' && !tarkeebaWord.trim()) { setError('اكتب الكلمة السرية للعبة تركيبة.'); setStep(2); return; }
    if (gameMode === 'baathra' && !(baathraMode === 'speed' ? baathraSecret.trim() : baathraLetters.trim())) { setError('أدخل كلمة البعثرة أو الأحرف المتاحة.'); setStep(2); return; }
    if (gameMode === 'money' && moneyCategories.length !== 5) { setError('اختر 5 فئات بالضبط للعبة فلوسك على المحك.'); setStep(2); return; }
    setCreating(true); setError('');
    try {
      const id = await createSession({
        title: title.trim(), roomCode: profile.roomCode, timerDuration, createdBy: profile.uid,
        status: 'waiting', currentQuestionId: null, questionStatus: 'idle', showScoreboard: false,
        questionIds: chosenIds, gameMode, chairCount: 0, chairRound: 0, joiningLocked: false, isDraft: !openControl,
        ...(gameMode === 'faction' ? { teamsEnabled: true, teamSize: 999 } : {}),
        ...(gameMode === 'impostor' ? { impostorWord: impostorWord.trim(), impostorCategory: impostorCategory.trim(), impostorPhase: 'waiting' as const, discussionDuration } : {}),
        ...(gameMode === 'roulette' ? { rouletteStatus: 'idle' as const, roulettePrize: roulettePrizes } : {}),
        ...(gameMode === 'word' ? { wordMaxAttempts } : {}),
        ...(gameMode === 'image-reveal' ? { imageRevealGrid } : {}),
        ...(gameMode === 'tarkeeba' ? { tarkeebaSecret: typeof window === 'undefined' ? tarkeebaWord.trim() : btoa(unescape(encodeURIComponent(tarkeebaWord.trim()))), tarkeebaCategory: tarkeebaCategory.trim() || 'كلمات عامة', tarkeebaMaxAttempts: 6 } : {}),
        ...(gameMode === 'baathra' ? { baathraMode, baathraSecret: baathraMode === 'speed' ? btoa(unescape(encodeURIComponent(baathraSecret.trim()))) : '', baathraLetters: baathraMode === 'requests' ? baathraLetters.replace(/[،,\s]+/g, '').split('') : [], baathraCategory, baathraScoring } : {}),
        ...(gameMode === 'money' ? { moneyCategories, moneyTeams: [{ id: 'red', name: 'الفريق الأحمر', color: '#ef4444', balance: 0 }, { id: 'green', name: 'الفريق الأخضر', color: '#22c55e', balance: 0 }], moneyBoard: [], moneyActiveTeamId: 'red', moneyCurrentCellId: null } : {}),
      });
      router.push(openControl ? `/dashboard/sessions?id=${id}` : '/dashboard/sessions');
    } catch (createError) { setError(createError instanceof Error ? createError.message : 'تعذر إنشاء التحدي.'); }
    finally { setCreating(false); }
  };

  if (loading) return <div className="flex flex-1 items-center justify-center py-24"><Spinner size="lg" label="جاري فتح مكتب الألعاب..." /></div>;

  return <div className="anim-rise mx-auto max-w-5xl space-y-7">
    <div className="text-center"><span className="inline-flex items-center gap-2 rounded-full border border-neon/25 bg-neon/10 px-4 py-1.5 text-xs font-bold text-neon-bright"><WandSparkles className="h-4 w-4" /> مكتب الألعاب</span><h1 className="mt-3 text-3xl font-extrabold text-ink">أنشئ تحديك خطوة بخطوة</h1><p className="mt-2 text-sm text-ink-mute">اختر اللعبة، جهّز محتواها، ثم ابدأ التحكم المباشر.</p></div>
    {error && <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">{error}</div>}

    {step === 1 && <Card glow="neon" className="space-y-6 p-6"><CardHeader title="1. اختر نوع التحدي" icon={<Sparkles className="h-5 w-5" />} />
      <div className="grid gap-4 md:grid-cols-2">{availableModes.map(mode => { const Icon = mode.icon; return <button key={mode.id} type="button" onClick={() => setGameMode(mode.id)} className={cn('rounded-2xl border p-5 text-right transition-all', gameMode === mode.id ? mode.tone + ' shadow-lg' : 'border-line bg-void/30 text-ink-mute hover:border-white/25')}><Icon className="h-7 w-7" /><h2 className="mt-4 font-bold text-ink">{mode.title}</h2><p className="mt-1 text-xs leading-6">{mode.description}</p>{gameMode === mode.id && <Check className="mt-3 h-4 w-4" />}</button>; })}</div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="اسم التحدي" required><Input required value={title} onChange={event => setTitle(event.target.value)} placeholder="مثال: تحدي مساء الجمعة" /></Field><Field label="رمز الغرفة (4 أرقام)"><div className="flex gap-2" dir="ltr"><Input maxLength={4} value={roomCode} onChange={event => setRoomCode(event.target.value.replace(/\D/g, ''))} className="w-28 text-center font-display font-bold tracking-[.25em]" placeholder="0000" /><Button type="button" variant="outline" size="sm" onClick={saveRoomCode} disabled={savingRoomCode || !/^\d{4}$/.test(roomCode)}>{savingRoomCode ? '...' : profile?.roomCode === roomCode ? 'محفوظ' : 'حفظ'}</Button></div></Field></div>
      <div className="flex justify-end"><Button onClick={() => { if (!title.trim()) { setError('اكتب اسم التحدي.'); return; } if (!profile?.roomCode) { setError('احجز رمز الغرفة أولاً.'); return; } setError(''); setStep(2); }}>التالي <ChevronLeft className="h-4 w-4" /></Button></div>
    </Card>}

    {step === 2 && <Card className="space-y-5 p-6"><CardHeader title={gameMode === 'chairs' ? '2. إعداد جولات الكراسي' : gameMode === 'impostor' ? '2. إعداد الكلمة السرية' : gameMode === 'roulette' ? '2. إعداد المكافآت' : '2. اختر أسئلة التحدي'} icon={gameMode === 'chairs' ? <Armchair className="h-5 w-5" /> : <Dices className="h-5 w-5" />} />
      {gameMode === 'chairs' ? <div className="rounded-2xl border border-gold/25 bg-gold/5 p-5"><Armchair className="h-9 w-9 text-gold" /><h3 className="mt-3 font-bold text-ink">عدد الكراسي يُحدّد تلقائياً</h3><p className="mt-2 text-sm leading-7 text-ink-mute">عند بدء الجولة يحسب النظام عدد الحضور الفعليين ويضع كرسيين أقل منهم: 10 متسابقين = 8 كراسٍ. يعاد الحساب في كل جولة بحسب المتأهلين.</p></div> : gameMode === 'impostor' ? <div className="grid gap-4 md:grid-cols-3"><Field label="الكلمة السرية" required><Input value={impostorWord} onChange={event => setImpostorWord(event.target.value)} placeholder="مثال: تفاحة" /></Field><Field label="التصنيف"><Input value={impostorCategory} onChange={event => setImpostorCategory(event.target.value)} placeholder="مثال: فواكه" /></Field><Field label="مدة النقاش"><Select value={discussionDuration} onChange={event => setDiscussionDuration(Number(event.target.value))}><option value={60}>دقيقة</option><option value={90}>90 ثانية</option><option value={120}>دقيقتان</option></Select></Field></div> : gameMode === 'tarkeeba' ? <div className="grid gap-4 md:grid-cols-2"><Field label="الكلمة السرية" required><Input value={tarkeebaWord} onChange={event => setTarkeebaWord(event.target.value.replace(/\s/g, ''))} placeholder="مثال: زهور" /></Field><Field label="الفئة"><Input value={tarkeebaCategory} onChange={event => setTarkeebaCategory(event.target.value)} placeholder="مثال: نباتات" /></Field><p className="md:col-span-2 text-xs leading-6 text-ink-mute">لدى كل متسابق 6 محاولات. النقاط من 6 في المحاولة الأولى إلى نقطة في السادسة.</p></div> : gameMode === 'baathra' ? <div className="space-y-4"><div className="flex gap-2"><Button type="button" size="sm" variant={baathraMode === 'speed' ? 'primary' : 'ghost'} onClick={() => setBaathraMode('speed')}>طور السرعة</Button><Button type="button" size="sm" variant={baathraMode === 'requests' ? 'primary' : 'ghost'} onClick={() => setBaathraMode('requests')}>طور الطلبات</Button></div>{baathraMode === 'speed' ? <><Field label="الكلمة الصحيحة"><Input value={baathraSecret} onChange={event => setBaathraSecret(event.target.value.replace(/\s/g, ''))} placeholder="مثال: تفاح" /></Field><Field label="نظام النقاط"><Select value={baathraScoring} onChange={event => setBaathraScoring(event.target.value as 'first' | 'ranked')}><option value="first">الأسرع فقط</option><option value="ranked">3، 2، 1 حسب الترتيب</option></Select></Field></> : <><Field label="الأحرف المتاحة"><Input value={baathraLetters} onChange={event => setBaathraLetters(event.target.value)} placeholder="مثال: س، ر، ب، ح، ا، د" /></Field><Field label="التصنيف المطلوب"><Input value={baathraCategory} onChange={event => setBaathraCategory(event.target.value)} placeholder="مثال: اسم ولد" /></Field></>}</div> : gameMode === 'roulette' ? <Field label="الجوائز (افصل بينها بفاصلة)"><Input value={roulettePrizes} onChange={event => setRoulettePrizes(event.target.value)} /></Field> : <>
        {gameMode === 'image-reveal' && <div className="rounded-2xl border border-pink-400/25 bg-pink-500/5 p-4"><p className="text-sm font-bold text-pink-400">إعداد شبكة كشف الصورة</p><div className="mt-3 max-w-xs"><Field label="مستوى الصعوبة"><Select value={imageRevealGrid} onChange={event => setImageRevealGrid(Number(event.target.value) as 4 | 6 | 8)}><option value={4}>🟢 سهل — 4×4</option><option value={6}>🟡 متوسط — 6×6</option><option value={8}>🔴 صعب — 8×8</option></Select></Field></div><p className="mt-2 text-xs text-ink-mute">يختفي مربع كل 3 ثوانٍ، وفي الصعب تختفي 3 مربعات في كل مرة. تظهر هنا فقط أسئلة الصور ذات 4 خيارات.</p></div>}
        {gameMode === 'word' && <div className="rounded-2xl border border-cyan/25 bg-cyan/5 p-4"><p className="text-sm font-bold text-cyan">تخمين الأحرف</p><div className="mt-3 max-w-xs"><Field label="عدد القلوب لكل متسابق"><Select value={wordMaxAttempts} onChange={event => setWordMaxAttempts(Number(event.target.value))}><option value={5}>5 قلوب</option><option value={7}>7 قلوب</option><option value={10}>10 قلوب</option></Select></Field></div><p className="mt-2 text-xs text-ink-mute">اختر كلمات من نوع «الكلمة المفقودة». كل متسابق يكشف الحروف بشكل مستقل.</p></div>}
        <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={pickMode === 'manual' ? 'primary' : 'ghost'} onClick={() => setPickMode('manual')}>اختيار يدوي</Button><Button type="button" size="sm" variant={pickMode === 'random' ? 'primary' : 'ghost'} onClick={() => { setPickMode('random'); setRandomSelectionApplied(false); }}>اختيار عشوائي</Button><Button type="button" size="sm" variant={pickMode === 'custom' ? 'primary' : 'ghost'} onClick={() => setPickMode('custom')}>مخصص</Button></div>
        <div className="grid gap-3 md:grid-cols-4"><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث..." icon={<Search className="h-4 w-4" />} /><Select value={category} onChange={event => setCategory(event.target.value)}><option value="all">كل التصنيفات</option>{[...new Set(questions.map(question => question.category))].map(item => <option key={item}>{item}</option>)}</Select><Select value={difficulty} onChange={event => setDifficulty(event.target.value)}><option value="all">كل الصعوبات</option><option value="easy">سهل</option><option value="medium">متوسط</option><option value="hard">صعب</option></Select>{(pickMode === 'random' || pickMode === 'custom') && <Input type="number" min={1} max={filteredQuestions.length || 1} value={randomCount} onChange={event => setRandomCount(Math.max(1, Number(event.target.value) || 1))} />}</div>
        {pickMode === 'random' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neon/25 bg-neon/5 p-3"><p className="text-xs leading-6 text-ink-mute">حدّد الفلترة والعدد، ثم نفّذ الاختيار. بعد ذلك راجع الأسئلة واحذف ما لا تحتاجه.</p><Button type="button" size="sm" onClick={applyRandomSelection}>نفّذ الاختيار العشوائي</Button></div>}
        {pickMode === 'custom' && <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-ink">ابنِ مجموعتك بعناية</p><p className="mt-1 text-xs leading-6 text-ink-mute">اعرض اقتراحات من هذه الفلترة، اختر منها ما تريد، ثم اعتمدها في مجموعتك. غيّر الفلترة وكرر العملية حتى تكتمل الجلسة.</p></div><Button type="button" size="sm" variant="outline" onClick={generateCustomCandidates}>عرض {randomCount} اقتراحات</Button></div>{customCandidateQuestions.length > 0 && <div className="mt-4 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-bold text-gold">اختر من الاقتراحات: {customCandidateSelectedIds.length}</span><Button type="button" size="sm" variant="success" onClick={commitCustomCandidates} disabled={customCandidateSelectedIds.length === 0}>اعتماد المختار وإضافته للمجموعة</Button></div>{customCandidateQuestions.map(question => <button key={question.id} type="button" onClick={() => setCustomCandidateSelectedIds(ids => ids.includes(question.id) ? ids.filter(id => id !== question.id) : [...ids, question.id])} className={cn('flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right text-sm transition-all', customCandidateSelectedIds.includes(question.id) ? 'border-gold/50 bg-gold/10' : 'border-line bg-void/40 hover:border-gold/30')}><div className="flex min-w-0 items-center gap-3">{question.questionType === 'image' && question.imageUrl ? <img src={question.imageUrl} alt="معاينة السؤال" className="h-10 w-14 shrink-0 rounded-lg border border-line bg-white object-contain" /> : <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg border border-line bg-void/50 text-lg">{question.questionType === 'word' ? '🧩' : '❔'}</span>}<div className="min-w-0"><p className="truncate font-bold text-ink">{question.questionText}</p><div className="mt-1.5 flex flex-wrap gap-2"><CategoryIcon category={question.category} /><DifficultyBadge difficulty={question.difficulty} /></div></div></div>{customCandidateSelectedIds.includes(question.id) && <Check className="h-4 w-4 shrink-0 text-gold" />}</button>)}</div>}</div>}
        <p className="text-xs font-bold text-neon-bright">{pickMode === 'manual' ? `اخترت ${selectedIds.length} سؤال` : pickMode === 'custom' ? `المجموعة المعتمدة: ${selectedIds.length} سؤال` : randomSelectionApplied ? `تم اختيار ${selectedIds.length} سؤال — يمكنك حذف أي سؤال أدناه.` : `سيُختار ${randomCount} سؤال عند الضغط على «نفّذ الاختيار العشوائي».`}</p>
        {pickMode === 'random' && randomSelectionApplied && <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-neon/30 bg-neon/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-ink">الأسئلة المختارة</p><span className="text-xs font-bold text-neon-bright">{selectedIds.length} سؤال</span></div>{selectedIds.length === 0 ? <p className="py-6 text-center text-xs text-ink-mute">حُذفت جميع الأسئلة. نفّذ اختياراً جديداً أو أضف يدوياً.</p> : selectedIds.map((id, index) => { const question = questions.find(item => item.id === id); return question ? <div key={id} className="flex items-center gap-3 rounded-xl border border-line bg-void/40 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neon/15 text-[10px] font-bold text-neon-bright">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-ink">{question.questionText}</p><div className="mt-1 flex gap-2"><CategoryIcon category={question.category} /><DifficultyBadge difficulty={question.difficulty} /></div></div><button type="button" onClick={() => setSelectedIds(ids => ids.filter(item => item !== id))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-danger/15 hover:text-danger-bright" aria-label="حذف السؤال" title="حذف السؤال"><X className="h-4 w-4" /></button></div> : null; })}</div>}
        {pickMode === 'custom' && <div className="max-h-80 space-y-2 overflow-y-auto rounded-2xl border border-gold/30 bg-gold/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-ink">مجموعتك المعتمدة</p><span className="text-xs font-bold text-gold">{selectedIds.length} سؤال</span></div>{selectedIds.length === 0 ? <p className="py-6 text-center text-xs leading-6 text-ink-mute">لا توجد أسئلة معتمدة بعد. اعرض اقتراحات، اختر ما يناسبك، ثم اضغط «اعتماد المختار».</p> : selectedIds.map((id, index) => { const question = questions.find(item => item.id === id); return question ? <div key={id} className="flex items-center gap-3 rounded-xl border border-line bg-void/40 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold/15 text-[10px] font-bold text-gold">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-ink">{question.questionText}</p><div className="mt-1 flex gap-2"><CategoryIcon category={question.category} /><DifficultyBadge difficulty={question.difficulty} /></div></div><button type="button" onClick={() => setSelectedIds(ids => ids.filter(item => item !== id))} className="grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition hover:bg-danger/15 hover:text-danger-bright" aria-label="حذف السؤال من المجموعة" title="حذف السؤال من المجموعة"><X className="h-4 w-4" /></button></div> : null; })}</div>}
        {pickMode === 'manual' && <div className="max-h-96 space-y-2 overflow-y-auto rounded-2xl border border-line p-3">{filteredQuestions.map(question => <button key={question.id} type="button" onClick={() => setSelectedIds(ids => ids.includes(question.id) ? ids.filter(id => id !== question.id) : [...ids, question.id])} className={cn('flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-right text-sm transition-all', selectedIds.includes(question.id) ? 'border-neon/40 bg-neon/10' : 'border-line bg-void/30')}><div className="flex min-w-0 items-center gap-3">{question.questionType === 'image' && question.imageUrl ? <img src={question.imageUrl} alt="معاينة السؤال" className="h-12 w-16 shrink-0 rounded-lg border border-line bg-white object-contain" /> : <span className="grid h-12 w-16 shrink-0 place-items-center rounded-lg border border-line bg-void/50 text-xl">{question.questionType === 'word' ? '🧩' : '❔'}</span>}<div className="min-w-0"><p className="truncate font-bold text-ink">{question.questionText}</p><div className="mt-1.5 flex flex-wrap items-center gap-2"><CategoryIcon category={question.category} /><DifficultyBadge difficulty={question.difficulty} /></div></div></div>{selectedIds.includes(question.id) && <Check className="h-4 w-4 shrink-0 text-neon-bright" />}</button>)}</div>}
      </>}
      <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}><ChevronRight className="h-4 w-4" /> السابق</Button><Button onClick={() => { if (usesQuestions && chosenIds.length === 0) { setError('اختر سؤالاً واحداً على الأقل.'); return; } if (gameMode === 'impostor' && !impostorWord.trim()) { setError('اكتب الكلمة السرية.'); return; } if (gameMode === 'tarkeeba' && !tarkeebaWord.trim()) { setError('اكتب الكلمة السرية.'); return; } setError(''); setStep(3); }}>التالي <ChevronLeft className="h-4 w-4" /></Button></div>
    </Card>}

    {step === 3 && <Card className="space-y-6 p-6"><CardHeader title="3. الوقت والمراجعة" icon={<Timer className="h-5 w-5" />} /><div className="grid gap-4 md:grid-cols-2"><Field label="مدة كل جولة"><Select value={timerDuration} onChange={event => setTimerDuration(Number(event.target.value))}><option value={5}>5 ثوانٍ — كرسي ساخن</option><option value={20}>20 ثانية</option><option value={30}>30 ثانية</option><option value={45}>45 ثانية</option><option value={60}>60 ثانية</option></Select></Field><div className="rounded-xl border border-line bg-void/30 p-4 text-sm"><p className="font-bold text-ink">{title}</p><p className="mt-2 text-xs text-ink-mute">{gameMode === 'chairs' ? 'لعبة الكراسي • العدد يُحسب تلقائياً عند البدء' : `تحدي أسئلة • ${chosenIds.length} سؤال`}</p></div></div><div className="flex flex-wrap justify-between gap-3"><Button variant="ghost" onClick={() => setStep(2)}><ChevronRight className="h-4 w-4" /> السابق</Button><div className="flex gap-2"><Button variant="outline" onClick={() => void createGame(false)} disabled={creating}>{creating ? 'جاري الحفظ...' : 'حفظ كمسودة'}</Button><Button variant="success" onClick={() => void createGame(true)} disabled={creating}>{creating ? 'جاري الإنشاء...' : 'إنشاء وفتح التحكم'}</Button></div></div></Card>}
  </div>;
}
