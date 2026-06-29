'use client';

/**
 * components/canvas/component-canvas.tsx
 * React Flow 메인 캔버스 (EasyEDA 스타일 직각 도면 통합 버전)
 */

import { ReactFlowProvider } from 'reactflow';
import { ComponentCanvasView } from './component-canvas-view';
import { useComponentCanvasController } from '@/hooks/use-component-canvas-controller';

export function ComponentCanvas() {
  const controller = useComponentCanvasController();

  return (
    <ReactFlowProvider>
      <ComponentCanvasView
        boardAccentColor={controller.board.accentColor}
        isEditable={controller.isEditable}
        wiringMode={controller.wiringMode}
        showGrid={controller.showGrid}
        showMinimap={controller.showMinimap}
        exportRef={controller.exportRef}
        collaborators={controller.collaborators}
        nodes={controller.nodes}
        edges={controller.edges}
        importedSchematicScene={controller.importedSchematicScene}
        hasLegacyImportedScene={controller.hasLegacyImportedScene}
        commentDraft={controller.commentDraft}
        commentMode={controller.commentMode}
        commentDraftAnchor={controller.commentDraftAnchor}
        commentDraftTargetLabel={controller.commentDraftTargetLabel}
        cancelCommentDraft={controller.cancelCommentDraft}
        submitCommentDraft={controller.submitCommentDraft}
        toggleCommentMode={controller.toggleCommentMode}
        onDrop={controller.onDrop}
        onDragOver={controller.onDragOver}
        onNodeDragStart={controller.onNodeDragStart}
        onNodeDrag={controller.onNodeDrag}
        onNodeDragStop={controller.onNodeDragStop}
        onSelectionChange={controller.onSelectionChange}
        onConnect={controller.onConnect}
        onPaneClick={controller.onPaneClick}
        onPaneMouseMove={controller.onPaneMouseMove}
        onNodeClick={controller.onNodeClick}
        onNodeDoubleClick={controller.onNodeDoubleClick}
        onNodeMouseMove={controller.onNodeMouseMove}
        onEdgeClick={controller.onEdgeClick}
        onFocusCollaborator={controller.onFocusCollaborator}
        setRfInstance={controller.setRfInstance}
        importedViewportDebug={controller.importedViewportDebug}
        importedViewportKey={controller.importedViewportKey}
        onImportedCanvasResize={controller.onImportedCanvasResize}
      />
    </ReactFlowProvider>
  );
}
