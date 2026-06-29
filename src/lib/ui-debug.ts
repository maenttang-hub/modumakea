'use client';

import { useEffect, useState } from 'react';

export function isUiDebugModeEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem('MM_DEBUG_MODE') === 'true';
  } catch {
    return false;
  }
}

export function useUiDebugMode() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(isUiDebugModeEnabled());
  }, []);

  return enabled;
}
