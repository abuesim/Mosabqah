import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeArabic = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ar")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();

function editDistance(first: string, second: string) {
  const rows = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let previous = rows[0];
    rows[0] = firstIndex;
    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const current = rows[secondIndex];
      rows[secondIndex] = Math.min(
        rows[secondIndex] + 1,
        rows[secondIndex - 1] + 1,
        previous + (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return rows[second.length];
}

function isSmartMatch(guess: string, candidate: string) {
  const normalizedGuess = normalizeArabic(guess);
  const normalizedCandidate = normalizeArabic(candidate);
  if (!normalizedGuess || !normalizedCandidate) return false;
  if (normalizedGuess === normalizedCandidate) return true;
  return (
    Math.min(normalizedGuess.length, normalizedCandidate.length) >= 4 &&
    Math.abs(normalizedGuess.length - normalizedCandidate.length) <= 1 &&
    editDistance(normalizedGuess, normalizedCandidate) <= 1
  );
}

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, answer, timeSpent } =
      (await request.json()) as {
        sessionId?: string;
        playerId?: string;
        answer?: string;
        timeSpent?: number;
      };
    if (!sessionId || !playerId || !answer?.trim())
      return NextResponse.json(
        { error: "اكتب إجابة قبل الإرسال." },
        { status: 400 },
      );
    if (answer.trim().length > 80)
      return NextResponse.json(
        { error: "الإجابة طويلة جداً." },
        { status: 400 },
      );

    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const playerRef = sessionRef.collection("players").doc(playerId);
    const answerRef = sessionRef.collection("answers").doc();

    const result = await db.runTransaction(async (transaction) => {
      const [sessionSnap, playerSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(playerRef),
      ]);
      const session = sessionSnap.data();
      const player = playerSnap.data();
      if (
        !sessionSnap.exists ||
        !playerSnap.exists ||
        session?.gameMode !== "top10" ||
        session?.status !== "active" ||
        session?.questionStatus !== "showing" ||
        !session?.currentQuestionId ||
        player?.isActive === false
      )
        throw new Error("ROUND_CLOSED");

      const items: Array<{
        id: string;
        answer: string;
        aliases?: string[];
        points: number;
        revealed: boolean;
        foundById?: string;
        foundByName?: string;
        foundByColor?: string;
        revealedByPresenter?: boolean;
      }> = Array.isArray(session.top10Items) ? session.top10Items : [];
      const matchingIndex = items.findIndex((item) =>
        [item.answer, ...(item.aliases || [])].some((candidate) =>
          isSmartMatch(answer, candidate),
        ),
      );
      const matchingItem = matchingIndex >= 0 ? items[matchingIndex] : null;
      const status = !matchingItem
        ? ("wrong" as const)
        : matchingItem.revealed
          ? ("taken" as const)
          : ("captured" as const);
      const points =
        status === "captured" ? Number(matchingItem?.points || 0) : 0;

      transaction.set(answerRef, {
        sessionId,
        playerId,
        questionId: session.currentQuestionId,
        chosenOption: 0,
        isCorrect: status === "captured",
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        top10TextAnswer: answer.trim(),
        top10Status: status,
        ...(matchingItem ? { top10ItemId: matchingItem.id } : {}),
        top10Points: points,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (status !== "captured" || !matchingItem)
        return {
          status,
          ...(status === "taken" && matchingItem
            ? { matchedAnswer: matchingItem.answer }
            : {}),
          points: 0,
        };

      const nextItems = items.map((item, index) =>
        index === matchingIndex
          ? {
              ...item,
              revealed: true,
              foundById: playerId,
              foundByName: String(player?.name || "متسابق"),
              foundByColor: String(player?.color || "#a855f7"),
              revealedByPresenter: false,
            }
          : item,
      );
      transaction.update(playerRef, {
        score: Number(player?.score || 0) + points,
        streak: Number(player?.streak || 0) + 1,
      });

      const allRevealed = nextItems.every((item) => item.revealed);
      const totals = new Map<
        string,
        { playerId: string; name: string; color: string; scoreAdded: number }
      >();
      nextItems.forEach((item) => {
        if (!item.foundById) return;
        const current = totals.get(item.foundById) || {
          playerId: item.foundById,
          name: item.foundByName || "متسابق",
          color: item.foundByColor || "#a855f7",
          scoreAdded: 0,
        };
        current.scoreAdded += Number(item.points || 0);
        totals.set(item.foundById, current);
      });
      transaction.update(sessionRef, {
        top10Items: nextItems,
        ...(allRevealed
          ? {
              questionStatus: "revealed",
              roundWinners: [...totals.values()]
                .sort((first, second) => second.scoreAdded - first.scoreAdded)
                .slice(0, 3)
                .map((winner) => ({ ...winner, timeSpent: 0 })),
            }
          : {}),
      });
      return {
        status,
        matchedAnswer: matchingItem.answer,
        points,
        allRevealed,
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "ROUND_CLOSED"
            ? "انتهت الجولة أو لم تبدأ بعد."
            : "تعذر تسجيل الإجابة.",
      },
      { status: message === "ROUND_CLOSED" ? 409 : 500 },
    );
  }
}
