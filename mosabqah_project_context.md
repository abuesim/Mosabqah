# 🏆 Mosabqah SaaS Platform (Next.js + Firebase)

This file contains the complete source code and architecture of the Mosabqah project to serve as a comprehensive context for AI pair programming.

## 📁 Project Architecture & File Tree
```
Mosabqah/
├── firestore.rules          # Firebase Firestore security rules
├── package.json             # Dependencies (React 19, Next.js 16, SheetJS, Lucide)
└── src/
    ├── components/          # Reusable UI elements
    ├── lib/
    │   ├── firebase.ts      # Firebase configuration & initialization
    │   └── db.ts            # Database helper routines & real-time listeners
    └── app/
        ├── page.tsx         # Welcome Portal (RTL, Premium Dark Mesh Design)
        ├── auth/            # Sign In / Sign Up (timed out, maps Firebase errors)
        ├── dashboard/       # Presenter Dashboard main screen
        │   ├── questions/   # Question Library (Excel upload, Categories scroll tabs)
        │   └── sessions/    # Control Room (Active game console, hint broadcaster, TV settings)
        ├── player/          # Mobile client (real-time question HUD, hint popups, streak, 50:50 lifelines)
        └── tv/              # Projector clean output (flexible sizes, logos, background colors)
```

## 📄 File: `firestore.rules`

```rules
rules_version = '2';

// ============================================================
//  Mosabqah — Firestore Security Rules
//  Mirrors the original Supabase RLS policies:
//   - Players/answers: public (join game by room code, no account)
//   - Questions: read by authenticated, modify by admin only
//   - Sessions: public read, owner manages
//   - Leaderboard: public read, authenticated write
//   - Winners archive: public read, presenter insert
//   - Users (profiles): public read, self write
// ============================================================

service cloud.firestore {
  match /databases/{database}/documents {

    // Helper: is the current user an admin?
    function isAdmin() {
      return request.auth != null
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // ---------- users/{uid} (profiles) ----------
    // Public read (navbar shows names), self write only.
    match /users/{uid} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == uid;
    }

    // ---------- questions/{id} ----------
    // Authenticated can read (build sessions); only admins modify.
    match /questions/{id} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }

    // ---------- sessions/{id} ----------
    // Public read (TV + players join by room code with no account).
    // Owner manages own session. Players/answers subcollections public.
    match /sessions/{sessionId} {
      allow read: if true;
      allow create, update, delete: if request.auth != null
        && request.resource.data.createdBy == request.auth.uid;

      // ---------- players (public contestants) ----------
      match /players/{playerId} {
        allow read: if true;
        allow create: if true;
        // Allow score/streak/lifeline updates from the host or self.
        // Host context: no easy uid check, so allow updates (the game flow needs it).
        allow update: if true;
      }

      // ---------- answers (contestant submissions) ----------
      match /answers/{answerId} {
        allow read: if true;
        allow create: if true;
        allow update, delete: if false;
      }
    }

    // ---------- winners/{id} (archive) ----------
    // Public read; any authenticated user (presenter) can insert on game end.
    match /winners/{id} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if isAdmin();
    }

    // ---------- leaderboard/{playerName} (cumulative) ----------
    // Public read; authenticated write (incremented on game end).
    match /leaderboard/{playerName} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}

```

## 📄 File: `src/lib/firebase.ts`

```typescript
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase initialization.
 * Reads config from NEXT_PUBLIC_FIREBASE_* env vars (set in .env.local / Vercel).
 * Falls back to safe placeholders so `next build` doesn't crash when vars
 * are missing — same pattern as the old Supabase client.
 */

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'placeholder-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'placeholder.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'placeholder.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '0000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'placeholder-app-id',
};

if (
  !process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  Firebase env vars missing (NEXT_PUBLIC_FIREBASE_*).\n' +
    '   Add them in Vercel → Settings → Environment Variables.\n'
  );
}

// initializeApp is idempotent if called with the same config, but Next.js
// hot-reloading can re-run module scope — guard with getApps().
export const app: FirebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// NOTE: Analytics is intentionally omitted — it requires a browser-only
// environment and breaks SSR / static prerendering in Next.js.

```

## 📄 File: `src/lib/db.ts`

```typescript
/**
 * db.ts — data abstraction layer over Firebase Auth + Firestore.
 *
 * Every page imports from here instead of touching Firebase directly.
 * This keeps pages clean and centralizes all DB/auth logic.
 *
 * Collections:
 *   users/{uid}                    profile { username, role, createdAt }
 *   questions/{id}                 question bank
 *   sessions/{id}                  game room + nested players/answers
 *   sessions/{id}/players/{pid}    contestants
 *   sessions/{id}/answers/{aid}    submissions
 *   winners/{id}                   historical winners archive
 *   leaderboard/{playerName}       cumulative standings
 */

import {
  auth, db,
} from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  increment, runTransaction, getCountFromServer,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';

/* ============================================================= */
/* Types                                                          */
/* ============================================================= */

export type Role = 'admin' | 'presenter';

export interface UserProfile {
  uid: string;
  username: string;
  role: Role;
  createdAt?: any;
}

export interface Question {
  id: string;
  questionText: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correctOption: number;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  createdBy?: string;
  createdAt?: any;
}

export interface Session {
  id: string;
  title: string;
  roomCode: string;
  status: 'waiting' | 'active' | 'finished';
  currentQuestionId: string | null;
  questionStatus: 'idle' | 'showing' | 'revealed' | 'time_up';
  timerDuration: number;
  showScoreboard: boolean;
  createdBy: string;
  createdAt?: any;
  questionIds: string[];
  currentHint?: string | null;
  tvBgColor?: string;
  tvLogoText?: string;
  tvFontSize?: 'sm' | 'md' | 'lg' | 'xl';
  overlayMode?: 'normal' | 'chroma' | 'transparent';
}

export interface Player {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  score: number;
  streak: number;
  lifelinesRemaining: number;
  lifelinesTimeRemaining: number;
  isActive: boolean;
  createdAt?: any;
}

export interface Answer {
  id: string;
  sessionId: string;
  playerId: string;
  questionId: string;
  chosenOption: number;
  isCorrect: boolean;
  timeSpent: number;
  createdAt?: any;
}

export interface Winner {
  id: string;
  sessionId: string;
  sessionTitle: string;
  winnerName: string;
  winnerScore: number;
  totalPlayers: number;
  createdAt?: any;
}

export interface LeaderEntry {
  id: string;
  playerName: string;
  totalScore: number;
  gamesPlayed: number;
  updatedAt?: any;
}

/* ============================================================= */
/* AUTH                                                           */
/* ============================================================= */

/**
 * Internal email synthesis from username.
 * Firebase Auth needs an email-format string; we don't deliver to it.
 * No email verification / confirmation is ever sent.
 */
const toInternalEmail = (username: string) =>
  `${username.trim().toLowerCase().replace(/\s+/g, '')}@mosabqah.local`;

async function setDocWithTimeout(docRef: any, data: any, timeoutMs = 6000) {
  const writePromise = setDoc(docRef, data);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout_firestore')), timeoutMs)
  );
  try {
    await Promise.race([writePromise, timeoutPromise]);
  } catch (err: any) {
    if (err.message === 'timeout_firestore') {
      throw new Error('تعذر الاتصال بقاعدة بيانات Firestore. يرجى التأكد من تفعيل وإنشاء قاعدة البيانات (Firestore Database) داخل لوحة تحكم Firebase وتغيير القواعد للوضع التجريبي (Test Mode).');
    }
    throw err;
  }
}

/** Sign up: create auth user + profile doc in users/{uid}. */
export async function signUp(username: string, password: string, role: Role): Promise<UserProfile> {
  const email = toInternalEmail(username);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  const profile = {
    username: username.trim(),
    role,
    createdAt: serverTimestamp(),
  };
  await setDocWithTimeout(doc(db, 'users', uid), profile);

  return { uid, ...profile };
}

/** Sign in by username + password. */
export async function signIn(username: string, password: string): Promise<void> {
  const email = toInternalEmail(username);
  await signInWithEmailAndPassword(auth, email, password);
}

/** Sign in with Google provider. */
export async function signInWithGoogle(): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  const uid = user.uid;

  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    const profile = {
      username: user.displayName || user.email?.split('@')[0] || 'مستخدم جوجل',
      role: 'presenter' as Role,
      createdAt: serverTimestamp(),
    };
    await setDocWithTimeout(docRef, profile);
    return { uid, ...profile };
  }

  return { uid, ...(snap.data() as any) };
}

/** Returns current Firebase user or null. Synchronous-ish via currentUser. */
export function getCurrentUser() {
  return auth.currentUser;
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

/** Read a user's profile { username, role }. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as any) };
}

/* ============================================================= */
/* QUESTIONS                                                      */
/* ============================================================= */

const qColl = () => collection(db, 'questions');

export async function getQuestions(): Promise<Question[]> {
  const snap = await getDocs(query(qColl(), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
}

export async function addQuestion(data: Omit<Question, 'id'>): Promise<string> {
  const ref = await addDoc(qColl(), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'questions', id));
}

export async function bulkAddQuestions(items: Omit<Question, 'id'>[]): Promise<number> {
  // Firestore doesn't have a batch addDoc that returns IDs in one call;
  // do them in parallel (the question bank import isn't huge).
  await Promise.all(items.map(item => addDoc(qColl(), { ...item, createdAt: serverTimestamp() })));
  return items.length;
}

/* ============================================================= */
/* SESSIONS                                                       */
/* ============================================================= */

const sessionsColl = () => collection(db, 'sessions');

export async function getSessions(userId: string): Promise<Session[]> {
  const snap = await getDocs(
    query(sessionsColl(), where('createdBy', '==', userId), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
}

export async function getSessionById(id: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, 'sessions', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Session;
}

export async function getSessionByRoomCode(code: string): Promise<Session | null> {
  const snap = await getDocs(query(sessionsColl(), where('roomCode', '==', code), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Session;
}

export async function createSession(data: Omit<Session, 'id' | 'createdAt'>): Promise<string> {
  const ref = await addDoc(sessionsColl(), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function updateSession(id: string, patch: Partial<Session>): Promise<void> {
  await updateDoc(doc(db, 'sessions', id), patch as any);
}

/** Fetch the actual question docs for a session's questionIds. */
export async function getSessionQuestions(questionIds: string[]): Promise<Question[]> {
  if (!questionIds.length) return [];
  // Firestore "in" query supports max 30 values; the bank fits.
  const snap = await getDocs(query(qColl(), where('__name__', 'in', questionIds)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
}

/* ============================================================= */
/* PLAYERS (subcollection: sessions/{id}/players)                */
/* ============================================================= */

export async function getPlayers(sessionId: string): Promise<Player[]> {
  const coll = collection(db, 'sessions', sessionId, 'players');
  const snap = await getDocs(query(coll, orderBy('score', 'desc')));
  return snap.docs.map(d => ({ id: d.id, sessionId, ...d.data() } as Player));
}

export async function getPlayerByName(sessionId: string, name: string): Promise<Player | null> {
  const coll = collection(db, 'sessions', sessionId, 'players');
  const snap = await getDocs(query(coll, where('name', '==', name.trim()), limit(1)));
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, sessionId, ...d.data() } as Player;
}

export async function createPlayer(sessionId: string, data: Omit<Player, 'id' | 'sessionId' | 'createdAt'>): Promise<Player> {
  const coll = collection(db, 'sessions', sessionId, 'players');
  const ref = await addDoc(coll, { ...data, createdAt: serverTimestamp() });
  return { id: ref.id, sessionId, ...data };
}

export async function updatePlayer(sessionId: string, playerId: string, patch: Partial<Player>): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', playerId), patch as any);
}

/* ============================================================= */
/* ANSWERS (subcollection: sessions/{id}/answers)                */
/* ============================================================= */

export async function submitAnswer(sessionId: string, data: Omit<Answer, 'id' | 'sessionId' | 'createdAt'>): Promise<void> {
  const coll = collection(db, 'sessions', sessionId, 'answers');
  await addDoc(coll, { ...data, sessionId, createdAt: serverTimestamp() });
}

export async function getAnswerCount(sessionId: string, questionId: string): Promise<number> {
  const coll = collection(db, 'sessions', sessionId, 'answers');
  const snap = await getDocs(query(coll, where('questionId', '==', questionId)));
  return snap.size;
}

export async function getAnswersForQuestion(sessionId: string, questionId: string): Promise<Answer[]> {
  const coll = collection(db, 'sessions', sessionId, 'answers');
  const snap = await getDocs(query(coll, where('questionId', '==', questionId)));
  return snap.docs.map(d => ({ id: d.id, sessionId, ...d.data() } as Answer));
}

export async function getPlayerAnswer(sessionId: string, playerId: string, questionId: string): Promise<Answer | null> {
  const coll = collection(db, 'sessions', sessionId, 'answers');
  const snap = await getDocs(
    query(coll, where('playerId', '==', playerId), where('questionId', '==', questionId), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, sessionId, ...d.data() } as Answer;
}

/* ============================================================= */
/* WINNERS ARCHIVE + LEADERBOARD                                  */
/* ============================================================= */

export async function archiveWinner(data: Omit<Winner, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'winners'), { ...data, createdAt: serverTimestamp() });
}

export async function getWinnersArchive(): Promise<Winner[]> {
  const snap = await getDocs(query(collection(db, 'winners'), orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Winner));
}

export async function getLeaders(): Promise<LeaderEntry[]> {
  const snap = await getDocs(query(collection(db, 'leaderboard'), orderBy('totalScore', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaderEntry));
}

/**
 * Upsert a player's cumulative score. Replaces the Supabase RPC
 * `increment_cumulative_score` using a transaction.
 */
export async function incrementCumulativeScore(playerName: string, scoreAdded: number): Promise<void> {
  const ref = doc(db, 'leaderboard', playerName);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists()) {
      const data = snap.data();
      txn.update(ref, {
        totalScore: (data.totalScore || 0) + scoreAdded,
        gamesPlayed: (data.gamesPlayed || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      txn.set(ref, {
        playerName,
        totalScore: scoreAdded,
        gamesPlayed: 1,
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/* ============================================================= */
/* COUNTS (dashboard stats)                                       */
/* ============================================================= */

export async function getCounts(): Promise<{ questionsCount: number; sessionsCount: number; winnersCount: number }> {
  const [qSnap, sSnap, wSnap] = await Promise.all([
    getCountFromServer(collection(db, 'questions')),
    getCountFromServer(collection(db, 'sessions')),
    getCountFromServer(collection(db, 'winners')),
  ]);
  return {
    questionsCount: qSnap.data().count,
    sessionsCount: sSnap.data().count,
    winnersCount: wSnap.data().count,
  };
}

/* ============================================================= */
/* REALTIME SUBSCRIPTIONS (onSnapshot)                            */
/* ============================================================= */

/** Watch a single session doc for changes (host console, player, TV). */
export function subscribeSession(sessionId: string, cb: (session: Session | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } as Session : null);
  });
}

/** Watch a single player doc (contestant's own score/streak/lifelines). */
export function subscribePlayer(sessionId: string, playerId: string, cb: (player: Player | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'sessions', sessionId, 'players', playerId), (snap) => {
    cb(snap.exists() ? { id: snap.id, sessionId, ...snap.data() } as Player : null);
  });
}

/** Watch all players in a session, sorted by score desc (leaderboard). */
export function subscribeSessionPlayers(sessionId: string, cb: (players: Player[]) => void): Unsubscribe {
  const coll = collection(db, 'sessions', sessionId, 'players');
  return onSnapshot(query(coll, orderBy('score', 'desc')), (snap) => {
    cb(snap.docs.map(d => ({ id: d.id, sessionId, ...d.data() } as Player)));
  });
}

/**
 * Watch the answer count for a specific question in a session.
 * Returns the count via callback whenever an answer is added/removed.
 */
export function subscribeAnswerCount(
  sessionId: string,
  questionId: string,
  cb: (count: number) => void
): Unsubscribe {
  const coll = collection(db, 'sessions', sessionId, 'answers');
  return onSnapshot(query(coll, where('questionId', '==', questionId)), (snap) => {
    cb(snap.size);
  });
}

```

## 📄 File: `src/app/page.tsx`

```typescript
import Link from 'next/link';
import { Trophy, ShieldCheck, Monitor, Gamepad2 } from 'lucide-react';
import Background from '@/components/ui/Background';

export default function Home() {
  return (
    <Background className="grid place-items-center p-4 md:p-6">
      <div className="anim-rise w-full max-w-xl">
        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="anim-float mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <h1 className="font-brand text-5xl text-gradient md:text-6xl">
            مُسَابَقَة عَصُومِي
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-ink-mute md:text-base">
            المنصة التفاعلية المتكاملة لإدارة التحديات والمسابقات العائلية بالوقت الفعلي
          </p>
        </div>

        {/* Portal cards */}
        <div className="flex flex-col gap-4">
          <PortalCard
            href="/player"
            icon={<Gamepad2 className="h-6 w-6" />}
            title="دخول كمتسابق"
            desc="انضم إلى الجلسة النشطة وأجب عن الأسئلة من هاتفك"
            tone="neon"
          />
          <PortalCard
            href="/dashboard"
            icon={<ShieldCheck className="h-6 w-6" />}
            title="لوحة تحكم مقدم اللعبة"
            desc="سجل الدخول لإدارة بنك الأسئلة المركزي والتحكم بجلساتك"
            tone="cyan"
          />

          {/* TV hint */}
          <div className="glass flex items-center gap-4 rounded-[var(--radius-card)] p-5 text-right">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
              <Monitor className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">شاشة التلفزيون للجمهور</p>
              <p className="mt-0.5 text-xs text-ink-mute">
                لعرض الأسئلة والنتيجة على الشاشة الكبيرة، استخدم الرابط مع كود الغرفة:
              </p>
              <code dir="ltr" className="mt-2 inline-block rounded-lg border border-line bg-void/60 px-3 py-1 font-display text-xs font-bold text-gold select-all">
                /tv?code=XXXX
              </code>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-[11px] text-ink-faint">
          الإصدار 3.0.0 SaaS • برمجة محمد المسند 0565406221
        </p>
      </div>
    </Background>
  );
}

function PortalCard({
  href,
  icon,
  title,
  desc,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tone: 'neon' | 'cyan';
}) {
  const toneClasses =
    tone === 'neon'
      ? 'from-neon/15 to-neon-deep/5 border-neon/20 hover:border-neon/40 text-neon-bright'
      : 'from-cyan/15 to-cyan-deep/5 border-cyan/20 hover:border-cyan/40 text-cyan';

  return (
    <Link
      href={href}
      className={`group glass rounded-[var(--radius-card)] border bg-gradient-to-l p-5 transition-all duration-300 hover:shadow-[var(--shadow-neon)] ${toneClasses}`}
    >
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 ${tone === 'neon' ? 'text-neon-bright' : 'text-cyan'} transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-extrabold text-ink">{title}</h4>
          <p className="mt-0.5 text-xs text-ink-mute">{desc}</p>
        </div>
      </div>
    </Link>
  );
}

```

## 📄 File: `src/app/auth/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signUp, signIn, signInWithGoogle } from '@/lib/db';
import { cn } from '@/lib/utils';
import Background from '@/components/ui/Background';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { KeyRound, User, ShieldCheck, ArrowRightLeft, Mic, Settings, Zap } from 'lucide-react';

/**
 * Username-based auth (Firebase Email/Password).
 *
 * Firebase doesn't require email deliverability or confirmation, so no
 * verification emails are ever sent and there are no rate-limit issues.
 * Internally we synthesize "<username>@mosabqah.local" because Firebase
 * Auth needs an email-format string; the user only ever sees username.
 */
function mapAuthError(raw: string): string {
  const msg = raw.toLowerCase();
  if (msg.includes('email-already-in-use') || msg.includes('already in use')) {
    return 'اسم المستخدم محجوز مسبقاً. اختر اسماً آخر.';
  }
  if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found') || msg.includes('invalid-login')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة.';
  }
  if (msg.includes('weak-password') || msg.includes('password should be at least')) {
    return 'كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.';
  }
  if (msg.includes('too-many-requests') || msg.includes('rate')) {
    return 'محاولات كثيرة فاشلة. انتظر دقيقة ثم حاول مرة أخرى.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول.';
  }
  return raw;
}

export default function AuthPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'presenter'>('presenter');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError('يرجى إدخال اسم المستخدم.');
      return;
    }

    setLoading(true);

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        setLoading(false);
        setError('استغرق الاتصال بقاعدة البيانات وقتاً طويلاً. تأكد من تفعيل وإنشاء قاعدة بيانات Firestore في لوحة تحكم Firebase (بوضع التحدي/التجربة أو تفعيل القراءة والكتابة).');
      }
    }, 12000);

    try {
      if (isSignUp) {
        await signUp(cleanUsername, password, role);
      } else {
        await signIn(cleanUsername, password);
      }
      resolved = true;
      clearTimeout(timeoutId);
      router.push('/dashboard');
    } catch (err: any) {
      resolved = true;
      clearTimeout(timeoutId);
      console.error('🔴 Auth Error:', err);
      setError(mapAuthError(err?.message || String(err)));
    } finally {
      if (resolved) {
        setLoading(false);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (err: any) {
      setError(mapAuthError(err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Background className="grid min-h-screen place-items-center p-4">
      <div className="anim-rise w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="anim-float mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="font-brand text-4xl text-gradient md:text-5xl">مُسَابَقَة عَصُومِي</h1>
          <p className="mt-2 text-sm text-ink-mute">
            {isSignUp ? 'أنشئ حساباً جديداً للانضمام للمنصة' : 'سجل الدخول لإدارة مسابقاتك وأسئلتك'}
          </p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-[var(--radius-card)] p-7 shadow-[var(--shadow-neon)]">
          {error && (
            <div className="anim-shake mb-5 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="اسم المستخدم" htmlFor="username">
              <Input
                id="username"
                type="text"
                required
                autoComplete="username"
                placeholder="اكتب اسم المستخدم"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                icon={<User className="h-5 w-5" />}
              />
            </Field>

            <Field label="كلمة المرور" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<KeyRound className="h-5 w-5" />}
              />
            </Field>

            {isSignUp && (
              <Field label="نوع الحساب / الصلاحيات">
                <div className="grid grid-cols-2 gap-3">
                  <RoleButton
                    active={role === 'presenter'}
                    onClick={() => setRole('presenter')}
                    icon={<Mic className="h-5 w-5" />}
                    label="مقدم مسابقة"
                  />
                  <RoleButton
                    active={role === 'admin'}
                    onClick={() => setRole('admin')}
                    icon={<Settings className="h-5 w-5" />}
                    label="مدير النظام"
                  />
                </div>
              </Field>
            )}

            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading} className="mt-2">
              {loading ? 'جاري التحميل...' : isSignUp ? 'تسجيل حساب جديد' : 'تسجيل الدخول'}
            </Button>
          </form>

          {/* Google Sign-In */}
          <div className="relative my-5 flex items-center justify-center">
            <div className="absolute inset-0 border-t border-line" />
            <span className="relative bg-[#0d0a1b] px-3 text-xs text-ink-mute">أو</span>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line bg-white/5 py-3 text-sm font-bold text-slate-100 transition-all hover:bg-white/10 disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            تسجيل الدخول بواسطة Google
          </button>

          <div className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-mute">
            {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب بعد؟'}{' '}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-neon-bright underline-offset-2 hover:underline"
            >
              <ArrowRightLeft className="h-4 w-4" />
              {isSignUp ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
            </button>
          </div>
        </div>

        <button
          onClick={() => router.push('/')}
          className="mx-auto mt-5 flex cursor-pointer items-center gap-1.5 text-xs text-ink-faint transition-colors hover:text-ink-mute"
        >
          <Zap className="h-3.5 w-3.5" />
          العودة للصفحة الرئيسية
        </button>
      </div>
    </Background>
  );
}

function RoleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-2 rounded-xl border py-4 text-xs font-bold transition-all duration-200',
        active
          ? 'border-neon/60 bg-neon/15 text-neon-bright shadow-[var(--shadow-neon)]'
          : 'border-line bg-void-2/50 text-ink-mute hover:border-line-strong hover:text-ink-soft'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

```

## 📄 File: `src/app/dashboard/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserProfile, getCounts, getSessions } from '@/lib/db';
import type { Session } from '@/lib/db';
import { BookOpen, Layers, Trophy, ArrowLeft, Play, Plus, Mic, Sparkles } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import StatusDot from '@/components/ui/StatusDot';
import Spinner from '@/components/ui/Spinner';

export default function DashboardPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [stats, setStats] = useState({ questionsCount: 0, sessionsCount: 0, winnersCount: 0 });
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        window.location.href = '/auth';
        return;
      }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) setProfile({ id: userProfile.uid, username: userProfile.username, role: userProfile.role });

        const [counts, sessions] = await Promise.all([
          getCounts(),
          getSessions(user.uid),
        ]);
        setStats(counts);
        setActiveSessions(sessions);
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل لوحة التحكم..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4 max-w-md mx-auto anim-rise">
        <div className="p-5 bg-danger/10 border border-danger/25 rounded-2xl text-danger-bright text-sm font-semibold shadow-lg">
          حدث خطأ أثناء تحميل البيانات من قاعدة البيانات:
          <p className="mt-3 font-mono text-xs opacity-90 dir-ltr bg-black/35 p-3 rounded-lg overflow-x-auto text-left select-all">{error}</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl bg-neon text-white font-bold text-sm shadow-[var(--shadow-neon)] hover:opacity-90 transition-all cursor-pointer"
        >
          إعادة المحاولة 🔄
        </button>
      </div>
    );
  }

  return (
    <div className="anim-rise space-y-8">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-neon/20 bg-gradient-to-l from-neon-deep/25 to-cyan-deep/10 p-7">
        <div aria-hidden className="anim-float absolute -top-10 -left-10 h-40 w-40 rounded-full bg-neon/20 blur-3xl" />
        <div className="relative">
          <h2 className="text-2xl font-extrabold text-ink md:text-3xl">
            مرحباً بك يا {profile?.username || 'مقدمنا'}
            <span className="mr-2 inline-block anim-pulse-neon text-neon-bright">●</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-mute md:text-base">
            أهلاً بك في لوحة الإدارة لمسابقاتك. تصفح بنك الأسئلة المركزي، وأدر التحديات النشطة وابدأ جلسات جديدة فوراً.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <StatCard label="إجمالي بنك الأسئلة" value={stats.questionsCount} icon={BookOpen} tone="neon" />
        <StatCard label="الجلسات المنشأة" value={stats.sessionsCount} icon={Layers} tone="cyan" />
        <StatCard label="أرشيف الفائزين" value={stats.winnersCount} icon={Trophy} tone="gold" />
      </div>

      {/* Main */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Active sessions */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Sparkles className="h-5 w-5 text-neon-bright" />
              جلساتك النشطة والسابقة
            </h3>
            <Link
              href="/dashboard/sessions"
              className="flex items-center gap-1.5 text-xs font-semibold text-neon-bright underline-offset-2 hover:underline"
            >
              إدارة الجلسات <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {activeSessions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">
                لا توجد جلسات حالية. ابدأ بإنشاء جلستك الأولى الآن!
              </div>
            ) : (
              <div className="divide-y divide-line">
                {activeSessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-white/5">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-ink md:text-base">{session.title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="rounded-md border border-line bg-void/60 px-2 py-0.5 font-display tracking-wider text-neon-bright">
                          {session.roomCode}
                        </span>
                        <StatusDot status={session.status} pulse={session.status === 'active'} />
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/sessions?id=${session.id}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-3.5 py-2 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20 hover:shadow-[var(--shadow-neon)]"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      إدارة
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-ink">إجراءات سريعة</h3>
          <div className="flex flex-col gap-4">
            <Link
              href="/dashboard/sessions"
              className="group glass rounded-[var(--radius-card)] border border-neon/20 bg-gradient-to-br from-neon/10 to-transparent p-5 transition-all hover:border-neon/40 hover:shadow-[var(--shadow-neon)]"
            >
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon/15 text-neon-bright transition-transform group-hover:scale-110">
                  <Mic className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink">إنشاء تحدي / جلسة جديدة</h4>
                  <p className="mt-1 text-xs text-ink-mute">ابدأ مسابقة جديدة مع الأصدقاء أو العائلة وشارك الكود</p>
                </div>
              </div>
            </Link>

            {profile?.role === 'admin' && (
              <Link
                href="/dashboard/questions"
                className="group glass rounded-[var(--radius-card)] border border-cyan/20 bg-gradient-to-br from-cyan/10 to-transparent p-5 transition-all hover:border-cyan/40 hover:shadow-[var(--shadow-cyan)]"
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan/15 text-cyan transition-transform group-hover:scale-110">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-ink">إضافة أسئلة للمكتبة</h4>
                    <p className="mt-1 text-xs text-ink-mute">تغذية البنك المركزي بأسئلة متنوعة بمستويات صعوبة</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

```

## 📄 File: `src/app/dashboard/questions/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  getUserProfile, getQuestions, addQuestion, deleteQuestion, bulkAddQuestions,
} from '@/lib/db';
import type { Question } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Plus, Trash2, Search, BookOpen, Upload, Filter } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Textarea, Select } from '@/components/ui/Input';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';

const CATEGORIES = [
  { value: 'all', label: '🗂️ الكل' },
  { value: 'عامة', label: '🌍 عامة' },
  { value: 'إسلامية', label: '🕌 إسلامية' },
  { value: 'ألغاز', label: '🧩 ألغاز' },
  { value: 'علوم', label: '🔬 علوم' },
  { value: 'عائلية', label: '🏠 عائلية' },
  { value: 'تاريخ', label: '📜 تاريخ' },
  { value: 'جغرافيا', label: '🗺️ جغرافيا' },
  { value: 'رياضة', label: '⚽ رياضة' }
];

export function normalizeCategory(cat: string): string {
  if (!cat) return 'عامة';
  const c = cat.trim().toLowerCase();
  if (c === 'general' || c === 'general' || c === 'عام' || c === 'عامة') return 'عامة';
  if (c === 'islamic' || c === 'إسلامي' || c === 'إسلامية') return 'إسلامية';
  if (c === 'riddles' || c === 'لغز' || c === 'ألغاز') return 'ألغاز';
  if (c === 'science' || c === 'علم' || c === 'علوم') return 'علوم';
  if (c === 'family' || c === 'عائلة' || c === 'عائلية') return 'عائلية';
  if (c === 'history' || c === 'التاريخ' || c === 'تاريخ') return 'تاريخ';
  if (c === 'geography' || c === 'الجغرافيا' || c === 'جغرافيا') return 'جغرافيا';
  if (c === 'sports' || c === 'الرياضة' || c === 'رياضة') return 'رياضة';
  return cat.trim();
}

export default function QuestionsPage() {
  const [profile, setProfile] = useState<{ id: string; username: string; role: string } | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form Fields
  const [questionText, setQuestionText] = useState('');
  const [option1, setOption1] = useState('');
  const [option2, setOption2] = useState('');
  const [option3, setOption3] = useState('');
  const [option4, setOption4] = useState('');
  const [correctOption, setCorrectOption] = useState<number>(1);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [category, setCategory] = useState('عامة');

  // Filter Fields
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); window.location.href = '/auth'; return; }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) setProfile({ id: userProfile.uid, username: userProfile.username, role: userProfile.role });
        await fetchQuestions();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let result = [...questions];
    if (searchQuery.trim()) {
      result = result.filter(q => q.questionText.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterDifficulty !== 'all') {
      result = result.filter(q => q.difficulty === filterDifficulty);
    }
    if (filterCategory !== 'all') {
      result = result.filter(q => normalizeCategory(q.category) === filterCategory);
    }
    setFilteredQuestions(result);
  }, [searchQuery, filterDifficulty, filterCategory, questions]);

  const fetchQuestions = async () => {
    const data = await getQuestions();
    setQuestions(data);
    setFilteredQuestions(data);
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || profile.role !== 'admin') {
      setError('خطأ: الأدمن فقط يمكنه إضافة أسئلة للبنك المركزي.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      await addQuestion({
        questionText,
        option1,
        option2,
        option3: option3 || '',
        option4: option4 || '',
        correctOption,
        difficulty,
        category,
        createdBy: profile.id,
      });
      setSuccess('تم إضافة السؤال بنجاح إلى بنك الأسئلة!');
      setQuestionText('');
      setOption1('');
      setOption2('');
      setOption3('');
      setOption4('');
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إضافة السؤال');
    }
  };

  const handleDelete = async (id: string) => {
    if (!profile || profile.role !== 'admin') {
      setError('عذراً، الأدمن فقط يمكنه مسح الأسئلة.');
      return;
    }
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا السؤال نهائياً؟')) return;
    try {
      await deleteQuestion(id);
      setSuccess('تم حذف السؤال بنجاح.');
      await fetchQuestions();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حذف السؤال');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || profile.role !== 'admin') {
      setError('عذراً، الأدمن فقط يمكنه رفع الأسئلة.');
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;

        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Parse worksheet into rows (header: 1 returns 2D array of strings/numbers)
        const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        if (rows.length < 2) {
          setError('الملف فارغ أو لا يحتوي على أسطر صالحة.');
          return;
        }

        // Detect column indices based on header names (case-insensitive & clean)
        const headers = rows[0].map(h => String(h || '').trim().toLowerCase());
        
        const textIdx = headers.findIndex(h => h.includes('text') || h.includes('سؤال') || h === 'question_text');
        const opt1Idx = headers.findIndex(h => h === 'option1' || h.includes('خيار1') || h.includes('الاول') || h.includes('الأول'));
        const opt2Idx = headers.findIndex(h => h === 'option2' || h.includes('خيار2') || h.includes('الثاني'));
        const opt3Idx = headers.findIndex(h => h === 'option3' || h.includes('خيار3') || h.includes('الثالث'));
        const opt4Idx = headers.findIndex(h => h === 'option4' || h.includes('خيار4') || h.includes('الرابع'));
        const correctIdx = headers.findIndex(h => h.includes('correct') || h.includes('صحيح') || h === 'correct_option');
        const catIdx = headers.findIndex(h => h === 'category' || h.includes('قسم') || h.includes('تصنيف') || h === 'التصنيف');
        const diffIdx = headers.findIndex(h => h === 'difficulty' || h.includes('صعوب') || h === 'الصعوبة');

        const getColVal = (row: any[], headerIdx: number, fallbackIdx: number) => {
          const idx = headerIdx !== -1 ? headerIdx : fallbackIdx;
          return row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
        };

        const listToInsert = rows.slice(1).map(row => {
          if (!row || row.length < 3) return null;
          
          const qText = getColVal(row, textIdx, 0);
          if (!qText) return null;

          const opt1 = getColVal(row, opt1Idx, 1);
          const opt2 = getColVal(row, opt2Idx, 2);
          const opt3 = getColVal(row, opt3Idx, 3);
          const opt4 = getColVal(row, opt4Idx, 4);

          const correctStr = getColVal(row, correctIdx, 5);
          const correctOption = parseInt(correctStr, 10) || 1;

          const rawCat = getColVal(row, catIdx, 6) || 'عامة';
          const cat = normalizeCategory(rawCat);

          const diffRaw = getColVal(row, diffIdx, 7).toLowerCase();
          let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
          if (diffRaw.includes('سهل') || diffRaw.includes('easy')) difficulty = 'easy';
          else if (diffRaw.includes('صعب') || diffRaw.includes('hard')) difficulty = 'hard';

          return {
            questionText: qText,
            option1: opt1,
            option2: opt2,
            option3: opt3,
            option4: opt4,
            correctOption,
            difficulty,
            category: cat,
            createdBy: profile.id,
          };
        }).filter((item): item is NonNullable<typeof item> => item !== null);

        if (listToInsert.length === 0) {
          setError('لم يتم العثور على أسطر صالحة للاستيراد. تأكد من تطابق عناوين الأعمدة.');
          return;
        }

        const count = await bulkAddQuestions(listToInsert);
        setSuccess(`تم استيراد ${count} سؤال بنجاح من الملف!`);
        await fetchQuestions();
      } catch (err: any) {
        console.error('Error parsing file:', err);
        setError(err.message || 'خطأ في معالجة أو رفع ملف Excel/CSV.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل بنك الأسئلة..." />
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="anim-rise space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-extrabold text-ink">
            <BookOpen className="h-6 w-6 text-neon-bright" />
            بنك الأسئلة المركزي
          </h2>
          <p className="mt-1 text-xs text-ink-mute">
            {isAdmin
              ? 'بصفتك مديراً للنظام، يمكنك إضافة أسئلة جديدة، حذفها، أو استيرادها دفعة واحدة.'
              : 'بصفتك مقدماً، يمكنك تصفح كافة الأسئلة المتوفرة لبناء تحدياتك.'}
          </p>
        </div>
        {isAdmin && (
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-neon/30 bg-neon/10 px-4 py-2.5 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20">
            <Upload className="h-4 w-4" />
            استيراد أسئلة (Excel / CSV)
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
          </label>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="anim-shake rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-center text-sm text-success-bright">{success}</div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Form */}
        {isAdmin && (
          <Card glow="neon" className="space-y-5 p-6 lg:col-span-1">
            <CardHeader title="إضافة سؤال جديد" icon={<Plus className="h-5 w-5" />} />
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <Field label="نص السؤال" required>
                <Textarea
                  required
                  placeholder="اكتب نص السؤال هنا..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="h-20"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="الخيار الأول" required>
                  <Input required value={option1} onChange={(e) => setOption1(e.target.value)} />
                </Field>
                <Field label="الخيار الثاني" required>
                  <Input required value={option2} onChange={(e) => setOption2(e.target.value)} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="الخيار الثالث (اختياري)">
                  <Input value={option3} onChange={(e) => setOption3(e.target.value)} />
                </Field>
                <Field label="الخيار الرابع (اختياري)">
                  <Input value={option4} onChange={(e) => setOption4(e.target.value)} />
                </Field>
              </div>

              <Field label="الإجابة الصحيحة">
                <Select value={correctOption} onChange={(e) => setCorrectOption(parseInt(e.target.value, 10))}>
                  <option value={1}>الخيار الأول</option>
                  <option value={2}>الخيار الثاني</option>
                  {option3.trim() && <option value={3}>الخيار الثالث</option>}
                  {option4.trim() && <option value={4}>الخيار الرابع</option>}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="مستوى الصعوبة">
                  <Select value={difficulty} onChange={(e: any) => setDifficulty(e.target.value)}>
                    <option value="easy">سهل</option>
                    <option value="medium">متوسط</option>
                    <option value="hard">صعب</option>
                  </Select>
                </Field>
                <Field label="التصنيف">
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="عامة">عامة</option>
                    <option value="إسلامية">إسلامية</option>
                    <option value="علوم">علوم</option>
                    <option value="ألغاز">ألغاز</option>
                    <option value="عائلية">عائلية</option>
                    <option value="تاريخ">تاريخ</option>
                    <option value="جغرافيا">جغرافيا</option>
                    <option value="رياضة">رياضة</option>
                  </Select>
                </Field>
              </div>

              <Button type="submit" variant="primary" fullWidth size="lg">إدراج في بنك الأسئلة</Button>
            </form>
          </Card>
        )}

        {/* Filters + Table */}
        <div className={cn('space-y-5', isAdmin ? 'lg:col-span-2' : 'lg:col-span-3')}>
          <div className="glass flex flex-col gap-3 rounded-[var(--radius-card)] p-4 md:flex-row md:items-center md:justify-between">
            <div className="w-full md:w-64">
              <Input
                type="text"
                placeholder="ابحث عن سؤال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="hidden h-4 w-4 text-ink-mute md:block" />
              <Select value={filterDifficulty} onChange={(e) => setFilterDifficulty(e.target.value)} className="md:w-36">
                <option value="all">كل الصعوبات</option>
                <option value="easy">سهل</option>
                <option value="medium">متوسط</option>
                <option value="hard">صعب</option>
              </Select>
            </div>
          </div>

          {/* Category Tabs / Buttons */}
          <div className="flex flex-wrap gap-2 pb-1 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const isActive = filterCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setFilterCategory(cat.value)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer select-none",
                    isActive
                      ? "bg-neon/15 text-neon-bright border-neon/40 shadow-[var(--shadow-neon-soft)]"
                      : "bg-void/40 text-ink-mute border-line hover:text-ink hover:bg-void/60"
                  )}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {filteredQuestions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لا توجد أسئلة تطابق الفلاتر المحددة.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-line bg-void/40 text-ink-mute">
                      <th className="p-4 font-semibold">نص السؤال</th>
                      <th className="p-4 font-semibold">التصنيف</th>
                      <th className="p-4 font-semibold">الصعوبة</th>
                      {isAdmin && <th className="p-4 font-semibold">الإجراء</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line text-ink-soft">
                    {filteredQuestions.map((q) => (
                      <tr key={q.id} className="transition-colors hover:bg-white/5">
                        <td className="max-w-sm p-4">
                          <p className="font-bold text-ink">{q.questionText}</p>
                          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-faint">
                            <span className="text-success-bright">1: {q.option1}</span>
                            <span className="text-success-bright">2: {q.option2}</span>
                            {q.option3 && <span>3: {q.option3}</span>}
                            {q.option4 && <span>4: {q.option4}</span>}
                          </div>
                        </td>
                        <td className="p-4"><CategoryIcon category={q.category} /></td>
                        <td className="p-4"><DifficultyBadge difficulty={q.difficulty} /></td>
                        {isAdmin && (
                          <td className="p-4">
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger-bright transition-all hover:bg-danger/20"
                              title="حذف"
                              aria-label="حذف السؤال"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

```

## 📄 File: `src/app/dashboard/sessions/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  getUserProfile, getSessions, getQuestions, createSession, updateSession,
  getSessionById, getSessionQuestions, getPlayers, getAnswerCount,
  getAnswersForQuestion, updatePlayer, archiveWinner, incrementCumulativeScore,
  subscribeSession, subscribeSessionPlayers, subscribeAnswerCount,
} from '@/lib/db';
import type { Session, Question, Player, UserProfile } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Layers, Plus, Play, CheckSquare, Square, ArrowRight, Users, Radio, Flame, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import StatusDot from '@/components/ui/StatusDot';
import DifficultyBadge from '@/components/ui/DifficultyBadge';
import CategoryIcon from '@/components/ui/CategoryIcon';
import Spinner from '@/components/ui/Spinner';
import type { Unsubscribe } from 'firebase/firestore';

import { Suspense } from 'react';

function SessionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get('id');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Session Form
  const [title, setTitle] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [timerDuration, setTimerDuration] = useState(30);

  // Active Session Control State
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  // Presenter controls
  const [hintInput, setHintInput] = useState('');
  const [tvBgColorInput, setTvBgColorInput] = useState('#090514');
  const [tvLogoTextInput, setTvLogoTextInput] = useState('مسابقة عصومي');
  const [tvFontSizeInput, setTvFontSizeInput] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [tvChromaInput, setTvChromaInput] = useState<'normal' | 'chroma' | 'transparent'>('normal');

  // Initial load (profile + question bank + own sessions)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLoading(false); window.location.href = '/auth'; return; }
      try {
        const userProfile = await getUserProfile(user.uid);
        if (userProfile) setProfile(userProfile);

        const [qData, mySessions] = await Promise.all([
          getQuestions(),
          getSessions(user.uid),
        ]);
        setQuestions(qData);
        setSessions(mySessions);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Active session loader + realtime subscriptions
  useEffect(() => {
    if (!activeSessionId) {
      setActiveSession(null);
      return;
    }

    let unsubs: Unsubscribe[] = [];

    async function loadActiveSession() {
      if (!activeSessionId) return;
      const session = await getSessionById(activeSessionId);
      if (!session) return;
      setActiveSession(session);
      if ((session as any).tvBgColor) setTvBgColorInput((session as any).tvBgColor);
      if ((session as any).tvLogoText) setTvLogoTextInput((session as any).tvLogoText);
      if ((session as any).tvFontSize) setTvFontSizeInput((session as any).tvFontSize);
      if ((session as any).overlayMode) setTvChromaInput((session as any).overlayMode);

      // Load session's questions
      if (session.questionIds?.length) {
        const qList = await getSessionQuestions(session.questionIds);
        setActiveQuestions(qList);
        if (session.currentQuestionId) {
          setCurrentQuestion(qList.find(q => q.id === session.currentQuestionId) || null);
        }
      }

      // Load players
      const playerData = await getPlayers(activeSessionId);
      setPlayers(playerData);

      // Load answer count for current question
      if (session.currentQuestionId) {
        const count = await getAnswerCount(activeSessionId, session.currentQuestionId);
        setAnswersCount(count);
      }
    }

    loadActiveSession();

    // 1. Subscribe to session doc changes (replaces session-info-changes)
    unsubs.push(
      subscribeSession(activeSessionId, async (sess) => {
        if (!sess) return;
        setActiveSession(sess);
        if (sess.currentQuestionId) {
          // fetch the current question doc if we don't have it locally
          setCurrentQuestion(prev => {
            if (prev?.id === sess.currentQuestionId) return prev;
            // lazy load
            getSessionQuestions([sess.currentQuestionId!]).then(list => {
              if (list[0]) setCurrentQuestion(list[0]);
            });
            return prev;
          });
        } else {
          setCurrentQuestion(null);
        }
      })
    );

    // 2. Subscribe to players list (replaces players-changes)
    unsubs.push(
      subscribeSessionPlayers(activeSessionId, (newPlayers) => {
        setPlayers(newPlayers);
      })
    );

    // 3. Subscribe to answer count for current question (replaces answers-changes)
    // We use a getter for currentQuestionId so the subscription stays fresh.
    const currentQidGetter = () => activeSession?.currentQuestionId;
    const qid = currentQidGetter();
    if (qid) {
      unsubs.push(
        subscribeAnswerCount(activeSessionId, qid, (count) => {
          setAnswersCount(count);
        })
      );
    }

    return () => {
      unsubs.forEach(u => u && u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, activeSession?.currentQuestionId]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError('');
    setSuccess('');
    if (selectedQuestionIds.length === 0) {
      setError('يرجى تحديد سؤال واحد على الأقل من مكتبة الأسئلة المتاحة.');
      return;
    }
    try {
      const code = roomCode || Math.floor(1000 + Math.random() * 9000).toString();
      await createSession({
        title,
        roomCode: code,
        timerDuration,
        createdBy: profile.uid,
        status: 'waiting',
        currentQuestionId: null,
        questionStatus: 'idle',
        showScoreboard: false,
        questionIds: selectedQuestionIds,
      });
      setSuccess('تم إنشاء الجلسة بنجاح!');
      setTitle('');
      setRoomCode('');
      setSelectedQuestionIds([]);
      const fresh = await getSessions(profile.uid);
      setSessions(fresh);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء الجلسة.');
    }
  };

  const handleQuestionToggle = (qid: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(qid) ? prev.filter(id => id !== qid) : [...prev, qid]
    );
  };

  // GAME CONSOLE ACTION HANDLERS
  const handleShowQuestion = async (qid: string) => {
    if (!activeSession) return;
    setAnswersCount(0);
    await updateSession(activeSession.id, {
      currentQuestionId: qid,
      questionStatus: 'showing',
      status: 'active',
    });
  };

  const handleRevealAnswer = async () => {
    if (!activeSession || !currentQuestion) return;
    const submissions = await getAnswersForQuestion(activeSession.id, currentQuestion.id);

    if (submissions.length > 0) {
      await Promise.all(submissions.map(sub => {
        if (sub.isCorrect) {
          const timePercent = Math.max(0, 1 - (sub.timeSpent / activeSession.timerDuration));
          const bonus = Math.round(timePercent * 50);
          const scoreAdded = 100 + bonus;
          const player = players.find(p => p.id === sub.playerId);
          const currentScore = player ? player.score : 0;
          const currentStreak = player ? player.streak : 0;
          return updatePlayer(activeSession.id, sub.playerId, {
            score: currentScore + scoreAdded,
            streak: currentStreak + 1,
          });
        } else {
          return updatePlayer(activeSession.id, sub.playerId, { streak: 0 });
        }
      }));
    }
    await updateSession(activeSession.id, { questionStatus: 'revealed' });
  };

  const handleToggleScoreboard = async () => {
    if (!activeSession) return;
    const newState = !activeSession.showScoreboard;
    await updateSession(activeSession.id, { showScoreboard: newState });
    if (newState) {
      setTimeout(async () => {
        await updateSession(activeSession.id, { showScoreboard: false });
      }, 8000);
    }
  };

  const handleEndGame = async () => {
    if (!activeSession) return;
    if (!confirm('هل تريد إنهاء هذه المسابقة نهائياً وتتويج الفائزين؟')) return;

    if (players.length > 0) {
      const winner = players[0];
      await archiveWinner({
        sessionId: activeSession.id,
        sessionTitle: activeSession.title,
        winnerName: winner.name,
        winnerScore: winner.score,
        totalPlayers: players.length,
      });
      await Promise.all(players.map(p => incrementCumulativeScore(p.name, p.score)));
    }

    await updateSession(activeSession.id, {
      status: 'finished',
      currentQuestionId: null,
      questionStatus: 'idle',
    });
    router.push('/dashboard/sessions');
  };

  const handleBroadcastHint = async () => {
    if (!activeSession || !hintInput.trim()) return;
    try {
      await updateSession(activeSession.id, {
        currentHint: hintInput.trim()
      });
      setHintInput('');
      setSuccess('تم بث التلميح للمتسابقين بنجاح!');
      // Auto clear after 6 seconds
      setTimeout(async () => {
        await updateSession(activeSession.id, {
          currentHint: null
        });
      }, 6000);
    } catch (err: any) {
      setError(err.message || 'خطأ في بث التلميح');
    }
  };

  const handleUpdateTvSettings = async () => {
    if (!activeSession) return;
    try {
      await updateSession(activeSession.id, {
        tvBgColor: tvBgColorInput,
        tvLogoText: tvLogoTextInput,
        tvFontSize: tvFontSizeInput,
        overlayMode: tvChromaInput,
      });
      setSuccess('تم تحديث إعدادات شاشة العرض بنجاح!');
    } catch (err: any) {
      setError(err.message || 'خطأ في تحديث إعدادات الشاشة');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Spinner size="lg" label="جاري تحميل الجلسات..." />
      </div>
    );
  }

  // ==========================================
  // VIEW: GAME CONSOLE
  // ==========================================
  if (activeSession) {
    return (
      <div className="anim-rise space-y-7">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard/sessions')}
              className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl border border-line bg-void-2/60 text-ink-soft transition-all hover:bg-void-2"
              aria-label="رجوع"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
            <div>
              <h2 className="flex items-center gap-2 text-xl font-extrabold text-ink md:text-2xl">
                <Radio className="h-5 w-5 anim-pulse-neon text-danger-bright" />
                {activeSession.title}
              </h2>
              <p className="mt-1 text-xs text-ink-mute">
                رمز الغرفة:{' '}
                <span className="font-display font-bold tracking-widest text-neon-bright">{activeSession.roomCode}</span>
              </p>
            </div>
          </div>
          <Button variant="danger" size="sm" onClick={handleEndGame}>إنهاء وتتويج الفائزين</Button>
        </div>

        <div className="grid grid-cols-1 gap-7 lg:grid-cols-3">
          {/* Left: current question + bank */}
          <div className="space-y-6 lg:col-span-2">
            <Card glow="neon" className="p-6">
              <CardHeader title="السؤال النشط حالياً" accent="neon" />

              {currentQuestion ? (
                <div className="mt-5 space-y-4">
                  <h4 className="text-lg font-bold text-ink md:text-xl">{currentQuestion.questionText}</h4>

                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((n) => {
                      const opt = (currentQuestion as any)[`option${n}`];
                      if (!opt) return null;
                      const isCorrect = currentQuestion.correctOption === n;
                      return (
                        <div
                          key={n}
                          className={cn(
                            'rounded-xl border p-4 text-sm',
                            isCorrect
                              ? 'border-success/40 bg-success/10 text-success-bright shadow-[var(--shadow-success)]'
                              : 'border-line bg-void-2/50 text-ink-soft'
                          )}
                        >
                          <span className="font-display font-bold text-gold">{n}.</span> {opt}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                    <div className="text-xs text-ink-mute">
                      الحالة:{' '}
                      <span className="font-bold text-ink-soft">
                        {activeSession.questionStatus === 'showing' ? 'معروض للجميع' :
                         activeSession.questionStatus === 'revealed' ? 'تم الكشف' : 'انتظار'}
                      </span>
                      <span className="mx-2">•</span>
                      الإجابات:{' '}
                      <span className="font-display font-bold text-neon-bright">{answersCount}</span>
                      {' / '}
                      <span className="font-display text-ink-mute">{players.length}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeSession.questionStatus === 'showing' && (
                        <Button variant="success" size="sm" onClick={handleRevealAnswer}>كشف الإجابة</Button>
                      )}
                      <Button
                        variant={activeSession.showScoreboard ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={handleToggleScoreboard}
                      >
                        {activeSession.showScoreboard ? 'إخفاء الترتيب' : 'عرض الترتيب'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-ink-mute">
                  لم يتم بث أي سؤال بعد. اختر سؤالاً من القائمة أدناه لبدء التحدي.
                </div>
              )}
            </Card>

            {/* Question bank */}
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-ink">
                <Layers className="h-5 w-5 text-cyan" />
                أسئلة هذه الجلسة
              </h3>
              <div className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
                {activeQuestions.map((q) => {
                  const isCurrent = activeSession.currentQuestionId === q.id;
                  return (
                    <div
                      key={q.id}
                      className={cn('flex items-center justify-between gap-3 p-4 transition-colors', isCurrent ? 'bg-neon/5' : 'hover:bg-white/5')}
                    >
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-ink-soft">{q.questionText}</h4>
                        <div className="mt-1.5 flex items-center gap-3">
                          <DifficultyBadge difficulty={q.difficulty} />
                          <CategoryIcon category={q.category} />
                        </div>
                      </div>
                      <button
                        onClick={() => handleShowQuestion(q.id)}
                        disabled={isCurrent && activeSession.questionStatus === 'showing'}
                        className={cn(
                          'shrink-0 cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold transition-all',
                          isCurrent
                            ? 'border-neon/40 bg-neon/20 text-neon-bright'
                            : 'border-line bg-void-2/60 text-ink-soft hover:border-neon/40 hover:text-neon-bright',
                          'disabled:cursor-not-allowed disabled:opacity-50'
                        )}
                      >
                        {isCurrent ? 'معروض الآن' : 'طرح السؤال'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: players */}
          <div className="space-y-6">
            <Card className="p-6">
              <CardHeader
                title={<span>المتسابقون المتصلون ({players.length})</span>}
                icon={<Users className="h-5 w-5" />}
                accent="cyan"
              />
              {players.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-mute">بانتظار انضمام المتسابقين...</div>
              ) : (
                <div className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {players.map((p, idx) => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-line bg-void-2/50 p-3.5">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs font-extrabold',
                          idx === 0 ? 'bg-gold/20 text-gold' :
                          idx === 1 ? 'bg-white/15 text-ink-soft' :
                          idx === 2 ? 'bg-amber-700/30 text-amber-500' : 'bg-void text-ink-faint'
                        )}>
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold" style={{ color: p.color }}>{p.name}</p>
                          {p.streak >= 3 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400">
                              <Flame className="h-3 w-3" /> {p.streak} متتالي
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-display text-xs font-extrabold text-ink">{p.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Hint broadcaster */}
            <Card className="p-6">
              <CardHeader title="بث تلميح فوري للمتسابقين" icon={<Sparkles className="h-5 w-5" />} accent="neon" />
              <div className="mt-4 space-y-4">
                <p className="text-[11px] text-ink-mute">سيظهر هذا التلميح كرسالة منبثقة في شاشات المتسابقين فوراً لمساعدتهم.</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="اكتب التلميح هنا (مثال: الإجابة في العلوم)"
                    value={hintInput}
                    onChange={(e) => setHintInput(e.target.value)}
                  />
                  <Button variant="primary" onClick={handleBroadcastHint} disabled={!hintInput.trim()}>
                    بث 💡
                  </Button>
                </div>
              </div>
            </Card>

            {/* TV Customize Settings */}
            <Card className="p-6">
              <CardHeader title="إعدادات الشاشة التلفزيونية" icon={<Layers className="h-5 w-5" />} accent="cyan" />
              <div className="mt-4 space-y-4">
                <Field label="شعار / عنوان التلفزيون">
                  <Input
                    value={tvLogoTextInput}
                    onChange={(e) => setTvLogoTextInput(e.target.value)}
                    placeholder="شعار المسابقة المعروض"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="حجم الخط">
                    <Select value={tvFontSizeInput} onChange={(e: any) => setTvFontSizeInput(e.target.value)}>
                      <option value="sm">صغير</option>
                      <option value="md">متوسط</option>
                      <option value="lg">كبير</option>
                      <option value="xl">ضخم</option>
                    </Select>
                  </Field>
                  <Field label="وضع الخلفية">
                    <Select value={tvChromaInput} onChange={(e: any) => setTvChromaInput(e.target.value)}>
                      <option value="normal">افتراضية نيون</option>
                      <option value="chroma">كروما خضراء</option>
                      <option value="transparent">شفافة كاملة</option>
                    </Select>
                  </Field>
                </div>
                <Field label="لون الخلفية المخصص (HEX)">
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={tvBgColorInput}
                      onChange={(e) => setTvBgColorInput(e.target.value)}
                      className="w-12 h-9 p-0 bg-transparent border-0 cursor-pointer"
                    />
                    <Input
                      value={tvBgColorInput}
                      onChange={(e) => setTvBgColorInput(e.target.value)}
                      placeholder="#090514"
                      className="font-mono flex-1"
                    />
                  </div>
                </Field>
                <Button variant="primary" fullWidth onClick={handleUpdateTvSettings}>
                  تطبيق الإعدادات على التلفزيون 📺
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: SESSIONS LIST & CREATION
  // ==========================================
  return (
    <div className="anim-rise space-y-8">
      <div className="flex items-center gap-2">
        <Layers className="h-6 w-6 text-neon-bright" />
        <h2 className="text-2xl font-extrabold text-ink">إدارة جلسات اللعب</h2>
      </div>

      {error && (
        <div className="anim-shake rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-center text-sm text-danger-bright">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-center text-sm text-success-bright">{success}</div>
      )}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
        {/* Create form */}
        <Card glow="neon" className="space-y-5 p-6">
          <CardHeader title="إنشاء جلسة جديدة" icon={<Plus className="h-5 w-5" />} />
          <form onSubmit={handleCreateSession} className="space-y-4">
            <Field label="عنوان الجلسة" required>
              <Input required placeholder="مثال: تحدي الجمعة العائلي" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="رمز الغرفة (اختياري)">
                <Input placeholder="توليد عشوائي" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} />
              </Field>
              <Field label="مدة المؤقت">
                <Select value={timerDuration} onChange={(e) => setTimerDuration(parseInt(e.target.value, 10))}>
                  <option value={20}>20 ثانية</option>
                  <option value={30}>30 ثانية</option>
                  <option value={45}>45 ثانية</option>
                  <option value={60}>60 ثانية</option>
                </Select>
              </Field>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink-soft">اختر أسئلة الجلسة من المكتبة</label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line bg-void/40 p-2">
                {questions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-ink-faint">لا توجد أسئلة متوفرة في البنك المركزي حالياً.</div>
                ) : (
                  questions.map(q => {
                    const isSelected = selectedQuestionIds.includes(q.id);
                    return (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => handleQuestionToggle(q.id)}
                        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg p-2.5 text-right text-xs transition-colors hover:bg-white/5"
                      >
                        <span className="line-clamp-1 flex-1 text-ink-soft">{q.questionText}</span>
                        {isSelected
                          ? <CheckSquare className="h-4 w-4 shrink-0 text-neon-bright" />
                          : <Square className="h-4 w-4 shrink-0 text-ink-faint" />}
                      </button>
                    );
                  })
                )}
              </div>
              <span className="block text-[10px] text-ink-faint">الأسئلة المحددة: {selectedQuestionIds.length} سؤال.</span>
            </div>

            <Button type="submit" variant="primary" fullWidth size="lg">إنشاء الجلسة وحفظها</Button>
          </form>
        </Card>

        {/* Sessions list */}
        <div className="space-y-4 lg:col-span-2">
          <div className="glass overflow-hidden rounded-[var(--radius-card)]">
            {sessions.length === 0 ? (
              <div className="p-12 text-center text-sm text-ink-mute">لا توجد جلسات منشأة حالياً.</div>
            ) : (
              <div className="divide-y divide-line">
                {sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-white/5">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-bold text-ink md:text-base">{session.title}</h4>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
                        <span className="rounded-md border border-line bg-void/60 px-2 py-0.5 font-display tracking-wider text-neon-bright">
                          {session.roomCode}
                        </span>
                        <StatusDot status={session.status} pulse={session.status === 'active'} />
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/dashboard/sessions?id=${session.id}`)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-4 py-2 text-xs font-bold text-neon-bright transition-all hover:bg-neon/20 hover:shadow-[var(--shadow-neon)]"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      لوحة التحكم
                    </button>
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

export default function SessionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center p-12"><Spinner label="جاري التحميل..." /></div>}>
      <SessionsPageContent />
    </Suspense>
  );
}

```

## 📄 File: `src/app/player/page.tsx`

```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getSessionByRoomCode, getPlayerByName, createPlayer,
  getSessionQuestions, submitAnswer, getPlayerAnswer,
  updatePlayer, updateSession,
  subscribeSession, subscribePlayer,
} from '@/lib/db';
import type { Session, Player, Question } from '@/lib/db';
import { cn } from '@/lib/utils';
import { ShieldCheck, User, KeyRound, Clock, CheckCircle, XCircle, Trophy, Scissors, PlusCircle, Sparkles, Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import Background from '@/components/ui/Background';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import type { Unsubscribe } from 'firebase/firestore';

import { Suspense } from 'react';

function PlayerPageContent() {
  const searchParams = useSearchParams();
  const urlRoomCode = searchParams.get('room');

  // Connection Steps
  const [step, setStep] = useState(1);
  const [roomCode, setRoomCode] = useState(urlRoomCode || '');
  const [session, setSession] = useState<Session | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [playerColor, setPlayerColor] = useState('#22d3ee');
  const [player, setPlayer] = useState<Player | null>(null);

  // Game States
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionStatus, setQuestionStatus] = useState<string>('idle');
  const [hasAnswered, setHasAnswered] = useState(false);
  const [chosenOption, setChosenOption] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);

  // Lifelines
  const [lifelinesRemaining, setLifelinesRemaining] = useState(2);
  const [lifelinesTimeRemaining, setLifelinesTimeRemaining] = useState(2);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);

  // Timer
  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Refs to hold latest session/player for use inside subscription callbacks
  const sessionRef = useRef<Session | null>(null);
  const playerRef = useRef<Player | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { playerRef.current = player; }, [player]);

  const colors = ['#22d3ee', '#a855f7', '#f87171', '#4ade80', '#fbbf24', '#e879f9'];

  useEffect(() => {
    if (urlRoomCode) {
      handleVerifyRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRoomCode]);

  // Realtime subscriptions (session + own player row)
  useEffect(() => {
    if (!player?.id || !session?.id) return;

    const unsubs: Unsubscribe[] = [];

    // 1. Session doc changes
    unsubs.push(
      subscribeSession(session.id, async (newSess) => {
        if (!newSess) return;

        // Broadcast Hint handling
        if (newSess.currentHint && newSess.currentHint !== sessionRef.current?.currentHint) {
          setHint(newSess.currentHint);
          setTimeout(() => {
            setHint(null);
          }, 6000);
        }

        setSession(newSess);
        setQuestionStatus(newSess.questionStatus);

        if (newSess.questionStatus === 'showing') {
          setHasAnswered(false);
          setChosenOption(null);
          setIsCorrect(null);
          setHiddenOptions([]);
          if (newSess.currentQuestionId) {
            const qList = await getSessionQuestions([newSess.currentQuestionId]);
            if (qList[0]) {
              setCurrentQuestion(qList[0]);
              setSecondsLeft(newSess.timerDuration);
              startTimeRef.current = Date.now();
              startTimer(newSess.timerDuration);
            }
          }
        } else if (newSess.questionStatus === 'revealed') {
          revealAnswer();
        }
      })
    );

    // 2. Own player row changes (score, streak, lifelines)
    unsubs.push(
      subscribePlayer(session.id, player.id, (newPlayer) => {
        if (!newPlayer) return;
        setPlayer(newPlayer);
        setStreak(newPlayer.streak || 0);
        setLifelinesRemaining(newPlayer.lifelinesRemaining);
        setLifelinesTimeRemaining(newPlayer.lifelinesTimeRemaining);
      })
    );

    return () => {
      unsubs.forEach(u => u && u());
      stopTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player?.id, session?.id]);

  const handleVerifyRoom = async () => {
    if (!roomCode.trim()) return;
    const data = await getSessionByRoomCode(roomCode.trim());
    if (!data) {
      alert('خطأ: رمز الغرفة غير موجود أو غير صالح.');
      return;
    }
    setSession(data);
    setStep(2);
  };

  const handleJoinGame = async () => {
    if (!playerName.trim() || !session) return;
    const existing = await getPlayerByName(session.id, playerName.trim());
    if (existing) {
      setPlayer(existing);
      setStreak(existing.streak || 0);
      setStep(3);
      return;
    }
    const newPlayer = await createPlayer(session.id, {
      name: playerName.trim(),
      color: playerColor,
      score: 0,
      streak: 0,
      lifelinesRemaining: 2,
      lifelinesTimeRemaining: 2,
      isActive: true,
    });
    setPlayer(newPlayer);
    setStep(3);
  };

  const startTimer = (duration: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSubmitAnswer = async (optIdx: number) => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (!sess || !me || hasAnswered || questionStatus !== 'showing' || !currentQuestion) return;

    setHasAnswered(true);
    setChosenOption(optIdx);

    const timeSpent = parseFloat(((Date.now() - startTimeRef.current) / 1000).toFixed(2));
    const correct = currentQuestion.correctOption === optIdx;

    await submitAnswer(sess.id, {
      playerId: me.id,
      questionId: currentQuestion.id,
      chosenOption: optIdx,
      isCorrect: correct,
      timeSpent,
    });
  };

  const revealAnswer = async () => {
    stopTimer();
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (!sess || !me || !currentQuestion) return;

    const answer = await getPlayerAnswer(sess.id, me.id, currentQuestion.id);
    if (answer) {
      setIsCorrect(answer.isCorrect);
      if (answer.isCorrect) {
        confetti({ particleCount: 40, spread: 50, origin: { y: 0.5 } });
      }
    } else {
      setIsCorrect(false);
    }
  };

  // LIFELINES
  const handleUse5050 = async () => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (!sess || !me || !currentQuestion || lifelinesRemaining <= 0 || hasAnswered) return;

    const wrongOptions = [1, 2, 3, 4].filter(i => i !== currentQuestion.correctOption);
    const toHide = wrongOptions.sort(() => 0.5 - Math.random()).slice(0, 2);
    setHiddenOptions(toHide);
    setLifelinesRemaining(prev => prev - 1);
    await updatePlayer(sess.id, me.id, { lifelinesRemaining: me.lifelinesRemaining - 1 });
  };

  const handleUseTimeLifeline = async () => {
    const sess = sessionRef.current;
    const me = playerRef.current;
    if (!sess || !me || lifelinesTimeRemaining <= 0 || questionStatus !== 'showing') return;

    const newTimerVal = sess.timerDuration + 20;
    await updateSession(sess.id, { timerDuration: newTimerVal });
    setLifelinesTimeRemaining(prev => prev - 1);
    await updatePlayer(sess.id, me.id, { lifelinesTimeRemaining: me.lifelinesTimeRemaining - 1 });
    setSecondsLeft(prev => prev + 20);
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <Background className="grid min-h-screen place-items-center p-4">
      {/* STEP 1: VERIFY ROOM CODE */}
      {step === 1 && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-7 text-center">
            <div className="anim-float mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-neon-deep to-neon shadow-[var(--shadow-neon-strong)]">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-gradient">انضم للمسابقة</h1>
            <p className="mt-2 text-xs text-ink-mute">اكتب رمز الغرفة المكون من 4 أرقام للانضمام لجلسة اللعب</p>
          </div>

          <div className="glass-strong rounded-[var(--radius-card)] p-7 shadow-[var(--shadow-neon)]">
            <Field label="رمز الغرفة">
              <Input
                type="text"
                placeholder="••••"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                icon={<KeyRound className="h-5 w-5" />}
                className="text-center font-display text-2xl font-extrabold tracking-[0.4em]"
              />
            </Field>
            <Button variant="primary" size="lg" fullWidth className="mt-5" onClick={handleVerifyRoom}>
              التحقق من الرمز
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: REGISTER */}
      {step === 2 && session && (
        <div className="anim-rise w-full max-w-sm">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-ink">أهلاً بك في: {session.title}</h2>
            <p className="mt-1 text-xs text-ink-mute">اكتب اسمك للمشاركة في المسابقة</p>
          </div>

          <div className="glass-strong rounded-[var(--radius-card)] p-7 space-y-5 shadow-[var(--shadow-neon)]">
            <Field label="اسم المتسابق">
              <Input
                type="text"
                placeholder="اكتب اسمك هنا..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                icon={<User className="h-5 w-5" />}
              />
            </Field>

            <div>
              <label className="mb-2 block text-xs font-semibold text-ink-soft">اختر لونك المفضل</label>
              <div className="flex justify-center gap-3">
                {colors.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPlayerColor(c)}
                    className={cn(
                      'h-9 w-9 cursor-pointer rounded-full border-2 transition-all',
                      playerColor === c ? 'scale-115 border-white shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                    )}
                    style={{ backgroundColor: c, boxShadow: playerColor === c ? `0 0 18px ${c}` : undefined }}
                    aria-label={`لون ${c}`}
                  />
                ))}
              </div>
            </div>

            <Button variant="primary" size="lg" fullWidth onClick={handleJoinGame}>دخول المسابقة</Button>
          </div>
        </div>
      )}

      {/* STEP 3: GAME HUD */}
      {step === 3 && player && session && (
        <div className="flex w-full max-w-md flex-col gap-4">
          {/* HUD header */}
          <div className="glass flex items-center justify-between rounded-2xl p-3.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full" style={{ backgroundColor: player.color, boxShadow: `0 0 10px ${player.color}` }} />
              <span className="text-sm font-bold text-ink">{player.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 font-display text-xs font-extrabold text-gold">
                {player.score}
              </span>
              {streak >= 3 && (
                <span className="font-display text-xs font-bold text-orange-400">🔥 {streak}</span>
              )}
            </div>
          </div>

          {/* Hint popup */}
          {hint && (
            <div className="anim-rise border border-neon/30 bg-neon-deep/40 backdrop-blur-md rounded-2xl p-3.5 text-center flex items-center justify-center gap-2 shadow-[var(--shadow-neon-soft)]">
              <span className="text-neon-bright animate-bounce">💡</span>
              <span className="text-xs font-bold text-slate-100">تلميح المقدم: {hint}</span>
            </div>
          )}

          {/* Lifelines */}
          {session.status === 'active' && questionStatus === 'showing' && !hasAnswered && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleUse5050}
                disabled={lifelinesRemaining <= 0}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-void-2/60 py-3 text-xs font-bold text-ink-soft transition-all hover:border-magenta/40 hover:text-magenta disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Scissors className="h-4 w-4" />
                حذف إجابتين ({lifelinesRemaining})
              </button>
              <button
                onClick={handleUseTimeLifeline}
                disabled={lifelinesTimeRemaining <= 0}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-void-2/60 py-3 text-xs font-bold text-ink-soft transition-all hover:border-cyan/40 hover:text-cyan disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle className="h-4 w-4" />
                +20 ثانية ({lifelinesTimeRemaining})
              </button>
            </div>
          )}

          {/* Main panel */}
          <div className="glass-strong flex min-h-[320px] flex-col justify-center rounded-[var(--radius-card)] p-6 shadow-[var(--shadow-neon)]">
            {/* WAITING */}
            {session.status === 'waiting' && (
              <div className="anim-rise space-y-4 text-center">
                <Sparkles className="anim-float mx-auto h-12 w-12 text-neon-bright" />
                <h3 className="text-lg font-bold text-ink">بانتظار بدء التحدي...</h3>
                <p className="text-xs text-ink-mute">عند قيام المقدم بطرح السؤال الأول، ستظهر خيارات الإجابة هنا فوراً.</p>
              </div>
            )}

            {/* ACTIVE */}
            {session.status === 'active' && currentQuestion && (
              <div className="space-y-5">
                {questionStatus === 'showing' && (
                  <>
                    {/* Neon timer */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex items-center gap-2 text-neon-bright">
                        <Clock className={cn('h-4 w-4', secondsLeft <= 5 && 'anim-pulse-neon text-danger-bright')} />
                        <span className={cn('font-display text-2xl font-extrabold tabular', secondsLeft <= 5 ? 'text-danger-bright' : 'text-ink')}>
                          {secondsLeft}
                        </span>
                        <span className="text-xs text-ink-mute">ثانية</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-1000 ease-linear',
                            secondsLeft <= 5 ? 'bg-danger' : 'bg-gradient-to-l from-neon-deep to-neon'
                          )}
                          style={{ width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%` }}
                        />
                      </div>
                    </div>

                    {hasAnswered ? (
                      <div className="anim-rise space-y-3 py-8 text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-gold" />
                        <h4 className="font-bold text-ink">تم تسجيل إجابتك!</h4>
                        <p className="text-xs text-ink-mute">بانتظار المقدم لكشف النتيجة...</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {[1, 2, 3, 4].map((optNum) => {
                          const optionVal = (currentQuestion as any)[`option${optNum}`];
                          if (!optionVal || hiddenOptions.includes(optNum)) return null;
                          return (
                            <button
                              key={optNum}
                              onClick={() => handleSubmitAnswer(optNum)}
                              className={cn(
                                'group flex cursor-pointer flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all active:scale-95',
                                'border-line bg-void-2/60 hover:border-neon/60 hover:bg-neon/10 hover:shadow-[var(--shadow-neon)]'
                              )}
                            >
                              <span className="font-display text-2xl font-extrabold text-neon-bright transition-colors group-hover:text-gold">
                                {optionLabels[optNum - 1]}
                              </span>
                              <span className="text-sm font-bold text-ink-soft">{optionVal}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* REVEAL */}
                {questionStatus === 'revealed' && isCorrect !== null && (
                  <div className={cn('anim-rise space-y-4 py-6 text-center', isCorrect ? '' : 'anim-shake')}>
                    {isCorrect ? (
                      <>
                        <CheckCircle className="anim-count-pop mx-auto h-16 w-16 text-success" />
                        <h3 className="text-xl font-bold text-success-bright">إجابة صحيحة!</h3>
                      </>
                    ) : (
                      <>
                        <XCircle className="anim-count-pop mx-auto h-16 w-16 text-danger" />
                        <h3 className="text-xl font-bold text-danger-bright">إجابة خاطئة!</h3>
                      </>
                    )}
                    <p className="text-xs text-ink-mute">بانتظار المقدم لإطلاق السؤال التالي...</p>
                  </div>
                )}
              </div>
            )}

            {/* FINISHED */}
            {session.status === 'finished' && (
              <div className="anim-rise space-y-4 text-center">
                <Trophy className="anim-float mx-auto h-12 w-12 text-gold" />
                <h3 className="text-xl font-bold text-ink">انتهت المسابقة!</h3>
                <p className="text-xs text-ink-mute">شكراً لمشاركتك المتميزة. راقب شاشة التلفزيون لمشاهدة منصة التتويج.</p>
              </div>
            )}
          </div>

          {/* Scoreboard overlay */}
          {session.showScoreboard && (
            <div className="fixed inset-0 z-50 grid place-items-center bg-void/80 p-6 backdrop-blur-md">
              <div className="glass-strong w-full max-w-sm space-y-4 rounded-[var(--radius-card)] p-6 text-center shadow-[var(--shadow-neon-strong)]">
                <Trophy className="anim-float mx-auto h-10 w-10 text-gold" />
                <h3 className="text-lg font-bold text-gradient-gold">الترتيب المؤقت</h3>
                <p className="text-xs text-ink-mute">سيختفي الترتيب تلقائياً خلال ثوانٍ...</p>
                <div className="rounded-xl border border-gold/25 bg-gold/10 py-3 font-display text-lg font-extrabold text-gold">
                  {player.score} نقطة
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Background>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-ink-mute">جاري التحميل...</div>}>
      <PlayerPageContent />
    </Suspense>
  );
}

```

## 📄 File: `src/app/tv/page.tsx`

```typescript
'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getSessionByRoomCode, getPlayers, getSessionQuestions,
  subscribeSession, subscribeSessionPlayers, subscribeAnswerCount,
} from '@/lib/db';
import type { Session, Player, Question } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Users, Trophy, Award, Monitor, EyeOff, Eye, Crown, Radio } from 'lucide-react';
import confetti from 'canvas-confetti';
import Spinner from '@/components/ui/Spinner';
import type { Unsubscribe } from 'firebase/firestore';

import { Suspense } from 'react';

function TvPageContent() {
  const searchParams = useSearchParams();
  const roomCode = searchParams.get('code');

  const [session, setSession] = useState<Session | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answersCount, setAnswersCount] = useState(0);

  const [overlayMode, setOverlayMode] = useState<'normal' | 'chroma' | 'transparent'>('normal');

  const [secondsLeft, setSecondsLeft] = useState(30);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const prepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for use inside subscription callbacks
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => {
    if (!roomCode) return;

    async function loadRoom() {
      if (!roomCode) return;
      const sess = await getSessionByRoomCode(roomCode);
      if (!sess) return;
      setSession(sess);

      const playerData = await getPlayers(sess.id);
      setPlayers(playerData);

      if (sess.currentQuestionId) {
        const qList = await getSessionQuestions([sess.currentQuestionId]);
        if (qList[0]) setCurrentQuestion(qList[0]);
      }
    }

    loadRoom();

    return () => {
      stopTimer();
      if (prepTimerRef.current) clearInterval(prepTimerRef.current);
    };
  }, [roomCode]);

  // Subscribe once we have a session id
  useEffect(() => {
    if (!session?.id) return;

    const unsubs: Unsubscribe[] = [];

    // 1. Session doc changes
    unsubs.push(
      subscribeSession(session.id, async (updatedSess) => {
        if (!updatedSess) return;

        // New question detected → trigger 5s prep countdown
        if (
          updatedSess.currentQuestionId &&
          updatedSess.currentQuestionId !== sessionRef.current?.currentQuestionId
        ) {
          triggerPrepCountdown(updatedSess);
        } else {
          setSession(updatedSess);
          if (updatedSess.questionStatus === 'showing') {
            startTimer(updatedSess.timerDuration);
          } else if (updatedSess.questionStatus === 'revealed') {
            stopTimer();
          }
        }
      })
    );

    // 2. Players list
    unsubs.push(
      subscribeSessionPlayers(session.id, (newPlayers) => {
        setPlayers(newPlayers);
      })
    );

    // 3. Answer count for current question
    if (session.currentQuestionId) {
      unsubs.push(
        subscribeAnswerCount(session.id, session.currentQuestionId, (count) => {
          setAnswersCount(count);
        })
      );
    }

    return () => {
      unsubs.forEach(u => u && u());
    };
  }, [session?.id, session?.currentQuestionId]);

  const triggerPrepCountdown = (updatedSess: Session) => {
    stopTimer();
    setPrepCountdown(5);
    if (prepTimerRef.current) clearInterval(prepTimerRef.current);

    prepTimerRef.current = setInterval(() => {
      setPrepCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(prepTimerRef.current!);
          prepTimerRef.current = null;
          setPrepCountdown(null);
          // Apply changes after countdown
          setSession(updatedSess);
          if (updatedSess.currentQuestionId) {
            getSessionQuestions([updatedSess.currentQuestionId]).then((list) => {
              if (list[0]) setCurrentQuestion(list[0]);
            });
          }
          startTimer(updatedSess.timerDuration);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startTimer = (duration: number) => {
    setSecondsLeft(duration);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    if (session?.status === 'finished') {
      confetti({ particleCount: 180, spread: 90, origin: { y: 0.6 } });
    }
  }, [session?.status]);

  if (!roomCode) {
    return (
      <div className="grid min-h-screen place-items-center bg-void p-6 text-center">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-ink">خطأ: رمز الغرفة مفقود بالرابط!</h2>
          <p className="text-sm text-ink-mute">يرجى توجيه الشاشة عبر كود الغرفة المخصص، مثل: <code dir="ltr" className="text-neon-bright">/tv?code=1234</code></p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-void">
        <Spinner size="lg" label="جاري جلب بيانات شاشة العرض..." />
      </div>
    );
  }

  const currentOverlayMode = (session as any).overlayMode || overlayMode;

  const bgStyle: React.CSSProperties = {};
  if (currentOverlayMode === 'normal') {
    bgStyle.backgroundColor = (session as any).tvBgColor || '#090514';
  } else if (currentOverlayMode === 'chroma') {
    bgStyle.backgroundColor = '#00ff00';
  } else {
    bgStyle.backgroundColor = 'transparent';
  }

  const bgClass =
    currentOverlayMode === 'chroma' ? 'text-black font-semibold' :
    currentOverlayMode === 'transparent' ? 'text-ink' :
    'text-ink';

  const panelClass =
    currentOverlayMode === 'chroma' ? 'bg-white border-2 border-black text-black' :
    'glass text-ink';

  const fontSizeClass =
    (session as any).tvFontSize === 'sm' ? 'scale-90 origin-center' :
    (session as any).tvFontSize === 'md' ? 'scale-95 origin-center' :
    (session as any).tvFontSize === 'xl' ? 'scale-105 origin-center' :
    'scale-100';

  // PREP COUNTDOWN
  if (prepCountdown !== null) {
    return (
      <main className={cn('min-h-screen grid place-items-center p-6 transition-all duration-300', bgClass)} style={bgStyle}>
        <div className="text-center">
          <h2 className="mb-4 font-display text-2xl font-extrabold uppercase tracking-[0.3em] text-neon-bright anim-pulse-neon">
            استعد للسؤال التالي
          </h2>
          <div key={prepCountdown} className="anim-count-pop font-display text-9xl font-black text-white drop-shadow-[0_0_30px_rgba(168,85,247,0.8)]">
            {prepCountdown}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={cn('relative min-h-screen flex flex-col justify-between p-6 transition-all duration-300 md:p-12', bgClass, fontSizeClass)} style={bgStyle}>
      {currentOverlayMode === 'normal' && (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-mesh opacity-70" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
        </>
      )}

      {/* Event Logo Header */}
      {currentOverlayMode !== 'transparent' && (
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 select-none shrink-0">
          <h1 className="font-brand text-xl text-gradient">
            {(session as any).tvLogoText || session.title}
          </h1>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-neon-bright animate-pulse" />
            <span className="font-display text-[9px] uppercase font-bold text-ink-mute tracking-wider">Clean Output Broadcast</span>
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-line bg-void/80 p-2 opacity-40 backdrop-blur-md transition-opacity hover:opacity-100">
        <span className="px-2 text-[10px] font-bold text-ink-mute">شاشة المخرج:</span>
        {[
          { mode: 'normal' as const, label: 'عادية', icon: <Monitor className="h-3 w-3" /> },
          { mode: 'chroma' as const, label: 'كروما', icon: <Eye className="h-3 w-3" /> },
          { mode: 'transparent' as const, label: 'شفافة', icon: <EyeOff className="h-3 w-3" /> },
        ].map((opt) => (
          <button
            key={opt.mode}
            onClick={() => setOverlayMode(opt.mode)}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] font-bold transition-colors',
              overlayMode === opt.mode ? 'bg-neon text-white' : 'text-ink-mute hover:bg-white/5'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>

      {/* WAITING */}
      {session.status === 'waiting' && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-10 text-center">
          <div className="space-y-3">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/30 bg-neon/10 px-4 py-1.5">
              <Radio className="h-4 w-4 anim-pulse-neon text-danger-bright" />
              <span className="text-xs font-bold uppercase tracking-widest text-neon-bright">بث مباشر</span>
            </div>
            <h1 className="font-brand text-5xl text-gradient md:text-6xl">{(session as any).tvLogoText || session.title}</h1>
            <p className="text-sm text-ink-mute md:text-lg">تحدّي معلومات لحظي مباشر. انضم إلينا الآن للعب!</p>
          </div>

          <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2">
            <div className={cn('flex flex-col items-center justify-center space-y-4 rounded-[var(--radius-card)] p-8', panelClass)}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-ink-mute">رمز الدخول</h3>
              <p className="font-display text-6xl font-black tracking-[0.3em] text-neon-bright drop-shadow-[0_0_25px_rgba(168,85,247,0.6)] md:text-7xl">
                {session.roomCode}
              </p>
              <p className="text-xs text-ink-mute">اكتب الرمز في صفحة المتسابق للانضمام</p>
            </div>

            <div className={cn('flex flex-col items-center justify-center space-y-4 rounded-[var(--radius-card)] p-8', panelClass)}>
              <Users className="h-12 w-12 text-cyan" />
              <p className="font-display text-3xl font-extrabold text-ink">
                {players.length} <span className="text-lg text-ink-mute">لاعب</span>
              </p>
              <div className="flex max-h-24 flex-wrap justify-center gap-1.5 overflow-y-auto">
                {players.map(p => (
                  <span key={p.id} className="rounded-full border border-line bg-void/60 px-2.5 py-1 text-xs font-bold" style={{ color: p.color }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE QUESTION */}
      {session.status === 'active' && currentQuestion && (
        <div className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col justify-between space-y-8">
          <div className="space-y-4 pt-4 text-center">
            <h2 className="font-display text-2xl font-extrabold leading-tight text-ink md:text-4xl">
              {currentQuestion.questionText}
            </h2>
            <div className="flex justify-center gap-3 text-xs font-bold">
              <span className="rounded-full border border-neon/25 bg-neon/10 px-3 py-1 uppercase tracking-wider text-neon-bright">
                {currentQuestion.category === 'islamic' ? 'إسلامية' :
                 currentQuestion.category === 'riddles' ? 'ألغاز' :
                 currentQuestion.category === 'science' ? 'علوم' :
                 currentQuestion.category === 'family' ? 'عائلية' : 'عام'}
              </span>
              <span className="rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-cyan">
                الإجابات: <span className="font-display">{answersCount}</span> / {players.length}
              </span>
            </div>
          </div>

          <div className="my-auto grid w-full grid-cols-1 gap-5 md:grid-cols-2">
            {['option1', 'option2', 'option3', 'option4'].map((optKey, idx) => {
              const optVal = (currentQuestion as any)[optKey];
              if (!optVal) return null;
              const isCorrect = currentQuestion.correctOption === (idx + 1);
              const isRevealed = session.questionStatus === 'revealed';
              const labels = ['A', 'B', 'C', 'D'];

              return (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center justify-between gap-4 rounded-2xl border p-6 text-lg font-bold shadow-md transition-all md:text-xl',
                    isRevealed
                      ? isCorrect
                        ? 'border-success bg-success/20 text-success-bright scale-105 shadow-[var(--shadow-success)]'
                        : 'border-danger/20 bg-danger/5 text-ink-faint opacity-50'
                      : cn('border-line', panelClass)
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-base font-extrabold', isRevealed && isCorrect ? 'bg-success text-white' : 'bg-white/10 text-neon-bright')}>
                      {labels[idx]}
                    </span>
                    <span>{optVal}</span>
                  </div>
                  {isRevealed && isCorrect && <Award className="h-6 w-6 shrink-0 text-success-bright" />}
                </div>
              );
            })}
          </div>

          {session.questionStatus === 'showing' && (
            <div className="relative space-y-2 pb-2">
              <div className="flex items-center justify-between text-sm font-bold">
                <span className="text-ink-mute">الوقت المتبقي</span>
                <span className={cn('font-display text-2xl tabular', secondsLeft <= 5 ? 'text-danger-bright anim-pulse-neon' : 'text-neon-bright')}>
                  {secondsLeft}<span className="text-sm text-ink-mute"> ث</span>
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full border border-line bg-white/5">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000 ease-linear',
                    secondsLeft <= 5 ? 'bg-danger' : 'bg-gradient-to-l from-neon-deep via-neon to-cyan'
                  )}
                  style={{ width: `${Math.max(0, (secondsLeft / session.timerDuration) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* FINISHED / PODIUM */}
      {session.status === 'finished' && (
        <div className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center space-y-10 text-center">
          <div className="space-y-3">
            <Trophy className="anim-float mx-auto h-16 w-16 text-gold drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
            <h1 className="font-brand text-5xl text-gradient-gold md:text-6xl">تتويج الفائزين</h1>
            <p className="text-sm text-ink-mute md:text-lg">تهانينا الحارة لجميع الفائزين الأبطال!</p>
          </div>

          {players.length > 0 && (
            <div className="flex w-full max-w-2xl items-end justify-center gap-4 pt-12 md:gap-8">
              {players[1] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span className="text-xs font-bold" style={{ color: players[1].color }}>{players[1].name}</span>
                  <div className="flex h-24 w-full items-center justify-center rounded-t-xl border border-white/15 bg-gradient-to-t from-void-3 to-white/10 font-display text-xl font-extrabold text-ink-soft shadow-md">
                    2
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">{players[1].score}</span>
                </div>
              )}

              <div className="flex w-1/3 flex-col items-center gap-3">
                <Crown className="anim-float h-7 w-7 text-gold drop-shadow-[0_0_15px_rgba(251,191,36,0.7)]" />
                <span className="text-sm font-black text-gold" style={{ color: players[0].color }}>{players[0].name}</span>
                <div className="flex h-36 w-full items-center justify-center rounded-t-2xl border-2 border-gold/40 bg-gradient-to-t from-gold-deep/30 to-gold/10 font-display text-3xl font-black text-gold shadow-[var(--shadow-gold)]">
                  1
                </div>
                <span className="font-display text-xs font-extrabold text-gold">{players[0].score}</span>
              </div>

              {players[2] && (
                <div className="flex w-1/3 flex-col items-center gap-3">
                  <span className="text-xs font-bold text-amber-600" style={{ color: players[2].color }}>{players[2].name}</span>
                  <div className="flex h-16 w-full items-center justify-center rounded-t-xl border border-white/10 bg-gradient-to-t from-void to-void-3 font-display text-lg font-extrabold text-amber-600 shadow-sm">
                    3
                  </div>
                  <span className="font-display text-[10px] font-bold text-ink-mute">{players[2].score}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function TvPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-void text-ink-mute">جاري التحميل...</div>}>
      <TvPageContent />
    </Suspense>
  );
}

```

---

## تحديث حالة المشروع — 14 يوليو 2026

> هذا القسم هو مرجع الاستكمال الأحدث، ويعلو على أمثلة الشفرة القديمة الموجودة في الأقسام السابقة من الملف عند التعارض.

### الحالة التقنية الحالية

- الإطار: Next.js `16.2.10` مع React وTypeScript وFirebase/Firestore وFirebase Admin SDK.
- مسارات المنتج الرئيسية: `/dashboard/games`، `/dashboard/sessions`، `/dashboard/questions`، `/player`، `/tv`.
- آخر تحقق محلي: نجح `npm run build` بالكامل في 14 يوليو 2026، بما في ذلك TypeScript وتوليد جميع الصفحات.
- آخر نسخة منشورة قبل تعديلات هذا القسم تعمل على `https://mosabqah.vercel.app`.
- تعديلات «فلوسك على المحك» الموضحة أدناه موجودة في الشفرة المحلية وجاهزة للنشر، ولم يُنفذ نشر جديد لها ضمن طلب حفظ ملف التوثيق.

### الأدوار والصلاحيات

- `admin`: تحكم كامل بالمستخدمين، الألعاب، ظهور الألعاب للمقدمين، صلاحية أنواع وتصنيفات الأسئلة، بنك الأسئلة، الأرشيف والتقارير.
- `presenter`: إنشاء وإدارة وحذف تحدياته، إدارة اللاعبين والأسئلة والنتائج، إضافة أسئلة خاصة دائمة أو مؤقتة ضمن صلاحيات اللعبة.
- `contestant`: يمكنه اللعب بحساب أو كضيف، مع استعادة الدخول ومعرّف مؤقت للاعب.

### بنك الأسئلة وربطه بالألعاب

- يدعم أسئلة نصية، أسئلة صور، كلمات مفقودة/تركيبة، تخمين الصور، وبيانات بعثرة.
- لكل لعبة صلاحيات مستقلة تحدد أنواع الأسئلة والتصنيفات المسموح لها من لوحة المدير.
- صور الأسئلة تُعرض كصور مصغرة عند الاختيار، مع إظهار التصنيف والصعوبة والإجابة للمقدم حيث يلزم.
- الألعاب لا تستخدم تصنيفاً لمجرد تشابه الاسم؛ المصدر النهائي هو صلاحيات اللعبة التي يحددها المدير.

### الألعاب المنفذة أو المرتبطة بالبنية الحالية

- تحدي الأسئلة والإعلام.
- لعبة الكراسي.
- الزنزانة/الإقصاء.
- حرب الفرق والألوان.
- أمبوستر.
- عجلة الروليت.
- الكلمة المفقودة.
- تخمين الصورة/كشف الستار.
- تركيبة.
- بعثرة: كتابة سريعة و«كوّن اسماً».
- فلوسك على المحك.
- TOP 10، ويتضمن واجهة إعداد، API للإجابات، قفل أول مكتشف، المرادفات، شاشة المتسابق، لوحة المقدم وشاشة التلفزيون.

### آخر تعديل: لعبة «فلوسك على المحك»

ملفات التنفيذ الأساسية:

- `src/app/dashboard/games/page.tsx`
- `src/app/dashboard/sessions/page.tsx`

السلوك المعتمد:

1. يختار المقدم 5 تصنيفات بالضبط.
2. لكل تصنيف 5 أسئلة، أي لوحة 5×5 بإجمالي 25 سؤالاً.
3. القيم الافتراضية: 400، 800، 1200، 1600، 2000، ويمكن تعديلها بشرط أن تكون موجبة ومتزايدة.
4. تظهر معاينة الصورة المصغرة فعلياً بجانب قائمة السؤال؛ لأن عنصر `<option>` الأصلي في المتصفح لا يدعم تضمين الصور داخله بصورة موثوقة.
5. الأسئلة مرتبة من الأسهل إلى الأصعب، ولذلك يرتبط السؤال الأسهل بالمبلغ الأقل والأصعب بالمبلغ الأعلى.
6. «تعبئة تلقائية»: تحاول توزيع `سهل، سهل، متوسط، متوسط، صعب` ثم تكمل من المتاح مع إبقاء ترتيب الصعوبة.
7. «اختيار عشوائي»: يختار خمسة أسئلة عشوائياً من التصنيف ثم يرتب المجموعة الناتجة من السهل إلى الصعب.
8. توجد أزرار تعبئة تلقائية وعشوائية للوحة كلها، وأزرار مستقلة لكل تصنيف.
9. تبويب «التعديلات» في الجلسة يعرض محرر اللعبة نفسه: التصنيفات، الأسئلة، الصور المصغرة، المبالغ وطريقة احتساب الإجابات.
10. يمنع الحفظ إذا لم توجد 5 تصنيفات و25 سؤالاً مختلفاً، أو إذا كانت المبالغ غير متزايدة.
11. عند تعديل لوحة قائمة، يحتفظ السؤال بحالة الاستخدام وميزة الدبل إذا بقي السؤال نفسه ضمن اللوحة.
12. لا يسمح بتغيير اللوحة أثناء وجود سؤال معروض؛ يجب اعتماد السؤال أو إنهاؤه أولاً.

### قرارات واجهة عامة محفوظة

- التطبيق RTL ومتوافق مع الجوال وشاشات التلفزيون.
- الخيارات الأربعة لا تستخدم A/B/C/D؛ تعتمد بطاقات ملونة وخط إجابة واضح.
- النوافذ المؤقتة تظهر أعلى المنتصف.
- السؤال والخيارات والفائزون يستخدمون حركات دخول خفيفة وغير مزعجة.
- عند عدم وجود إجابة صحيحة تظهر علامة X حمراء ولا تظهر فقاعات الاحتفال.
- شاشة التلفزيون تعرض اسم التطبيق واسم اللعبة، رمز QR، اللاعبين، الاتصال، السؤال، الإجابات والنتائج حسب حالة الجولة.
- الجلسة النشطة يجب أن تكون واحدة للمقدم، مع إيقاف مؤقت/إنهاء وحالة واضحة.

### ملاحظات الاستكمال

- لا تُحذف تغييرات العمل الحالية أو الملفات غير المتتبعة؛ الشجرة المحلية تحتوي عملاً كبيراً متراكماً ومقصوداً.
- قبل أي نشر تالٍ: شغّل `npm run build` ثم اختبر إنشاء لعبة «فلوسك على المحك»، التعبئة التلقائية والعشوائية، حفظ تعديلات لوحة موجودة، وظهور الصور في المعالج وفي تبويب التعديلات.
- تحذير البناء الحالي غير مانع: Next.js يكتشف أكثر من `package-lock.json` ويستنتج جذر workspace من `/Users/m/package-lock.json`؛ البناء ينجح رغم التحذير.

---

## تحديث TOP 10 وحذف اللاعبين — 14 يوليو 2026

### بنك TOP 10

- تم فحص الملف `Akak_Live_100_Questions.xlsx` باستخدام أداة الجداول المعتمدة.
- يحتوي الملف على 100 سؤال صالح، ولا توجد أسطر ناقصة أو أسئلة رئيسية مكررة.
- تم استيراد الأسئلة الـ100 فعلياً إلى مجموعة Firestore مستقلة باسم `top10Questions`.
- كل مستند يحتوي: السؤال الرئيسي، 10 إجابات، مرادفات كل إجابة، والنقاط من 1 إلى 10.
- يوجد تبويب جديد باسم `TOP 10` في بنك الأسئلة المركزي، ويعرض الأسئلة والإجابات والمرادفات للمقدم والمدير.
- يستطيع مدير النظام حذف سؤال TOP 10 من البنك برسالة تأكيد.

### معالج إنشاء TOP 10

- `اختيار عشوائي`: يختار سؤالاً كاملاً عشوائياً من البنك مع زر لتغيير الاختيار.
- `اختيار محدد`: قائمة قابلة للبحث في السؤال الرئيسي والإجابات، مع معاينة الإجابات العشر.
- `سؤال مخصص`: كتابة السؤال و10 إجابات ومرادفاتها يدوياً كما كان سابقاً.
- تحفظ الجلسة `top10SelectionMode` و`top10BankQuestionId` بالإضافة إلى السؤال والبطاقات؛ لذلك تبقى مستقلة حتى لو تغير البنك لاحقاً.

### تعديلات جلسة TOP 10

- تبويب `التعديلات` يعرض نفس الخيارات الثلاثة: عشوائي، محدد، مخصص.
- عند حفظ سؤال جديد للجلسة تعاد البطاقات العشر إلى حالة غير مكشوفة.
- يمنع تعديل السؤال أثناء وجود جولة TOP 10 معروضة.

### حذف اللاعب في جميع الألعاب

- تبويب اللاعبين موحد لكل الألعاب، وأضيف له زر حذف بجانب كل متسابق.
- تظهر رسالة تأكيد تتضمن اسم المتسابق قبل التنفيذ.
- الحذف متاح فقط لمدير النظام أو مقدم الجلسة صاحبها.
- يحذف النظام اللاعب وإجاباته التابعة للجلسة في عملية واحدة، لمنع بقاء إجابات شبحية في عداد الجولة أو النتائج.

### النشر والتحقق

- تم رفع قواعد Firestore الجديدة والتحقق من نجاح تجميعها.
- نجح `npm run build` وTypeScript وتوليد جميع المسارات.
- تم نشر النسخة على الإنتاج وربطها بالنطاق: `https://mosabqah.vercel.app`.
