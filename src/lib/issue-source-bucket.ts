import type {
  ImportedKiCadMapping,
  PlacedComponent,
  ProjectAuditIssue,
  ProjectAuditIssueSourceQuality,
} from '@/types';

export type IssueSourceBucket = 'official' | 'partial' | 'generic' | 'fallback' | 'other';

export interface IssueSourceBucketInfo {
  sourceBucket: IssueSourceBucket;
  sourceBucketLabel: string;
  sourceQuality?: ProjectAuditIssueSourceQuality;
  sourceQualityLabel?: string;
  mappingConfidence?: ImportedKiCadMapping['confidence'];
  mappingSource?: ImportedKiCadMapping['source'];
  lowConfidenceReasons: string[];
  isConservativeFinding: boolean;
}

function sourceQualityLabel(sourceQuality?: ProjectAuditIssueSourceQuality) {
  switch (sourceQuality) {
    case 'official-complete':
      return '공식 데이터시트';
    case 'official-partial':
      return '부분 공식 근거';
    case 'module-verified':
      return '모듈 검증';
    case 'generic-module':
      return '범용 모듈 추정';
    case 'needs-vendor-pin':
      return 'SKU 확인 필요';
    default:
      return undefined;
  }
}

function mappingSourceLabel(source?: ImportedKiCadMapping['source']) {
  switch (source) {
    case 'kicad-library':
      return 'KiCad 라이브러리';
    case 'refdes':
      return 'refdes 추정';
    case 'value-regex':
      return 'value 패턴 추정';
    case 'footprint-regex':
      return 'footprint 패턴 추정';
    case 'pin-shape':
      return 'pin shape 추정';
    case 'custom-fallback':
      return 'fallback 매핑';
    default:
      return undefined;
  }
}

function getIssueSourceBucket(input: {
  sourceQuality?: ProjectAuditIssueSourceQuality;
  mappingSource?: ImportedKiCadMapping['source'];
  mappingConfidence?: ImportedKiCadMapping['confidence'];
}) {
  if (input.mappingSource === 'custom-fallback' || input.mappingConfidence === 'low') {
    return {
      key: 'fallback' as const,
      label: 'fallback',
    };
  }

  if (input.sourceQuality === 'official-complete' || input.sourceQuality === 'module-verified') {
    return {
      key: 'official' as const,
      label: input.sourceQuality === 'module-verified' ? '모듈 검증' : '공식 근거',
    };
  }

  if (input.sourceQuality === 'official-partial') {
    return {
      key: 'partial' as const,
      label: 'partial',
    };
  }

  if (input.sourceQuality === 'generic-module' || input.sourceQuality === 'needs-vendor-pin' || input.mappingConfidence === 'medium') {
    return {
      key: 'generic' as const,
      label: input.sourceQuality === 'needs-vendor-pin' ? 'SKU 필요' : 'generic',
    };
  }

  return {
    key: 'other' as const,
    label: '기타',
  };
}

export function resolveIssueSourceBucketInfo(
  issue: ProjectAuditIssue,
  components: PlacedComponent[] = []
): IssueSourceBucketInfo {
  const evidence = issue.evidence;
  const relatedComponents = (evidence?.affectedComponents ?? issue.visualTargets?.componentIds ?? [])
    .map(componentId => components.find(component => component.instanceId === componentId))
    .filter((component): component is PlacedComponent => Boolean(component));
  const candidateMappings = relatedComponents
    .map(component => component.importedMapping)
    .filter((mapping): mapping is ImportedKiCadMapping => Boolean(mapping));
  const preferredMapping =
    candidateMappings.find(mapping => mapping.confidence === 'low') ??
    candidateMappings.find(mapping => mapping.source === 'custom-fallback') ??
    candidateMappings.find(mapping => mapping.confidence === 'medium') ??
    candidateMappings[0];

  const lowConfidenceReasons: string[] = [];
  if (evidence?.sourceQuality === 'generic-module') {
    lowConfidenceReasons.push('범용 모듈 기준으로 판단했습니다.');
  } else if (evidence?.sourceQuality === 'needs-vendor-pin') {
    lowConfidenceReasons.push('정확한 SKU/MPN이 없어 핀/전기 특성이 보수적으로 처리됐습니다.');
  } else if (evidence?.sourceQuality === 'official-partial') {
    lowConfidenceReasons.push('공식 자료는 있지만 일부 필드가 부분 확인 상태입니다.');
  }
  if (preferredMapping?.confidence === 'low') {
    lowConfidenceReasons.push('심볼 매핑이 low confidence입니다.');
  } else if (preferredMapping?.confidence === 'medium') {
    lowConfidenceReasons.push('심볼 매핑이 medium confidence입니다.');
  }
  if (preferredMapping?.source === 'custom-fallback') {
    lowConfidenceReasons.push('fallback 매핑 규칙으로 해석되었습니다.');
  }
  if (preferredMapping?.source && preferredMapping.source !== 'kicad-library' && preferredMapping.source !== 'custom-fallback') {
    const label = mappingSourceLabel(preferredMapping.source);
    if (label) {
      lowConfidenceReasons.push(`${label} 기준으로 매핑되었습니다.`);
    }
  }

  const dedupedLowConfidenceReasons = Array.from(new Set(lowConfidenceReasons));
  const sourceBucket = getIssueSourceBucket({
    sourceQuality: evidence?.sourceQuality,
    mappingSource: preferredMapping?.source,
    mappingConfidence: preferredMapping?.confidence,
  });

  return {
    sourceBucket: sourceBucket.key,
    sourceBucketLabel: sourceBucket.label,
    sourceQuality: evidence?.sourceQuality,
    sourceQualityLabel: sourceQualityLabel(evidence?.sourceQuality),
    mappingConfidence: preferredMapping?.confidence,
    mappingSource: preferredMapping?.source,
    lowConfidenceReasons: dedupedLowConfidenceReasons,
    isConservativeFinding: dedupedLowConfidenceReasons.length > 0,
  };
}
