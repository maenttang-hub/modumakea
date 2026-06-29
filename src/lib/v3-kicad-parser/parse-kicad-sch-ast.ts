import { childForms, parseKiCadSExpression, type SExprNode } from '@/lib/s-expr-parser';

export function assertSupportedKiCadSchematicSource(source: string) {
  if (!source.trimStart().startsWith('(kicad_sch')) {
    throw new Error(
      '구버전 KiCad 파일이거나 지원되지 않는 포맷입니다. KiCad v6 이상에서 파일을 열고 다시 저장한 .kicad_sch 파일을 업로드해 주세요.'
    );
  }
}

export function findSchematicRoot(nodes: SExprNode[]) {
  return nodes.find(node => Array.isArray(node) && node[0] === 'kicad_sch') as SExprNode[] | undefined;
}

export function assertMainSchematicFile(
  root: SExprNode[],
  symbolInstanceCount: number,
  options?: { allowFragmentInput?: boolean }
) {
  if (options?.allowFragmentInput) {
    return;
  }

  const hasLibrarySymbols = Boolean(childForms(root, 'lib_symbols')[0]);
  if (!hasLibrarySymbols && symbolInstanceCount > 0) {
    throw new Error('이 파일은 서브시트로 보입니다. 메인 .kicad_sch 파일을 업로드해 주세요.');
  }
}

export function parseKiCadSchAst(source: string) {
  assertSupportedKiCadSchematicSource(source);
  const tree = parseKiCadSExpression(source);
  const root = findSchematicRoot(tree);
  if (!root) {
    throw new Error('KiCad schematic 루트를 찾지 못했습니다.');
  }

  return { tree, root };
}
