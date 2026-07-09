'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Award, Calendar, FileText, ArrowRight, Download, Users } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamically import PDF components to prevent SSR errors in Next.js
const PDFDownloadButton = dynamic(
  () => import('@/components/PDFDownloadButton'),
  { ssr: false }
);

export default function WinnersPage() {
  const [winners, setWinners] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch Winners Archive
        const { data: wData } = await supabase
          .from('winners_archive')
          .select('*')
          .order('created_at', { ascending: false });
        if (wData) setWinners(wData);

        // 2. Fetch Cumulative Leaderboard
        const { data: lData } = await supabase
          .from('cumulative_leaderboard')
          .select('*')
          .order('total_score', { ascending: false });
        if (lData) setLeaderboard(lData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-t-purple-500 border-white/5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-100 flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-400" />
            أرشيف الفائزين والتقارير
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            استعرض منصات التتويج التاريخية والنتائج التراكمية المسجلة للاعبين عبر كافة جولات المسابقة.
          </p>
        </div>

        {/* Dynamic PDF Export Component */}
        <PDFDownloadButton winners={winners} leaderboard={leaderboard} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Cumulative Seasonal Leaderboard */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-white/5 border border-white/5 space-y-6">
          <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Award className="w-5 h-5 text-purple-400" />
            لوحة الصدارة التراكمية
          </h3>
          <p className="text-slate-400 text-xs mt-1">
            ترتيب اللاعبين الموسمي التراكمي المجمع عبر كامل المشاركات والمسابقات السابقة.
          </p>

          <div className="space-y-3">
            {leaderboard.length === 0 ? (
              <div className="text-center text-slate-500 text-xs py-8">
                لا توجد نقاط تراكمية مسجلة بعد.
              </div>
            ) : (
              leaderboard.map((player, idx) => (
                <div key={player.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                      idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                      idx === 1 ? 'bg-slate-400/20 text-slate-300' :
                      idx === 2 ? 'bg-amber-700/20 text-amber-600' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-bold text-xs text-slate-200">{player.player_name}</p>
                      <span className="text-[9px] text-slate-400 font-medium">عدد المسابقات: {player.games_played}</span>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-slate-100">{player.total_score} نقطة</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Historical Winners Archive */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            تاريخ منصات التتويج
          </h3>

          <div className="rounded-2xl border border-white/5 bg-white/5 overflow-hidden">
            {winners.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                لم يتم إنهاء وأرشفة أي مسابقات بعد.
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {winners.map((archive) => (
                  <div key={archive.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/5 transition-all">
                    <div>
                      <h4 className="font-bold text-slate-200 text-sm md:text-base">{archive.session_title}</h4>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          المشاركون: {archive.total_players} لاعب
                        </span>
                        <span>•</span>
                        <span>
                          التاريخ: {new Date(archive.created_at).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start md:self-auto">
                      <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-extrabold flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-400" />
                        البطل: {archive.winner_name} ({archive.winner_score} نقطة)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
