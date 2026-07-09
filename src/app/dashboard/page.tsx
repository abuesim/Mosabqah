'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { BookOpen, Layers, Trophy, ArrowRight, Play, Circle, Plus } from 'lucide-react';

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

        // Fetch Profile
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id, username, role')
          .eq('id', user.id)
          .single();
        if (userProfile) setProfile(userProfile);

        // Fetch Stats
        const { count: questionsCount } = await supabase.from('questions').select('*', { count: 'exact', head: true });
        const { count: sessionsCount } = await supabase.from('sessions').select('*', { count: 'exact', head: true });
        const { count: winnersCount } = await supabase.from('winners_archive').select('*', { count: 'exact', head: true });

        setStats({
          questionsCount: questionsCount || 0,
          sessionsCount: sessionsCount || 0,
          winnersCount: winnersCount || 0,
        });

        // Fetch Active Sessions
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
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-purple-500 border-white/5 animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: 'إجمالي بنك الأسئلة', value: stats.questionsCount, icon: BookOpen, color: 'text-purple-400' },
    { label: 'الجلسات المنشأة', value: stats.sessionsCount, icon: Layers, color: 'text-blue-400' },
    { label: 'أرشيف الفائزين', value: stats.winnersCount, icon: Trophy, color: 'text-amber-400' },
  ];

  return (
    <div className="space-y-10">
      {/* Welcome Banner */}
      <div className="relative p-8 rounded-2xl bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/10 overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-purple-500/10 rounded-full blur-3xl" />
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-100">
          مرحباً بك يا {profile?.username || 'مقدمنا'} 👋
        </h2>
        <p className="text-slate-400 text-sm md:text-base mt-2 max-w-xl">
          أهلاً بك في لوحة الإدارة لمسابقاتك. يمكنك من هنا تصفح بنك الأسئلة المركزي، وإدارة التحديات النشطة وبدء جلسات جديدة فوراً.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statCards.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-xs font-semibold">{stat.label}</p>
                <p className="text-3xl font-extrabold text-slate-100 mt-2">{stat.value}</p>
              </div>
              <div className={`p-3.5 rounded-xl bg-slate-900/50 ${stat.color}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Layout Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Sessions */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-200">جلساتك النشطة والسابقة</h3>
            <Link
              href="/dashboard/sessions"
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold underline flex items-center gap-1"
            >
              إدارة الجلسات <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            {activeSessions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                لا توجد جلسات حالية. ابدأ بإنشاء جلستك الأولى الآن!
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {activeSessions.map((session) => (
                  <div key={session.id} className="p-5 flex items-center justify-between hover:bg-white/5 transition-all">
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm md:text-base">{session.title}</h4>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="px-2 py-0.5 rounded bg-slate-800 font-mono tracking-wider font-bold">
                          رمز: {session.room_code}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1.5">
                          <Circle className={`w-2.5 h-2.5 ${
                            session.status === 'active' ? 'fill-green-500 text-green-500' :
                            session.status === 'finished' ? 'fill-red-500 text-red-500' : 'fill-slate-500 text-slate-500'
                          }`} />
                          {session.status === 'active' ? 'نشطة حالياً' :
                           session.status === 'finished' ? 'منتهية' : 'انتظار'}
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/dashboard/sessions?id=${session.id}`}
                      className="px-4 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/10 text-purple-300 text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      إدارة الجلسة
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <h3 className="text-lg font-bold text-slate-200">إجراءات سريعة</h3>
          <div className="flex flex-col gap-4">
            <Link
              href="/dashboard/sessions"
              className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-600/10 border border-purple-500/20 hover:border-purple-500/30 transition-all flex items-start gap-4"
            >
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-300">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-200 text-sm">إنشاء تحدي/جلسة جديدة 🎙️</h4>
                <p className="text-slate-400 text-xs mt-1">ابدأ مسابقة جديدة مع الأصدقاء أو العائلة وشارك الكود</p>
              </div>
            </Link>

            {profile?.role === 'admin' && (
              <Link
                href="/dashboard/questions"
                className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-blue-600/10 border border-indigo-500/20 hover:border-indigo-500/30 transition-all flex items-start gap-4"
              >
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-300">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">إضافة أسئلة للمكتبة 📖</h4>
                  <p className="text-slate-400 text-xs mt-1">تغذية البنك المركزي بأسئلة متنوعة بمستويات صعوبة</p>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
