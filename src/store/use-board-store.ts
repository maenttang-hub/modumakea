'use client';

/**
 * store/use-board-store.ts
 * Zustand 전역 스토어 조립부
 * - 도메인별 slice 결합
 * - 프로젝트 자동 복구(persist)
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { buildHistorySnapshotSignature, createHistorySnapshot } from '@/store/board-history';
import { createProjectDocument } from '@/store/project-document';
import { createBoardSlice } from '@/store/slices/board-slice';
import { createComponentsSlice } from '@/store/slices/components-slice';
import { createFixPreviewSlice } from '@/store/slices/fix-preview-slice';
import { createHistorySlice } from '@/store/slices/history-slice';
import { createPersistenceSlice } from '@/store/slices/persistence-slice';
import { createWiringSlice } from '@/store/slices/wiring-slice';
import { buildDefaultProjectState } from '@/store/store-defaults';
import { PROJECT_FILE_VERSION, WORKSPACE_STORAGE_KEY } from '@/store/store-config';
import { setRuntimeCustomComponentPackages } from '@/lib/custom-component-registry';
import { pickReferencedTemplateCache, setRuntimeTemplateCache } from '@/lib/template-cache-registry';
import type { BoardStoreState } from '@/store/store-types';

export const useBoardStore = create<BoardStoreState>()(
  persist(
    (set, get, store) => {
      const defaultState = buildDefaultProjectState();
      const initialSelectedComponentId = null;
      const initialHistorySignature = buildHistorySnapshotSignature(
        createHistorySnapshot({
          activeBoardId: defaultState.activeBoardId,
          pins: defaultState.pins,
          components: defaultState.components,
          manualConnections: defaultState.manualConnections,
          powerInputMode: defaultState.powerInputMode,
          componentPowerModes: defaultState.componentPowerModes,
          componentUnusedPinModes: defaultState.componentUnusedPinModes,
          workspaceMode: defaultState.workspaceMode,
          wiringMode: defaultState.wiringMode,
          showGrid: defaultState.showGrid,
          showMinimap: defaultState.showMinimap,
          selectedComponentId: initialSelectedComponentId,
        })
      );

      const initialStore = {
        ...defaultState,
        isGenerating: false,
        selectedComponentId: initialSelectedComponentId,
        canUndo: false,
        canRedo: false,
        pastHistoryEntries: [],
        futureHistoryEntries: [],
        historySignature: initialHistorySignature,
        ...createBoardSlice(set, get, store),
        ...createComponentsSlice(set, get, store),
        ...createFixPreviewSlice(set, get, store),
        ...createWiringSlice(set, get, store),
        ...createHistorySlice(set, get, store),
        ...createPersistenceSlice(set, get, store),
      } as BoardStoreState;

      return initialStore;
    },
    {
      name: WORKSPACE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        projectName: state.projectName,
        appLanguage: state.appLanguage,
        activeBoardId: state.activeBoardId,
        pins: state.pins,
        components: state.components,
        manualConnections: state.manualConnections,
        importedSchematicScene: state.importedSchematicScene,
        importedSchematicSource: state.importedSchematicSource,
        importedPcbDocument: state.importedPcbDocument,
        importedPcbSource: state.importedPcbSource,
        importedPcbValidation: state.importedPcbValidation,
        integratedValidationJson: state.integratedValidationJson,
        validationReviewDecisions: state.validationReviewDecisions,
        footprintPinPadOverrideCache: state.footprintPinPadOverrideCache,
        templateCache: pickReferencedTemplateCache(state.components, state.templateCache),
        installedLibraries: state.installedLibraries,
        generatedCode: state.generatedCode,
        codeError: state.codeError,
        lastCodeGenerationMeta: state.lastCodeGenerationMeta,
        customComponentPackages: state.customComponentPackages,
        isGuestStudentMode: state.isGuestStudentMode,
        powerInputMode: state.powerInputMode,
        componentPowerModes: state.componentPowerModes,
        componentUnusedPinModes: state.componentUnusedPinModes,
        workspaceMode: state.workspaceMode,
        wiringMode: state.wiringMode,
        showGrid: state.showGrid,
        showMinimap: state.showMinimap,
        schematicTheme: state.schematicTheme,
        importedSchematicViewMode: state.importedSchematicViewMode,
      }),
      onRehydrateStorage: () => state => {
        setRuntimeCustomComponentPackages(state?.customComponentPackages ?? []);
        setRuntimeTemplateCache(state?.templateCache ?? {});

        if (!state?.hydrateProject) {
          return;
        }

        // Persist rehydration bypasses our normal hydrateProject path.
        // Re-running the current workspace through the canonical document
        // loader keeps imported KiCad scenes repaired from source text after
        // a hard refresh, not just after explicit browser/cloud loads.
        const rehydratedDocument = createProjectDocument(state, {
          projectFileVersion: PROJECT_FILE_VERSION,
        });
        state.hydrateProject(rehydratedDocument);
      },
    }
  )
);
