import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const workbookPath = '/Users/m/Downloads/قالب_صور_عامة (1).xlsx';
const flagsDir = path.resolve('flag-icons_ Free Country Flags in SVG_files');
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/Users/m/Downloads/mosabqah-7cacd-firebase-adminsdk-fbsvc-cca4467b92.json';
const importSource = 'flags-excel-v1';
const publicAssetBase = 'https://mosabqah.vercel.app/flags';

const account = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
const app = getApps()[0] || initializeApp({
  credential: cert(account),
});
const db = getFirestore(app);

function normalizeDifficulty(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('hard') || text.includes('صعب')) return 'hard';
  if (text.includes('easy') || text.includes('سهل')) return 'easy';
  return 'medium';
}

const workbook = XLSX.readFile(workbookPath);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(1);
const existing = await db.collection('questions').where('importSource', '==', importSource).get();
const importedRows = new Set(existing.docs.map((doc) => doc.data().importRow));
let imported = 0;
let skipped = 0;
let batch = db.batch();
let writes = 0;

for (let index = 0; index < rows.length; index += 1) {
  const row = rows[index];
  const importRow = index + 2;
  if (importedRows.has(importRow)) { skipped += 1; continue; }
  const [type, questionText, fileName, option1, option2, option3, option4, correctOption, category, difficulty] = row.map((value) => String(value || '').trim());
  if (type !== 'image' || !questionText || !fileName || !option1 || !option2 || !option3 || !option4) throw new Error(`صف غير صالح في Excel: ${importRow}`);
  const localImage = path.join(flagsDir, fileName);
  await fs.access(localImage);
  batch.set(db.collection('questions').doc(), {
    questionText,
    questionType: 'image',
    imageUrl: `${publicAssetBase}/${encodeURIComponent(fileName)}`,
    option1, option2, option3, option4,
    correctOption: Number(correctOption) || 1,
    category: category || 'عامة',
    difficulty: normalizeDifficulty(difficulty),
    createdBy: 'admin-import',
    importSource,
    importRow,
    createdAt: FieldValue.serverTimestamp(),
  });
  imported += 1;
  writes += 1;
  if (writes === 450) { await batch.commit(); batch = db.batch(); writes = 0; }
}
if (writes) await batch.commit();
console.log(JSON.stringify({ imported, skipped, total: rows.length }, null, 2));
