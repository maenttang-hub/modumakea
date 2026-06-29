import { childForms, stringAt, type SExprNode } from '@/lib/s-expr-parser';
import { sanitizePlainText } from '@/lib/security-input';
import { buildSchematicDomainModel } from '@/lib/v3-kicad-parser/build-schematic-domain-model';
import { extractSymbolInstances } from '@/lib/v3-kicad-parser/extractors/symbol-extractor';
import { assertMainSchematicFile, parseKiCadSchAst } from '@/lib/v3-kicad-parser/parse-kicad-sch-ast';
import { toLightweightValidationJson } from '@/lib/v3-kicad-parser/serializers/to-lightweight-validation-json';
import { toUnifiedCircuitModel } from '@/lib/v3-kicad-parser/serializers/to-unified-circuit-model';
import { SchematicConnectivitySolver } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
import type { SchematicDomainModel } from '@/types/schematic-domain';
import type { UnifiedCircuitSourceMeta } from '@/types';

function readProjectName(root: SExprNode[], explicitProjectName?: string) {
  if (explicitProjectName) {
    return sanitizePlainText(explicitProjectName, { maxLength: 160, fallback: 'Untitled KiCad Project' });
  }

  const title = stringAt(childForms(childForms(root, 'title_block')[0] ?? [], 'title')[0], 1);
  return sanitizePlainText(title, { maxLength: 160, fallback: 'Untitled KiCad Project' });
}


function buildParsedValidationArtifacts(
  source: string,
  options?: { projectName?: string; allowFragmentInput?: boolean }
) {
  const { root } = parseKiCadSchAst(source);

  const symbolInstances = extractSymbolInstances(root);
  assertMainSchematicFile(root, symbolInstances.length, { allowFragmentInput: options?.allowFragmentInput });
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);

  const sourceMeta: UnifiedCircuitSourceMeta = {
    sourceFileKind: 'kicad_sch',
    projectName: readProjectName(root, options?.projectName),
    generator: sanitizePlainText(stringAt(childForms(root, 'generator')[0], 1), { maxLength: 120, fallback: '' }) || undefined,
    version: sanitizePlainText(stringAt(childForms(root, 'version')[0], 1), { maxLength: 40, fallback: '' }) || undefined,
  };

  return {
    source: sourceMeta,
    model,
    nets,
  };
}

export function parseKiCadSchematicToUnifiedCircuitModel(
  source: string,
  options?: { projectName?: string; allowFragmentInput?: boolean }
) {
  return toUnifiedCircuitModel(buildParsedValidationArtifacts(source, options));
}

export function parseKiCadSchematicToLightweightValidationJson(
  source: string,
  options?: { projectName?: string; allowFragmentInput?: boolean }
) {
  return toLightweightValidationJson(buildParsedValidationArtifacts(source, options));
}

export function parseKiCadSchematicToDomainModel(
  source: string,
  options?: { allowFragmentInput?: boolean }
): SchematicDomainModel {
  const { root } = parseKiCadSchAst(source);
  const symbolInstances = extractSymbolInstances(root);
  assertMainSchematicFile(root, symbolInstances.length, options);
  return buildSchematicDomainModel(root);
}

export function parseKiCadSchematicToLogicalNets(
  source: string,
  options?: { toleranceMicrons?: number; allowFragmentInput?: boolean }
) {
  const model = parseKiCadSchematicToDomainModel(source, { allowFragmentInput: options?.allowFragmentInput });
  return SchematicConnectivitySolver.resolveNets(model, options);
}

export { buildSchematicDomainModel } from '@/lib/v3-kicad-parser/build-schematic-domain-model';
export * from '@/lib/v3-kicad-parser/geometry';
export { parseKiCadSchAst } from '@/lib/v3-kicad-parser/parse-kicad-sch-ast';
export { SchematicConnectivitySolver } from '@/lib/v3-kicad-parser/solve-schematic-connectivity';
