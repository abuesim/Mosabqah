import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
const normalize = (value: string) => value.trim().toLowerCase().replace(/[\sًٌٍَُِّْـ]/g, '');

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, answer, attempts, timeSpent } = await request.json() as { sessionId?: string; playerId?: string; answer?: string; attempts?: number; timeSpent?: number };
    if (!sessionId || !playerId || !attempts) return NextResponse.json({ error: 'بيانات تركيبة غير مكتملة.' }, { status: 400 });
    const db = adminDb(); const sessionRef = db.collection('sessions').doc(sessionId);
    const [sessionSnap, playerSnap] = await Promise.all([sessionRef.get(), sessionRef.collection('players').doc(playerId).get()]);
    const session = sessionSnap.data();
    if (!sessionSnap.exists || !playerSnap.exists || session?.gameMode !== 'tarkeeba' || session?.questionStatus !== 'showing') return NextResponse.json({ error: 'الجولة غير متاحة.' }, { status: 409 });
    const secret = Buffer.from(String(session.tarkeebaSecret || ''), 'base64').toString('utf8');
    const correct = Boolean(answer) && normalize(answer || '') === normalize(secret);
    const answerRef = sessionRef.collection('answers').doc(`tarkeeba_${playerId}`);
    await db.runTransaction(async transaction => {
      const existing = await transaction.get(answerRef); if (existing.exists) return;
      transaction.create(answerRef, { sessionId, playerId, questionId: 'tarkeeba', chosenOption: 0, isCorrect: correct, tarkeebaAttempts: Math.min(6, Math.max(1, attempts)), timeSpent: Math.max(0, Number(timeSpent) || 0), createdAt: FieldValue.serverTimestamp() });
      if (correct) transaction.update(playerSnap.ref, { score: (playerSnap.data()?.score || 0) + Math.max(1, 7 - attempts), streak: (playerSnap.data()?.streak || 0) + 1 });
    });
    return NextResponse.json({ correct });
  } catch { return NextResponse.json({ error: 'تعذر حفظ نتيجة تركيبة.' }, { status: 500 }); }
}
