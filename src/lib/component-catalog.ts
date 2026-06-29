import { STATIC_COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { scoreComponentCatalogItem, tokenizeCatalogSearch } from '@/lib/catalog-search';
import { analyzeComponentForBoard, isDatasheetVerifiedStatus } from '@/lib/datasheet-rules';
import { sanitizePlainText } from '@/lib/security-input';
import { mapSupabaseToTemplate } from '@/lib/supabase-mapper';
import {
  describeSupabaseError,
  getSupabaseClient,
  getSupabaseDebugInfo,
  isSupabaseNetworkFailure,
} from '@/lib/supabase';
import {
  isImportedSchematicBoard,
  isVoltageCompatible,
  matchesComponentCategory,
} from '@/lib/component-template-utils';
import type { ComponentCategory, ComponentTemplate } from '@/types';

export type ComponentCatalogSource = 'supabase' | 'static';

export interface ComponentCatalogQuery {
  search?: string;
  boardId: string;
  category?: ComponentCategory | 'ALL';
  verifiedOnly?: boolean;
  limit?: number;
  offset?: number;
  excludeIds?: string[];
  ids?: string[];
}

export interface ComponentCatalogResult {
  items: ComponentTemplate[];
  total: number;
  source: ComponentCatalogSource;
}

interface ComponentCatalogRow {
  id: string;
  name: string;
  name_key?: string | null;
  category: ComponentCategory;
  description?: string | null;
  description_key?: string | null;
  icon?: string | null;
  compatible_voltage?: '3.3V' | '5V' | 'BOTH' | null;
  default_value?: string | null;
  required_pins?: ComponentTemplate['requiredPins'] | null;
  library_includes?: string[] | null;
  dependencies?: ComponentTemplate['dependencies'] | null;
  ai_hints?: ComponentTemplate['aiHints'] | null;
  design?: ComponentTemplate['design'] | null;
  schematic?: ComponentTemplate['schematic'] | null;
  pcb?: ComponentTemplate['pcb'] | null;
  code?: ComponentTemplate['code'] | null;
  package_version?: string | null;
  library_source?: 'core' | 'custom' | null;
  popularity_rank?: number | null;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const SEARCH_CANDIDATE_LIMIT = 180;
const FEATURED_TEMPLATE_IDS = [
  'tpl_dht11',
  'tpl_dht22',
  'tpl_led',
  'tpl_resistor',
  'tpl_button',
  'tpl_buzzer',
  'tpl_ultrasonic',
  'tpl_oled',
  'tpl_servo',
  'tpl_gas_mq2',
  'tpl_photoresistor',
  'tpl_soil_moisture',
] as const;

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

function normalizeExcludeIds(ids?: string[]) {
  if (!Array.isArray(ids)) return new Set<string>();
  return new Set(ids.filter(Boolean));
}

function normalizeIds(ids?: string[]) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids
    .map(id => sanitizePlainText(id, { maxLength: 80 }))
    .filter(Boolean);
}

function getBoardVoltage(boardId: string) {
  return boardId === 'uno' || boardId === 'nano' ? '5V' : '3.3V';
}

function buildSupabaseSearchFilter(search: string) {
  const tokens = tokenizeCatalogSearch(search);
  const clauses = new Set<string>();

  for (const token of tokens) {
    clauses.add(`name.ilike.${token}%`);
    clauses.add(`name.ilike.%${token}%`);
    clauses.add(`description.ilike.%${token}%`);
    clauses.add(`id.ilike.%${token}%`);
  }

  return Array.from(clauses).join(',');
}

function sortRankedTemplates(
  templates: ComponentTemplate[],
  search: string,
  popularityById?: Map<string, number | null>
) {
  return [...templates].sort((a, b) => {
    const scoreDiff = scoreComponentCatalogItem(b, search) - scoreComponentCatalogItem(a, search);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const aPopularity = popularityById?.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bPopularity = popularityById?.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (aPopularity !== bPopularity) {
      return aPopularity - bPopularity;
    }

    return a.name.localeCompare(b.name, 'ko');
  });
}

function sortStaticTemplates(templates: ComponentTemplate[], search: string) {
  if (search.trim()) {
    return sortRankedTemplates(templates, search);
  }

  const featuredIndex = new Map<string, number>(FEATURED_TEMPLATE_IDS.map((id, index) => [id, index]));
  return [...templates].sort((a, b) => {
    const aRank = featuredIndex.get(a.id) ?? 999;
    const bRank = featuredIndex.get(b.id) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name, 'ko');
  });
}

async function searchSupabaseCatalog(query: ComponentCatalogQuery): Promise<ComponentCatalogResult | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const search = normalizeSearch(query.search);
  const category = query.category ?? 'ALL';
  const verifiedOnly = Boolean(query.verifiedOnly);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const excludeIds = normalizeExcludeIds(query.excludeIds);
  const requestedIds = normalizeIds(query.ids);
  const boardVoltage = getBoardVoltage(query.boardId);
  const enforceBoardVoltage = !isImportedSchematicBoard(query.boardId);
  const hasSearch = Boolean(search);

  const tableNames = ['components', 'components_master'] as const;

  for (const tableName of tableNames) {
    const candidateLimit = Math.min(SEARCH_CANDIDATE_LIMIT, Math.max(limit * 5, 40));

    const buildRequest = (applySearchFilter: boolean) => {
      let request = supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .order('popularity_rank', { ascending: true, nullsFirst: false });

      if (category !== 'ALL') {
        request = request.eq('category', category);
      }

      if (verifiedOnly) {
        request = request.in('datasheet_status', ['official-complete', 'official-partial']);
      }

      if (requestedIds.length > 0) {
        request = request.in('id', requestedIds);
        return request.range(0, Math.max(requestedIds.length - 1, 0));
      }

      if (hasSearch && applySearchFilter) {
        const filter = buildSupabaseSearchFilter(search);
        if (filter) {
          request = request.or(filter);
        }
        return request.range(0, candidateLimit - 1);
      }

      if (!hasSearch) {
        return request.range(offset, offset + limit - 1);
      }

      return request.range(0, candidateLimit - 1);
    };

    let { data, error, count } = await buildRequest(true);
    if ((error || !data || data.length === 0) && hasSearch) {
      ({ data, error, count } = await buildRequest(false));
    }

    if (error || !data) {
      const debugInfo = getSupabaseDebugInfo();
      const errorDetails = describeSupabaseError(error);
      if (isSupabaseNetworkFailure(error)) {
        console.warn(
          `[ComponentCatalog] Supabase network query failed on ${tableName}; skipping remote fallback tables and using static catalog.`,
          { tableName, ...debugInfo, error: errorDetails }
        );
        break;
      }

      console.warn(
        `[ComponentCatalog] Supabase query failed on ${tableName}, trying fallback table if available.`,
        { tableName, ...debugInfo, error: errorDetails }
      );
      continue;
    }

    const popularityById = new Map<string, number | null>();
    const items = (data as ComponentCatalogRow[])
      .map(row => {
        popularityById.set(row.id, row.popularity_rank ?? null);
        return row;
      })
      .map(mapSupabaseToTemplate)
      .filter((item): item is ComponentTemplate => Boolean(item))
      .filter(item => !excludeIds.has(item.id))
      .filter(item => !enforceBoardVoltage || isVoltageCompatible(item.compatibleVoltage, boardVoltage));

    if (requestedIds.length > 0) {
      const itemById = new Map(items.map(item => [item.id, item]));
      const orderedItems = requestedIds
        .map(id => itemById.get(id))
        .filter((item): item is ComponentTemplate => Boolean(item));

      return {
        items: orderedItems,
        total: orderedItems.length,
        source: 'supabase',
      };
    }

    const rankedItems = hasSearch
      ? sortRankedTemplates(items, search, popularityById).slice(offset, offset + limit)
      : items;

    return {
      items: rankedItems,
      total: typeof count === 'number' ? count : rankedItems.length,
      source: 'supabase',
    };
  }

  console.warn('[ComponentCatalog] Supabase query failed, falling back to static catalog.');
  return null;
}

function searchStaticCatalog(query: ComponentCatalogQuery): ComponentCatalogResult {
  const search = normalizeSearch(query.search);
  const category = query.category ?? 'ALL';
  const verifiedOnly = Boolean(query.verifiedOnly);
  const limit = normalizeLimit(query.limit);
  const offset = normalizeOffset(query.offset);
  const excludeIds = normalizeExcludeIds(query.excludeIds);
  const requestedIds = normalizeIds(query.ids);
  const enforceBoardVoltage = !isImportedSchematicBoard(query.boardId);

  if (requestedIds.length > 0) {
    const itemById = new Map(STATIC_COMPONENT_TEMPLATES.map(template => [template.id, template]));
    const items = requestedIds
      .map(id => itemById.get(id))
      .filter((item): item is ComponentTemplate => Boolean(item));

    return {
      items,
      total: items.length,
      source: 'static',
    };
  }

  const filtered = STATIC_COMPONENT_TEMPLATES
    .filter(template => !excludeIds.has(template.id))
    .filter(template => matchesComponentCategory(template, category))
    .filter(template => !search || scoreComponentCatalogItem(template, search) > 0)
    .filter(template => !enforceBoardVoltage || isVoltageCompatible(template.compatibleVoltage, getBoardVoltage(query.boardId)))
    .filter(template => {
      if (!verifiedOnly || template.category !== 'SENSOR') return true;
      const status = analyzeComponentForBoard(template, query.boardId).datasheetStatus;
      return isDatasheetVerifiedStatus(status);
    });

  const sorted = sortStaticTemplates(filtered, search);

  return {
    items: sorted.slice(offset, offset + limit),
    total: sorted.length,
    source: 'static',
  };
}

export async function searchComponentCatalog(query: ComponentCatalogQuery): Promise<ComponentCatalogResult> {
  const supabaseResult = await searchSupabaseCatalog(query);
  if (supabaseResult) {
    return supabaseResult;
  }

  return searchStaticCatalog(query);
}
