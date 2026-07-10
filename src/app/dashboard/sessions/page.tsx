'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  getUserProfile, getSessions, getQuestions, createSession, updateSession,
  getSessionById, getSessionQuestions, getPlayers, getAnswerCount,
  getAnswersForQuestion, updatePlayer, archiveWinner, incrementCumulativeScore,
  subscribeSession, subscribeSessionPlayers, subscribeAnswerCount,
} from '@/lib/db';
import type { Session, Question, Player, UserProfile } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Layers, Plus, Play, CheckSquare, Square, ArrowRight, Users, Radio, Flame, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import StatusDot from '@/components/ui/StatusDot';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';
import type { Unsubscribe } from 'firebase/firestore';

import { Suspense } from 'react';

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get('id');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Session Form
  const [title, setTitle] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [timerDuration, setTimerDuration] = useState(30);

  // Active Session Control State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  // Presenter controls
  const [hintInput, setHintInput] = useState('');
  const [tvBgColorInput, setTvBgColorInput] = useState('#090514');
  const [tvLogoTextInput, setTvLogoTextInput] = useState('مسابقة عصومي');
  const [tvFontSizeInput, setTvFontSizeInput] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [tvChromaInput, setTvChromaInput] = useState<'normal' | 'chroma' | 'transparent'>('normal');

  // Initial load (profile + question bank + own sessions)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); window.location.href = '/auth'; return; }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) setProfile(userProfile);

        const [qData, mySessions] = await Promise.all([
          getQuestions(),
          getSessions(user.uid),
        ]);
        setQuestions(qData);
        setSessions(mySessions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Active session loader + realtime subscriptions
  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }

    let unsubs: Unsubscribe[] = [];

    async function loadActiveSession() {
      if (!activeSessionId) return;
      const session = await getSessionById(activeSessionId);
      if (!session) return;
      setActiveSession(session);
      if ((session as any).tvBgColor) setTvBgColorInput((session as any).tvBgColor);
      if ((session as any).tvLogoText) setTvLogoTextInput((session as any).tvLogoText);
      if ((session as any).tvFontSize) setTvFontSizeInput((session as any).tvFontSize);
      if ((session as any).overlayMode) setTvChromaInput((session as any).overlayMode);

      // Load session's questions
      if (session.questionIds?.length) {
        const qList = await getSessionQuestions(session.questionIds);
        setActiveQuestions(qList);
        if (session.currentQuestionId) {
          setCurrentQuestion(qList.find(q => q.id === session.currentQuestionId) || null);
        }
      }

      // Load players
      const playerData = await getPlayers(activeSessionId);
      setPlayers(playerData);

      // Load answer count for current question
      if (session.currentQuestionId) {
        const count = await getAnswerCount(activeSessionId, session.currentQuestionId);
        setAnswersCount(count);
      }
    }

    loadActiveSession();

    // 1. Subscribe to session doc changes (replaces session-info-changes)
    unsubs.push(
      subscribeSession(activeSessionId, async (sess) => {
        if (!sess) return;
        setActiveSession(sess);
        if (sess.currentQuestionId) {
          // fetch the current question doc if we don't have it locally
          setCurrentQuestion(prev => {
            if (prev?.id === sess.currentQuestionId) return prev;
            // lazy load
            getSessionQuestions([sess.currentQuestionId!]).then(list => {
              if (list[0]) setCurrentQuestion(list[0]);
            });
            return prev;
          });
        } else {
          setCurrentQuestion(null);
        }
      })
    );

    // 2. Subscribe to players list (replaces players-changes)
    unsubs.push(
      subscribeSessionPlayers(activeSessionId, (newPlayers) => {
        setPlayers(newPlayers);
      })
    );

    // 3. Subscribe to answer count for current question (replaces answers-changes)
    // We use a getter for currentQuestionId so the subscription stays fresh.
    const currentQidGetter = () => activeSession?.currentQuestionId;
    const qid = currentQidGetter();
    if (qid) {
      unsubs.push(
        subscribeAnswerCount(activeSessionId, qid, (count) => {
          setAnswersCount(count);
        })
      );
    }

    return () => {
      unsubs.forEach(u => u && u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, activeSession?.currentQuestionId]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError('');
    setSuccess('');
    if (selectedQuestionIds.length === 0) {
      setError('يرجى تحديد سؤال واحد على الأقل من مكتبة الأسئلة المتاحة.');
      return;
    }
    try {
      const code = roomCode || Math.floor(1000 + Math.random() * 9000).toString();
      await createSession({
        title,
        roomCode: code,
        timerDuration,
        createdBy: profile.uid,
        status: 'waiting',
        currentQuestionId: null,
        questionStatus: 'idle',
        showScoreboard: false,
        questionIds: selectedQuestionIds,
      });
      setSuccess('تم إنشاء الجلسة بنجاح!');
      setTitle('');
      setRoomCode('');
      setSelectedQuestionIds([]);
      const fresh = await getSessions(profile.uid);
      setSessions(fresh);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الجلسة.');
    }
  };

  const handleQuestionToggle = (qid: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(qid) ? prev.filter(id => id !== qid) : [...prev, qid]
    );
  };

  // GAME CONSOLE ACTION HANDLERS
  const handleShowQuestion = async (qid: string) => {
    if (!activeSession) return;
    setAnswersCount(0);
    await updateSession(activeSession.id, {
      currentQuestionId: qid,
      questionStatus: 'showing',
      status: 'active',
    });
  };

  const handleRevealAnswer = async () => {
    if (!activeSession || !currentQuestion) return;
    const submissions = await getAnswersForQuestion(activeSession.id, currentQuestion.id);

    if (submissions.length > 0) {
      await Promise.all(submissions.map(sub => {
        if (sub.isCorrect) {
          const timePercent = Math.max(0, 1 - (sub.timeSpent / activeSession.timerDuration));
          const bonus = Math.round(timePercent * 50);
          const scoreAdded = 100 + bonus;
          const player = players.find(p => p.id === sub.playerId);
          const currentScore = player ? player.score : 0;
          const currentStreak = player ? player.streak : 0;
          return updatePlayer(activeSession.id, sub.playerId, {
            score: currentScore + scoreAdded,
            streak: currentStreak + 1,
          });
        } else {
          return updatePlayer(activeSession.id, sub.playerId, { streak: 0 });
        }
      }));
    }
    await updateSession(activeSession.id, { questionStatus: 'revealed' });
  };

  const handleToggleScoreboard = async () => {
    if (!activeSession) return;
    const newState = !activeSession.showScoreboard;
    await updateSession(activeSession.id, { showScoreboard: newState });
    if (newState) {
      setTimeout(async () => {
        await updateSession(activeSession.id, { showScoreboard: false });
      }, 8000);
    }
  };

  const handleEndGame = async () => {
    if (!activeSession) return;
    if (!confirm('هل تريد إنهاء هذه المسابقة نهائياً وتتويج الفائزين؟')) return;

    if (players.length > 0) {
      const winner = players[0];
      await archiveWinner({
        sessionId: activeSession.id,
        sessionTitle: activeSession.title,
        winnerName: winner.name,
        winnerScore: winner.score,
        totalPlayers: players.length,
      });
      await Promise.all(players.map(p => incrementCumulativeScore(p.name, p.score)));
    }

    await updateSession(activeSession.id, {
      status: 'finished',
      currentQuestionId: null,
      questionStatus: 'idle',
    });
    router.push('/dashboard/sessions');
  };

  const handleBroadcastHint = async () => {
    if (!activeSession || !hintInput.trim()) return;
    try {
      await updateSession(activeSession.id, {
        currentHint: hintInput.trim()
      });
      setHintInput('');
      setSuccess('تم بث التلميح للمتسابقين بنجاح!');
      // Auto clear after 6 seconds
      setTimeout(async () => {
        await updateSession(activeSession.id, {
          currentHint: null
        });
      }, 6000);
    } catch (err: any) {
      setError(err.message || 'خطأ في بث التلميح');
    }
  };

  const handleUpdateTvSettings = async () => {
    if (!activeSession) return;
    try {
      await updateSession(activeSession.id, {
        tvBgColor: tvBgColorInput,
        tvLogoText: tvLogoTextInput,
        tvFontSize: tvFontSizeInput,
        overlayMode: tvChromaInput,
      });
      setSuccess('تم تحديث إعدادات شاشة العرض بنجاح!');
    } catch (err: any) {
      setError(err.message || 'خطأ في تحديث إعدادات الشاشة');
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
    return (
      <div className="anim-rise space-y-7">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-line bg-void-2/60 text-ink-soft transition-all hover:bg-void-2"
              aria-label="رجوع"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
                <Radio className="h-5 w-5 anim-pulse-neon text-danger-bright" />
                {activeSession.title}
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                رمز الغرفة:{' '}
                <span className="font-display font-bold tracking-widest text-neon-bright">{activeSession.roomCode}</span>
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={handleEndGame}>إنهاء وتتويج الفائزين</Button>
        </div>

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
          {/* Left: current question + bank */}
          <div className="space-y-6 lg:col-span-2">
            <Card glow="neon" className="p-6">
              <CardHeader title="السؤال النشط حالياً" accent="neon" />

              {currentQuestion ? (
                <div className="mt-5 space-y-4">
                  <h4 className="text-lg font-bold text-ink md:text-xl">{currentQuestion.questionText}</h4>

                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((n) => {
                      const opt = (currentQuestion as any)[`option${n}`];
                      if (!opt) return null;
                      const isCorrect = currentQuestion.correctOption === n;
                      return (
                        <div
                          key={n}
                          className={cn(
                            'rounded-xl border p-4 text-sm',
                            isCorrect
                              ? 'border-success/40 bg-success/10 text-success-bright shadow-[var(--shadow-success)]'
                              : 'border-line bg-void-2/50 text-ink-soft'
                          )}
                        >
                          <span className="font-display font-bold text-gold">{n}.</span> {opt}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                    <div className="text-xs text-ink-mute">
                      الحالة:{' '}
                      <span className="font-bold text-ink-soft">
                        {activeSession.questionStatus === 'showing' ? 'معروض للجميع' :
                         activeSession.questionStatus === 'revealed' ? 'تم الكشف' : 'انتظار'}
                      </span>
                      <span className="mx-2">•</span>
                      الإجابات:{' '}
                      <span className="font-display font-bold text-neon-bright">{answersCount}</span>
                      {' / '}
                      <span className="font-display text-ink-mute">{players.length}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSession.questionStatus === 'showing' && (
                        <Button variant="success" size="sm" onClick={handleRevealAnswer}>كشف الإجابة</Button>
                      )}
                      <Button
                        variant={activeSession.showScoreboard ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleToggleScoreboard}
                      >
                        {activeSession.showScoreboard ? 'إخفاء الترتيب' : 'عرض الترتيب'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-ink-mute">
                  لم يتم بث أي سؤال بعد. اختر سؤالاً من القائمة أدناه لبدء التحدي.
                </div>
              )}
            </Card>

            {/* Question bank */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Layers className="h-5 w-5 text-cyan" />
                أسئلة هذه الجلسة
              </h3>
              <div className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
                {activeQuestions.map((q) => {
                  const isCurrent = activeSession.currentQuestionId === q.id;
                  return (
                    <div
                      key={q.id}
                      className={cn('flex items-center justify-between gap-3 p-4 transition-colors', isCurrent ? 'bg-neon/5' : 'hover:bg-white/5')}
                    >
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-ink-soft">{q.questionText}</h4>
                        <div className="mt-1.5 flex items-center gap-3">
                          <DifficultyBadge difficulty={q.difficulty} />
                          <CategoryIcon category={q.category} />
                        </div>
                      </div>
                      <button
                        onClick={() => handleShowQuestion(q.id)}
                        disabled={isCurrent && activeSession.questionStatus === 'showing'}
                        className={cn(
                          'shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition-all',
                          isCurrent
                            ? 'border-neon/40 bg-neon/20 text-neon-bright'
                            : 'border-line bg-void-2/60 text-ink-soft hover:border-neon/40 hover:text-neon-bright',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        {isCurrent ? 'معروض الآن' : 'طرح السؤال'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: players */}
          <div className="space-y-6">
            <Card className="p-6">
              <CardHeader
                title={<span>المتسابقون المتصلون ({players.length})</span>}
                icon={<Users className="h-5 w-5" />}
                accent="cyan"
              />
              {players.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-mute">بانتظار انضمام المتسابقين...</div>
              ) : (
                <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {players.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-void-2/50 p-3.5">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold',
                          idx === 0 ? 'bg-gold/20 text-gold' :
                          idx === 1 ? 'bg-white/15 text-ink-soft' :
                          idx === 2 ? 'bg-amber-700/30 text-amber-500' : 'bg-void text-ink-faint'
                        )}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: p.color }}>{p.name}</p>
                          {p.streak >= 3 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400">
                              <Flame className="h-3 w-3" /> {p.streak} متتالي
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-display text-xs font-extrabold text-ink">{p.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Hint broadcaster */}
            <Card className="p-6">
              <CardHeader title="بث تلميح فوري للمتسابقين" icon={<Sparkles className="h-5 w-5" />} accent="neon" />
              <div className="mt-4 space-y-4">
                <p className="text-[11px] text-ink-mute">سيظهر هذا التلميح كرسالة منبثقة في شاشات المتسابقين فوراً لمساعدتهم.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="اكتب التلميح هنا (مثال: الإجابة في العلوم)"
                    value={hintInput}
                    onChange={(e) => setHintInput(e.target.value)}
                  />
                  <Button variant="primary" onClick={handleBroadcastHint} disabled={!hintInput.trim()}>
                    بث 💡
                  </Button>
                </div>
              </div>
            </Card>

            {/* TV Customize Settings */}
            <Card className="p-6">
              <CardHeader title="إعدادات الشاشة التلفزيونية" icon={<Layers className="h-5 w-5" />} accent="cyan" />
              <div className="mt-4 space-y-4">
                <Field label="شعار / عنوان التلفزيون">
                  <Input
                    value={tvLogoTextInput}
                    onChange={(e) => setTvLogoTextInput(e.target.value)}
                    placeholder="شعار المسابقة المعروض"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="حجم الخط">
                    <Select value={tvFontSizeInput} onChange={(e: any) => setTvFontSizeInput(e.target.value)}>
                      <option value="sm">صغير</option>
                      <option value="md">متوسط</option>
                      <option value="lg">كبير</option>
                      <option value="xl">ضخم</option>
                    </Select>
                  </Field>
                  <Field label="وضع الخلفية">
                    <Select value={tvChromaInput} onChange={(e: any) => setTvChromaInput(e.target.value)}>
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
                <Button variant="primary" fullWidth onClick={handleUpdateTvSettings}>
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
  return (
    <div className="anim-rise space-y-8">
      <div className="flex items-center gap-2">
        <Layers className="h-6 w-6 text-neon-bright" />
        <h2 className="text-2xl font-extrabold text-ink">إدارة جلسات اللعب</h2>
      </div>

      {error && (
        <div className="anim-shake rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-center text-sm text-success-bright">{success}</div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Create form */}
        <Card glow="neon" className="space-y-5 p-6">
          <CardHeader title="إنشاء جلسة جديدة" icon={<Plus className="h-5 w-5" />} />
          <form onSubmit={handleCreateSession} className="space-y-4">
            <Field label="عنوان الجلسة" required>
              <Input required placeholder="مثال: تحدي الجمعة العائلي" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="رمز الغرفة (اختياري)">
                <Input placeholder="توليد عشوائي" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
              </Field>
              <Field label="مدة المؤقت">
                <Select value={timerDuration} onChange={(e) => setTimerDuration(parseInt(e.target.value, 10))}>
                  <option value={20}>20 ثانية</option>
                  <option value={30}>30 ثانية</option>
                  <option value={45}>45 ثانية</option>
                  <option value={60}>60 ثانية</option>
                </Select>
              </Field>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink-soft">اختر أسئلة الجلسة من المكتبة</label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line bg-void/40 p-2">
                {questions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-ink-faint">لا توجد أسئلة متوفرة في البنك المركزي حالياً.</div>
                ) : (
                  questions.map(q => {
                    const isSelected = selectedQuestionIds.includes(q.id);
                    return (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => handleQuestionToggle(q.id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-2.5 text-right text-xs transition-colors hover:bg-white/5"
                      >
                        <span className="line-clamp-1 flex-1 text-ink-soft">{q.questionText}</span>
                        {isSelected
                          ? <CheckSquare className="h-4 w-4 shrink-0 text-neon-bright" />
                          : <Square className="h-4 w-4 shrink-0 text-ink-faint" />}
                      </button>
                    );
                  })
                )}
              </div>
              <span className="block text-[10px] text-ink-faint">الأسئلة المحددة: {selectedQuestionIds.length} سؤال.</span>
            </div>

            <Button type="submit" variant="primary" fullWidth size="lg">إنشاء الجلسة وحفظها</Button>
          </form>
        </Card>

        {/* Sessions list */}
        <div className="space-y-4 lg:col-span-2">
          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لا توجد جلسات منشأة حالياً.</div>
            ) : (
              <div className="divide-y divide-line">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-white/5">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-ink md:text-base">{session.title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="rounded-md border border-line bg-void/60 px-2 py-0.5 font-display tracking-wider text-neon-bright">
                          {session.roomCode}
                        </span>
                        <StatusDot status={session.status} pulse={session.status === 'active'} />
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/sessions?id=${session.id}`)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-4 py-2 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20 hover:shadow-[var(--shadow-neon)]"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      لوحة التحكم
                    </button>
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
    <Suspense fallback={<div className="flex items-center justify-center p-12"><Spinner label="جاري التحميل..." /></div>}>
      <SessionsPageContent />
    </Suspense>
  );
}
