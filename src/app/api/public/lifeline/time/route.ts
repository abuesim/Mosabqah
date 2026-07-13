import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { sessionId, playerId, questionId } = (await request.json()) as {
      sessionId?: string;
      playerId?: string;
      questionId?: string;
    };
    if (!sessionId || !playerId || !questionId)
      return NextResponse.json(
        { error: "بيانات تمديد الوقت غير مكتملة." },
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
      if (session?.gameMode === "tarkeeba") {
        const lastUsed = player?.tarkeebaTimeExtensionAt?.toMillis?.() || 0;
        if (
          !sessionSnap.exists ||
          !playerSnap.exists ||
          session?.status !== "active" ||
          session?.questionStatus !== "showing" ||
          session?.currentQuestionId !== questionId ||
          Date.now() - lastUsed < 5000
        )
          throw new Error("UNAVAILABLE");
        transaction.update(playerRef, {
          tarkeebaTimeExtensionAt: FieldValue.serverTimestamp(),
        });
        transaction.update(sessionRef, {
          timerDuration: (Number(session.timerDuration) || 30) + 30,
        });
        return { extension: 30 };
      }
      const remaining =
        typeof player?.lifelinesTimeRemaining === "number"
          ? player.lifelinesTimeRemaining
          : 0;
      if (
        !sessionSnap.exists ||
        !playerSnap.exists ||
        session?.status !== "active" ||
        session?.questionStatus !== "showing" ||
        session?.currentQuestionId !== questionId ||
        remaining <= 0
      )
        throw new Error("UNAVAILABLE");
      transaction.update(playerRef, {
        lifelinesTimeRemaining: remaining - 1,
        usedTimeExtension: true,
      });
      transaction.update(sessionRef, {
        timerDuration: (Number(session.timerDuration) || 30) + 20,
      });
      return { extension: 20 };
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "لا يمكن تمديد الوقت الآن." },
      { status: 409 },
    );
  }
}
