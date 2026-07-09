'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Radio, Users, Trophy, Award, Sparkles, Monitor, EyeOff, Eye } from 'lucide-react';
import confetti from 'canvas-confetti';

import { Suspense } from 'react';

function TvPageContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get('code');

  const [session, setSession] = useState<any>(null);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  // Clean Feed Overlay States
  const [overlayMode, setOverlayMode] = useState<'normal' | 'chroma' | 'transparent'>('normal');

  // Countdown timer inside TV Page
  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-question ready countdown (5s)
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    async function loadRoom() {
      // 1. Fetch Session Info
      const { data: sess } = await supabase.from('sessions').select('*').eq('room_code', roomCode).single();
      if (!sess) return;
      setSession(sess);

      // 2. Fetch Players
      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', sess.id)
        .order('score', { ascending: false });
      if (playerData) setPlayers(playerData);

      // 3. Fetch Question Info
      if (sess.current_question_id) {
        const { data: q } = await supabase.from('questions').select('*').eq('id', sess.current_question_id).single();
        if (q) setCurrentQuestion(q);
      }
    }

    loadRoom();

    // Subscribe to realtime database updates
    const sessionChannel = supabase
      .channel(`tv-session-${roomCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `room_code=eq.${roomCode}` }, (payload) => {
        const updatedSess = payload.new;
        
        // Handle prep countdown trigger
        if (updatedSess.current_question_id && updatedSess.current_question_id !== session?.current_question_id) {
          triggerPrepCountdown(updatedSess);
        } else {
          setSession(updatedSess);
          if (updatedSess.question_status === 'showing') {
            startTimer(updatedSess.timer_duration);
          } else if (updatedSess.question_status === 'revealed') {
            stopTimer();
          }
        }
      })
      .subscribe();

    const playersChannel = supabase
      .channel(`tv-players-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        if (session?.id) {
          supabase
            .from('players')
            .select('*')
            .eq('session_id', session.id)
            .order('score', { ascending: false })
            .then(({ data }) => {
              if (data) setPlayers(data);
            });
        }
      })
      .subscribe();

    const answersChannel = supabase
      .channel(`tv-answers-${roomCode}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'player_answers' }, () => {
        if (session?.id && session?.current_question_id) {
          supabase
            .from('player_answers')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('question_id', session.current_question_id)
            .then(({ count }) => {
              setAnswersCount(count || 0);
            });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sessionChannel);
      supabase.removeChannel(playersChannel);
      supabase.removeChannel(answersChannel);
      stopTimer();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, [roomCode, session?.id, session?.current_question_id]);

  // Trigger ready count (5s) on new question
  const triggerPrepCountdown = (updatedSess: any) => {
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
          supabase.from('questions').select('*').eq('id', updatedSess.current_question_id).single().then(({ data }) => {
            if (data) setCurrentQuestion(data);
          });
          startTimer(updatedSess.timer_duration);
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
          // Notify server of timer expired if host didn't reveal yet
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

  // Confetti effect on finished game
  useEffect(() => {
    if (session?.status === 'finished') {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }, [session?.status]);

  if (!roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans p-6 text-center">
        <div className="space-y-4">
          <h2 className="text-xl font-bold">خطأ: رمز الغرفة مفقود بالرابط!</h2>
          <p className="text-slate-400 text-sm">يرجى توجيه الشاشة عبر كود الغرفة المخصص، مثل: `/tv?code=1234`</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-t-purple-500 border-white/5 animate-spin" />
          <p className="text-slate-400 text-sm">جاري جلب بيانات شاشة العرض...</p>
        </div>
      </div>
    );
  }

  // Determine Background CSS style based on overlayMode
  const getBackgroundStyle = () => {
    if (overlayMode === 'chroma') return 'bg-[#00ff00] text-black';
    if (overlayMode === 'transparent') return 'bg-transparent text-slate-100';
    return 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-950 via-purple-950/40 to-slate-950 text-slate-100';
  };

  const getPanelClass = () => {
    if (overlayMode === 'chroma') return 'bg-white border-2 border-black text-black';
    return 'bg-white/5 border border-white/10 backdrop-blur-xl text-slate-100';
  };

  // ==========================================
  // VIEW RENDER: 5s COUNTDOWN PREPARATION
  // ==========================================
  if (prepCountdown !== null) {
    return (
      <main className={`min-h-screen flex items-center justify-center font-sans ${getBackgroundStyle()} p-6`}>
        <div className="text-center space-y-6">
          <h2 className="text-2xl font-extrabold tracking-widest text-purple-400 animate-pulse uppercase">استعد للسؤال التالي! 🔥</h2>
          <div className="text-8xl md:text-9xl font-black text-white drop-shadow-2xl animate-ping">
            {prepCountdown}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`min-h-screen font-sans ${getBackgroundStyle()} p-6 md:p-12 relative flex flex-col justify-between transition-colors duration-300`}>
      
      {/* Clean Feed Controls Drawer at bottom left (Presenter can toggle overlay) */}
      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 p-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10 opacity-40 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-bold text-slate-400 px-2">شاشة المخرج:</span>
        <button
          onClick={() => setOverlayMode('normal')}
          className={`px-2 py-1 rounded text-[10px] font-bold ${overlayMode === 'normal' ? 'bg-purple-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}
        >
          شاشة عادية 🖥️
        </button>
        <button
          onClick={() => setOverlayMode('chroma')}
          className={`px-2 py-1 rounded text-[10px] font-bold ${overlayMode === 'chroma' ? 'bg-green-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}
        >
          كروما خضراء 🟢
        </button>
        <button
          onClick={() => setOverlayMode('transparent')}
          className={`px-2 py-1 rounded text-[10px] font-bold ${overlayMode === 'transparent' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/5'}`}
        >
          شفافة 💨
        </button>
      </div>

      {/* 1. STATE: WAITING FOR PLAYERS TO JOIN */}
      {session.status === 'waiting' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
              {session.title}
            </h1>
            <p className="text-slate-400 text-sm md:text-lg">تحدي معلومات لحظي مباشر. انضم إلينا الآن للعب!</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-2xl">
            {/* Room Code */}
            <div className={`p-8 rounded-2xl ${getPanelClass()} flex flex-col items-center justify-center space-y-4 shadow-xl`}>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">خطوات الدخول</h3>
              <p className="text-5xl md:text-6xl font-black font-mono tracking-widest text-purple-400">
                {session.room_code}
              </p>
              <p className="text-slate-300 text-xs">اكتب الرمز في صفحة المتسابق للانضمام فوراً</p>
            </div>

            {/* Stats */}
            <div className={`p-8 rounded-2xl ${getPanelClass()} flex flex-col items-center justify-center space-y-4 shadow-xl`}>
              <Users className="w-12 h-12 text-purple-400" />
              <p className="text-3xl font-extrabold text-slate-100">
                {players.length} لاعب متصل
              </p>
              <div className="flex flex-wrap gap-2 justify-center max-h-24 overflow-y-auto p-1">
                {players.map(p => (
                  <span key={p.id} className="text-xs px-2.5 py-1 rounded-full bg-slate-900/60 border border-white/5 font-bold" style={{ color: p.color }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. STATE: ACTIVE PLAY / QUESTION DISPLAY */}
      {session.status === 'active' && currentQuestion && (
        <div className="flex-1 flex flex-col justify-between max-w-5xl mx-auto w-full space-y-8">
          {/* Question Text & Header Info */}
          <div className="space-y-4 text-center">
            <h2 className="text-2xl md:text-4xl font-extrabold text-slate-100 leading-tight">
              {currentQuestion.question_text}
            </h2>
            <div className="flex justify-center gap-4 text-xs font-bold">
              <span className="px-3 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/10 uppercase">
                {currentQuestion.category === 'islamic' ? '🕌 إسلامية' : currentQuestion.category === 'riddles' ? '🧩 ألغاز' : 'عام'}
              </span>
              <span className="px-3 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/10">
                إجابات: {answersCount} / {players.length}
              </span>
            </div>
          </div>

          {/* Option Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full my-auto">
            {['option1', 'option2', 'option3', 'option4'].map((optKey, idx) => {
              const optVal = currentQuestion[optKey];
              if (!optVal) return null;
              
              const isCorrect = currentQuestion.correct_option === (idx + 1);
              const isRevealed = session.question_status === 'revealed';

              return (
                <div
                  key={idx}
                  className={`p-6 rounded-2xl border text-lg md:text-xl font-bold transition-all shadow-md flex items-center justify-between ${
                    isRevealed
                      ? isCorrect
                        ? 'bg-green-500/20 border-green-500 text-green-300 scale-105 shadow-green-500/10'
                        : 'bg-red-500/5 border-red-500/20 text-slate-500 opacity-60'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  <span>{idx + 1}. {optVal}</span>
                  {isRevealed && isCorrect && <Award className="w-6 h-6 text-green-400 shrink-0" />}
                </div>
              );
            })}
          </div>

          {/* Timer & Progress Bar */}
          {session.question_status === 'showing' && (
            <div className="space-y-3 w-full">
              <div className="flex items-center justify-between text-sm font-bold text-slate-300">
                <span>الوقت المتبقي لتقديم الإجابات</span>
                <span className="text-xl text-purple-400 animate-pulse">{secondsLeft} ثانية</span>
              </div>
              <div className="w-full h-3 bg-white/5 border border-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 transition-all duration-1000 linear"
                  style={{ width: `${(secondsLeft / session.timer_duration) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. STATE: FINISHED / WINNERS PODIUM */}
      {session.status === 'finished' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto text-center space-y-12">
          <div className="space-y-4">
            <Trophy className="w-16 h-16 text-amber-400 mx-auto animate-bounce" />
            <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
              تتويج الفائزين بالمسابقة! 🏆
            </h1>
            <p className="text-slate-400 text-sm md:text-lg">تهانينا الحارة لجميع الفائزين الأبطال وتمنياتنا بالحظ الأوفر في المرة القادمة!</p>
          </div>

          {/* Podium */}
          {players.length > 0 && (
            <div className="flex items-end justify-center gap-4 md:gap-8 w-full max-w-2xl pt-12">
              {/* 2nd Place */}
              {players[1] && (
                <div className="flex flex-col items-center gap-3 w-1/3">
                  <span className="text-xs font-bold text-slate-400" style={{ color: players[1].color }}>{players[1].name}</span>
                  <div className="w-full h-24 bg-gradient-to-t from-slate-800 to-slate-700/60 border border-slate-700 rounded-t-xl flex items-center justify-center font-extrabold text-xl text-slate-400 shadow-md">
                    2
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">{players[1].score} نقطة</span>
                </div>
              )}

              {/* 1st Place */}
              <div className="flex flex-col items-center gap-3 w-1/3">
                <Sparkles className="w-6 h-6 text-amber-400 animate-spin" />
                <span className="text-sm font-black text-amber-400" style={{ color: players[0].color }}>{players[0].name}</span>
                <div className="w-full h-36 bg-gradient-to-t from-amber-600/30 to-amber-500/10 border-2 border-amber-500/30 rounded-t-2xl flex items-center justify-center font-black text-3xl text-amber-400 shadow-lg shadow-amber-500/10">
                  1 🏆
                </div>
                <span className="text-xs text-amber-400 font-extrabold">{players[0].score} نقطة</span>
              </div>

              {/* 3rd Place */}
              {players[2] && (
                <div className="flex flex-col items-center gap-3 w-1/3">
                  <span className="text-xs font-bold text-amber-700" style={{ color: players[2].color }}>{players[2].name}</span>
                  <div className="w-full h-16 bg-gradient-to-t from-slate-900 to-slate-800/60 border border-slate-800 rounded-t-xl flex items-center justify-center font-extrabold text-lg text-amber-700 shadow-sm">
                    3
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">{players[2].score} نقطة</span>
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">جاري التحميل...</div>}>
      <TvPageContent />
    </Suspense>
  );
}
