import 'server-only';

import { adminDb } from '@/lib/firebase-admin';

/**
 * Idempotently reveals a question and scores every contestant who was present
 * when it started. The transaction makes repeated timeout/manual requests safe.
 */
export async function revealAndScoreQuestion(sessionId: string, questionId: string) {
  const db = adminDb();
  const sessionRef = db.collection('sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (!sessionSnap.exists || session?.currentQuestionId !== questionId || session?.questionStatus !== 'showing') {
      return { revealed: false };
    }

    const questionRef = db.collection('questions').doc(questionId);
    const answersQuery = sessionRef.collection('answers').where('questionId', '==', questionId);
    const [questionSnap, answersSnap] = await Promise.all([
      transaction.get(questionRef),
      transaction.get(answersQuery),
    ]);
    if (!questionSnap.exists) throw new Error('QUESTION_NOT_FOUND');

    const playerIds: string[] = Array.isArray(session.questionPlayerIds) ? session.questionPlayerIds : [];
    const playerRefs = playerIds.map((playerId) => sessionRef.collection('players').doc(playerId));
    const playerSnaps = await Promise.all(playerRefs.map((playerRef) => transaction.get(playerRef)));
    const answersByPlayer = new Map<string, { isCorrect?: boolean; timeSpent?: number }>();
    answersSnap.docs.forEach((answer) => {
      const data = answer.data();
      if (!answersByPlayer.has(data.playerId)) answersByPlayer.set(data.playerId, data);
    });

    const duration = Number(session.timerDuration) || 30;
    const roundWinners: Array<{ playerId: string; name: string; color: string; scoreAdded: number; timeSpent: number }> = [];
    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data();
      const answer = answersByPlayer.get(playerSnap.id);
      if (answer?.isCorrect) {
        // One point per remaining second: a 45s question answered at 5s = 40 points.
        const timeSpent = Math.max(0, Number(answer.timeSpent) || 0);
        const scoreAdded = Math.max(0, Math.ceil(duration - timeSpent));
        transaction.update(playerSnap.ref, { score: (player?.score || 0) + scoreAdded, streak: (player?.streak || 0) + 1 });
        roundWinners.push({ playerId: playerSnap.id, name: String(player?.name || 'متسابق'), color: String(player?.color || '#a855f7'), scoreAdded, timeSpent });
      } else {
        // Missing answers are intentionally scored as incorrect.
        transaction.update(playerSnap.ref, session.gameMode === 'survival'
          ? { streak: 0, isActive: false }
          : { streak: 0 });
      }
    });

    transaction.update(sessionRef, {
      questionStatus: 'revealed',
      revealedCorrectOption: questionSnap.data()!.correctOption,
      roundWinners: roundWinners.sort((a, b) => a.timeSpent - b.timeSpent).slice(0, 3),
    });
    return { revealed: true };
  });
}

/**
 * Resolves one musical-chairs round. A chair belongs to the first contestant
 * who selected its number; duplicate and missing selections are eliminated.
 */
export async function revealAndScoreChairRound(sessionId: string, roundId: string) {
  const db = adminDb();
  const sessionRef = db.collection('sessions').doc(sessionId);

  return db.runTransaction(async (transaction) => {
    const sessionSnap = await transaction.get(sessionRef);
    const session = sessionSnap.data();
    if (!sessionSnap.exists || session?.gameMode !== 'chairs' || session?.currentQuestionId !== roundId || session?.questionStatus !== 'showing') {
      return { revealed: false };
    }

    const playerIds: string[] = Array.isArray(session.questionPlayerIds) ? session.questionPlayerIds : [];
    const answersQuery = sessionRef.collection('answers').where('questionId', '==', roundId);
    const [answersSnap, ...playerSnaps] = await Promise.all([
      transaction.get(answersQuery),
      ...playerIds.map((playerId) => transaction.get(sessionRef.collection('players').doc(playerId))),
    ]);
    const answersByPlayer = new Map<string, { isCorrect?: boolean; timeSpent?: number }>();
    answersSnap.docs.forEach((answer) => {
      const data = answer.data();
      if (!answersByPlayer.has(data.playerId)) answersByPlayer.set(data.playerId, data);
    });

    const chairResults: Record<string, 'safe' | 'out'> = {};
    const roundWinners: Array<{ playerId: string; name: string; color: string; scoreAdded: number; timeSpent: number }> = [];
    playerSnaps.forEach((playerSnap) => {
      if (!playerSnap.exists) return;
      const player = playerSnap.data();
      const safe = answersByPlayer.get(playerSnap.id)?.isCorrect === true;
      chairResults[playerSnap.id] = safe ? 'safe' : 'out';
      if (safe) roundWinners.push({ playerId: playerSnap.id, name: String(player?.name || 'متسابق'), color: String(player?.color || '#a855f7'), scoreAdded: 100, timeSpent: Number(answersByPlayer.get(playerSnap.id)?.timeSpent) || 0 });
      transaction.update(playerSnap.ref, safe
        ? { score: (player?.score || 0) + 100, streak: (player?.streak || 0) + 1, isActive: true }
        : { streak: 0, isActive: false });
    });

    transaction.update(sessionRef, {
      questionStatus: 'revealed',
      chairPhase: 'revealed',
      chairResults,
      roundWinners: roundWinners.sort((a, b) => a.timeSpent - b.timeSpent),
    });
    return { revealed: true };
  });
}
