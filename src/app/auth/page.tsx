'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp, signIn, signInWithGoogle } from '@/lib/db';
import { cn } from '@/lib/utils';
import Background from '@/components/ui/Background';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { KeyRound, User, ShieldCheck, ArrowRightLeft, Mic, Settings, Zap } from 'lucide-react';

/**
 * Username-based auth (Firebase Email/Password).
 *
 * Firebase doesn't require email deliverability or confirmation, so no
 * verification emails are ever sent and there are no rate-limit issues.
 * Internally we synthesize "<username>@mosabqah.local" because Firebase
 * Auth needs an email-format string; the user only ever sees username.
 */
function mapAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('email-already-in-use') || msg.includes('already in use')) {
    return 'اسم المستخدم محجوز مسبقاً. اختر اسماً آخر.';
  }
  if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-login')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  }
  if (msg.includes('weak-password') || msg.includes('password should be at least')) {
    return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
  }
  if (msg.includes('too-many-requests') || msg.includes('rate')) {
    return 'محاولات كثيرة فاشلة. انتظر دقيقة ثم حاول مرة أخرى.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول.';
  }
  return raw;
}

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'presenter'>('presenter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('يرجى إدخال اسم المستخدم.');
      return;
    }

    setLoading(true);

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        setLoading(false);
        setError('استغرق الاتصال بقاعدة البيانات وقتاً طويلاً. تأكد من تفعيل وإنشاء قاعدة بيانات Firestore في لوحة تحكم Firebase (بوضع التحدي/التجربة أو تفعيل القراءة والكتابة).');
      }
    }, 12000);

    try {
      if (isSignUp) {
        await signUp(cleanUsername, password, role);
      } else {
        await signIn(cleanUsername, password);
      }
      resolved = true;
      clearTimeout(timeoutId);
      router.push('/dashboard');
    } catch (err: any) {
      resolved = true;
      clearTimeout(timeoutId);
      console.error('🔴 Auth Error:', err);
      setError(mapAuthError(err?.message || String(err)));
    } finally {
      if (resolved) {
        setLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (err: any) {
      setError(mapAuthError(err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Background className="grid min-h-screen place-items-center p-4">
      <div className="anim-rise w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="anim-float mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="font-brand text-4xl text-gradient md:text-5xl">مُسَابَقَة عَصُومِي</h1>
          <p className="mt-2 text-sm text-ink-mute">
            {isSignUp ? 'أنشئ حساباً جديداً للانضمام للمنصة' : 'سجل الدخول لإدارة مسابقاتك وأسئلتك'}
          </p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-[var(--radius-card)] p-7 shadow-[var(--shadow-neon)]">
          {error && (
            <div className="anim-shake mb-5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="اسم المستخدم" htmlFor="username">
              <Input
                id="username"
                type="text"
                required
                autoComplete="username"
                placeholder="اكتب اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                icon={<User className="h-5 w-5" />}
              />
            </Field>

            <Field label="كلمة المرور" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<KeyRound className="h-5 w-5" />}
              />
            </Field>

            {isSignUp && (
              <Field label="نوع الحساب / الصلاحيات">
                <div className="grid grid-cols-2 gap-3">
                  <RoleButton
                    active={role === 'presenter'}
                    onClick={() => setRole('presenter')}
                    icon={<Mic className="h-5 w-5" />}
                    label="مقدم مسابقة"
                  />
                  <RoleButton
                    active={role === 'admin'}
                    onClick={() => setRole('admin')}
                    icon={<Settings className="h-5 w-5" />}
                    label="مدير النظام"
                  />
                </div>
              </Field>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading} className="mt-2">
              {loading ? 'جاري التحميل...' : isSignUp ? 'تسجيل حساب جديد' : 'تسجيل الدخول'}
            </Button>
          </form>

          {/* Google Sign-In */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="absolute inset-0 border-t border-line" />
            <span className="relative bg-[#0d0a1b] px-3 text-xs text-ink-mute">أو</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line bg-white/5 py-3 text-sm font-bold text-slate-100 transition-all hover:bg-white/10 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            تسجيل الدخول بواسطة Google
          </button>

          <div className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-mute">
            {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب بعد؟'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-neon-bright underline-offset-2 hover:underline"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {isSignUp ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </button>
          </div>
        </div>

        <button
          onClick={() => router.push('/')}
          className="mx-auto mt-5 flex cursor-pointer items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-mute"
        >
          <Zap className="h-3.5 w-3.5" />
          العودة للصفحة الرئيسية
        </button>
      </div>
    </Background>
  );
}

function RoleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-xl border py-4 text-xs font-bold transition-all duration-200',
        active
          ? 'border-neon/60 bg-neon/15 text-neon-bright shadow-[var(--shadow-neon)]'
          : 'border-line bg-void-2/50 text-ink-mute hover:border-line-strong hover:text-ink-soft'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
