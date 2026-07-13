import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { sessionId, playerId } = await request.json() as { sessionId?: string; playerId?: string };
    if (!sessionId || !playerId) return NextResponse.json({ error: 'بيانات العجلة غير مكتملة.' }, { status: 400 });
    const ref = adminDb().collection('sessions').doc(sessionId);
    const session = await ref.get();
    const data = session.data();
    if (!session.exists || data?.gameMode !== 'roulette' || data?.rouletteStatus !== 'spinning' || data?.rouletteWinnerId !== playerId) return NextResponse.json({ error: 'لا تملك صلاحية إيقاف العجلة.' }, { status: 403 });
    const prizes = String(data.roulettePrize || '').split('،').map((value: string) => value.trim()).filter(Boolean);
    const prize = prizes[Math.floor(Math.random() * prizes.length)] || 'مفاجأة';
    await ref.update({ rouletteStatus: 'revealed', roulettePrize: prize });
    return NextResponse.json({ prize });
  } catch {
    return NextResponse.json({ error: 'تعذر إيقاف العجلة.' }, { status: 500 });
  }
}
