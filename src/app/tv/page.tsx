'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getSessionByRoomCode, getPlayers, getSessionQuestions,
  subscribeSession, subscribeSessionPlayers, subscribeAnswerCount,
} from '@/lib/db';
import type { Session, Player, Question } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Users, Trophy, Award, Monitor, EyeOff, Eye, Crown, Radio } from 'lucide-react';
import confetti from 'canvas-confetti';
import Spinner from '@/components/ui/Spinner';
import type { Unsubscribe } from 'firebase/firestore';

import { Suspense } from 'react';

function TvPageContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get('code');

  const [session, setSession] = useState<Session | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  const [overlayMode, setOverlayMode] = useState<'normal' | 'chroma' | 'transparent'>('normal');

  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for use inside subscription callbacks
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    if (!roomCode) return;

    async function loadRoom() {
      if (!roomCode) return;
      const sess = await getSessionByRoomCode(roomCode);
      if (!sess) return;
      setSession(sess);

      const playerData = await getPlayers(sess.id);
      setPlayers(playerData);

      if (sess.currentQuestionId) {
        const qList = await getSessionQuestions([sess.currentQuestionId]);
        if (qList[0]) setCurrentQuestion(qList[0]);
      }
    }

    loadRoom();

    return () => {
      stopTimer();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, [roomCode]);

  // Subscribe once we have a session id
  useEffect(() => {
    if (!session?.id) return;

    const unsubs: Unsubscribe[] = [];

    // 1. Session doc changes
    unsubs.push(
      subscribeSession(session.id, async (updatedSess) => {
        if (!updatedSess) return;

        // New question detected → trigger 5s prep countdown
        if (
          updatedSess.currentQuestionId &&
          updatedSess.currentQuestionId !== sessionRef.current?.currentQuestionId
        ) {
          triggerPrepCountdown(updatedSess);
        } else {
          setSession(updatedSess);
          if (updatedSess.questionStatus === 'showing') {
            startTimer(updatedSess.timerDuration);
          } else if (updatedSess.questionStatus === 'revealed') {
            stopTimer();
          }
        }
      })
    );

    // 2. Players list
    unsubs.push(
      subscribeSessionPlayers(session.id, (newPlayers) => {
        setPlayers(newPlayers);
      })
    );

    // 3. Answer count for current question
    if (session.currentQuestionId) {
      unsubs.push(
        subscribeAnswerCount(session.id, session.currentQuestionId, (count) => {
          setAnswersCount(count);
        })
      );
    }

    return () => {
      unsubs.forEach(u => u && u());
    };
  }, [session?.id, session?.currentQuestionId]);

  const triggerPrepCountdown = (updatedSess: Session) => {
    stopTimer();
    setPrepCountdown(5);
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);

    prepTimerRef.current = setInterval(() => {
      setPrepCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(prepTimerRef.current!);
          prepTimerRef.current = null;
          setPrepCountdown(null);
          // Apply changes after countdown
          setSession(updatedSess);
          if (updatedSess.currentQuestionId) {
            getSessionQuestions([updatedSess.currentQuestionId]).then((list) => {
              if (list[0]) setCurrentQuestion(list[0]);
            });
          }
          startTimer(updatedSess.timerDuration);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startTimer = (duration: number) => {
    setSecondsLeft(duration);
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

  useEffect(() => {
    if (session?.status === 'finished') {
      confetti({ particleCount: 180, spread: 90, origin: { y: 0.6 } });
    }
  }, [session?.status]);

  if (!roomCode) {
    return (
      <div className="grid min-h-screen place-items-center bg-void p-6 text-center">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-ink">خطأ: رمز الغرفة مفقود بالرابط!</h2>
          <p className="text-sm text-ink-mute">يرجى توجيه الشاشة عبر كود الغرفة المخصص، مثل: <code dir="ltr" className="text-neon-bright">/tv?code=1234</code></p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-void">
        <Spinner size="lg" label="جاري جلب بيانات شاشة العرض..." />
      </div>
    );
  }

  const currentOverlayMode = (session as any).overlayMode || overlayMode;

  const bgStyle: React.CSSProperties = {};
  if (currentOverlayMode === 'normal') {
    bgStyle.backgroundColor = (session as any).tvBgColor || '#090514';
  } else if (currentOverlayMode === 'chroma') {
    bgStyle.backgroundColor = '#00ff00';
  } else {
    bgStyle.backgroundColor = 'transparent';
  }

  const bgClass =
    currentOverlayMode === 'chroma' ? 'text-black font-semibold' :
    currentOverlayMode === 'transparent' ? 'text-ink' :
    'text-ink';

  const panelClass =
    currentOverlayMode === 'chroma' ? 'bg-white border-2 border-black text-black' :
    'glass text-ink';

  const fontSizeClass =
    (session as any).tvFontSize === 'sm' ? 'scale-90 origin-center' :
    (session as any).tvFontSize === 'md' ? 'scale-95 origin-center' :
    (session as any).tvFontSize === 'xl' ? 'scale-105 origin-center' :
    'scale-100';

  // PREP COUNTDOWN
  if (prepCountdown !== null) {
    return (
      <main className={cn('min-h-screen grid place-items-center p-6 transition-all duration-300', bgClass)} style={bgStyle}>
        <div className="text-center">
          <h2 className="mb-4 font-display text-2xl font-extrabold uppercase tracking-[0.3em] text-neon-bright anim-pulse-neon">
            استعد للسؤال التالي
          </h2>
          <div key={prepCountdown} className="anim-count-pop font-display text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]">
            {prepCountdown}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={cn('relative min-h-screen flex flex-col justify-between p-6 transition-all duration-300 md:p-12', bgClass, fontSizeClass)} style={bgStyle}>
      {currentOverlayMode === 'normal' && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-mesh opacity-70" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
        </>
      )}

      {/* Event Logo Header */}
      {currentOverlayMode !== 'transparent' && (
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 select-none shrink-0">
          <h1 className="font-brand text-xl text-gradient">
            {(session as any).tvLogoText || session.title}
          </h1>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-neon-bright animate-pulse" />
            <span className="font-display text-[9px] uppercase font-bold text-ink-mute tracking-wider">Clean Output Broadcast</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-line bg-void/80 p-2 opacity-40 backdrop-blur-md transition-opacity hover:opacity-100">
        <span className="px-2 text-[10px] font-bold text-ink-mute">شاشة المخرج:</span>
        {[
          { mode: 'normal' as const, label: 'عادية', icon: <Monitor className="h-3 w-3" /> },
          { mode: 'chroma' as const, label: 'كروما', icon: <Eye className="h-3 w-3" /> },
          { mode: 'transparent' as const, label: 'شفافة', icon: <EyeOff className="h-3 w-3" /> },
        ].map((opt) => (
          <button
            key={opt.mode}
            onClick={() => setOverlayMode(opt.mode)}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-colors',
              overlayMode === opt.mode ? 'bg-neon text-white' : 'text-ink-mute hover:bg-white/5'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* WAITING */}
      {session.status === 'waiting' && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-10 text-center">
          <div className="space-y-3">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-4 py-1.5">
              <Radio className="h-4 w-4 anim-pulse-neon text-danger-bright" />
              <span className="text-xs font-bold uppercase tracking-widest text-neon-bright">بث مباشر</span>
            </div>
            <h1 className="font-brand text-5xl text-gradient md:text-6xl">{(session as any).tvLogoText || session.title}</h1>
            <p className="text-sm text-ink-mute md:text-lg">تحدّي معلومات لحظي مباشر. انضم إلينا الآن للعب!</p>
          </div>

          <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2">
            <div className={cn('flex flex-col items-center justify-center space-y-4 rounded-[var(--radius-card)] p-8', panelClass)}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-ink-mute">رمز الدخول</h3>
              <p className="font-display text-6xl font-black tracking-[0.3em] text-neon-bright drop-shadow-[0_0_25px_rgba(168,85,247,0.6)] md:text-7xl">
                {session.roomCode}
              </p>
              <p className="text-xs text-ink-mute">اكتب الرمز في صفحة المتسابق للانضمام</p>
            </div>

            <div className={cn('flex flex-col items-center justify-center space-y-4 rounded-[var(--radius-card)] p-8', panelClass)}>
              <Users className="h-12 w-12 text-cyan" />
              <p className="font-display text-3xl font-extrabold text-ink">
                {players.length} <span className="text-lg text-ink-mute">لاعب</span>
              </p>
              <div className="flex max-h-24 flex-wrap justify-center gap-1.5 overflow-y-auto">
                {players.map(p => (
                  <span key={p.id} className="rounded-full border border-line bg-void/60 px-2.5 py-1 text-xs font-bold" style={{ color: p.color }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE QUESTION */}
      {session.status === 'active' && currentQuestion && (
        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between space-y-8">
          <div className="space-y-4 pt-4 text-center">
            <h2 className="font-display text-2xl font-extrabold leading-tight text-ink md:text-4xl">
              {currentQuestion.questionText}
            </h2>
            <div className="flex justify-center gap-3 text-xs font-bold">
              <span className="rounded-full border border-neon/25 bg-neon/10 px-3 py-1 uppercase tracking-wider text-neon-bright">
                {currentQuestion.category === 'islamic' ? 'إسلامية' :
                 currentQuestion.category === 'riddles' ? 'ألغاز' :
                 currentQuestion.category === 'science' ? 'علوم' :
                 currentQuestion.category === 'family' ? 'عائلية' : 'عام'}
              </span>
              <span className="rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-cyan">
                الإجابات: <span className="font-display">{answersCount}</span> / {players.length}
              </span>
            </div>
          </div>

          <div className="my-auto grid w-full grid-cols-1 gap-5 md:grid-cols-2">
            {['option1', 'option2', 'option3', 'option4'].map((optKey, idx) => {
              const optVal = (currentQuestion as any)[optKey];
              if (!optVal) return null;
              const isCorrect = currentQuestion.correctOption === (idx + 1);
              const isRevealed = session.questionStatus === 'revealed';
              const labels = ['A', 'B', 'C', 'D'];

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center justify-between gap-4 rounded-2xl border p-6 text-lg font-bold shadow-md transition-all md:text-xl',
                    isRevealed
                      ? isCorrect
                        ? 'border-success bg-success/20 text-success-bright scale-105 shadow-[var(--shadow-success)]'
                        : 'border-danger/20 bg-danger/5 text-ink-faint opacity-50'
                      : cn('border-line', panelClass)
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-base font-extrabold', isRevealed && isCorrect ? 'bg-success text-white' : 'bg-white/10 text-neon-bright')}>
                      {labels[idx]}
                    </span>
                    <span>{optVal}</span>
                  </div>
                  {isRevealed && isCorrect && <Award className="h-6 w-6 shrink-0 text-success-bright" />}
                </div>
              );
            })}
          </div>

          {session.questionStatus === 'showing' && (
            <div className="relative space-y-2 pb-2">
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="text-ink-mute">الوقت المتبقي</span>
                <span className={cn('font-display text-2xl tabular', secondsLeft <= 5 ? 'text-danger-bright anim-pulse-neon' : 'text-neon-bright')}>
                  {secondsLeft}<span className="text-sm text-ink-mute"> ث</span>
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full border border-line bg-white/5">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000 ease-linear',
                    secondsLeft <= 5 ? 'bg-danger' : 'bg-gradient-to-l from-neon-deep via-neon to-cyan'
                  )}
                  style={{ width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* FINISHED / PODIUM */}
      {session.status === 'finished' && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-10 text-center">
          <div className="space-y-3">
            <Trophy className="anim-float mx-auto h-16 w-16 text-gold drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
            <h1 className="font-brand text-5xl text-gradient-gold md:text-6xl">تتويج الفائزين</h1>
            <p className="text-sm text-ink-mute md:text-lg">تهانينا الحارة لجميع الفائزين الأبطال!</p>
          </div>

          {players.length > 0 && (
            <div className="flex w-full max-w-2xl items-end justify-center gap-4 pt-12 md:gap-8">
              {players[1] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span className="text-xs font-bold" style={{ color: players[1].color }}>{players[1].name}</span>
                  <div className="flex h-24 w-full items-center justify-center rounded-t-xl border border-white/15 bg-gradient-to-t from-void-3 to-white/10 font-display text-xl font-extrabold text-ink-soft shadow-md">
                    2
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">{players[1].score}</span>
                </div>
              )}

              <div className="flex w-1/3 flex-col items-center gap-3">
                <Crown className="anim-float h-7 w-7 text-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.7)]" />
                <span className="text-sm font-black text-gold" style={{ color: players[0].color }}>{players[0].name}</span>
                <div className="flex h-36 w-full items-center justify-center rounded-t-2xl border-2 border-gold/40 bg-gradient-to-t from-gold-deep/30 to-gold/10 font-display text-3xl font-black text-gold shadow-[var(--shadow-gold)]">
                  1
                </div>
                <span className="font-display text-xs font-extrabold text-gold">{players[0].score}</span>
              </div>

              {players[2] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span className="text-xs font-bold text-amber-600" style={{ color: players[2].color }}>{players[2].name}</span>
                  <div className="flex h-16 w-full items-center justify-center rounded-t-xl border border-white/10 bg-gradient-to-t from-void to-void-3 font-display text-lg font-extrabold text-amber-600 shadow-sm">
                    3
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">{players[2].score}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function TvPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-void text-ink-mute">جاري التحميل...</div>}>
      <TvPageContent />
    </Suspense>
  );
}
