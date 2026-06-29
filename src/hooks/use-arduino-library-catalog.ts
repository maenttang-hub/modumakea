'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ArduinoLibraryCatalogEntry } from '@/types';

interface UseArduinoLibraryCatalogOptions {
  search: string;
  pageSize?: number;
}

interface CatalogResponse {
  items: ArduinoLibraryCatalogEntry[];
  total: number;
  source: 'supabase' | 'static';
}

const arduinoLibraryCatalogInflight = new Map<string, Promise<CatalogResponse>>();
const arduinoLibraryCatalogRecent = new Map<string, { payload: CatalogResponse; savedAt: number }>();
const ARDUINO_LIBRARY_CATALOG_RECENT_TTL_MS = 1500;

async function requestArduinoLibraryCatalog(requestKey: string, url: string) {
  const recent = arduinoLibraryCatalogRecent.get(requestKey);
  if (recent && Date.now() - recent.savedAt < ARDUINO_LIBRARY_CATALOG_RECENT_TTL_MS) {
    return recent.payload;
  }

  const inflight = arduinoLibraryCatalogInflight.get(requestKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Library request failed: ${response.status}`);
    }

    const payload = await response.json() as CatalogResponse;
    arduinoLibraryCatalogRecent.set(requestKey, { payload, savedAt: Date.now() });
    return payload;
  })();

  arduinoLibraryCatalogInflight.set(requestKey, request);
  try {
    return await request;
  } finally {
    arduinoLibraryCatalogInflight.delete(requestKey);
  }
}

export function useArduinoLibraryCatalog(options: UseArduinoLibraryCatalogOptions) {
  const pageSize = options.pageSize ?? 20;
  const inflightKeyRef = useRef<string>('');
  const [items, setItems] = useState<ArduinoLibraryCatalogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [source, setSource] = useState<'supabase' | 'static'>('static');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<{ queryKey: string; page: number }>({ queryKey: '', page: 0 });

  const queryKey = useMemo(
    () => JSON.stringify({ search: options.search.trim(), pageSize }),
    [options.search, pageSize]
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
          search: options.search.trim(),
          limit: String(pageSize),
          offset: String(effectivePage * pageSize),
        });

        const payload = await requestArduinoLibraryCatalog(
          requestKey,
          `/api/libraries?${params.toString()}`
        );
        if (!active) {
          return;
        }
        setItems(current => (effectivePage === 0 ? payload.items : [...current, ...payload.items]));
        setTotal(payload.total);
        setSource(payload.source);
      } catch (fetchError) {
        if (!active) return;
        setError(fetchError instanceof Error ? fetchError.message : 'Library request failed');
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
  }, [effectivePage, options.search, pageSize, queryKey]);

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
