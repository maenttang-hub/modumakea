'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getStaticTemplateById } from '@/constants/component-templates';
import { useBoardStore } from '@/store/use-board-store';
import type { ComponentTemplate } from '@/types';

const templateRequestInflight = new Map<string, Promise<ComponentTemplate[]>>();
const templateRequestCooldown = new Map<string, number>();
const TEMPLATE_REQUEST_COOLDOWN_MS = 1200;

async function requestMissingTemplates(queryKey: string, boardId: string, templateIds: string[]) {
  const cachedInflight = templateRequestInflight.get(queryKey);
  if (cachedInflight) {
    return cachedInflight;
  }

  const request = (async () => {
    const params = new URLSearchParams({
      boardId,
      ids: templateIds.join(','),
      limit: String(templateIds.length),
      offset: '0',
    });
    const response = await fetch(`/api/components?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Template request failed: ${response.status}`);
    }

    const payload = await response.json() as { items?: ComponentTemplate[] };
    return Array.isArray(payload.items) ? payload.items : [];
  })();

  templateRequestInflight.set(queryKey, request);

  try {
    const items = await request;
    templateRequestCooldown.set(queryKey, Date.now());
    return items;
  } finally {
    templateRequestInflight.delete(queryKey);
  }
}

export function useEnsureComponentTemplates(templateIds: string[], boardId: string) {
  const templateCache = useBoardStore(state => state.templateCache);
  const cacheTemplates = useBoardStore(state => state.cacheTemplates);
  const inflightKeyRef = useRef<string>('');
  const [failedTemplateIds, setFailedTemplateIds] = useState<string[]>([]);
  const failedTemplateIdSet = useMemo(() => new Set(failedTemplateIds), [failedTemplateIds]);

  const missingTemplateIds = useMemo(() => {
    const seen = new Set<string>();
    const missing: string[] = [];

    for (const templateId of templateIds) {
      if (!templateId || seen.has(templateId)) {
        continue;
      }
      seen.add(templateId);

      if (templateCache[templateId] || getStaticTemplateById(templateId) || failedTemplateIdSet.has(templateId)) {
        continue;
      }

      missing.push(templateId);
    }

    return missing.sort((left, right) => left.localeCompare(right));
  }, [failedTemplateIdSet, templateCache, templateIds]);

  useEffect(() => {
    if (missingTemplateIds.length === 0) {
      inflightKeyRef.current = '';
      return;
    }

    const queryKey = `${boardId}:${missingTemplateIds.join(',')}`;
    if (inflightKeyRef.current === queryKey) {
      return;
    }
    const recentRequestAt = templateRequestCooldown.get(queryKey);
    if (recentRequestAt && Date.now() - recentRequestAt < TEMPLATE_REQUEST_COOLDOWN_MS) {
      return;
    }
    inflightKeyRef.current = queryKey;
    let active = true;

    (async () => {
      try {
        const items = await requestMissingTemplates(queryKey, boardId, missingTemplateIds);
        if (!active) {
          return;
        }

        if (items.length > 0) {
          cacheTemplates(items);
          const resolvedIds = new Set(items.map(item => item.id));
          setFailedTemplateIds(current => current.filter(id => !resolvedIds.has(id)));
        }

        const resolvedIds = new Set(items.map(item => item.id));
        const unresolvedIds = missingTemplateIds.filter(templateId => !resolvedIds.has(templateId));
        if (unresolvedIds.length > 0) {
          setFailedTemplateIds(current => Array.from(new Set([...current, ...unresolvedIds])));
        }
      } catch {
        // Ignore transient request failures; a later render can retry.
      } finally {
        if (inflightKeyRef.current === queryKey) {
          inflightKeyRef.current = '';
        }
      }
    })();

    return () => {
      active = false;
      if (inflightKeyRef.current === queryKey) {
        inflightKeyRef.current = '';
      }
    };
  }, [boardId, cacheTemplates, missingTemplateIds]);
}
