import type { ProjectAuditIssue } from '@/types';

export type SchematicPcbAugmentationDirection =
  | 'schematic-to-pcb'
  | 'pcb-to-schematic'
  | 'manual-review';

export interface SchematicPcbAugmentationCandidate {
  id: string;
  direction: SchematicPcbAugmentationDirection;
  title: string;
  targetLabel: string;
  description: string;
  suggestedAction: string;
  sourceIssue: ProjectAuditIssue;
}

function issueIdentity(issue: ProjectAuditIssue) {
  return [issue.ruleId, issue.code].filter(Boolean).join(' ');
}

export function isSchematicPcbAugmentationIssue(issue: ProjectAuditIssue) {
  const identity = issueIdentity(issue);
  return (
    identity.includes('PCB_SCHEMATIC_MISSING_FOOTPRINT') ||
    identity.includes('PCB_SCHEMATIC_EXTRA_FOOTPRINT') ||
    identity.includes('PCB_SCHEMATIC_NET_MISSING')
  );
}

function targetLabel(issue: ProjectAuditIssue) {
  return issue.componentName ?? issue.evidence?.affectedNets?.[0] ?? issue.visualTargets?.netIds?.[0] ?? '프로젝트 전체';
}

function buildCandidate(issue: ProjectAuditIssue, index: number): SchematicPcbAugmentationCandidate | null {
  const identity = issueIdentity(issue);
  const target = targetLabel(issue);

  if (identity.includes('PCB_SCHEMATIC_MISSING_FOOTPRINT')) {
    return {
      id: `schematic-to-pcb:${target}:${index}`,
      direction: 'schematic-to-pcb',
      title: 'PCB에 footprint 추가 후보',
      targetLabel: target,
      description: `${target}은 회로도에는 있지만 PCB footprint로 확인되지 않았습니다.`,
      suggestedAction: 'PCB를 회로도에서 다시 업데이트하거나, footprint assignment를 확인한 뒤 PCB에 반영할 후보로 기록하세요.',
      sourceIssue: issue,
    };
  }

  if (identity.includes('PCB_SCHEMATIC_EXTRA_FOOTPRINT')) {
    return {
      id: `pcb-to-schematic:${target}:${index}`,
      direction: 'pcb-to-schematic',
      title: '회로도 보강 또는 예외 처리 후보',
      targetLabel: target,
      description: `${target}은 PCB에는 있지만 현재 회로도 import 상태에서는 대응 부품을 찾지 못했습니다.`,
      suggestedAction: '전기 부품이면 회로도에 반영할 후보로 남기고, 테스트패드/기구물이라면 예외 항목으로 분류하세요.',
      sourceIssue: issue,
    };
  }

  if (identity.includes('PCB_SCHEMATIC_NET_MISSING')) {
    return {
      id: `schematic-net-to-pcb:${target}:${index}`,
      direction: 'schematic-to-pcb',
      title: 'PCB net 반영 후보',
      targetLabel: target,
      description: `${target} net은 회로도 연결 정보에는 있지만 PCB net table에서는 확인되지 않았습니다.`,
      suggestedAction: 'net label 변경, pin-pad mapping, Update PCB from Schematic 결과를 확인한 뒤 PCB net 보강 후보로 기록하세요.',
      sourceIssue: issue,
    };
  }

  return null;
}

export function buildSchematicPcbAugmentationCandidates(
  issues: ProjectAuditIssue[]
): SchematicPcbAugmentationCandidate[] {
  return issues
    .map(buildCandidate)
    .filter((candidate): candidate is SchematicPcbAugmentationCandidate => Boolean(candidate));
}

export function schematicPcbAugmentationDirectionLabel(direction: SchematicPcbAugmentationDirection) {
  switch (direction) {
    case 'schematic-to-pcb':
      return '회로도 → PCB';
    case 'pcb-to-schematic':
      return 'PCB → 회로도';
    default:
      return '수동 검토';
  }
}
