import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAuthenticated } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
// Firestore documents are limited to 1 MiB. Data URL Base64 adds ~33%, so
// keep the optimized WebP below this threshold with room for question fields.
const MAX_OUTPUT_BYTES = 650 * 1024;

async function optimizeImage(bytes: Buffer) {
  const render = (width: number, quality: number) => sharp(bytes, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize({ width, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer();

  let output = await render(1400, 72);
  for (const quality of [66, 60, 54, 48, 42]) {
    if (output.length <= MAX_OUTPUT_BYTES) break;
    output = await render(1600, quality);
  }
  for (const width of [1200, 1000, 800, 640]) {
    if (output.length <= MAX_OUTPUT_BYTES) break;
    output = await render(width, 60);
  }
  if (output.length > MAX_OUTPUT_BYTES) throw new Error('OUTPUT_TOO_LARGE');
  return output;
}

async function storeImage(bytes: Buffer, contentType: string) {
  if (!contentType.startsWith('image/')) throw new Error('INVALID_IMAGE');
  if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) throw new Error('INVALID_SIZE');
  const optimized = await optimizeImage(bytes);
  return { url: `data:image/webp;base64,${optimized.toString('base64')}`, size: optimized.length };
}

export async function POST(request: Request) {
  try {
    await requireAuthenticated(request);
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const { sourceUrl } = await request.json() as { sourceUrl?: string };
      if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) throw new Error('INVALID_SOURCE');
      const response = await fetch(sourceUrl);
      const imageType = response.headers.get('content-type')?.split(';')[0] || '';
      if (!response.ok || !imageType.startsWith('image/')) throw new Error('INVALID_IMAGE');
      const remoteSize = Number(response.headers.get('content-length') || 0);
      if (remoteSize > MAX_SOURCE_BYTES) throw new Error('INVALID_SIZE');
      const bytes = Buffer.from(await response.arrayBuffer());
      const stored = await storeImage(bytes, imageType);
      return NextResponse.json(stored);
    }

    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File)) throw new Error('MISSING_IMAGE');
    const stored = await storeImage(Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json(stored);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const errors: Record<string, string> = {
      UNAUTHENTICATED: 'يلزم تسجيل الدخول لرفع الصورة.',
      INVALID_IMAGE: 'الملف يجب أن يكون صورة صالحة.', INVALID_SIZE: 'حجم الصورة الأصلي يجب ألا يتجاوز 8 ميغابايت.', OUTPUT_TOO_LARGE: 'تعذر ضغط الصورة إلى حجم آمن لقاعدة البيانات.',
      INVALID_SOURCE: 'رابط الصورة غير صالح.', MISSING_IMAGE: 'اختر صورة للرفع أولاً.',
    };
    return NextResponse.json({ error: errors[message] || 'تعذر حفظ الصورة.' }, { status: message === 'UNAUTHENTICATED' ? 401 : message === 'FORBIDDEN' ? 403 : 400 });
  }
}
