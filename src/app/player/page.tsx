'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { ShieldCheck, User, KeyRound, Clock, CheckCircle, XCircle, Trophy, Scissors, PlusCircle, Sparkles, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Background from '@/components/ui/Background';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

import { Suspense } from 'react';

function PlayerPageContent() {
  const searchParams = useSearchParams();
  const urlRoomCode = searchParams.get('room');

  // Connection Steps
  const [step, setStep] = useState(1);
  const [roomCode, setRoomCode] = useState(urlRoomCode || '');
  const [session, setSession] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#22d3ee');
  const [player, setPlayer] = useState<any>(null);

  // Game States
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionStatus, setQuestionStatus] = useState<string>('idle');
  const [hasAnswered, setHasAnswered] = useState(false);
  const [chosenOption, setChosenOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);

  // Lifelines
  const [lifelinesRemaining, setLifelinesRemaining] = useState(2);
  const [lifelinesTimeRemaining, setLifelinesTimeRemaining] = useState(2);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Neon player palette (vibrant)
  const colors = ['#22d3ee', '#a855f7', '#f87171', '#4ade80', '#fbbf24', '#e879f9'];

  useEffect(() => {
    if (urlRoomCode) {
      handleVerifyRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRoomCode]);

  // Realtime Session and Player subscriptions
  useEffect(() => {
    if (!player?.id || !session?.id) return;

    const sessionChannel = supabase
      .channel(`player-session-${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` }, (payload) => {
        const newSess = payload.new;
        setSession(newSess);
        setQuestionStatus(newSess.question_status);

        if (newSess.question_status === 'showing') {
          setHasAnswered(false);
          setChosenOption(null);
          setIsCorrect(null);
          setHiddenOptions([]);
          fetchQuestion(newSess.current_question_id, newSess.timer_duration);
        } else if (newSess.question_status === 'revealed') {
          revealAnswer();
        }
      })
      .subscribe();

    const playerChannel = supabase
      .channel(`player-self-${player.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${player.id}` }, (payload) => {
        setPlayer(payload.new);
        setStreak(payload.new.streak || 0);
        setLifelinesRemaining(payload.new.lifelines_remaining);
        setLifelinesTimeRemaining(payload.new.lifelines_time_remaining);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(playerChannel);
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, session?.id]);

  const handleVerifyRoom = async () => {
    if (!roomCode.trim()) return;
    const { data, error } = await supabase.from('sessions').select('*').eq('room_code', roomCode.trim()).single();
    if (error || !data) {
      alert('خطأ: رمز الغرفة غير موجود أو غير صالح.');
      return;
    }
    setSession(data);
    setStep(2);
  };

  const handleJoinGame = async () => {
    if (!playerName.trim()) return;
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('session_id', session.id)
      .eq('name', playerName.trim())
      .single();

    if (existingPlayer) {
      setPlayer(existingPlayer);
      setStreak(existingPlayer.streak || 0);
      setStep(3);
      return;
    }

    const { data: newPlayer, error } = await supabase
      .from('players')
      .insert({
        session_id: session.id,
        name: playerName.trim(),
        color: playerColor,
        score: 0,
        streak: 0,
        lifelines_remaining: 2,
        lifelines_time_remaining: 2,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }
    setPlayer(newPlayer);
    setStep(3);
  };

  const fetchQuestion = async (qid: number, duration: number) => {
    const { data } = await supabase.from('questions').select('*').eq('id', qid).single();
    if (data) {
      setCurrentQuestion(data);
      setSecondsLeft(duration);
      startTimeRef.current = Date.now();
      startTimer(duration);
    }
  };

  const startTimer = (duration: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSubmitAnswer = async (optIdx: number) => {
    if (hasAnswered || questionStatus !== 'showing' || !currentQuestion) return;
    setHasAnswered(true);
    setChosenOption(optIdx);

    const timeSpent = ((Date.now() - startTimeRef.current) / 1000).toFixed(2);
    const correct = currentQuestion.correct_option === optIdx;

    const { error } = await supabase.from('player_answers').insert({
      session_id: session.id,
      player_id: player.id,
      question_id: currentQuestion.id,
      chosen_option: optIdx,
      is_correct: correct,
      time_spent: parseFloat(timeSpent)
    });

    if (error) {
      console.error(error);
      setHasAnswered(false);
      setChosenOption(null);
    }
  };

  const revealAnswer = async () => {
    stopTimer();
    if (!currentQuestion || !player) return;
    const { data: answer } = await supabase
      .from('player_answers')
      .select('*')
      .eq('session_id', session.id)
      .eq('player_id', player.id)
      .eq('question_id', currentQuestion.id)
      .single();

    if (answer) {
      setIsCorrect(answer.is_correct);
      if (answer.is_correct) {
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
      }
    } else {
      setIsCorrect(false);
    }
  };

  // LIFELINES (logic unchanged)
  const handleUse5050 = async () => {
    if (!currentQuestion || lifelinesRemaining <= 0 || hasAnswered) return;
    const wrongOptions = [1, 2, 3, 4].filter(i => i !== currentQuestion.correct_option);
    const toHide = wrongOptions.sort(() => 0.5 - Math.random()).slice(0, 2);
    setHiddenOptions(toHide);
    setLifelinesRemaining(prev => prev - 1);
    await supabase.from('players').update({ lifelines_remaining: lifelinesRemaining - 1 }).eq('id', player.id);
  };

  const handleUseTimeLifeline = async () => {
    if (lifelinesTimeRemaining <= 0 || questionStatus !== 'showing') return;
    const newTimerVal = session.timer_duration + 20;
    await supabase.from('sessions').update({ timer_duration: newTimerVal }).eq('id', session.id);
    setLifelinesTimeRemaining(prev => prev - 1);
    await supabase.from('players').update({ lifelines_time_remaining: lifelinesTimeRemaining - 1 }).eq('id', player.id);
    setSecondsLeft(prev => prev + 20);
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <Background className="grid min-h-screen place-items-center p-4">
      {/* STEP 1: VERIFY ROOM CODE */}
      {step === 1 && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="anim-float mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-gradient">انضم للمسابقة</h1>
            <p className="mt-2 text-xs text-ink-mute">اكتب رمز الغرفة المكون من 4 أرقام للانضمام لجلسة اللعب</p>
          </div>

          <div className="glass-strong rounded-[var(--radius-card)] p-7 shadow-[var(--shadow-neon)]">
            <Field label="رمز الغرفة">
              <Input
                type="text"
                placeholder="••••"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                icon={<KeyRound className="h-5 w-5" />}
                className="text-center font-display text-2xl font-extrabold tracking-[0.4em]"
              />
            </Field>
            <Button variant="primary" size="lg" fullWidth className="mt-5" onClick={handleVerifyRoom}>
              التحقق من الرمز
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {step === 2 && session && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-ink">أهلاً بك في: {session.title}</h2>
            <p className="mt-1 text-xs text-ink-mute">اكتب اسمك للمشاركة في المسابقة</p>
          </div>

          <div className="glass-strong rounded-[var(--radius-card)] p-7 space-y-5 shadow-[var(--shadow-neon)]">
            <Field label="اسم المتسابق">
              <Input
                type="text"
                placeholder="اكتب اسمك هنا..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                icon={<User className="h-5 w-5" />}
              />
            </Field>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink-soft">اختر لونك المفضل</label>
              <div className="flex justify-center gap-3">
                {colors.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPlayerColor(c)}
                    className={cn(
                      'h-9 w-9 cursor-pointer rounded-full border-2 transition-all',
                      playerColor === c ? 'scale-115 border-white shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                    )}
                    style={{ backgroundColor: c, boxShadow: playerColor === c ? `0 0 18px ${c}` : undefined }}
                    aria-label={`لون ${c}`}
                  />
                ))}
              </div>
            </div>

            <Button variant="primary" size="lg" fullWidth onClick={handleJoinGame}>دخول المسابقة</Button>
          </div>
        </div>
      )}

      {/* STEP 3: GAME HUD */}
      {step === 3 && player && session && (
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* HUD header */}
          <div className="glass flex items-center justify-between rounded-2xl p-3.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full" style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }} />
              <span className="text-sm font-bold text-ink">{player.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-display text-xs font-extrabold text-gold">
                {player.score}
              </span>
              {streak >= 3 && (
                <span className="font-display text-xs font-bold text-orange-400">🔥 {streak}</span>
              )}
            </div>
          </div>

          {/* Lifelines */}
          {session.status === 'active' && questionStatus === 'showing' && !hasAnswered && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleUse5050}
                disabled={lifelinesRemaining <= 0}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-void-2/60 py-3 text-xs font-bold text-ink-soft transition-all hover:border-magenta/40 hover:text-magenta disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Scissors className="h-4 w-4" />
                حذف إجابتين ({lifelinesRemaining})
              </button>
              <button
                onClick={handleUseTimeLifeline}
                disabled={lifelinesTimeRemaining <= 0}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-void-2/60 py-3 text-xs font-bold text-ink-soft transition-all hover:border-cyan/40 hover:text-cyan disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle className="h-4 w-4" />
                +20 ثانية ({lifelinesTimeRemaining})
              </button>
            </div>
          )}

          {/* Main panel */}
          <div className="glass-strong flex min-h-[320px] flex-col justify-center rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-neon)]">
            {/* WAITING */}
            {session.status === 'waiting' && (
              <div className="anim-rise space-y-4 text-center">
                <Sparkles className="anim-float mx-auto h-12 w-12 text-neon-bright" />
                <h3 className="text-lg font-bold text-ink">بانتظار بدء التحدي...</h3>
                <p className="text-xs text-ink-mute">عند قيام المقدم بطرح السؤال الأول، ستظهر خيارات الإجابة هنا فوراً.</p>
              </div>
            )}

            {/* ACTIVE */}
            {session.status === 'active' && currentQuestion && (
              <div className="space-y-5">
                {questionStatus === 'showing' && (
                  <>
                    {/* Neon timer */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-neon-bright">
                        <Clock className={cn('h-4 w-4', secondsLeft <= 5 && 'anim-pulse-neon text-danger-bright')} />
                        <span className={cn('font-display text-2xl font-extrabold tabular', secondsLeft <= 5 ? 'text-danger-bright' : 'text-ink')}>
                          {secondsLeft}
                        </span>
                        <span className="text-xs text-ink-mute">ثانية</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-1000 ease-linear',
                            secondsLeft <= 5 ? 'bg-danger' : 'bg-gradient-to-l from-neon-deep to-neon'
                          )}
                          style={{ width: `${(secondsLeft / session.timer_duration) * 100}%` }}
                        />
                      </div>
                    </div>

                    {hasAnswered ? (
                      <div className="anim-rise space-y-3 py-8 text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
                        <h4 className="font-bold text-ink">تم تسجيل إجابتك!</h4>
                        <p className="text-xs text-ink-mute">بانتظار المقدم لكشف النتيجة...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((optNum) => {
                          const optionKey = `option${optNum}`;
                          const optionVal = currentQuestion[optionKey];
                          if (!optionVal || hiddenOptions.includes(optNum)) return null;
                          return (
                            <button
                              key={optNum}
                              onClick={() => handleSubmitAnswer(optNum)}
                              className={cn(
                                'group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all active:scale-95',
                                'border-line bg-void-2/60 hover:border-neon/60 hover:bg-neon/10 hover:shadow-[var(--shadow-neon)]'
                              )}
                            >
                              <span className="font-display text-2xl font-extrabold text-neon-bright transition-colors group-hover:text-gold">
                                {optionLabels[optNum - 1]}
                              </span>
                              <span className="text-sm font-bold text-ink-soft">{optionVal}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* REVEAL */}
                {questionStatus === 'revealed' && isCorrect !== null && (
                  <div className={cn('anim-rise space-y-4 py-6 text-center', isCorrect ? '' : 'anim-shake')}>
                    {isCorrect ? (
                      <>
                        <CheckCircle className="anim-count-pop mx-auto h-16 w-16 text-success" />
                        <h3 className="text-xl font-bold text-success-bright">إجابة صحيحة!</h3>
                      </>
                    ) : (
                      <>
                        <XCircle className="anim-count-pop mx-auto h-16 w-16 text-danger" />
                        <h3 className="text-xl font-bold text-danger-bright">إجابة خاطئة!</h3>
                      </>
                    )}
                    <p className="text-xs text-ink-mute">بانتظار المقدم لإطلاق السؤال التالي...</p>
                  </div>
                )}
              </div>
            )}

            {/* FINISHED */}
            {session.status === 'finished' && (
              <div className="anim-rise space-y-4 text-center">
                <Trophy className="anim-float mx-auto h-12 w-12 text-gold" />
                <h3 className="text-xl font-bold text-ink">انتهت المسابقة!</h3>
                <p className="text-xs text-ink-mute">شكراً لمشاركتك المتميزة. راقب شاشة التلفزيون لمشاهدة منصة التتويج.</p>
              </div>
            )}
          </div>

          {/* Scoreboard overlay */}
          {session.show_scoreboard && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-void/80 p-6 backdrop-blur-md">
              <div className="glass-strong w-full max-w-sm space-y-4 rounded-[var(--radius-card)] p-6 text-center shadow-[var(--shadow-neon-strong)]">
                <Trophy className="anim-float mx-auto h-10 w-10 text-gold" />
                <h3 className="text-lg font-bold text-gradient-gold">الترتيب المؤقت</h3>
                <p className="text-xs text-ink-mute">سيختفي الترتيب تلقائياً خلال ثوانٍ...</p>
                <div className="rounded-xl border border-gold/25 bg-gold/10 py-3 font-display text-lg font-extrabold text-gold">
                  {player.score} نقطة
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Background>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-mute">جاري التحميل...</div>}>
      <PlayerPageContent />
    </Suspense>
  );
}
