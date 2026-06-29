'use client';

import { useEffect, useRef } from 'react';
import { useBoardStore } from '@/store/use-board-store';

const AUTOSAVE_DEBOUNCE_MS = 2200;

export function useAutoSave() {
  const cloudProjectId = useBoardStore(state => state.cloudProjectId);
  const cloudIsOwner = useBoardStore(state => state.cloudIsOwner);
  const appLanguage = useBoardStore(state => state.appLanguage);
  const projectName = useBoardStore(state => state.projectName);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const cloudVisibility = useBoardStore(state => state.cloudVisibility);
  const components = useBoardStore(state => state.components);
  const manualConnections = useBoardStore(state => state.manualConnections);
  const importedSchematicScene = useBoardStore(state => state.importedSchematicScene);
  const pins = useBoardStore(state => state.pins);
  const generatedCode = useBoardStore(state => state.generatedCode);
  const codeError = useBoardStore(state => state.codeError);
  const lastCodeGenerationMeta = useBoardStore(state => state.lastCodeGenerationMeta);
  const installedLibraries = useBoardStore(state => state.installedLibraries);
  const customComponentPackages = useBoardStore(state => state.customComponentPackages);
  const templateCache = useBoardStore(state => state.templateCache);
  const isGuestStudentMode = useBoardStore(state => state.isGuestStudentMode);
  const powerInputMode = useBoardStore(state => state.powerInputMode);
  const workspaceMode = useBoardStore(state => state.workspaceMode);
  const wiringMode = useBoardStore(state => state.wiringMode);
  const showGrid = useBoardStore(state => state.showGrid);
  const showMinimap = useBoardStore(state => state.showMinimap);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const saveProjectToCloud = useBoardStore(state => state.saveProjectToCloud);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!cloudProjectId || !cloudIsOwner) {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      void saveProjectToCloud();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    cloudProjectId,
    cloudIsOwner,
    appLanguage,
    projectName,
    activeBoardId,
    cloudVisibility,
    components,
    manualConnections,
    importedSchematicScene,
    pins,
    generatedCode,
    codeError,
    lastCodeGenerationMeta,
    installedLibraries,
    customComponentPackages,
    templateCache,
    isGuestStudentMode,
    powerInputMode,
    workspaceMode,
    wiringMode,
    showGrid,
    showMinimap,
    schematicTheme,
    saveProjectToCloud,
  ]);
}
