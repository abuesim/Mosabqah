export interface PublicQuestion {
  id: string;
  questionText: string;
  questionType?: "text" | "image";
  imageUrl?: string;
  option1: string;
  option2: string;
  option3: string;
  option4: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  letterBank?: string[];
  /** Base64-encoded locally playable word for the missing-word mode. */
  wordSecret?: string;
}

export async function submitChairChoice(data: {
  sessionId: string;
  playerId: string;
  roundId: string;
  chairNumber: number;
}) {
  const response = await fetch("/api/public/chair/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "تعذر حجز الكرسي.");
}

async function readJson(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("تعذر الاتصال بخدمة المسابقة.");
  }
  return response.json() as Promise<{ error?: string }>;
}

export async function getPublicQuestion(
  sessionId: string,
  questionId: string,
): Promise<PublicQuestion> {
  const response = await fetch(
    `/api/public/question?sessionId=${encodeURIComponent(sessionId)}&questionId=${encodeURIComponent(questionId)}`,
  );
  const payload = (await readJson(response)) as PublicQuestion & {
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "تعذر جلب السؤال.");
  return payload;
}

export async function submitPublicAnswer(data: {
  sessionId: string;
  playerId: string;
  questionId: string;
  chosenOption: number;
  timeSpent: number;
}) {
  const response = await fetch("/api/public/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "تعذر تسجيل الإجابة.");
}

export async function useFiftyFifty(data: {
  sessionId: string;
  playerId: string;
  questionId: string;
}): Promise<number[]> {
  const response = await fetch("/api/public/lifeline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    hiddenOptions?: number[];
    error?: string;
  };
  if (!response.ok || !payload.hiddenOptions)
    throw new Error(payload.error || "تعذر استخدام وسيلة المساعدة.");
  return payload.hiddenOptions;
}

export async function useTimeExtension(data: {
  sessionId: string;
  playerId: string;
  questionId: string;
}): Promise<number> {
  const response = await fetch("/api/public/lifeline/time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    extension?: number;
    error?: string;
  };
  if (!response.ok || !payload.extension)
    throw new Error(payload.error || "تعذر تمديد الوقت.");
  return payload.extension;
}

export async function requestTimeoutReveal(
  sessionId: string,
  questionId: string,
) {
  const response = await fetch("/api/public/timeout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, questionId }),
  });
  // A 409 only means another client already revealed the answer or its timer
  // reached zero a fraction earlier; neither case needs player-facing noise.
  if (!response.ok && response.status !== 409) {
    const payload = await readJson(response);
    throw new Error(payload.error || "تعذر إنهاء وقت السؤال.");
  }
}

export async function voteForImpostor(data: {
  sessionId: string;
  playerId: string;
  votedPlayerId: string;
}) {
  const response = await fetch("/api/public/impostor/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "تعذر تسجيل التصويت.");
}

export async function stopRoulette(sessionId: string, playerId: string) {
  const response = await fetch("/api/public/roulette/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, playerId }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "تعذر إيقاف العجلة.");
}

export async function submitWordAnswer(data: {
  sessionId: string;
  playerId: string;
  questionId: string;
  answer?: string;
  timeSpent: number;
  outcome: "won" | "lost";
}) {
  const response = await fetch("/api/public/word-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(payload.error || "تعذر تسجيل الكلمة.");
}

export async function submitTarkeebaResult(data: {
  sessionId: string;
  playerId: string;
  answer?: string;
  attempts: number;
  timeSpent: number;
}) {
  const response = await fetch("/api/public/tarkeeba-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    correct?: boolean;
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error || "تعذر تسجيل نتيجة تركيبة.");
  return Boolean(payload.correct);
}

export async function submitBaathraAnswer(data: {
  sessionId: string;
  playerId: string;
  answer: string;
  timeSpent: number;
  requestIndex?: number;
}) {
  const response = await fetch("/api/public/baathra-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    correct?: boolean;
    points?: number;
    rank?: number;
    submitted?: boolean;
    autoApproved?: boolean;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "تعذر تسجيل إجابة بعثرة.");
  return payload;
}

export async function submitTop10Answer(data: {
  sessionId: string;
  playerId: string;
  answer: string;
  timeSpent: number;
}) {
  const response = await fetch("/api/public/top10-answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    status?: "captured" | "taken" | "wrong";
    matchedAnswer?: string;
    points?: number;
    allRevealed?: boolean;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.error || "تعذر إرسال الإجابة.");
  return payload;
}

export async function useBaathraHint(data: {
  sessionId: string;
  playerId: string;
  requestIndex: number;
}) {
  const response = await fetch("/api/public/baathra-hint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = (await readJson(response)) as {
    revealedLetters?: string[];
    wordLength?: number;
    remaining?: number;
    error?: string;
  };
  if (!response.ok || !payload.revealedLetters)
    throw new Error(payload.error || "تعذر استخدام مساعدة كشف الأحرف.");
  return {
    revealedLetters: payload.revealedLetters,
    wordLength: Number(payload.wordLength || 0),
    remaining: Number(payload.remaining || 0),
  };
}
