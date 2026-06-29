import { createHash, randomUUID } from 'node:crypto';
import {
  getAllowedWorkspaceModes,
  getDefaultWorkspaceMode,
  isAdvancedWorkspaceMode,
} from '@/constants/product-surface';
import {
  hasImportedSchematicSceneContent,
  hasLegacyImportedSchematicState,
} from '@/lib/component-template-utils';
import { getSupabaseAdminClient } from '@/lib/supabase-admin';
import { normalizeProjectDocument } from '@/store/project-document';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROJECT_NAME,
  POWER_INPUT_MODES,
  PROJECT_FILE_VERSION,
} from '@/store/store-config';
import type { CloudProjectVisibility, ModuMakeProjectData } from '@/types';

const CLOUD_META_KEY = '__cloud';

type CloudMeta = {
  ownerTokenHash?: string;
  forkedFrom?: string;
};

type ProjectRow = {
  id: string;
  title: string;
  visibility: CloudProjectVisibility;
  state_json: ModuMakeProjectData & { [CLOUD_META_KEY]?: CloudMeta };
  created_at: string;
  updated_at: string;
};

export type StoredCloudProject = {
  id: string;
  title: string;
  visibility: CloudProjectVisibility;
  stateJson: ModuMakeProjectData;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
};

function buildTokenHash(editToken: string) {
  return createHash('sha256').update(editToken).digest('hex');
}

function sanitizeProjectStateForClient(
  stateJson: ModuMakeProjectData | (ModuMakeProjectData & { [CLOUD_META_KEY]?: CloudMeta })
) {
  const rest = Object.fromEntries(
    Object.entries((stateJson ?? {}) as ModuMakeProjectData & { [CLOUD_META_KEY]?: CloudMeta }).filter(
      ([key]) => key !== CLOUD_META_KEY
    )
  );

  const workspaceModes = getAllowedWorkspaceModes();
  const document = normalizeProjectDocument(rest, {
    defaultBoardId: DEFAULT_BOARD_ID,
    defaultProjectName: DEFAULT_PROJECT_NAME,
    projectFileVersion: PROJECT_FILE_VERSION,
    workspaceModes,
    powerInputModes: POWER_INPUT_MODES,
  });
  if (!document) {
    return null;
  }

  const requestedWorkspaceMode = (rest as Partial<ModuMakeProjectData>).workspaceMode;
  if (isAdvancedWorkspaceMode(requestedWorkspaceMode) && !workspaceModes.includes(requestedWorkspaceMode)) {
    return {
      ...document,
      workspaceMode: getDefaultWorkspaceMode(),
    };
  }

  return document;
}

function buildStoredStateJson(
  stateJson: ModuMakeProjectData,
  meta: CloudMeta
) {
  return {
    ...stateJson,
    [CLOUD_META_KEY]: meta,
  };
}

function normalizeStateForStorage(stateJson: ModuMakeProjectData) {
  const workspaceModes = getAllowedWorkspaceModes();

  return normalizeProjectDocument(stateJson, {
    defaultBoardId: DEFAULT_BOARD_ID,
    defaultProjectName: DEFAULT_PROJECT_NAME,
    projectFileVersion: PROJECT_FILE_VERSION,
    workspaceModes,
    powerInputModes: POWER_INPUT_MODES,
  });
}

function isUnsafeEmptyImportedSchematicState(stateJson: ModuMakeProjectData) {
  return stateJson.activeBoardId === 'kicad_generic' && (stateJson.components?.length ?? 0) === 0;
}

function getImportedCloudSafetyError(
  stateJson: ModuMakeProjectData,
  previousStateJson?: ModuMakeProjectData | null
) {
  const nextHasScene = hasImportedSchematicSceneContent(stateJson.importedSchematicScene ?? null);
  const previousHasScene = previousStateJson
    ? hasImportedSchematicSceneContent(previousStateJson.importedSchematicScene ?? null)
    : false;

  if (isUnsafeEmptyImportedSchematicState(stateJson)) {
    return 'KiCad 회로도가 비어 있어 클라우드 프로젝트를 저장하지 않았습니다. 파일을 다시 불러온 뒤 저장해 주세요.';
  }

  if (previousHasScene && (stateJson.components?.length ?? 0) === 0) {
    return '원본 KiCad 장면이 있던 클라우드 프로젝트를 빈 회로도로 덮어쓰지 않았습니다. 같은 .kicad_sch 파일을 다시 import한 뒤 저장해 주세요.';
  }

  const hasLegacyImportedState = hasLegacyImportedSchematicState(
    stateJson.activeBoardId,
    stateJson.components ?? [],
    stateJson.importedSchematicScene ?? null
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

function toStoredCloudProject(row: ProjectRow, isOwner: boolean): StoredCloudProject | null {
  const sanitizedState = sanitizeProjectStateForClient(row.state_json);
  if (!sanitizedState) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    visibility: row.visibility,
    stateJson: sanitizedState,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwner,
  };
}

function canReadProject(row: ProjectRow, editToken?: string) {
  if (row.visibility === 'public' || row.visibility === 'unlisted') {
    return true;
  }

  if (!editToken) {
    return false;
  }

  return row.state_json?.[CLOUD_META_KEY]?.ownerTokenHash === buildTokenHash(editToken);
}

function isOwner(row: ProjectRow, editToken?: string) {
  if (!editToken) {
    return false;
  }

  return row.state_json?.[CLOUD_META_KEY]?.ownerTokenHash === buildTokenHash(editToken);
}

function getProjectsTable() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    throw new Error('클라우드 저장 서버가 아직 설정되지 않았습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.');
  }

  return supabase.from('projects');
}

export async function createStoredCloudProject(input: {
  title: string;
  visibility: CloudProjectVisibility;
  stateJson: ModuMakeProjectData;
}) {
  const normalizedState = normalizeStateForStorage(input.stateJson);
  if (!normalizedState) {
    throw new Error('클라우드에 저장할 프로젝트 상태를 정리하지 못했습니다.');
  }

  const safetyError = getImportedCloudSafetyError(normalizedState);
  if (safetyError) {
    throw new Error(safetyError);
  }

  const editToken = randomUUID();
  const stateJson = buildStoredStateJson(normalizedState, {
    ownerTokenHash: buildTokenHash(editToken),
  });

  const { data, error } = await getProjectsTable()
    .insert({
      title: input.title,
      visibility: input.visibility,
      state_json: stateJson,
    })
    .select('id,title,visibility,state_json,created_at,updated_at')
    .single<ProjectRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '클라우드 프로젝트를 만들지 못했습니다.');
  }

  const project = toStoredCloudProject(data, true);
  if (!project) {
    throw new Error('클라우드 프로젝트 상태를 정리하는 중 오류가 발생했습니다.');
  }

  return { project, editToken };
}

export async function getStoredCloudProject(projectId: string, editToken?: string) {
  const { data, error } = await getProjectsTable()
    .select('id,title,visibility,state_json,created_at,updated_at')
    .eq('id', projectId)
    .single<ProjectRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '프로젝트를 찾지 못했습니다.');
  }

  if (!canReadProject(data, editToken)) {
    throw new Error('이 프로젝트를 볼 권한이 없습니다.');
  }

  const owner = isOwner(data, editToken);
  const project = toStoredCloudProject(data, owner);
  if (!project) {
    throw new Error('프로젝트 데이터를 읽는 중 오류가 발생했습니다.');
  }

  return project;
}

export async function updateStoredCloudProject(input: {
  projectId: string;
  title?: string;
  visibility?: CloudProjectVisibility;
  stateJson?: ModuMakeProjectData;
  editToken?: string;
}) {
  const { data, error } = await getProjectsTable()
    .select('id,title,visibility,state_json,created_at,updated_at')
    .eq('id', input.projectId)
    .single<ProjectRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '프로젝트를 찾지 못했습니다.');
  }

  if (!isOwner(data, input.editToken)) {
    throw new Error('이 프로젝트를 저장할 권한이 없습니다.');
  }

  const nextTitle = input.title ?? data.title;
  const nextVisibility = input.visibility ?? data.visibility;
  const normalizedStateJson = input.stateJson
    ? normalizeStateForStorage(input.stateJson)
    : null;

  if (input.stateJson && !normalizedStateJson) {
    throw new Error('클라우드에 저장할 프로젝트 상태를 정리하지 못했습니다.');
  }

  if (input.stateJson) {
    const existingState = sanitizeProjectStateForClient(data.state_json);
    const safetyError = getImportedCloudSafetyError(normalizedStateJson!, existingState);
    if (safetyError) {
      throw new Error(safetyError);
    }
  }

  const nextStateJson = normalizedStateJson
    ? buildStoredStateJson(normalizedStateJson, {
        ownerTokenHash: data.state_json?.[CLOUD_META_KEY]?.ownerTokenHash,
        forkedFrom: data.state_json?.[CLOUD_META_KEY]?.forkedFrom,
      })
    : data.state_json;

  const updateResult = await getProjectsTable()
    .update({
      title: nextTitle,
      visibility: nextVisibility,
      state_json: nextStateJson,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.projectId)
    .select('id,title,visibility,state_json,created_at,updated_at')
    .single<ProjectRow>();

  if (updateResult.error || !updateResult.data) {
    throw new Error(updateResult.error?.message ?? '클라우드 프로젝트 저장에 실패했습니다.');
  }

  const project = toStoredCloudProject(updateResult.data, true);
  if (!project) {
    throw new Error('업데이트된 프로젝트를 정리하는 중 오류가 발생했습니다.');
  }

  return project;
}

export async function forkStoredCloudProject(input: {
  sourceProjectId: string;
  title?: string;
  sourceEditToken?: string;
}) {
  const source = await getStoredCloudProject(input.sourceProjectId, input.sourceEditToken);
  const editToken = randomUUID();
  const nextTitle = input.title?.trim() || `${source.title} (Forked)`;

  const stateJson = buildStoredStateJson(source.stateJson, {
    ownerTokenHash: buildTokenHash(editToken),
    forkedFrom: source.id,
  });

  const { data, error } = await getProjectsTable()
    .insert({
      title: nextTitle,
      visibility: 'unlisted',
      state_json: stateJson,
    })
    .select('id,title,visibility,state_json,created_at,updated_at')
    .single<ProjectRow>();

  if (error || !data) {
    throw new Error(error?.message ?? '프로젝트 복제본을 만들지 못했습니다.');
  }

  const project = toStoredCloudProject(data, true);
  if (!project) {
    throw new Error('복제본 프로젝트 상태를 정리하는 중 오류가 발생했습니다.');
  }

  return { project, editToken };
}
