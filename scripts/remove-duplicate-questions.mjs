import fs from 'node:fs/promises';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '/Users/m/Downloads/mosabqah-7cacd-firebase-adminsdk-fbsvc-cca4467b92.json';
const account = JSON.parse(await fs.readFile(serviceAccountPath, 'utf8'));
const app = getApps()[0] || initializeApp({ credential: cert(account) });
const db = getFirestore(app);
const normalize = (value = '') => String(value).trim().replace(/\s+/g, ' ').toLowerCase();

const [questionSnap, sessionSnap] = await Promise.all([db.collection('questions').get(), db.collection('sessions').get()]);
const useCount = new Map();
sessionSnap.docs.forEach((session) => {
  const questionIds = session.data().questionIds;
  if (Array.isArray(questionIds)) questionIds.forEach((id) => useCount.set(id, (useCount.get(id) || 0) + 1));
});

const groups = new Map();
questionSnap.docs.forEach((doc) => {
  const question = doc.data();
  const key = [question.questionText, question.option1, question.option2, question.option3, question.option4, question.correctOption, question.category].map(normalize).join('|');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ id: doc.id, ref: doc.ref, createdAt: question.createdAt?.toMillis?.() || 0 });
});

const replacements = new Map();
const deletions = [];
for (const group of groups.values()) {
  if (group.length < 2) continue;
  group.sort((a, b) => (useCount.get(b.id) || 0) - (useCount.get(a.id) || 0) || a.createdAt - b.createdAt);
  const keep = group[0];
  group.slice(1).forEach((item) => { replacements.set(item.id, keep.id); deletions.push(item.ref); });
}

const updates = [];
sessionSnap.docs.forEach((session) => {
  const original = session.data().questionIds;
  if (!Array.isArray(original)) return;
  const next = [...new Set(original.map((id) => replacements.get(id) || id))];
  if (next.length !== original.length || next.some((id, index) => id !== original[index])) updates.push({ ref: session.ref, questionIds: next });
});

const operations = [
  ...deletions.map((ref) => ({ type: 'delete', ref })),
  ...updates.map((item) => ({ type: 'update', ref: item.ref, questionIds: item.questionIds })),
];
for (let index = 0; index < operations.length; index += 450) {
  const batch = db.batch();
  operations.slice(index, index + 450).forEach((operation) => {
    if (operation.type === 'delete') batch.delete(operation.ref);
    else batch.update(operation.ref, { questionIds: operation.questionIds });
  });
  await batch.commit();
}

console.log(JSON.stringify({ deletedQuestions: deletions.length, updatedSessions: updates.length, remainingQuestions: questionSnap.size - deletions.length }, null, 2));
