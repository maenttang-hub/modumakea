'use client';

import { useEffect, useState } from 'react';
import { useBoardStore } from '@/store/use-board-store';

export function useCloudProjectLoader(projectId?: string) {
  const loadCloudProjectFromLink = useBoardStore(state => state.loadCloudProjectFromLink);
  const persistApi = useBoardStore.persist;
  const [persistHydrated, setPersistHydrated] = useState(() => persistApi?.hasHydrated?.() ?? true);
  const [isLoading, setIsLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!persistApi) {
      return;
    }

    const unsubscribeHydrate = persistApi.onHydrate(() => {
      setPersistHydrated(false);
    });
    const unsubscribeFinishHydration = persistApi.onFinishHydration(() => {
      setPersistHydrated(true);
    });

    return () => {
      unsubscribeHydrate();
      unsubscribeFinishHydration();
    };
  }, [persistApi]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    if (!persistHydrated) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      const result = await loadCloudProjectFromLink(projectId, { forceReload: true });
      if (cancelled) {
        return;
      }

      if (!result.success) {
        setError(result.error ?? '공유 프로젝트를 열지 못했습니다.');
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadCloudProjectFromLink, persistHydrated, projectId]);

  return { isLoading, error };
}
