'use client';

import { useEffect, useState } from 'react';
import { Document, Page, Text, View, StyleSheet, Font, PDFDownloadLink } from '@react-pdf/renderer';
import { Download } from 'lucide-react';
import type { Winner, LeaderEntry } from '@/lib/db';

// Register Cairo Arabic Font from Google Fonts CDN to ensure Arabic text renders correctly in the PDF
Font.register({
  family: 'Cairo',
  src: 'https://fonts.gstatic.com/s/cairo/v28/SLXGc1GD24t01KuyAIU.ttf',
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Cairo',
    padding: 40,
    backgroundColor: '#070314',
    fontSize: 12,
    color: '#f5f3ff',
  },
  header: {
    textAlign: 'center',
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: '#a855f7',
    paddingBottom: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#c084fc',
  },
  subtitle: {
    fontSize: 10,
    color: '#8b7fb8',
    marginTop: 5,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fbbf24',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a1d4a',
    paddingBottom: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1130',
    paddingVertical: 8,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#100a2e',
    borderBottomWidth: 2,
    borderBottomColor: '#a855f7',
  },
  col: {
    flex: 1,
    textAlign: 'center',
  },
  colWide: {
    flex: 2,
    textAlign: 'center',
  },
  boldText: {
    fontWeight: 'bold',
    color: '#f5f3ff',
  },
  mutedText: {
    color: '#c4b5fd',
  },
});

function WinnersPDFDocument({ winners, leaderboard }: { winners: Winner[]; leaderboard: LeaderEntry[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>تقرير نتائج مسابقة عصومي التفاعلية</Text>
          <Text style={styles.subtitle}>تقرير رسمي ملخص لقوائم الصدارة التراكمية ومنصات التتويج التاريخية</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>أعلى المتسابقين في لوحة الصدارة التراكمية</Text>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.col}>الترتيب</Text>
            <Text style={styles.colWide}>اسم المتسابق</Text>
            <Text style={styles.col}>عدد التحديات</Text>
            <Text style={styles.col}>إجمالي النقاط</Text>
          </View>
          {leaderboard.slice(0, 10).map((player, idx) => (
            <View key={player.id} style={styles.tableRow}>
              <Text style={styles.col}>{idx + 1}</Text>
              <Text style={[styles.colWide, styles.boldText]}>{player.playerName}</Text>
              <Text style={styles.col}>{player.gamesPlayed}</Text>
              <Text style={[styles.col, styles.boldText]}>{player.totalScore}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>سجل منصات التتويج التاريخية</Text>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.colWide}>اسم التحدي / الجلسة</Text>
            <Text style={styles.col}>البطل المتوج</Text>
            <Text style={styles.col}>نقاط الفوز</Text>
            <Text style={styles.col}>عدد اللاعبين</Text>
          </View>
          {winners.slice(0, 10).map((w) => (
            <View key={w.id} style={styles.tableRow}>
              <Text style={[styles.colWide, styles.mutedText]}>{w.sessionTitle}</Text>
              <Text style={[styles.col, styles.boldText]}>{w.winnerName}</Text>
              <Text style={styles.col}>{w.winnerScore}</Text>
              <Text style={styles.col}>{w.totalPlayers}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export default function PDFDownloadButton({ winners, leaderboard }: { winners: Winner[]; leaderboard: LeaderEntry[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <PDFDownloadLink
      document={<WinnersPDFDocument winners={winners} leaderboard={leaderboard} />}
      fileName="mosabqah_results_report.pdf"
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-gradient-to-l from-gold-deep to-gold px-4 py-2.5 text-xs font-extrabold text-[#1a1206] shadow-[var(--shadow-gold)] transition-all hover:brightness-105"
    >
      {({ loading }) => (
        <>
          <Download className="h-4 w-4" />
          {loading ? 'جاري التجهيز...' : 'تصدير تقرير PDF'}
        </>
      )}
    </PDFDownloadLink>
  );
}
