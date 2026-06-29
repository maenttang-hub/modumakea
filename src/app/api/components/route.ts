import { searchComponentCatalog } from '@/lib/component-catalog';
import { sanitizePlainText } from '@/lib/security-input';

export const dynamic = 'force-dynamic';

function parseBoolean(value: string | null) {
  return value === 'true' || value === '1';
}

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const boardId = sanitizePlainText(searchParams.get('boardId') ?? 'uno', { maxLength: 32, fallback: 'uno' });
  const category = sanitizePlainText(searchParams.get('category') ?? 'ALL', { maxLength: 32, fallback: 'ALL' });
  const search = sanitizePlainText(searchParams.get('search') ?? '', { maxLength: 80 });
  const limit = parseInteger(searchParams.get('limit'), 24);
  const offset = parseInteger(searchParams.get('offset'), 0);
  const verifiedOnly = parseBoolean(searchParams.get('verifiedOnly'));
  const excludeIds = searchParams.getAll('excludeId').map(value =>
    sanitizePlainText(value, { maxLength: 80 })
  ).filter(Boolean);
  const ids = (searchParams.get('ids') ?? '')
    .split(',')
    .map(value => sanitizePlainText(value, { maxLength: 80 }))
    .filter(Boolean);

  const result = await searchComponentCatalog({
    boardId,
    category: category === 'ALL' ? 'ALL' : category as never,
    search,
    limit,
    offset,
    verifiedOnly,
    excludeIds,
    ids,
  });

  return Response.json(result);
}
