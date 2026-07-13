import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { revealAndScoreQuestion } from "@/lib/game-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\sًٌٍَُِّْ]/g, "");

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, questionId, answer, timeSpent, outcome } =
      (await request.json()) as {
        sessionId?: string;
        playerId?: string;
        questionId?: string;
        answer?: string;
        timeSpent?: number;
        outcome?: "won" | "lost";
      };
    if (!sessionId || !playerId || !questionId || !outcome)
      return NextResponse.json(
        { error: "بيانات الجولة غير مكتملة." },
        { status: 400 },
      );
    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const [sessionSnap, playerSnap, questionSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("players").doc(playerId).get(),
      db.collection("questions").doc(questionId).get(),
    ]);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      !playerSnap.exists ||
      !questionSnap.exists ||
      session?.gameMode !== "word" ||
      session?.questionStatus !== "showing" ||
      session?.currentQuestionId !== questionId
    )
      return NextResponse.json(
        { error: "الكلمة غير متاحة الآن." },
        { status: 409 },
      );
    const correct = String(
      questionSnap.data()![`option${questionSnap.data()!.correctOption}`] || "",
    );
    const isCorrect =
      outcome === "won" && normalize(answer || "") === normalize(correct);
    await sessionRef
      .collection("answers")
      .doc(
        `${session.practiceQuestion === true ? "practice_" : ""}${questionId}_${playerId}`,
      )
      .create({
        sessionId,
        playerId,
        questionId,
        chosenOption: 0,
        answer: answer || "",
        isCorrect,
        wordOutcome: isCorrect ? "won" : "lost",
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        practice: session.practiceQuestion === true,
        createdAt: FieldValue.serverTimestamp(),
      });
    const answers = await sessionRef
      .collection("answers")
      .where("questionId", "==", questionId)
      .get();
    const ids = new Set(answers.docs.map((doc) => doc.data().playerId));
    const everyone =
      Array.isArray(session.questionPlayerIds) &&
      session.questionPlayerIds.length > 0 &&
      session.questionPlayerIds.every((id: string) => ids.has(id));
    if (everyone && session.practiceQuestion !== true)
      await revealAndScoreQuestion(sessionId, questionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          (error as { code?: number }).code === 6
            ? "تم تسجيل إجابتك."
            : "تعذر تسجيل الإجابة.",
      },
      { status: 400 },
    );
  }
}
