'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile, getCounts, getSessions } from '@/lib/db';
import type { Session } from '@/lib/db';
import { BookOpen, Layers, Trophy, ArrowLeft, Play, Plus, Sparkles, Gamepad2 } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import StatusDot from '@/components/ui/StatusDot';
import Spinner from '@/components/ui/Spinner';

export default function DashboardPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [stats, setStats] = useState({ questionsCount: 0, sessionsCount: 0, winnersCount: 0 });
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        window.location.href = '/auth';
        return;
      }
      try {
        const [userProfile, tokenResult] = await Promise.all([
          getUserProfile(user.uid),
          user.getIdTokenResult(),
        ]);
        setProfile({
          id: user.uid,
          username: userProfile?.username || user.displayName || user.email?.split('@')[0] || 'مدير النظام',
          role: tokenResult.claims.admin === true ? 'admin' : userProfile?.role || 'presenter',
        });

        const [counts, sessions] = await Promise.all([
          getCounts(),
          getSessions(user.uid),
        ]);
        setStats(counts);
        setActiveSessions(sessions);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto anim-rise">
        <div className="p-5 bg-danger/10 border border-danger/25 rounded-2xl text-danger-bright text-sm font-semibold shadow-lg">
          حدث خطأ أثناء تحميل البيانات من قاعدة البيانات:
          <p className="mt-3 font-mono text-xs opacity-90 dir-ltr bg-black/35 p-3 rounded-lg overflow-x-auto text-left select-all">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-neon text-white font-bold text-sm shadow-[var(--shadow-neon)] hover:opacity-90 transition-all cursor-pointer"
        >
          إعادة المحاولة 🔄
        </button>
      </div>
    );
  }

  return (
    <div className="anim-rise space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-neon/20 bg-gradient-to-l from-neon-deep/25 to-cyan-deep/10 p-7">
        <div aria-hidden className="anim-float absolute -top-10 -left-10 h-40 w-40 rounded-full bg-neon/20 blur-3xl" />
        <div className="relative">
          <h2 className="text-2xl font-extrabold text-ink md:text-3xl">
            مرحباً بك يا {profile?.username || 'مقدمنا'}
            <span className="mr-2 inline-block anim-pulse-neon text-neon-bright">●</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-mute md:text-base">
            أنشئ تحدياتك من مكتب الألعاب، ثم أدر الجلسات النشطة لحظياً من غرفة التحكم.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <StatCard label={profile?.role === 'admin' ? 'إجمالي بنك الأسئلة' : 'أسئلة المكتبة المتاحة'} value={stats.questionsCount} icon={BookOpen} tone="neon" />
        <StatCard label="الجلسات المنشأة" value={stats.sessionsCount} icon={Layers} tone="cyan" />
        <StatCard label="أرشيف الفائزين" value={stats.winnersCount} icon={Trophy} tone="gold" />
      </div>

      {/* Main */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Active sessions */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Sparkles className="h-5 w-5 text-neon-bright" />
              جلساتك النشطة والسابقة
            </h3>
            <Link
              href="/dashboard/games"
              className="flex items-center gap-1.5 text-xs font-semibold text-neon-bright underline-offset-2 hover:underline"
            >
              إنشاء تحدٍ <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {activeSessions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">
                لا توجد جلسات حالية. ابدأ بإنشاء جلستك الأولى الآن!
              </div>
            ) : (
              <div className="divide-y divide-line">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-white/5">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-ink md:text-base">{session.title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="rounded-md border border-line bg-void/60 px-2 py-0.5 font-display tracking-wider text-neon-bright">
                          {session.roomCode}
                        </span>
                        <StatusDot status={session.status} pulse={session.status === 'active'} />
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/sessions?id=${session.id}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-3.5 py-2 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20 hover:shadow-[var(--shadow-neon)]"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      إدارة
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-ink">إجراءات سريعة</h3>
          <div className="flex flex-col gap-4">
            <Link
              href="/dashboard/games"
              className="group glass rounded-[var(--radius-card)] border border-neon/20 bg-gradient-to-br from-neon/10 to-transparent p-5 transition-all hover:border-neon/40 hover:shadow-[var(--shadow-neon)]"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon/15 text-neon-bright transition-transform group-hover:scale-110">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">مكتب الألعاب</h4>
                  <p className="mt-1 text-xs text-ink-mute">أنشئ تحدياً جديداً عبر معالج بسيط واختر المحتوى والوقت</p>
                </div>
              </div>
            </Link>

            {profile?.role === 'admin' && (
              <Link
                href="/dashboard/questions"
                className="group glass rounded-[var(--radius-card)] border border-cyan/20 bg-gradient-to-br from-cyan/10 to-transparent p-5 transition-all hover:border-cyan/40 hover:shadow-[var(--shadow-cyan)]"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan/15 text-cyan transition-transform group-hover:scale-110">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink">إضافة أسئلة للمكتبة</h4>
                    <p className="mt-1 text-xs text-ink-mute">تغذية البنك المركزي بأسئلة متنوعة بمستويات صعوبة</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
