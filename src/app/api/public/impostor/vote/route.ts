import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, votedPlayerId } = await request.json() as { sessionId?: string; playerId?: string; votedPlayerId?: string };
    if (!sessionId || !playerId || !votedPlayerId || playerId === votedPlayerId) return NextResponse.json({ error: 'بيانات التصويت غير صالحة.' }, { status: 400 });
    const db = adminDb();
    const sessionRef = db.collection('sessions').doc(sessionId);
    const [session, voter, target] = await Promise.all([sessionRef.get(), sessionRef.collection('players').doc(playerId).get(), sessionRef.collection('players').doc(votedPlayerId).get()]);
    if (!session.exists || !voter.exists || !target.exists || session.data()?.gameMode !== 'impostor' || session.data()?.impostorPhase !== 'voting') return NextResponse.json({ error: 'التصويت غير متاح الآن.' }, { status: 409 });
    await sessionRef.collection('answers').doc(`impostor-vote_${playerId}`).create({ sessionId, playerId, questionId: 'impostor-vote', votedPlayerId, chosenOption: 0, isCorrect: false, timeSpent: 0, createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as { code?: number }).code === 6 ? 'تم تسجيل تصويتك.' : 'تعذر تسجيل التصويت.' }, { status: 400 });
  }
}
