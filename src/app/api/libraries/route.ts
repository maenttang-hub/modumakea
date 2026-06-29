import { NextResponse } from 'next/server';
import { searchArduinoLibraryCatalog } from '@/lib/arduino-library-catalog';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = sanitizePlainText(searchParams.get('search') ?? '', { maxLength: 80 });
    const limit = Number(searchParams.get('limit') ?? '20');
    const offset = Number(searchParams.get('offset') ?? '0');

    const result = await searchArduinoLibraryCatalog({ search, limit, offset });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '라이브러리 카탈로그 조회에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

