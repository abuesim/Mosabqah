import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [settings, questionRules] = await Promise.all([
      adminDb().collection('platformSettings').doc('gameModes').get(),
      adminDb().collection('platformSettings').doc('questionRules').get(),
    ]);
    return NextResponse.json({ enabled: settings.data()?.enabled || {}, questionRules: questionRules.data()?.rules || {} });
  } catch {
    return NextResponse.json({ enabled: {}, questionRules: {} });
  }
}
