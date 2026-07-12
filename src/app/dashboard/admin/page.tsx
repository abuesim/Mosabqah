'use client';

import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BarChart3, KeyRound, ShieldAlert, UserPlus, Users, Gamepad2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';
import StatCard from '@/components/ui/StatCard';

type ManagedUser = { uid: string; username: string; role: 'admin' | 'presenter' | 'player'; disabled: boolean; createdAt: string; lastSignInAt: string | null };
type GameQuestionRule = { categories?: string[]; questionTypes?: Array<'text' | 'image' | 'word'> };
type AdminData = { users: ManagedUser[]; stats: { presenters: number; players: number; questions: number; sessions: number; winners: number }; gameModes: Record<string, boolean>; questionCategories: string[]; questionRules: Record<string, GameQuestionRule> };
const GAME_MODES = [
  { id: 'quiz', label: 'تحدي الأسئلة والإعلام' }, { id: 'chairs', label: 'لعبة الكراسي' }, { id: 'survival', label: 'الزنزانة' }, { id: 'faction', label: 'حرب الفواكه / الدول' }, { id: 'impostor', label: 'أمبوستر' }, { id: 'roulette', label: 'عجلة الروليت' }, { id: 'word', label: 'الكلمة المفقودة' },
  { id: 'image-reveal', label: 'تخمين الصور — كشف الستار' }, { id: 'tarkeeba', label: 'تركيبة' }, { id: 'baathra', label: 'بعثرة' }, { id: 'money', label: 'فلوسك على المحك' },
];
const QUESTION_GAMES = [
  { id: 'quiz', label: 'تحدي الأسئلة والإعلام' },
  { id: 'survival', label: 'الزنزانة' },
  { id: 'faction', label: 'حرب الفواكه / الدول' },
  { id: 'word', label: 'الكلمة المفقودة' },
  { id: 'image-reveal', label: 'تخمين الصور — كشف الستار' },
  { id: 'money', label: 'فلوسك على المحك' },
] as const;
type QuestionGameId = typeof QUESTION_GAMES[number]['id'];
const QUESTION_TYPES: Array<{ id: 'text' | 'image' | 'word'; label: string }> = [
  { id: 'text', label: 'أسئلة نصية' }, { id: 'image', label: 'أسئلة صور' }, { id: 'word', label: 'كلمات تخمينية' },
];

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'presenter' | 'player'>('presenter');
  const [userTab, setUserTab] = useState<'presenter' | 'player'>('presenter');
  const [gameModes, setGameModes] = useState<Record<string, boolean>>({});
  const [questionRules, setQuestionRules] = useState<Record<string, GameQuestionRule>>({});
  const [ruleGame, setRuleGame] = useState<QuestionGameId>('quiz');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (method = 'GET', body?: object) => {
    const user = auth.currentUser;
    if (!user) throw new Error('يلزم تسجيل الدخول أولاً.');
    const token = await user.getIdToken(true);
    const response = await fetch('/api/admin/presenters', {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = response.headers.get('content-type')?.includes('application/json')
      ? await response.json() as AdminData & { error?: string }
      : { error: 'تعذر الاتصال بخدمة إدارة النظام. حاول مرة أخرى.' };
    if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ الطلب.');
    return result;
  }, []);

  const load = useCallback(async () => {
    try { const result = await request() as AdminData; setData(result); setGameModes(result.gameModes || {}); setQuestionRules(result.questionRules || {}); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل لوحة الإدارة.'); }
  }, [request]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { if (user) void load(); });
    return () => unsubscribe();
  }, [load]);

  const createPresenter = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true);
    try {
      await request('POST', { username, password, role: newUserRole });
      setUsername(''); setPassword(''); setSuccess(`تم إنشاء حساب ${newUserRole === 'presenter' ? 'المقدم' : 'المتسابق'}.`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر إنشاء الحساب.'); }
    finally { setBusy(false); }
  };

  const manage = async (uid: string, action: 'enable' | 'disable' | 'reset-password' | 'delete') => {
    const newPassword = action === 'reset-password' ? window.prompt('أدخل كلمة المرور الجديدة (6 أحرف على الأقل):') : undefined;
    if (action === 'reset-password' && !newPassword) return;
    if (action === 'delete' && !window.confirm('هل تريد حذف حساب المقدم نهائياً؟')) return;
    setError(''); setSuccess(''); setBusy(true);
    try {
      await request(action === 'delete' ? 'DELETE' : 'PATCH', action === 'delete' ? { uid } : { uid, action, password: newPassword });
      setSuccess('تم تحديث حساب المقدم.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحديث الحساب.'); }
    finally { setBusy(false); }
  };

  const saveGameModes = async (nextModes: Record<string, boolean>) => {
    setBusy(true); setError('');
    try { await request('PATCH', { action: 'set-game-visibility', gameModes: nextModes }); setGameModes(nextModes); setSuccess('تم تحديث ظهور الألعاب للمقدمين.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحديث ظهور الألعاب.'); }
    finally { setBusy(false); }
  };

  const updateQuestionRule = (game: QuestionGameId, update: (current: GameQuestionRule) => GameQuestionRule) => {
    setQuestionRules(current => ({ ...current, [game]: update(current[game] || {}) }));
  };

  const saveQuestionRules = async () => {
    setBusy(true); setError('');
    try { await request('PATCH', { action: 'set-game-question-rules', questionRules }); setSuccess('تم حفظ صلاحيات بنك الأسئلة للألعاب.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ صلاحيات بنك الأسئلة.'); }
    finally { setBusy(false); }
  };

  const activeQuestionRule = questionRules[ruleGame] || {};

  if (!data && !error) return <div className="flex justify-center py-24"><Spinner size="lg" label="جاري تحميل إدارة النظام..." /></div>;
  if (error && !data) return <div className="mx-auto max-w-lg rounded-2xl border border-danger/30 bg-danger/10 p-6 text-center text-danger-bright"><ShieldAlert className="mx-auto mb-3 h-7 w-7" />{error}</div>;

  return <div className="anim-rise space-y-7">
    <div><h2 className="text-2xl font-extrabold text-ink">إدارة النظام</h2><p className="mt-1 text-sm text-ink-mute">إدارة حسابات المقدمين ومتابعة مؤشرات المنصة.</p></div>
    {error && <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger-bright">{error}</p>}
    {success && <p className="rounded-xl border border-cyan/30 bg-cyan/10 p-3 text-sm text-cyan">{success}</p>}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="المقدمون" value={data!.stats.presenters} icon={Users} tone="cyan" />
      <StatCard label="المتسابقون" value={data!.stats.players} icon={Gamepad2} tone="gold" />
      <StatCard label="الأسئلة" value={data!.stats.questions} icon={BarChart3} tone="neon" />
      <StatCard label="الجلسات" value={data!.stats.sessions} icon={BarChart3} tone="gold" />
      <StatCard label="الفائزون" value={data!.stats.winners} icon={BarChart3} tone="cyan" />
    </div>
    <Card className="p-6"><CardHeader title="إنشاء حساب مستخدم" icon={<UserPlus className="h-5 w-5" />} />
      <p className="mb-4 mt-3 text-xs text-ink-mute">المدير فقط يملك صلاحية إدارة النظام.</p>
      <form onSubmit={createPresenter} className="grid gap-4 md:grid-cols-3 md:items-end">
        <Field label="اسم المستخدم"><Input value={username} onChange={(event) => setUsername(event.target.value)} required /></Field>
        <Field label="كلمة المرور"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></Field>
        <div className="flex gap-2"><Select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as 'presenter' | 'player')}><option value="presenter">مقدم</option><option value="player">متسابق</option></Select><Button type="submit" variant="primary" disabled={busy}>إنشاء الحساب</Button></div>
      </form>
    </Card>
    <Card className="p-6"><CardHeader title="ظهور الألعاب للمقدمين" icon={<Gamepad2 className="h-5 w-5" />} />
      <p className="mb-4 mt-3 text-xs text-ink-mute">إخفاء اللعبة يمنع ظهورها في مكتب الألعاب للمقدمين، بينما تبقى ظاهرة لك كمدير.</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{GAME_MODES.map((game) => <button key={game.id} disabled={busy} onClick={() => void saveGameModes({ ...gameModes, [game.id]: gameModes[game.id] === false })} className={`flex items-center justify-between rounded-xl border p-3 text-right text-xs font-bold ${gameModes[game.id] === false ? 'border-line bg-void/30 text-ink-mute' : 'border-success/35 bg-success/10 text-success-bright'}`}><span>{game.label}</span><span>{gameModes[game.id] === false ? 'مخفية' : 'ظاهرة'}</span></button>)}</div>
    </Card>
    <Card className="p-6"><CardHeader title="صلاحيات بنك الأسئلة للألعاب" icon={<BarChart3 className="h-5 w-5" />} />
      <p className="mb-4 mt-3 text-xs leading-6 text-ink-mute">حدّد فقط الأسئلة المسموح لكل لعبة بإظهارها للمقدم. مثال: اجعل «مهن» متاحة للعبة الكلمات فقط، ولن تظهر في تحدي الأسئلة.</p>
      <div className="flex flex-wrap gap-2">{QUESTION_GAMES.map((game) => <Button key={game.id} size="sm" variant={ruleGame === game.id ? 'primary' : 'ghost'} onClick={() => setRuleGame(game.id)}>{game.label}</Button>)}</div>
      <div className="mt-5 space-y-5 rounded-2xl border border-line bg-void/25 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-ink">{QUESTION_GAMES.find(game => game.id === ruleGame)?.label}</p><p className="mt-1 text-xs text-ink-mute">التصنيفات المحددة فقط هي التي تظهر للمقدم في هذه اللعبة.</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => updateQuestionRule(ruleGame, current => ({ ...current, categories: activeQuestionRule.categories?.length === data!.questionCategories.length ? [] : data!.questionCategories }))}>{activeQuestionRule.categories?.length === data!.questionCategories.length ? 'السماح بكل التصنيفات' : 'تحديد كل التصنيفات'}</Button></div>
        <div><p className="mb-2 text-xs font-bold text-ink-soft">التصنيفات</p><div className="flex flex-wrap gap-2">{data!.questionCategories.length === 0 ? <span className="text-xs text-ink-mute">لا توجد تصنيفات في بنك الأسئلة بعد.</span> : data!.questionCategories.map((item) => { const chosen = activeQuestionRule.categories?.includes(item) || false; return <button key={item} type="button" disabled={busy} onClick={() => updateQuestionRule(ruleGame, current => ({ ...current, categories: chosen ? (current.categories || []).filter(category => category !== item) : [...(current.categories || []), item] }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${chosen ? 'border-neon/40 bg-neon/10 text-neon-bright' : 'border-line bg-void/40 text-ink-mute hover:border-neon/25'}`}>{chosen ? '✓ ' : ''}{item}</button>; })}</div>{!activeQuestionRule.categories?.length && <p className="mt-2 text-[11px] text-gold">لم تُحدد تصنيفات بعد: هذا يعني السماح بكل التصنيفات. استخدم «تحديد كل التصنيفات» ثم أزل ما لا تريده.</p>}</div>
        <div><p className="mb-2 text-xs font-bold text-ink-soft">أنواع الأسئلة</p><div className="flex flex-wrap gap-2">{QUESTION_TYPES.map((type) => { const chosen = activeQuestionRule.questionTypes?.includes(type.id) || false; return <button key={type.id} type="button" disabled={busy} onClick={() => updateQuestionRule(ruleGame, current => ({ ...current, questionTypes: chosen ? (current.questionTypes || []).filter(questionType => questionType !== type.id) : [...(current.questionTypes || []), type.id] }))} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${chosen ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-line bg-void/40 text-ink-mute hover:border-cyan/25'}`}>{chosen ? '✓ ' : ''}{type.label}</button>; })}</div>{!activeQuestionRule.questionTypes?.length && <p className="mt-2 text-[11px] text-gold">لم تُحدد أنواع بعد: هذا يعني السماح بكل الأنواع التي تدعمها اللعبة.</p>}</div>
        <div className="flex justify-end"><Button variant="success" disabled={busy} onClick={() => void saveQuestionRules()}>حفظ صلاحيات هذه الألعاب</Button></div>
      </div>
    </Card>
    <Card className="p-6"><CardHeader title="المستخدمون" icon={<Users className="h-5 w-5" />} />
      <p className="mb-3 mt-3 text-xs text-ink-mute">تعطيل الحساب يمنع الدخول دون حذف بياناته.</p>
      <div className="mb-3 flex gap-2"><Button size="sm" variant={userTab === 'presenter' ? 'primary' : 'ghost'} onClick={() => setUserTab('presenter')}>المقدمون ({data!.stats.presenters})</Button><Button size="sm" variant={userTab === 'player' ? 'primary' : 'ghost'} onClick={() => setUserTab('player')}>المتسابقون ({data!.stats.players})</Button></div>
      <div className="divide-y divide-line">{data!.users.filter((user) => user.role === userTab).map((user) => <div key={user.uid} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <div><p className="font-bold text-ink">{user.username} <span className="mr-2 rounded-full bg-neon/15 px-2 py-0.5 text-[10px] text-neon-bright">{userTab === 'presenter' ? 'مقدم' : 'متسابق'}</span></p><p className="mt-1 text-xs text-ink-mute">{user.disabled ? 'الحساب معطّل' : 'الحساب نشط'}</p></div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => manage(user.uid, 'reset-password')}><KeyRound className="h-3.5 w-3.5" />كلمة المرور</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => manage(user.uid, user.disabled ? 'enable' : 'disable')}>{user.disabled ? 'تفعيل' : 'تعطيل'}</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => manage(user.uid, 'delete')}>حذف</Button></div>
      </div>)}</div>
    </Card>
  </div>;
}
