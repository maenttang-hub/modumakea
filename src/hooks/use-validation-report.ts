'use client';

import { useMemo } from 'react';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { runProjectDrc } from '@/lib/drc-engine';
import { buildEffectiveImportedPcbValidation } from '@/lib/effective-imported-pcb-validation';
import { translateEngineIssue } from '@/lib/engine-i18n';
import { mapImportedPcbValidationIssuesToProjectAuditIssues } from '@/lib/imported-pcb-audit-issues';
import { resolveIssueSourceBucketInfo, type IssueSourceBucket } from '@/lib/issue-source-bucket';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { useBoardStore } from '@/store/use-board-store';
import type {
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
  ProjectAuditIssueEvidence,
} from '@/types';

export type ValidationDisplayIssue = ProjectAuditIssue & {
  confidence: ProjectAuditIssueConfidence;
  evidence: ProjectAuditIssueEvidence;
  relatedComponentLabels: string[];
  relatedNetLabels: string[];
  sourceQuality?: ProjectAuditIssueEvidence['sourceQuality'];
  sourceQualityLabel?: string;
  mappingConfidence?: NonNullable<ReturnType<typeof resolveIssueSourceBucketInfo>['mappingConfidence']>;
  mappingSource?: NonNullable<ReturnType<typeof resolveIssueSourceBucketInfo>['mappingSource']>;
  lowConfidenceReasons: string[];
  isConservativeFinding: boolean;
  sourceBucket: IssueSourceBucket;
  sourceBucketLabel: string;
};

function inferFallbackConfidence(issue: ProjectAuditIssue): ProjectAuditIssueConfidence {
  if (issue.severity === 'info') {
    return 'informational';
  }

  if (issue.severity === 'error') {
    return 'strong-inference';
  }

  return 'needs-review';
}

export function useValidationReport() {
  const components = useBoardStore(state => state.components);
  const manualConnections = useBoardStore(state => state.manualConnections);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const importedSchematicScene = useBoardStore(state => state.importedSchematicScene);
  const importedSchematicSource = useBoardStore(state => state.importedSchematicSource);
  const integratedValidationJson = useBoardStore(state => state.integratedValidationJson);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const appLanguage = useBoardStore(state => state.appLanguage);
  const powerInputMode = useBoardStore(state => state.powerInputMode);
  const componentPowerModes = useBoardStore(state => state.componentPowerModes);
  const componentUnusedPinModes = useBoardStore(state => state.componentUnusedPinModes);
  const generatedCode = useBoardStore(state => state.generatedCode);
  const footprintPinPadOverrideCache = useBoardStore(state => state.footprintPinPadOverrideCache);
  const importedPcbDocument = useBoardStore(state => state.importedPcbDocument);
  const importedPcbValidation = useBoardStore(state => state.importedPcbValidation);

  const audit = useMemo<ReturnType<typeof runProjectDrc>>(
    () =>
      runProjectDrc({
        components,
        manualConnections,
        boardId: activeBoardId,
        resolveTemplate: getTemplateById,
        importedSchematicScene,
        powerInputMode,
        componentPowerModes,
        componentUnusedPinModes,
        generatedCode,
        footprintPinPadOverrideCache,
      }),
    [
      activeBoardId,
      componentPowerModes,
      componentUnusedPinModes,
      components,
      footprintPinPadOverrideCache,
      generatedCode,
      importedSchematicScene,
      manualConnections,
      powerInputMode,
    ]
  );

  const importedSchematicMode = useMemo(
    () => isImportedSchematicProject(activeBoardId, components, importedSchematicScene),
    [activeBoardId, components, importedSchematicScene]
  );

  const activeBoard = useMemo(() => getBoardById(activeBoardId), [activeBoardId]);
  const importedPalette = useMemo(() => getImportedSchematicPalette(schematicTheme), [schematicTheme]);
  const effectiveImportedPcbValidation = useMemo(
    () => buildEffectiveImportedPcbValidation({
      document: importedPcbDocument,
      validation: importedPcbValidation,
      options: {
        schematicParity: {
          components,
          manualConnections,
          importedSchematicScene,
          resolveTemplate: getTemplateById,
        },
      },
    }),
    [components, importedPcbDocument, importedPcbValidation, importedSchematicScene, manualConnections]
  );
  const combinedIssues = useMemo(
    () => [
      ...audit.issues,
      ...mapImportedPcbValidationIssuesToProjectAuditIssues(effectiveImportedPcbValidation),
    ],
    [audit.issues, effectiveImportedPcbValidation]
  );

  const issues = useMemo<ValidationDisplayIssue[]>(() => {
    return combinedIssues.map(issue => {
      const localized = translateEngineIssue(issue, appLanguage);
      const confidence = issue.confidence ?? issue.evidence?.confidence ?? inferFallbackConfidence(issue);
      const evidence: ProjectAuditIssueEvidence = issue.evidence ?? {
        confidence,
        evidenceSummary: localized.message,
        observedFacts: [],
        assumptions: confidence === 'needs-review' ? ['모듈 SKU 또는 원본 데이터시트 맥락에 따라 판단이 달라질 수 있습니다.'] : [],
        checkedBy: ['netlist'],
        affectedComponents: issue.visualTargets?.componentIds,
        affectedNets: issue.visualTargets?.netIds,
        howToVerify: localized.recommendation,
      };
      const relatedComponentLabels = (evidence.affectedComponents ?? issue.visualTargets?.componentIds ?? [])
        .map(componentId => components.find(component => component.instanceId === componentId)?.name ?? componentId)
        .filter(Boolean);
      const relatedNetLabels = (evidence.affectedNets ?? issue.visualTargets?.netIds ?? [])
        .map(netId => audit.circuitAnalysis.nets.find(net => net.id === netId)?.id ?? netId)
        .filter(Boolean);
      const sourceBucketInfo = resolveIssueSourceBucketInfo(
        {
          ...issue,
          evidence,
        },
        components
      );

      return {
        ...issue,
        title: localized.title,
        message: localized.message,
        recommendation: localized.recommendation ?? issue.recommendation,
        confidence,
        evidence: {
          ...evidence,
          confidence,
          evidenceSummary: evidence.evidenceSummary || localized.message,
          howToVerify: evidence.howToVerify ?? localized.recommendation,
        },
        relatedComponentLabels,
        relatedNetLabels,
        ...sourceBucketInfo,
      };
    });
  }, [appLanguage, audit.circuitAnalysis.nets, combinedIssues, components]);

  const confidenceCounts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.confidence] += 1;
        return acc;
      },
      {
        confirmed: 0,
        'strong-inference': 0,
        'needs-review': 0,
        informational: 0,
      } satisfies Record<ProjectAuditIssueConfidence, number>
    );
  }, [issues]);

  const sourceBucketCounts = useMemo(() => {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.sourceBucket] += 1;
        return acc;
      },
      {
        official: 0,
        partial: 0,
        generic: 0,
        fallback: 0,
        other: 0,
      } satisfies Record<ValidationDisplayIssue['sourceBucket'], number>
    );
  }, [issues]);

  const lowConfidenceImportReasons = useMemo(() => {
    if (!importedSchematicMode) {
      return [];
    }

    const reasons: string[] = [];
    if (!importedSchematicSource?.trim()) {
      reasons.push('원본 KiCad 소스가 없어 스냅샷 기반 판단이 섞입니다.');
    }
    if (integratedValidationJson) {
      reasons.push('legacy integrated validation 스냅샷을 함께 참고하고 있습니다.');
    }
    if (components.some(component => component.importedMapping && component.importedMapping.confidence !== 'high')) {
      reasons.push('일부 심볼이 low/medium confidence 매핑으로 해석되었습니다.');
    }

    return reasons;
  }, [components, importedSchematicMode, importedSchematicSource, integratedValidationJson]);

  return {
    audit,
    issues,
    confidenceCounts,
    sourceBucketCounts,
    importedSchematicMode,
    importedPalette,
    activeBoard,
    actionRequiredCount: confidenceCounts.confirmed + confidenceCounts['strong-inference'],
    reviewRequiredCount: confidenceCounts['needs-review'],
    informationCount: confidenceCounts.informational,
    hasLowConfidenceImport: lowConfidenceImportReasons.length > 0,
    lowConfidenceImportReasons,
  };
}
