"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getSessionByRoomCode,
  getPresenterByRoomCode,
  getPlayerByName,
  getPlayerByRejoinCode,
  createPlayer,
  getPlayerAnswer,
  touchPlayerPresence,
  updatePlayer,
  subscribeSession,
  subscribeSessionByRoomCode,
  subscribePlayer,
  subscribeSessionPlayers,
} from "@/lib/db";
import type { Session, Player } from "@/lib/db";
import {
  getPublicQuestion,
  submitPublicAnswer,
  submitChairChoice,
  submitWordAnswer,
  submitTarkeebaResult,
  submitBaathraAnswer,
  submitTop10Answer,
  useBaathraHint,
  useFiftyFifty,
  useTimeExtension,
  requestTimeoutReveal,
  voteForImpostor,
  stopRoulette,
  type PublicQuestion,
} from "@/lib/game-api";
import { cn } from "@/lib/utils";
import { TEAM_OPTIONS, getTeam, getTeamFromColor } from "@/lib/teams";
import {
  ShieldCheck,
  User,
  KeyRound,
  Clock,
  CheckCircle,
  XCircle,
  Trophy,
  Scissors,
  PlusCircle,
  Sparkles,
  Loader2,
  Armchair,
  Radio,
  Wifi,
} from "lucide-react";
import confetti from "canvas-confetti";
import Background from "@/components/ui/Background";
import Button from "@/components/ui/Button";
import MoneyBoard from "@/components/game/MoneyBoard";
import { Field, Input } from "@/components/ui/Input";
import type { Unsubscribe } from "firebase/firestore";

import { Suspense } from "react";

const ARABIC_KEYBOARD_ROWS = [
  ["د", "ج", "ح", "خ", "ه", "ع", "غ", "ف", "ق", "ث", "ص", "ض"],
  ["ط", "ك", "م", "ن", "ت", "ا", "ل", "ب", "ي", "س", "ش"],
  ["ظ", "ز", "و", "ة", "ى", "ر", "ؤ", "ء", "ئ"],
];
const ARABIC_KEYBOARD = ARABIC_KEYBOARD_ROWS.flat();
const normalizeWordLetter = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670ـ\s]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");
const canBuildFromLetters = (value: string, letters: string[]) => {
  const available = letters.map(normalizeWordLetter);
  return Array.from(value).every((letter) => {
    const index = available.indexOf(normalizeWordLetter(letter));
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
};
function decodeWordSecret(value?: string) {
  if (!value) return "";
  try {
    const bytes = Uint8Array.from(atob(value), (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
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

function PlayerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRoomCode = searchParams.get("room");
  const recoveryMode = searchParams.get("recover") === "1";

  // Connection Steps
  const [step, setStep] = useState(1);
  const [roomCode, setRoomCode] = useState(urlRoomCode || "");
  const [session, setSession] = useState<Session | null>(null);
  const [waitingRoomCode, setWaitingRoomCode] = useState<string | null>(null);
  const [waitingPresenterName, setWaitingPresenterName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showNewPlayerId, setShowNewPlayerId] = useState(false);
  const [playerColor, setPlayerColor] = useState("#22d3ee");
  const [teamId, setTeamId] = useState("cyan");
  const [player, setPlayer] = useState<Player | null>(null);
  const [participants, setParticipants] = useState<Player[]>([]);

  // Game States
  const [currentQuestion, setCurrentQuestion] = useState<PublicQuestion | null>(
    null,
  );
  const [questionStatus, setQuestionStatus] = useState<string>("idle");
  const [hasAnswered, setHasAnswered] = useState(false);
  const [chosenOption, setChosenOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);

  // Lifelines
  const [lifelinesRemaining, setLifelinesRemaining] = useState(2);
  const [lifelinesTimeRemaining, setLifelinesTimeRemaining] = useState(2);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const [impostorVoteSent, setImpostorVoteSent] = useState(false);
  const [wordGuesses, setWordGuesses] = useState<string[]>([]);
  const [wordMisses, setWordMisses] = useState<string[]>([]);
  const [wordLives, setWordLives] = useState(7);
  const [wordOutcome, setWordOutcome] = useState<"playing" | "won" | "lost">(
    "playing",
  );
  const [wordWinSeconds, setWordWinSeconds] = useState<number | null>(null);
  const [wordRevealLifelines, setWordRevealLifelines] = useState(2);
  const [wordFilterLifelines, setWordFilterLifelines] = useState(2);
  const [wordFilterActive, setWordFilterActive] = useState(false);
  const [tarkeebaGuess, setTarkeebaGuess] = useState<string[]>([]);
  const [tarkeebaRows, setTarkeebaRows] = useState<
    Array<{
      letters: string[];
      states: Array<"correct" | "present" | "absent">;
    }>
  >([]);
  const [tarkeebaFinished, setTarkeebaFinished] = useState(false);
  const [tarkeebaRevealedLetters, setTarkeebaRevealedLetters] = useState<
    string[]
  >([]);
  const [tarkeebaFilterActive, setTarkeebaFilterActive] = useState(false);
  const [tarkeebaTimeCooldown, setTarkeebaTimeCooldown] = useState(0);
  const [baathraAnswer, setBaathraAnswer] = useState("");
  const [baathraResult, setBaathraResult] = useState<{
    correct: boolean;
    points: number;
    rank: number;
  } | null>(null);
  const [baathraSubmitted, setBaathraSubmitted] = useState(false);
  const [baathraRequestAnswers, setBaathraRequestAnswers] = useState(
    Array(6).fill("") as string[],
  );
  const [baathraRequestSubmitted, setBaathraRequestSubmitted] = useState(
    Array(6).fill(false) as boolean[],
  );
  const [baathraRequestAutoApproved, setBaathraRequestAutoApproved] = useState(
    Array(6).fill(null) as Array<boolean | null>,
  );
  const [baathraRequestHints, setBaathraRequestHints] = useState<
    Record<number, Array<{ letters: string[]; wordLength: number }>>
  >({});
  const [motivationIndex, setMotivationIndex] = useState(0);
  const [showRoundResults, setShowRoundResults] = useState(false);
  const [top10Input, setTop10Input] = useState("");
  const [top10Sending, setTop10Sending] = useState(false);
  const [top10History, setTop10History] = useState<
    Array<{
      text: string;
      status: "captured" | "taken" | "wrong";
      matchedAnswer?: string;
      points: number;
    }>
  >([]);

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const preparedQuestionIdRef = useRef<string | null>(null);
  const imageRevealStartedRef = useRef(0);
  const chairReadyRoundRef = useRef<string | null>(null);

  // Refs to hold latest session/player for use inside subscription callbacks
  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<Player | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    if (urlRoomCode) {
      handleVerifyRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRoomCode]);

  useEffect(() => {
    const rotation = setInterval(
      () => setMotivationIndex((index) => (index + 1) % 5),
      5500,
    );
    return () => clearInterval(rotation);
  }, []);

  // A presenter's permanent room link remains valid between competitions.
  // When the next waiting/active session is created, move the visitor straight
  // to registration without requiring them to re-enter the code.
  useEffect(() => {
    if (!waitingRoomCode) return;
    return subscribeSessionByRoomCode(waitingRoomCode, (nextSession) => {
      if (!nextSession) return;
      setSession(nextSession);
      setWaitingRoomCode(null);
      setStep(2);
    });
  }, [waitingRoomCode]);

  // Presence heartbeat lets the presenter distinguish a connected contestant
  // from one whose connection is delayed or has been lost.
  useEffect(() => {
    if (!player?.id || !session?.id) return;
    const touch = () => {
      void touchPlayerPresence(session.id, player.id);
    };
    touch();
    const heartbeat = setInterval(touch, 15_000);
    window.addEventListener("online", touch);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("online", touch);
    };
  }, [player?.id, session?.id]);

  useEffect(() => {
    if (!session?.id) return;
    return subscribeSessionPlayers(session.id, setParticipants);
  }, [session?.id]);

  // Realtime subscriptions (session + own player row)
  useEffect(() => {
    if (!player?.id || !session?.id) return;

    const unsubs: Unsubscribe[] = [];

    // 1. Session doc changes
    unsubs.push(
      subscribeSession(session.id, async (newSess) => {
        if (!newSess) return;

        // Broadcast Hint handling
        if (
          newSess.currentHint &&
          newSess.currentHint !== sessionRef.current?.currentHint
        ) {
          setHint(newSess.currentHint);
          setTimeout(() => {
            setHint(null);
          }, 6000);
        }

        setSession(newSess);
        setQuestionStatus(newSess.questionStatus);
        if (newSess.status === "paused") {
          stopTimer();
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          prepTimerRef.current = null;
          setPrepCountdown(null);
          return;
        }
        const previousDuration =
          sessionRef.current?.timerDuration || newSess.timerDuration;
        if (
          newSess.questionStatus === "showing" &&
          newSess.timerDuration > previousDuration
        ) {
          setSecondsLeft(
            (seconds) => seconds + (newSess.timerDuration - previousDuration),
          );
        }
        if (
          newSess.gameMode === "impostor" &&
          newSess.impostorPhase === "voting"
        )
          setImpostorVoteSent(false);

        const questionId = newSess.currentQuestionId;
        if (
          newSess.gameMode === "chairs" &&
          newSess.chairPhase === "ready" &&
          questionId &&
          questionId !== chairReadyRoundRef.current
        ) {
          chairReadyRoundRef.current = questionId;
          setHasAnswered(false);
          setChosenOption(null);
          setIsCorrect(null);
          setPrepCountdown(null);
          stopTimer();
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          setSecondsLeft(newSess.timerDuration);
          startTimeRef.current = Date.now();
          startTimer(newSess.timerDuration, newSess.id, questionId);
        } else if (
          newSess.questionStatus === "showing" &&
          questionId &&
          questionId !== preparedQuestionIdRef.current
        ) {
          preparedQuestionIdRef.current = questionId;
          setHasAnswered(false);
          setChosenOption(null);
          setIsCorrect(null);
          setHiddenOptions([]);
          setWordGuesses([]);
          setWordMisses([]);
          setWordLives(newSess.wordMaxAttempts || 7);
          setWordOutcome("playing");
          setWordWinSeconds(null);
          setWordFilterActive(false);
          imageRevealStartedRef.current = 0;
          stopTimer();
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          if (newSess.gameMode === "top10") {
            setCurrentQuestion(null);
            setTop10Input("");
            setTop10History([]);
            setPrepCountdown(3);
            setSecondsLeft(newSess.timerDuration);
            let countdown = 3;
            prepTimerRef.current = setInterval(() => {
              countdown -= 1;
              if (countdown > 0) {
                setPrepCountdown(countdown);
                return;
              }
              if (prepTimerRef.current) clearInterval(prepTimerRef.current);
              prepTimerRef.current = null;
              setPrepCountdown(null);
              startTimeRef.current = Date.now();
              startTimer(newSess.timerDuration, newSess.id, questionId);
            }, 1000);
            return;
          } else if (newSess.gameMode === "tarkeeba") {
            setCurrentQuestion(null);
            setPrepCountdown(null);
            setTarkeebaGuess([]);
            setTarkeebaRows([]);
            setTarkeebaFinished(false);
            setTarkeebaRevealedLetters([]);
            setTarkeebaFilterActive(false);
            setTarkeebaTimeCooldown(0);
            startTimeRef.current = Date.now();
            setSecondsLeft(newSess.timerDuration);
            startTimer(newSess.timerDuration, newSess.id, questionId);
            return;
          } else if (newSess.gameMode === "baathra") {
            setCurrentQuestion(null);
            setPrepCountdown(3);
            setBaathraAnswer("");
            setBaathraResult(null);
            setBaathraSubmitted(false);
            setBaathraRequestAnswers(Array(6).fill(""));
            setBaathraRequestSubmitted(Array(6).fill(false));
            setBaathraRequestAutoApproved(Array(6).fill(null));
            setBaathraRequestHints({});
            setSecondsLeft(newSess.timerDuration);
            let countdown = 3;
            prepTimerRef.current = setInterval(() => {
              countdown -= 1;
              if (countdown > 0) {
                setPrepCountdown(countdown);
                return;
              }
              if (prepTimerRef.current) clearInterval(prepTimerRef.current);
              prepTimerRef.current = null;
              setPrepCountdown(null);
              startTimeRef.current = Date.now();
              startTimer(newSess.timerDuration, newSess.id, questionId);
            }, 1000);
            return;
          } else if (newSess.gameMode === "chairs") {
            setCurrentQuestion(null);
          } else {
            const question = await getPublicQuestion(newSess.id, questionId);
            setCurrentQuestion(question);
          }
          if (
            newSess.gameMode === "image-reveal" &&
            !newSess.imageRevealStartedAt
          ) {
            setPrepCountdown(null);
            return;
          }
          setPrepCountdown(3);
          prepTimerRef.current = setInterval(() => {
            setPrepCountdown((previous) => {
              if (previous === null) return null;
              if (previous <= 1) {
                if (prepTimerRef.current) clearInterval(prepTimerRef.current);
                prepTimerRef.current = null;
                setSecondsLeft(newSess.timerDuration);
                startTimeRef.current = Date.now();
                if (!newSess.practiceQuestion)
                  startTimer(newSess.timerDuration, newSess.id, questionId);
                return null;
              }
              return previous - 1;
            });
          }, 1000);
        } else if (
          newSess.gameMode === "image-reveal" &&
          newSess.questionStatus === "showing" &&
          newSess.imageRevealStartedAt &&
          !newSess.practiceQuestion
        ) {
          const startedAt = timestampMillis(newSess.imageRevealStartedAt);
          if (startedAt && imageRevealStartedRef.current !== startedAt) {
            imageRevealStartedRef.current = startedAt;
            setSecondsLeft(newSess.timerDuration);
            startTimeRef.current = Date.now();
            startTimer(newSess.timerDuration, newSess.id, questionId || "");
          }
        } else if (newSess.questionStatus === "revealed") {
          setPrepCountdown(null);
          if (prepTimerRef.current) clearInterval(prepTimerRef.current);
          setShowRoundResults(true);
          setTimeout(() => setShowRoundResults(false), 10_000);
          if (newSess.gameMode === "chairs") {
            const safe =
              newSess.chairResults?.[playerRef.current?.id || ""] === "safe";
            setIsCorrect(safe);
            if (safe)
              confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
          } else {
            revealAnswer();
          }
        }
      }),
    );

    // 2. Own player row changes (score, streak, lifelines)
    unsubs.push(
      subscribePlayer(session.id, player.id, (newPlayer) => {
        if (!newPlayer) return;
        setPlayer(newPlayer);
        setStreak(newPlayer.streak || 0);
        setLifelinesRemaining(newPlayer.lifelinesRemaining);
        setLifelinesTimeRemaining(newPlayer.lifelinesTimeRemaining);
        setWordRevealLifelines(newPlayer.wordRevealLifelinesRemaining ?? 2);
        setWordFilterLifelines(newPlayer.wordFilterLifelinesRemaining ?? 2);
      }),
    );

    return () => {
      unsubs.forEach((u) => u && u());
      stopTimer();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, session?.id]);

  const handleVerifyRoom = async () => {
    if (!roomCode.trim()) return;
    const normalizedRoomCode = roomCode.trim();
    const data = await getSessionByRoomCode(normalizedRoomCode);
    if (data) {
      setSession(data);
      setWaitingRoomCode(null);
      setStep(2);
      return;
    }
    const presenter = await getPresenterByRoomCode(normalizedRoomCode);
    if (!presenter) {
      alert("خطأ: رمز الغرفة غير موجود أو غير صالح.");
      return;
    }
    setWaitingPresenterName(presenter.displayName || presenter.username);
    setWaitingRoomCode(normalizedRoomCode);
    setStep(0);
  };

  const handleJoinGame = async () => {
    if (!playerName.trim() || !session) return;
    const existing = await getPlayerByName(session.id, playerName.trim());
    if (existing) {
      setRecoveryCode("");
      setStep(2);
      router.replace(
        `/player?room=${encodeURIComponent(session.roomCode)}&recover=1`,
      );
      return;
    }
    const needsApproval = session.joiningLocked === true;
    let newPlayer: Player | null = null;
    const firstCandidate = Math.floor(Math.random() * 100);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = String((firstCandidate + attempt) % 100).padStart(
        2,
        "0",
      );
      if (await getPlayerByRejoinCode(session.id, candidate)) continue;
      try {
        newPlayer = await createPlayer(session.id, {
          name: playerName.trim(),
          color: playerColor,
          rejoinCode: candidate,
          teamId,
          score: 0,
          streak: 0,
          lifelinesRemaining: 2,
          lifelinesTimeRemaining: 2,
          wordRevealLifelinesRemaining: 2,
          wordFilterLifelinesRemaining: 2,
          usedFiftyFifty: false,
          usedTimeExtension: false,
          approvalStatus: needsApproval ? "pending" : "approved",
          isActive: !needsApproval,
        });
        break;
      } catch (joinError) {
        if (
          joinError instanceof Error &&
          joinError.message === "PLAYER_CODE_TAKEN"
        )
          continue;
        throw joinError;
      }
    }
    if (!newPlayer) {
      alert("اكتملت الأرقام المتاحة لهذه الجلسة. تواصل مع المقدم.");
      return;
    }
    setPlayer(newPlayer);
    setStep(3);
    setShowNewPlayerId(true);
    window.setTimeout(() => setShowNewPlayerId(false), 6000);
  };

  const handleRecoverPlayer = async () => {
    if (!session || !/^(\d{2}|\d{5})$/.test(recoveryCode)) return;
    const recovered = await getPlayerByRejoinCode(session.id, recoveryCode);
    if (!recovered) {
      alert("رمز الاستعادة غير صحيح لهذه الجلسة.");
      return;
    }
    setPlayer(recovered);
    setPlayerName(recovered.name);
    setStreak(recovered.streak || 0);
    setStep(3);
  };

  const startTimer = (
    duration: number,
    sessionId: string,
    questionId: string,
  ) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          void requestTimeoutReveal(sessionId, questionId);
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
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (
      !sess ||
      !me ||
      hasAnswered ||
      questionStatus !== "showing" ||
      !currentQuestion ||
      (sess.gameMode === "image-reveal" && !sess.imageRevealStartedAt)
    )
      return;

    setHasAnswered(true);
    setChosenOption(optIdx);

    const timeSpent = parseFloat(
      ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
    );
    try {
      await submitPublicAnswer({
        sessionId: sess.id,
        playerId: me.id,
        questionId: currentQuestion.id,
        chosenOption: optIdx,
        timeSpent,
      });
    } catch {
      setHasAnswered(false);
      setChosenOption(null);
    }
  };

  const handleSubmitChair = async (chairNumber: number) => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (
      !sess ||
      !me ||
      hasAnswered ||
      questionStatus !== "showing" ||
      !sess.currentQuestionId
    )
      return;
    setHasAnswered(true);
    setChosenOption(chairNumber);
    try {
      await submitChairChoice({
        sessionId: sess.id,
        playerId: me.id,
        roundId: sess.currentQuestionId,
        chairNumber,
      });
    } catch {
      setHasAnswered(false);
      setChosenOption(null);
    }
  };

  const handleImpostorVote = async (votedPlayerId: string) => {
    if (!session || !player || impostorVoteSent) return;
    try {
      await voteForImpostor({
        sessionId: session.id,
        playerId: player.id,
        votedPlayerId,
      });
      setImpostorVoteSent(true);
    } catch {
      /* keep choices available if delivery failed */
    }
  };

  const handleGuessWordLetter = (letter: string) => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    const word = decodeWordSecret(currentQuestion?.wordSecret);
    const normalizedLetter = normalizeWordLetter(letter);
    if (
      !sess ||
      !me ||
      !currentQuestion ||
      !word ||
      hasAnswered ||
      wordOutcome !== "playing" ||
      wordGuesses.includes(normalizedLetter) ||
      wordMisses.includes(normalizedLetter)
    )
      return;
    const normalizedWord = normalizeWordLetter(word);
    if (normalizedWord.includes(normalizedLetter)) {
      const nextGuesses = [...wordGuesses, normalizedLetter];
      setWordGuesses(nextGuesses);
      const complete = Array.from(normalizedWord)
        .filter((character) => character !== " ")
        .every((character) => nextGuesses.includes(character));
      if (complete) {
        const timeSpent = parseFloat(
          ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
        );
        setWordOutcome("won");
        setWordWinSeconds(timeSpent);
        setHasAnswered(true);
        void submitWordAnswer({
          sessionId: sess.id,
          playerId: me.id,
          questionId: currentQuestion.id,
          answer: word,
          outcome: "won",
          timeSpent,
        });
      }
      return;
    }
    const nextLives = wordLives - 1;
    setWordMisses((previous) => [...previous, normalizedLetter]);
    setWordLives(nextLives);
    if (nextLives <= 0) {
      setWordOutcome("lost");
      setHasAnswered(true);
      void submitWordAnswer({
        sessionId: sess.id,
        playerId: me.id,
        questionId: currentQuestion.id,
        outcome: "lost",
        timeSpent: parseFloat(
          ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
        ),
      });
    }
  };

  const handleRevealWordLetters = async () => {
    const me = playerRef.current;
    const sess = sessionRef.current;
    const word = decodeWordSecret(currentQuestion?.wordSecret);
    if (
      !me ||
      !sess ||
      !word ||
      wordRevealLifelines <= 0 ||
      wordOutcome !== "playing"
    )
      return;
    const available = [
      ...new Set(
        Array.from(normalizeWordLetter(word)).filter(
          (letter) => letter !== " " && !wordGuesses.includes(letter),
        ),
      ),
    ].sort(() => Math.random() - 0.5);
    const nextGuesses = [
      ...new Set([...wordGuesses, ...available.slice(0, 2)]),
    ];
    setWordGuesses(nextGuesses);
    const remaining = wordRevealLifelines - 1;
    setWordRevealLifelines(remaining);
    await updatePlayer(sess.id, me.id, {
      wordRevealLifelinesRemaining: remaining,
    });
    const complete = Array.from(normalizeWordLetter(word))
      .filter((character) => character !== " ")
      .every((character) => nextGuesses.includes(character));
    if (complete) {
      const timeSpent = parseFloat(
        ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
      );
      setWordOutcome("won");
      setWordWinSeconds(timeSpent);
      setHasAnswered(true);
      await submitWordAnswer({
        sessionId: sess.id,
        playerId: me.id,
        questionId: currentQuestion!.id,
        answer: word,
        outcome: "won",
        timeSpent,
      });
    }
  };

  const handleFilterWordKeyboard = async () => {
    const me = playerRef.current;
    const sess = sessionRef.current;
    if (!me || !sess || wordFilterLifelines <= 0 || wordOutcome !== "playing")
      return;
    setWordFilterActive(true);
    const remaining = wordFilterLifelines - 1;
    setWordFilterLifelines(remaining);
    await updatePlayer(sess.id, me.id, {
      wordFilterLifelinesRemaining: remaining,
    });
  };

  const revealAnswer = async () => {
    stopTimer();
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (!sess || !me || !currentQuestion) return;

    const answer = await getPlayerAnswer(sess.id, me.id, currentQuestion.id);
    if (answer) {
      setIsCorrect(answer.isCorrect);
      if (answer.isCorrect) {
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
      }
    } else {
      setIsCorrect(false);
    }
  };

  // LIFELINES
  const handleUse5050 = async () => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (
      !sess ||
      !me ||
      !currentQuestion ||
      lifelinesRemaining <= 0 ||
      hasAnswered
    )
      return;

    try {
      const hidden = await useFiftyFifty({
        sessionId: sess.id,
        playerId: me.id,
        questionId: currentQuestion.id,
      });
      setHiddenOptions(hidden);
    } catch {
      // The realtime player row will show the latest remaining lifelines.
    }
  };

  const handleUseTimeLifeline = async () => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (
      !sess ||
      !me ||
      !sess.currentQuestionId ||
      lifelinesTimeRemaining <= 0 ||
      questionStatus !== "showing"
    )
      return;
    try {
      await useTimeExtension({
        sessionId: sess.id,
        playerId: me.id,
        questionId: sess.currentQuestionId,
      });
    } catch {
      // The realtime player row keeps the available count in sync.
    }
  };

  const handleTarkeebaTimeExtension = async () => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (
      !sess ||
      !me ||
      !sess.currentQuestionId ||
      tarkeebaTimeCooldown > 0 ||
      questionStatus !== "showing"
    )
      return;
    setTarkeebaTimeCooldown(5);
    try {
      await useTimeExtension({
        sessionId: sess.id,
        playerId: me.id,
        questionId: sess.currentQuestionId,
      });
    } catch {
      setTarkeebaTimeCooldown(0);
    }
  };

  useEffect(() => {
    if (tarkeebaTimeCooldown <= 0) return;
    const cooldown = window.setInterval(
      () => setTarkeebaTimeCooldown((value) => Math.max(0, value - 1)),
      1000,
    );
    return () => window.clearInterval(cooldown);
  }, [tarkeebaTimeCooldown > 0]);

  const motivations = [
    "استعد… السرعة والتركيز يصنعان الفارق.",
    "كل سؤال فرصة جديدة للتقدم.",
    "فكّر بهدوء وأجب بثقة.",
    "فريقك ينتظر نقاطك الذهبية.",
    "ابقَ متصلاً، السؤال قد يظهر في أي لحظة.",
  ];
  const wordSecret = decodeWordSecret(currentQuestion?.wordSecret);
  const wordAnswerLetters = new Set(
    Array.from(normalizeWordLetter(wordSecret)).filter(
      (letter) => letter !== " ",
    ),
  );
  const tarkeebaSecret = decodeWordSecret(session?.tarkeebaSecret);
  const tarkeebaSecretLetters = Array.from(tarkeebaSecret);
  const tarkeebaBoardLength = Math.max(5, tarkeebaSecretLetters.length);
  const wordMask = Array.from(wordSecret).map((character, index) => {
    if (character === " ")
      return <span key={`space-${index}`} className="w-4" />;
    const visible = wordGuesses.includes(normalizeWordLetter(character));
    return (
      <span
        key={`${character}-${index}`}
        className={cn(
          "grid h-12 min-w-9 place-items-center rounded-lg border-b-2 px-1 font-display text-2xl font-black",
          visible
            ? "border-success text-success-bright"
            : "border-neon/50 text-neon-bright",
        )}
      >
        {visible ? character : "＊"}
      </span>
    );
  });
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
  const individualStandings = [...participants].sort(
    (first, second) => (second.score || 0) - (first.score || 0),
  );
  const playerTeamStandings = TEAM_OPTIONS.map((team) => {
    const members = participants.filter(
      (participant) =>
        (participant.teamId || getTeamFromColor(participant.color)?.id) ===
        team.id,
    );
    return {
      ...team,
      score: members.reduce(
        (total, participant) => total + (participant.score || 0),
        0,
      ),
    };
  })
    .filter(
      (team) =>
        team.score > 0 ||
        participants.some(
          (participant) =>
            (participant.teamId || getTeamFromColor(participant.color)?.id) ===
            team.id,
        ),
    )
    .sort((first, second) => second.score - first.score);
  const handleTarkeebaKey = (letter: string) => {
    if (
      !tarkeebaFinished &&
      tarkeebaGuess.length < Array.from(tarkeebaSecret).length
    )
      setTarkeebaGuess((current) => [...current, letter]);
  };
  const submitTarkeebaGuess = async () => {
    if (
      !session ||
      !player ||
      tarkeebaFinished ||
      tarkeebaGuess.length !== Array.from(tarkeebaSecret).length
    )
      return;
    const guess = tarkeebaGuess.join("");
    const secretLetters = Array.from(tarkeebaSecret);
    const normalizedSecretLetters = secretLetters.map(normalizeWordLetter);
    const states = Array.from(guess).map((letter, index) =>
      normalizeWordLetter(letter) === normalizedSecretLetters[index]
        ? ("correct" as const)
        : normalizedSecretLetters.includes(normalizeWordLetter(letter))
          ? ("present" as const)
          : ("absent" as const),
    );
    const nextRows = [...tarkeebaRows, { letters: Array.from(guess), states }];
    setTarkeebaRows(nextRows);
    setTarkeebaGuess([]);
    const won =
      normalizeWordLetter(guess) === normalizeWordLetter(tarkeebaSecret);
    const lost = nextRows.length >= (session.tarkeebaMaxAttempts || 6);
    if (won || lost) {
      setTarkeebaFinished(true);
      const serverCorrect = await submitTarkeebaResult({
        sessionId: session.id,
        playerId: player.id,
        answer: won ? guess : undefined,
        attempts: nextRows.length,
        timeSpent: parseFloat(
          ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
        ),
      });
      setHasAnswered(true);
      setIsCorrect(serverCorrect);
      if (serverCorrect)
        confetti({ particleCount: 45, spread: 55, origin: { y: 0.55 } });
    }
  };

  const handleSubmitBaathra = async () => {
    if (!session || !player || !baathraAnswer.trim() || baathraResult) return;
    await submitBaathraAnswer({
      sessionId: session.id,
      playerId: player.id,
      answer: baathraAnswer,
      timeSpent: parseFloat(
        ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
      ),
    });
    setBaathraSubmitted(true);
    setHasAnswered(true);
  };

  const handleSubmitTop10 = async () => {
    if (
      !session ||
      !player ||
      !top10Input.trim() ||
      top10Sending ||
      session.questionStatus !== "showing"
    )
      return;
    const text = top10Input.trim();
    setTop10Sending(true);
    setTop10Input("");
    try {
      const result = await submitTop10Answer({
        sessionId: session.id,
        playerId: player.id,
        answer: text,
        timeSpent: parseFloat(
          ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
        ),
      });
      setTop10History((current) => [
        {
          text,
          status: result.status || "wrong",
          matchedAnswer: result.matchedAnswer,
          points: Number(result.points || 0),
        },
        ...current,
      ]);
      if (result.status === "captured")
        confetti({ particleCount: 30, spread: 45, origin: { y: 0.65 } });
    } catch {
      setTop10Input(text);
    } finally {
      setTop10Sending(false);
    }
  };

  const handleSubmitBaathraRequest = async (requestIndex: number) => {
    if (!session || !player || baathraRequestSubmitted[requestIndex]) return;
    const answer = baathraRequestAnswers[requestIndex]?.trim();
    if (!answer) return;
    const result = await submitBaathraAnswer({
      sessionId: session.id,
      playerId: player.id,
      answer,
      requestIndex,
      timeSpent: parseFloat(
        ((Date.now() - startTimeRef.current) / 1000).toFixed(2),
      ),
    });
    setBaathraRequestSubmitted((current) =>
      current.map((submitted, index) =>
        index === requestIndex ? true : submitted,
      ),
    );
    setBaathraRequestAutoApproved((current) =>
      current.map((approved, index) =>
        index === requestIndex ? Boolean(result.autoApproved) : approved,
      ),
    );
  };

  const handleUseBaathraHint = async (requestIndex: number) => {
    if (!session || !player) return;
    try {
      const result = await useBaathraHint({
        sessionId: session.id,
        playerId: player.id,
        requestIndex,
      });
      setBaathraRequestHints((current) => ({
        ...current,
        [requestIndex]: [
          ...(current[requestIndex] || []),
          {
            letters: result.revealedLetters,
            wordLength: result.wordLength,
          },
        ],
      }));
    } catch (hintError) {
      alert(
        hintError instanceof Error
          ? hintError.message
          : "تعذر استخدام المساعدة.",
      );
    }
  };

  const handleRevealTarkeebaLetters = async () => {
    if (!session || !player || wordRevealLifelines <= 0 || tarkeebaFinished)
      return;
    const available = [
      ...new Set(Array.from(normalizeWordLetter(tarkeebaSecret))),
    ].filter((letter) => !tarkeebaRevealedLetters.includes(letter));
    setTarkeebaRevealedLetters((current) => [
      ...new Set([
        ...current,
        ...available.sort(() => Math.random() - 0.5).slice(0, 2),
      ]),
    ]);
    const remaining = wordRevealLifelines - 1;
    setWordRevealLifelines(remaining);
    await updatePlayer(session.id, player.id, {
      wordRevealLifelinesRemaining: remaining,
    });
  };

  const handleFilterTarkeebaKeyboard = async () => {
    if (
      !session ||
      !player ||
      wordFilterLifelines <= 0 ||
      tarkeebaFinished ||
      tarkeebaFilterActive
    )
      return;
    setTarkeebaFilterActive(true);
    const remaining = wordFilterLifelines - 1;
    setWordFilterLifelines(remaining);
    await updatePlayer(session.id, player.id, {
      wordFilterLifelinesRemaining: remaining,
    });
  };

  return (
    <Background className="grid min-h-[100dvh] w-full place-items-center p-3 sm:p-4">
      {/* WAITING FOR A PRESENTER'S NEXT COMPETITION */}
      {step === 0 && (
        <div className="anim-rise w-full max-w-sm text-center">
          <div className="glass-strong space-y-5 rounded-[var(--radius-card)] p-8 shadow-[var(--shadow-neon)]">
            <Sparkles className="anim-float mx-auto h-14 w-14 text-neon-bright" />
            <div>
              <h1 className="text-xl font-extrabold text-gradient">
                بانتظار انطلاق التحدي
              </h1>
              <p className="mt-3 text-sm leading-7 text-ink-soft">
                التحدي الخاص بـ{" "}
                <strong className="text-neon-bright">
                  {waitingPresenterName}
                </strong>{" "}
                لم يبدأ بعد.
              </p>
              <p className="mt-2 text-xs leading-6 text-ink-mute">
                ابقَ في هذه الصفحة؛ ستنتقل تلقائياً عند إنشاء المقدم للجلسة
                التالية.
              </p>
            </div>
            <span
              dir="ltr"
              className="inline-block rounded-lg border border-line bg-void/60 px-3 py-1.5 font-display text-sm tracking-[0.25em] text-neon-bright"
            >
              {waitingRoomCode}
            </span>
          </div>
        </div>
      )}

      {/* STEP 1: VERIFY ROOM CODE */}
      {step === 1 && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="anim-float mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-gradient">
              انضم للمسابقة
            </h1>
            <p className="mt-2 text-xs text-ink-mute">
              اكتب رمز الغرفة المكون من 4 أرقام للانضمام لجلسة اللعب
            </p>
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
            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={handleVerifyRoom}
            >
              التحقق من الرمز
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {step === 2 && session && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-ink">
              {recoveryMode
                ? "استعادة الدخول للمسابقة"
                : `أهلاً بك في: ${session.title}`}
            </h2>
            <p className="mt-1 text-xs text-ink-mute">
              {recoveryMode
                ? "أدخل رقمك الشخصي المكوّن من رقمين للمتابعة من جهاز آخر."
                : "اكتب اسمك للمشاركة في المسابقة"}
            </p>
          </div>

          <div className="glass-strong rounded-[var(--radius-card)] p-7 space-y-5 shadow-[var(--shadow-neon)]">
            {recoveryMode ? (
              <>
                <Field label="رمز الاستعادة الشخصي">
                  <Input
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="••"
                    value={recoveryCode}
                    onChange={(event) =>
                      setRecoveryCode(event.target.value.replace(/\D/g, ""))
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        /^(\d{2}|\d{5})$/.test(recoveryCode)
                      )
                        void handleRecoverPlayer();
                    }}
                    icon={<KeyRound className="h-5 w-5" />}
                    className="text-center font-display text-2xl font-extrabold tracking-[0.35em]"
                  />
                </Field>
                <Button
                  variant="success"
                  size="lg"
                  fullWidth
                  disabled={!/^(\d{2}|\d{5})$/.test(recoveryCode)}
                  onClick={() => void handleRecoverPlayer()}
                >
                  استعادة حسابي والمتابعة
                </Button>
              </>
            ) : (
              <>
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
                  <label className="mb-2 block text-xs font-semibold text-ink-soft">
                    اختر لون فريقك المفضل
                  </label>
                  <p className="mb-3 text-[10px] leading-5 text-ink-mute">
                    يجمع المقدم النقاط حسب اللون، ويمكنه توزيعك أو نقلك إلى فريق
                    آخر.
                  </p>
                  <div className="flex justify-center gap-3">
                    {TEAM_OPTIONS.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => {
                          setPlayerColor(team.color);
                          setTeamId(team.id);
                        }}
                        className={cn(
                          "h-9 w-9 cursor-pointer rounded-full border-2 transition-all",
                          teamId === team.id
                            ? "scale-115 border-white shadow-lg"
                            : "border-transparent opacity-70 hover:opacity-100",
                        )}
                        style={{
                          backgroundColor: team.color,
                          boxShadow:
                            teamId === team.id
                              ? `0 0 18px ${team.color}`
                              : undefined,
                        }}
                        aria-label={team.label}
                      />
                    ))}
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={handleJoinGame}
                >
                  دخول المسابقة
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: GAME HUD */}
      {step === 3 && player && session && (
        <div
          className={cn(
            "flex w-full flex-col",
            session.gameMode === "tarkeeba"
              ? "max-w-2xl gap-1.5"
              : session.gameMode === "money"
                ? "max-w-4xl gap-3 sm:gap-4"
                : "max-w-md gap-3 sm:gap-4",
          )}
        >
          {/* HUD header */}
          <div
            className={cn(
              "glass flex items-center justify-between rounded-2xl",
              session.gameMode === "tarkeeba" ? "p-2.5" : "p-3.5",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 animate-pulse rounded-full"
                style={{
                  backgroundColor: player.color,
                  boxShadow: `0 0 10px ${player.color}`,
                }}
              />
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate whitespace-nowrap text-sm font-bold text-ink">
                  {player.name}
                </span>
                {(getTeam(player.teamId) || getTeamFromColor(player.color)) && (
                  <span
                    className="shrink-0 whitespace-nowrap text-[10px] font-bold"
                    style={{ color: player.color }}
                  >
                    {
                      (getTeam(player.teamId) || getTeamFromColor(player.color))
                        ?.label
                    }
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-display text-xs font-extrabold text-gold">
                {player.score}
              </span>
              {streak >= 3 && (
                <span className="font-display text-xs font-bold text-orange-400">
                  🔥 {streak}
                </span>
              )}
            </div>
          </div>

          {/* Hint popup */}
          {hint && (
            <div className="anim-rise border border-neon/30 bg-neon-deep/40 backdrop-blur-md rounded-2xl p-3.5 text-center flex items-center justify-center gap-2 shadow-[var(--shadow-neon-soft)]">
              <span className="text-neon-bright animate-bounce">💡</span>
              <span className="text-xs font-bold text-slate-100">
                تلميح المقدم: {hint}
              </span>
            </div>
          )}

          {showNewPlayerId && player.rejoinCode && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center bg-void/80 p-5 pt-16 text-center backdrop-blur-md sm:pt-20">
              <div className="anim-rise w-full max-w-sm rounded-[var(--radius-card)] border border-cyan/40 bg-void-2 p-8 shadow-[var(--shadow-neon-strong)]">
                <p className="text-sm font-extrabold text-cyan">
                  رقمك الشخصي لاستعادة الدخول
                </p>
                <p
                  dir="ltr"
                  className="mt-5 font-display text-8xl font-black tracking-[0.22em] text-neon-bright drop-shadow-[0_0_25px_rgba(168,85,247,.65)]"
                >
                  {player.rejoinCode}
                </p>
                <p className="mt-5 text-sm font-bold leading-7 text-ink">
                  احفظ هذا الرقم جيداً؛ ستحتاجه إذا غيّرت الجهاز أو انقطع
                  اتصالك.
                </p>
                <p className="mt-3 text-xs text-ink-mute">
                  ستختفي هذه البطاقة تلقائياً بعد 6 ثوانٍ.
                </p>
              </div>
            </div>
          )}

          {player.approvalStatus === "pending" && (
            <div className="fixed inset-0 z-[90] flex items-start justify-center bg-void/85 p-5 pt-16 backdrop-blur-md">
              <div className="anim-rise w-full max-w-sm rounded-[var(--radius-card)] border border-gold/35 bg-void-2 p-7 text-center shadow-[var(--shadow-neon-strong)]">
                <Loader2 className="mx-auto h-11 w-11 animate-spin text-gold" />
                <h3 className="mt-5 text-xl font-extrabold text-ink">
                  طلب الانضمام معلّق
                </h3>
                <p className="mt-3 text-sm leading-7 text-ink-mute">
                  المسابقة بدأت بالفعل. تم إرسال طلبك إلى المقدم، وستدخل
                  تلقائياً فور موافقته.
                </p>
                {player.rejoinCode && (
                  <p className="mt-4 rounded-xl border border-cyan/25 bg-cyan/5 px-4 py-3 text-xs font-bold text-cyan">
                    رمز استعادة حسابك: {player.rejoinCode}
                  </p>
                )}
              </div>
            </div>
          )}

          {player.approvalStatus === "rejected" && (
            <div className="fixed inset-0 z-[90] flex items-start justify-center bg-void/85 p-5 pt-16 backdrop-blur-md">
              <div className="anim-rise w-full max-w-sm rounded-[var(--radius-card)] border border-danger/35 bg-void-2 p-7 text-center shadow-[var(--shadow-neon-strong)]">
                <XCircle className="mx-auto h-12 w-12 text-danger-bright" />
                <h3 className="mt-5 text-xl font-extrabold text-ink">
                  لم تتم الموافقة على الانضمام
                </h3>
                <p className="mt-3 text-sm leading-7 text-ink-mute">
                  يمكنك إبقاء الصفحة مفتوحة في حال سمح لك المقدم لاحقاً.
                </p>
              </div>
            </div>
          )}

          {/* Lifelines */}
          {session.status === "active" &&
            ["quiz", "survival", "faction"].includes(
              session.gameMode || "quiz",
            ) &&
            questionStatus === "showing" &&
            prepCountdown === null &&
            !hasAnswered && (
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
          <div
            className={cn(
              "glass-strong flex flex-col rounded-[var(--radius-card)] shadow-[var(--shadow-neon)]",
              session.gameMode === "tarkeeba"
                ? "min-h-0 justify-start p-2.5 sm:p-4"
                : "min-h-[320px] justify-center p-6",
            )}
          >
            {/* WAITING */}
            {session.status === "paused" && (
              <div className="anim-rise space-y-5 py-8 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-gold/35 bg-gold/10 text-3xl text-gold">
                  ⏸
                </div>
                <h3 className="text-xl font-black text-ink">
                  التحدي متوقف مؤقتاً
                </h3>
                <p className="text-sm leading-7 text-ink-mute">
                  احتفظ بهذه الصفحة مفتوحة؛ سيعود التحدي تلقائياً عندما يستأنفه
                  المقدم.
                </p>
              </div>
            )}
            {(session.status === "waiting" ||
              (session.status === "active" &&
                questionStatus === "idle" &&
                !["impostor", "roulette"].includes(
                  session.gameMode || "quiz",
                ) &&
                (session.gameMode !== "chairs" ||
                  !session.chairPhase ||
                  session.chairPhase === "idle"))) && (
              <div className="anim-rise space-y-5 text-center">
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1.5 text-[11px] font-bold text-success-bright">
                  <Wifi className="h-3.5 w-3.5" /> متصل وجاهز للعب
                </div>
                {session.gameMode === "money" && (
                  <div className="space-y-3">
                    <MoneyBoard session={session} compact />
                    <div className="grid grid-cols-3 gap-2">
                      {[...participants]
                        .sort(
                          (first, second) =>
                            (second.score || 0) - (first.score || 0),
                        )
                        .slice(0, 3)
                        .map((contestant, index) => (
                          <div
                            key={contestant.id}
                            className="anim-winner-card rounded-xl border border-line bg-white/5 px-2 py-2"
                            style={{ animationDelay: `${index * 70}ms` }}
                          >
                            <p className="truncate text-[10px] font-bold text-ink">
                              {index + 1}. {contestant.name}
                            </p>
                            <p className="mt-1 font-display text-sm font-black text-gold">
                              {contestant.score || 0}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-neon/35 bg-neon/10 shadow-[var(--shadow-neon)]">
                  <Radio className="h-8 w-8 anim-pulse-neon text-neon-bright" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-ink">
                    بانتظار المقدم لإظهار السؤال
                  </h3>
                  <p className="mt-2 text-xs leading-6 text-ink-mute">
                    ابقَ في هذه الصفحة؛ سيظهر التحدي والعداد فور انطلاقه.
                  </p>
                </div>
                {["word", "tarkeeba"].includes(session.gameMode || "") &&
                session.wordKeyboardPreview ? (
                  <div className="rounded-2xl border border-cyan/35 bg-cyan/5 p-4">
                    <p className="mb-3 text-xs font-bold text-cyan">
                      تدرّب على أماكن الحروف قبل بدء الكلمة
                    </p>
                    <div dir="rtl" className="space-y-1.5">
                      {ARABIC_KEYBOARD_ROWS.map((row, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="flex justify-center gap-1.5"
                        >
                          {row.map((letter) => (
                            <span
                              key={letter}
                              className="grid h-9 min-w-7 flex-1 place-items-center rounded-lg border border-line bg-void/50 font-display text-base font-black text-ink sm:max-w-11"
                            >
                              {letter}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-neon/35 bg-neon/5 px-5 py-6">
                    <p className="anim-typewriter-rtl text-xs font-bold text-neon-bright">
                      السؤال التالي سيظهر هنا
                    </p>
                    <p
                      key={motivationIndex}
                      className="anim-typewriter-rtl mt-3 text-sm font-bold text-ink-soft [animation-delay:80ms]"
                    >
                      {motivations[motivationIndex]}
                    </p>
                  </div>
                )}
              </div>
            )}

            {session.status === "active" && session.gameMode === "impostor" && (
              <div className="space-y-5 text-center">
                {session.impostorPhase === "discussion" &&
                  (player.id === session.impostorPlayerId ? (
                    <div className="rounded-2xl border border-danger/40 bg-danger/10 p-6">
                      <p className="text-4xl">🕵️</p>
                      <h3 className="mt-3 text-xl font-black text-danger-bright">
                        أنت الإمبوستر!
                      </h3>
                      <p className="mt-2 text-sm text-ink-soft">
                        حاول أن تندمج ولا تنكشف خلال النقاش.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-success/35 bg-success/10 p-6">
                      <p className="text-[10px] font-bold tracking-[.2em] text-success-bright">
                        الكلمة السرية
                      </p>
                      <h3 className="mt-3 text-3xl font-black text-ink">
                        {session.impostorWord}
                      </h3>
                      <p className="mt-3 text-xs text-ink-mute">
                        ناقشها دون كشفها مباشرة.
                      </p>
                    </div>
                  ))}
                {session.impostorPhase === "voting" && (
                  <>
                    <h3 className="text-lg font-bold text-ink">
                      من هو الإمبوستر؟
                    </h3>
                    {impostorVoteSent ? (
                      <p className="rounded-xl bg-success/10 p-4 text-sm font-bold text-success-bright">
                        تم تسجيل تصويتك. انتظر الكشف.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {participants
                          .filter((candidate) => candidate.id !== player.id)
                          .map((candidate) => (
                            <button
                              key={candidate.id}
                              onClick={() => handleImpostorVote(candidate.id)}
                              className="rounded-xl border border-line bg-void/40 p-3 text-sm font-bold text-ink transition hover:border-danger/50"
                            >
                              {candidate.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </>
                )}
                {session.impostorPhase === "revealed" && (
                  <div className="rounded-2xl border border-gold/35 bg-gold/10 p-6">
                    <h3 className="text-lg font-bold text-gold">
                      تم كشف الإمبوستر
                    </h3>
                    <p className="mt-2 text-sm text-ink-soft">
                      تابع شاشة العرض للنتائج.
                    </p>
                  </div>
                )}
              </div>
            )}

            {session.status === "active" && session.gameMode === "roulette" && (
              <div className="space-y-5 text-center">
                <p className="text-6xl">🎡</p>
                {session.rouletteStatus === "spinning" &&
                session.rouletteWinnerId === player.id ? (
                  <>
                    <h3 className="text-xl font-black text-gold">
                      العجلة تدور... أوقفها!
                    </h3>
                    <Button
                      variant="success"
                      size="lg"
                      fullWidth
                      onClick={() => void stopRoulette(session.id, player.id)}
                    >
                      إيقاف العجلة
                    </Button>
                  </>
                ) : session.rouletteStatus === "spinning" ? (
                  <>
                    <h3 className="text-lg font-bold text-ink">
                      ننتظر اختيار الفائز...
                    </h3>
                    <p className="text-xs text-ink-mute">تابع شاشة العرض.</p>
                  </>
                ) : session.rouletteStatus === "revealed" ? (
                  <>
                    <h3 className="text-lg font-bold text-gold">الجائزة</h3>
                    <p className="text-3xl font-black text-ink">
                      {session.roulettePrize}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-ink-mute">
                    بانتظار المقدم لإطلاق العجلة.
                  </p>
                )}
              </div>
            )}

            {session.status === "active" &&
              session.gameMode === "tarkeeba" &&
              questionStatus === "showing" && (
                <div className="space-y-2 text-center">
                  {session.tarkeebaShowQuestion !== false &&
                    session.tarkeebaQuestionText && (
                      <h2 className="anim-typewriter-rtl rounded-xl border border-neon/25 bg-neon/5 px-3 py-2 text-sm font-extrabold leading-6 text-ink sm:text-base">
                        {session.tarkeebaQuestionText}
                      </h2>
                    )}
                  <div className="flex items-center justify-between rounded-xl border border-gold/25 bg-gold/5 px-3 py-2">
                    <span className="text-xs font-bold text-gold">
                      تركيبة • {session.tarkeebaCategory}
                    </span>
                    <span className="text-xs font-bold text-ink-mute">
                      {Math.max(
                        0,
                        (session.tarkeebaMaxAttempts || 6) -
                          tarkeebaRows.length,
                      )}{" "}
                      محاولات متبقية
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-bold">
                    <span className="rounded-lg border border-neon/25 bg-neon/5 px-2.5 py-1.5 text-neon-bright">
                      ⏱ {secondsLeft} ثانية
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleTarkeebaTimeExtension()}
                      disabled={tarkeebaTimeCooldown > 0 || tarkeebaFinished}
                      className="rounded-lg border border-cyan/35 bg-cyan/10 px-2.5 py-1.5 font-bold text-cyan transition hover:bg-cyan/20 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {tarkeebaTimeCooldown > 0
                        ? `انتظر ${tarkeebaTimeCooldown}ث`
                        : "+30 ثانية"}
                    </button>
                    {session.tarkeebaHint && (
                      <span className="rounded-lg border border-gold/25 bg-gold/5 px-2.5 py-1.5 text-gold">
                        💡 {session.tarkeebaHint}
                      </span>
                    )}
                  </div>
                  {tarkeebaRevealedLetters.length > 0 && (
                    <p className="text-sm font-bold text-success-bright">
                      الحروف المكشوفة: {tarkeebaRevealedLetters.join(" • ")}
                    </p>
                  )}
                  <div className="mx-auto grid w-full max-w-md gap-1" dir="rtl">
                    {Array.from(
                      { length: session.tarkeebaMaxAttempts || 6 },
                      (_, rowIndex) => (
                        <div
                          key={rowIndex}
                          className="grid gap-1"
                          style={{
                            gridTemplateColumns: `repeat(${tarkeebaBoardLength}, minmax(0, 1fr))`,
                          }}
                        >
                          {Array.from({ length: tarkeebaBoardLength }).map(
                            (_, index) => {
                              const row = tarkeebaRows[rowIndex];
                              const letter =
                                row?.letters[index] ||
                                (rowIndex === tarkeebaRows.length
                                  ? tarkeebaGuess[index]
                                  : "");
                              const state = row?.states[index];
                              return (
                                <span
                                  key={index}
                                  className={cn(
                                    "grid h-8 place-items-center rounded-md border font-display text-base font-black sm:h-9 sm:text-lg",
                                    row &&
                                      rowIndex === tarkeebaRows.length - 1 &&
                                      "anim-tarkeeba-letter",
                                    row &&
                                      rowIndex === tarkeebaRows.length - 1 &&
                                      state === "correct" &&
                                      "anim-tarkeeba-correct",
                                    state === "correct"
                                      ? "border-success bg-success text-white"
                                      : state === "present"
                                        ? "border-gold bg-gold text-void"
                                        : state === "absent"
                                          ? "border-line bg-void text-ink-faint"
                                          : "border-line bg-void/40 text-ink",
                                  )}
                                  style={
                                    row && rowIndex === tarkeebaRows.length - 1
                                      ? { animationDelay: `${index * 90}ms` }
                                      : undefined
                                  }
                                >
                                  {letter}
                                </span>
                              );
                            },
                          )}
                        </div>
                      ),
                    )}
                  </div>
                  {tarkeebaFinished ? (
                    <p className="rounded-xl border border-neon/25 bg-neon/5 p-4 text-sm font-bold text-neon-bright">
                      تم تسجيل نتيجتك. انتظر إعلان النتائج.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleRevealTarkeebaLetters()}
                          disabled={wordRevealLifelines <= 0}
                        >
                          💡 إظهار حرفين ({wordRevealLifelines})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleFilterTarkeebaKeyboard()}
                          disabled={
                            wordFilterLifelines <= 0 || tarkeebaFilterActive
                          }
                        >
                          🧹 تعتيم الزائد ({wordFilterLifelines})
                        </Button>
                      </div>
                      <div
                        dir="rtl"
                        className="mx-auto w-full max-w-xl space-y-1"
                      >
                        {ARABIC_KEYBOARD_ROWS.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            className="flex justify-center gap-1"
                          >
                            {row.map((letter) => {
                              const disabled =
                                tarkeebaFilterActive &&
                                !Array.from(
                                  normalizeWordLetter(tarkeebaSecret),
                                ).includes(normalizeWordLetter(letter));
                              return (
                                <button
                                  key={letter}
                                  onClick={() => handleTarkeebaKey(letter)}
                                  disabled={disabled}
                                  className={cn(
                                    "h-8 min-w-6 flex-1 rounded-md border border-line bg-void/50 text-sm font-bold text-ink hover:border-neon/40 sm:h-9 sm:max-w-11",
                                    disabled && "cursor-not-allowed opacity-25",
                                  )}
                                >
                                  {letter}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setTarkeebaGuess((current) => current.slice(0, -1))
                          }
                        >
                          ⌫ مسح
                        </Button>
                        <Button
                          variant="success"
                          onClick={() => void submitTarkeebaGuess()}
                          disabled={
                            tarkeebaGuess.length !==
                            Array.from(tarkeebaSecret).length
                          }
                        >
                          إرسال ✓
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

            {session.status === "active" &&
              session.gameMode === "baathra" &&
              questionStatus === "showing" &&
              prepCountdown === null && (
                <div className="anim-rise space-y-5 text-center">
                  <div>
                    <p className="text-xs font-bold text-cyan">لعبة بعثرة</p>
                    <h2 className="anim-typewriter-rtl mt-2 text-lg font-extrabold text-ink">
                      {session.baathraMode === "requests"
                        ? "كوّن اسماً من الحروف المتاحة"
                        : "رتّب الحروف واكتب الكلمة الصحيحة"}
                    </h2>
                  </div>
                  <div
                    className="flex flex-wrap justify-center gap-2"
                    dir="rtl"
                  >
                    {(session.baathraShuffledLetters || []).map(
                      (letter, index) => (
                        <button
                          key={`${letter}-${index}`}
                          type="button"
                          disabled={
                            session.baathraMode === "requests" ||
                            Boolean(baathraResult)
                          }
                          onClick={() => {
                            const next = `${baathraAnswer}${letter}`;
                            if (
                              canBuildFromLetters(
                                next,
                                session.baathraShuffledLetters || [],
                              )
                            )
                              setBaathraAnswer(next);
                          }}
                          className="anim-option-enter grid h-14 w-14 place-items-center rounded-xl border border-neon/35 bg-neon/10 font-display text-2xl font-black text-neon-bright"
                          style={{ animationDelay: `${index * 70}ms` }}
                        >
                          {letter}
                        </button>
                      ),
                    )}
                  </div>
                  {session.baathraMode === "requests" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(session.baathraRequests || []).map((request, index) =>
                        (session.baathraActiveRequestIndexes || []).includes(
                          index,
                        ) ? (
                          <div
                            key={`${request}-${index}`}
                            className="anim-option-enter rounded-xl border border-line bg-void/35 p-3 text-right"
                            style={{ animationDelay: `${index * 90}ms` }}
                          >
                            <p className="mb-2 text-xs font-extrabold text-cyan">
                              الطلب {index + 1}: {request}
                            </p>
                            <Input
                              value={baathraRequestAnswers[index] || ""}
                              disabled={baathraRequestSubmitted[index]}
                              placeholder="اكتب إجابتك"
                              onChange={(event) => {
                                const next = event.target.value.replace(
                                  /\s/g,
                                  "",
                                );
                                if (
                                  canBuildFromLetters(
                                    next,
                                    session.baathraLetters || [],
                                  )
                                )
                                  setBaathraRequestAnswers((current) =>
                                    current.map((answer, answerIndex) =>
                                      answerIndex === index ? next : answer,
                                    ),
                                  );
                              }}
                            />
                            {Boolean(baathraRequestHints[index]?.length) && (
                              <div className="mt-2 space-y-1 rounded-lg border border-gold/25 bg-gold/5 px-3 py-2">
                                {baathraRequestHints[index].map(
                                  (requestHint, hintIndex) => (
                                    <p
                                      key={`${index}-${hintIndex}`}
                                      className="text-[11px] font-bold text-gold"
                                    >
                                      💡 اسم من {requestHint.wordLength} أحرف:
                                      <span className="mr-2 tracking-[0.2em]">
                                        {requestHint.letters.join(" • ")}
                                      </span>
                                    </p>
                                  ),
                                )}
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              fullWidth
                              className="mt-2"
                              disabled={
                                baathraRequestSubmitted[index] ||
                                !session.baathraNameRoundId ||
                                Number(
                                  player.baathraHintLifelinesRemaining ?? 2,
                                ) <= 0
                              }
                              onClick={() => void handleUseBaathraHint(index)}
                            >
                              💡 كشف بعض الأحرف — متبقي{" "}
                              {player.baathraHintLifelinesRemaining ?? 2}
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                baathraRequestSubmitted[index]
                                  ? "outline"
                                  : "success"
                              }
                              fullWidth
                              className="mt-2"
                              disabled={
                                baathraRequestSubmitted[index] ||
                                !baathraRequestAnswers[index]?.trim()
                              }
                              onClick={() =>
                                void handleSubmitBaathraRequest(index)
                              }
                            >
                              {baathraRequestSubmitted[index]
                                ? baathraRequestAutoApproved[index]
                                  ? "تم قبول الإجابة تلقائياً ✓"
                                  : "تم التسليم — بانتظار تقييم المقدم"
                                : "تسليم الطلب ✓"}
                            </Button>
                          </div>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <>
                      <Input
                        value={baathraAnswer}
                        disabled={Boolean(baathraResult)}
                        placeholder="اكتب الكلمة من الحروف المتاحة"
                        onChange={(event) => {
                          const next = event.target.value.replace(/\s/g, "");
                          if (
                            canBuildFromLetters(
                              next,
                              session.baathraShuffledLetters || [],
                            )
                          )
                            setBaathraAnswer(next);
                        }}
                        className="text-center text-xl font-extrabold"
                      />
                      {baathraSubmitted ? (
                        <div className="rounded-xl border border-cyan/35 bg-cyan/10 p-4 text-sm font-extrabold text-cyan">
                          تم تسجيل إجابتك — بانتظار اعتماد المقدم وإظهار النتائج
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="ghost"
                            onClick={() => setBaathraAnswer("")}
                          >
                            مسح
                          </Button>
                          <Button
                            variant="success"
                            disabled={
                              baathraAnswer.length !==
                              (session.baathraShuffledLetters || []).length
                            }
                            onClick={() => void handleSubmitBaathra()}
                          >
                            إرسال الإجابة ✓
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            {/* ACTIVE */}
            {session.status === "active" && prepCountdown !== null && (
              <div className="anim-rise space-y-4 py-8 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-neon-bright">
                  استعد للسؤال التالي
                </p>
                <div
                  key={prepCountdown}
                  className="anim-count-pop font-display text-8xl font-black text-ink"
                >
                  {prepCountdown}
                </div>
                <p className="text-xs text-ink-mute">
                  سيبدأ العداد فور ظهور السؤال.
                </p>
              </div>
            )}

            {session.status === "active" &&
              prepCountdown === null &&
              session.gameMode === "chairs" && (
                <div className="space-y-5 text-center">
                  {session.chairPhase === "spinning" && (
                    <div className="anim-rise space-y-5 rounded-3xl border border-cyan/35 bg-cyan/10 p-8">
                      <div className="text-6xl anim-float">🪑</div>
                      <h2 className="text-2xl font-black text-cyan">
                        الكراسي تدور...
                      </h2>
                      <p className="text-sm font-bold text-ink-soft">
                        استعد، لا تضغط الآن
                      </p>
                      <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-cyan/15">
                        <div className="h-full w-1/2 animate-pulse bg-cyan" />
                      </div>
                    </div>
                  )}
                  {session.chairPhase === "fake" && (
                    <div className="anim-shake space-y-4 rounded-3xl border border-orange-400/45 bg-orange-400/10 p-8">
                      <p className="text-6xl">⚠️</p>
                      <h2 className="text-2xl font-black text-orange-400">
                        إنذار وهمي!
                      </h2>
                      <p className="text-sm font-bold text-ink-soft">
                        لا تضغط — الكراسي ما زالت تدور.
                      </p>
                    </div>
                  )}
                  {session.chairPhase === "ready" &&
                    questionStatus === "showing" && (
                      <>
                        <div className="anim-shake rounded-2xl border border-success/50 bg-success/15 p-5 shadow-[var(--shadow-success)]">
                          <Armchair className="mx-auto h-12 w-12 text-success" />
                          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.25em] text-success-bright">
                            إشارة الجلوس الحقيقية
                          </p>
                          <h2 className="mt-2 text-2xl font-black text-ink">
                            اجلس بأسرع ما لديك!
                          </h2>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2 text-gold">
                            <Clock className="h-4 w-4" />
                            <span className="font-display text-2xl font-extrabold text-ink">
                              {secondsLeft}
                            </span>
                            <span className="text-xs text-ink-mute">ثانية</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-l from-gold-deep to-gold transition-all duration-1000"
                              style={{
                                width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                        {!player.isActive ? (
                          <div className="rounded-2xl border border-danger/25 bg-danger/5 p-5 text-center">
                            <XCircle className="mx-auto h-9 w-9 text-danger" />
                            <p className="mt-3 text-sm font-bold text-danger-bright">
                              خرجت من اللعبة — تابع النتائج من الشاشة.
                            </p>
                          </div>
                        ) : hasAnswered ? (
                          <div className="anim-rise space-y-3 py-6">
                            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
                            <h4 className="font-bold text-ink">
                              تم تسجيل سرعة جلوسك!
                            </h4>
                            <p className="text-xs text-ink-mute">
                              بانتظار إعلان المقاعد المحجوزة...
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSubmitChair(1)}
                            className="anim-count-pop min-h-44 w-full rounded-3xl border-2 border-success bg-success/25 p-8 text-center shadow-[var(--shadow-success)] transition active:scale-95"
                          >
                            <Armchair className="mx-auto h-16 w-16 text-success-bright" />
                            <span className="mt-4 block text-3xl font-black text-white">
                              اجلـــــــس 🪑!
                            </span>
                          </button>
                        )}
                      </>
                    )}
                  {questionStatus === "revealed" && isCorrect !== null && (
                    <div
                      className={cn(
                        "anim-rise space-y-4 py-6",
                        isCorrect ? "" : "anim-shake",
                      )}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle className="mx-auto h-16 w-16 text-success" />
                          <h3 className="text-xl font-bold text-success-bright">
                            نجحت في حجز كرسيك!
                          </h3>
                          <p className="text-xs text-ink-mute">
                            استعد للجولة التالية.
                          </p>
                        </>
                      ) : (
                        <>
                          <XCircle className="mx-auto h-16 w-16 text-danger" />
                          <h3 className="text-xl font-bold text-danger-bright">
                            لم تحصل على كرسي هذه الجولة
                          </h3>
                          <p className="text-xs text-ink-mute">
                            انتهت مشاركتك في لعبة الكراسي.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

            {session.status === "active" &&
              session.gameMode === "top10" &&
              prepCountdown === null &&
              ["showing", "revealed"].includes(questionStatus) && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-cyan/30 bg-cyan/5 p-4 text-center">
                    <p className="text-[10px] font-bold tracking-[.2em] text-cyan">
                      تحدي TOP 10
                    </p>
                    {(session.top10Rounds || []).length > 1 && (
                      <p className="mt-1 font-display text-xs font-black text-gold">
                        الجولة {(session.top10CurrentRoundIndex ?? 0) + 1} من {(session.top10Rounds || []).length}
                      </p>
                    )}
                    <h2 className="mt-2 text-lg font-black leading-8 text-ink">
                      {session.top10Prompt}
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {(session.top10Items || []).map((item, index) => (
                      <div
                        key={`${item.id}-${item.revealed}`}
                        className={cn(
                          "top10-card-flip flex min-h-24 flex-col items-center justify-center rounded-xl border p-2 text-center",
                          item.revealed
                            ? "border-success/40 bg-success/10"
                            : "border-neon/35 bg-neon/10",
                        )}
                        style={{ animationDelay: `${index * 45}ms` }}
                      >
                        {item.revealed ? (
                          <>
                            <p className="text-sm font-black text-success-bright">
                              {item.answer}
                            </p>
                            <p
                              className="mt-1 max-w-full truncate text-[9px] font-bold"
                              style={{ color: item.foundByColor || "#94a3b8" }}
                            >
                              {item.foundByName || "كشفها المقدم"}
                            </p>
                            {!item.revealedByPresenter && (
                              <p className="mt-1 font-display text-xs font-black text-gold">
                                +{item.points}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="font-display text-3xl font-black text-neon-bright">
                            {index + 1}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {questionStatus === "showing" && (
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void handleSubmitTop10();
                      }}
                    >
                      <Input
                        value={top10Input}
                        onChange={(event) => setTop10Input(event.target.value)}
                        placeholder="اكتب إجابتك بسرعة..."
                        autoComplete="off"
                        className="flex-1 text-base font-bold"
                      />
                      <Button
                        type="submit"
                        variant="success"
                        disabled={!top10Input.trim() || top10Sending}
                      >
                        {top10Sending ? "..." : "إرسال 🚀"}
                      </Button>
                    </form>
                  )}
                  <div className="max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-line bg-void/35 p-3">
                    {top10History.length === 0 ? (
                      <p className="py-3 text-center text-xs text-ink-mute">
                        جرّب أي عدد من الإجابات؛ لا يوجد حد للمحاولات.
                      </p>
                    ) : (
                      top10History.map((attempt, index) => (
                        <div
                          key={`${attempt.text}-${index}`}
                          className={cn(
                            "anim-option-enter rounded-xl border px-3 py-2 text-xs font-bold",
                            attempt.status === "captured"
                              ? "border-success/30 bg-success/10 text-success-bright"
                              : attempt.status === "taken"
                                ? "border-gold/30 bg-gold/10 text-gold"
                                : "border-danger/20 bg-danger/5 text-danger-bright",
                          )}
                        >
                          {attempt.status === "captured"
                            ? `✅ بطل! اكتشفت: ${attempt.matchedAnswer} (+${attempt.points})`
                            : attempt.status === "taken"
                              ? `⚠️ صحيحة، لكن سبقك عليها متسابق آخر: ${attempt.matchedAnswer}`
                              : `❌ ${attempt.text} — غير موجودة في القائمة`}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

            {session.status === "active" &&
              prepCountdown === null &&
              session.gameMode !== "chairs" &&
              session.gameMode !== "top10" &&
              currentQuestion && (
                <div className="space-y-5">
                  {questionStatus === "showing" && (
                    <>
                      {session.gameMode === "money" &&
                        session.moneyBoard?.find(
                          (cell) => cell.id === session.moneyCurrentCellId,
                        ) && (
                          <div className="anim-count-pop mx-auto flex w-fit items-center gap-3 rounded-xl border border-gold/40 bg-gold/15 px-4 py-2 font-black text-gold">
                            <span>
                              {
                                session.moneyBoard.find(
                                  (cell) =>
                                    cell.id === session.moneyCurrentCellId,
                                )?.category
                              }
                            </span>
                            <span className="font-display text-xl">
                              {
                                session.moneyBoard.find(
                                  (cell) =>
                                    cell.id === session.moneyCurrentCellId,
                                )?.value
                              }
                            </span>
                          </div>
                        )}
                      <div className="rounded-2xl border border-neon/25 bg-neon/5 px-4 py-5 text-center shadow-[var(--shadow-neon-soft)]">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-neon-bright">
                          السؤال
                        </p>
                        <h2
                          key={currentQuestion.id}
                          className="anim-typewriter-rtl text-base font-extrabold leading-8 text-ink sm:text-lg"
                        >
                          {currentQuestion.questionText}
                        </h2>
                        {currentQuestion.questionType === "image" &&
                          currentQuestion.imageUrl && (
                            <div
                              className="relative mx-auto mt-4 aspect-video max-h-52 max-w-full overflow-hidden rounded-xl border border-white/10"
                              style={{ width: "min(100%, 420px)" }}
                            >
                              <img
                                src={currentQuestion.imageUrl}
                                alt="صورة السؤال"
                                className="h-full w-full bg-white object-contain"
                              />
                              {session.gameMode === "image-reveal" && (
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
                      </div>

                      {/* Neon timer */}
                      {session.practiceQuestion ? (
                        <div className="rounded-full border border-gold/35 bg-gold/10 px-4 py-2 text-center text-sm font-black text-gold">
                          🧪 سؤال تجريبي · الوقت مفتوح · بدون نقاط
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex items-center gap-2 text-neon-bright">
                            <Clock
                              className={cn(
                                "h-4 w-4",
                                secondsLeft <= 5 &&
                                  "anim-pulse-neon text-danger-bright",
                              )}
                            />
                            <span
                              className={cn(
                                "font-display text-2xl font-extrabold tabular",
                                secondsLeft <= 5
                                  ? "text-danger-bright"
                                  : "text-ink",
                              )}
                            >
                              {secondsLeft}
                            </span>
                            <span className="text-xs text-ink-mute">ثانية</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-1000 ease-linear",
                                secondsLeft <= 5
                                  ? "bg-danger"
                                  : "bg-gradient-to-l from-neon-deep to-neon",
                              )}
                              style={{
                                width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {session.gameMode === "word" ? (
                        <div className="space-y-5">
                          <div className="rounded-2xl border border-cyan/25 bg-cyan/5 px-4 py-3 text-center">
                            <p className="text-[10px] font-bold text-ink-mute">
                              المحاولات المتبقية
                            </p>
                            <p className="mt-2 text-xl tracking-widest">
                              {"❤️".repeat(Math.max(0, wordLives))}
                            </p>
                          </div>
                          {wordOutcome === "won" ? (
                            <div className="anim-rise rounded-2xl border border-success/35 bg-success/10 p-7 text-center">
                              <CheckCircle className="mx-auto h-12 w-12 text-success" />
                              <h4 className="mt-3 text-xl font-black text-success-bright">
                                أحسنت! اكتشفت الكلمة
                              </h4>
                              <p className="mt-2 font-display text-lg font-black text-gold">
                                {wordWinSeconds?.toFixed(2)} ثانية
                              </p>
                              <p className="mt-2 text-xs text-ink-mute">
                                تم تسجيل وقتك. انتظر كشف النتيجة للجميع.
                              </p>
                            </div>
                          ) : wordOutcome === "lost" ? (
                            <div className="anim-shake rounded-2xl border border-danger/35 bg-danger/10 p-7 text-center">
                              <XCircle className="mx-auto h-12 w-12 text-danger" />
                              <h4 className="mt-3 text-xl font-black text-danger-bright">
                                انتهت محاولاتك
                              </h4>
                              <p className="mt-2 text-xs text-ink-mute">
                                تابع النتيجة عند كشف الكلمة.
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="flex min-h-20 flex-wrap justify-center gap-2 rounded-2xl border border-neon/25 bg-neon/5 p-4">
                                {wordMask}
                              </div>
                              <p className="text-center text-xs text-ink-mute">
                                اختر حرفاً لكشف الكلمة. الحرف الصحيح يضيء
                                بالأخضر.
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={wordRevealLifelines <= 0}
                                  onClick={() => void handleRevealWordLetters()}
                                >
                                  💡 إظهار حرفين ({wordRevealLifelines})
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    wordFilterLifelines <= 0 || wordFilterActive
                                  }
                                  onClick={() =>
                                    void handleFilterWordKeyboard()
                                  }
                                >
                                  🧹 تعتيم الحروف الزائدة ({wordFilterLifelines}
                                  )
                                </Button>
                              </div>
                              <div dir="rtl" className="space-y-2">
                                {ARABIC_KEYBOARD_ROWS.map((row, rowIndex) => (
                                  <div
                                    key={rowIndex}
                                    className="flex justify-center gap-1.5 sm:gap-2"
                                  >
                                    {row.map((letter) => {
                                      const normalized =
                                        normalizeWordLetter(letter);
                                      const correct =
                                        wordGuesses.includes(normalized);
                                      const wrong =
                                        wordMisses.includes(normalized);
                                      const irrelevant =
                                        wordFilterActive &&
                                        !wordAnswerLetters.has(normalized);
                                      return (
                                        <button
                                          key={letter}
                                          type="button"
                                          onClick={() =>
                                            handleGuessWordLetter(letter)
                                          }
                                          disabled={
                                            correct || wrong || irrelevant
                                          }
                                          className={cn(
                                            "grid h-10 min-w-8 flex-1 place-items-center rounded-lg border font-display text-lg font-black transition active:scale-95 disabled:cursor-not-allowed sm:h-12 sm:max-w-12",
                                            correct
                                              ? "border-success/45 bg-success/15 text-success-bright"
                                              : wrong
                                                ? "border-danger/30 bg-danger/10 text-danger-bright opacity-60"
                                                : irrelevant
                                                  ? "border-line bg-void/20 text-ink-faint opacity-35"
                                                  : "border-line bg-void/50 text-ink hover:border-neon/50 hover:bg-neon/10 hover:text-neon-bright",
                                          )}
                                        >
                                          {letter}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      ) : hasAnswered ? (
                        <div className="anim-rise space-y-3 py-8 text-center">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
                          <h4 className="font-bold text-ink">
                            شكرًا، تم تسجيل إجابتك!
                          </h4>
                          <p className="text-xs text-ink-mute">
                            بانتظار إجابات المتسابقين الآخرين أو انتهاء الوقت...
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {[1, 2, 3, 4].map((optNum) => {
                            const optionVal = (currentQuestion as any)[
                              `option${optNum}`
                            ];
                            if (!optionVal || hiddenOptions.includes(optNum))
                              return null;
                            const optionTone = [
                              "border-cyan bg-cyan/70 hover:bg-cyan/90 hover:shadow-[var(--shadow-cyan)]",
                              "border-neon bg-neon/70 hover:bg-neon/90 hover:shadow-[var(--shadow-neon)]",
                              "border-gold bg-gold/70 hover:bg-gold/90 hover:shadow-[var(--shadow-gold)]",
                              "border-pink-400 bg-pink-500/70 hover:bg-pink-500/90 hover:shadow-[0_0_20px_rgba(236,72,153,0.45)]",
                            ][optNum - 1];
                            return (
                              <button
                                key={optNum}
                                onClick={() => handleSubmitAnswer(optNum)}
                                disabled={
                                  session.gameMode === "image-reveal" &&
                                  !session.imageRevealStartedAt
                                }
                                className={cn(
                                  "anim-option-enter group flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border p-5 text-center transition-all active:scale-95 sm:min-h-32",
                                  optionTone,
                                  "disabled:cursor-not-allowed disabled:opacity-40",
                                )}
                                style={{
                                  animationDelay: `${(optNum - 1) * 55}ms`,
                                }}
                              >
                                <span
                                  className={cn(
                                    "text-lg font-black leading-8 drop-shadow-md sm:text-xl",
                                    optNum === 1 || optNum === 3
                                      ? "text-void"
                                      : "text-white",
                                  )}
                                >
                                  {optionVal}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* REVEAL */}
                  {questionStatus === "revealed" && isCorrect !== null && (
                    <div
                      className={cn(
                        "anim-rise space-y-4 py-6 text-center",
                        isCorrect ? "" : "anim-shake",
                      )}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle className="anim-count-pop mx-auto h-16 w-16 text-success" />
                          <h3 className="text-xl font-bold text-success-bright">
                            إجابة صحيحة!
                          </h3>
                        </>
                      ) : (
                        <>
                          <XCircle className="anim-count-pop mx-auto h-16 w-16 text-danger" />
                          <h3 className="text-xl font-bold text-danger-bright">
                            {session.gameMode === "survival" && !player.isActive
                              ? "تم القبض عليك! أنت خارج الزنزانة"
                              : "إجابة خاطئة!"}
                          </h3>
                        </>
                      )}
                      {session.gameMode === "money" &&
                        (() => {
                          const cell = session.moneyBoard?.find(
                            (item) => item.id === session.moneyCurrentCellId,
                          );
                          if (!cell) return null;
                          const gained = session.roundWinners?.some(
                            (winner) => winner.playerId === player.id,
                          );
                          const label =
                            chosenOption === null
                              ? "لم تُسجل إجابة • لا زيادة ولا خصم"
                              : gained
                                ? `+${cell.value}`
                                : isCorrect
                                  ? "إجابة صحيحة، والمبلغ للأسرع"
                                  : `−${cell.value}`;
                          return (
                            <p
                              className={cn(
                                "anim-count-pop font-display text-2xl font-black",
                                gained
                                  ? "text-success-bright"
                                  : chosenOption === null || isCorrect
                                    ? "text-gold"
                                    : "text-danger-bright",
                              )}
                            >
                              {label}
                            </p>
                          );
                        })()}
                      <p className="text-xs text-ink-mute">
                        بانتظار المقدم لإطلاق السؤال التالي...
                      </p>
                    </div>
                  )}
                </div>
              )}

            {/* FINISHED */}
            {session.status === "finished" && (
              <div className="anim-rise space-y-5 text-center">
                <Trophy className="anim-float mx-auto h-12 w-12 text-gold" />
                <h3 className="text-xl font-bold text-ink">انتهت المسابقة!</h3>
                <p className="text-xs text-ink-mute">
                  هذه نتائجك النهائية وترتيب المسابقة.
                </p>
                {session.teamsEnabled && playerTeamStandings.length > 0 && (
                  <div className="rounded-2xl border border-neon/25 bg-neon/5 p-4 text-right">
                    <p className="mb-3 text-xs font-bold text-neon-bright">
                      نتائج الفرق
                    </p>
                    <div className="space-y-2">
                      {playerTeamStandings.map((team, index) => (
                        <div
                          key={team.id}
                          className="flex items-center justify-between rounded-xl border border-line bg-void/40 px-3 py-2.5"
                        >
                          <span
                            className="text-xs font-bold"
                            style={{ color: team.color }}
                          >
                            #{index + 1} {team.label}
                          </span>
                          <span
                            className="font-display text-sm font-black"
                            style={{ color: team.color }}
                          >
                            {team.score} نقطة
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-2xl border border-gold/25 bg-gold/5 p-4 text-right">
                  <p className="mb-3 text-xs font-bold text-gold">
                    الترتيب الفردي النهائي
                  </p>
                  <div className="max-h-52 space-y-2 overflow-y-auto">
                    {individualStandings.map((standing, index) => (
                      <div
                        key={standing.id}
                        className={cn(
                          "flex items-center justify-between rounded-xl border px-3 py-2.5",
                          standing.id === player.id
                            ? "border-gold/40 bg-gold/10"
                            : "border-line bg-void/40",
                        )}
                      >
                        <span
                          className="truncate text-xs font-bold"
                          style={{ color: standing.color }}
                        >
                          #{index + 1} {standing.name}
                          {standing.id === player.id && " (أنت)"}
                        </span>
                        <span className="font-display text-sm font-black text-gold">
                          {standing.score} نقطة
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Scoreboard overlay */}
          {session.showScoreboard && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/80 p-6 pt-16 backdrop-blur-md sm:pt-20">
              <div className="glass-strong w-full max-w-sm space-y-4 rounded-[var(--radius-card)] p-6 text-center shadow-[var(--shadow-neon-strong)]">
                <Trophy className="anim-float mx-auto h-10 w-10 text-gold" />
                <h3 className="text-lg font-bold text-gradient-gold">
                  الترتيب المؤقت
                </h3>
                <p className="text-xs text-ink-mute">
                  سيختفي الترتيب تلقائياً خلال ثوانٍ...
                </p>
                <div className="rounded-xl border border-gold/25 bg-gold/10 py-3 font-display text-lg font-extrabold text-gold">
                  {player.score} نقطة
                </div>
              </div>
            </div>
          )}

          {showRoundResults &&
            session.questionStatus === "revealed" &&
            (currentQuestion ||
              ["tarkeeba", "baathra", "top10"].includes(
                session.gameMode || "",
              )) &&
            session.gameMode !== "chairs" && (
              <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-void/85 p-5 pt-16 text-center backdrop-blur-md sm:pt-20">
                <div
                  className={cn(
                    "anim-rise w-full max-w-md space-y-5 rounded-[var(--radius-card)] border bg-void-2 p-6 shadow-[var(--shadow-neon-strong)]",
                    session.gameMode === "baathra" &&
                      session.baathraMode === "requests"
                      ? (session.baathraRequestResults?.find(
                          (result) => result.playerId === player.id,
                        )?.approved || 0) > 0
                        ? "winner-celebration border-success/30"
                        : "border-danger/35"
                      : session.roundWinners?.length
                        ? "winner-celebration border-success/30"
                        : "border-danger/35",
                  )}
                >
                  <p
                    className={cn(
                      "text-2xl font-black",
                      session.gameMode === "baathra" &&
                        session.baathraMode === "requests"
                        ? (session.baathraRequestResults?.find(
                            (result) => result.playerId === player.id,
                          )?.approved || 0) > 0
                          ? "text-gradient-gold"
                          : "text-danger-bright"
                        : session.roundWinners?.length
                          ? "text-gradient-gold"
                          : "text-ink-mute",
                    )}
                  >
                    {session.gameMode === "baathra" &&
                    session.baathraMode === "requests"
                      ? (session.baathraRequestResults?.find(
                          (result) => result.playerId === player.id,
                        )?.approved || 0) > 0
                        ? "إجابة صحيحة ✓"
                        : "إجابة خاطئة ✕"
                      : session.gameMode === "top10"
                        ? "نتائج TOP 10"
                        : session.roundWinners?.length
                          ? "الفائزون"
                          : "لم يكتشف أحد الإجابة الصحيحة"}
                  </p>
                  {session.gameMode === "baathra" &&
                  session.baathraMode === "requests" ? (
                    <div className="rounded-2xl border border-line bg-white/5 p-4">
                      <p className="text-sm font-bold text-success-bright">
                        الإجابات المقبولة:{" "}
                        {session.baathraRequestResults?.find(
                          (result) => result.playerId === player.id,
                        )?.approved || 0}
                      </p>
                      <p className="mt-2 text-sm font-bold text-danger-bright">
                        الإجابات الخاطئة:{" "}
                        {session.baathraRequestResults?.find(
                          (result) => result.playerId === player.id,
                        )?.rejected || 0}
                      </p>
                    </div>
                  ) : !session.roundWinners?.length ? (
                    <div className="anim-count-pop text-7xl font-black text-danger-bright">
                      ✕
                    </div>
                  ) : null}
                  {!(
                    session.gameMode === "baathra" &&
                    session.baathraMode === "requests"
                  ) && (
                    <div>
                      <p className="text-xs text-ink-mute">الإجابة الصحيحة</p>
                      <p className="mt-1 text-2xl font-black text-success-bright">
                        {session.gameMode === "tarkeeba"
                          ? decodeWordSecret(session.tarkeebaSecret)
                          : session.gameMode === "baathra"
                            ? decodeWordSecret(session.baathraSecret)
                            : session.gameMode === "top10"
                              ? `تم اكتشاف ${(session.top10Items || []).filter((item) => item.foundById).length} من 10`
                              : session.gameMode === "word"
                                ? decodeWordSecret(currentQuestion?.wordSecret)
                                : (currentQuestion as any)[
                                    `option${session.revealedCorrectOption}`
                                  ]}
                      </p>
                    </div>
                  )}
                  {session.gameMode === "baathra" &&
                    session.baathraMode === "requests" &&
                    Boolean(session.baathraRequestResults?.length) && (
                      <div className="space-y-2 text-right">
                        <p className="text-center text-xs font-bold text-ink-mute">
                          نتائج المتسابقين
                        </p>
                        {session.baathraRequestResults?.map((result) => (
                          <div
                            key={result.playerId}
                            className="flex items-center justify-between rounded-xl border border-line bg-white/5 px-3 py-2"
                          >
                            <span
                              className="truncate text-sm font-bold"
                              style={{ color: result.color }}
                            >
                              {result.name}
                            </span>
                            <span
                              className={cn(
                                "text-xs font-black",
                                result.approved > 0
                                  ? "text-success-bright"
                                  : "text-danger-bright",
                              )}
                            >
                              {result.approved > 0
                                ? `✓ ${result.approved} صحيحة${result.speedBonus ? " • ⚡ +1 سرعة" : ""}`
                                : "✕ خاطئة"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  {session.roundWinners?.length ? (
                    <div className="grid grid-cols-3 gap-2">
                      {session.roundWinners.map((winner, index) => (
                        <div
                          key={winner.playerId}
                          className="anim-winner-card rounded-2xl border border-line bg-white/5 p-3"
                          style={{ animationDelay: `${index * 90}ms` }}
                        >
                          <p className="font-display text-sm text-gold">
                            #{index + 1}
                          </p>
                          <p
                            className="mt-1 truncate text-xs font-bold"
                            style={{ color: winner.color }}
                          >
                            {winner.name}
                          </p>
                          <p className="mt-2 text-[10px] font-bold text-success-bright">
                            +{winner.scoreAdded}{" "}
                            {session.gameMode === "money" ? "مبلغ" : "نقطة"}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm font-bold text-danger-bright">
                      لم يسجل أحد إجابة صحيحة هذه الجولة.
                    </p>
                  )}
                  <p className="text-[10px] text-ink-faint">
                    ستعود الشاشة تلقائياً خلال لحظات
                  </p>
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
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center text-ink-mute">
          جاري التحميل...
        </div>
      }
    >
      <PlayerPageContent />
    </Suspense>
  );
}
