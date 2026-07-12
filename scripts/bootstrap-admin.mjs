import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;
const rawAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ?? (process.env.FIREBASE_SERVICE_ACCOUNT_FILE
    ? await readFile(process.env.FIREBASE_SERVICE_ACCOUNT_FILE, 'utf8')
    : undefined);
if (!username || !rawAccount) throw new Error('عيّن ADMIN_USERNAME وFIREBASE_SERVICE_ACCOUNT (أو FIREBASE_SERVICE_ACCOUNT_FILE) قبل تشغيل السكربت.');

const account = JSON.parse(rawAccount);
const app = getApps()[0] ?? initializeApp({ credential: cert({
  projectId: account.project_id,
  clientEmail: account.client_email,
  privateKey: account.private_key.replace(/\\n/g, '\n'),
}) });
const auth = getAuth(app);
const db = getFirestore(app);
const email = `${username.toLowerCase().replace(/\s+/g, '')}@mosabqah.local`;
let user;
try {
  user = await auth.getUserByEmail(email);
  // Existing administrators are promoted without changing their password.
  user = await auth.updateUser(user.uid, { displayName: username, disabled: false });
} catch (error) {
  if (error.code !== 'auth/user-not-found') throw error;
  if (!password || password.length < 6) throw new Error('لإنشاء حساب مدير جديد، كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  user = await auth.createUser({ email, password, displayName: username });
}
await auth.setCustomUserClaims(user.uid, { admin: true });
await db.collection('users').doc(user.uid).set({ username, displayName: username, role: 'admin', createdAt: FieldValue.serverTimestamp() }, { merge: true });
console.log(`تم إنشاء/ترقية حساب المدير: ${username}`);
