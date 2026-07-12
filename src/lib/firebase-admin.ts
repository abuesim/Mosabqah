import 'server-only';

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('إعداد FIREBASE_SERVICE_ACCOUNT غير موجود على الخادم.');
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error('إعداد FIREBASE_SERVICE_ACCOUNT ليس JSON صالحاً.');
  }
}

export function getAdminApp(): App {
  if (getApps().length) return getApps()[0]!;
  const account = getServiceAccount();
  return initializeApp({
    credential: cert({
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key.replace(/\\n/g, '\n'),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${account.project_id}.firebasestorage.app`,
  });
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminDb = () => getFirestore(getAdminApp());
export const adminStorage = () => getStorage(getAdminApp());

export async function requireAuthenticated(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('UNAUTHENTICATED');
  return adminAuth().verifyIdToken(token);
}

export async function requireAdmin(request: Request) {
  const decoded = await requireAuthenticated(request);
  if (decoded.admin !== true) throw new Error('FORBIDDEN');
  return decoded;
}
