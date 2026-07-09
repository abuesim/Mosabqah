'use client';

import { useEffect, useState } from 'react';
import { Document, Page, Text, View, StyleSheet, Font, PDFDownloadLink } from '@react-pdf/renderer';
import { FileText, Download } from 'lucide-react';

// Register Cairo Arabic Font from Google Fonts CDN to ensure Arabic text renders correctly in the PDF
Font.register({
  family: 'Cairo',
  src: 'https://fonts.gstatic.com/s/cairo/v28/SLXGc1GD24t01KuyAIU.ttf',
});

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Cairo',
    padding: 40,
    backgroundColor: '#ffffff',
    fontSize: 12,
  },
  header: {
    textAlign: 'center',
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: '#6366f1',
    paddingBottom: 15,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e1b4b',
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 5,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4f46e5',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingVertical: 8,
    alignItems: 'center',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
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
    color: '#0f172a',
  },
  mutedText: {
    color: '#64748b',
  },
});

// PDF Document Layout
function WinnersPDFDocument({ winners, leaderboard }: { winners: any[]; leaderboard: any[] }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>تقرير نتائج مسابقة عصومي التفاعلية</Text>
          <Text style={styles.subtitle}>تقرير رسمي ملخص لقوائم الصدارة التراكمية ومنصات التتويج التاريخية</Text>
        </View>

        {/* Section 1: Cumulative Leaderboard */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>أعلى المتسابقين في لوحة الصدارة التراكمية</Text>
          
          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.col}>الترتيب</Text>
            <Text style={styles.colWide}>اسم المتسابق</Text>
            <Text style={styles.col}>عدد التحديات</Text>
            <Text style={styles.col}>إجمالي النقاط</Text>
          </View>

          {/* Table Body */}
          {leaderboard.slice(0, 10).map((player, idx) => (
            <View key={player.id} style={styles.tableRow}>
              <Text style={styles.col}>{idx + 1}</Text>
              <Text style={[styles.colWide, styles.boldText]}>{player.player_name}</Text>
              <Text style={styles.col}>{player.games_played}</Text>
              <Text style={[styles.col, styles.boldText]}>{player.total_score}</Text>
            </View>
          ))}
        </View>

        {/* Section 2: Historical Winners */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>سجل منصات التتويج التاريخية</Text>

          {/* Table Header */}
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.colWide}>اسم التحدي / الجلسة</Text>
            <Text style={styles.col}>البطل المتوج</Text>
            <Text style={styles.col}>نقاط الفوز</Text>
            <Text style={styles.col}>عدد اللاعبين</Text>
          </View>

          {/* Table Body */}
          {winners.slice(0, 10).map((w) => (
            <View key={w.id} style={styles.tableRow}>
              <Text style={[styles.colWide, styles.mutedText]}>{w.session_title}</Text>
              <Text style={[styles.col, styles.boldText]}>{w.winner_name}</Text>
              <Text style={styles.col}>{w.winner_score}</Text>
              <Text style={styles.col}>{w.total_players}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

// Download Button Component wrapper
export default function PDFDownloadButton({ winners, leaderboard }: { winners: any[]; leaderboard: any[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <PDFDownloadLink
      document={<WinnersPDFDocument winners={winners} leaderboard={leaderboard} />}
      fileName="mosabqah_results_report.pdf"
      className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all flex items-center gap-2 shadow-lg hover:shadow-purple-500/20"
    >
      {({ loading }) => (
        <>
          <Download className="w-4 h-4" />
          {loading ? 'جاري تجهيز التقرير...' : 'تصدير تقرير PDF 📄'}
        </>
      )}
    </PDFDownloadLink>
  );
}
