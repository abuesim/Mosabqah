'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import Background from '@/components/ui/Background';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { KeyRound, User, ShieldCheck, ArrowRightLeft, Mic, Settings, Zap } from 'lucide-react';

/**
 * Username-based auth.
 *
 * Supabase Auth requires an email internally, so we synthesize a stable internal
 * address from the chosen username:  "<username>@mosabqah.local". This keeps the
 * signup / signin UI username-only (nicer for family/friends use) while leaving
 * the full Supabase Auth + Realtime stack untouched.
 *
 * Requirement: "Confirm email" must be OFF in Supabase → Auth → Providers → Email,
 * because these .local addresses are not deliverable.
 */
const toInternalEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/\s+/g, '')}@mosabqah.local`;

/**
 * Map raw Supabase auth errors to clear Arabic guidance.
 * Handles the most common pain points: rate limits, duplicates, bad creds.
 */
function mapAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('rate limit')) {
    return 'تجاوزت الحد المسموح من المحاولات. انتظر ساعة ثم حاول، أو عطّل "Confirm email" في إعدادات Supabase.';
  }
  if (msg.includes('already') || msg.includes('registered') || msg.includes('user already')) {
    return 'اسم المستخدم محجوز مسبقاً. اختر اسماً آخر.';
  }
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
  }
  if (msg.includes('email not confirmed')) {
    return 'يجب تأكيد البريد. عطّل "Confirm email" في Supabase ← Authentication ← Providers ← Email.';
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

    try {
      const email = toInternalEmail(cleanUsername);

      if (isSignUp) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: cleanUsername,
              role,
            },
          },
        });

        if (signUpError) {
          throw new Error(mapAuthError(signUpError.message));
        }

        // If Supabase still has email confirmation ON, no session comes back.
        // We treat that as a setup issue and instruct the user clearly.
        if (!signUpData.session) {
          throw new Error(
            'تم إنشاء الحساب، لكن يجب تأكيد البريد. ' +
            'عطّل خيار "Confirm email" في Supabase ← Authentication ← Providers ← Email.'
          );
        }

        router.push('/dashboard');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw new Error(mapAuthError(signInError.message));
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
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
          {/* Error */}
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

          {/* Toggle */}
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

        {/* Back home */}
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
