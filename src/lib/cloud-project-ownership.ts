const CLOUD_OWNERSHIP_STORAGE_KEY = 'modumake-cloud-ownership-v1';

type CloudOwnershipMap = Record<string, string>;

function canUseBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readOwnershipMap(): CloudOwnershipMap {
  if (!canUseBrowserStorage()) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(CLOUD_OWNERSHIP_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<CloudOwnershipMap>((acc, [projectId, token]) => {
      if (typeof token === 'string' && token.trim().length > 0) {
        acc[projectId] = token;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeOwnershipMap(nextMap: CloudOwnershipMap) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(CLOUD_OWNERSHIP_STORAGE_KEY, JSON.stringify(nextMap));
}

export function getRememberedCloudProjectEditToken(projectId: string) {
  return readOwnershipMap()[projectId] ?? null;
}

export function rememberCloudProjectEditToken(projectId: string, editToken: string) {
  const nextMap = readOwnershipMap();
  nextMap[projectId] = editToken;
  writeOwnershipMap(nextMap);
}

export function forgetCloudProjectEditToken(projectId: string) {
  const nextMap = readOwnershipMap();
  delete nextMap[projectId];
  writeOwnershipMap(nextMap);
}
