import XLSX from 'xlsx';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'node:fs';

const workbookPath = process.argv[2];
const serviceAccountPath = process.argv[3];
if (!workbookPath || !serviceAccountPath) throw new Error('Usage: node scripts/import-word-questions.mjs <xlsx> <service-account-json>');

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);
const workbook = XLSX.readFile(workbookPath);
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const headers = rows[0].map(value => normalize(value));
const indexOf = (name) => headers.findIndex(header => header.includes(name));
const typeIndex = indexOf('نوع السؤال'); const textIndex = indexOf('نص السؤال'); const option1Index = indexOf('الخيار الأول');
const option2Index = indexOf('الخيار الثاني'); const option3Index = indexOf('الخيار الثالث'); const option4Index = indexOf('الخيار الرابع');
const categoryIndex = indexOf('التصنيف'); const difficultyIndex = indexOf('الصعوبة');
const existing = await db.collection('questions').get();
const keys = new Set(existing.docs.filter(doc => doc.data().questionType === 'word').map(doc => `${normalize(doc.data().questionText)}|${normalize(doc.data().option1)}|${normalize(doc.data().category)}`));
const questions = rows.slice(1).flatMap(row => {
  if (normalize(row[typeIndex]) !== 'word') return [];
  const questionText = String(row[textIndex] || '').trim(); const option1 = String(row[option1Index] || '').trim(); const category = String(row[categoryIndex] || 'عامة').trim();
  const key = `${normalize(questionText)}|${normalize(option1)}|${normalize(category)}`;
  if (!questionText || !option1 || keys.has(key)) return [];
  keys.add(key);
  const rawDifficulty = normalize(row[difficultyIndex]);
  return [{ questionText, questionType: 'word', imageUrl: '', option1, option2: String(row[option2Index] || '').trim(), option3: String(row[option3Index] || '').trim(), option4: String(row[option4Index] || '').trim(), correctOption: 1, category, difficulty: rawDifficulty.includes('hard') || rawDifficulty.includes('صعب') ? 'hard' : rawDifficulty.includes('easy') || rawDifficulty.includes('سهل') ? 'easy' : 'medium', createdBy: 'excel-word-import', importSource: 'word-excel-2026-07-12', createdAt: FieldValue.serverTimestamp() }];
});
for (let start = 0; start < questions.length; start += 400) {
  const batch = db.batch();
  questions.slice(start, start + 400).forEach(question => batch.set(db.collection('questions').doc(), question));
  await batch.commit();
}
console.log(JSON.stringify({ imported: questions.length, skipped: rows.length - 1 - questions.length }));
