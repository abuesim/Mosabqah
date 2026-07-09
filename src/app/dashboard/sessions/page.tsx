'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Layers, Plus, Play, CheckSquare, Square, ArrowRight, Users, Radio, Flame } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import StatusDot from '@/components/ui/StatusDot';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';

import { Suspense } from 'react';

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get('id');

  const [profile, setProfile] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Session Form
  const [title, setTitle] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [timerDuration, setTimerDuration] = useState(30);

  // Active Session Control State
  const [activeSession, setActiveSession] = useState<any>(null);
  const [activeQuestions, setActiveQuestions] = useState<any[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  useEffect(() => {
    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userProfile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (userProfile) setProfile(userProfile);

        const { data: qData } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
        if (qData) setQuestions(qData);

        await fetchSessions(user.id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Monitor Active Session parameters and subscribe to changes
  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }

    async function loadActiveSession() {
      const { data: session } = await supabase.from('sessions').select('*').eq('id', activeSessionId).single();
      if (!session) return;
      setActiveSession(session);

      const { data: sqData } = await supabase
        .from('session_questions')
        .select('question_id')
        .eq('session_id', activeSessionId);
      if (sqData && sqData.length > 0) {
        const qIds = sqData.map(sq => sq.question_id);
        const { data: qList } = await supabase.from('questions').select('*').in('id', qIds);
        if (qList) {
          setActiveQuestions(qList);
          if (session.current_question_id) {
            const currentQ = qList.find(q => q.id === session.current_question_id);
            setCurrentQuestion(currentQ || null);
          }
        }
      }

      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('score', { ascending: false });
      if (playerData) setPlayers(playerData);

      if (session.current_question_id) {
        const { count } = await supabase
          .from('player_answers')
          .select('*', { count: 'exact', head: true })
          .eq('session_id', activeSessionId)
          .eq('question_id', session.current_question_id);
        setAnswersCount(count || 0);
      }
    }

    loadActiveSession();

    const playersSubscription = supabase
      .channel('players-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `session_id=eq.${activeSessionId}` }, () => {
        supabase
          .from('players')
          .select('*')
          .eq('session_id', activeSessionId)
          .order('score', { ascending: false })
          .then(({ data }) => {
            if (data) setPlayers(data);
          });
      })
      .subscribe();

    const answersSubscription = supabase
      .channel('answers-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_answers', filter: `session_id=eq.${activeSessionId}` }, () => {
        if (activeSession?.current_question_id) {
          supabase
            .from('player_answers')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', activeSessionId)
            .eq('question_id', activeSession.current_question_id)
            .then(({ count }) => {
              setAnswersCount(count || 0);
            });
        }
      })
      .subscribe();

    const sessionSubscription = supabase
      .channel('session-info-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${activeSessionId}` }, (payload) => {
        setActiveSession(payload.new);
        if (payload.new.current_question_id) {
          supabase
            .from('questions')
            .select('*')
            .eq('id', payload.new.current_question_id)
            .single()
            .then(({ data }) => {
              setCurrentQuestion(data || null);
            });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(playersSubscription);
      supabase.removeChannel(answersSubscription);
      supabase.removeChannel(sessionSubscription);
    };
  }, [activeSessionId, activeSession?.current_question_id]);

  const fetchSessions = async (userId: string) => {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });
    if (data) setSessions(data);
  };

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
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          title,
          room_code: code,
          timer_duration: timerDuration,
          created_by: profile.id,
          status: 'waiting'
        })
        .select()
        .single();
      if (sessionError) throw sessionError;
      const sessionQuestions = selectedQuestionIds.map(qid => ({ session_id: session.id, question_id: qid }));
      const { error: sqError } = await supabase.from('session_questions').insert(sessionQuestions);
      if (sqError) throw sqError;
      setSuccess('تم إنشاء الجلسة بنجاح!');
      setTitle('');
      setRoomCode('');
      setSelectedQuestionIds([]);
      await fetchSessions(profile.id);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الجلسة.');
    }
  };

  const handleQuestionToggle = (qid: number) => {
    if (selectedQuestionIds.includes(qid)) {
      setSelectedQuestionIds(selectedQuestionIds.filter(id => id !== qid));
    } else {
      setSelectedQuestionIds([...selectedQuestionIds, qid]);
    }
  };

  // GAME CONSOLE ACTION HANDLERS (logic unchanged)
  const handleShowQuestion = async (qid: number) => {
    if (!activeSession) return;
    setAnswersCount(0);
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ current_question_id: qid, question_status: 'showing', status: 'active' })
      .eq('id', activeSession.id);
    if (updateError) console.error(updateError);
  };

  const handleRevealAnswer = async () => {
    if (!activeSession || !currentQuestion) return;
    const { data: submissions } = await supabase
      .from('player_answers')
      .select('*')
      .eq('session_id', activeSession.id)
      .eq('question_id', currentQuestion.id);

    if (submissions && submissions.length > 0) {
      const updates = submissions.map(sub => {
        if (sub.is_correct) {
          const timePercent = Math.max(0, 1 - (parseFloat(sub.time_spent) / activeSession.timer_duration));
          const bonus = Math.round(timePercent * 50);
          const scoreAdded = 100 + bonus;
          const player = players.find(p => p.id === sub.player_id);
          const currentScore = player ? player.score : 0;
          const currentStreak = player ? player.streak : 0;
          return supabase.from('players').update({ score: currentScore + scoreAdded, streak: currentStreak + 1 }).eq('id', sub.player_id);
        } else {
          return supabase.from('players').update({ streak: 0 }).eq('id', sub.player_id);
        }
      });
      await Promise.all(updates);
    }
    await supabase.from('sessions').update({ question_status: 'revealed' }).eq('id', activeSession.id);
  };

  const handleToggleScoreboard = async () => {
    if (!activeSession) return;
    const newState = !activeSession.show_scoreboard;
    await supabase.from('sessions').update({ show_scoreboard: newState }).eq('id', activeSession.id);
    if (newState) {
      setTimeout(async () => {
        await supabase.from('sessions').update({ show_scoreboard: false }).eq('id', activeSession.id);
      }, 8000);
    }
  };

  const handleEndGame = async () => {
    if (!activeSession) return;
    if (!confirm('هل تريد إنهاء هذه المسابقة نهائياً وتتويج الفائزين؟')) return;
    if (players.length > 0) {
      const winner = players[0];
      await supabase.from('winners_archive').insert({
        session_id: activeSession.id,
        session_title: activeSession.title,
        winner_name: winner.name,
        winner_score: winner.score,
        total_players: players.length
      });
      const cumulativeUpdates = players.map(p => {
        return supabase.rpc('increment_cumulative_score', { p_name: p.name, p_score: p.score });
      });
      await Promise.all(cumulativeUpdates);
    }
    await supabase.from('sessions').update({ status: 'finished', current_question_id: null, question_status: 'idle' }).eq('id', activeSession.id);
    router.push('/dashboard/sessions');
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
                <span className="font-display font-bold tracking-widest text-neon-bright">{activeSession.room_code}</span>
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
                  <h4 className="text-lg font-bold text-ink md:text-xl">{currentQuestion.question_text}</h4>

                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((n) => {
                      const opt = currentQuestion[`option${n}`];
                      if (!opt) return null;
                      const isCorrect = currentQuestion.correct_option === n;
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
                        {activeSession.question_status === 'showing' ? 'معروض للجميع' :
                         activeSession.question_status === 'revealed' ? 'تم الكشف' : 'انتظار'}
                      </span>
                      <span className="mx-2">•</span>
                      الإجابات:{' '}
                      <span className="font-display font-bold text-neon-bright">{answersCount}</span>
                      {' / '}
                      <span className="font-display text-ink-mute">{players.length}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSession.question_status === 'showing' && (
                        <Button variant="success" size="sm" onClick={handleRevealAnswer}>كشف الإجابة</Button>
                      )}
                      <Button
                        variant={activeSession.show_scoreboard ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleToggleScoreboard}
                      >
                        {activeSession.show_scoreboard ? 'إخفاء الترتيب' : 'عرض الترتيب'}
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
                  const isCurrent = activeSession.current_question_id === q.id;
                  return (
                    <div
                      key={q.id}
                      className={cn('flex items-center justify-between gap-3 p-4 transition-colors', isCurrent ? 'bg-neon/5' : 'hover:bg-white/5')}
                    >
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-ink-soft">{q.question_text}</h4>
                        <div className="mt-1.5 flex items-center gap-3">
                          <DifficultyBadge difficulty={q.difficulty} />
                          <CategoryIcon category={q.category} />
                        </div>
                      </div>
                      <button
                        onClick={() => handleShowQuestion(q.id)}
                        disabled={isCurrent && activeSession.question_status === 'showing'}
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
                        <span className="line-clamp-1 flex-1 text-ink-soft">{q.question_text}</span>
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
                          {session.room_code}
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
