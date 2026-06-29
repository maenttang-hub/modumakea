'use client';

import { useEffect } from 'react';
import { useBoardStore } from '@/store/use-board-store';
import type { AppLanguage } from '@/types';

type LanguageBootstrapProps = {
  initialAppLanguage: AppLanguage;
};

export function LanguageBootstrap({ initialAppLanguage }: LanguageBootstrapProps) {
  const appLanguage = useBoardStore(state => state.appLanguage);
  const setAppLanguage = useBoardStore(state => state.setAppLanguage);

  useEffect(() => {
    if (appLanguage === initialAppLanguage) {
      return;
    }

    setAppLanguage(initialAppLanguage);
  }, [appLanguage, initialAppLanguage, setAppLanguage]);

  return null;
}
