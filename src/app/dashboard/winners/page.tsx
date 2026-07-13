'use client';

import { useEffect, useState } from 'react';
import { deleteWinnerArchive, getWinnersArchive, getLeaders, getAllSessions, getAllUserProfiles, getUserProfile } from '@/lib/db';
import type { Winner, LeaderEntry, Session, UserProfile } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Trophy, Award, Calendar, Users, Crown, Trash2, BarChart3, Presentation, FileText } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import Card, { CardHeader } from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';
import dynamic from 'next/dynamic';

const PDFDownloadButton = dynamic(() => import('@/components/PDFDownloadButton'), { ssr: false });

export default function WinnersPage() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [presenters, setPresenters] = useState<UserProfile[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedPresenterId, setSelectedPresenterId] = useState('all');

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); return; }
      try {
        const [token, currentProfile, w, l, allUsers, allSessions] = await Promise.all([
          user.getIdTokenResult(), getUserProfile(user.uid), getWinnersArchive(), getLeaders(), getAllUserProfiles(), getAllSessions(),
        ]);
        setIsAdmin(token.claims.admin === true || currentProfile?.role === 'admin');
        setProfile(currentProfile);
        setWinners(w);
        setLeaderboard(l);
        setPresenters(allUsers.filter(account => account.role === 'presenter'));
        setSessions(allSessions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const deleteArchive = async (archive: Winner) => {
    if (!window.confirm(`هل تريد حذف أرشيف "${archive.sessionTitle}" والفائز ${archive.winnerName} نهائياً؟`)) return;
    await deleteWinnerArchive(archive.id);
    setWinners(current => current.filter(item => item.id !== archive.id));
  };

  const ownerBySession = new Map(sessions.map(session => [session.id, session.createdBy]));
  const presenterById = new Map(presenters.map(presenter => [presenter.uid, presenter]));
  const archivePresenterId = (archive: Winner) => archive.presenterId || ownerBySession.get(archive.sessionId) || 'legacy';
  const archivePresenterName = (archive: Winner) => {
    const owner = presenterById.get(archivePresenterId(archive));
    return archive.presenterName || owner?.displayName || owner?.username || 'مقدم غير محدد';
  };
  const availablePresenterIds = Array.from(new Set([
    ...presenters.map(presenter => presenter.uid),
    ...winners.map(archivePresenterId).filter(id => id !== 'legacy'),
  ]));
  const selectedId = isAdmin ? selectedPresenterId : profile?.uid || 'none';
  const selectedArchives = winners.filter(archive => selectedId === 'all' || archivePresenterId(archive) === selectedId);
  const reportLeaderboard: LeaderEntry[] = (() => {
    const totals = new Map<string, LeaderEntry>();
    selectedArchives.forEach(archive => {
      const participants = archive.participants?.length
        ? archive.participants
        : [{ name: archive.winnerName, score: archive.winnerScore }];
      participants.forEach(participant => {
        const key = participant.name.trim();
        const current = totals.get(key) || { id: key, playerName: key, totalScore: 0, gamesPlayed: 0 };
        totals.set(key, { ...current, totalScore: current.totalScore + (participant.score || 0), gamesPlayed: current.gamesPlayed + 1 });
      });
    });
    return Array.from(totals.values()).sort((a, b) => b.totalScore - a.totalScore);
  })();
  const activeLeaderboard = selectedId === 'all' && selectedArchives.length === 0 ? leaderboard : reportLeaderboard;
  const completedSessions = sessions.filter(session => session.status === 'finished' && (selectedId === 'all' || session.createdBy === selectedId));
  const totalPlayers = selectedArchives.reduce((sum, archive) => sum + (archive.totalPlayers || 0), 0);

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
          <p className="mt-1 text-xs text-ink-mute">{isAdmin ? 'لوحة الإدارة: راجع نتائج كل مقدم، تقاريره، وسجل فوز جلساته من مكان واحد.' : 'استعرض منصات التتويج وتقارير جلساتك فقط.'}</p>
        </div>
        <PDFDownloadButton winners={selectedArchives} leaderboard={activeLeaderboard} />
      </div>

      {isAdmin && (
        <Card glow="neon" className="space-y-5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div><h3 className="flex items-center gap-2 text-lg font-extrabold text-ink"><BarChart3 className="h-5 w-5 text-neon-bright" /> لوحة تقارير المقدمين</h3><p className="mt-1 text-xs text-ink-mute">اختر مقدماً لعرض لوحة فائزين مستقلة وتصدير تقريره.</p></div>
            <select value={selectedPresenterId} onChange={event => setSelectedPresenterId(event.target.value)} className="rounded-xl border border-line bg-void px-4 py-2.5 text-sm font-bold text-ink outline-none">
              <option value="all">التقرير العام — جميع المقدمين</option>
              {availablePresenterIds.map(id => <option key={id} value={id}>{presenterById.get(id)?.displayName || presenterById.get(id)?.username || winners.find(archive => archivePresenterId(archive) === id)?.presenterName || 'مقدم'}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: selectedId === 'all' ? 'إجمالي المقدمين' : 'المقدم المختار', value: selectedId === 'all' ? availablePresenterIds.length : archivePresenterName(selectedArchives[0] || { presenterId: selectedId } as Winner), icon: Presentation, color: 'text-neon-bright' },
              { label: 'جلسات منتهية', value: completedSessions.length, icon: Calendar, color: 'text-cyan' },
              { label: 'أرشيفات فوز', value: selectedArchives.length, icon: Trophy, color: 'text-gold' },
              { label: 'إجمالي المشاركين', value: totalPlayers, icon: Users, color: 'text-success-bright' },
            ].map(({ label, value, icon: Icon, color }) => <div key={label} className="rounded-2xl border border-line bg-void/35 p-4"><Icon className={`h-5 w-5 ${color}`} /><p className="mt-3 text-[10px] font-bold text-ink-mute">{label}</p><p className={`mt-1 truncate font-display text-xl font-black ${color}`}>{value}</p></div>)}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {availablePresenterIds.map(id => { const presenter = presenterById.get(id); const count = winners.filter(archive => archivePresenterId(archive) === id).length; return <button key={id} type="button" onClick={() => setSelectedPresenterId(id)} className={cn('min-w-44 rounded-xl border p-3 text-right transition', selectedId === id ? 'border-neon/40 bg-neon/10' : 'border-line bg-void/30 hover:bg-white/5')}><p className="truncate text-xs font-bold text-ink">{presenter?.displayName || presenter?.username || winners.find(archive => archivePresenterId(archive) === id)?.presenterName || 'مقدم'}</p><p className="mt-1 text-[10px] text-ink-mute">{count} جلسات مؤرشفة</p></button>; })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Cumulative leaderboard */}
        <Card glow="gold" className="space-y-5 p-6 lg:col-span-1">
          <CardHeader title={selectedId === 'all' ? 'لوحة الصدارة العامة' : 'لوحة فائزين المقدم'} icon={<Award className="h-5 w-5" />} accent="gold" />
          <p className="text-xs text-ink-mute">ترتيب مستخرج من نتائج الجلسات المؤرشفة ضمن التقرير المحدد.</p>

          <div className="space-y-2">
            {activeLeaderboard.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-faint">لا توجد نقاط تراكمية مسجلة بعد.</div>
            ) : (
              activeLeaderboard.map((player, idx) => (
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
                      <p className="text-xs font-bold text-ink">{player.playerName}</p>
                      <span className="text-[9px] font-medium text-ink-faint">{player.gamesPlayed} مسابقات</span>
                    </div>
                  </div>
                  <span className="font-display text-xs font-extrabold text-gold">{player.totalScore}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Winners archive */}
        <div className="space-y-4 lg:col-span-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
            <Calendar className="h-5 w-5 text-cyan" />
            {selectedId === 'all' ? 'تاريخ منصات التتويج' : `أرشيف ${archivePresenterName(selectedArchives[0] || { presenterId: selectedId } as Winner)}`}
          </h3>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {selectedArchives.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لم يتم إنهاء وأرشفة أي مسابقات بعد.</div>
            ) : (
              <div className="divide-y divide-line">
                {selectedArchives.map((archive) => (
                  <div key={archive.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-white/5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-ink md:text-base">{archive.sessionTitle}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        {isAdmin && <span className="flex items-center gap-1 text-neon-bright"><Presentation className="h-3.5 w-3.5" /> {archivePresenterName(archive)}</span>}
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {archive.totalPlayers} لاعب
                        </span>
                        <span>•</span>
                        <span>
                          {archive.createdAt?.toDate
                            ? archive.createdAt.toDate().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 self-start md:self-auto">
                    <div className="flex items-center gap-3 rounded-xl border border-gold/25 bg-gold/10 px-4 py-2 text-xs font-extrabold text-gold">
                      <Trophy className="h-4 w-4 text-gold" />
                      <span>{archive.winnerName}</span>
                      <span className="font-display text-gold/80">({archive.winnerScore})</span>
                    </div>
                    {isAdmin && <button onClick={() => void deleteArchive(archive)} className="grid h-9 w-9 place-items-center rounded-lg border border-danger/30 bg-danger/10 text-danger-bright transition hover:bg-danger/20" title="حذف الأرشيف" aria-label="حذف الأرشيف"><Trash2 className="h-4 w-4" /></button>}
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
