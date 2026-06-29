import type { ModuMakeProjectData } from '@/types';

const DB_NAME = 'modumake-local-projects';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const PRIMARY_KEY = 'active-project';

function openProjectDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error('IndexedDB를 열 수 없습니다.'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
) {
  return new Promise<T>(async (resolve, reject) => {
    try {
      const database = await openProjectDatabase();
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      transaction.oncomplete = () => database.close();
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error('IndexedDB 트랜잭션 오류가 발생했습니다.'));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error('IndexedDB 트랜잭션이 중단되었습니다.'));
      };

      task(store, resolve, reject);
    } catch (error) {
      reject(error);
    }
  });
}

export function saveProjectDocumentIndexedDb(document: ModuMakeProjectData) {
  return withStore<void>('readwrite', (store, resolve, reject) => {
    const request = store.put(document, PRIMARY_KEY);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB에 프로젝트를 저장할 수 없습니다.'));
    request.onsuccess = () => resolve();
  });
}

export function loadProjectDocumentIndexedDb() {
  return withStore<ModuMakeProjectData | null>('readonly', (store, resolve, reject) => {
    const request = store.get(PRIMARY_KEY);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 프로젝트를 읽을 수 없습니다.'));
    request.onsuccess = () => {
      const result = request.result;
      resolve(result && typeof result === 'object' ? (result as ModuMakeProjectData) : null);
    };
  });
}
