'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Trophy, Award, Calendar, Users, Crown } from 'lucide-react';
import Card, { CardHeader } from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import dynamic from 'next/dynamic';

const PDFDownloadButton = dynamic(() => import('@/components/PDFDownloadButton'), { ssr: false });

export default function WinnersPage() {
  const [winners, setWinners] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const { data: wData } = await supabase.from('winners_archive').select('*').order('created_at', { ascending: false });
        if (wData) setWinners(wData);
        const { data: lData } = await supabase.from('cumulative_leaderboard').select('*').order('total_score', { ascending: false });
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
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل النتائج..." />
      </div>
    );
  }

  return (
    <div className="anim-rise space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <Trophy className="h-6 w-6 text-gold" />
            أرشيف الفائزين والتقارير
          </h2>
          <p className="mt-1 text-xs text-ink-mute">
            استعرض منصات التتويج التاريخية والنتائج التراكمية المسجلة للاعبين عبر كافة الجولات.
          </p>
        </div>
        <PDFDownloadButton winners={winners} leaderboard={leaderboard} />
      </div>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Cumulative leaderboard */}
        <Card glow="gold" className="space-y-5 p-6 lg:col-span-1">
          <CardHeader title="لوحة الصدارة التراكمية" icon={<Award className="h-5 w-5" />} accent="gold" />
          <p className="text-xs text-ink-mute">ترتيب اللاعبين الموسمي المجمع عبر كامل المشاركات والمسابقات السابقة.</p>

          <div className="space-y-2">
            {leaderboard.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-faint">لا توجد نقاط تراكمية مسجلة بعد.</div>
            ) : (
              leaderboard.map((player, idx) => (
                <div key={player.id} className="flex items-center justify-between rounded-xl border border-line bg-void-2/50 p-3.5">
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold',
                      idx === 0 ? 'bg-gold/20 text-gold' :
                      idx === 1 ? 'bg-white/15 text-ink-soft' :
                      idx === 2 ? 'bg-amber-700/30 text-amber-500' : 'bg-void text-ink-faint'
                    )}>
                      {idx === 0 ? <Crown className="h-3.5 w-3.5" /> : idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-ink">{player.player_name}</p>
                      <span className="text-[9px] font-medium text-ink-faint">{player.games_played} مسابقات</span>
                    </div>
                  </div>
                  <span className="font-display text-xs font-extrabold text-gold">{player.total_score}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Winners archive */}
        <div className="space-y-4 lg:col-span-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Calendar className="h-5 w-5 text-cyan" />
            تاريخ منصات التتويج
          </h3>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {winners.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لم يتم إنهاء وأرشفة أي مسابقات بعد.</div>
            ) : (
              <div className="divide-y divide-line">
                {winners.map((archive) => (
                  <div key={archive.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-white/5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-ink md:text-base">{archive.session_title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {archive.total_players} لاعب
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(archive.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-start rounded-xl border border-gold/25 bg-gold/10 px-4 py-2 text-xs font-extrabold text-gold md:self-auto">
                      <Trophy className="h-4 w-4 text-gold" />
                      <span>{archive.winner_name}</span>
                      <span className="font-display text-gold/80">({archive.winner_score})</span>
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
