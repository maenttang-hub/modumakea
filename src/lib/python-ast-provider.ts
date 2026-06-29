export interface ModuMakePythonAstBindings {
  parsePython?: (input: { source: string; boardId: string }) => unknown;
  collectPythonReviewArtifacts?: (input: { code: string; boardId: string }) => unknown;
}

type PythonAstGlobal = typeof globalThis & {
  __MODUMAKE_PYTHON_AST__?: ModuMakePythonAstBindings | null;
};

let generatedPythonAstLoadPromise: Promise<ModuMakePythonAstBindings | null> | null = null;

function getPythonAstGlobal(): PythonAstGlobal {
  return globalThis as PythonAstGlobal;
}

export function registerModuMakePythonAstBindings(bindings: ModuMakePythonAstBindings | null) {
  getPythonAstGlobal().__MODUMAKE_PYTHON_AST__ = bindings;
}

export function getModuMakePythonAstBindings() {
  return getPythonAstGlobal().__MODUMAKE_PYTHON_AST__ ?? null;
}

export function clearModuMakePythonAstBindings() {
  registerModuMakePythonAstBindings(null);
  generatedPythonAstLoadPromise = null;
}

export async function ensureGeneratedModuMakePythonAstBindings() {
  const existingBindings = getModuMakePythonAstBindings();
  if (existingBindings) {
    return existingBindings;
  }

  if (!generatedPythonAstLoadPromise) {
    generatedPythonAstLoadPromise = import('@/generated/python-tree-sitter/index')
      .then(module => module.loadGeneratedPythonTreeSitterBindings())
      .then(bindings => {
        if (bindings) {
          registerModuMakePythonAstBindings(bindings);
        }
        return bindings;
      })
      .catch(() => null);
  }

  return generatedPythonAstLoadPromise;
}

if (typeof window !== 'undefined') {
  void ensureGeneratedModuMakePythonAstBindings();
}
