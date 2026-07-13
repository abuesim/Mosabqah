import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import {
  revealAndScoreBaathraRound,
  revealAndScoreChairRound,
  revealAndScoreMoneyQuestion,
  revealAndScoreQuestion,
} from "@/lib/game-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMillis(value: unknown) {
  const timestamp = value as
    { toMillis?: () => number; seconds?: number } | undefined;
  return timestamp?.toMillis
    ? timestamp.toMillis()
    : (timestamp?.seconds || 0) * 1000;
}

export async function POST(request: Request) {
  try {
    const { sessionId, questionId } = (await request.json()) as {
      sessionId?: string;
      questionId?: string;
    };
    if (!sessionId || !questionId)
      return NextResponse.json(
        { error: "بيانات السؤال غير مكتملة." },
        { status: 400 },
      );
    const sessionSnap = await adminDb()
      .collection("sessions")
      .doc(sessionId)
      .get();
    const session = sessionSnap.data();
    const startsAt = toMillis(session?.questionStartedAt);
    const endsAt = startsAt + (Number(session?.timerDuration) || 30) * 1000;
    if (
      !sessionSnap.exists ||
      session?.currentQuestionId !== questionId ||
      session?.questionStatus !== "showing" ||
      !startsAt ||
      Date.now() < endsAt
    ) {
      return NextResponse.json(
        { error: "لم ينته وقت السؤال بعد." },
        { status: 409 },
      );
    }
    if (
      session?.gameMode === "baathra" &&
      session?.baathraMode === "requests"
    ) {
      return NextResponse.json({ waitingForPresenterReview: true });
    }
    if (session?.gameMode === "baathra") {
      return NextResponse.json(
        await revealAndScoreBaathraRound(sessionId, questionId),
      );
    }
    if (session?.gameMode === "tarkeeba") {
      await sessionSnap.ref.update({ questionStatus: "revealed" });
      return NextResponse.json({ revealed: true });
    }
    if (session?.gameMode === "top10") {
      const items = Array.isArray(session.top10Items) ? session.top10Items : [];
      const totals = new Map<
        string,
        { playerId: string; name: string; color: string; scoreAdded: number }
      >();
      items.forEach((item) => {
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
      await sessionSnap.ref.update({
        questionStatus: "revealed",
        top10Items: items.map((item) => ({
          ...item,
          revealed: true,
          ...(!item.foundById ? { revealedByPresenter: true } : {}),
        })),
        roundWinners: [...totals.values()]
          .sort((first, second) => second.scoreAdded - first.scoreAdded)
          .slice(0, 3)
          .map((winner) => ({ ...winner, timeSpent: 0 })),
      });
      return NextResponse.json({ revealed: true });
    }
    return NextResponse.json(
      await (session?.gameMode === "chairs"
        ? revealAndScoreChairRound(sessionId, questionId)
        : session?.gameMode === "money"
          ? revealAndScoreMoneyQuestion(sessionId, questionId)
          : revealAndScoreQuestion(sessionId, questionId)),
    );
  } catch {
    return NextResponse.json(
      { error: "تعذر إنهاء السؤال تلقائياً." },
      { status: 500 },
    );
  }
}
