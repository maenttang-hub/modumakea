import type { StateCreator } from 'zustand';
import {
  getAllowedWorkspaceModes,
  getDefaultWorkspaceMode,
  isAdvancedWorkspaceMode,
} from '@/constants/product-surface';
import {
  loadProjectDocumentIndexedDb,
  saveProjectDocumentIndexedDb,
} from '@/lib/browser-project-storage';
import {
  createCloudProject,
  fetchCloudProject,
  forkCloudProject,
  updateCloudProject,
} from '@/lib/cloud-projects';
import {
  getRememberedCloudProjectEditToken,
  rememberCloudProjectEditToken,
} from '@/lib/cloud-project-ownership';
import { setRuntimeCustomComponentPackages } from '@/lib/custom-component-registry';
import { setRuntimeTemplateCache } from '@/lib/template-cache-registry';
import { validateCustomComponentPackage } from '@/lib/custom-component-packages';
import {
  buildHistoryFlags,
  buildHistorySnapshotSignature,
  createHistorySnapshot,
} from '@/store/board-history';
import {
  applyProjectDocument,
  createProjectDocument,
  normalizeProjectDocument,
} from '@/store/project-document';
import { ensureImportedValidationSnapshot } from '@/lib/ensure-imported-validation-snapshot';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROJECT_NAME,
  POWER_INPUT_MODES,
  PROJECT_FILE_VERSION,
  SAVED_PROJECT_STORAGE_KEY,
} from '@/store/store-config';
import type { BoardStoreState } from '@/store/store-types';
import { pickLanguage } from '@/lib/ui-language';
import {
  hasImportedSchematicSceneContent,
  hasLegacyImportedSchematicState,
} from '@/lib/component-template-utils';
import { persistImportedValidationJob } from '@/lib/validation-jobs-client';
import type { ModuMakeProjectData } from '@/types';

function isUnsafeEmptyImportedSchematicDocument(document: ModuMakeProjectData) {
  return document.activeBoardId === 'kicad_generic' && (document.components?.length ?? 0) === 0;
}

function getImportedCloudSafetyError(
  document: ModuMakeProjectData,
  previousDocument?: ModuMakeProjectData | null
) {
  const nextHasScene = hasImportedSchematicSceneContent(document.importedSchematicScene ?? null);
  const previousHasScene = previousDocument
    ? hasImportedSchematicSceneContent(previousDocument.importedSchematicScene ?? null)
    : false;

  if (isUnsafeEmptyImportedSchematicDocument(document)) {
    return 'KiCad 회로도가 비어 있어 클라우드 저장을 중단했습니다. 파일을 다시 불러온 뒤 저장해 주세요.';
  }

  if (previousHasScene && (document.components?.length ?? 0) === 0) {
    return '원본 KiCad 장면이 있던 클라우드 프로젝트를 빈 회로도로 덮어쓰지 않았습니다. 같은 .kicad_sch 파일을 다시 import한 뒤 저장해 주세요.';
  }

  const hasLegacyImportedState = hasLegacyImportedSchematicState(
    document.activeBoardId,
    document.components ?? [],
    document.importedSchematicScene ?? null
  );

  if (!hasLegacyImportedState) {
    if (previousHasScene && !nextHasScene) {
      return '원본 KiCad 배선 장면이 빠진 상태라 기존 클라우드 도면을 덮어쓰지 않았습니다. 같은 .kicad_sch 파일을 다시 import한 뒤 저장해 주세요.';
    }
    return null;
  }

  if (previousHasScene) {
    return '원본 KiCad 배선 장면이 빠진 상태라 기존 클라우드 도면을 덮어쓰지 않았습니다. 같은 .kicad_sch 파일을 다시 import한 뒤 저장해 주세요.';
  }

  return '원본 KiCad 배선 장면이 빠진 상태라 클라우드 저장을 중단했습니다. 같은 .kicad_sch 파일을 다시 import한 뒤 저장해 주세요.';
}

export const createPersistenceSlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  serializeProject: () =>
    ensureImportedValidationSnapshot(
      createProjectDocument(get(), { projectFileVersion: PROJECT_FILE_VERSION })
    ),

  hydrateProject: (payload: unknown) => {
    const workspaceModes = getAllowedWorkspaceModes();
    const document = normalizeProjectDocument(payload, {
      defaultBoardId: DEFAULT_BOARD_ID,
      defaultProjectName: DEFAULT_PROJECT_NAME,
      projectFileVersion: PROJECT_FILE_VERSION,
      workspaceModes,
      powerInputModes: POWER_INPUT_MODES,
    });
    if (!document) {
      return { success: false, error: '프로젝트 형식을 읽을 수 없습니다.' };
    }

    const requestedWorkspaceMode =
      payload && typeof payload === 'object' && 'workspaceMode' in payload
        ? (payload as { workspaceMode?: unknown }).workspaceMode
        : undefined;
    const shouldDowngradeAdvancedWorkspace =
      isAdvancedWorkspaceMode(requestedWorkspaceMode) && !workspaceModes.includes(requestedWorkspaceMode);
    const nextDocument = shouldDowngradeAdvancedWorkspace
      ? { ...document, workspaceMode: getDefaultWorkspaceMode() }
      : document;
    const notice = shouldDowngradeAdvancedWorkspace
      ? pickLanguage(nextDocument.appLanguage ?? 'ko', {
          ko: '리뷰 모드에서는 회로도/시뮬레이션만 사용할 수 있습니다.',
          en: 'Review mode is limited to schematic and simulation.',
        })
      : undefined;

    setRuntimeCustomComponentPackages(nextDocument.customComponentPackages ?? []);
    setRuntimeTemplateCache(nextDocument.templateCache ?? {});

    const baseSnapshot = createHistorySnapshot({
      activeBoardId: nextDocument.activeBoardId,
      pins: nextDocument.pins,
      components: nextDocument.components,
      manualConnections: nextDocument.manualConnections ?? [],
      powerInputMode: nextDocument.powerInputMode,
      componentPowerModes: nextDocument.componentPowerModes ?? {},
      componentUnusedPinModes: nextDocument.componentUnusedPinModes ?? {},
      workspaceMode: nextDocument.workspaceMode,
      wiringMode: nextDocument.wiringMode,
      showGrid: nextDocument.showGrid,
      showMinimap: nextDocument.showMinimap,
      selectedComponentId: null,
    });

    set({
      ...applyProjectDocument(nextDocument),
      ghostFixPreview: null,
      pastHistoryEntries: [],
      futureHistoryEntries: [],
      historySignature: buildHistorySnapshotSignature(baseSnapshot),
      ...buildHistoryFlags([], []),
    });

    return { success: true, notice };
  },

  saveProjectToBrowser: async () => {
    if (typeof window === 'undefined') {
      return { success: false, error: '브라우저 저장소를 사용할 수 없습니다.' };
    }

    try {
      const savedAt = new Date().toISOString();
      const state = get();
      const document = ensureImportedValidationSnapshot(
        createProjectDocument(state, { projectFileVersion: PROJECT_FILE_VERSION }, savedAt)
      );
      if (state.isGuestStudentMode) {
        await saveProjectDocumentIndexedDb(document);
      } else {
        window.localStorage.setItem(SAVED_PROJECT_STORAGE_KEY, JSON.stringify(document));
      }
      return { success: true, savedAt };
    } catch {
      return { success: false, error: '브라우저 저장 중 오류가 발생했습니다.' };
    }
  },

  loadProjectFromBrowser: async () => {
    if (typeof window === 'undefined') {
      return { success: false, error: '브라우저 저장소를 사용할 수 없습니다.' };
    }

    try {
      const state = get();
      const payload = state.isGuestStudentMode
        ? await loadProjectDocumentIndexedDb()
        : window.localStorage.getItem(SAVED_PROJECT_STORAGE_KEY);

      if (!payload) {
        return { success: false, error: '브라우저에 저장된 프로젝트가 없습니다.' };
      }

      const document = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const result = get().hydrateProject(document);
      if (!result.success) {
        return result;
      }

      get().clearCloudProjectState();

      return { success: true, notice: result.notice };
    } catch {
      return { success: false, error: '저장된 프로젝트를 읽는 중 오류가 발생했습니다.' };
    }
  },

  setCloudProjectState: patch => {
    set(state => ({
      cloudProjectId: patch.cloudProjectId ?? state.cloudProjectId,
      cloudProjectTitle: patch.cloudProjectTitle ?? state.cloudProjectTitle,
      cloudVisibility: patch.cloudVisibility ?? state.cloudVisibility,
      cloudIsSaving: patch.cloudIsSaving ?? state.cloudIsSaving,
      cloudIsOwner: patch.cloudIsOwner ?? state.cloudIsOwner,
      cloudLastSavedAt:
        patch.cloudLastSavedAt === undefined ? state.cloudLastSavedAt : patch.cloudLastSavedAt,
      cloudLastValidationJobId:
        patch.cloudLastValidationJobId === undefined
          ? state.cloudLastValidationJobId
          : patch.cloudLastValidationJobId,
      cloudValidationPersistStatus:
        patch.cloudValidationPersistStatus === undefined
          ? state.cloudValidationPersistStatus
          : patch.cloudValidationPersistStatus,
      cloudValidationPersistError:
        patch.cloudValidationPersistError === undefined
          ? state.cloudValidationPersistError
          : patch.cloudValidationPersistError,
      cloudError: patch.cloudError === undefined ? state.cloudError : patch.cloudError,
      cloudEditToken: patch.cloudEditToken === undefined ? state.cloudEditToken : patch.cloudEditToken,
    }));
  },

  clearCloudProjectState: () => {
    set({
      cloudProjectId: null,
      cloudProjectTitle: get().projectName,
      cloudVisibility: 'unlisted',
      cloudIsSaving: false,
      cloudIsOwner: true,
      cloudLastSavedAt: null,
      cloudLastValidationJobId: null,
      cloudValidationPersistStatus: 'idle',
      cloudValidationPersistError: null,
      cloudError: null,
      cloudEditToken: null,
    });
  },

  createCloudProject: async (visibility = 'unlisted') => {
    try {
      const state = get();
      const document = ensureImportedValidationSnapshot(
        createProjectDocument(state, { projectFileVersion: PROJECT_FILE_VERSION })
      );
      const message = getImportedCloudSafetyError(document);
      if (message) {
        set({ cloudError: message, cloudIsSaving: false });
        return { success: false, error: message };
      }

      const result = await createCloudProject({
        title: state.projectName,
        visibility,
        stateJson: document,
      });

      if (!result.success) {
        set({ cloudError: result.error });
        return { success: false, error: result.error };
      }

      if (result.editToken) {
        rememberCloudProjectEditToken(result.project.id, result.editToken);
      }

      set({
        cloudProjectId: result.project.id,
        cloudProjectTitle: result.project.title,
        cloudVisibility: result.project.visibility,
        cloudIsSaving: false,
        cloudIsOwner: result.project.isOwner,
        cloudLastSavedAt: result.project.updatedAt,
        cloudLastValidationJobId: null,
        cloudValidationPersistStatus: 'idle',
        cloudValidationPersistError: null,
        cloudError: null,
        cloudEditToken: result.editToken ?? null,
      });

      set({
        cloudValidationPersistStatus: 'saving',
        cloudValidationPersistError: null,
      });
      const validationPersistResult = await persistImportedValidationJob(result.project.id, document);
      if (!validationPersistResult.success) {
        set({
          cloudValidationPersistStatus: 'failed',
          cloudValidationPersistError: validationPersistResult.error,
        });
        console.warn('[ValidationJobs] Cloud project was created, but validation snapshot was not persisted.', {
          projectId: result.project.id,
          error: validationPersistResult.error,
        });
      } else if (validationPersistResult.skipped) {
        set({
          cloudValidationPersistStatus: 'skipped',
          cloudValidationPersistError: null,
        });
      } else if (validationPersistResult.validationJobId) {
        set({
          cloudLastValidationJobId: validationPersistResult.validationJobId,
          cloudValidationPersistStatus: 'saved',
          cloudValidationPersistError: null,
        });
      }

      return { success: true, projectId: result.project.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : '클라우드 프로젝트를 만들지 못했습니다.';
      set({ cloudError: message, cloudIsSaving: false });
      return { success: false, error: message };
    }
  },

  saveProjectToCloud: async () => {
    const state = get();
    if (!state.cloudProjectId) {
      return { success: false, error: '클라우드 프로젝트가 아직 연결되지 않았습니다.' };
    }

    if (!state.cloudIsOwner) {
      return { success: false, error: '이 링크는 보기 전용입니다. 먼저 복제본을 만들어 주세요.' };
    }

    try {
      set({ cloudIsSaving: true, cloudError: null });
      const document = ensureImportedValidationSnapshot(
        createProjectDocument(get(), { projectFileVersion: PROJECT_FILE_VERSION })
      );
      const message = getImportedCloudSafetyError(document);
      if (message) {
        set({ cloudIsSaving: false, cloudError: message });
        return { success: false, error: message };
      }

      const editToken = state.cloudEditToken ?? getRememberedCloudProjectEditToken(state.cloudProjectId) ?? undefined;
      const result = await updateCloudProject(
        state.cloudProjectId,
        {
          title: get().projectName,
          visibility: get().cloudVisibility,
          stateJson: document,
        },
        editToken
      );

      if (!result.success) {
        set({ cloudIsSaving: false, cloudError: result.error });
        return { success: false, error: result.error };
      }

      set({
        cloudIsSaving: false,
        cloudLastSavedAt: result.project.updatedAt,
        cloudProjectTitle: result.project.title,
        cloudVisibility: result.project.visibility,
        cloudLastValidationJobId: null,
        cloudValidationPersistStatus: 'idle',
        cloudValidationPersistError: null,
        cloudError: null,
      });

      set({
        cloudValidationPersistStatus: 'saving',
        cloudValidationPersistError: null,
      });
      const validationPersistResult = await persistImportedValidationJob(state.cloudProjectId, document);
      if (!validationPersistResult.success) {
        set({
          cloudValidationPersistStatus: 'failed',
          cloudValidationPersistError: validationPersistResult.error,
        });
        console.warn('[ValidationJobs] Cloud project was saved, but validation snapshot was not persisted.', {
          projectId: state.cloudProjectId,
          error: validationPersistResult.error,
        });
      } else if (validationPersistResult.skipped) {
        set({
          cloudValidationPersistStatus: 'skipped',
          cloudValidationPersistError: null,
        });
      } else if (validationPersistResult.validationJobId) {
        set({
          cloudLastValidationJobId: validationPersistResult.validationJobId,
          cloudValidationPersistStatus: 'saved',
          cloudValidationPersistError: null,
        });
      }

      return { success: true, savedAt: result.project.updatedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : '클라우드 저장에 실패했습니다.';
      set({ cloudIsSaving: false, cloudError: message });
      return { success: false, error: message };
    }
  },

  loadCloudProjectFromLink: async (projectId, options) => {
    try {
      set({ cloudIsSaving: false, cloudError: null });

      const currentState = get();
      const hasLiveImportedSchematic =
        hasImportedSchematicSceneContent(currentState.importedSchematicScene ?? null) ||
        hasLegacyImportedSchematicState(
          currentState.activeBoardId,
          currentState.components,
          currentState.importedSchematicScene
        );
      if (!options?.forceReload && currentState.cloudProjectId === projectId && hasLiveImportedSchematic) {
        return { success: true, isOwner: currentState.cloudIsOwner };
      }

      const rememberedEditToken = getRememberedCloudProjectEditToken(projectId) ?? undefined;
      const result = await fetchCloudProject(projectId, rememberedEditToken);

      if (!result.success) {
        set({ cloudError: result.error });
        return { success: false, error: result.error };
      }

      const hydrateResult = get().hydrateProject(result.project.stateJson);
      if (!hydrateResult.success) {
        set({ cloudError: hydrateResult.error });
        return hydrateResult;
      }

      set({
        cloudProjectId: result.project.id,
        cloudProjectTitle: result.project.title,
        cloudVisibility: result.project.visibility,
        cloudIsSaving: false,
        cloudIsOwner: result.project.isOwner,
        cloudLastSavedAt: result.project.updatedAt,
        cloudLastValidationJobId: null,
        cloudValidationPersistStatus: 'idle',
        cloudValidationPersistError: null,
        cloudError: null,
        cloudEditToken: result.project.isOwner ? rememberedEditToken ?? null : null,
      });

      return { success: true, isOwner: result.project.isOwner };
    } catch (error) {
      const message = error instanceof Error ? error.message : '공유 프로젝트를 불러오지 못했습니다.';
      set({ cloudError: message });
      return { success: false, error: message };
    }
  },

  forkCloudProject: async () => {
    const state = get();
    if (!state.cloudProjectId) {
      return { success: false, error: '복제할 공유 프로젝트가 없습니다.' };
    }

    try {
      const editToken = state.cloudEditToken ?? getRememberedCloudProjectEditToken(state.cloudProjectId) ?? undefined;
      const result = await forkCloudProject(
        state.cloudProjectId,
        {
          title: `${state.projectName} (Forked)`,
        },
        editToken
      );

      if (!result.success) {
        set({ cloudError: result.error });
        return { success: false, error: result.error };
      }

      if (result.editToken) {
        rememberCloudProjectEditToken(result.project.id, result.editToken);
      }

      const hydrateResult = get().hydrateProject(result.project.stateJson);
      if (!hydrateResult.success) {
        set({ cloudError: hydrateResult.error });
        return hydrateResult;
      }

      set({
        cloudProjectId: result.project.id,
        cloudProjectTitle: result.project.title,
        cloudVisibility: result.project.visibility,
        cloudIsSaving: false,
        cloudIsOwner: true,
        cloudLastSavedAt: result.project.updatedAt,
        cloudLastValidationJobId: null,
        cloudValidationPersistStatus: 'idle',
        cloudValidationPersistError: null,
        cloudError: null,
        cloudEditToken: result.editToken ?? null,
      });

      return { success: true, projectId: result.project.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : '복제본을 만들지 못했습니다.';
      set({ cloudError: message });
      return { success: false, error: message };
    }
  },

  updateCloudVisibility: async visibility => {
    const state = get();
    if (!state.cloudProjectId) {
      return { success: false, error: '클라우드 프로젝트가 아직 연결되지 않았습니다.' };
    }

    if (!state.cloudIsOwner) {
      return { success: false, error: '보기 전용 링크에서는 공개 범위를 바꿀 수 없습니다.' };
    }

    try {
      set({ cloudIsSaving: true, cloudError: null });
      const editToken = state.cloudEditToken ?? getRememberedCloudProjectEditToken(state.cloudProjectId) ?? undefined;
      const result = await updateCloudProject(
        state.cloudProjectId,
        {
          visibility,
          title: state.projectName,
        },
        editToken
      );

      if (!result.success) {
        set({ cloudIsSaving: false, cloudError: result.error });
        return { success: false, error: result.error };
      }

      set({
        cloudIsSaving: false,
        cloudVisibility: result.project.visibility,
        cloudLastSavedAt: result.project.updatedAt,
        cloudError: null,
      });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '공개 범위를 바꾸지 못했습니다.';
      set({ cloudIsSaving: false, cloudError: message });
      return { success: false, error: message };
    }
  },

  importCustomComponentPackage: payload => {
    const result = validateCustomComponentPackage(payload);
    if (!result.valid) {
      return { success: false, error: result.errors.join(' / ') };
    }

    const state = get();
    const nextPackages = [
      ...state.customComponentPackages.filter(item => item.templateId !== result.data.templateId),
      result.data,
    ];

    setRuntimeCustomComponentPackages(nextPackages);
    set({ customComponentPackages: nextPackages });

    return { success: true, templateId: result.data.templateId };
  },

  removeCustomComponentPackage: templateId => {
    const state = get();
    if (!state.customComponentPackages.some(pkg => pkg.templateId === templateId)) {
      return { success: false, error: '등록된 커스텀 부품을 찾을 수 없습니다.' };
    }

    if (state.components.some(component => component.templateId === templateId)) {
      return { success: false, error: '캔버스에서 이 부품을 먼저 제거한 뒤 삭제해 주세요.' };
    }

    const nextPackages = state.customComponentPackages.filter(pkg => pkg.templateId !== templateId);
    setRuntimeCustomComponentPackages(nextPackages);
    set({ customComponentPackages: nextPackages });
    return { success: true };
  },
});
