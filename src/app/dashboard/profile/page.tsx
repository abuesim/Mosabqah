'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { KeyRound, ShieldCheck, User, Users } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getUserProfile } from '@/lib/db';
import Card, { CardHeader } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import Spinner from '@/components/ui/Spinner';

type ProfileData = { username: string; displayName: string; role: 'admin' | 'presenter'; roomCode?: string; uid: string };

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = '/auth'; return; }
      const [storedProfile, tokenResult] = await Promise.all([
        getUserProfile(user.uid),
        user.getIdTokenResult(),
      ]);
      const displayName = storedProfile?.displayName || storedProfile?.username || user.displayName || user.email?.split('@')[0] || 'مستخدم';
      setProfile({
        uid: user.uid,
        username: storedProfile?.username || user.displayName || user.email?.split('@')[0] || 'مستخدم',
        displayName,
        role: tokenResult.claims.admin === true ? 'admin' : 'presenter',
        roomCode: storedProfile?.roomCode,
      });
      setDisplayNameInput(displayName);
    });
    return () => unsubscribe();
  }, []);

  const saveDisplayName = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setError('');
    setMessage('');
    setSavingDisplayName(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: displayNameInput }),
      });
      const payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json() as { displayName?: string; error?: string }
        : { error: 'تعذر الاتصال بخدمة الملف الشخصي.' };
      if (!response.ok || !payload.displayName) throw new Error(payload.error || 'تعذر حفظ اسم العرض.');
      setProfile(current => current ? { ...current, displayName: payload.displayName! } : current);
      setDisplayNameInput(payload.displayName);
      setMessage('تم حفظ اسم العرض. سيظهر للمتسابقين عند انتظار التحدي.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ اسم العرض.');
    } finally {
      setSavingDisplayName(false);
    }
  };

  if (!profile) return <div className="flex justify-center py-24"><Spinner size="lg" label="جاري تحميل ملفك..." /></div>;

  return (
    <div className="anim-rise mx-auto max-w-3xl space-y-7">
      <div>
        <h2 className="text-2xl font-extrabold text-ink">ملفي</h2>
        <p className="mt-1 text-sm text-ink-mute">إعدادات ومعلومات حسابك في منصة المسابقة.</p>
      </div>

      <Card glow="neon" className="p-6">
        <CardHeader title="بيانات الحساب" icon={<User className="h-5 w-5" />} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Info label="اسم المستخدم" value={profile.username} />
          <Info label="اسم العرض للمتسابقين" value={profile.displayName} />
          <Info label="الصلاحية" value={profile.role === 'admin' ? 'مدير النظام' : 'مقدم مسابقة'} icon={<ShieldCheck className="h-4 w-4" />} />
          <Info label="رمز الغرفة الدائم" value={profile.roomCode || 'لم يتم حجز رمز بعد'} code />
          <Info label="معرّف الحساب" value={profile.uid} />
        </div>
      </Card>

      <Card className="p-6">
        <CardHeader title="اسم العرض" icon={<Users className="h-5 w-5" />} accent="cyan" />
        <p className="mt-3 text-xs leading-6 text-ink-mute">هذا هو الاسم الذي سيظهر للمتسابقين في صفحة الانتظار الخاصة برمز غرفتك.</p>
        {error && <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger-bright">{error}</p>}
        {message && <p className="mt-3 rounded-xl border border-success/30 bg-success/10 p-3 text-xs text-success-bright">{message}</p>}
        <form onSubmit={saveDisplayName} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="اسم العرض" className="flex-1"><Input value={displayNameInput} onChange={(event) => setDisplayNameInput(event.target.value)} required minLength={2} maxLength={40} placeholder="مثال: أبو محمد" /></Field>
          <Button type="submit" variant="primary" disabled={savingDisplayName}>{savingDisplayName ? 'جاري الحفظ...' : 'حفظ الاسم'}</Button>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/sessions" className="glass rounded-[var(--radius-card)] p-5 transition-all hover:border-neon/40 hover:bg-neon/5">
          <KeyRound className="h-5 w-5 text-neon-bright" />
          <h3 className="mt-3 font-bold text-ink">رمز الغرفة</h3>
          <p className="mt-1 text-xs leading-5 text-ink-mute">حجز أو تغيير رمز غرفتك الدائم من صفحة الجلسات.</p>
        </Link>
        {profile.role === 'admin' && (
          <Link href="/dashboard/admin" className="glass rounded-[var(--radius-card)] p-5 transition-all hover:border-cyan/40 hover:bg-cyan/5">
            <Users className="h-5 w-5 text-cyan" />
            <h3 className="mt-3 font-bold text-ink">إدارة النظام</h3>
            <p className="mt-1 text-xs leading-5 text-ink-mute">إدارة المقدمين ومتابعة إحصاءات المنصة.</p>
          </Link>
        )}
      </div>
    </div>
  );
}

function Info({ label, value, icon, code }: { label: string; value: string; icon?: React.ReactNode; code?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-void-2/45 p-4">
      <p className="text-[11px] font-semibold text-ink-mute">{label}</p>
      <p className={`mt-2 flex items-center gap-2 text-sm font-bold text-ink ${code ? 'font-display tracking-[0.18em] text-neon-bright' : ''}`}>
        {icon}{value}
      </p>
    </div>
  );
}
