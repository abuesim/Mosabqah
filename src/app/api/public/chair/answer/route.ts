import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { revealAndScoreChairRound } from '@/lib/game-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, roundId } = await request.json() as { sessionId?: string; playerId?: string; roundId?: string };
    if (!sessionId || !playerId || !roundId) {
      return NextResponse.json({ error: 'بيانات الكرسي غير صالحة.' }, { status: 400 });
    }
    const db = adminDb();
    const sessionRef = db.collection('sessions').doc(sessionId);
    const result = await db.runTransaction(async (transaction) => {
      const [sessionSnap, playerSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(sessionRef.collection('players').doc(playerId)),
      ]);
      const session = sessionSnap.data();
      if (!sessionSnap.exists || !playerSnap.exists || session?.gameMode !== 'chairs' || session?.status !== 'active' || session?.questionStatus !== 'showing' || session?.chairPhase !== 'ready' || session?.currentQuestionId !== roundId) {
        throw new Error('ROUND_CLOSED');
      }
      const chairCount = Number(session.chairCount) || 0;
      const playerIds: string[] = Array.isArray(session.questionPlayerIds) ? session.questionPlayerIds : [];
      if (!playerIds.includes(playerId) || !playerSnap.data()?.isActive || chairCount < 1) throw new Error('INVALID_CHAIR');

      const answersQuery = sessionRef.collection('answers').where('questionId', '==', roundId);
      const answersSnap = await transaction.get(answersQuery);
      const answerRef = sessionRef.collection('answers').doc(`${roundId}_${playerId}`);
      if (answersSnap.docs.some((answer) => answer.id === answerRef.id)) throw new Error('ALREADY_ANSWERED');
      const wonSeat = answersSnap.docs.filter(answer => answer.data().isCorrect === true).length < chairCount;
      const readyAt = session.chairReadyAt?.toMillis ? session.chairReadyAt.toMillis() : Date.now();
      transaction.create(answerRef, {
        sessionId,
        playerId,
        questionId: roundId,
        chosenOption: wonSeat ? answersSnap.docs.filter(answer => answer.data().isCorrect === true).length + 1 : 0,
        isCorrect: wonSeat,
        // Server time gives one consistent tie-break source for all clients.
        timeSpent: Math.max(0, Date.now() - readyAt),
        createdAt: FieldValue.serverTimestamp(),
      });
      const answeredIds = new Set(answersSnap.docs.map((answer) => answer.data().playerId));
      answeredIds.add(playerId);
      return { everyoneAnswered: playerIds.length > 0 && playerIds.every((id) => answeredIds.has(id)), chairsFull: wonSeat && answersSnap.docs.filter(answer => answer.data().isCorrect === true).length + 1 >= chairCount };
    });
    if (result.everyoneAnswered || result.chairsFull) await revealAndScoreChairRound(sessionId, roundId);
    return NextResponse.json({ ok: true, revealed: result.everyoneAnswered || result.chairsFull });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      ROUND_CLOSED: 'انتهت جولة الكراسي.',
      INVALID_CHAIR: 'هذا الكرسي غير متاح لك.',
      ALREADY_ANSWERED: 'تم تسجيل اختيارك مسبقاً.',
    };
    return NextResponse.json({ error: messages[code] || 'تعذر تسجيل رقم الكرسي.' }, { status: code === 'ALREADY_ANSWERED' ? 409 : 400 });
  }
}
