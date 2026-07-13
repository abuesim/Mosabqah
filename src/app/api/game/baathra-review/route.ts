import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb, requireAuthenticated } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { sessionId, answerId, approved } = (await request.json()) as {
      sessionId?: string;
      answerId?: string;
      approved?: boolean;
    };
    if (!sessionId || !answerId || typeof approved !== "boolean")
      return NextResponse.json(
        { error: "بيانات التصحيح غير مكتملة." },
        { status: 400 },
      );
    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const answerRef = sessionRef.collection("answers").doc(answerId);
    await db.runTransaction(async (transaction) => {
      const [sessionSnap, answerSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(answerRef),
      ]);
      if (!sessionSnap.exists || sessionSnap.data()?.createdBy !== user.uid)
        throw new Error("FORBIDDEN");
      if (!answerSnap.exists) throw new Error("ANSWER_NOT_FOUND");
      const answer = answerSnap.data()!;
      if (answer.reviewStatus !== "pending") return;
      transaction.update(answerRef, {
        reviewStatus: approved ? "approved" : "rejected",
        isCorrect: approved,
        reviewedAutomatically: false,
        reviewedAt: FieldValue.serverTimestamp(),
      });
      if (approved) {
        transaction.update(
          sessionRef.collection("players").doc(String(answer.playerId)),
          { score: FieldValue.increment(1) },
        );
      }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر التصحيح.";
    const status =
      message === "UNAUTHENTICATED"
        ? 401
        : message === "FORBIDDEN"
          ? 403
          : message === "ANSWER_NOT_FOUND"
            ? 404
            : 500;
    return NextResponse.json(
      {
        error:
          message === "FORBIDDEN"
            ? "غير مصرح لك بتصحيح إجابات هذه الجلسة."
            : message === "ANSWER_NOT_FOUND"
              ? "الإجابة غير موجودة."
              : message,
      },
      { status },
    );
  }
}
