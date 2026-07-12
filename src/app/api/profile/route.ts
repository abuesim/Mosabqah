import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb, requireAuthenticated } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { displayName } = await request.json() as { displayName?: string };
    const normalizedName = displayName?.trim() || '';
    if (normalizedName.length < 2 || normalizedName.length > 40) {
      return NextResponse.json({ error: 'اسم العرض يجب أن يكون بين حرفين و40 حرفاً.' }, { status: 400 });
    }
    await Promise.all([
      adminAuth().updateUser(user.uid, { displayName: normalizedName }),
      adminDb().collection('users').doc(user.uid).set({ displayName: normalizedName, updatedAt: FieldValue.serverTimestamp() }, { merge: true }),
    ]);
    return NextResponse.json({ displayName: normalizedName });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ اسم العرض.';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : 400 });
  }
}
