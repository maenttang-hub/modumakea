import type { StateCreator } from 'zustand';
import { getInitialPins } from '@/constants/board-pins';
import { getDefaultWorkspaceMode } from '@/constants/product-surface';
import { normalizeValidationReviewDecision } from '@/lib/issue-feedback';
import { sanitizePlainText } from '@/lib/security-input';
import { createHistorySnapshot, withHistory } from '@/store/board-history';
import { buildDefaultProjectState } from '@/store/store-defaults';
import { DEFAULT_PROJECT_NAME } from '@/store/store-config';
import type { BoardStoreState } from '@/store/store-types';

export const createBoardSlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  setProjectName: (projectName: string) => set({
    projectName: sanitizePlainText(projectName, { maxLength: 80, fallback: DEFAULT_PROJECT_NAME }),
  }),

  setAppLanguage: appLanguage => set({ appLanguage }),

  setActiveBoardId: (boardId: string) => {
    const defaultWorkspaceMode = getDefaultWorkspaceMode();
    set(state => withHistory(
      state,
      {
        activeBoardId: boardId,
        pins: getInitialPins(boardId),
        components: [],
        manualConnections: [],
        ghostFixPreview: null,
        importedSchematicScene: null,
        importedSchematicSource: null,
        integratedValidationJson: null,
        validationReviewDecisions: {},
        installedLibraries: [],
        generatedCode: '',
        codeError: null,
        lastCodeGenerationMeta: null,
        componentRuntimeStates: {},
        lastCompilerManifest: null,
        importedSchematicViewMode: 'original',
        powerInputMode: state.powerInputMode,
        componentPowerModes: {},
        componentUnusedPinModes: {},
        selectedComponentId: null,
        workspaceMode: defaultWorkspaceMode,
      },
      createHistorySnapshot({
        activeBoardId: boardId,
        pins: getInitialPins(boardId),
        components: [],
        manualConnections: [],
        powerInputMode: state.powerInputMode,
        componentPowerModes: {},
        componentUnusedPinModes: {},
        workspaceMode: defaultWorkspaceMode,
        wiringMode: state.wiringMode,
        showGrid: state.showGrid,
        showMinimap: state.showMinimap,
        selectedComponentId: null,
      })
    ));
  },

  setPowerInputMode: mode => {
    set(state => withHistory(
      state,
      { powerInputMode: mode },
      createHistorySnapshot({ ...state, powerInputMode: mode })
    ));
  },

  setComponentPowerMode: (instanceId, mode) => {
    set(state => {
      const nextComponentPowerModes = { ...state.componentPowerModes };
      const normalizedMode = typeof mode === 'string' ? sanitizePlainText(mode, { maxLength: 64 }) : '';

      if (!normalizedMode) {
        if (!(instanceId in nextComponentPowerModes)) {
          return state;
        }
        delete nextComponentPowerModes[instanceId];
      } else if (nextComponentPowerModes[instanceId] === normalizedMode) {
        return state;
      } else {
        nextComponentPowerModes[instanceId] = normalizedMode;
      }

      return withHistory(
        state,
        { componentPowerModes: nextComponentPowerModes },
        createHistorySnapshot({ ...state, componentPowerModes: nextComponentPowerModes })
      );
    });
  },

  setComponentUnusedPinMode: (instanceId, pinId, mode) => {
    set(state => {
      const normalizedPinId = sanitizePlainText(pinId, { maxLength: 64 });
      if (!normalizedPinId) {
        return state;
      }

      const currentPinMap = state.componentUnusedPinModes[instanceId] ?? {};
      const nextComponentUnusedPinModes = { ...state.componentUnusedPinModes };

      if (!mode) {
        if (!(normalizedPinId in currentPinMap)) {
          return state;
        }

        const nextPinMap = { ...currentPinMap };
        delete nextPinMap[normalizedPinId];

        if (Object.keys(nextPinMap).length === 0) {
          delete nextComponentUnusedPinModes[instanceId];
        } else {
          nextComponentUnusedPinModes[instanceId] = nextPinMap;
        }
      } else if (currentPinMap[normalizedPinId] === mode) {
        return state;
      } else {
        nextComponentUnusedPinModes[instanceId] = {
          ...currentPinMap,
          [normalizedPinId]: mode,
        };
      }

      return withHistory(
        state,
        { componentUnusedPinModes: nextComponentUnusedPinModes },
        createHistorySnapshot({ ...state, componentUnusedPinModes: nextComponentUnusedPinModes })
      );
    });
  },

  setWorkspaceMode: mode => {
    set(state => withHistory(
      state,
      { workspaceMode: mode },
      createHistorySnapshot({ ...state, workspaceMode: mode })
    ));
  },

  setWiringMode: mode => {
    set(state => withHistory(
      state,
      { wiringMode: mode },
      createHistorySnapshot({ ...state, wiringMode: mode })
    ));
  },

  setSchematicTheme: schematicTheme => set({ schematicTheme }),

  setImportedSchematicViewMode: importedSchematicViewMode => set({ importedSchematicViewMode }),

  setValidationReviewDecision: (issueKey, decision) => set(state => {
    const normalizedKey = sanitizePlainText(issueKey, { maxLength: 240 });
    if (!normalizedKey) {
      return state;
    }

    const normalizedDecision = decision == null
      ? null
      : normalizeValidationReviewDecision({
          ...decision,
          updatedAt: new Date().toISOString(),
        });

    if (normalizedDecision == null) {
      if (!(normalizedKey in state.validationReviewDecisions)) {
        return state;
      }

      const next = { ...state.validationReviewDecisions };
      delete next[normalizedKey];
      return { validationReviewDecisions: next };
    }

    const current = state.validationReviewDecisions[normalizedKey];
    if (
      current?.primary === normalizedDecision.primary &&
      current.flags.length === normalizedDecision.flags.length &&
      current.flags.every((flag, index) => flag === normalizedDecision.flags[index])
    ) {
      return state;
    }

    return {
      validationReviewDecisions: {
        ...state.validationReviewDecisions,
        [normalizedKey]: normalizedDecision,
      },
    };
  }),

  setGuestStudentMode: enabled => set({ isGuestStudentMode: enabled }),

  installProjectLibrary: library => {
    const state = get();
    if (state.installedLibraries.some(item => item.name === library.name)) {
      return { success: true, alreadyInstalled: true };
    }

    set({
      installedLibraries: [
        ...state.installedLibraries,
        {
          name: sanitizePlainText(library.name, { maxLength: 120 }),
          version: library.version ?? 'latest',
          includes: library.includes,
          author: sanitizePlainText(library.author, { maxLength: 120, fallback: 'Unknown' }),
          sentence: sanitizePlainText(library.sentence, { maxLength: 220, fallback: '설명이 준비되지 않았습니다.' }),
          category: sanitizePlainText(library.category, { maxLength: 80, fallback: 'General' }),
        },
      ],
    });

    return { success: true };
  },

  removeProjectLibrary: name => {
    set(state => ({
      installedLibraries: state.installedLibraries.filter(library => library.name !== name),
    }));
  },

  clearBoard: () => {
    const state = get();
    const defaults = buildDefaultProjectState(state.activeBoardId);

    set(currentState => withHistory(
      currentState,
      {
        pins: getInitialPins(state.activeBoardId),
        components: [],
        manualConnections: [],
        ghostFixPreview: null,
        importedSchematicScene: null,
        importedSchematicSource: null,
        integratedValidationJson: null,
        validationReviewDecisions: {},
        installedLibraries: [],
        generatedCode: '',
        codeError: null,
        lastCodeGenerationMeta: null,
        componentRuntimeStates: {},
        lastCompilerManifest: null,
        importedSchematicViewMode: 'original',
        selectedComponentId: null,
        workspaceMode: defaults.workspaceMode,
        powerInputMode: defaults.powerInputMode,
        componentPowerModes: {},
        componentUnusedPinModes: {},
      },
      createHistorySnapshot({
        ...currentState,
        pins: getInitialPins(state.activeBoardId),
        components: [],
        manualConnections: [],
        powerInputMode: defaults.powerInputMode,
        componentPowerModes: {},
        componentUnusedPinModes: {},
        workspaceMode: defaults.workspaceMode,
        selectedComponentId: null,
      })
    ));
  },

  toggleGrid: () => {
    set(state => withHistory(
      state,
      { showGrid: !state.showGrid },
      createHistorySnapshot({ ...state, showGrid: !state.showGrid })
    ));
  },

  toggleMinimap: () => {
    set(state => withHistory(
      state,
      { showMinimap: !state.showMinimap },
      createHistorySnapshot({ ...state, showMinimap: !state.showMinimap })
    ));
  },

  getComponentTemplate: (instanceId: string) => {
    return get().components.find(component => component.instanceId === instanceId);
  },

  setSelectedComponentId: (selectedComponentId: string | null) => set({ selectedComponentId }),
});
