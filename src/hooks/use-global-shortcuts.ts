'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import type { RightPanelTab } from '@/components/app/home-shell-layout';
import type { PlacedComponent } from '@/types';

type UseGlobalShortcutsOptions = {
  canRedo: boolean;
  canUndo: boolean;
  cloudIsOwner: boolean;
  cloudProjectId: string | null;
  components: PlacedComponent[];
  duplicateComponent: (instanceId: string) => { success: boolean; error?: string };
  isViewOnly: boolean;
  openRightTab: (tab: RightPanelTab) => void;
  redo: () => void;
  removeComponent: (instanceId: string) => void;
  rotateComponent: (instanceId: string) => void;
  saveProjectToBrowser: () => Promise<{ success: boolean; error?: string }>;
  saveProjectToCloud: () => Promise<{ success: boolean; error?: string }>;
  selectedComponentId: string | null;
  toggleCommentMode: () => void;
  undo: () => void;
};

export function useGlobalShortcuts({
  canRedo,
  canUndo,
  cloudIsOwner,
  cloudProjectId,
  components,
  duplicateComponent,
  isViewOnly,
  openRightTab,
  redo,
  removeComponent,
  rotateComponent,
  saveProjectToBrowser,
  saveProjectToCloud,
  selectedComponentId,
  toggleCommentMode,
  undo,
}: UseGlobalShortcutsOptions) {
  useEffect(() => {
    const handleCommentShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      if (event.key.toLowerCase() !== 'c') {
        return;
      }

      event.preventDefault();
      openRightTab('comments');
      toggleCommentMode();
    };

    window.addEventListener('keydown', handleCommentShortcut);
    return () => window.removeEventListener('keydown', handleCommentShortcut);
  }, [openRightTab, toggleCommentMode]);

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.closest('input, textarea, [contenteditable="true"], .monaco-editor, .monaco-inputbox') != null;

      if (isEditableTarget) {
        return;
      }

      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier) {
        if (isViewOnly) {
          return;
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (!selectedComponentId || selectedComponentId === 'board-node') {
            return;
          }
          event.preventDefault();
          const componentName =
            components.find(component => component.instanceId === selectedComponentId)?.name ?? '선택한 부품';
          removeComponent(selectedComponentId);
          toast.info(`${componentName}을(를) 제거했습니다.`);
          return;
        }

        if (event.key.toLowerCase() === 'r') {
          if (!selectedComponentId || selectedComponentId === 'board-node') {
            return;
          }
          event.preventDefault();
          rotateComponent(selectedComponentId);
          toast.success('선택한 부품을 90도 회전했습니다.');
        }

        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void (async () => {
          const result =
            cloudProjectId && cloudIsOwner
              ? await saveProjectToCloud()
              : await saveProjectToBrowser();
          if (!result.success) {
            toast.error('저장 실패', { description: result.error });
            return;
          }
          toast.success(
            cloudProjectId && cloudIsOwner ? '☁️ 클라우드 저장 완료' : '💾 브라우저에 저장 완료'
          );
        })();
        return;
      }

      if (isViewOnly) {
        return;
      }

      if (key === 'd') {
        if (!selectedComponentId || selectedComponentId === 'board-node') {
          return;
        }
        event.preventDefault();
        const duplicated = duplicateComponent(selectedComponentId);
        if (!duplicated.success) {
          toast.error('부품 복제 실패', { description: duplicated.error });
          return;
        }
        const componentName =
          components.find(component => component.instanceId === selectedComponentId)?.name ?? '선택한 부품';
        toast.success(`${componentName} 복제 완료`, {
          description: '복사본을 옆에 배치했습니다. 핀 연결은 새로 지정할 수 있습니다.',
        });
        return;
      }

      if (key === 'z' && !event.shiftKey) {
        if (!canUndo) {
          return;
        }
        event.preventDefault();
        undo();
        return;
      }

      if ((key === 'z' && event.shiftKey) || key === 'y') {
        if (!canRedo) {
          return;
        }
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    canRedo,
    canUndo,
    cloudIsOwner,
    cloudProjectId,
    components,
    duplicateComponent,
    isViewOnly,
    redo,
    removeComponent,
    rotateComponent,
    saveProjectToBrowser,
    saveProjectToCloud,
    selectedComponentId,
    undo,
  ]);
}
