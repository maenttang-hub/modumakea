'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentCategory, ComponentTemplate } from '@/types';
import { useBoardStore } from '@/store/use-board-store';

interface UseComponentCatalogOptions {
  boardId: string;
  category: ComponentCategory | 'ALL';
  search: string;
  verifiedOnly: boolean;
  excludeIds?: string[];
  pageSize?: number;
}

interface CatalogResponse {
  items: ComponentTemplate[];
  total: number;
  source: 'supabase' | 'static';
}

const componentCatalogInflight = new Map<string, Promise<CatalogResponse>>();
const componentCatalogRecent = new Map<string, { payload: CatalogResponse; savedAt: number }>();
const COMPONENT_CATALOG_RECENT_TTL_MS = 1500;

async function requestComponentCatalog(requestKey: string, url: string) {
  const recent = componentCatalogRecent.get(requestKey);
  if (recent && Date.now() - recent.savedAt < COMPONENT_CATALOG_RECENT_TTL_MS) {
    return recent.payload;
  }

  const inflight = componentCatalogInflight.get(requestKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Catalog request failed: ${response.status}`);
    }

    const payload = await response.json() as CatalogResponse;
    componentCatalogRecent.set(requestKey, { payload, savedAt: Date.now() });
    return payload;
  })();

  componentCatalogInflight.set(requestKey, request);
  try {
    return await request;
  } finally {
    componentCatalogInflight.delete(requestKey);
  }
}

export function useComponentCatalog(options: UseComponentCatalogOptions) {
  const cacheTemplates = useBoardStore(state => state.cacheTemplates);
  const pageSize = options.pageSize ?? 24;
  const normalizedExcludeIds = useMemo(
    () => Array.from(new Set(options.excludeIds ?? [])).sort(),
    [options.excludeIds]
  );
  const inflightKeyRef = useRef<string>('');
  const [items, setItems] = useState<ComponentTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<'supabase' | 'static'>('static');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<{ queryKey: string; page: number }>({
    queryKey: '',
    page: 0,
  });

  const queryKey = useMemo(
    () => JSON.stringify({
      boardId: options.boardId,
      category: options.category,
      search: options.search.trim(),
      verifiedOnly: options.verifiedOnly,
      excludeIds: normalizedExcludeIds,
      pageSize,
    }),
    [options.boardId, options.category, options.search, options.verifiedOnly, normalizedExcludeIds, pageSize],
  );

  const effectivePage = pageState.queryKey === queryKey ? pageState.page : 0;

  useEffect(() => {
    const requestKey = `${queryKey}:${effectivePage}`;
    if (inflightKeyRef.current === requestKey) {
      return;
    }
    inflightKeyRef.current = requestKey;

    let active = true;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          boardId: options.boardId,
          category: options.category,
          search: options.search.trim(),
          verifiedOnly: options.verifiedOnly ? 'true' : 'false',
          limit: String(pageSize),
          offset: String(effectivePage * pageSize),
        });

        for (const id of normalizedExcludeIds) {
          params.append('excludeId', id);
        }

        const payload = await requestComponentCatalog(
          requestKey,
          `/api/components?${params.toString()}`
        );
        if (!active) {
          return;
        }
        cacheTemplates(payload.items);
        setItems(current => effectivePage === 0 ? payload.items : [...current, ...payload.items]);
        setTotal(payload.total);
        setSource(payload.source);
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Catalog request failed');
      } finally {
        if (active) {
          setIsLoading(false);
        }
        if (inflightKeyRef.current === requestKey) {
          inflightKeyRef.current = '';
        }
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
      if (inflightKeyRef.current === requestKey) {
        inflightKeyRef.current = '';
      }
    };
  }, [
    options.boardId,
    options.category,
    options.search,
    options.verifiedOnly,
    normalizedExcludeIds,
    cacheTemplates,
    effectivePage,
    pageSize,
    queryKey,
  ]);

  const loadMore = useCallback(() => {
    if (isLoading) return;
    if (items.length >= total) return;
    setPageState({ queryKey, page: effectivePage + 1 });
  }, [effectivePage, isLoading, items.length, queryKey, total]);

  return {
    items,
    total,
    source,
    isLoading,
    error,
    hasMore: items.length < total,
    loadMore,
  };
}
