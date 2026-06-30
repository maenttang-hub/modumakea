import type { AppLanguage, PlacedComponent, ProjectAuditIssue } from '@/types';
import type { DrcEngineReport } from '@/lib/drc-engine';
import { translateEngineIssue } from '@/lib/engine-i18n';
import {
  buildSchematicPcbAugmentationCandidates,
  schematicPcbAugmentationDirectionLabel,
  type SchematicPcbAugmentationCandidate,
} from '@/lib/schematic-pcb-augmentation-candidates';
import { pickLanguage } from '@/lib/ui-language';
import {
  classifyIssueActionBucket,
  countIssueSeverities,
  resolveIssueConfidence,
} from '@/lib/validation-issue-classification';

export type VerificationReportStatus = 'passed' | 'warning' | 'critical';

export interface ProjectVerificationReportInput {
  projectName: string;
  boardId: string;
  audit: DrcEngineReport;
  components: PlacedComponent[];
  language: AppLanguage;
  generatedAt?: Date;
  issues?: ProjectAuditIssue[];
}

export interface ProjectVerificationReport {
  reportId: string;
  status: VerificationReportStatus;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  markdown: string;
  filenameBase: string;
}

function normalizeFilename(value: string) {
  const normalized = value
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'modumake-project';
}

function formatDate(value: Date, language: AppLanguage) {
  return new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function buildReportId(projectName: string, generatedAt: Date) {
  const day = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, '0'),
    String(generatedAt.getDate()).padStart(2, '0'),
  ].join('');
  const hash = Array.from(projectName || 'modumake')
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 0xffff, 2166)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');

  return `MM-${day}-${hash}`;
}

function isFormalIssue(issue: ProjectAuditIssue) {
  return issue.ruleId?.startsWith('formal.') || issue.code?.startsWith('formal.');
}

function isPowerGroundCircuitIssue(issue: ProjectAuditIssue) {
  const identity = [issue.ruleId, issue.code].filter(Boolean).join(' ').toLowerCase();
  const fallbackText = [issue.title, issue.message].filter(Boolean).join(' ').toLowerCase();
  const text = identity || fallbackText;

  return /\b(power|ground|gnd|short|rail|regulator|vcc|vdd|vin|vbat|polarity)\b/.test(text) ||
    /전원|접지|그라운드|쇼트|합선|레일|레귤레이터|극성/.test(text);
}

function buildCircuitReviewSummaryLine(
  issues: ProjectAuditIssue[],
  language: AppLanguage
) {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  if (issues.length === 0) {
    return `- ${t('전원/GND', 'Power/GND')}: ${t('정상', 'Pass')}`;
  }

  if (issues.some(isPowerGroundCircuitIssue)) {
    return `- ${t('전원/GND', 'Power/GND')}: ${t('추가 확인 필요', 'Needs review')}`;
  }

  const firstIssueTitle = translateEngineIssue(issues[0], language).title;
  return `- ${t('회로 해석', 'Circuit analysis')}: ${t('추가 확인 필요', 'Needs review')} (${firstIssueTitle})`;
}

function summarizeStatus(status: VerificationReportStatus, language: AppLanguage) {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });

  if (status === 'critical') {
    return t('수정 필요', 'Fix required');
  }

  if (status === 'warning') {
    return t('검토 필요', 'Review required');
  }

  return t('검토 통과', 'Review clear');
}

function issueLocation(issue: ProjectAuditIssue, language: AppLanguage) {
  const parts = [
    issue.line ? pickLanguage(language, { ko: `코드 ${issue.line}번 줄`, en: `Line ${issue.line}` }) : null,
    issue.componentName,
    issue.boardPin ? pickLanguage(language, { ko: `핀 ${issue.boardPin}`, en: `Pin ${issue.boardPin}` }) : null,
    issue.operation,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' / ') : pickLanguage(language, { ko: '프로젝트 전체', en: 'Project-wide' });
}

function confidenceBadge(issue: ProjectAuditIssue, language: AppLanguage) {
  const confidence = resolveIssueConfidence(issue);

  switch (confidence) {
    case 'confirmed':
      return pickLanguage(language, { ko: '확정 오류', en: 'Confirmed issue' });
    case 'strong-inference':
      return pickLanguage(language, { ko: '강한 근거', en: 'High-confidence finding' });
    case 'needs-review':
      return pickLanguage(language, { ko: '검토 권장', en: 'Review recommended' });
    default:
      return pickLanguage(language, { ko: '참고 정보', en: 'Informational' });
  }
}

function buildIssueBlock(issue: ProjectAuditIssue, index: number, language: AppLanguage) {
  const translated = translateEngineIssue(issue, language);
  const recommendation = translated.recommendation ?? issue.recommendation;
  const evidence = issue.evidence;
  const evidenceSummary = evidence?.evidenceSummary ?? translated.message;
  const observedFacts = evidence?.observedFacts?.slice(0, 2) ?? [];
  const assumptions = evidence?.assumptions?.slice(0, 2) ?? [];

  return [
    `${index}. [${confidenceBadge(issue, language)}] ${translated.title}`,
    `   - ${pickLanguage(language, { ko: '위치', en: 'Location' })}: ${issueLocation(issue, language)}`,
    `   - ${pickLanguage(language, { ko: '근거', en: 'Evidence' })}: ${evidenceSummary}`,
    observedFacts.length > 0 ? `   - ${pickLanguage(language, { ko: '관찰 사실', en: 'Observed facts' })}: ${observedFacts.join(' / ')}` : null,
    `   - ${pickLanguage(language, { ko: '영향', en: 'Impact' })}: ${translated.message}`,
    recommendation ? `   - ${pickLanguage(language, { ko: '수정 방법', en: 'How to fix' })}: ${recommendation}` : null,
    assumptions.length > 0 ? `   - ${pickLanguage(language, { ko: '가정', en: 'Assumptions' })}: ${assumptions.join(' / ')}` : null,
  ].filter(Boolean).join('\n');
}

function buildAugmentationCandidateBlock(
  candidate: SchematicPcbAugmentationCandidate,
  index: number,
  language: AppLanguage
) {
  return [
    `${index}. [${schematicPcbAugmentationDirectionLabel(candidate.direction)}] ${candidate.title}`,
    `   - ${pickLanguage(language, { ko: '대상', en: 'Target' })}: ${candidate.targetLabel}`,
    `   - ${pickLanguage(language, { ko: '근거', en: 'Evidence' })}: ${candidate.description}`,
    `   - ${pickLanguage(language, { ko: '보강 후보', en: 'Candidate action' })}: ${candidate.suggestedAction}`,
    `   - ${pickLanguage(language, { ko: '상태', en: 'Status' })}: ${pickLanguage(language, { ko: '자동 반영 안 함', en: 'Not auto-applied' })}`,
  ].join('\n');
}

function buildPowerSummary(audit: DrcEngineReport, language: AppLanguage) {
  const rails = audit.powerReport.rails;
  const regulators = audit.powerReport.regulators;
  const totalCurrent = rails.reduce((sum, rail) => sum + (Number.isFinite(rail.usedMa) ? rail.usedMa : 0), 0);
  const worstRegulator = regulators
    .slice()
    .sort((a, b) => b.dissipationW / Math.max(b.safeLimitW, 0.001) - a.dissipationW / Math.max(a.safeLimitW, 0.001))[0];

  if (rails.length === 0 && !worstRegulator) {
    return pickLanguage(language, {
      ko: '전원 레일 분석 데이터가 아직 충분하지 않습니다.',
      en: 'Power rail analysis data is not available yet.',
    });
  }

  const lines = [
    `${pickLanguage(language, { ko: 'System Peak Current', en: 'System Peak Current' })}: ${Math.round(totalCurrent)}mA (estimated)`,
    `${pickLanguage(language, { ko: '전원 레일 수', en: 'Power rails reviewed' })}: ${rails.length}`,
  ];

  if (worstRegulator) {
    lines.push(
      `${pickLanguage(language, { ko: 'Thermal Dissipation', en: 'Thermal Dissipation' })}: ${worstRegulator.label} ${worstRegulator.dissipationW}W / ${worstRegulator.safeLimitW}W (${worstRegulator.status})`
    );
  }

  return lines.join('\n');
}

export function buildProjectVerificationReport(input: ProjectVerificationReportInput): ProjectVerificationReport {
  const generatedAt = input.generatedAt ?? new Date();
  const reportIssues = input.issues ?? input.audit.issues;
  const severityCounts = countIssueSeverities(reportIssues);
  const errorCount = severityCounts.error;
  const warningCount = severityCounts.warning;
  const infoCount = severityCounts.info;
  const status: VerificationReportStatus = errorCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'passed';
  const reportId = buildReportId(input.projectName, generatedAt);
  const t = (ko: string, en: string) => pickLanguage(input.language, { ko, en });

  const formalIssues = reportIssues.filter(isFormalIssue);
  const drcIssues = reportIssues.filter(issue => !isFormalIssue(issue));
  const mustFixIssues = reportIssues.filter(issue => classifyIssueActionBucket(issue) === 'must-fix');
  const reviewIssues = reportIssues.filter(issue => classifyIssueActionBucket(issue) === 'review');
  const highPriorityIssues = [...mustFixIssues, ...reviewIssues].slice(0, 8);
  const augmentationCandidates = buildSchematicPcbAugmentationCandidates(reportIssues);
  const totalComponents = input.components.length;
  const recognizedComponents = Math.max(totalComponents - input.audit.partialCount - input.audit.genericCount, 0);
  const verificationLimitedCount = input.audit.partialCount + input.audit.genericCount;
  const formalCriticalCount = formalIssues.filter(issue => classifyIssueActionBucket(issue) === 'must-fix').length;
  const pcbIssueCount = reportIssues.filter(issue => issue.ruleId?.startsWith('pcb.') || issue.code?.startsWith('pcb.')).length;
  const reviewSummaryLines = [
    mustFixIssues[0] ? `- ${t('즉시 수정 필요', 'Immediate fix')}: ${translateEngineIssue(mustFixIssues[0], input.language).title}` : null,
    reviewIssues[0] ? `- ${t('확인 권장', 'Review next')}: ${translateEngineIssue(reviewIssues[0], input.language).title}` : null,
    buildCircuitReviewSummaryLine(input.audit.circuitAnalysis.issues, input.language),
  ].filter(Boolean);
  const limitations = [
    pcbIssueCount > 0
      ? t(
          '가져온 PCB의 형상, 넷 연속성, 제조성 관련 점검 결과를 함께 반영했습니다. 제조사별 공정값과 실제 생산 조건은 별도 확인이 필요합니다.',
          'Imported PCB geometry, net-continuity, and manufacturability-related findings are included. Manufacturer-specific process limits and production conditions still need separate review.'
        )
      : t(
          '이 리포트는 schematic/netlist 기준 자동 검증 결과이며 실제 PCB trace 길이와 copper area는 반영하지 않습니다.',
          'This report is generated from schematic and netlist analysis and does not yet include real PCB trace length or copper area.'
        ),
    verificationLimitedCount > 0
      ? t(
          `일부 부품 ${verificationLimitedCount}개는 partial/generic 인식 상태라 보수적으로 판정했습니다.`,
          `${verificationLimitedCount} components were only partially or generically recognized, so their findings are intentionally conservative.`
        )
      : null,
    input.audit.formalVerification.engineMeta?.parserTier === 'structured-review'
      ? t('코드-회로 정합성은 구조화 리뷰 파서 기준이며, 완전한 형식 증명 단계는 아닙니다.', 'Code-to-circuit consistency currently uses the structured review parser and is not a full formal-proof pipeline.')
      : input.audit.formalVerification.engineMeta?.parserTier === 'pattern-fallback'
        ? t('코드-회로 정합성은 패턴 기반 폴백 파서를 사용해 복잡한 구문은 수동 확인이 필요합니다.', 'Code-to-circuit consistency is using the pattern fallback parser, so complex syntax still needs manual confirmation.')
        : null,
  ].filter(Boolean);

  const markdown = [
    `# ${t('ModuMake 회로 리뷰 리포트', 'ModuMake Circuit Review Report')}`,
    `${t('회로 검토 및 실물 제작 전 확인 리포트', 'Circuit Review and Build-Readiness Report')}`,
    '',
    `Project Name: ${input.projectName || 'Untitled Project'}`,
    `Target Board / MCU: ${input.boardId}`,
    `Analysis Date: ${formatDate(generatedAt, input.language)}`,
    `Engine Version: ${input.audit.engineId}`,
    `Report ID: ${reportId}`,
    '',
    `## 1. ${t('검토 결론', 'Review Decision')}`,
    '',
    `${t('검토 상태', 'Review status')}: ${summarizeStatus(status, input.language)}`,
    `${t('반드시 수정', 'Must fix')}: ${mustFixIssues.length}`,
    `${t('확인 권장', 'Review recommended')}: ${reviewIssues.length}`,
    `${t('통과', 'Passed checks')}: ${input.audit.verifiedCount}`,
    `${t('검증 제한', 'Verification limits')}: ${verificationLimitedCount}`,
    `${t('이슈 집계', 'Issue counts')}: ${errorCount} error / ${warningCount} warning / ${infoCount} info`,
    '',
    reviewSummaryLines.join('\n'),
    '',
    `## 2. ${t('반드시 수정', 'Must Fix')}`,
    '',
    mustFixIssues.length > 0
      ? mustFixIssues.map((issue, index) => buildIssueBlock(issue, index + 1, input.language)).join('\n\n')
      : t('현재 자동 검증 기준에서 즉시 수정해야 할 차단 이슈는 없습니다.', 'No blocking issue requires an immediate fix in the current automated review.'),
    '',
    `## 3. ${t('확인 권장', 'Review Recommended')}`,
    '',
    reviewIssues.length > 0
      ? reviewIssues.map((issue, index) => buildIssueBlock(issue, index + 1, input.language)).join('\n\n')
      : t('현재 검토 권장 항목은 없습니다.', 'There are no review-only items in the current report.'),
    '',
    `## 4. ${t('회로도 ↔ PCB 보강 후보', 'Schematic ↔ PCB Augmentation Candidates')}`,
    '',
    augmentationCandidates.length > 0
      ? augmentationCandidates.map((candidate, index) => buildAugmentationCandidateBlock(candidate, index + 1, input.language)).join('\n\n')
      : t('현재 회로도와 PCB 사이에서 자동 보강 후보로 분리할 항목은 없습니다. 자동 변경은 수행하지 않았습니다.', 'No schematic/PCB augmentation candidate is separated in this report. No automatic change was applied.'),
    '',
    `## 5. ${t('전원 / GND 분석', 'Power / GND Analysis')}`,
    '',
    buildPowerSummary(input.audit, input.language),
    '',
    `## 6. ${t('컴포넌트 인식 결과', 'Component Recognition')}`,
    '',
    `${t('전체 부품', 'Total components')}: ${totalComponents}`,
    `${t('정상 인식', 'Recognized')}: ${recognizedComponents}`,
    `${t('부분 인식', 'Partial')}: ${input.audit.partialCount}`,
    `${t('일반화 인식', 'Generic')}: ${input.audit.genericCount}`,
    '',
    `## 7. ${t('코드-회로 크로스 검증', 'Code-to-Circuit Cross-Check')}`,
    '',
    formalIssues.length > 0
      ? formalIssues.map((issue, index) => buildIssueBlock(issue, index + 1, input.language)).join('\n\n')
      : t('No code-to-circuit conflicts were detected in the current review.', 'No code-to-circuit conflicts were detected in the current review.'),
    '',
    `${t('코드 차단 이슈', 'Blocking code findings')}: ${formalCriticalCount}`,
    `${t('코드 검토 항목', 'Code review findings')}: ${Math.max(formalIssues.length - formalCriticalCount, 0)}`,
    '',
    `## 8. ${t('룰 엔진 / DRC 세부 이슈', 'Rule Engine / DRC Findings')}`,
    '',
    drcIssues.length > 0
      ? drcIssues.slice(0, 12).map((issue, index) => buildIssueBlock(issue, index + 1, input.language)).join('\n\n')
      : t('No datasheet or DRC findings are blocking the current design.', 'No datasheet or DRC findings are blocking the current design.'),
    '',
    `## 9. ${t('수정 체크리스트', 'Action Checklist')}`,
    '',
    highPriorityIssues.length > 0
      ? highPriorityIssues.map((issue, index) => {
          const translated = translateEngineIssue(issue, input.language);
          const priority = classifyIssueActionBucket(issue) === 'must-fix'
            ? t('즉시 수정', 'Immediate fix')
            : t('확인 후 결정', 'Review before build');
          return `${index + 1}. [${priority}] ${translated.recommendation ?? issue.recommendation ?? translated.message}`;
        }).join('\n')
      : `1. [Low] ${t('Keep the design reviewed before moving to PCB or manufacturing.', 'Keep the design reviewed before moving to PCB or manufacturing.')}`,
    '',
    `## 10. ${t('검증 한계 / 가정 / 엔진 정보', 'Limits / Assumptions / Engine Notes')}`,
    '',
    ...limitations.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');

  return {
    reportId,
    status,
    errorCount,
    warningCount,
    infoCount,
    markdown,
    filenameBase: `${normalizeFilename(input.projectName)}-${reportId.toLowerCase()}-verification-report`,
  };
}
