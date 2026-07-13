import { NextResponse } from "next/server";
import { adminDb, requireAuthenticated } from "@/lib/firebase-admin";
import {
  revealAndScoreBaathraRound,
  revealAndScoreBaathraRequestsRound,
  revealAndScoreChairRound,
  revealAndScoreMoneyQuestion,
  revealAndScoreQuestion,
} from "@/lib/game-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { sessionId, questionId } = (await request.json()) as {
      sessionId?: string;
      questionId?: string;
    };
    if (!sessionId || !questionId)
      return NextResponse.json(
        { error: "بيانات السؤال غير مكتملة." },
        { status: 400 },
      );
    const session = await adminDb().collection("sessions").doc(sessionId).get();
    if (!session.exists || session.data()?.createdBy !== user.uid)
      return NextResponse.json(
        { error: "غير مصرح لك بكشف إجابة هذه الجلسة." },
        { status: 403 },
      );
    return NextResponse.json(
      await (session.data()?.gameMode === "chairs"
        ? revealAndScoreChairRound(sessionId, questionId)
        : session.data()?.gameMode === "baathra"
          ? session.data()?.baathraMode === "requests"
            ? revealAndScoreBaathraRequestsRound(sessionId, questionId)
            : revealAndScoreBaathraRound(sessionId, questionId)
          : session.data()?.gameMode === "money"
            ? revealAndScoreMoneyQuestion(sessionId, questionId)
            : revealAndScoreQuestion(sessionId, questionId)),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر كشف الإجابة.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 500 },
    );
  }
}
