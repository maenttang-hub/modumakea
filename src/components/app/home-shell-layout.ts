export type ShellMode = 'review' | 'edit';

export type RightPanelTab =
  | 'validation'
  | 'code'
  | 'comments'
  | 'inspector';

export function getVisibleRightTabs(
  shellMode: ShellMode,
  isViewOnly: boolean
): RightPanelTab[] {
  if (isViewOnly || shellMode === 'review') {
    return isViewOnly ? ['validation', 'comments'] : ['validation', 'code', 'comments'];
  }

  return ['validation', 'code', 'comments'];
}

export function getSafeRightTab(
  currentTab: RightPanelTab,
  shellMode: ShellMode,
  isViewOnly: boolean
): RightPanelTab {
  const visibleTabs = getVisibleRightTabs(shellMode, isViewOnly);
  return visibleTabs.includes(currentTab) ? currentTab : visibleTabs[0];
}
