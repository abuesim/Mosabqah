import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminAuth, adminDb, requireAuthenticated } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { displayName } = (await request.json()) as { displayName?: string };
    const normalizedName = displayName?.trim() || "";
    if (normalizedName.length < 2 || normalizedName.length > 40) {
      return NextResponse.json(
        { error: "اسم العرض يجب أن يكون بين حرفين و40 حرفاً." },
        { status: 400 },
      );
    }
    await Promise.all([
      adminAuth().updateUser(user.uid, { displayName: normalizedName }),
      adminDb().collection("users").doc(user.uid).set(
        {
          displayName: normalizedName,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    ]);
    return NextResponse.json({ displayName: normalizedName });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر حفظ اسم العرض.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}

const GAME_MODES = new Set([
  "quiz",
  "chairs",
  "survival",
  "faction",
  "impostor",
  "roulette",
  "word",
  "image-reveal",
  "tarkeeba",
  "baathra",
  "money",
  "top10",
]);

export async function PUT(request: Request) {
  try {
    const user = await requireAuthenticated(request);
    const { favoriteGameModes } = (await request.json()) as {
      favoriteGameModes?: string[];
    };
    if (
      !Array.isArray(favoriteGameModes) ||
      favoriteGameModes.length > GAME_MODES.size ||
      favoriteGameModes.some((mode) => !GAME_MODES.has(mode))
    ) {
      return NextResponse.json(
        { error: "قائمة الألعاب المفضلة غير صالحة." },
        { status: 400 },
      );
    }
    const uniqueModes = [...new Set(favoriteGameModes)];
    await adminDb().collection("users").doc(user.uid).set(
      {
        favoriteGameModes: uniqueModes,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return NextResponse.json({ favoriteGameModes: uniqueModes });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر حفظ الألعاب المفضلة.";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 400 },
    );
  }
}
