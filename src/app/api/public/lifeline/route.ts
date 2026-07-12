import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, questionId } = await request.json() as { sessionId?: string; playerId?: string; questionId?: string };
    if (!sessionId || !playerId || !questionId) return NextResponse.json({ error: 'بيانات وسيلة المساعدة غير مكتملة.' }, { status: 400 });
    const db = adminDb();
    const playerRef = db.collection('sessions').doc(sessionId).collection('players').doc(playerId);
    const result = await db.runTransaction(async (transaction) => {
      const [sessionSnap, playerSnap, questionSnap] = await Promise.all([
        transaction.get(db.collection('sessions').doc(sessionId)), transaction.get(playerRef), transaction.get(db.collection('questions').doc(questionId)),
      ]);
      const session = sessionSnap.data();
      const player = playerSnap.data();
      const remainingLifelines = typeof player?.lifelinesRemaining === 'number' ? player.lifelinesRemaining : 0;
      if (!sessionSnap.exists || !playerSnap.exists || !questionSnap.exists || session?.status !== 'active' || session?.questionStatus !== 'showing' || session?.currentQuestionId !== questionId || remainingLifelines <= 0) {
        throw new Error('LIFELINE_UNAVAILABLE');
      }
      const correctOption = questionSnap.data()!.correctOption as number;
      const hiddenOptions = [1, 2, 3, 4].filter(option => option !== correctOption).sort(() => Math.random() - 0.5).slice(0, 2);
      transaction.update(playerRef, { lifelinesRemaining: remainingLifelines - 1, usedFiftyFifty: true });
      return hiddenOptions;
    });
    return NextResponse.json({ hiddenOptions: result });
  } catch {
    return NextResponse.json({ error: 'لا يمكن استخدام وسيلة المساعدة الآن.' }, { status: 409 });
  }
}
