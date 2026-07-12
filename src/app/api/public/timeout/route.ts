import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { revealAndScoreChairRound, revealAndScoreQuestion } from '@/lib/game-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toMillis(value: unknown) {
  const timestamp = value as { toMillis?: () => number; seconds?: number } | undefined;
  return timestamp?.toMillis ? timestamp.toMillis() : (timestamp?.seconds || 0) * 1000;
}

export async function POST(request: Request) {
  try {
    const { sessionId, questionId } = await request.json() as { sessionId?: string; questionId?: string };
    if (!sessionId || !questionId) return NextResponse.json({ error: 'بيانات السؤال غير مكتملة.' }, { status: 400 });
    const sessionSnap = await adminDb().collection('sessions').doc(sessionId).get();
    const session = sessionSnap.data();
    const startsAt = toMillis(session?.questionStartedAt);
    const endsAt = startsAt + (Number(session?.timerDuration) || 30) * 1000;
    if (!sessionSnap.exists || session?.currentQuestionId !== questionId || session?.questionStatus !== 'showing' || !startsAt || Date.now() < endsAt) {
      return NextResponse.json({ error: 'لم ينته وقت السؤال بعد.' }, { status: 409 });
    }
    return NextResponse.json(await (session?.gameMode === 'chairs'
      ? revealAndScoreChairRound(sessionId, questionId)
      : revealAndScoreQuestion(sessionId, questionId)));
  } catch {
    return NextResponse.json({ error: 'تعذر إنهاء السؤال تلقائياً.' }, { status: 500 });
  }
}
