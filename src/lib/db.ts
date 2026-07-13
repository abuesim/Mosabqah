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

import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  runTransaction,
  getCountFromServer,
  writeBatch,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";

/* ============================================================= */
/* Types                                                          */
/* ============================================================= */

export type Role = "admin" | "presenter" | "player";

export interface UserProfile {
  uid: string;
  username: string;
  displayName?: string;
  role: Role;
  roomCode?: string;
  favoriteGameModes?: string[];
  createdAt?: any;
}

export interface Question {
  id: string;
  questionText: string;
  questionType?: "text" | "image" | "word";
  imageUrl?: string;
  answerWord?: string;
  hint?: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  correctOption: number;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  createdBy?: string;
  /** Private questions belong only to the presenter who created them. */
  visibility?: "public" | "presenter-private";
  temporarySessionId?: string;
  createdAt?: any;
}

export interface Top10Question {
  id: string;
  prompt: string;
  items: Array<{
    answer: string;
    aliases: string[];
    points: number;
  }>;
  source?: string;
  createdBy?: string;
  createdAt?: any;
}

export interface Session {
  id: string;
  title: string;
  roomCode: string;
  status:
    | "waiting"
    | "ready"
    | "active"
    | "paused"
    | "scheduled"
    | "finished"
    | "cancelled"
    | "archived";
  currentQuestionId: string | null;
  questionStatus: "idle" | "showing" | "revealed" | "time_up";
  revealedCorrectOption?: number | null;
  roundWinners?: Array<{
    playerId: string;
    name: string;
    color: string;
    scoreAdded: number;
    timeSpent: number;
  }>;
  questionPlayerIds?: string[];
  questionStartedAt?: any;
  /** Open-ended, unscored round used to explain the game before competition. */
  practiceQuestion?: boolean;
  timerDuration: number;
  showScoreboard: boolean;
  createdBy: string;
  createdAt?: any;
  questionIds: string[];
  /** Questions already launched in this session. They stay in history but cannot be launched twice. */
  usedQuestionIds?: string[];
  joiningLocked?: boolean;
  isDraft?: boolean;
  startedAt?: any;
  gameMode?:
    | "quiz"
    | "chairs"
    | "survival"
    | "faction"
    | "impostor"
    | "roulette"
    | "word"
    | "image-reveal"
    | "tarkeeba"
    | "baathra"
    | "money"
    | "top10";
  wordMaxAttempts?: number;
  wordKeyboardPreview?: boolean;
  imageRevealGrid?: 4 | 6 | 8;
  imageRevealStartedAt?: any;
  imageRevealOrder?: number[];
  tarkeebaSecret?: string;
  tarkeebaCategory?: string;
  tarkeebaHint?: string;
  tarkeebaQuestionText?: string;
  tarkeebaShowQuestion?: boolean;
  tarkeebaMaxAttempts?: number;
  baathraMode?: "speed" | "requests";
  baathraSecret?: string;
  baathraLetters?: string[];
  baathraCategory?: string;
  baathraScoring?: "first" | "ranked";
  baathraShuffledLetters?: string[];
  baathraCorrectCount?: number;
  baathraRequests?: string[];
  baathraActiveRequestIndexes?: number[];
  /** Identifier of the bundled name-dictionary round used for auto-correction. */
  baathraNameRoundId?: number;
  baathraUsedRounds?: Array<{
    roundId: string;
    mode: "speed" | "requests";
    label: string;
    letters: string[];
    nameRoundId?: number;
  }>;
  baathraRequestResults?: Array<{
    playerId: string;
    name: string;
    color: string;
    approved: number;
    rejected: number;
    total: number;
    completionTime?: number;
    speedBonus?: number;
    answers?: Array<{
      request: string;
      value: string;
      approved: boolean;
    }>;
  }>;
  moneyCategories?: string[];
  moneyTeams?: Array<{
    id: string;
    name: string;
    color: string;
    balance: number;
  }>;
  moneyBoard?: Array<{
    id: string;
    questionId: string;
    category: string;
    value: number;
    status: "available" | "open" | "used";
    isDouble?: boolean;
  }>;
  /** How correct money-game answers are rewarded when the presenter approves a round. */
  moneyScoring?: "fastest" | "ranked";
  moneyActiveTeamId?: string;
  moneyCurrentCellId?: string | null;
  top10Prompt?: string;
  top10BankQuestionId?: string | null;
  top10SelectionMode?: "random" | "custom" | "selected";
  top10Items?: Array<{
    id: string;
    answer: string;
    aliases: string[];
    points: number;
    revealed: boolean;
    foundById?: string;
    foundByName?: string;
    foundByColor?: string;
    revealedByPresenter?: boolean;
  }>;
  chairCount?: number;
  chairRound?: number;
  chairResults?: Record<string, "safe" | "out">;
  chairPhase?: "idle" | "spinning" | "fake" | "ready" | "revealed";
  chairReadyAt?: any;
  chairAutoStopAt?: any;
  teamsEnabled?: boolean;
  teamSize?: number;
  impostorWord?: string;
  impostorCategory?: string;
  impostorPlayerId?: string | null;
  impostorPhase?: "waiting" | "discussion" | "voting" | "revealed";
  impostorVotes?: Record<string, number>;
  discussionDuration?: number;
  rouletteWinnerId?: string | null;
  rouletteStatus?: "idle" | "spinning" | "revealed";
  roulettePrize?: string | null;
  currentHint?: string | null;
  tvBgColor?: string;
  tvLogoText?: string;
  tvFontSize?: "sm" | "md" | "lg" | "xl";
  /** Presenter can hide question content from the television while keeping the live status visible. */
  tvShowQuestions?: boolean;
  overlayMode?: "normal" | "chroma" | "transparent";
}

export interface Player {
  id: string;
  sessionId: string;
  name: string;
  color: string;
  /** A private 2-digit recovery code shown to the contestant and presenter. */
  rejoinCode?: string;
  teamId?: string;
  score: number;
  streak: number;
  lifelinesRemaining: number;
  lifelinesTimeRemaining: number;
  wordRevealLifelinesRemaining?: number;
  wordFilterLifelinesRemaining?: number;
  baathraHintLifelinesRemaining?: number;
  baathraHintRequestUses?: Record<string, number>;
  usedFiftyFifty?: boolean;
  usedTimeExtension?: boolean;
  /** Late joiners wait for the presenter when joining is locked. */
  approvalStatus?: "pending" | "approved" | "rejected";
  isActive: boolean;
  createdAt?: any;
  lastSeenAt?: any;
}

export interface Answer {
  id: string;
  sessionId: string;
  playerId: string;
  questionId: string;
  chosenOption: number;
  isCorrect: boolean;
  timeSpent: number;
  tarkeebaAttempts?: number;
  baathraRank?: number;
  baathraRequestIndex?: number;
  baathraTextAnswer?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewedAutomatically?: boolean;
  top10TextAnswer?: string;
  top10Status?: "captured" | "taken" | "wrong";
  top10ItemId?: string;
  top10Points?: number;
  practiceQuestion?: boolean;
  createdAt?: any;
}

export interface Winner {
  id: string;
  sessionId: string;
  sessionTitle: string;
  winnerName: string;
  winnerScore: number;
  totalPlayers: number;
  presenterId?: string;
  presenterName?: string;
  participants?: Array<{ name: string; score: number }>;
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
  `${username.trim().toLowerCase().replace(/\s+/g, "")}@mosabqah.local`;

async function setDocWithTimeout(docRef: any, data: any, timeoutMs = 6000) {
  const writePromise = setDoc(docRef, data);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout_firestore")), timeoutMs),
  );
  try {
    await Promise.race([writePromise, timeoutPromise]);
  } catch (err: any) {
    if (err.message === "timeout_firestore") {
      throw new Error(
        "تعذر الاتصال بقاعدة بيانات Firestore. يرجى التأكد من تفعيل وإنشاء قاعدة البيانات (Firestore Database) داخل لوحة تحكم Firebase وتغيير القواعد للوضع التجريبي (Test Mode).",
      );
    }
    throw err;
  }
}

/** Sign up: create auth user + profile doc in users/{uid}. */
export async function signUp(
  username: string,
  password: string,
  role: "presenter" | "player" = "presenter",
): Promise<UserProfile> {
  const email = toInternalEmail(username);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  const profile = {
    username: username.trim(),
    displayName: username.trim(),
    role,
    createdAt: serverTimestamp(),
  };
  await setDocWithTimeout(doc(db, "users", uid), profile);

  return { uid, ...profile };
}

/** Sign in by username + password. */
export async function signIn(
  username: string,
  password: string,
): Promise<UserProfile | null> {
  const email = toInternalEmail(username);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return getUserProfile(cred.user.uid);
}

/** Sign in with Google provider. */
export async function signInWithGoogle(
  defaultRole: "presenter" | "player" = "presenter",
): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  const user = cred.user;
  const uid = user.uid;

  const docRef = doc(db, "users", uid);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    const profile = {
      username: user.displayName || user.email?.split("@")[0] || "مستخدم جوجل",
      displayName:
        user.displayName || user.email?.split("@")[0] || "مستخدم جوجل",
      role: defaultRole,
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
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as any) };
}

/** Find the presenter who owns a permanently reserved four-digit room code. */
export async function getPresenterByRoomCode(
  roomCode: string,
): Promise<UserProfile | null> {
  const snap = await getDocs(
    query(collection(db, "users"), where("roomCode", "==", roomCode), limit(1)),
  );
  if (snap.empty) return null;
  const result = snap.docs[0];
  return { uid: result.id, ...result.data() } as UserProfile;
}

/* ============================================================= */
/* QUESTIONS                                                      */
/* ============================================================= */

const qColl = () => collection(db, "questions");

export async function getQuestions(): Promise<Question[]> {
  const snap = await getDocs(query(qColl(), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Question);
}

export async function addQuestion(data: Omit<Question, "id">): Promise<string> {
  const ref = await addDoc(qColl(), { ...data, createdAt: serverTimestamp() });
  return ref.id;
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(db, "questions", id));
}

/** Update an existing question without changing its owner or creation time. */
export async function updateQuestion(
  id: string,
  data: Omit<Question, "id" | "createdAt" | "createdBy">,
): Promise<void> {
  await updateDoc(doc(db, "questions", id), data);
}

export async function bulkAddQuestions(
  items: Omit<Question, "id">[],
): Promise<number> {
  // Firestore doesn't have a batch addDoc that returns IDs in one call;
  // do them in parallel (the question bank import isn't huge).
  await Promise.all(
    items.map((item) =>
      addDoc(qColl(), { ...item, createdAt: serverTimestamp() }),
    ),
  );
  return items.length;
}

const top10QuestionsColl = () => collection(db, "top10Questions");

export async function getTop10Questions(): Promise<Top10Question[]> {
  const snap = await getDocs(
    query(top10QuestionsColl(), orderBy("createdAt", "desc")),
  );
  return snap.docs.map(
    (item) => ({ id: item.id, ...item.data() }) as Top10Question,
  );
}

export async function deleteTop10Question(id: string): Promise<void> {
  await deleteDoc(doc(db, "top10Questions", id));
}

/* ============================================================= */
/* SESSIONS                                                       */
/* ============================================================= */

const sessionsColl = () => collection(db, "sessions");

export async function getSessions(userId: string): Promise<Session[]> {
  const snap = await getDocs(
    query(
      sessionsColl(),
      where("createdBy", "==", userId),
      orderBy("createdAt", "desc"),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session);
}

/** Admin reporting helper: fetch every session so archives can be grouped by presenter. */
export async function getAllSessions(): Promise<Session[]> {
  const snap = await getDocs(sessionsColl());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session);
}

/** Public profile reads are permitted by the rules; used only in the admin reporting view. */
export async function getAllUserProfiles(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
}

export async function getSessionById(id: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, "sessions", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Session;
}

export async function getSessionByRoomCode(
  code: string,
): Promise<Session | null> {
  const snap = await getDocs(
    query(sessionsColl(), where("roomCode", "==", code)),
  );
  return selectJoinableSession(
    snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session),
  );
}

function getCreatedAtMillis(session: Session): number {
  const timestamp = session.createdAt as
    { toMillis?: () => number; seconds?: number } | undefined;
  if (timestamp?.toMillis) return timestamp.toMillis();
  return (timestamp?.seconds || 0) * 1000;
}

function selectJoinableSession(sessions: Session[]): Session | null {
  const candidates = sessions.filter(
    (session) =>
      !session.isDraft &&
      (session.status === "active" || session.status === "waiting"),
  );
  if (!candidates.length) return null;
  return candidates.sort((a, b) => {
    const statusOrder = (session: Session) =>
      session.status === "active" ? 0 : 1;
    return (
      statusOrder(a) - statusOrder(b) ||
      getCreatedAtMillis(b) - getCreatedAtMillis(a)
    );
  })[0];
}

export async function createSession(
  data: Omit<Session, "id" | "createdAt">,
): Promise<string> {
  // Firestore rejects undefined fields. Game-specific settings are optional,
  // so remove only undefined values while preserving null and false values.
  const cleanData = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
  const ref = await addDoc(sessionsColl(), {
    ...cleanData,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSession(
  id: string,
  patch: Partial<Session>,
): Promise<void> {
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  await updateDoc(doc(db, "sessions", id), cleanPatch as any);
}

/** Activates one session and atomically pauses every other active session owned by the presenter. */
export async function activateSessionExclusively(
  id: string,
  ownerId: string,
  patch: Partial<Session> = {},
): Promise<void> {
  const snap = await getDocs(
    query(sessionsColl(), where("createdBy", "==", ownerId)),
  );
  const batch = writeBatch(db);
  snap.docs.forEach((sessionDoc) => {
    if (sessionDoc.id !== id && sessionDoc.data().status === "active") {
      batch.update(sessionDoc.ref, {
        status: "paused",
        questionStatus: "idle",
        currentQuestionId: null,
      });
    }
  });
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  batch.update(doc(db, "sessions", id), {
    ...cleanPatch,
    status: "active",
    isDraft: false,
  });
  await batch.commit();
}

/** Delete a session owned by the current presenter (enforced again by Firestore rules). */
export async function deleteSession(id: string): Promise<void> {
  await deleteDoc(doc(db, "sessions", id));
}

/** Fetch the actual question docs for a session's questionIds. */
export async function getSessionQuestions(
  questionIds: string[],
): Promise<Question[]> {
  if (!questionIds.length) return [];
  // Firestore "in" queries accept at most 30 document IDs. Sessions can
  // contain more, so fetch in chunks and restore the presenter-selected order.
  const chunks: string[][] = [];
  for (let index = 0; index < questionIds.length; index += 30) {
    chunks.push(questionIds.slice(index, index + 30));
  }
  const snapshots = await Promise.all(
    chunks.map((ids) => getDocs(query(qColl(), where("__name__", "in", ids)))),
  );
  const questionsById = new Map<string, Question>();
  snapshots
    .flatMap((snap) => snap.docs)
    .forEach((docSnap) => {
      questionsById.set(docSnap.id, {
        id: docSnap.id,
        ...docSnap.data(),
      } as Question);
    });
  return questionIds.flatMap((id) => {
    const question = questionsById.get(id);
    return question ? [question] : [];
  });
}

/* ============================================================= */
/* PLAYERS (subcollection: sessions/{id}/players)                */
/* ============================================================= */

export async function getPlayers(sessionId: string): Promise<Player[]> {
  const coll = collection(db, "sessions", sessionId, "players");
  const snap = await getDocs(query(coll, orderBy("score", "desc")));
  return snap.docs.map((d) => ({ id: d.id, sessionId, ...d.data() }) as Player);
}

export async function getPlayerByName(
  sessionId: string,
  name: string,
): Promise<Player | null> {
  const coll = collection(db, "sessions", sessionId, "players");
  const snap = await getDocs(
    query(coll, where("name", "==", name.trim()), limit(1)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, sessionId, ...d.data() } as Player;
}

/** Finds a contestant by their presenter-issued 2-digit recovery code. */
export async function getPlayerByRejoinCode(
  sessionId: string,
  rejoinCode: string,
): Promise<Player | null> {
  const coll = collection(db, "sessions", sessionId, "players");
  const snap = await getDocs(
    query(coll, where("rejoinCode", "==", rejoinCode.trim()), limit(1)),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, sessionId, ...d.data() } as Player;
}

export async function createPlayer(
  sessionId: string,
  data: Omit<Player, "id" | "sessionId" | "createdAt">,
): Promise<Player> {
  const coll = collection(db, "sessions", sessionId, "players");
  if (data.rejoinCode) {
    const ref = doc(coll, `rejoin_${data.rejoinCode}`);
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists()) throw new Error("PLAYER_CODE_TAKEN");
      transaction.set(ref, {
        ...data,
        createdAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
      });
    });
    return { id: ref.id, sessionId, ...data };
  }
  const ref = await addDoc(coll, {
    ...data,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
  return { id: ref.id, sessionId, ...data };
}

export async function updatePlayer(
  sessionId: string,
  playerId: string,
  patch: Partial<Player>,
): Promise<void> {
  await updateDoc(
    doc(db, "sessions", sessionId, "players", playerId),
    patch as any,
  );
}

export async function deletePlayer(
  sessionId: string,
  playerId: string,
): Promise<void> {
  const answers = await getDocs(
    query(
      collection(db, "sessions", sessionId, "answers"),
      where("playerId", "==", playerId),
    ),
  );
  const batch = writeBatch(db);
  answers.docs.forEach((answer) => batch.delete(answer.ref));
  batch.delete(doc(db, "sessions", sessionId, "players", playerId));
  await batch.commit();
}

/** Updates a lightweight presence heartbeat while the contestant page is open. */
export async function touchPlayerPresence(
  sessionId: string,
  playerId: string,
): Promise<void> {
  await updateDoc(doc(db, "sessions", sessionId, "players", playerId), {
    lastSeenAt: serverTimestamp(),
  });
}

/* ============================================================= */
/* ANSWERS (subcollection: sessions/{id}/answers)                */
/* ============================================================= */

export async function submitAnswer(
  sessionId: string,
  data: Omit<Answer, "id" | "sessionId" | "createdAt">,
): Promise<void> {
  const coll = collection(db, "sessions", sessionId, "answers");
  await addDoc(coll, { ...data, sessionId, createdAt: serverTimestamp() });
}

export async function getAnswerCount(
  sessionId: string,
  questionId: string,
): Promise<number> {
  const coll = collection(db, "sessions", sessionId, "answers");
  const snap = await getDocs(
    query(coll, where("questionId", "==", questionId)),
  );
  return snap.size;
}

export async function getAnswersForQuestion(
  sessionId: string,
  questionId: string,
): Promise<Answer[]> {
  const coll = collection(db, "sessions", sessionId, "answers");
  const snap = await getDocs(
    query(coll, where("questionId", "==", questionId)),
  );
  return snap.docs.map((d) => ({ id: d.id, sessionId, ...d.data() }) as Answer);
}

export async function getPlayerAnswer(
  sessionId: string,
  playerId: string,
  questionId: string,
): Promise<Answer | null> {
  const coll = collection(db, "sessions", sessionId, "answers");
  const snap = await getDocs(
    query(
      coll,
      where("playerId", "==", playerId),
      where("questionId", "==", questionId),
      limit(1),
    ),
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, sessionId, ...d.data() } as Answer;
}

export async function reviewBaathraRequestAnswer(
  sessionId: string,
  answerId: string,
  approved: boolean,
) {
  const answerRef = doc(db, "sessions", sessionId, "answers", answerId);
  await runTransaction(db, async (transaction) => {
    const answerSnap = await transaction.get(answerRef);
    if (!answerSnap.exists()) throw new Error("الإجابة غير موجودة.");
    const answer = answerSnap.data() as Answer;
    if (answer.reviewStatus !== "pending") return;
    transaction.update(answerRef, {
      reviewStatus: approved ? "approved" : "rejected",
      isCorrect: approved,
    });
    if (approved) {
      const playerRef = doc(
        db,
        "sessions",
        sessionId,
        "players",
        answer.playerId,
      );
      transaction.update(playerRef, { score: increment(1) });
    }
  });
}

/* ============================================================= */
/* WINNERS ARCHIVE + LEADERBOARD                                  */
/* ============================================================= */

export async function archiveWinner(
  data: Omit<Winner, "id" | "createdAt">,
): Promise<void> {
  await addDoc(collection(db, "winners"), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function getWinnersArchive(): Promise<Winner[]> {
  const snap = await getDocs(
    query(collection(db, "winners"), orderBy("createdAt", "desc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Winner);
}

export async function deleteWinnerArchive(id: string): Promise<void> {
  await deleteDoc(doc(db, "winners", id));
}

export async function getLeaders(): Promise<LeaderEntry[]> {
  const snap = await getDocs(
    query(collection(db, "leaderboard"), orderBy("totalScore", "desc")),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LeaderEntry);
}

/**
 * Upsert a player's cumulative score. Replaces the Supabase RPC
 * `increment_cumulative_score` using a transaction.
 */
export async function incrementCumulativeScore(
  playerName: string,
  scoreAdded: number,
): Promise<void> {
  const ref = doc(db, "leaderboard", playerName);
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

export async function getCounts(): Promise<{
  questionsCount: number;
  sessionsCount: number;
  winnersCount: number;
}> {
  const [qSnap, sSnap, wSnap] = await Promise.all([
    getCountFromServer(collection(db, "questions")),
    getCountFromServer(collection(db, "sessions")),
    getCountFromServer(collection(db, "winners")),
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
export function subscribeSession(
  sessionId: string,
  cb: (session: Session | null) => void,
): Unsubscribe {
  return onSnapshot(doc(db, "sessions", sessionId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...snap.data() } as Session) : null);
  });
}

/** Watch the next active/waiting session launched with a presenter's permanent room code. */
export function subscribeSessionByRoomCode(
  roomCode: string,
  cb: (session: Session | null) => void,
): Unsubscribe {
  return onSnapshot(
    query(sessionsColl(), where("roomCode", "==", roomCode)),
    (snap) => {
      cb(
        selectJoinableSession(
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session),
        ),
      );
    },
  );
}

/** Watch a single player doc (contestant's own score/streak/lifelines). */
export function subscribePlayer(
  sessionId: string,
  playerId: string,
  cb: (player: Player | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, "sessions", sessionId, "players", playerId),
    (snap) => {
      cb(
        snap.exists()
          ? ({ id: snap.id, sessionId, ...snap.data() } as Player)
          : null,
      );
    },
  );
}

/** Watch all players in a session, sorted by score desc (leaderboard). */
export function subscribeSessionPlayers(
  sessionId: string,
  cb: (players: Player[]) => void,
): Unsubscribe {
  const coll = collection(db, "sessions", sessionId, "players");
  return onSnapshot(query(coll, orderBy("score", "desc")), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, sessionId, ...d.data() }) as Player));
  });
}

/**
 * Watch the answer count for a specific question in a session.
 * Returns the count via callback whenever an answer is added/removed.
 */
export function subscribeAnswerCount(
  sessionId: string,
  questionId: string,
  cb: (count: number) => void,
): Unsubscribe {
  const coll = collection(db, "sessions", sessionId, "answers");
  return onSnapshot(
    query(coll, where("questionId", "==", questionId)),
    (snap) => {
      cb(snap.size);
    },
  );
}

/** Watch the individual answers of the current round for the presenter console. */
export function subscribeQuestionAnswers(
  sessionId: string,
  questionId: string,
  cb: (answers: Answer[]) => void,
): Unsubscribe {
  const coll = collection(db, "sessions", sessionId, "answers");
  return onSnapshot(
    query(coll, where("questionId", "==", questionId)),
    (snap) => {
      cb(
        snap.docs.map((d) => ({ id: d.id, sessionId, ...d.data() }) as Answer),
      );
    },
  );
}
