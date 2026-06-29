import { getBoardById } from '@/constants/boards';
import { buildIntegratedValidationJson } from '@/lib/build-integrated-validation-json';
import { parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';
import type { KiCadImportSummary } from '@/lib/kicad-sch-parser';
import type { DatasheetReviewInputPayload, ModuMakeProjectData } from '@/types';

interface BuildImportedSchematicIntegratedValidationJsonParams {
  document: ModuMakeProjectData;
  importedSource: string;
  importSummary?: KiCadImportSummary;
}

export function buildImportedSchematicIntegratedValidationJson(
  params: BuildImportedSchematicIntegratedValidationJsonParams
): DatasheetReviewInputPayload | null {
  try {
    const { document, importedSource, importSummary } = params;
    const unifiedModel = parseKiCadSchematicToUnifiedCircuitModel(importedSource, {
      projectName: document.projectName,
    });
    const board = getBoardById(document.activeBoardId);

    return buildIntegratedValidationJson({
      unifiedModel,
      boardId: document.activeBoardId,
      boardName: board.name,
      logicVoltage: board.logicVoltage,
      boardPinNames: Object.keys(document.pins),
      sourceKind: 'kicad_import',
      sourceCode: document.generatedCode,
      auditIssues: [],
      formalReport: undefined,
      importedComponentCount: importSummary?.importedComponentCount ?? document.components.length,
      importedConnectionCount:
        importSummary?.importedConnectionCount ??
        document.importedSchematicScene?.wireSegments.length ??
        0,
      generatedCustomComponentCount: document.customComponentPackages?.length ?? 0,
    });
  } catch {
    return null;
  }
}
