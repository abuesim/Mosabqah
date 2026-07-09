'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { BookOpen, Layers, Trophy, ArrowLeft, Play, Plus, Mic, Sparkles } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import StatusDot from '@/components/ui/StatusDot';
import Spinner from '@/components/ui/Spinner';

export default function DashboardPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [stats, setStats] = useState({ questionsCount: 0, sessionsCount: 0, winnersCount: 0 });
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id, username, role')
          .eq('id', user.id)
          .single();
        if (userProfile) setProfile(userProfile);

        const { count: questionsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
        const { count: sessionsCount } = await supabase.from('sessions').select('*', { count: 'exact', head: true });
        const { count: winnersCount } = await supabase.from('winners_archive').select('*', { count: 'exact', head: true });

        setStats({
          questionsCount: questionsCount || 0,
          sessionsCount: sessionsCount || 0,
          winnersCount: winnersCount || 0,
        });

        const { data: sessions } = await supabase
          .from('sessions')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false });
        if (sessions) setActiveSessions(sessions);
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل لوحة التحكم..." />
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
            أهلاً بك في لوحة الإدارة لمسابقاتك. تصفح بنك الأسئلة المركزي، وأدر التحديات النشطة وابدأ جلسات جديدة فوراً.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <StatCard label="إجمالي بنك الأسئلة" value={stats.questionsCount} icon={BookOpen} tone="neon" />
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
              href="/dashboard/sessions"
              className="flex items-center gap-1.5 text-xs font-semibold text-neon-bright underline-offset-2 hover:underline"
            >
              إدارة الجلسات <ArrowLeft className="h-3.5 w-3.5" />
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
                          {session.room_code}
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
              href="/dashboard/sessions"
              className="group glass rounded-[var(--radius-card)] border border-neon/20 bg-gradient-to-br from-neon/10 to-transparent p-5 transition-all hover:border-neon/40 hover:shadow-[var(--shadow-neon)]"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon/15 text-neon-bright transition-transform group-hover:scale-110">
                  <Mic className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">إنشاء تحدي / جلسة جديدة</h4>
                  <p className="mt-1 text-xs text-ink-mute">ابدأ مسابقة جديدة مع الأصدقاء أو العائلة وشارك الكود</p>
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
