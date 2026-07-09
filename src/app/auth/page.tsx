'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { KeyRound, Mail, User, ShieldCheck, ArrowRightLeft } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'admin' | 'presenter'>('presenter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        // Sign Up Flow
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || email.split('@')[0],
              role,
            },
          },
        });

        if (signUpError) throw signUpError;
        alert('تم التسجيل بنجاح! يمكنك الآن تسجيل الدخول.');
        setIsSignUp(false);
      } else {
        // Sign In Flow
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-950 to-slate-950 text-slate-100 font-sans">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl relative overflow-hidden transition-all duration-300">
        {/* Glow effect */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl" />

        {/* Title */}
        <div className="text-center mb-8 relative">
          <div className="inline-flex p-3 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
            <ShieldCheck className="w-8 h-8 text-purple-400" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-indigo-300">
            مُسَابَقَة عَصُومِي
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            {isSignUp ? 'أنشئ حساباً جديداً للانضمام للمنصة' : 'سجل الدخول لإدارة مسابقاتك وأسئلتك'}
          </p>
        </div>

        {/* Error Toast */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/15 border border-red-500/20 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 relative">
          {isSignUp && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 block">الاسم المستعار</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="اسم المستخدم"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900/60 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none text-slate-100 transition-all placeholder:text-slate-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 block">البريد الإلكتروني</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <Mail className="w-5 h-5" />
              </span>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900/60 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none text-slate-100 transition-all placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300 block">كلمة المرور</label>
            <div className="relative">
              <span className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                <KeyRound className="w-5 h-5" />
              </span>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900/60 border border-white/10 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none text-slate-100 transition-all placeholder:text-slate-500"
              />
            </div>
          </div>

          {isSignUp && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300 block">نوع الحساب / الصلاحيات</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole('presenter')}
                  className={`py-3 rounded-xl border text-center transition-all ${
                    role === 'presenter'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                      : 'bg-slate-900/40 border-white/5 text-slate-400'
                  }`}
                >
                  مقدم مسابقة 🎙️
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`py-3 rounded-xl border text-center transition-all ${
                    role === 'admin'
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                      : 'bg-slate-900/40 border-white/5 text-slate-400'
                  }`}
                >
                  مدير النظام ⚙️
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold transition-all shadow-lg hover:shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'جاري التحميل...' : isSignUp ? 'تسجيل حساب جديد' : 'تسجيل الدخول'}
          </button>
        </form>

        {/* Toggle between login/signup */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center text-sm text-slate-400">
          {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب بعد؟'}{' '}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-purple-400 hover:text-purple-300 font-semibold underline inline-flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-4 h-4" />
            {isSignUp ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
          </button>
        </div>
      </div>
    </main>
  );
}
