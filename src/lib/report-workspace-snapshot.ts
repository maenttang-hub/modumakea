import { pickReferencedTemplateCache } from '@/lib/template-cache-registry';
import { REPORT_WORKSPACE_SNAPSHOT_KEY } from '@/store/store-config';
import type { BoardStoreState } from '@/store/store-types';

export function persistReportWorkspaceSnapshot(state: BoardStoreState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(REPORT_WORKSPACE_SNAPSHOT_KEY, JSON.stringify({
    state: {
      projectName: state.projectName,
      appLanguage: state.appLanguage,
      activeBoardId: state.activeBoardId,
      components: state.components,
      manualConnections: state.manualConnections,
      importedSchematicScene: state.importedSchematicScene,
      importedSchematicSource: state.importedSchematicSource,
      importedPcbDocument: state.importedPcbDocument,
      importedPcbSource: state.importedPcbSource,
      importedPcbValidation: state.importedPcbValidation,
      powerInputMode: state.powerInputMode,
      componentPowerModes: state.componentPowerModes,
      componentUnusedPinModes: state.componentUnusedPinModes,
      generatedCode: state.generatedCode,
      validationReviewDecisions: state.validationReviewDecisions,
      footprintPinPadOverrideCache: state.footprintPinPadOverrideCache,
      templateCache: pickReferencedTemplateCache(state.components, state.templateCache),
      customComponentPackages: state.customComponentPackages,
    },
    version: 0,
  }));
}
