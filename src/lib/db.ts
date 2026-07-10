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
} from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  increment, runTransaction,
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
  await setDoc(doc(db, 'users', uid), profile);

  return { uid, ...profile };
}

/** Sign in by username + password. */
export async function signIn(username: string, password: string): Promise<void> {
  const email = toInternalEmail(username);
  await signInWithEmailAndPassword(auth, email, password);
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
  const [q, s, w] = await Promise.all([
    getDocs(collection(db, 'questions')),
    getDocs(collection(db, 'sessions')),
    getDocs(collection(db, 'winners')),
  ]);
  return {
    questionsCount: q.size,
    sessionsCount: s.size,
    winnersCount: w.size,
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
