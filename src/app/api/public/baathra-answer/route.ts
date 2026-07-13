import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { revealAndScoreBaathraRound } from "@/lib/game-server";
import baathraNameRounds from "@/data/baathra-name-rounds.json";

export const runtime = "nodejs";

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670ـ\s]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "");

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, answer, timeSpent, requestIndex } =
      (await request.json()) as {
        sessionId?: string;
        playerId?: string;
        answer?: string;
        timeSpent?: number;
        requestIndex?: number;
      };
    if (!sessionId || !playerId || !answer)
      return NextResponse.json(
        { error: "الإجابة غير مكتملة." },
        { status: 400 },
      );

    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const playerRef = sessionRef.collection("players").doc(playerId);
    const [sessionSnap, playerSnap] = await Promise.all([
      sessionRef.get(),
      playerRef.get(),
    ]);
    const session = sessionSnap.data();
    if (
      !sessionSnap.exists ||
      !playerSnap.exists ||
      session?.gameMode !== "baathra" ||
      session?.questionStatus !== "showing"
    )
      return NextResponse.json({ error: "الجولة غير متاحة." }, { status: 409 });

    if (session?.baathraMode === "requests") {
      const index = Number(requestIndex);
      const requests = Array.isArray(session.baathraRequests)
        ? session.baathraRequests
        : [];
      const activeIndexes = Array.isArray(session.baathraActiveRequestIndexes)
        ? session.baathraActiveRequestIndexes.map(Number)
        : [];
      const available = (
        Array.isArray(session.baathraLetters) ? session.baathraLetters : []
      ).map((letter: unknown) => normalize(String(letter)));
      const validLetters = Array.from(normalize(answer)).every((letter) => {
        const position = available.indexOf(letter);
        if (position < 0) return false;
        available.splice(position, 1);
        return true;
      });
      if (
        !Number.isInteger(index) ||
        !requests[index] ||
        !activeIndexes.includes(index) ||
        !validLetters
      )
        return NextResponse.json(
          { error: "الإجابة لا تطابق الطلب أو الحروف المتاحة." },
          { status: 400 },
        );
      const questionId = String(session.currentQuestionId || "baathra");
      const answerRef = sessionRef
        .collection("answers")
        .doc(`baathra_request_${questionId}_${playerId}_${index}`);
      const dictionaryRound = baathraNameRounds.find(
        (round) => round.id === Number(session.baathraNameRoundId),
      );
      const category = String(requests[index]);
      const acceptedValues = dictionaryRound
        ? dictionaryRound.answers[
            category as keyof typeof dictionaryRound.answers
          ] || []
        : [];
      const autoApproved = acceptedValues.some(
        (accepted: unknown) =>
          normalize(String(accepted)) === normalize(answer),
      );
      const submitted = await db.runTransaction(async (transaction) => {
        const [existing, latestPlayer] = await Promise.all([
          transaction.get(answerRef),
          transaction.get(playerRef),
        ]);
        if (existing.exists) return false;
        transaction.create(answerRef, {
          sessionId,
          playerId,
          questionId,
          chosenOption: 0,
          isCorrect: autoApproved,
          baathraRequestIndex: index,
          baathraTextAnswer: answer.trim(),
          reviewStatus: autoApproved ? "approved" : "pending",
          reviewedAutomatically: autoApproved,
          timeSpent: Math.max(0, Number(timeSpent) || 0),
          createdAt: FieldValue.serverTimestamp(),
        });
        if (autoApproved && latestPlayer.exists) {
          const player = latestPlayer.data() || {};
          transaction.update(playerRef, {
            score: Number(player.score || 0) + 1,
            streak: Number(player.streak || 0) + 1,
          });
        }
        return true;
      });
      if (!submitted)
        return NextResponse.json(
          { error: "تم تسليم هذا الطلب سابقاً." },
          { status: 409 },
        );
      return NextResponse.json({ submitted: true, autoApproved });
    }

    const secret = Buffer.from(
      String(session.baathraSecret || ""),
      "base64",
    ).toString("utf8");
    const correct = normalize(answer) === normalize(secret);
    const questionId = String(session.currentQuestionId || "baathra");
    const answerRef = sessionRef
      .collection("answers")
      .doc(`baathra_${questionId}_${playerId}`);
    let points = 0;
    let rank = 0;
    let shouldFinalize = false;

    await db.runTransaction(async (transaction) => {
      const answersQuery = sessionRef
        .collection("answers")
        .where("questionId", "==", questionId);
      const [latestSession, existing, existingAnswers] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(answerRef),
        transaction.get(answersQuery),
      ]);
      if (existing.exists) return;
      const latest = latestSession.data() || {};
      const correctCount = Number(latest.baathraCorrectCount || 0);
      if (correct) {
        rank = correctCount + 1;
        points =
          latest.baathraScoring === "first"
            ? rank === 1
              ? 3
              : 0
            : rank === 1
              ? 3
              : rank === 2
                ? 2
                : 1;
      }
      const expectedPlayers = Array.isArray(latest.questionPlayerIds)
        ? latest.questionPlayerIds.length
        : 0;
      shouldFinalize =
        latest.baathraScoring === "first" ||
        (latest.baathraScoring !== "first" &&
          expectedPlayers > 0 &&
          existingAnswers.size + 1 >= expectedPlayers);
      transaction.create(answerRef, {
        sessionId,
        playerId,
        questionId,
        chosenOption: 0,
        isCorrect: correct,
        baathraTextAnswer: answer.trim(),
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        baathraRank: rank || null,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (correct) {
        transaction.update(sessionRef, {
          baathraCorrectCount: FieldValue.increment(1),
        });
      }
    });
    if (shouldFinalize) await revealAndScoreBaathraRound(sessionId, questionId);
    return NextResponse.json({ submitted: true, correct, points, rank });
  } catch {
    return NextResponse.json(
      { error: "تعذر تسجيل إجابة بعثرة." },
      { status: 500 },
    );
  }
}
