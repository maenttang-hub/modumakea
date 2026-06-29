'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Grid2X2,
  Inspect,
  Library,
  MessageSquarePlus,
  MoveDiagonal2,
  ScanSearch,
  ShieldCheck,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import type { AppContextMenuItem } from '@/components/dashboard/app-context-menu';
import type { RightPanelTab } from '@/components/app/home-shell-layout';
import type { PlacedComponent } from '@/types';

export type ContextScope =
  | 'global'
  | 'sidebar'
  | 'canvas'
  | 'component-node'
  | 'board-node'
  | 'terminal-panel'
  | 'review-panel'
  | 'inspector-panel'
  | 'code-panel';

export type ContextMenuState = {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  scope: ContextScope;
  selectedNodeId?: string;
  title: string;
};

export type OpenContextMenuDetail =
  Omit<ContextMenuState, 'clientX' | 'clientY'> &
  Partial<Pick<ContextMenuState, 'clientX' | 'clientY'>>;

type UseAppContextMenuOptions = {
  boardName: string;
  components: PlacedComponent[];
  importedReviewMode: boolean;
  openRightTab: (tab: RightPanelTab) => void;
  setSelectedComponentId: (componentId: string | null) => void;
  showGrid: boolean;
  showMinimap: boolean;
  toggleGrid: () => void;
  toggleMinimap: () => void;
  visibleRightTabs: RightPanelTab[];
};

export function useAppContextMenu({
  boardName,
  components,
  importedReviewMode,
  openRightTab,
  setSelectedComponentId,
  showGrid,
  showMinimap,
  toggleGrid,
  toggleMinimap,
  visibleRightTabs,
}: UseAppContextMenuOptions) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const openContextMenu = useCallback((detail: OpenContextMenuDetail) => {
    setContextMenu({
      ...detail,
      clientX: detail.clientX ?? detail.x,
      clientY: detail.clientY ?? detail.y,
      x: Math.min(detail.x, window.innerWidth - 272),
      y: Math.min(detail.y, window.innerHeight - 320),
    });
  }, []);

  useEffect(() => {
    const handleProgrammaticContextMenu = (event: Event) => {
      const detail = (event as CustomEvent<OpenContextMenuDetail>).detail;
      if (!detail) {
        return;
      }

      if (detail.selectedNodeId) {
        setSelectedComponentId(detail.selectedNodeId);
      }

      openContextMenu(detail);
    };

    window.addEventListener('modumake:open-context-menu', handleProgrammaticContextMenu as EventListener);
    return () => {
      window.removeEventListener('modumake:open-context-menu', handleProgrammaticContextMenu as EventListener);
    };
  }, [openContextMenu, setSelectedComponentId]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const close = () => setContextMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-mm-context-menu="true"]')) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  const handleAppContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target.closest('.monaco-editor') || target.closest('.monaco-menu-container')) {
        return;
      }

      event.preventDefault();

      const nodeElement = target.closest('.react-flow__node');
      const nodeId = nodeElement?.getAttribute('data-id') ?? undefined;

      if (nodeId) {
        setSelectedComponentId(nodeId);
      } else if (target.closest('[data-mm-scope="canvas"]')) {
        setSelectedComponentId(null);
      }

      let scope: ContextScope = 'global';
      let title = '빠른 작업';

      if (nodeId === 'board-node') {
        scope = 'board-node';
        title = boardName;
      } else if (nodeId) {
        scope = 'component-node';
        title = components.find(component => component.instanceId === nodeId)?.name ?? (importedReviewMode ? '도면 항목' : '부품 작업');
      } else if (target.closest('[data-mm-scope="canvas"]')) {
        scope = 'canvas';
        title = importedReviewMode ? '도면 리뷰' : '캔버스 작업';
      } else if (target.closest('[data-mm-scope="sidebar"]')) {
        scope = 'sidebar';
        title = importedReviewMode ? '도면 리뷰' : '부품 라이브러리';
      } else if (target.closest('[data-mm-scope="code-panel"]')) {
        scope = 'code-panel';
        title = '코드 패널';
      } else if (target.closest('[data-mm-scope="review-panel"]')) {
        scope = 'review-panel';
        title = '하드웨어 리뷰';
      } else if (target.closest('[data-mm-scope="inspector-panel"]')) {
        scope = 'inspector-panel';
        title = '속성 패널';
      } else if (target.closest('[data-mm-scope="terminal-panel"]')) {
        scope = 'terminal-panel';
        title = '터미널';
      }

      openContextMenu({
        x: event.clientX,
        y: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        scope,
        selectedNodeId: nodeId,
        title,
      });
    },
    [boardName, components, importedReviewMode, openContextMenu, setSelectedComponentId]
  );

  const contextMenuItems = useMemo<AppContextMenuItem[]>(() => {
    if (!contextMenu) {
      return [];
    }

    const startAnnotation = () => {
      openRightTab('comments');
      window.dispatchEvent(new CustomEvent('modumake:start-canvas-comment', {
        detail: {
          targetType:
            contextMenu.scope === 'component-node' || contextMenu.scope === 'board-node'
              ? 'node'
              : 'canvas_coord',
          nodeId: contextMenu.selectedNodeId,
          clientX: contextMenu.clientX,
          clientY: contextMenu.clientY,
        },
      }));
    };

    const annotationItem: AppContextMenuItem = {
      id: 'add-annotation',
      label:
        contextMenu.scope === 'component-node' || contextMenu.scope === 'board-node'
          ? '이 부품에 주석 달기'
          : '여기에 주석 달기',
      hint: '도면 위치에 바로 코멘트를 남기고 팀 피드백에 연결합니다.',
      shortcut: 'C',
      icon: MessageSquarePlus,
      onSelect: startAnnotation,
    };

    const baseItems: AppContextMenuItem[] = visibleRightTabs.map(tabId => ({
      id: `open-${tabId}`,
      label:
        tabId === 'validation'
          ? '하드웨어 리뷰 열기'
          : tabId === 'comments'
            ? '피드백 열기'
            : '속성 열기',
      hint:
        tabId === 'validation'
          ? '전압, 핀, 동반 부품, 전원 예산을 점검합니다.'
          : tabId === 'comments'
            ? '회로와 코드에 남긴 댓글 스레드를 확인합니다.'
            : '현재 선택과 프로젝트 정보를 확인합니다.',
      icon:
        tabId === 'validation'
          ? ShieldCheck
          : tabId === 'comments'
            ? MessageSquarePlus
            : Sliders,
      onSelect: () => openRightTab(tabId),
    }));

    const canvasItems: AppContextMenuItem[] = importedReviewMode
      ? [
          annotationItem,
          {
            id: 'fit-view',
            label: '화면 맞춤',
            hint: '현재 도면이 한 번에 보이도록 정렬합니다.',
            icon: MoveDiagonal2,
            onSelect: () => window.dispatchEvent(new CustomEvent('modumake:fit-view')),
          },
          ...baseItems,
        ]
      : [
          annotationItem,
          {
            id: 'fit-view',
            label: '화면 맞춤',
            hint: '캔버스를 현재 부품 기준으로 정렬합니다.',
            icon: MoveDiagonal2,
            onSelect: () => window.dispatchEvent(new CustomEvent('modumake:fit-view')),
          },
          {
            id: 'export-schematic',
            label: '회로도 PNG 저장',
            hint: '현재 캔버스를 이미지 파일로 저장합니다.',
            icon: Sparkles,
            onSelect: () => window.dispatchEvent(new CustomEvent('modumake:export-schematic-png')),
          },
          {
            id: 'toggle-grid',
            label: showGrid ? '격자 숨기기' : '격자 표시',
            hint: '캔버스 배치 기준선을 토글합니다.',
            icon: Grid2X2,
            onSelect: () => toggleGrid(),
          },
          {
            id: 'toggle-minimap',
            label: showMinimap ? '미니맵 숨기기' : '미니맵 표시',
            hint: '전체 회로 위치 지도를 토글합니다.',
            icon: ScanSearch,
            onSelect: () => toggleMinimap(),
          },
        ];

    if (contextMenu.scope === 'component-node' && contextMenu.selectedNodeId) {
      const isBoard = contextMenu.selectedNodeId === 'board-node';
      const contextComponent = components.find(component => component.instanceId === contextMenu.selectedNodeId);
      const componentActions = [
        annotationItem,
        {
          id: 'component-open-validation',
          label: isBoard ? '보드 검토 열기' : '부품 검토 열기',
          hint: isBoard
            ? `${boardName}와 관련된 검증 흐름을 엽니다.`
            : `${contextComponent?.name ?? '선택한 부품'}와 관련된 회로 검증 흐름을 엽니다.`,
          icon: ShieldCheck,
          onSelect: () => openRightTab('validation'),
        } satisfies AppContextMenuItem,
        ...baseItems,
      ];

      return componentActions;
    }

    if (contextMenu.scope === 'board-node') {
      if (importedReviewMode) {
        return canvasItems;
      }
      return [...canvasItems, ...baseItems];
    }

    if (contextMenu.scope === 'canvas') {
      if (importedReviewMode) {
        return canvasItems;
      }
      return [...canvasItems, ...baseItems];
    }

    if (contextMenu.scope === 'sidebar') {
      if (importedReviewMode) {
        return [
          {
            id: 'sidebar-review',
            label: '검증 보기',
            hint: '오른쪽 패널에서 현재 회로 이슈를 바로 확인합니다.',
            icon: ShieldCheck,
            onSelect: () => openRightTab('validation'),
          },
          {
            id: 'sidebar-comments',
            label: '주석 열기',
            hint: '도면 위에 남긴 의견과 댓글 스레드를 봅니다.',
            icon: MessageSquarePlus,
            onSelect: () => openRightTab('comments'),
          },
          {
            id: 'sidebar-canvas-fit',
            label: '화면 맞춤',
            hint: '현재 도면이 한 번에 보이도록 정렬합니다.',
            icon: MoveDiagonal2,
            onSelect: () => window.dispatchEvent(new CustomEvent('modumake:fit-view')),
          },
        ];
      }
      return [
        {
          id: 'sidebar-review',
          label: '검증 패널 열기',
          hint: '선택한 보드와 센서 조건을 바로 점검합니다.',
          icon: ShieldCheck,
          onSelect: () => openRightTab('validation'),
        },
        {
          id: 'sidebar-canvas-fit',
          label: '캔버스 화면 맞춤',
          hint: '현재 배치된 부품이 있으면 중앙으로 이동합니다.',
          icon: MoveDiagonal2,
          onSelect: () => window.dispatchEvent(new CustomEvent('modumake:fit-view')),
        },
        {
          id: 'sidebar-open-library',
          label: '라이브러리 우선순위 확인',
          hint: '현재 보드에서 바로 쓸 수 있는 부품이 먼저 정렬됩니다.',
          icon: Library,
          onSelect: () => toast.info('현재 보드에 호환되는 부품이 먼저 보이도록 정렬되어 있습니다.'),
        },
      ];
    }

    if (contextMenu.scope === 'code-panel') {
      return [
        {
          id: 'code-open-review',
          label: '하드웨어 리뷰 열기',
          hint: '코드 작성 전에 회로 검증 상태를 확인합니다.',
          icon: ShieldCheck,
          onSelect: () => openRightTab('validation'),
        },
        {
          id: 'code-open-code-review',
          label: '코드 검토 열기',
          hint: '코드와 회로를 함께 검토하는 패널로 이동합니다.',
          icon: Inspect,
          onSelect: () => openRightTab('code'),
        },
      ];
    }

    if (
      contextMenu.scope === 'review-panel' ||
      contextMenu.scope === 'inspector-panel' ||
      contextMenu.scope === 'terminal-panel'
    ) {
      return baseItems;
    }

    return [annotationItem, ...baseItems];
  }, [
    components,
    contextMenu,
    boardName,
    openRightTab,
    showGrid,
    showMinimap,
    toggleGrid,
    toggleMinimap,
    visibleRightTabs,
    importedReviewMode,
  ]);

  return {
    contextMenu,
    contextMenuItems,
    handleAppContextMenu,
    setContextMenu,
  };
}
