import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const questionId = request.nextUrl.searchParams.get('questionId');
  if (!sessionId || !questionId) return NextResponse.json({ error: 'بيانات السؤال غير مكتملة.' }, { status: 400 });
  try {
    const db = adminDb();
    const session = await db.collection('sessions').doc(sessionId).get();
    const sessionData = session.data();
    if (!session.exists || sessionData?.currentQuestionId !== questionId || sessionData?.status !== 'active') {
      return NextResponse.json({ error: 'السؤال غير متاح حالياً.' }, { status: 404 });
    }
    const question = await db.collection('questions').doc(questionId).get();
    if (!question.exists) return NextResponse.json({ error: 'السؤال غير موجود.' }, { status: 404 });
    const data = question.data()!;
    const isWordGame = sessionData?.gameMode === 'word';
    const answerWord = String(data[`option${data.correctOption}`] || '');
    return NextResponse.json({
      id: question.id,
      questionText: data.questionText,
      questionType: data.questionType || 'text',
      imageUrl: data.imageUrl || '',
      option1: isWordGame ? '' : data.option1,
      option2: isWordGame ? '' : data.option2,
      option3: isWordGame ? '' : data.option3,
      option4: isWordGame ? '' : data.option4,
      letterBank: isWordGame ? answerWord.replace(/\s/g, '').split('').sort(() => Math.random() - 0.5) : [],
      // The client needs the word to reveal matching letters locally. This is
      // only lightweight obfuscation; the winning result is still verified server-side.
      wordSecret: isWordGame ? Buffer.from(answerWord, 'utf8').toString('base64') : '',
      difficulty: data.difficulty,
      category: data.category,
    });
  } catch {
    return NextResponse.json({ error: 'تعذر جلب السؤال.' }, { status: 500 });
  }
}
