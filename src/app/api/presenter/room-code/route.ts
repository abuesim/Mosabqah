import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminDb, requireAuthenticated } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { roomCode } = await request.json() as { roomCode?: string };
    const normalizedCode = roomCode?.trim() || '';
    if (!/^\d{4}$/.test(normalizedCode)) {
      return NextResponse.json({ error: 'رمز الغرفة يجب أن يتكون من 4 أرقام.' }, { status: 400 });
    }

    const db = adminDb();
    const profileRef = db.collection('users').doc(user.uid);
    const roomRef = db.collection('presenterRoomCodes').doc(normalizedCode);

    await db.runTransaction(async (transaction) => {
      const [profileSnap, roomSnap] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(roomRef),
      ]);
      const profile = profileSnap.data();
      if (!profile) throw new Error('تعذر العثور على ملف حساب المقدم.');
      if (roomSnap.exists && roomSnap.data()?.presenterId !== user.uid) {
        throw new Error('رمز الغرفة محجوز بالفعل. اختر رمزاً آخر.');
      }

      const oldCode = profile.roomCode as string | undefined;
      if (oldCode && oldCode !== normalizedCode) {
        const oldRoomRef = db.collection('presenterRoomCodes').doc(oldCode);
        const oldRoomSnap = await transaction.get(oldRoomRef);
        if (oldRoomSnap.exists && oldRoomSnap.data()?.presenterId === user.uid) transaction.delete(oldRoomRef);
      }

      transaction.set(roomRef, {
        presenterId: user.uid,
        presenterName: profile.displayName || profile.username || user.name || 'مقدم المسابقة',
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(profileRef, {
        roomCode: normalizedCode,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return NextResponse.json({ roomCode: normalizedCode });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر حفظ رمز الغرفة.';
    const status = message === 'UNAUTHENTICATED' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
