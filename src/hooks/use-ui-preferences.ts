'use client';

import { useEffect, useState } from 'react';

export type RightTabValue = 'inspector' | 'validation' | 'simulation' | 'code' | 'comments';

type UseUiPreferencesOptions = {
  storageKey: string;
  initialRightTab: RightTabValue;
  sanitizeRightTab: (tab: RightTabValue) => RightTabValue;
  initialLeftPanelCollapsed?: boolean;
  initialRightPanelCollapsed?: boolean;
};

function readStoredPreferences(
  storageKey: string,
  initialRightTab: RightTabValue,
  sanitizeRightTab: (tab: RightTabValue) => RightTabValue,
  initialLeftPanelCollapsed = false,
  initialRightPanelCollapsed = false
) {
  if (typeof window === 'undefined') {
    return {
      leftPanelCollapsed: initialLeftPanelCollapsed,
      rightPanelCollapsed: initialRightPanelCollapsed,
      activeRightTab: initialRightTab,
    };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {
        leftPanelCollapsed: initialLeftPanelCollapsed,
        rightPanelCollapsed: initialRightPanelCollapsed,
        activeRightTab: initialRightTab,
      };
    }

    const parsed = JSON.parse(raw) as Partial<{
      leftPanelCollapsed: boolean;
      rightPanelCollapsed: boolean;
      activeRightTab: RightTabValue;
    }>;

    return {
      leftPanelCollapsed:
        typeof parsed.leftPanelCollapsed === 'boolean' ? parsed.leftPanelCollapsed : initialLeftPanelCollapsed,
      rightPanelCollapsed:
        typeof parsed.rightPanelCollapsed === 'boolean' ? parsed.rightPanelCollapsed : initialRightPanelCollapsed,
      activeRightTab:
        parsed.activeRightTab === 'inspector' ||
        parsed.activeRightTab === 'validation' ||
        parsed.activeRightTab === 'simulation' ||
        parsed.activeRightTab === 'code' ||
        parsed.activeRightTab === 'comments'
          ? sanitizeRightTab(parsed.activeRightTab)
          : initialRightTab,
    };
  } catch {
    return {
      leftPanelCollapsed: initialLeftPanelCollapsed,
      rightPanelCollapsed: initialRightPanelCollapsed,
      activeRightTab: initialRightTab,
    };
  }
}

export function useUiPreferences({
  storageKey,
  initialRightTab,
  sanitizeRightTab,
  initialLeftPanelCollapsed = false,
  initialRightPanelCollapsed = false,
}: UseUiPreferencesOptions) {
  const [initialPreferences] = useState(() =>
    readStoredPreferences(
      storageKey,
      initialRightTab,
      sanitizeRightTab,
      initialLeftPanelCollapsed,
      initialRightPanelCollapsed
    )
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(initialPreferences.leftPanelCollapsed);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(initialPreferences.rightPanelCollapsed);
  const [activeRightTab, setActiveRightTab] = useState<RightTabValue>(initialPreferences.activeRightTab);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        leftPanelCollapsed,
        rightPanelCollapsed,
        activeRightTab,
      })
    );
  }, [activeRightTab, leftPanelCollapsed, rightPanelCollapsed, storageKey]);

  return {
    activeRightTab,
    leftPanelCollapsed,
    rightPanelCollapsed,
    setActiveRightTab,
    setLeftPanelCollapsed,
    setRightPanelCollapsed,
  };
}
