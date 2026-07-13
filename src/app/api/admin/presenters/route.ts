import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { adminAuth, adminDb, requireAdmin } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const toInternalEmail = (username: string) => `${username.trim().toLowerCase().replace(/\s+/g, '')}@mosabqah.local`;

function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع.';
  return NextResponse.json({ error: message }, { status: message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400 });
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const [users, profiles, questions, sessions, winners, gameModes, questionRules, gameInstructions] = await Promise.all([
      adminAuth().listUsers(), adminDb().collection('users').get(), adminDb().collection('questions').get(), adminDb().collection('sessions').get(), adminDb().collection('winners').get(), adminDb().collection('platformSettings').doc('gameModes').get(), adminDb().collection('platformSettings').doc('questionRules').get(), adminDb().collection('platformSettings').doc('gameInstructions').get(),
    ]);
    const profilesByUid = new Map(profiles.docs.map((profile) => [profile.id, profile.data()]));
    const managedUsers = users.users.map((user) => ({
      uid: user.uid,
      username: profilesByUid.get(user.uid)?.username || user.displayName || user.email?.replace(/@mosabqah\.local$/, '') || 'مستخدم',
      role: user.customClaims?.admin === true ? 'admin' : profilesByUid.get(user.uid)?.role === 'player' ? 'player' : 'presenter',
      disabled: user.disabled,
      createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime || null,
    })).sort((a, b) => a.username.localeCompare(b.username, 'ar'));
    return NextResponse.json({ users: managedUsers, stats: {
      presenters: managedUsers.filter((user) => user.role === 'presenter').length,
      players: managedUsers.filter((user) => user.role === 'player').length,
      questions: questions.size, sessions: sessions.size, winners: winners.size,
    }, gameModes: gameModes.data()?.enabled || {}, questionCategories: [...new Set(questions.docs.map((question) => String(question.data().category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), questionRules: questionRules.data()?.rules || {}, gameInstructions: gameInstructions.data()?.instructions || {} });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const { username, password, role } = await request.json() as { username?: string; password?: string; role?: 'presenter' | 'player' };
    if (!username?.trim() || !password || password.length < 6) throw new Error('أدخل اسم مستخدم وكلمة مرور من 6 أحرف على الأقل.');
    if (role && !['presenter', 'player'].includes(role)) throw new Error('نوع الحساب غير صالح.');
    const user = await adminAuth().createUser({ email: toInternalEmail(username), password, displayName: username.trim() });
    await adminDb().collection('users').doc(user.uid).set({ username: username.trim(), displayName: username.trim(), role: role || 'presenter', createdAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ uid: user.uid }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin(request);
    const { uid, action, password, gameModes, questionRules, gameInstructions } = await request.json() as { uid?: string; action?: 'enable' | 'disable' | 'reset-password' | 'set-game-visibility' | 'set-game-question-rules' | 'set-game-instructions'; password?: string; gameModes?: Record<string, boolean>; questionRules?: Record<string, { categories?: string[]; questionTypes?: string[] }>; gameInstructions?: Record<string, string> };
    if (action === 'set-game-visibility') {
      if (!gameModes) throw new Error('إعدادات الألعاب غير مكتملة.');
      await adminDb().collection('platformSettings').doc('gameModes').set({ enabled: gameModes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'set-game-question-rules') {
      if (!questionRules || typeof questionRules !== 'object') throw new Error('إعدادات بنك الأسئلة غير مكتملة.');
      const rules = Object.fromEntries(Object.entries(questionRules).map(([game, rule]) => [game, {
        categories: [...new Set((rule.categories || []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map(value => value.trim()))],
        questionTypes: [...new Set((rule.questionTypes || []).filter((value): value is string => ['text', 'image', 'word'].includes(value)))],
      }]));
      await adminDb().collection('platformSettings').doc('questionRules').set({ rules, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (action === 'set-game-instructions') {
      if (!gameInstructions || typeof gameInstructions !== 'object') throw new Error('شروحات الألعاب غير مكتملة.');
      const instructions = Object.fromEntries(Object.entries(gameInstructions).map(([game, text]) => [game, String(text || '').trim().slice(0, 4000)]));
      await adminDb().collection('platformSettings').doc('gameInstructions').set({ instructions, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ ok: true });
    }
    if (!uid || !action) throw new Error('طلب إدارة المستخدم غير مكتمل.');
    const target = await adminAuth().getUser(uid);
    if (target.customClaims?.admin === true) throw new Error('لا يمكن تعديل حساب مدير النظام من هذه الصفحة.');
    if (action === 'reset-password') {
      if (!password || password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      await adminAuth().updateUser(uid, { password });
    } else await adminAuth().updateUser(uid, { disabled: action === 'disable' });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const { uid } = await request.json() as { uid?: string };
    if (!uid) throw new Error('معرّف المستخدم مفقود.');
    const target = await adminAuth().getUser(uid);
    if (target.customClaims?.admin === true) throw new Error('لا يمكن حذف حساب مدير النظام.');
    await Promise.all([adminAuth().deleteUser(uid), adminDb().collection('users').doc(uid).delete()]);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
