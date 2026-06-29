import type { ArduinoLibraryCatalogEntry } from '@/types';
import { scoreArduinoLibraryCatalogItem, tokenizeCatalogSearch } from '@/lib/catalog-search';
import {
  describeSupabaseError,
  getSupabaseClient,
  getSupabaseDebugInfo,
  isSupabaseNetworkFailure,
} from '@/lib/supabase';
import { sanitizePlainText } from '@/lib/security-input';
import { STATIC_ARDUINO_LIBRARY_CATALOG } from '@/lib/arduino-library-registry';
import { mapSupabaseToArduinoLibrary } from '@/lib/supabase-mapper';

export type ArduinoLibraryCatalogSource = 'supabase' | 'static';

export interface ArduinoLibraryCatalogQuery {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ArduinoLibraryCatalogResult {
  items: ArduinoLibraryCatalogEntry[];
  total: number;
  source: ArduinoLibraryCatalogSource;
}

interface ArduinoLibraryRow {
  name: string;
  author?: string | null;
  sentence?: string | null;
  paragraph?: string | null;
  includes?: string[] | null;
  category?: string | null;
  version?: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SEARCH_CANDIDATE_LIMIT = 220;

function normalizeLimit(value?: number) {
  if (!value || Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value)));
}

function normalizeOffset(value?: number) {
  if (!value || Number.isNaN(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function normalizeSearch(value?: string) {
  return sanitizePlainText(value ?? '', { maxLength: 80 }).trim();
}

function sortStaticLibraries(entries: ArduinoLibraryCatalogEntry[], search: string) {
  if (!search.trim()) {
    return [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  }

  return [...entries].sort((a, b) => {
    const scoreDiff = scoreArduinoLibraryCatalogItem(b, search) - scoreArduinoLibraryCatalogItem(a, search);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.name.localeCompare(b.name, 'en');
  });
}

function buildSupabaseSearchFilter(search: string) {
  const tokens = tokenizeCatalogSearch(search);
  const clauses = new Set<string>();

  for (const token of tokens) {
    clauses.add(`name.ilike.${token}%`);
    clauses.add(`name.ilike.%${token}%`);
    clauses.add(`author.ilike.%${token}%`);
    clauses.add(`sentence.ilike.%${token}%`);
    clauses.add(`category.ilike.%${token}%`);
  }

  return Array.from(clauses).join(',');
}

async function searchSupabaseLibraries(query: ArduinoLibraryCatalogQuery): Promise<ArduinoLibraryCatalogResult | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const search = normalizeSearch(query.search);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);

  let request = supabase
    .from('arduino_libraries')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true });

  if (search) {
    const filter = buildSupabaseSearchFilter(search);
    if (filter) {
      request = request.or(filter);
    }
    request = request.range(0, Math.min(SEARCH_CANDIDATE_LIMIT, Math.max(limit * 6, 60)) - 1);
  } else {
    request = request.range(offset, offset + limit - 1);
  }

  const { data, error, count } = await request;
  if (error || !data) {
    const debugInfo = getSupabaseDebugInfo();
    const errorDetails = describeSupabaseError(error);
    const prefix = isSupabaseNetworkFailure(error)
      ? '[ArduinoLibraryCatalog] Supabase network query failed, using static catalog.'
      : '[ArduinoLibraryCatalog] Supabase query failed, falling back to static catalog.';
    console.warn(prefix, {
      ...debugInfo,
      error: errorDetails,
    });
    return null;
  }

  const items = (data as ArduinoLibraryRow[])
    .map(mapSupabaseToArduinoLibrary)
    .filter((item): item is ArduinoLibraryCatalogEntry => Boolean(item));

  const rankedItems = search ? sortStaticLibraries(items, search).slice(offset, offset + limit) : items;

  return {
    items: rankedItems,
    total: typeof count === 'number' ? count : rankedItems.length,
    source: 'supabase',
  };
}

function searchStaticLibraries(query: ArduinoLibraryCatalogQuery): ArduinoLibraryCatalogResult {
  const search = normalizeSearch(query.search);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);

  const filtered = STATIC_ARDUINO_LIBRARY_CATALOG.filter(entry => {
    if (!search) return true;
    return scoreArduinoLibraryCatalogItem(entry, search) > 0;
  });

  const sorted = sortStaticLibraries(filtered, search);

  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    source: 'static',
  };
}

export async function searchArduinoLibraryCatalog(query: ArduinoLibraryCatalogQuery): Promise<ArduinoLibraryCatalogResult> {
  const supabaseResult = await searchSupabaseLibraries(query);
  if (supabaseResult) {
    return supabaseResult;
  }

  return searchStaticLibraries(query);
}
