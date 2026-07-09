'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Layers, Plus, Play, Circle, CheckSquare, Square, Trash2, ArrowLeft, Users, Trophy, Award, Radio } from 'lucide-react';

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

        // Fetch central library questions
        const { data: qData } = await supabase.from('questions').select('*').order('created_at', { ascending: false });
        if (qData) setQuestions(qData);

        // Fetch Sessions
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
      // 1. Fetch Session Info
      const { data: session } = await supabase.from('sessions').select('*').eq('id', activeSessionId).single();
      if (!session) return;
      setActiveSession(session);

      // 2. Fetch Session Questions
      const { data: sqData } = await supabase
        .from('session_questions')
        .select('question_id')
        .eq('session_id', activeSessionId);
      if (sqData && sqData.length > 0) {
        const qIds = sqData.map(sq => sq.question_id);
        const { data: qList } = await supabase.from('questions').select('*').in('id', qIds);
        if (qList) {
          setActiveQuestions(qList);
          // Set current question if any
          if (session.current_question_id) {
            const currentQ = qList.find(q => q.id === session.current_question_id);
            setCurrentQuestion(currentQ || null);
          }
        }
      }

      // 3. Fetch Players
      const { data: playerData } = await supabase
        .from('players')
        .select('*')
        .eq('session_id', activeSessionId)
        .order('score', { ascending: false });
      if (playerData) setPlayers(playerData);

      // 4. Fetch Submitted Answers Count for current question
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

    // Set up Realtime subscriptions
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

      // 1. Create Session
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

      // 2. Map Selected Questions
      const sessionQuestions = selectedQuestionIds.map(qid => ({
        session_id: session.id,
        question_id: qid
      }));

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

  // ==========================================
  // GAME CONSOLE ACTION HANDLERS
  // ==========================================

  const handleShowQuestion = async (qid: number) => {
    if (!activeSession) return;
    setAnswersCount(0);

    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        current_question_id: qid,
        question_status: 'showing',
        status: 'active'
      })
      .eq('id', activeSession.id);

    if (updateError) console.error(updateError);
  };

  const handleRevealAnswer = async () => {
    if (!activeSession || !currentQuestion) return;

    // Fetch submitted answers
    const { data: submissions } = await supabase
      .from('player_answers')
      .select('*')
      .eq('session_id', activeSession.id)
      .eq('question_id', currentQuestion.id);

    if (submissions && submissions.length > 0) {
      // Calculate and update players' scores in database
      const updates = submissions.map(sub => {
        if (sub.is_correct) {
          // Calculate score based on speed: base 100 + up to 50 bonus
          const timePercent = Math.max(0, 1 - (parseFloat(sub.time_spent) / activeSession.timer_duration));
          const bonus = Math.round(timePercent * 50);
          const scoreAdded = 100 + bonus;

          const player = players.find(p => p.id === sub.player_id);
          const currentScore = player ? player.score : 0;
          const currentStreak = player ? player.streak : 0;

          return supabase
            .from('players')
            .update({
              score: currentScore + scoreAdded,
              streak: currentStreak + 1
            })
            .eq('id', sub.player_id);
        } else {
          // Reset streak on wrong answer
          return supabase
            .from('players')
            .update({ streak: 0 })
            .eq('id', sub.player_id);
        }
      });

      await Promise.all(updates);
    }

    // Set status to revealed
    await supabase
      .from('sessions')
      .update({ question_status: 'revealed' })
      .eq('id', activeSession.id);
  };

  const handleToggleScoreboard = async () => {
    if (!activeSession) return;
    const newState = !activeSession.show_scoreboard;
    
    await supabase
      .from('sessions')
      .update({ show_scoreboard: newState })
      .eq('id', activeSession.id);

    // Auto hide scoreboard after 8 seconds on players devices
    if (newState) {
      setTimeout(async () => {
        await supabase
          .from('sessions')
          .update({ show_scoreboard: false })
          .eq('id', activeSession.id);
      }, 8000);
    }
  };

  const handleEndGame = async () => {
    if (!activeSession) return;
    if (!confirm('هل تريد إنهاء هذه المسابقة نهائياً وتتويج الفائزين؟')) return;

    // 1. Get Top Winner
    if (players.length > 0) {
      const winner = players[0]; // first player in sorted players array

      // Add to Winners Archive
      await supabase.from('winners_archive').insert({
        session_id: activeSession.id,
        session_title: activeSession.title,
        winner_name: winner.name,
        winner_score: winner.score,
        total_players: players.length
      });

      // Update Cumulative Standings for all players
      const cumulativeUpdates = players.map(p => {
        return supabase.rpc('increment_cumulative_score', {
          p_name: p.name,
          p_score: p.score
        });
      });
      await Promise.all(cumulativeUpdates);
    }

    // 2. Set Session Status to finished
    await supabase
      .from('sessions')
      .update({
        status: 'finished',
        current_question_id: null,
        question_status: 'idle'
      })
      .eq('id', activeSession.id);

    router.push('/dashboard/sessions');
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-purple-500 border-white/5 animate-spin" />
      </div>
    );
  }

  // ==========================================
  // VIEW RENDER: GAME CONSOLE
  // ==========================================
  if (activeSession) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="p-2.5 rounded-xl bg-slate-900/60 border border-white/10 hover:bg-slate-900 text-slate-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold text-slate-100 flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                غرفة التحكم: {activeSession.title}
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                الرمز التعريفي للغرفة: <span className="font-mono font-bold text-purple-300">{activeSession.room_code}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleEndGame}
            className="px-5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-bold transition-all"
          >
            إنهاء وتتويج الفائزين 🏁
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Questions List / Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Question Panel */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-5">
              <h3 className="text-sm text-slate-400 font-bold tracking-wider uppercase">السؤال النشط حالياً</h3>
              
              {currentQuestion ? (
                <div className="space-y-4">
                  <h4 className="text-lg md:text-xl font-bold text-slate-100">{currentQuestion.question_text}</h4>
                  
                  {/* Option Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-xl border text-sm ${currentQuestion.correct_option === 1 ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-slate-900/60 border-white/5 text-slate-300'}`}>
                      1. {currentQuestion.option1}
                    </div>
                    <div className={`p-4 rounded-xl border text-sm ${currentQuestion.correct_option === 2 ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-slate-900/60 border-white/5 text-slate-300'}`}>
                      2. {currentQuestion.option2}
                    </div>
                    {currentQuestion.option3 && (
                      <div className={`p-4 rounded-xl border text-sm ${currentQuestion.correct_option === 3 ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-slate-900/60 border-white/5 text-slate-300'}`}>
                        3. {currentQuestion.option3}
                      </div>
                    )}
                    {currentQuestion.option4 && (
                      <div className={`p-4 rounded-xl border text-sm ${currentQuestion.correct_option === 4 ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-slate-900/60 border-white/5 text-slate-300'}`}>
                        4. {currentQuestion.option4}
                      </div>
                    )}
                  </div>

                  {/* Active Question Info / Commands */}
                  <div className="pt-4 border-t border-white/5 flex flex-wrap items-center justify-between gap-4">
                    <div className="text-xs text-slate-400">
                      حالة السؤال: <span className="font-bold text-slate-200">{
                        activeSession.question_status === 'showing' ? 'معروض للجميع ⏳' :
                        activeSession.question_status === 'revealed' ? 'تم الكشف ✅' : 'انتظار'
                      }</span>
                      <span className="mx-2">•</span>
                      الإجابات المستلمة: <span className="font-bold text-purple-400">{answersCount} إجابة</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {activeSession.question_status === 'showing' && (
                        <button
                          onClick={handleRevealAnswer}
                          className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-bold transition-all"
                        >
                          اعتماد وكشف الإجابة 🔔
                        </button>
                      )}
                      <button
                        onClick={handleToggleScoreboard}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                          activeSession.show_scoreboard
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20 text-purple-300'
                        }`}
                      >
                        {activeSession.show_scoreboard ? 'إخفاء الترتيب 📊' : 'عرض الترتيب للمتسابقين 📊'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 text-sm">
                  لم يتم بث أي سؤال بعد. اختر سؤالاً من القائمة أدناه لبدء التحدي.
                </div>
              )}
            </div>

            {/* Questions Bank List inside Session */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-200">أسئلة هذه الجلسة</h3>
              <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden divide-y divide-white/5">
                {activeQuestions.map((q) => {
                  const isCurrent = activeSession.current_question_id === q.id;
                  return (
                    <div key={q.id} className={`p-4 flex items-center justify-between transition-all ${isCurrent ? 'bg-purple-500/5' : 'hover:bg-white/5'}`}>
                      <div>
                        <h4 className="font-bold text-slate-200 text-sm">{q.question_text}</h4>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                          <span className={`px-2 py-0.5 rounded-full ${
                            q.difficulty === 'easy' ? 'bg-green-500/10 text-green-400' :
                            q.difficulty === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {q.difficulty === 'easy' ? 'سهل' : q.difficulty === 'medium' ? 'متوسط' : 'صعب'}
                          </span>
                          <span>•</span>
                          <span>{q.category === 'islamic' ? '🕌 إسلامية' : q.category === 'riddles' ? '🧩 ألغاز' : q.category === 'science' ? '🔬 علوم' : 'عام'}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleShowQuestion(q.id)}
                        disabled={isCurrent && activeSession.question_status === 'showing'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                          isCurrent
                            ? 'bg-purple-500/20 border-purple-500/30 text-purple-300'
                            : 'bg-slate-900/60 border-white/10 hover:bg-slate-900 text-slate-200'
                        }`}
                      >
                        {isCurrent ? 'معروض الآن 📡' : 'طرح السؤال 📡'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Leaderboard / Connected Players */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-5">
              <h3 className="text-sm font-bold text-slate-300 tracking-wider flex items-center gap-1.5">
                <Users className="w-5 h-5 text-purple-400" />
                المتسابقون المتصلون ({players.length})
              </h3>

              {players.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  بانتظار انضمام المتسابقين...
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {players.map((p, idx) => (
                    <div key={p.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                          idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                          idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                          idx === 2 ? 'bg-amber-700/20 text-amber-600' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-bold text-xs text-slate-200" style={{ color: p.color }}>{p.name}</p>
                          {p.streak >= 3 && (
                            <span className="text-[10px] text-orange-400 font-bold">🔥 متتالي: {p.streak}</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="font-extrabold text-xs text-slate-100">{p.score} نقطة</p>
                      </div>
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

  // ==========================================
  // VIEW RENDER: SESSIONS LIST & CREATION
  // ==========================================
  return (
    <div className="space-y-10">
      <div className="flex items-center gap-2">
        <Layers className="w-6 h-6 text-purple-400" />
        <h2 className="text-2xl font-extrabold text-slate-100">إدارة جلسات اللعب</h2>
      </div>

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
        {/* Left Form: Create Session */}
        <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-6">
          <h3 className="text-lg font-bold text-slate-200 flex items-center gap-1.5">
            <Plus className="w-5 h-5 text-purple-400" />
            إنشاء جلسة جديدة
          </h3>

          <form onSubmit={handleCreateSession} className="space-y-4 text-sm">
            <div className="space-y-1">
              <label className="text-xs text-slate-300 font-medium">عنوان الجلسة</label>
              <input
                type="text"
                required
                placeholder="مثال: تحدي الجمعة العائلي"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">رمز الغرفة (رقمي - اختياري)</label>
                <input
                  type="text"
                  placeholder="توليد عشوائي"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-300 font-medium">مدة المؤقت (ثواني)</label>
                <select
                  value={timerDuration}
                  onChange={(e) => setTimerDuration(parseInt(e.target.value, 10))}
                  className="w-full p-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-100 outline-none focus:border-purple-500"
                >
                  <option value={20}>20 ثانية</option>
                  <option value={30}>30 ثانية</option>
                  <option value={45}>45 ثانية</option>
                  <option value={60}>60 ثانية</option>
                </select>
              </div>
            </div>

            {/* Select Questions from central bank */}
            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-semibold block">اختر أسئلة الجلسة من المكتبة</label>
              <div className="max-h-48 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5 bg-slate-900/40 p-2 space-y-1">
                {questions.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">
                    لا توجد أسئلة متوفرة في بنك الأسئلة المركزي حالياً.
                  </div>
                ) : (
                  questions.map(q => {
                    const isSelected = selectedQuestionIds.includes(q.id);
                    return (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => handleQuestionToggle(q.id)}
                        className="w-full text-right p-2.5 rounded-lg flex items-center justify-between text-xs hover:bg-white/5 transition-all"
                      >
                        <span className="font-medium text-slate-300 line-clamp-1 flex-1">{q.question_text}</span>
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-purple-400 shrink-0 mr-2" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500 shrink-0 mr-2" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                الأسئلة المحددة: {selectedQuestionIds.length} سؤال.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-all mt-4"
            >
              إنشاء الجلسة وحفظها
            </button>
          </form>
        </div>

        {/* Right Column: Sessions List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                لا توجد جلسات منشأة حالياً.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {sessions.map((session) => (
                  <div key={session.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-all">
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm md:text-base">{session.title}</h4>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 font-mono tracking-wider font-bold">
                          رمز الغرفة: {session.room_code}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Circle className={`w-2.5 h-2.5 ${
                            session.status === 'active' ? 'fill-green-500 text-green-500' :
                            session.status === 'finished' ? 'fill-red-500 text-red-500' : 'fill-slate-500 text-slate-500'
                          }`} />
                          {session.status === 'active' ? 'نشطة حالياً' :
                           session.status === 'finished' ? 'منتهية' : 'انتظار'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/dashboard/sessions?id=${session.id}`)}
                        className="px-4 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/10 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        لوحة التحكم
                      </button>
                    </div>
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
    <Suspense fallback={<div className="flex items-center justify-center p-12 text-slate-400">جاري التحميل...</div>}>
      <SessionsPageContent />
    </Suspense>
  );
}
