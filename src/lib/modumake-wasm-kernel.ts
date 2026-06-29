export interface ModuMakeWasmKernelBindings {
  solveDcNetworkJson?: (inputJson: string) => string;
  parseCppJson?: (source: string) => string;
  collectCppOperationsJson?: (inputJson: string) => string;
  collectCppReviewArtifactsJson?: (inputJson: string) => string;
  parsePythonJson?: (inputJson: string) => string;
  collectPythonOperationsJson?: (inputJson: string) => string;
  collectPythonReviewArtifactsJson?: (inputJson: string) => string;
}

export type ModuMakeKernelJsonMethod =
  | 'solveDcNetworkJson'
  | 'collectCppOperationsJson'
  | 'collectCppReviewArtifactsJson'
  | 'parsePythonJson'
  | 'collectPythonOperationsJson'
  | 'collectPythonReviewArtifactsJson';

export type ModuMakeKernelStringMethod = 'parseCppJson';

type KernelGlobal = typeof globalThis & {
  __MODUMAKE_WASM_KERNEL__?: ModuMakeWasmKernelBindings | null;
};

let generatedKernelLoadPromise: Promise<ModuMakeWasmKernelBindings | null> | null = null;

function getKernelGlobal(): KernelGlobal {
  return globalThis as KernelGlobal;
}

export function registerModuMakeWasmKernelBindings(bindings: ModuMakeWasmKernelBindings | null) {
  getKernelGlobal().__MODUMAKE_WASM_KERNEL__ = bindings;
}

export function getModuMakeWasmKernelBindings() {
  return getKernelGlobal().__MODUMAKE_WASM_KERNEL__ ?? null;
}

export function clearModuMakeWasmKernelBindings() {
  registerModuMakeWasmKernelBindings(null);
  generatedKernelLoadPromise = null;
}

export function getModuMakeKernelBackendLabel() {
  const bindings = getModuMakeWasmKernelBindings();
  return bindings ? 'rust-wasm' : 'typescript';
}

export function callModuMakeKernelJsonMethod<TInput, TOutput>(
  method: ModuMakeKernelJsonMethod,
  input: TInput,
  fallback: TOutput
) {
  const bindings = getModuMakeWasmKernelBindings();
  const fn = bindings?.[method];
  if (!fn) {
    return fallback;
  }

  try {
    return JSON.parse(fn(JSON.stringify(input))) as TOutput;
  } catch {
    return fallback;
  }
}

export function callModuMakeKernelStringMethod<TOutput>(
  method: ModuMakeKernelStringMethod,
  input: string,
  fallback: TOutput
) {
  const bindings = getModuMakeWasmKernelBindings();
  const fn = bindings?.[method];
  if (!fn) {
    return fallback;
  }

  try {
    return JSON.parse(fn(input)) as TOutput;
  } catch {
    return fallback;
  }
}

export async function ensureGeneratedModuMakeWasmKernelBindings() {
  const existingBindings = getModuMakeWasmKernelBindings();
  if (existingBindings) {
    return existingBindings;
  }

  if (!generatedKernelLoadPromise) {
    generatedKernelLoadPromise = import('@/generated/modumake-kernel/index')
      .then(module => module.loadGeneratedModuMakeKernelBindings())
      .then(bindings => {
        if (bindings) {
          registerModuMakeWasmKernelBindings(bindings);
        }
        return bindings;
      })
      .catch(() => null);
  }

  return generatedKernelLoadPromise;
}

if (typeof window !== 'undefined') {
  void ensureGeneratedModuMakeWasmKernelBindings();
}
