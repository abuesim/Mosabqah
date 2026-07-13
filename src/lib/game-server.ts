import "server-only";

import { adminDb } from "@/lib/firebase-admin";

export async function revealAndScoreBaathraRequestsRound(
  sessionId: string,
  questionId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      session?.gameMode !== "baathra" ||
      session?.baathraMode !== "requests" ||
      session?.currentQuestionId !== questionId ||
      session?.questionStatus !== "showing"
    )
      return { revealed: false };

    const answersQuery = sessionRef
      .collection("answers")
      .where("questionId", "==", questionId);
    const answersSnap = await transaction.get(answersQuery);
    const answers = answersSnap.docs.map((answer) => answer.data());
    const pendingCount = answers.filter(
      (answer) => answer.reviewStatus === "pending",
    ).length;
    if (pendingCount > 0) return { revealed: false, pendingCount };

    const playerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    const playerSnaps = await Promise.all(
      playerIds.map((playerId) =>
        transaction.get(sessionRef.collection("players").doc(playerId)),
      ),
    );
    const requests: string[] = Array.isArray(session.baathraRequests)
      ? session.baathraRequests
      : [];
    const activeRequestIndexes: number[] = Array.isArray(
      session.baathraActiveRequestIndexes,
    )
      ? session.baathraActiveRequestIndexes.map(Number)
      : [];
    const requiredCorrectAnswers = Math.max(1, activeRequestIndexes.length);

    const requestResults = playerSnaps
      .filter((playerSnap) => playerSnap.exists)
      .map((playerSnap) => {
        const player = playerSnap.data() || {};
        const playerAnswers = answers.filter(
          (answer) => String(answer.playerId) === playerSnap.id,
        );
        const approved = playerAnswers.filter(
          (answer) => answer.reviewStatus === "approved",
        ).length;
        const rejected = playerAnswers.filter(
          (answer) => answer.reviewStatus === "rejected",
        ).length;
        return {
          playerId: playerSnap.id,
          name: String(player.name || "متسابق"),
          color: String(player.color || "#a855f7"),
          approved,
          rejected,
          total: playerAnswers.length,
          completionTime: playerAnswers.length
            ? Math.max(
                ...playerAnswers.map((answer) =>
                  Math.max(0, Number(answer.timeSpent) || 0),
                ),
              )
            : Number.POSITIVE_INFINITY,
          speedBonus: 0,
          answers: playerAnswers.map((answer) => {
            const requestIndex = Number(answer.baathraRequestIndex) || 0;
            return {
              request: requests[requestIndex] || "اسم",
              value: String(answer.baathraTextAnswer || ""),
              approved: answer.reviewStatus === "approved",
            };
          }),
        };
      })
      .filter((result) => result.total > 0);

    const fastestPerfect = requestResults
      .filter(
        (result) =>
          result.approved === requiredCorrectAnswers && result.rejected === 0,
      )
      .sort((first, second) => first.completionTime - second.completionTime)[0];
    if (fastestPerfect) {
      fastestPerfect.speedBonus = 1;
      const fastestPlayer = playerSnaps.find(
        (playerSnap) => playerSnap.id === fastestPerfect.playerId,
      );
      if (fastestPlayer?.exists) {
        const player = fastestPlayer.data() || {};
        transaction.update(fastestPlayer.ref, {
          score: Number(player.score || 0) + 1,
        });
      }
    }

    const winners = [...requestResults]
      .filter((result) => result.approved > 0)
      .sort(
        (first, second) =>
          second.approved +
            second.speedBonus -
            (first.approved + first.speedBonus) ||
          first.rejected - second.rejected ||
          first.completionTime - second.completionTime,
      )
      .slice(0, 3)
      .map((result) => ({
        playerId: result.playerId,
        name: result.name,
        color: result.color,
        scoreAdded: result.approved + result.speedBonus,
        timeSpent: Number.isFinite(result.completionTime)
          ? result.completionTime
          : 0,
      }));

    transaction.update(sessionRef, {
      questionStatus: "revealed",
      roundWinners: winners,
      baathraRequestResults: requestResults.map((result) => ({
        ...result,
        completionTime: Number.isFinite(result.completionTime)
          ? result.completionTime
          : 0,
      })),
      baathraUsedRounds: [
        ...(Array.isArray(session.baathraUsedRounds)
          ? session.baathraUsedRounds.filter(
              (round) => round?.roundId !== questionId,
            )
          : []),
        {
          roundId: questionId,
          mode: "requests",
          label:
            Number(session.baathraNameRoundId) > 0
              ? `جولة الأسماء ${Number(session.baathraNameRoundId)}`
              : "حروف مخصصة",
          letters: Array.isArray(session.baathraLetters)
            ? session.baathraLetters
            : [],
          ...(Number(session.baathraNameRoundId) > 0
            ? { nameRoundId: Number(session.baathraNameRoundId) }
            : {}),
        },
      ],
    });
    return { revealed: true, speedBonusPlayerId: fastestPerfect?.playerId };
  });
}

/**
 * Idempotently closes a Baathra speed round. "first" rewards only the first
 * correct submission; "ranked" keeps accepting answers until the round ends.
 */
export async function revealAndScoreBaathraRound(
  sessionId: string,
  questionId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      session?.gameMode !== "baathra" ||
      session?.baathraMode === "requests" ||
      session?.currentQuestionId !== questionId ||
      session?.questionStatus !== "showing"
    )
      return { revealed: false };

    const answersQuery = sessionRef
      .collection("answers")
      .where("questionId", "==", questionId);
    const answersSnap = await transaction.get(answersQuery);
    const correctAnswers = answersSnap.docs
      .map((answer) => answer.data())
      .filter((answer) => answer.isCorrect === true)
      .sort(
        (first, second) =>
          (Number(first.baathraRank) || 999) -
            (Number(second.baathraRank) || 999) ||
          (Number(first.timeSpent) || 0) - (Number(second.timeSpent) || 0),
      );
    const scoringAnswers =
      session.baathraScoring === "first"
        ? correctAnswers.slice(0, 1)
        : correctAnswers;
    const playerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    const playerRefs = playerIds.map((playerId) =>
      sessionRef.collection("players").doc(playerId),
    );
    const playerSnaps = await Promise.all(
      playerRefs.map((playerRef) => transaction.get(playerRef)),
    );
    const answerByPlayer = new Map(
      scoringAnswers.map((answer) => [String(answer.playerId), answer]),
    );
    const roundWinners: Array<{
      playerId: string;
      name: string;
      color: string;
      scoreAdded: number;
      timeSpent: number;
    }> = [];

    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data() || {};
      const answer = answerByPlayer.get(playerSnap.id);
      if (!answer) {
        transaction.update(playerSnap.ref, { streak: 0 });
        return;
      }
      const rank = Math.max(1, Number(answer.baathraRank) || 1);
      const scoreAdded =
        session.baathraScoring === "first"
          ? 3
          : rank === 1
            ? 3
            : rank === 2
              ? 2
              : 1;
      transaction.update(playerSnap.ref, {
        score: Number(player.score || 0) + scoreAdded,
        streak: Number(player.streak || 0) + 1,
      });
      roundWinners.push({
        playerId: playerSnap.id,
        name: String(player.name || "متسابق"),
        color: String(player.color || "#a855f7"),
        scoreAdded,
        timeSpent: Math.max(0, Number(answer.timeSpent) || 0),
      });
    });

    transaction.update(sessionRef, {
      questionStatus: "revealed",
      roundWinners: roundWinners
        .sort((first, second) => first.timeSpent - second.timeSpent)
        .slice(0, session.baathraScoring === "first" ? 1 : 3),
      baathraUsedRounds: [
        ...(Array.isArray(session.baathraUsedRounds)
          ? session.baathraUsedRounds.filter(
              (round) => round?.roundId !== questionId,
            )
          : []),
        {
          roundId: questionId,
          mode: "speed",
          label: "كتابة سريعة",
          letters: Array.isArray(session.baathraShuffledLetters)
            ? session.baathraShuffledLetters
            : [],
        },
      ],
    });
    return { revealed: true };
  });
}

/**
 * Idempotently reveals a question and scores every contestant who was present
 * when it started. The transaction makes repeated timeout/manual requests safe.
 */
export async function revealAndScoreQuestion(
  sessionId: string,
  questionId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      session?.currentQuestionId !== questionId ||
      session?.questionStatus !== "showing"
    ) {
      return { revealed: false };
    }

    const questionRef = db.collection("questions").doc(questionId);
    const answersQuery = sessionRef
      .collection("answers")
      .where("questionId", "==", questionId);
    const [questionSnap, answersSnap] = await Promise.all([
      transaction.get(questionRef),
      transaction.get(answersQuery),
    ]);
    if (!questionSnap.exists) throw new Error("QUESTION_NOT_FOUND");

    const isPractice = session.practiceQuestion === true;
    const playerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    const playerRefs = playerIds.map((playerId) =>
      sessionRef.collection("players").doc(playerId),
    );
    const playerSnaps = await Promise.all(
      playerRefs.map((playerRef) => transaction.get(playerRef)),
    );
    const answersByPlayer = new Map<
      string,
      { isCorrect?: boolean; timeSpent?: number }
    >();
    answersSnap.docs.forEach((answer) => {
      const data = answer.data();
      if (!answersByPlayer.has(data.playerId))
        answersByPlayer.set(data.playerId, data);
    });
    if (isPractice)
      answersSnap.docs.forEach((answer) => transaction.delete(answer.ref));

    const duration = Number(session.timerDuration) || 30;
    const roundWinners: Array<{
      playerId: string;
      name: string;
      color: string;
      scoreAdded: number;
      timeSpent: number;
    }> = [];
    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data();
      const answer = answersByPlayer.get(playerSnap.id);
      if (answer?.isCorrect) {
        // One point per remaining second: a 45s question answered at 5s = 40 points.
        const timeSpent = Math.max(0, Number(answer.timeSpent) || 0);
        const scoreAdded = Math.max(0, Math.ceil(duration - timeSpent));
        if (!isPractice)
          transaction.update(playerSnap.ref, {
            score: (player?.score || 0) + scoreAdded,
            streak: (player?.streak || 0) + 1,
          });
        roundWinners.push({
          playerId: playerSnap.id,
          name: String(player?.name || "متسابق"),
          color: String(player?.color || "#a855f7"),
          scoreAdded: isPractice ? 0 : scoreAdded,
          timeSpent,
        });
      } else if (!isPractice) {
        // Missing answers are intentionally scored as incorrect.
        transaction.update(
          playerSnap.ref,
          session.gameMode === "survival"
            ? { streak: 0, isActive: false }
            : { streak: 0 },
        );
      }
    });

    transaction.update(sessionRef, {
      questionStatus: "revealed",
      revealedCorrectOption: questionSnap.data()!.correctOption,
      roundWinners: roundWinners
        .sort((a, b) => a.timeSpent - b.timeSpent)
        .slice(0, 3),
      practiceQuestion: false,
    });
    return { revealed: true };
  });
}

/**
 * Closes one «فلوسك على المحك» cell. Correct answers gain the cell value,
 * wrong submitted answers lose it, and contestants who did not answer remain
 * unchanged. In fastest mode only the first correct contestant gains money.
 */
export async function revealAndScoreMoneyQuestion(
  sessionId: string,
  questionId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      session?.gameMode !== "money" ||
      session?.currentQuestionId !== questionId ||
      session?.questionStatus !== "showing"
    )
      return { revealed: false };

    const board: Array<{
      id: string;
      questionId: string;
      category: string;
      value: number;
      status: "available" | "open" | "used";
      isDouble?: boolean;
    }> = Array.isArray(session.moneyBoard) ? session.moneyBoard : [];
    const cell = board.find(
      (item) =>
        item.questionId === questionId &&
        (item.id === session.moneyCurrentCellId || item.status === "open"),
    );
    if (!cell) throw new Error("MONEY_CELL_NOT_FOUND");

    const [questionSnap, answersSnap] = await Promise.all([
      transaction.get(db.collection("questions").doc(questionId)),
      transaction.get(
        sessionRef.collection("answers").where("questionId", "==", questionId),
      ),
    ]);
    if (!questionSnap.exists) throw new Error("QUESTION_NOT_FOUND");

    const answers = answersSnap.docs
      .map((answer) => answer.data())
      .sort(
        (first, second) =>
          (Number(first.timeSpent) || 0) - (Number(second.timeSpent) || 0),
      );
    const firstCorrectPlayerId = answers.find(
      (answer) => answer.isCorrect === true,
    )?.playerId;
    const answersByPlayer = new Map<string, (typeof answers)[number]>();
    answers.forEach((answer) => {
      if (!answersByPlayer.has(String(answer.playerId)))
        answersByPlayer.set(String(answer.playerId), answer);
    });

    const playerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    const playerSnaps = await Promise.all(
      playerIds.map((playerId) =>
        transaction.get(sessionRef.collection("players").doc(playerId)),
      ),
    );
    const value = Math.max(0, Number(cell.value) || 0);
    const winners: Array<{
      playerId: string;
      name: string;
      color: string;
      scoreAdded: number;
      timeSpent: number;
    }> = [];

    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data() || {};
      const answer = answersByPlayer.get(playerSnap.id);
      if (!answer) return;
      const winsMoney =
        answer.isCorrect === true &&
        (session.moneyScoring !== "fastest" ||
          playerSnap.id === firstCorrectPlayerId);
      const delta = winsMoney ? value : answer.isCorrect === false ? -value : 0;
      if (delta !== 0)
        transaction.update(playerSnap.ref, {
          score: Number(player.score || 0) + delta,
          streak: winsMoney ? Number(player.streak || 0) + 1 : 0,
        });
      if (winsMoney)
        winners.push({
          playerId: playerSnap.id,
          name: String(player.name || "متسابق"),
          color: String(player.color || "#a855f7"),
          scoreAdded: value,
          timeSpent: Math.max(0, Number(answer.timeSpent) || 0),
        });
    });

    transaction.update(sessionRef, {
      questionStatus: "revealed",
      revealedCorrectOption: questionSnap.data()!.correctOption,
      roundWinners: winners
        .sort((first, second) => first.timeSpent - second.timeSpent)
        .slice(0, 3),
      moneyBoard: board.map((item) =>
        item.id === cell.id ? { ...item, status: "used" as const } : item,
      ),
    });
    return { revealed: true, value };
  });
}

/**
 * Resolves one musical-chairs round. A chair belongs to the first contestant
 * who selected its number; duplicate and missing selections are eliminated.
 */
export async function revealAndScoreChairRound(
  sessionId: string,
  roundId: string,
) {
  const db = adminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      session?.gameMode !== "chairs" ||
      session?.currentQuestionId !== roundId ||
      session?.questionStatus !== "showing"
    ) {
      return { revealed: false };
    }

    const playerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    const answersQuery = sessionRef
      .collection("answers")
      .where("questionId", "==", roundId);
    const [answersSnap, ...playerSnaps] = await Promise.all([
      transaction.get(answersQuery),
      ...playerIds.map((playerId) =>
        transaction.get(sessionRef.collection("players").doc(playerId)),
      ),
    ]);
    const answersByPlayer = new Map<
      string,
      { isCorrect?: boolean; timeSpent?: number }
    >();
    answersSnap.docs.forEach((answer) => {
      const data = answer.data();
      if (!answersByPlayer.has(data.playerId))
        answersByPlayer.set(data.playerId, data);
    });

    const chairResults: Record<string, "safe" | "out"> = {};
    const roundWinners: Array<{
      playerId: string;
      name: string;
      color: string;
      scoreAdded: number;
      timeSpent: number;
    }> = [];
    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data();
      const safe = answersByPlayer.get(playerSnap.id)?.isCorrect === true;
      chairResults[playerSnap.id] = safe ? "safe" : "out";
      if (safe)
        roundWinners.push({
          playerId: playerSnap.id,
          name: String(player?.name || "متسابق"),
          color: String(player?.color || "#a855f7"),
          scoreAdded: 100,
          timeSpent: Number(answersByPlayer.get(playerSnap.id)?.timeSpent) || 0,
        });
      transaction.update(
        playerSnap.ref,
        safe
          ? {
              score: (player?.score || 0) + 100,
              streak: (player?.streak || 0) + 1,
              isActive: true,
            }
          : { streak: 0, isActive: false },
      );
    });

    transaction.update(sessionRef, {
      questionStatus: "revealed",
      chairPhase: "revealed",
      chairResults,
      roundWinners: roundWinners.sort((a, b) => a.timeSpent - b.timeSpent),
    });
    return { revealed: true };
  });
}
