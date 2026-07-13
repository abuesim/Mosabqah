import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [settings, questionRules, gameInstructions] = await Promise.all([
      adminDb().collection('platformSettings').doc('gameModes').get(),
      adminDb().collection('platformSettings').doc('questionRules').get(),
      adminDb().collection('platformSettings').doc('gameInstructions').get(),
    ]);
    return NextResponse.json({ enabled: settings.data()?.enabled || {}, questionRules: questionRules.data()?.rules || {}, gameInstructions: gameInstructions.data()?.instructions || {} });
  } catch {
    return NextResponse.json({ enabled: {}, questionRules: {}, gameInstructions: {} });
  }
}
