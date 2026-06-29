'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  REVIEW_FOCUS_EVENT,
  resolveReviewFocusTarget,
  type ReviewFocusDetail,
} from '@/lib/review-focus';
import { BOARD_NODE_ID } from '@/components/canvas/canvas-graph';
import type { PlacedComponent } from '@/types';

export type ReviewViewportRequest =
  | {
      kind: 'focus-board';
      source: 'review-focus' | 'component-focus';
      minimumZoom: number;
      duration: number;
    }
  | {
      kind: 'focus-components';
      source: 'review-focus' | 'component-focus';
      components: PlacedComponent[];
      minimumZoom: number;
      duration: number;
    };

type UseCanvasReviewFocusArgs = {
  positionedComponents: PlacedComponent[];
  setSelectedComponentId: (instanceId: string | null) => void;
  requestViewportAction: (request: ReviewViewportRequest) => boolean;
};

export function useCanvasReviewFocus({
  positionedComponents,
  setSelectedComponentId,
  requestViewportAction,
}: UseCanvasReviewFocusArgs) {
  const [reviewFocus, setReviewFocus] = useState<ReviewFocusDetail | null>(null);

  const clearReviewFocus = useCallback(() => setReviewFocus(null), []);

  useEffect(() => {
    if (!reviewFocus) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setReviewFocus(current => (current === reviewFocus ? null : current));
    }, 5200);

    return () => window.clearTimeout(timeout);
  }, [reviewFocus]);

  useEffect(() => {
    const handleReviewFocus = (event: Event) => {
      const detail = (event as CustomEvent<ReviewFocusDetail>).detail;
      if (!detail) {
        return;
      }

      if (detail.interaction === 'clear') {
        setReviewFocus(null);
        return;
      }

      setReviewFocus(detail);

      const target = resolveReviewFocusTarget(detail);
      if (!target || detail.interaction === 'hover') {
        return;
      }

      const minimumZoom = detail.source === 'code' ? 1.1 : 1;
      const duration = detail.source === 'code' ? 360 : 280;

      if (target.kind === 'board') {
        setSelectedComponentId(BOARD_NODE_ID);
        requestViewportAction({
          kind: 'focus-board',
          source: 'review-focus',
          minimumZoom,
          duration,
        });
        return;
      }

      const targetComponents = positionedComponents.filter(item => target.instanceIds.includes(item.instanceId));
      if (targetComponents.length === 0) {
        return;
      }

      setSelectedComponentId(targetComponents[0]?.instanceId ?? null);
      requestViewportAction({
        kind: 'focus-components',
        source: 'review-focus',
        components: targetComponents,
        minimumZoom: Math.max(minimumZoom, targetComponents.length === 1 ? 1.05 : 1.02),
        duration,
      });
    };

    window.addEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
    return () => {
      window.removeEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
    };
  }, [positionedComponents, requestViewportAction, setSelectedComponentId]);

  useEffect(() => {
    const handleFocusComponent = (event: Event) => {
      const customEvent = event as CustomEvent<{ instanceId?: string }>;
      const instanceId = customEvent.detail?.instanceId;
      if (!instanceId) {
        return;
      }

      if (instanceId === BOARD_NODE_ID) {
        setSelectedComponentId(BOARD_NODE_ID);
        requestViewportAction({
          kind: 'focus-board',
          source: 'component-focus',
          minimumZoom: 0.95,
          duration: 260,
        });
        return;
      }

      const component = positionedComponents.find(item => item.instanceId === instanceId);
      if (!component) {
        return;
      }

      setSelectedComponentId(instanceId);
      requestViewportAction({
        kind: 'focus-components',
        source: 'component-focus',
        components: [component],
        minimumZoom: 0.95,
        duration: 260,
      });
    };

    window.addEventListener('modumake:focus-component', handleFocusComponent as EventListener);
    return () => {
      window.removeEventListener('modumake:focus-component', handleFocusComponent as EventListener);
    };
  }, [positionedComponents, requestViewportAction, setSelectedComponentId]);

  return {
    reviewFocus,
    clearReviewFocus,
  };
}
