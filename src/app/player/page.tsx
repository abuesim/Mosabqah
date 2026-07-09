'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ShieldCheck, User, Sparkles, KeyRound, Clock, Zap, CheckCircle, XCircle, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

import { Suspense } from 'react';

function PlayerPageContent() {
  const searchParams = useSearchParams();
  const urlRoomCode = searchParams.get('room');

  // Connection Steps
  const [step, setStep] = useState(1);
  const [roomCode, setRoomCode] = useState(urlRoomCode || '');
  const [session, setSession] = useState<any>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#ff4757');
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

  const colors = ['#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#9b59b6', '#fd79a8'];

  // Auto verify if room code is in url
  useEffect(() => {
    if (urlRoomCode) {
      handleVerifyRoom();
    }
  }, [urlRoomCode]);

  // Realtime Session and Player subscriptions
  useEffect(() => {
    if (!player?.id || !session?.id) return;

    // 1. Subscribe to Session Updates
    const sessionChannel = supabase
      .channel(`player-session-${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` }, (payload) => {
        const newSess = payload.new;
        setSession(newSess);
        setQuestionStatus(newSess.question_status);

        if (newSess.question_status === 'showing') {
          // New Question Started
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

    // 2. Subscribe to Player Score updates
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

    // Check if player name already taken in this session
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('*')
      .eq('session_id', session.id)
      .eq('name', playerName.trim())
      .single();

    if (existingPlayer) {
      // Re-link to existing player identity (localStorage backup)
      setPlayer(existingPlayer);
      setStreak(existingPlayer.streak || 0);
      setStep(3);
      return;
    }

    // Register new player
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
        confetti({ particleCount: 30, spread: 40 });
      }
    } else {
      setIsCorrect(false); // No answer submitted
    }
  };

  // ==========================================
  // LIFELINES ACTION HANDLERS
  // ==========================================

  const handleUse5050 = async () => {
    if (!currentQuestion || lifelinesRemaining <= 0 || hasAnswered) return;

    // Pick 2 wrong option indices to hide
    const wrongOptions = [1, 2, 3, 4].filter(i => i !== currentQuestion.correct_option);
    // Shuffle and pick 2
    const toHide = wrongOptions.sort(() => 0.5 - Math.random()).slice(0, 2);

    setHiddenOptions(toHide);
    setLifelinesRemaining(prev => prev - 1);

    // Update in Database
    await supabase
      .from('players')
      .update({ lifelines_remaining: lifelinesRemaining - 1 })
      .eq('id', player.id);
  };

  const handleUseTimeLifeline = async () => {
    if (lifelinesTimeRemaining <= 0 || questionStatus !== 'showing') return;

    // Broadcast timer extension to the room (Update session start time or timer duration)
    // For simplicity, we add 20 seconds to the current room timer
    const newTimerVal = session.timer_duration + 20;

    await supabase
      .from('sessions')
      .update({ timer_duration: newTimerVal })
      .eq('id', session.id);

    setLifelinesTimeRemaining(prev => prev - 1);

    // Update in Database
    await supabase
      .from('players')
      .update({ lifelines_time_remaining: lifelinesTimeRemaining - 1 })
      .eq('id', player.id);

    alert('تم تمديد الوقت لـ 20 ثانية إضافية! ⏱️');
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-950 text-slate-100 font-sans">
      
      {/* STEP 1: VERIFY ROOM CODE */}
      {step === 1 && (
        <div className="w-full max-w-sm p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl relative">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
              انضم للمسابقة 🏆
            </h1>
            <p className="text-slate-400 text-xs mt-2">اكتب رمز الغرفة المكون من 4 أرقام للانضمام لجلسة اللعب</p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">رمز الغرفة</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <KeyRound className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="1234"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900/60 border border-white/10 focus:border-purple-500 outline-none text-center font-mono font-bold tracking-widest text-lg"
                />
              </div>
            </div>

            <button
              onClick={handleVerifyRoom}
              className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-all"
            >
              التحقق من الرمز 🔍
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER PROFILE (NAME / COLOR) */}
      {step === 2 && session && (
        <div className="w-full max-w-sm p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-slate-200">أهلاً بك في: {session.title}</h2>
            <p className="text-slate-400 text-xs mt-1">اكتب اسمك للمشاركة في المسابقة</p>
          </div>

          <div className="space-y-5 text-sm">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">اسم المتسابق</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  placeholder="اكتب اسمك هنا..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900/60 border border-white/10 focus:border-purple-500 outline-none"
                />
              </div>
            </div>

            {/* Color selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">اختر لونك المفضل</label>
              <div className="flex justify-center gap-3">
                {colors.map(c => (
                  <button
                    key={c}
                    onClick={() => setPlayerColor(c)}
                    className="w-8 h-8 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: c,
                      borderColor: playerColor === c ? '#fff' : 'transparent',
                      transform: playerColor === c ? 'scale(1.15)' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleJoinGame}
              className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-all mt-4"
            >
              دخول المسابقة 🎮
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CONTESTANT GAME HUD */}
      {step === 3 && player && session && (
        <div className="w-full max-w-md flex flex-col space-y-6">
          
          {/* Header HUD Navbar */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: player.color }} />
              <span className="font-bold text-sm text-slate-200">{player.name}</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-extrabold text-xs">
                ⭐ {player.score} نقطة
              </span>
              {streak >= 3 && (
                <span className="text-xs text-orange-400 font-bold">🔥 {streak} متتالي</span>
              )}
            </div>
          </div>

          {/* Lifelines Bar */}
          {session.status === 'active' && questionStatus === 'showing' && !hasAnswered && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleUse5050}
                disabled={lifelinesRemaining <= 0}
                className="py-3 rounded-xl bg-slate-900/60 border border-white/10 hover:bg-slate-900 text-xs font-bold text-slate-200 transition-all disabled:opacity-40"
              >
                ✂️ حذف إجابتين ({lifelinesRemaining})
              </button>
              <button
                onClick={handleUseTimeLifeline}
                disabled={lifelinesTimeRemaining <= 0}
                className="py-3 rounded-xl bg-slate-900/60 border border-white/10 hover:bg-slate-900 text-xs font-bold text-slate-200 transition-all disabled:opacity-40"
              >
                ⏱️ +20 ثانية ({lifelinesTimeRemaining})
              </button>
            </div>
          )}

          {/* MAIN SCREEN PANEL */}
          <div className="p-8 rounded-2xl bg-white/5 border border-white/10 shadow-2xl flex flex-col justify-center min-h-[300px]">
            {/* LOBBY / WAITING SCREEN */}
            {session.status === 'waiting' && (
              <div className="text-center space-y-4">
                <Sparkles className="w-12 h-12 text-purple-400 mx-auto animate-spin" />
                <h3 className="text-xl font-bold text-slate-200">بانتظار بدء التحدي...</h3>
                <p className="text-slate-400 text-xs">عند قيام المقدم بطرح السؤال الأول، ستظهر خيارات الإجابة هنا فوراً.</p>
              </div>
            )}

            {/* ACTIVE PLAY: QUESTIONS OPTION BUTTONS */}
            {session.status === 'active' && currentQuestion && (
              <div className="space-y-6">
                {questionStatus === 'showing' && (
                  <div className="space-y-5">
                    {/* Timer */}
                    <div className="flex items-center justify-center gap-2 text-purple-400 font-extrabold text-sm">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span>{secondsLeft} ثانية متبقية</span>
                    </div>

                    {hasAnswered ? (
                      <div className="text-center py-12 space-y-3">
                        <Zap className="w-8 h-8 text-yellow-400 mx-auto animate-bounce" />
                        <h4 className="font-bold text-slate-200">تم تسجيل إجابتك بنجاح!</h4>
                        <p className="text-slate-400 text-xs">بانتظار المقدم لكشف النتيجة أو انتهاء وقت البقية...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((optNum) => {
                          const optionKey = `option${optNum}`;
                          const optionVal = currentQuestion[optionKey];
                          if (!optionVal || hiddenOptions.includes(optNum)) return null;

                          return (
                            <button
                              key={optNum}
                              onClick={() => handleSubmitAnswer(optNum)}
                              className="py-6 rounded-xl border border-white/10 hover:border-purple-500 bg-slate-900/60 hover:bg-purple-500/10 font-bold text-base transition-all active:scale-95"
                            >
                              الخيار {optNum}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* REVEAL CORRECT ANSWER FEEDBACK */}
                {questionStatus === 'revealed' && isCorrect !== null && (
                  <div className="text-center py-8 space-y-4">
                    {isCorrect ? (
                      <>
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto animate-bounce" />
                        <h3 className="text-xl font-bold text-green-400">إجابة صحيحة! 🎉</h3>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-16 h-16 text-red-500 mx-auto animate-shake" />
                        <h3 className="text-xl font-bold text-red-400">إجابة خاطئة! 😢</h3>
                      </>
                    )}
                    <p className="text-slate-400 text-xs">بانتظار المقدم لإطلاق السؤال التالي...</p>
                  </div>
                )}
              </div>
            )}

            {/* END OF GAME SCREEN */}
            {session.status === 'finished' && (
              <div className="text-center space-y-4">
                <Trophy className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
                <h3 className="text-xl font-bold text-slate-200">انتهت المسابقة! 🏁</h3>
                <p className="text-slate-400 text-xs">شكراً لمشاركتك المتميزة معنا. راقب شاشة التلفزيون لمشاهدة منصة التتويج والنتائج النهائية.</p>
              </div>
            )}
          </div>
          
          {/* Floating Scoreboard Overlay */}
          {session.show_scoreboard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
              <div className="w-full max-w-sm p-6 rounded-2xl bg-white/5 border border-white/10 text-center space-y-4">
                <h3 className="text-lg font-bold text-purple-300">الترتيب المؤقت للمتسابقين 📊</h3>
                <p className="text-xs text-slate-400">سيختفي الترتيب تلقائياً خلال ثوانٍ...</p>
                <div className="py-2 text-sm font-bold text-slate-200">
                  لقد حققت: {player.score} نقطة ⭐
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">جاري التحميل...</div>}>
      <PlayerPageContent />
    </Suspense>
  );
}
