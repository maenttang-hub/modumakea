import type { ModuMakePythonAstBindings } from '@/lib/python-ast-provider';

/**
 * 실제 tree-sitter-python wasm/js 산출물이 저장소에 들어오면
 * 이 경계에서 우선 로드한 뒤, 실패 시 generated fallback으로 내려갑니다.
 */
export async function loadVendoredPythonTreeSitterBindings(): Promise<ModuMakePythonAstBindings | null> {
  return null;
}
