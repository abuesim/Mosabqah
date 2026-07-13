import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { revealAndScoreQuestion } from "@/lib/game-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, questionId, chosenOption, timeSpent } =
      (await request.json()) as {
        sessionId?: string;
        playerId?: string;
        questionId?: string;
        chosenOption?: number;
        timeSpent?: number;
      };
    if (
      !sessionId ||
      !playerId ||
      !questionId ||
      typeof chosenOption !== "number" ||
      !Number.isInteger(chosenOption) ||
      ![1, 2, 3, 4].includes(chosenOption)
    ) {
      return NextResponse.json(
        { error: "بيانات الإجابة غير صالحة." },
        { status: 400 },
      );
    }
    const db = adminDb();
    const [sessionSnap, playerSnap, questionSnap] = await Promise.all([
      db.collection("sessions").doc(sessionId).get(),
      db
        .collection("sessions")
        .doc(sessionId)
        .collection("players")
        .doc(playerId)
        .get(),
      db.collection("questions").doc(questionId).get(),
    ]);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      !playerSnap.exists ||
      !questionSnap.exists ||
      session?.status !== "active" ||
      session?.questionStatus !== "showing" ||
      session?.currentQuestionId !== questionId
    ) {
      return NextResponse.json(
        { error: "لا يمكن تسجيل الإجابة لهذا السؤال الآن." },
        { status: 409 },
      );
    }
    const questionPlayerIds: string[] = Array.isArray(session.questionPlayerIds)
      ? session.questionPlayerIds
      : [];
    if (questionPlayerIds.length > 0 && !questionPlayerIds.includes(playerId)) {
      return NextResponse.json(
        { error: "لم تكن ضمن المشاركين عند بدء هذا السؤال." },
        { status: 409 },
      );
    }
    const answerRef = db
      .collection("sessions")
      .doc(sessionId)
      .collection("answers")
      .doc(
        `${session.practiceQuestion === true ? "practice_" : ""}${questionId}_${playerId}`,
      );
    await answerRef.create({
      sessionId,
      playerId,
      questionId,
      chosenOption,
      isCorrect: questionSnap.data()!.correctOption === chosenOption,
      timeSpent: Math.max(0, Number(timeSpent) || 0),
      practice: session.practiceQuestion === true,
      createdAt: FieldValue.serverTimestamp(),
    });
    const answersSnap = await db
      .collection("sessions")
      .doc(sessionId)
      .collection("answers")
      .where("questionId", "==", questionId)
      .get();
    const answeredPlayerIds = new Set(
      answersSnap.docs.map((answer) => answer.data().playerId),
    );
    const everyoneAnswered =
      questionPlayerIds.length > 0 &&
      questionPlayerIds.every((id) => answeredPlayerIds.has(id));
    if (
      everyoneAnswered &&
      session.practiceQuestion !== true &&
      session.gameMode !== "money"
    )
      await revealAndScoreQuestion(sessionId, questionId);
    return NextResponse.json({ ok: true, revealed: everyoneAnswered });
  } catch (error) {
    const code = (error as { code?: number }).code;
    return NextResponse.json(
      { error: code === 6 ? "تم تسجيل إجابتك بالفعل." : "تعذر تسجيل الإجابة." },
      { status: code === 6 ? 409 : 500 },
    );
  }
}
