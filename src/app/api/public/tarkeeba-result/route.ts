import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670ـ\s]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, answer, attempts, timeSpent } =
      (await request.json()) as {
        sessionId?: string;
        playerId?: string;
        answer?: string;
        attempts?: number;
        timeSpent?: number;
      };
    if (!sessionId || !playerId || !attempts)
      return NextResponse.json(
        { error: "بيانات تركيبة غير مكتملة." },
        { status: 400 },
      );
    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const [sessionSnap, playerSnap] = await Promise.all([
      sessionRef.get(),
      sessionRef.collection("players").doc(playerId).get(),
    ]);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      !playerSnap.exists ||
      session?.gameMode !== "tarkeeba" ||
      session?.questionStatus !== "showing"
    )
      return NextResponse.json({ error: "الجولة غير متاحة." }, { status: 409 });
    const secret = Buffer.from(
      String(session.tarkeebaSecret || ""),
      "base64",
    ).toString("utf8");
    const correct =
      Boolean(answer) && normalize(answer || "") === normalize(secret);
    const questionId = String(session.currentQuestionId || "tarkeeba");
    const answerRef = sessionRef
      .collection("answers")
      .doc(`tarkeeba_${questionId}_${playerId}`);
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(answerRef);
      const previous = existing.data();
      const answerData = {
        sessionId,
        playerId,
        questionId,
        chosenOption: 0,
        isCorrect: correct,
        tarkeebaAttempts: Math.min(6, Math.max(1, attempts)),
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        practiceQuestion: session.practiceQuestion === true,
        createdAt: FieldValue.serverTimestamp(),
      };
      if (existing.exists)
        transaction.set(answerRef, answerData, { merge: true });
      else transaction.create(answerRef, answerData);
      const shouldAward =
        correct &&
        session.practiceQuestion !== true &&
        (!previous?.isCorrect || previous?.practiceQuestion === true);
      if (shouldAward)
        transaction.update(playerSnap.ref, {
          score: (playerSnap.data()?.score || 0) + Math.max(1, 7 - attempts),
          streak: (playerSnap.data()?.streak || 0) + 1,
        });
    });
    return NextResponse.json({ correct });
  } catch {
    return NextResponse.json(
      { error: "تعذر حفظ نتيجة تركيبة." },
      { status: 500 },
    );
  }
}
