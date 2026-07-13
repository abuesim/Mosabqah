import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import baathraNameRounds from "@/data/baathra-name-rounds.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, requestIndex } = (await request.json()) as {
      sessionId?: string;
      playerId?: string;
      requestIndex?: number;
    };
    if (!sessionId || !playerId || !Number.isInteger(requestIndex))
      return NextResponse.json(
        { error: "بيانات المساعدة غير مكتملة." },
        { status: 400 },
      );

    const db = adminDb();
    const sessionRef = db.collection("sessions").doc(sessionId);
    const playerRef = sessionRef.collection("players").doc(playerId);

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
        session?.gameMode !== "baathra" ||
        session?.baathraMode !== "requests" ||
        session?.questionStatus !== "showing"
      )
        throw new Error("ROUND_UNAVAILABLE");

      const index = Number(requestIndex);
      const activeIndexes = Array.isArray(session.baathraActiveRequestIndexes)
        ? session.baathraActiveRequestIndexes.map(Number)
        : [];
      const requests: string[] = Array.isArray(session.baathraRequests)
        ? session.baathraRequests
        : [];
      if (!activeIndexes.includes(index) || !requests[index])
        throw new Error("REQUEST_UNAVAILABLE");

      const round = baathraNameRounds.find(
        (item) => item.id === Number(session.baathraNameRoundId),
      );
      const category = String(requests[index]);
      const acceptedAnswers = round
        ? round.answers[category as keyof typeof round.answers] || []
        : [];
      if (!acceptedAnswers.length) throw new Error("NO_HINTS");

      const remaining = Math.max(
        0,
        Number(player?.baathraHintLifelinesRemaining ?? 2),
      );
      if (remaining <= 0) throw new Error("NO_LIFELINES");
      const requestUses =
        player?.baathraHintRequestUses &&
        typeof player.baathraHintRequestUses === "object"
          ? { ...player.baathraHintRequestUses }
          : {};
      const useCount = Math.max(0, Number(requestUses[String(index)] || 0));
      requestUses[String(index)] = useCount + 1;
      transaction.update(playerRef, {
        baathraHintLifelinesRemaining: remaining - 1,
        baathraHintRequestUses: requestUses,
      });

      const seed = Array.from(playerId).reduce(
        (total, character) => total + character.charCodeAt(0),
        index * 17,
      );
      const answer = String(acceptedAnswers[seed % acceptedAnswers.length]);
      const characters = Array.from(answer.replace(/\s/g, ""));
      const parity = useCount % 2;
      const revealedLetters = characters.filter(
        (_, characterIndex) => characterIndex % 2 === parity,
      );
      return {
        revealedLetters,
        wordLength: characters.length,
        remaining: remaining - 1,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    const message =
      code === "NO_LIFELINES"
        ? "استخدمت مساعدتي كشف الأحرف."
        : code === "NO_HINTS"
          ? "لا توجد إجابات مرجعية لهذه الفئة."
          : code === "REQUEST_UNAVAILABLE"
            ? "هذا الطلب غير متاح في الجولة الحالية."
            : code === "ROUND_UNAVAILABLE"
              ? "الجولة غير متاحة الآن."
              : "تعذر استخدام المساعدة.";
    return NextResponse.json(
      { error: message },
      { status: code === "NO_LIFELINES" ? 409 : 400 },
    );
  }
}
