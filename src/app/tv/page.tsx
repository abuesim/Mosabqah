"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  getSessionByRoomCode,
  getPlayers,
  subscribeSession,
  subscribeSessionPlayers,
  subscribeAnswerCount,
  subscribeQuestionAnswers,
} from "@/lib/db";
import type { Answer, Session, Player } from "@/lib/db";
import { getPublicQuestion, type PublicQuestion } from "@/lib/game-api";
import { cn } from "@/lib/utils";
import { TEAM_OPTIONS, getTeamFromColor } from "@/lib/teams";
import {
  Users,
  Trophy,
  Award,
  Monitor,
  EyeOff,
  Eye,
  Crown,
  Radio,
  Armchair,
} from "lucide-react";
import confetti from "canvas-confetti";
import Spinner from "@/components/ui/Spinner";
import MoneyBoard from "@/components/game/MoneyBoard";
import type { Unsubscribe } from "firebase/firestore";

import { Suspense } from "react";
import { QRCodeSVG } from "qrcode.react";

const GAME_LABELS: Record<string, string> = {
  quiz: "تحدي الأسئلة",
  chairs: "لعبة الكراسي",
  survival: "البقاء للأقوى",
  faction: "تحدي الفرق",
  impostor: "أمبوستر",
  roulette: "عجلة الحظ",
  word: "الكلمة المفقودة",
  "image-reveal": "كشف الستار",
  tarkeeba: "تركيبة",
  baathra: "بعثرة",
  money: "فلوسك على المحك",
  top10: "TOP 10",
};

function decodeWordSecret(value?: string) {
  if (!value) return "";
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}
function timestampMillis(value: unknown) {
  const timestamp = value as
    { toMillis?: () => number; seconds?: number } | undefined;
  return timestamp?.toMillis
    ? timestamp.toMillis()
    : (timestamp?.seconds || 0) * 1000;
}

function getPlayerConnection(player: Player, now: number) {
  const lastSeen = timestampMillis(player.lastSeenAt || player.createdAt);
  const age = lastSeen ? now - lastSeen : Number.POSITIVE_INFINITY;
  if (age <= 35_000) return { state: "online" as const, label: "متصل" };
  if (age <= 75_000) return { state: "unstable" as const, label: "اتصال ضعيف" };
  return { state: "offline" as const, label: "غير متصل" };
}

function TvPageContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get("code");

  const [session, setSession] = useState<Session | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<PublicQuestion | null>(
    null,
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);
  const [wordSolvedCount, setWordSolvedCount] = useState(0);
  const [roundAnswers, setRoundAnswers] = useState<Answer[]>([]);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  const [overlayMode, setOverlayMode] = useState<
    "normal" | "chroma" | "transparent"
  >("normal");

  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const [showRoundResults, setShowRoundResults] = useState(false);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const top10RevealedCountRef = useRef(0);

  // Refs for use inside subscription callbacks
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    if (session?.gameMode !== "top10") return;
    const revealedCount = (session.top10Items || []).filter(
      (item) => item.revealed,
    ).length;
    if (revealedCount > top10RevealedCountRef.current) {
      try {
        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (AudioContextClass) {
          const context = new AudioContextClass();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.setValueAtTime(880, context.currentTime);
          gain.gain.setValueAtTime(0.0001, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.16,
            context.currentTime + 0.02,
          );
          gain.gain.exponentialRampToValueAtTime(
            0.0001,
            context.currentTime + 0.22,
          );
          oscillator.connect(gain).connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.24);
        }
      } catch {
        // Some televisions block autoplay audio until the page is interacted with.
      }
    }
    top10RevealedCountRef.current = revealedCount;
  }, [session?.gameMode, session?.top10Items]);
  const imageGrid = session?.imageRevealGrid || 6;
  const imageRevealSeconds = session?.imageRevealStartedAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - timestampMillis(session.imageRevealStartedAt)) / 1000,
        ),
      )
    : 0;
  const imageRevealCount =
    session?.gameMode === "image-reveal"
      ? Math.min(
          imageGrid ** 2,
          (1 + Math.floor(imageRevealSeconds / 3)) *
            Math.max(
              imageGrid === 8 ? 3 : 1,
              Math.ceil(
                imageGrid ** 2 /
                  Math.max(1, Math.ceil((session.timerDuration || 30) / 3)),
              ),
            ),
        )
      : 0;
  const revealedImageTiles = new Set(
    (session?.imageRevealOrder || []).slice(0, imageRevealCount),
  );

  useEffect(() => {
    if (!roomCode) return;

    async function loadRoom() {
      if (!roomCode) return;
      const sess = await getSessionByRoomCode(roomCode);
      if (!sess) return;
      setSession(sess);

      const playerData = await getPlayers(sess.id);
      setPlayers(playerData);

      if (
        sess.currentQuestionId &&
        ![
          "chairs",
          "tarkeeba",
          "baathra",
          "impostor",
          "roulette",
          "top10",
        ].includes(sess.gameMode || "quiz")
      ) {
        const question = await getPublicQuestion(
          sess.id,
          sess.currentQuestionId,
        );
        setCurrentQuestion(question);
      }
    }

    loadRoom();

    return () => {
      stopTimer();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, [roomCode]);

  useEffect(() => {
    const ticker = window.setInterval(() => setPresenceNow(Date.now()), 10_000);
    return () => window.clearInterval(ticker);
  }, []);

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
          updatedSess.currentQuestionId !==
            sessionRef.current?.currentQuestionId
        ) {
          triggerPrepCountdown(updatedSess);
        } else {
          setSession(updatedSess);
          if (updatedSess.questionStatus === "showing") {
            startTimer(updatedSess.timerDuration);
          } else if (updatedSess.questionStatus === "revealed") {
            stopTimer();
          }
        }
      }),
    );

    // 2. Players list
    unsubs.push(
      subscribeSessionPlayers(session.id, (newPlayers) => {
        setPlayers(newPlayers);
      }),
    );

    // 3. Answer count for current question
    if (session.currentQuestionId) {
      unsubs.push(
        subscribeAnswerCount(session.id, session.currentQuestionId, (count) => {
          setAnswersCount(count);
        }),
      );
      unsubs.push(
        subscribeQuestionAnswers(
          session.id,
          session.currentQuestionId,
          (answers) => {
            setWordSolvedCount(
              answers.filter((answer) => answer.isCorrect).length,
            );
            setRoundAnswers(answers);
          },
        ),
      );
    }

    return () => {
      unsubs.forEach((u) => u && u());
    };
  }, [session?.id, session?.currentQuestionId]);

  const triggerPrepCountdown = (updatedSess: Session) => {
    stopTimer();
    setAnswersCount(0);
    setRoundAnswers([]);
    setPrepCountdown(3);
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
          if (
            updatedSess.currentQuestionId &&
            ![
              "chairs",
              "tarkeeba",
              "baathra",
              "impostor",
              "roulette",
              "top10",
            ].includes(updatedSess.gameMode || "quiz")
          ) {
            getPublicQuestion(
              updatedSess.id,
              updatedSess.currentQuestionId,
            ).then(setCurrentQuestion);
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
    if (session?.status === "finished") {
      confetti({ particleCount: 180, spread: 90, origin: { y: 0.6 } });
    }
  }, [session?.status]);

  useEffect(() => {
    if (session?.questionStatus !== "revealed" || !session.currentQuestionId)
      return;
    setShowRoundResults(true);
    const timeout = setTimeout(() => setShowRoundResults(false), 10_000);
    return () => clearTimeout(timeout);
  }, [session?.questionStatus, session?.currentQuestionId]);

  if (!roomCode) {
    return (
      <div className="grid min-h-screen place-items-center bg-void p-6 text-center">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-ink">
            خطأ: رمز الغرفة مفقود بالرابط!
          </h2>
          <p className="text-sm text-ink-mute">
            يرجى توجيه الشاشة عبر كود الغرفة المخصص، مثل:{" "}
            <code dir="ltr" className="text-neon-bright">
              /tv?code=1234
            </code>
          </p>
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
  if (currentOverlayMode === "normal") {
    bgStyle.backgroundColor = (session as any).tvBgColor || "#090514";
  } else if (currentOverlayMode === "chroma") {
    bgStyle.backgroundColor = "#00ff00";
  } else {
    bgStyle.backgroundColor = "transparent";
  }

  const bgClass =
    currentOverlayMode === "chroma"
      ? "text-black font-semibold"
      : currentOverlayMode === "transparent"
        ? "text-ink"
        : "text-ink";

  const panelClass =
    currentOverlayMode === "chroma"
      ? "bg-white border-2 border-black text-black"
      : "glass text-ink";

  const fontSizeClass =
    (session as any).tvFontSize === "sm"
      ? "scale-90 origin-center"
      : (session as any).tvFontSize === "md"
        ? "scale-95 origin-center"
        : (session as any).tvFontSize === "xl"
          ? "scale-105 origin-center"
          : "scale-100";

  const teamStandings = session.teamsEnabled
    ? TEAM_OPTIONS.map((team) => {
        const members = players.filter(
          (player) =>
            (player.teamId || getTeamFromColor(player.color)?.id) === team.id,
        );
        return {
          ...team,
          members,
          score: members.reduce(
            (total, player) => total + (player.score || 0),
            0,
          ),
        };
      })
        .filter((team) => team.members.length > 0)
        .sort((a, b) => b.score - a.score)
    : [];
  const individualStandings = [...players].sort(
    (first, second) =>
      (second.score || 0) - (first.score || 0) ||
      first.name.localeCompare(second.name, "ar"),
  );
  const onlinePlayersCount = players.filter(
    (player) => getPlayerConnection(player, presenceNow).state === "online",
  ).length;
  const gameLabel = GAME_LABELS[session.gameMode || "quiz"] || "مسابقة";
  const broadcastTitle = `${session.tvLogoText || "مسابقة عصومي"} — ${gameLabel}`;
  const showQuestionsOnTv = session.tvShowQuestions !== false;
  const showLobby =
    ["waiting", "ready", "scheduled"].includes(session.status) ||
    (session.status === "active" && session.questionStatus === "idle");
  const joinUrl = `https://mosabqah.vercel.app/player?room=${session.roomCode}`;

  // PREP COUNTDOWN
  if (prepCountdown !== null) {
    return (
      <main
        className={cn(
          "min-h-screen grid place-items-center p-6 transition-all duration-300",
          bgClass,
        )}
        style={bgStyle}
      >
        <div className="absolute inset-x-6 top-6 border-b border-white/10 pb-4 text-center">
          <h1 className="font-brand text-2xl text-gradient">
            {broadcastTitle}
          </h1>
        </div>
        <div className="text-center">
          <h2 className="mb-4 font-display text-2xl font-extrabold uppercase tracking-[0.3em] text-neon-bright anim-pulse-neon">
            استعد للسؤال التالي
          </h2>
          <div
            key={prepCountdown}
            className="anim-count-pop font-display text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]"
          >
            {prepCountdown}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "relative min-h-screen flex flex-col justify-between p-6 transition-all duration-300 md:p-12",
        bgClass,
        fontSizeClass,
      )}
      style={bgStyle}
    >
      {currentOverlayMode === "normal" && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-mesh opacity-70"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-grid opacity-50"
          />
        </>
      )}

      {/* Event Logo Header */}
      {currentOverlayMode !== "transparent" && (
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 select-none shrink-0">
          <h1 className="font-brand text-xl text-gradient">{broadcastTitle}</h1>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-neon-bright animate-pulse" />
            <span className="font-display text-[9px] uppercase font-bold text-ink-mute tracking-wider">
              Clean Output Broadcast
            </span>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-line bg-void/80 p-2 opacity-40 backdrop-blur-md transition-opacity hover:opacity-100">
        <span className="px-2 text-[10px] font-bold text-ink-mute">
          شاشة المخرج:
        </span>
        {[
          {
            mode: "normal" as const,
            label: "عادية",
            icon: <Monitor className="h-3 w-3" />,
          },
          {
            mode: "chroma" as const,
            label: "كروما",
            icon: <Eye className="h-3 w-3" />,
          },
          {
            mode: "transparent" as const,
            label: "شفافة",
            icon: <EyeOff className="h-3 w-3" />,
          },
        ].map((opt) => (
          <button
            key={opt.mode}
            onClick={() => setOverlayMode(opt.mode)}
            className={cn(
              "flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-colors",
              overlayMode === opt.mode
                ? "bg-neon text-white"
                : "text-ink-mute hover:bg-white/5",
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {session.currentHint && (
        <div className="pointer-events-none absolute inset-x-5 top-24 z-[55] flex justify-center">
          <div className="anim-rise w-full max-w-3xl rounded-2xl border border-gold/45 bg-void-2/95 px-6 py-5 text-center shadow-[0_0_35px_rgba(251,191,36,.24)] backdrop-blur-xl">
            <p className="text-xs font-bold tracking-[0.2em] text-gold">
              💡 تلميح من المقدم
            </p>
            <p className="mt-2 text-2xl font-black text-ink md:text-3xl">
              {session.currentHint}
            </p>
          </div>
        </div>
      )}

      {showRoundResults &&
        (currentQuestion ||
          ["tarkeeba", "baathra", "top10"].includes(session.gameMode || "")) &&
        session.gameMode !== "chairs" && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-void/85 p-8 text-center backdrop-blur-md">
            <div
              className={cn(
                "anim-rise w-full max-w-3xl space-y-7 rounded-3xl border bg-void-2 p-10 shadow-[var(--shadow-neon-strong)]",
                session.roundWinners?.length
                  ? "winner-celebration border-success/30"
                  : "border-danger/35",
              )}
            >
              <h2
                className={cn(
                  "text-5xl font-black",
                  session.roundWinners?.length
                    ? "text-gradient-gold"
                    : "text-ink-mute",
                )}
              >
                {session.roundWinners?.length
                  ? "الفائزون"
                  : "لم يكتشف أحد الإجابة الصحيحة"}
              </h2>
              {!session.roundWinners?.length && (
                <div className="anim-count-pop text-9xl font-black text-danger-bright">
                  ✕
                </div>
              )}
              <div>
                <p className="text-sm text-ink-mute">الإجابة الصحيحة</p>
                <p className="mt-2 text-5xl font-black text-success-bright">
                  {session.gameMode === "tarkeeba"
                    ? decodeWordSecret(session.tarkeebaSecret)
                    : session.gameMode === "baathra"
                      ? session.baathraMode === "requests"
                        ? "تم اعتماد النتائج"
                        : decodeWordSecret(session.baathraSecret)
                      : session.gameMode === "top10"
                        ? `تم اكتشاف ${(session.top10Items || []).filter((item) => item.foundById).length} من 10`
                        : session.gameMode === "word"
                          ? decodeWordSecret(currentQuestion?.wordSecret)
                          : (currentQuestion as any)?.[
                              `option${session.revealedCorrectOption}`
                            ]}
                </p>
              </div>
              {session.roundWinners?.length ? (
                <div className="grid grid-cols-3 gap-5">
                  {session.roundWinners.map((winner, index) => (
                    <div
                      key={winner.playerId}
                      className="anim-winner-card rounded-3xl border border-success/25 bg-success/5 p-6"
                      style={{ animationDelay: `${index * 110}ms` }}
                    >
                      <p className="font-display text-2xl text-gold">
                        #{index + 1}{" "}
                        <span className="text-success-bright">✓</span>
                      </p>
                      <p
                        className="mt-3 text-lg font-black"
                        style={{ color: winner.color }}
                      >
                        {winner.name}
                      </p>
                      <p className="mt-2 text-sm font-bold text-success-bright">
                        +{winner.scoreAdded}{" "}
                        {session.gameMode === "money" ? "مبلغ" : "نقطة"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xl font-bold text-danger-bright">
                  لا توجد إجابات صحيحة هذه الجولة.
                </p>
              )}
              <div className="max-h-44 overflow-y-auto border-t border-line pt-4">
                <p className="mb-2 text-xs font-bold text-ink-mute">
                  نتائج المتسابقين
                </p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {players.map((player) => {
                    const playerAnswers = roundAnswers.filter(
                      (item) => item.playerId === player.id,
                    );
                    const requestResult =
                      session.gameMode === "baathra" &&
                      session.baathraMode === "requests"
                        ? session.baathraRequestResults?.find(
                            (result) => result.playerId === player.id,
                          )
                        : undefined;
                    const displayedAnswers = requestResult?.answers?.length
                      ? requestResult.answers.map((answer) => ({
                          value: answer.value,
                          approved: answer.approved,
                        }))
                      : playerAnswers
                          .filter((answer) => answer.baathraTextAnswer)
                          .map((answer) => ({
                            value: answer.baathraTextAnswer || "",
                            approved: answer.isCorrect === true,
                          }));
                    const correct = requestResult
                      ? requestResult.approved > 0
                      : playerAnswers.some((answer) => answer.isCorrect);
                    return (
                      <div
                        key={player.id}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs font-bold",
                          correct
                            ? "border-success/25 bg-success/5 text-success-bright"
                            : "border-danger/20 bg-danger/5 text-danger-bright",
                        )}
                      >
                        <div className="min-w-0 text-right">
                          <span
                            className="block truncate"
                            style={{ color: player.color }}
                          >
                            {player.name}
                          </span>
                          <span className="mt-1 block truncate text-[11px] text-ink">
                            {displayedAnswers.length
                              ? displayedAnswers
                                  .map((answer) => answer.value)
                                  .join(" • ")
                              : "لم يجب"}
                          </span>
                        </div>
                        <span className="mr-2 text-lg">
                          {correct
                            ? requestResult?.speedBonus
                              ? "✓ ⚡+1"
                              : "✓"
                            : "✕"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

      {session.status === "paused" && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-6 text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full border border-gold/35 bg-gold/10 text-5xl text-gold">
            ⏸
          </div>
          <h1 className="font-brand text-5xl text-gradient-gold">
            التحدي متوقف مؤقتاً
          </h1>
          <p className="text-lg text-ink-mute">بانتظار المقدم لاستئناف البث.</p>
        </div>
      )}

      {/* WAITING */}
      {showLobby && (
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center space-y-6 text-center">
          <div className="space-y-3">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-4 py-1.5">
              <Radio className="h-4 w-4 anim-pulse-neon text-danger-bright" />
              <span className="text-xs font-bold uppercase tracking-widest text-neon-bright">
                بث مباشر
              </span>
            </div>
            <h1 className="font-brand text-5xl text-gradient md:text-6xl">
              {broadcastTitle}
            </h1>
            <p className="text-sm font-bold text-ink-soft md:text-lg">
              {session.title}
            </p>
          </div>

          {session.gameMode === "money" && (
            <div className="w-full max-w-6xl space-y-4">
              <MoneyBoard session={session} />
              <div className="grid grid-cols-3 gap-3">
                {individualStandings.slice(0, 3).map((contestant, index) => (
                  <div
                    key={contestant.id}
                    className="anim-winner-card flex items-center justify-between rounded-2xl border border-line bg-white/5 px-4 py-3"
                    style={{ animationDelay: `${index * 80}ms` }}
                  >
                    <span className="truncate text-sm font-black text-ink">
                      {index + 1}. {contestant.name}
                    </span>
                    <span className="font-display text-xl font-black text-gold">
                      {contestant.score || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <div
              className={cn(
                "rounded-[var(--radius-card)] p-6 text-right",
                panelClass,
              )}
            >
              <div className="flex items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h3 className="text-lg font-black text-ink">
                    المتسابقون المسجلون
                  </h3>
                  <p className="mt-1 text-xs text-ink-mute">
                    {players.length} مسجل • {onlinePlayersCount} متصل الآن
                  </p>
                </div>
                <Users className="h-9 w-9 text-cyan" />
              </div>
              <div className="mt-4 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
                {players.length ? (
                  players.map((player) => {
                    const connection = getPlayerConnection(player, presenceNow);
                    return (
                      <div
                        key={player.id}
                        className={cn(
                          "anim-option-enter flex items-center justify-between gap-2 rounded-xl border bg-void/45 px-3 py-2",
                          connection.state === "online" && "border-success/25",
                          connection.state === "unstable" && "border-gold/35",
                          connection.state === "offline" &&
                            "border-line opacity-45 grayscale",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full",
                              connection.state === "online" &&
                                "bg-success shadow-[0_0_10px_rgba(34,197,94,.8)]",
                              connection.state === "unstable" && "bg-gold",
                              connection.state === "offline" && "bg-ink-faint",
                            )}
                          />
                          <span
                            className="truncate text-sm font-bold"
                            style={{ color: player.color }}
                          >
                            {player.name}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[9px] font-bold",
                            connection.state === "online" &&
                              "text-success-bright",
                            connection.state === "unstable" && "text-gold",
                            connection.state === "offline" && "text-ink-faint",
                          )}
                        >
                          {connection.label}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="col-span-full py-10 text-center text-sm text-ink-mute">
                    بانتظار أول متسابق...
                  </p>
                )}
              </div>
            </div>

            <div
              className={cn(
                "rounded-[var(--radius-card)] p-6 text-right",
                panelClass,
              )}
            >
              <div className="flex items-center justify-between border-b border-line pb-4">
                <h3 className="text-lg font-black text-gradient-gold">
                  الترتيب الحالي
                </h3>
                <Trophy className="h-8 w-8 text-gold" />
              </div>
              <div className="mt-4 space-y-2">
                {individualStandings.length ? (
                  individualStandings.slice(0, 8).map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-xl border border-line bg-void/45 px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <strong
                          className={cn(
                            "font-display text-lg",
                            index === 0 ? "text-gold" : "text-ink-mute",
                          )}
                        >
                          #{index + 1}
                        </strong>
                        <span
                          className="truncate text-sm font-bold"
                          style={{ color: player.color }}
                        >
                          {player.name}
                        </span>
                      </span>
                      <span className="font-display text-sm font-black text-neon-bright">
                        {player.score || 0}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-sm text-ink-mute">
                    يظهر الترتيب بعد انضمام اللاعبين
                  </p>
                )}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "flex w-full max-w-3xl items-center justify-center gap-6 rounded-3xl p-4",
              panelClass,
            )}
          >
            <div className="rounded-xl bg-white p-2">
              <QRCodeSVG value={joinUrl} size={112} level="M" includeMargin />
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-ink-mute">
                امسح الباركود للانضمام
              </p>
              <p className="mt-2 font-display text-5xl font-black tracking-[0.25em] text-neon-bright">
                {session.roomCode}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE QUESTION */}
      {session.status === "active" &&
        session.gameMode === "impostor" &&
        !showLobby && (
          <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-7 text-center">
            <p className="text-8xl">🕵️</p>
            <h2 className="font-brand text-5xl text-danger-bright">
              لعبة أمبوستر
            </h2>
            {session.impostorPhase === "discussion" && (
              <p className="text-xl text-ink-soft">
                وقت النقاش... من هو الخائن؟
              </p>
            )}
            {session.impostorPhase === "voting" && (
              <p className="text-xl text-gold">التصويت جارٍ الآن</p>
            )}
            {session.impostorPhase === "revealed" && (
              <div className="rounded-3xl border border-danger/40 bg-danger/10 p-8">
                <p className="text-sm text-ink-mute">الإمبوستر كان</p>
                <h3 className="mt-3 text-4xl font-black text-danger-bright">
                  {
                    players.find(
                      (player) => player.id === session.impostorPlayerId,
                    )?.name
                  }
                </h3>
              </div>
            )}
          </div>
        )}
      {session.status === "active" &&
        session.gameMode === "roulette" &&
        !showLobby && (
          <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-8 text-center">
            <div
              className={cn(
                "text-9xl",
                session.rouletteStatus === "spinning" && "animate-spin",
              )}
            >
              🎡
            </div>
            {session.rouletteStatus === "spinning" ? (
              <h2 className="font-brand text-5xl text-gradient-gold">
                العجلة تدور!
              </h2>
            ) : session.rouletteStatus === "revealed" ? (
              <>
                <h2 className="text-xl text-ink-mute">الجائزة</h2>
                <h3 className="font-brand text-5xl text-gold">
                  {session.roulettePrize}
                </h3>
              </>
            ) : (
              <p className="text-lg text-ink-mute">بانتظار بدء العجلة</p>
            )}
          </div>
        )}
      {session.status === "active" &&
        session.gameMode === "tarkeeba" &&
        !showLobby &&
        showQuestionsOnTv && (
          <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-7 text-center">
            <p className="text-xs font-bold tracking-[.3em] text-gold">
              تركيبة • {session.tarkeebaCategory || "كلمات عامة"}
            </p>
            <h2 className="font-brand text-5xl text-gradient-gold">
              خمن الكلمة السرية
            </h2>
            <div className="flex gap-4">
              {Array.from(decodeWordSecret(session.tarkeebaSecret)).map(
                (letter, index) => (
                  <span
                    key={index}
                    className={cn(
                      "grid h-20 w-16 place-items-center rounded-2xl border border-line bg-void/50 font-display text-4xl font-black",
                      session.questionStatus === "revealed"
                        ? "border-success/40 text-success-bright"
                        : "text-ink",
                    )}
                  >
                    {session.questionStatus === "revealed" ? letter : ""}
                  </span>
                ),
              )}
            </div>
            <p className="text-sm text-ink-mute">
              {answersCount} متسابق أنهى محاولاته
            </p>
          </div>
        )}
      {session.status === "active" &&
        session.gameMode === "baathra" &&
        !showLobby &&
        showQuestionsOnTv && (
          <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center space-y-8 text-center">
            <div>
              <p className="text-xs font-bold tracking-[.3em] text-cyan">
                لعبة بعثرة
              </p>
              <h2 className="anim-typewriter-rtl mt-3 font-brand text-5xl text-gradient">
                {session.baathraMode === "requests"
                  ? "كوّن اسماً من الحروف المتاحة"
                  : "رتّب الحروف واكتشف الكلمة"}
              </h2>
            </div>
            <div className="flex flex-wrap justify-center gap-4" dir="rtl">
              {(session.baathraShuffledLetters || []).map((letter, index) => (
                <span
                  key={`${letter}-${index}`}
                  className="anim-option-enter grid h-24 w-20 place-items-center rounded-2xl border border-neon/40 bg-neon/10 font-display text-5xl font-black text-neon-bright shadow-[var(--shadow-neon-soft)]"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  {letter}
                </span>
              ))}
            </div>
            {session.baathraMode === "requests" && (
              <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
                {(session.baathraRequests || []).map((request, index) =>
                  (session.baathraActiveRequestIndexes || []).includes(
                    index,
                  ) ? (
                    <div
                      key={`${request}-${index}`}
                      className="anim-option-enter rounded-2xl border border-cyan/30 bg-cyan/5 p-5 text-xl font-black text-cyan"
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      {request}
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        )}
      {session.status === "active" &&
        session.gameMode === "chairs" &&
        !showLobby && (
          <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-8 text-center">
            <div
              className={cn(
                "absolute inset-4 rounded-full border-2 border-gold/30",
                session.chairPhase === "spinning" && "anim-pulse-neon",
              )}
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-gold">
                كراسي السرعة • الجولة {session.chairRound || 1}
              </p>
              <h2
                className={cn(
                  "mt-3 font-brand text-4xl md:text-6xl",
                  session.chairPhase === "ready"
                    ? "text-success-bright"
                    : session.chairPhase === "fake"
                      ? "text-orange-400"
                      : "text-gradient-gold",
                )}
              >
                {session.chairPhase === "ready"
                  ? "اجلـــــــس الآن!"
                  : session.chairPhase === "fake"
                    ? "إنذار وهمي!"
                    : session.chairPhase === "revealed"
                      ? "تم حجز الكراسي"
                      : "الكراسي تدور..."}
              </h2>
            </div>
            <div
              className={cn(
                "grid w-full max-w-2xl grid-cols-3 gap-5 transition-all",
                session.chairPhase === "spinning" && "animate-pulse",
              )}
            >
              {Array.from({ length: session.chairCount || 0 }, (_, index) => {
                const winner = session.roundWinners?.[index];
                return (
                  <div
                    key={index}
                    className={cn(
                      "rounded-3xl border p-6",
                      winner
                        ? "border-success/45 bg-success/10"
                        : "border-gold/30 bg-gold/10",
                    )}
                  >
                    <Armchair
                      className={cn(
                        "mx-auto h-10 w-10",
                        winner ? "text-success-bright" : "text-gold",
                      )}
                    />
                    {winner ? (
                      <p
                        className="mt-3 truncate text-sm font-black"
                        style={{ color: winner.color }}
                      >
                        {winner.name}
                      </p>
                    ) : (
                      <span className="mt-3 block font-display text-3xl font-black text-ink">
                        {index + 1}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {players
                .filter((player) => player.isActive)
                .map((player, index) => (
                  <span
                    key={player.id}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-bold transition-all",
                      session.chairPhase === "spinning" &&
                        index % 2 === 0 &&
                        "translate-y-2",
                    )}
                    style={{
                      borderColor: `${player.color}70`,
                      color: player.color,
                    }}
                  >
                    {player.name}
                  </span>
                ))}
            </div>
            {session.chairPhase === "ready" && (
              <div className="w-full max-w-2xl">
                <p className="font-display text-3xl text-success-bright">
                  {secondsLeft} ث
                </p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-success transition-all duration-1000"
                    style={{
                      width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

      {session.status === "active" &&
        session.gameMode === "top10" &&
        session.questionStatus !== "idle" &&
        showQuestionsOnTv && (
          <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center space-y-7 pb-14 text-center">
            <div>
              <p className="text-sm font-bold tracking-[.3em] text-cyan">
                TOP 10
              </p>
              <h2 className="anim-typewriter-rtl mt-3 font-sans text-3xl font-black leading-tight text-ink md:text-5xl">
                {session.top10Prompt}
              </h2>
              <p className="mt-3 text-sm font-bold text-ink-mute">
                اكتُشف{" "}
                {
                  (session.top10Items || []).filter((item) => item.foundById)
                    .length
                }{" "}
                من 10
              </p>
            </div>
            <div className="grid grid-cols-5 gap-3 md:gap-4">
              {(session.top10Items || []).map((item, index) => (
                <div
                  key={`${item.id}-${item.revealed}`}
                  className={cn(
                    "top10-card-flip flex min-h-32 flex-col items-center justify-center rounded-2xl border p-3 shadow-lg md:min-h-40",
                    item.revealed
                      ? "border-success/45 bg-gradient-to-b from-success/20 to-success/5"
                      : "border-neon/45 bg-gradient-to-b from-neon/25 to-void-2 shadow-[var(--shadow-neon)]",
                  )}
                  style={{ animationDelay: `${index * 55}ms` }}
                >
                  {item.revealed ? (
                    <>
                      <p className="text-xl font-black text-success-bright md:text-2xl">
                        {item.answer}
                      </p>
                      <p
                        className="mt-3 max-w-full truncate text-xs font-bold md:text-sm"
                        style={{ color: item.foundByColor || "#94a3b8" }}
                      >
                        {item.foundByName || "كشفها المقدم"}
                      </p>
                      {!item.revealedByPresenter && (
                        <p className="mt-2 font-display text-lg font-black text-gold">
                          +{item.points}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="font-display text-6xl font-black text-neon-bright md:text-7xl">
                      {index + 1}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {session.questionStatus === "showing" && (
              <div className="mx-auto flex items-center gap-4 rounded-2xl border border-gold/25 bg-gold/5 px-6 py-3">
                <span className="text-sm font-bold text-ink-mute">
                  الوقت المتبقي
                </span>
                <span className="font-display text-3xl font-black text-gold">
                  {secondsLeft} ث
                </span>
              </div>
            )}
          </div>
        )}

      {session.status === "active" &&
        !["chairs", "impostor", "roulette"].includes(
          session.gameMode || "quiz",
        ) &&
        !["tarkeeba", "baathra"].includes(session.gameMode || "") &&
        session.questionStatus !== "idle" &&
        showQuestionsOnTv &&
        currentQuestion && (
          <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between space-y-8">
            <div className="space-y-4 pt-4 text-center">
              {session.gameMode === "money" &&
                session.moneyBoard?.find(
                  (cell) => cell.id === session.moneyCurrentCellId,
                ) && (
                  <div className="anim-count-pop mx-auto flex w-fit items-center gap-4 rounded-2xl border border-gold/45 bg-gold/15 px-6 py-3 font-black text-gold">
                    <span>
                      {
                        session.moneyBoard.find(
                          (cell) => cell.id === session.moneyCurrentCellId,
                        )?.category
                      }
                    </span>
                    <span className="font-display text-3xl">
                      {
                        session.moneyBoard.find(
                          (cell) => cell.id === session.moneyCurrentCellId,
                        )?.value
                      }
                    </span>
                  </div>
                )}
              <h2
                key={currentQuestion.id}
                className="anim-typewriter-rtl font-sans text-2xl font-extrabold leading-tight text-ink md:text-4xl"
              >
                {currentQuestion.questionText}
              </h2>
              {currentQuestion.questionType === "image" &&
                currentQuestion.imageUrl && (
                  <div
                    className="relative mx-auto mt-4 aspect-video max-h-64 max-w-full overflow-hidden rounded-2xl border border-white/15 bg-white shadow-[var(--shadow-neon)]"
                    style={{ width: "min(100%, 780px)" }}
                  >
                    <img
                      src={currentQuestion.imageUrl}
                      alt="صورة السؤال"
                      className="h-full w-full object-contain"
                    />
                    {session.gameMode === "image-reveal" &&
                      session.questionStatus !== "revealed" && (
                        <div
                          className="absolute inset-0 grid"
                          style={{
                            gridTemplateColumns: `repeat(${imageGrid}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${imageGrid}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from(
                            { length: imageGrid ** 2 },
                            (_, index) => (
                              <span
                                key={index}
                                className={cn(
                                  "border border-void/60 bg-void transition-all duration-700",
                                  revealedImageTiles.has(index) &&
                                    "scale-75 opacity-0",
                                )}
                              />
                            ),
                          )}
                        </div>
                      )}
                  </div>
                )}
              <div className="flex justify-center gap-3 text-xs font-bold">
                <span className="rounded-full border border-neon/25 bg-neon/10 px-3 py-1 uppercase tracking-wider text-neon-bright">
                  {currentQuestion.category || "عام"}
                </span>
                <span className="rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-cyan">
                  الإجابات: <span className="font-display">{answersCount}</span>{" "}
                  / {players.length}
                </span>
              </div>
              {teamStandings.length > 0 && (
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {teamStandings.slice(0, 3).map((team, index) => (
                    <span
                      key={team.id}
                      className="rounded-full border px-3 py-1 text-[11px] font-bold"
                      style={{
                        borderColor: `${team.color}80`,
                        color: team.color,
                        backgroundColor: `${team.color}18`,
                      }}
                    >
                      {index + 1}. {team.label} — {team.score}
                    </span>
                  ))}
                </div>
              )}
              {session.gameMode === "faction" &&
                (() => {
                  const red =
                    teamStandings.find((team) => team.id === "red")?.score || 0;
                  const green =
                    teamStandings.find((team) => team.id === "green")?.score ||
                    0;
                  const total = Math.max(1, red + green);
                  return (
                    <div className="mx-auto mt-5 flex max-w-2xl items-center gap-3">
                      <span className="text-xs font-bold text-red-400">
                        التفاح {red}
                      </span>
                      <div className="flex h-5 flex-1 overflow-hidden rounded-full border border-white/10">
                        <div
                          className="bg-red-500 transition-all"
                          style={{ width: `${(red / total) * 100}%` }}
                        />
                        <div className="flex-1 bg-green-500 transition-all" />
                      </div>
                      <span className="text-xs font-bold text-green-400">
                        العنب {green}
                      </span>
                    </div>
                  );
                })()}
            </div>

            {session.gameMode === "word" ? (
              <div className="my-auto space-y-7 text-center">
                <p className="text-lg font-bold text-cyan">
                  {currentQuestion.questionText || currentQuestion.category}
                </p>
                <p className="text-sm text-ink-mute">الكلمة المفقودة</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {Array.from(decodeWordSecret(currentQuestion.wordSecret)).map(
                    (letter, index) => (
                      <span
                        key={`${letter}-${index}`}
                        className={cn(
                          "grid h-16 min-w-14 place-items-center rounded-2xl border font-display text-3xl font-black",
                          session.questionStatus === "revealed"
                            ? "border-success/40 bg-success/10 text-success-bright"
                            : "border-neon/35 bg-neon/10 text-neon-bright",
                        )}
                      >
                        {session.questionStatus === "revealed"
                          ? letter
                          : letter === " "
                            ? ""
                            : "＊"}
                      </span>
                    ),
                  )}
                </div>
                <div className="mx-auto max-w-lg rounded-2xl border border-cyan/25 bg-cyan/5 p-5">
                  <p className="text-xs font-bold text-ink-mute">
                    نسبة من اكتشفوا الكلمة
                  </p>
                  <p className="mt-2 font-display text-4xl font-black text-cyan">
                    {wordSolvedCount}
                  </p>
                  <p className="mt-1 text-xs text-ink-mute">
                    متسابق اكتشف الكلمة!
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-cyan transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (wordSolvedCount / Math.max(1, players.length)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="my-auto grid w-full grid-cols-1 gap-5 md:grid-cols-2">
                {["option1", "option2", "option3", "option4"].map(
                  (optKey, idx) => {
                    const optVal = (currentQuestion as any)[optKey];
                    if (!optVal) return null;
                    const isCorrect = session.revealedCorrectOption === idx + 1;
                    const isRevealed = session.questionStatus === "revealed";
                    const optionTone = [
                      "border-cyan bg-cyan/70 text-void",
                      "border-neon bg-neon/70 text-white",
                      "border-gold bg-gold/70 text-void",
                      "border-pink-400 bg-pink-500/70 text-white",
                    ][idx];

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "anim-option-enter flex items-center justify-between gap-4 rounded-2xl border p-6 text-xl font-black shadow-md transition-all md:text-2xl",
                          isRevealed
                            ? isCorrect
                              ? "border-success bg-success/20 text-success-bright scale-105 shadow-[var(--shadow-success)]"
                              : "border-danger/20 bg-danger/5 text-ink-faint opacity-50"
                            : optionTone,
                        )}
                        style={{ animationDelay: `${idx * 65}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <span>{optVal}</span>
                        </div>
                        {isRevealed && isCorrect && (
                          <Award className="h-6 w-6 shrink-0 text-success-bright" />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            )}

            {session.questionStatus === "showing" && (
              <div className="relative space-y-2 pb-2">
                <div className="flex items-center justify-between text-sm font-bold">
                  <span className="text-ink-mute">الوقت المتبقي</span>
                  <span
                    className={cn(
                      "font-display text-2xl tabular",
                      secondsLeft <= 5
                        ? "text-danger-bright anim-pulse-neon"
                        : "text-neon-bright",
                    )}
                  >
                    {secondsLeft}
                    <span className="text-sm text-ink-mute"> ث</span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full border border-line bg-white/5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-1000 ease-linear",
                      secondsLeft <= 5
                        ? "bg-danger"
                        : "bg-gradient-to-l from-neon-deep via-neon to-cyan",
                    )}
                    style={{
                      width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

      {session.gameMode === "top10" && players.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 overflow-hidden border-t border-cyan/25 bg-void-2/95 py-2 backdrop-blur-xl">
          <div className="top10-ticker flex w-max gap-8 whitespace-nowrap px-8">
            {[...individualStandings, ...individualStandings].map(
              (contestant, index) => (
                <span
                  key={`${contestant.id}-${index}`}
                  className="text-sm font-bold"
                  style={{ color: contestant.color }}
                >
                  {contestant.name}
                  <strong className="mr-2 font-display text-gold">
                    {contestant.score || 0} نقطة
                  </strong>
                </span>
              ),
            )}
          </div>
        </div>
      )}

      {session.status === "active" &&
        session.questionStatus === "showing" &&
        !showQuestionsOnTv && (
          <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-5 text-center">
            <EyeOff className="h-16 w-16 text-neon-bright" />
            <h2 className="font-brand text-5xl text-gradient">
              السؤال معروض على أجهزة المتسابقين
            </h2>
            <p className="text-lg text-ink-mute">بانتظار إجابات اللاعبين...</p>
          </div>
        )}

      {session.status === "active" &&
        session.questionStatus === "showing" &&
        roundAnswers.length > 0 && (
          <div className="relative mx-auto mt-4 w-full max-w-5xl shrink-0 rounded-2xl border border-cyan/25 bg-cyan/5 p-4 text-center">
            <p className="mb-3 text-xs font-bold text-cyan">
              أجاب حتى الآن (
              {new Set(roundAnswers.map((answer) => answer.playerId)).size} /{" "}
              {players.length})
            </p>
            <div className="flex max-h-20 flex-wrap justify-center gap-2 overflow-y-auto">
              {Array.from(
                new Set(roundAnswers.map((answer) => answer.playerId)),
              ).map((playerId) => {
                const answeredPlayer = players.find(
                  (player) => player.id === playerId,
                );
                return answeredPlayer ? (
                  <span
                    key={playerId}
                    className="anim-option-enter rounded-full border border-line bg-void/60 px-3 py-1.5 text-xs font-bold"
                    style={{ color: answeredPlayer.color }}
                  >
                    ✓ {answeredPlayer.name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

      {/* FINISHED / PODIUM */}
      {session.status === "finished" && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-10 text-center">
          <div className="space-y-3">
            <Trophy className="anim-float mx-auto h-16 w-16 text-gold drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
            <h1 className="font-brand text-5xl text-gradient-gold md:text-6xl">
              تتويج الفائزين
            </h1>
            <p className="text-sm text-ink-mute md:text-lg">
              تهانينا الحارة لجميع الفائزين الأبطال!
            </p>
          </div>

          {teamStandings[0] && (
            <div
              className="w-full max-w-xl rounded-3xl border p-5 text-center shadow-lg"
              style={{
                borderColor: `${teamStandings[0].color}80`,
                backgroundColor: `${teamStandings[0].color}18`,
              }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-mute">
                الفريق الفائز
              </p>
              <h2
                className="mt-2 text-2xl font-black"
                style={{ color: teamStandings[0].color }}
              >
                {teamStandings[0].label}
              </h2>
              <p className="mt-1 font-display text-lg font-extrabold text-ink">
                {teamStandings[0].score} نقطة
              </p>
            </div>
          )}

          {players.length > 0 && (
            <div className="flex w-full max-w-2xl items-end justify-center gap-4 pt-12 md:gap-8">
              {individualStandings[1] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span
                    className="text-xs font-bold"
                    style={{ color: individualStandings[1].color }}
                  >
                    {individualStandings[1].name}
                  </span>
                  <div className="flex h-24 w-full items-center justify-center rounded-t-xl border border-white/15 bg-gradient-to-t from-void-3 to-white/10 font-display text-xl font-extrabold text-ink-soft shadow-md">
                    2
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">
                    {individualStandings[1].score}
                  </span>
                </div>
              )}

              <div className="flex w-1/3 flex-col items-center gap-3">
                <Crown className="anim-float h-7 w-7 text-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.7)]" />
                <span
                  className="text-sm font-black text-gold"
                  style={{ color: individualStandings[0].color }}
                >
                  {individualStandings[0].name}
                </span>
                <div className="flex h-36 w-full items-center justify-center rounded-t-2xl border-2 border-gold/40 bg-gradient-to-t from-gold-deep/30 to-gold/10 font-display text-3xl font-black text-gold shadow-[var(--shadow-gold)]">
                  1
                </div>
                <span className="font-display text-xs font-extrabold text-gold">
                  {individualStandings[0].score}
                </span>
              </div>

              {individualStandings[2] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span
                    className="text-xs font-bold text-amber-600"
                    style={{ color: individualStandings[2].color }}
                  >
                    {individualStandings[2].name}
                  </span>
                  <div className="flex h-16 w-full items-center justify-center rounded-t-xl border border-white/10 bg-gradient-to-t from-void to-void-3 font-display text-lg font-extrabold text-amber-600 shadow-sm">
                    3
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">
                    {individualStandings[2].score}
                  </span>
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
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-void text-ink-mute">
          جاري التحميل...
        </div>
      }
    >
      <TvPageContent />
    </Suspense>
  );
}
