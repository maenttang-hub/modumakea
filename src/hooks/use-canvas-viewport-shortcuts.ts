'use client';

import { useEffect } from 'react';
import type { ReactFlowInstance } from 'reactflow';

export function useCanvasViewportShortcuts(
  rfInstance: ReactFlowInstance | null,
  onFitView?: () => void
) {
  useEffect(() => {
    const handleFitView = () => {
      if (onFitView) {
        onFitView();
        return;
      }

      rfInstance?.fitView({ padding: 0.25 });
    };
    const handleZoomIn = () => {
      rfInstance?.zoomIn();
    };
    const handleZoomOut = () => {
      rfInstance?.zoomOut();
    };

    window.addEventListener('modumake:fit-view', handleFitView);
    window.addEventListener('modumake:zoom-in', handleZoomIn);
    window.addEventListener('modumake:zoom-out', handleZoomOut);

    return () => {
      window.removeEventListener('modumake:fit-view', handleFitView);
      window.removeEventListener('modumake:zoom-in', handleZoomIn);
      window.removeEventListener('modumake:zoom-out', handleZoomOut);
    };
  }, [onFitView, rfInstance]);
}
