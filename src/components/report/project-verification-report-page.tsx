'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, CircleHelp, Download, FileText, Printer, ShieldAlert } from 'lucide-react';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { runProjectDrc, type DrcEngineReport } from '@/lib/drc-engine';
import { translateEngineIssue } from '@/lib/engine-i18n';
import { exportReportElementAsPdf } from '@/lib/export-report-pdf';
import { buildProjectVerificationReport } from '@/lib/project-verification-report';
import { pickLanguage } from '@/lib/ui-language';
import { setRuntimeCustomComponentPackages } from '@/lib/custom-component-registry';
import { setRuntimeTemplateCache } from '@/lib/template-cache-registry';
import {
  classifyIssueActionBucket,
  resolveIssueConfidence,
  type ReviewActionBucket,
} from '@/lib/validation-issue-classification';
import { buildDefaultProjectState } from '@/store/store-defaults';
import { REPORT_WORKSPACE_SNAPSHOT_KEY, WORKSPACE_STORAGE_KEY } from '@/store/store-config';
import type {
  AppLanguage,
  ComponentTemplate,
  CustomComponentPackage,
  ImportedSchematicScene,
  ManualNetConnection,
  PlacedComponent,
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
  ProjectAuditIssueEvidence,
  ProjectComponentPowerModes,
  ProjectComponentUnusedPinModes,
  ProjectPowerInputMode,
} from '@/types';

type ActionBucket = ReviewActionBucket;

type ReportWorkspaceSnapshot = {
  projectName: string;
  appLanguage: AppLanguage;
  activeBoardId: string;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicSource: string | null;
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes: ProjectComponentPowerModes;
  componentUnusedPinModes: ProjectComponentUnusedPinModes;
  generatedCode: string;
  footprintPinPadOverrideCache: Record<string, unknown>;
  templateCache: Record<string, ComponentTemplate>;
  customComponentPackages: CustomComponentPackage[];
};

function applyReportRuntimeCaches(snapshot: ReportWorkspaceSnapshot) {
  setRuntimeTemplateCache(snapshot.templateCache);
  setRuntimeCustomComponentPackages(snapshot.customComponentPackages);
}

function classifyIssue(issue: ProjectAuditIssue): ActionBucket {
  return classifyIssueActionBucket(issue);
}

function confidenceLabel(confidence: ProjectAuditIssueConfidence, t: (ko: string, en: string) => string) {
  switch (confidence) {
    case 'confirmed':
      return t('확정 오류', 'Confirmed issue');
    case 'strong-inference':
      return t('강한 근거', 'High-confidence finding');
    case 'needs-review':
      return t('검토 권장', 'Review recommended');
    default:
      return t('참고 정보', 'Informational');
  }
}

function confidenceTone(confidence: ProjectAuditIssueConfidence) {
  switch (confidence) {
    case 'confirmed':
      return 'border-[#efcfcf] bg-[#fff6f5] text-[#a94040]';
    case 'strong-inference':
      return 'border-[#ecd7b7] bg-[#fff9ef] text-[#9b6615]';
    case 'needs-review':
      return 'border-[#d7e4f1] bg-[#f7fbff] text-[#456e9e]';
    default:
      return 'border-[#d9e5d9] bg-[#f8fff8] text-[#3d6d47]';
  }
}

function displayBoardName(boardName: string, t: (ko: string, en: string) => string) {
  return boardName === 'Imported schematic'
    ? t('가져온 회로도', 'Imported schematic')
    : boardName;
}

function severityLabel(severity: ProjectAuditIssue['severity'], t: (ko: string, en: string) => string) {
  if (severity === 'error') {
    return t('오류', 'Error');
  }

  if (severity === 'warning') {
    return t('경고', 'Warning');
  }

  return t('정보', 'Info');
}

function sectionMeta(bucket: ActionBucket, t: (ko: string, en: string) => string) {
  if (bucket === 'must-fix') {
    return {
      title: t('반드시 수정', 'Must Fix'),
      description: t('PCB 주문 전에 먼저 정리해야 하는 항목입니다.', 'Resolve these before sending the design to fabrication.'),
      icon: <ShieldAlert size={14} className="text-[#a94040]" />,
    };
  }
  if (bucket === 'review') {
    return {
      title: t('확인 권장', 'Review Recommended'),
      description: t('데이터시트, 모듈 스펙, 실제 PCB 문맥과 함께 확인하는 편이 안전합니다.', 'Review these with the datasheet, module spec, or PCB context before build.'),
      icon: <CircleHelp size={14} className="text-[#456e9e]" />,
    };
  }
  return {
    title: t('참고 정보', 'Informational'),
    description: t('결론을 바꾸지는 않지만 같이 남겨두는 항목입니다.', 'Helpful context that does not currently block fabrication.'),
    icon: <CheckCircle2 size={14} className="text-[#3d6d47]" />,
  };
}

function issueLocation(issue: ProjectAuditIssue, t: (ko: string, en: string) => string) {
  const parts = [
    issue.line ? t(`코드 ${issue.line}번 줄`, `Line ${issue.line}`) : null,
    issue.componentName,
    issue.boardPin ? t(`핀 ${issue.boardPin}`, `Pin ${issue.boardPin}`) : null,
    issue.operation,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' / ') : t('프로젝트 전체', 'Project-wide');
}

function formatGeneratedAt(value: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function readWorkspaceSnapshot(): ReportWorkspaceSnapshot {
  const defaults = buildDefaultProjectState();
  if (typeof window === 'undefined') {
    return {
      projectName: defaults.projectName,
      appLanguage: defaults.appLanguage,
      activeBoardId: defaults.activeBoardId,
      components: defaults.components,
      manualConnections: defaults.manualConnections,
      importedSchematicScene: defaults.importedSchematicScene,
      importedSchematicSource: defaults.importedSchematicSource,
      powerInputMode: defaults.powerInputMode,
      componentPowerModes: defaults.componentPowerModes,
      componentUnusedPinModes: defaults.componentUnusedPinModes,
      generatedCode: defaults.generatedCode,
      footprintPinPadOverrideCache: defaults.footprintPinPadOverrideCache,
      templateCache: defaults.templateCache,
      customComponentPackages: defaults.customComponentPackages,
    };
  }

  const raw =
    window.localStorage.getItem(REPORT_WORKSPACE_SNAPSHOT_KEY) ??
    window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) {
    const snapshot = {
      projectName: defaults.projectName,
      appLanguage: defaults.appLanguage,
      activeBoardId: defaults.activeBoardId,
      components: defaults.components,
      manualConnections: defaults.manualConnections,
      importedSchematicScene: defaults.importedSchematicScene,
      importedSchematicSource: defaults.importedSchematicSource,
      powerInputMode: defaults.powerInputMode,
      componentPowerModes: defaults.componentPowerModes,
      componentUnusedPinModes: defaults.componentUnusedPinModes,
      generatedCode: defaults.generatedCode,
      footprintPinPadOverrideCache: defaults.footprintPinPadOverrideCache,
      templateCache: defaults.templateCache,
      customComponentPackages: defaults.customComponentPackages,
    };
    applyReportRuntimeCaches(snapshot);
    return snapshot;
  }

  try {
    const parsed = JSON.parse(raw) as { state?: Partial<ReportWorkspaceSnapshot> };
    const state = parsed.state ?? {};
    const snapshot = {
      projectName: state.projectName ?? defaults.projectName,
      appLanguage: state.appLanguage ?? defaults.appLanguage,
      activeBoardId: state.activeBoardId ?? defaults.activeBoardId,
      components: state.components ?? defaults.components,
      manualConnections: state.manualConnections ?? defaults.manualConnections,
      importedSchematicScene: state.importedSchematicScene ?? defaults.importedSchematicScene,
      importedSchematicSource: state.importedSchematicSource ?? defaults.importedSchematicSource,
      powerInputMode: state.powerInputMode ?? defaults.powerInputMode,
      componentPowerModes: state.componentPowerModes ?? defaults.componentPowerModes,
      componentUnusedPinModes: state.componentUnusedPinModes ?? defaults.componentUnusedPinModes,
      generatedCode: state.generatedCode ?? defaults.generatedCode,
      footprintPinPadOverrideCache: state.footprintPinPadOverrideCache ?? defaults.footprintPinPadOverrideCache,
      templateCache: state.templateCache ?? defaults.templateCache,
      customComponentPackages: state.customComponentPackages ?? defaults.customComponentPackages,
    };
    applyReportRuntimeCaches(snapshot);
    return snapshot;
  } catch {
    const snapshot = {
      projectName: defaults.projectName,
      appLanguage: defaults.appLanguage,
      activeBoardId: defaults.activeBoardId,
      components: defaults.components,
      manualConnections: defaults.manualConnections,
      importedSchematicScene: defaults.importedSchematicScene,
      importedSchematicSource: defaults.importedSchematicSource,
      powerInputMode: defaults.powerInputMode,
      componentPowerModes: defaults.componentPowerModes,
      componentUnusedPinModes: defaults.componentUnusedPinModes,
      generatedCode: defaults.generatedCode,
      footprintPinPadOverrideCache: defaults.footprintPinPadOverrideCache,
      templateCache: defaults.templateCache,
      customComponentPackages: defaults.customComponentPackages,
    };
    applyReportRuntimeCaches(snapshot);
    return snapshot;
  }
}

export function ProjectVerificationReportPage() {
  const searchParams = useSearchParams();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const autoDownloadRef = useRef(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [workspace, setWorkspace] = useState<ReportWorkspaceSnapshot | null>(null);
  const generatedAt = useMemo(() => new Date(), []);
  const t = (ko: string, en: string) => pickLanguage(workspace?.appLanguage ?? 'ko', { ko, en });
  const locale = (workspace?.appLanguage ?? 'ko') === 'ko' ? 'ko-KR' : 'en-US';

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWorkspace(readWorkspaceSnapshot());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const audit = useMemo<DrcEngineReport | null>(() => {
    if (!workspace) {
      return null;
    }

    return runProjectDrc({
      components: workspace.components,
      manualConnections: workspace.manualConnections,
      boardId: workspace.activeBoardId,
      resolveTemplate: getTemplateById,
      importedSchematicScene: workspace.importedSchematicScene,
      powerInputMode: workspace.powerInputMode,
      componentPowerModes: workspace.componentPowerModes,
      componentUnusedPinModes: workspace.componentUnusedPinModes,
      generatedCode: workspace.generatedCode,
      footprintPinPadOverrideCache: workspace.footprintPinPadOverrideCache as Record<string, never>,
    });
  }, [workspace]);

  const issues = useMemo<ProjectAuditIssue[]>(() => {
    if (!audit || !workspace) {
      return [];
    }

    return audit.issues.map(issue => {
      const localized = translateEngineIssue(issue, workspace.appLanguage);
      const confidence = resolveIssueConfidence(issue);
      const evidence: ProjectAuditIssueEvidence = issue.evidence ?? {
        confidence,
        evidenceSummary: localized.message,
        observedFacts: [],
        assumptions: confidence === 'needs-review'
          ? [pickLanguage(workspace.appLanguage, {
              ko: '모듈 SKU 또는 원본 데이터시트 맥락에 따라 판단이 달라질 수 있습니다.',
              en: 'The conclusion can vary with the exact module SKU or original datasheet context.',
            })]
          : [],
        checkedBy: ['netlist'],
        affectedComponents: issue.visualTargets?.componentIds,
        affectedNets: issue.visualTargets?.netIds,
        howToVerify: localized.recommendation,
      };

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
      };
    });
  }, [audit, workspace]);

  const verificationReport = useMemo(
    () =>
      workspace && audit
        ? buildProjectVerificationReport({
            projectName: workspace.projectName,
            boardId: workspace.activeBoardId,
            audit,
            components: workspace.components,
            language: workspace.appLanguage,
            generatedAt,
          })
        : null,
    [audit, generatedAt, workspace]
  );

  const board = useMemo(() => getBoardById(workspace?.activeBoardId ?? 'uno'), [workspace?.activeBoardId]);
  const mustFixIssues = useMemo(() => issues.filter(issue => classifyIssue(issue) === 'must-fix'), [issues]);
  const reviewIssues = useMemo(() => issues.filter(issue => classifyIssue(issue) === 'review'), [issues]);
  const infoIssues = useMemo(() => issues.filter(issue => classifyIssue(issue) === 'info'), [issues]);
  const formalIssues = useMemo(
    () => issues.filter(issue => issue.ruleId?.startsWith('formal.') || issue.code?.startsWith('formal.')),
    [issues]
  );
  const recognizedComponents = Math.max((workspace?.components.length ?? 0) - (audit?.partialCount ?? 0) - (audit?.genericCount ?? 0), 0);
  const verificationLimits = (audit?.partialCount ?? 0) + (audit?.genericCount ?? 0);
  const readinessLabel = !verificationReport
    ? t('리포트 준비 중', 'Preparing report')
    : verificationReport.status === 'critical'
      ? t('수정 필요', 'Fix required')
      : verificationReport.status === 'warning'
        ? t('검토 필요', 'Review required')
        : t('주문 가능', 'Ready for fabrication');

  const handleDownloadPdf = useCallback(async () => {
    if (!reportRef.current || isExportingPdf || !verificationReport) {
      return;
    }

    setIsExportingPdf(true);
    try {
      await exportReportElementAsPdf(reportRef.current, verificationReport.filenameBase);
    } finally {
      setIsExportingPdf(false);
    }
  }, [isExportingPdf, verificationReport]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCloseReport = useCallback(() => {
    if (window.opener) {
      window.close();
      return;
    }

    window.history.back();
  }, []);

  useEffect(() => {
    if (searchParams.get('download') !== 'pdf' || autoDownloadRef.current || !verificationReport) {
      return;
    }

    autoDownloadRef.current = true;
    const timer = window.setTimeout(() => {
      void handleDownloadPdf();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [handleDownloadPdf, searchParams, verificationReport]);

  if (!workspace || !audit || !verificationReport) {
    return (
      <div className="min-h-screen bg-[#efe7da] px-4 py-10 text-[#302821] [font-family:Apple_SD_Gothic_Neo,AppleGothic,Malgun_Gothic,'Noto_Sans_KR','Segoe_UI',sans-serif]">
        <div className="mx-auto max-w-[760px] rounded-[24px] border border-[#d9cebf] bg-[#fffaf3] px-6 py-8">
          <div className="text-[12px] uppercase tracking-[0.16em] text-[#8b7866]">{t('리포트 준비 중', 'Preparing report')}</div>
          <div className="mt-2 text-[18px] font-semibold text-[#3a2f28]">
            {t('저장된 워크스페이스를 읽어 리포트를 만드는 중입니다.', 'Loading the saved workspace and preparing the report view.')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efe7da] text-[#302821] [font-family:Apple_SD_Gothic_Neo,AppleGothic,Malgun_Gothic,'Noto_Sans_KR','Segoe_UI',sans-serif]">
      <div className="sticky top-0 z-20 border-b border-[#d8cdbf] bg-[rgba(247,240,231,0.94)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b7866]">
              <FileText size={13} />
              {t('리포트 전용 보기', 'Report-only view')}
            </div>
            <div className="mt-1 text-[15px] font-semibold text-[#3a2f28]">
              {workspace.projectName || t('회로 리뷰 리포트', 'Circuit review report')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCloseReport}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d8cdbf] bg-white px-3 text-[12px] font-semibold text-[#5f5145] transition hover:bg-[#fcfaf6]"
            >
              <ArrowLeft size={13} />
              {t('창 닫기', 'Close')}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#d8cdbf] bg-white px-3 text-[12px] font-semibold text-[#5f5145] transition hover:bg-[#fcfaf6]"
            >
              <Printer size={13} />
              {t('인쇄', 'Print')}
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isExportingPdf}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#c9b494] bg-[#6f5235] px-3 text-[12px] font-semibold text-[#fff6eb] transition hover:bg-[#5f452c] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Download size={13} />
              {isExportingPdf ? t('PDF 생성 중...', 'Building PDF...') : t('PDF 저장', 'Download PDF')}
            </button>
          </div>
        </div>
      </div>

      <main className="px-4 py-6">
        <div ref={reportRef} className="mx-auto w-full max-w-[980px] rounded-[28px] border border-[#d9cebf] bg-[#f8f2e8] p-5 shadow-[0_28px_80px_rgba(78,58,36,0.12)] md:p-8">
          <section className="overflow-hidden rounded-[24px] border border-[#d8cdbf] bg-[linear-gradient(135deg,#fbf7f0_0%,#efe5d8_100%)]">
            <div className="grid gap-6 px-5 py-6 md:grid-cols-[1.35fr_0.9fr] md:px-7 md:py-7">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e7b68]">
                  {t('ModuMake 회로 리뷰 리포트', 'ModuMake Circuit Review Report')}
                </div>
                <h1 className="mt-2 text-[28px] font-semibold leading-tight text-[#312720] md:text-[34px]">
                  {workspace.projectName || t('이름 없는 프로젝트', 'Untitled Project')}
                </h1>
                <p className="mt-2 text-[13px] leading-6 text-[#64574d]">
                  {t('PCB 제작 전 검증 보고서', 'Pre-Fabrication Circuit Review Report')}
                </p>

                <div className="mt-5 grid gap-3 text-[12px] text-[#4f4339] md:grid-cols-2">
                  <div className="rounded-[16px] border border-[#ddd2c4] bg-[rgba(255,255,255,0.52)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('프로젝트', 'Project')}</div>
                    <div className="mt-1 font-semibold">{workspace.projectName || t('이름 없는 프로젝트', 'Untitled Project')}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#ddd2c4] bg-[rgba(255,255,255,0.52)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('대상 보드 / MCU', 'Target Board / MCU')}</div>
                    <div className="mt-1 font-semibold">{displayBoardName(board.name, t)}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#ddd2c4] bg-[rgba(255,255,255,0.52)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('분석 시각', 'Analysis Date')}</div>
                    <div className="mt-1 font-semibold">{formatGeneratedAt(generatedAt, locale)}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#ddd2c4] bg-[rgba(255,255,255,0.52)] px-4 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('엔진 버전', 'Engine Version')}</div>
                    <div className="mt-1 font-semibold">{audit.engineId}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[#d7c8b6] bg-[#fffaf3] px-5 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8e7b68]">
                  {t('제작 전 결론', 'Pre-Fabrication Decision')}
                </div>
                <div className={`mt-3 inline-flex rounded-full px-3 py-1 text-[12px] font-semibold ${
                  verificationReport.status === 'critical'
                    ? 'bg-[#fde8e7] text-[#aa4742]'
                    : verificationReport.status === 'warning'
                      ? 'bg-[#fff2d7] text-[#9a6616]'
                      : 'bg-[#e8f6ea] text-[#2f6b3d]'
                }`}>
                  {readinessLabel}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-[16px] border border-[#eadfd1] bg-[#fffdfa] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('반드시 수정', 'Must fix')}</div>
                    <div className="mt-1 text-[20px] font-semibold text-[#322821]">{mustFixIssues.length}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#eadfd1] bg-[#fffdfa] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('확인 권장', 'Review recommended')}</div>
                    <div className="mt-1 text-[20px] font-semibold text-[#322821]">{reviewIssues.length}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#eadfd1] bg-[#fffdfa] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('통과', 'Passed checks')}</div>
                    <div className="mt-1 text-[20px] font-semibold text-[#322821]">{audit.verifiedCount}</div>
                  </div>
                  <div className="rounded-[16px] border border-[#eadfd1] bg-[#fffdfa] px-3 py-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('검증 제한', 'Verification limits')}</div>
                    <div className="mt-1 text-[20px] font-semibold text-[#322821]">{verificationLimits}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-[18px] border border-[#e3d7c8] bg-[#fffaf3] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('오류', 'Errors')}</div>
              <div data-testid="report-error-count" className="mt-2 text-[24px] font-semibold text-[#a94040]">{verificationReport.errorCount}</div>
            </div>
            <div className="rounded-[18px] border border-[#e3d7c8] bg-[#fffaf3] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('경고', 'Warnings')}</div>
              <div data-testid="report-warning-count" className="mt-2 text-[24px] font-semibold text-[#9b6615]">{verificationReport.warningCount}</div>
            </div>
            <div className="rounded-[18px] border border-[#e3d7c8] bg-[#fffaf3] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('코드-회로 검증', 'Code cross-check')}</div>
              <div className="mt-2 text-[24px] font-semibold text-[#456e9e]">{formalIssues.length}</div>
            </div>
            <div className="rounded-[18px] border border-[#e3d7c8] bg-[#fffaf3] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('컴포넌트', 'Components')}</div>
              <div className="mt-2 text-[24px] font-semibold text-[#3d6d47]">{workspace.components.length}</div>
            </div>
          </section>

          {([
            ['must-fix', mustFixIssues],
            ['review', reviewIssues],
            ['info', infoIssues],
          ] as const).map(([bucket, bucketIssues]) => {
            if (bucketIssues.length === 0) {
              return null;
            }

            const meta = sectionMeta(bucket, t);
            return (
              <section key={bucket} className="mt-5 rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{meta.icon}</div>
                  <div>
                    <h2 className="text-[18px] font-semibold text-[#322821]">{meta.title}</h2>
                    <p className="mt-1 text-[12px] leading-6 text-[#6c5d50]">{meta.description}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {bucketIssues.map((issue, index) => {
                    const confidence = resolveIssueConfidence(issue);
                    const facts = issue.evidence?.observedFacts ?? [];
                    const assumptions = issue.evidence?.assumptions ?? [];
                    return (
                      <article key={`${issue.ruleId ?? issue.code ?? issue.title}-${index}`} className="rounded-[18px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${confidenceTone(confidence)}`}>
                            {confidenceLabel(confidence, t)}
                          </span>
                          <span className="rounded-full bg-[#efe5d8] px-2.5 py-1 text-[10px] font-semibold text-[#6d5c4f]">
                            {severityLabel(issue.severity, t)}
                          </span>
                        </div>
                        <h3 className="mt-3 text-[16px] font-semibold text-[#382d26]">
                          {issue.componentName ? `${issue.componentName} - ${issue.title}` : issue.title}
                        </h3>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="rounded-[14px] border border-[#e8ded2] bg-white px-3.5 py-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('위치', 'Location')}</div>
                            <div className="mt-2 text-[12px] leading-6 text-[#4d4137]">{issueLocation(issue, t)}</div>
                          </div>
                          <div className="rounded-[14px] border border-[#e8ded2] bg-white px-3.5 py-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('근거', 'Evidence')}</div>
                            <div className="mt-2 text-[12px] leading-6 text-[#4d4137]">{issue.evidence?.evidenceSummary ?? issue.message}</div>
                          </div>
                          <div className="rounded-[14px] border border-[#e8ded2] bg-white px-3.5 py-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('영향', 'Impact')}</div>
                            <div className="mt-2 text-[12px] leading-6 text-[#4d4137]">{issue.message}</div>
                          </div>
                          <div className="rounded-[14px] border border-[#e8ded2] bg-white px-3.5 py-3">
                            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('수정 방법', 'How to fix')}</div>
                            <div className="mt-2 text-[12px] leading-6 text-[#4d4137]">
                              {issue.recommendation ?? t('관련 데이터시트와 회로 연결을 함께 검토하세요.', 'Review the datasheet and schematic context together.')}
                            </div>
                          </div>
                        </div>

                        {(facts.length > 0 || assumptions.length > 0) ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <div className="rounded-[14px] border border-[#e8ded2] bg-[#fffcf7] px-3.5 py-3">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('관찰 사실', 'Observed facts')}</div>
                              <div className="mt-2 space-y-1.5 text-[12px] leading-6 text-[#4d4137]">
                                {facts.length > 0 ? facts.map((item, itemIndex) => <div key={`${item}-${itemIndex}`}>- {item}</div>) : <div>{t('별도 관찰 사실 없음', 'No extra observed facts')}</div>}
                              </div>
                            </div>
                            <div className="rounded-[14px] border border-[#e8ded2] bg-[#fffcf7] px-3.5 py-3">
                              <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('가정', 'Assumptions')}</div>
                              <div className="mt-2 space-y-1.5 text-[12px] leading-6 text-[#4d4137]">
                                {assumptions.length > 0 ? assumptions.map((item, itemIndex) => <div key={`${item}-${itemIndex}`}>- {item}</div>) : <div>{t('추가 가정 없음', 'No extra assumptions')}</div>}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
              <h2 className="text-[18px] font-semibold text-[#322821]">{t('전원 / GND 분석', 'Power / GND Analysis')}</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('레일 개수', 'Rails reviewed')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{audit.powerReport.rails.length}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('레귤레이터', 'Regulators')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{audit.powerReport.regulators.length}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('회로 전원 이슈', 'Power issues')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{audit.circuitAnalysis.issues.length}</div>
                </div>
              </div>

              {audit.powerReport.rails.length > 0 ? (
                <div className="mt-4 overflow-hidden rounded-[16px] border border-[#e7dccf]">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-[#f4ecdf] text-[#6d5c4f]">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t('레일', 'Rail')}</th>
                        <th className="px-3 py-2 font-semibold">{t('사용', 'Used')}</th>
                        <th className="px-3 py-2 font-semibold">{t('예산', 'Budget')}</th>
                        <th className="px-3 py-2 font-semibold">{t('여유', 'Headroom')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white text-[#463a31]">
                      {audit.powerReport.rails.map(rail => (
                        <tr key={rail.rail} className="border-t border-[#eee3d5]">
                          <td className="px-3 py-2 font-medium">{rail.rail}</td>
                          <td className="px-3 py-2">{rail.usedMa}mA</td>
                          <td className="px-3 py-2">{rail.budgetMa ?? '-'}mA</td>
                          <td className="px-3 py-2">{rail.headroomMa ?? '-'}mA</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

            <div className="rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
              <h2 className="text-[18px] font-semibold text-[#322821]">{t('컴포넌트 인식 결과', 'Component Recognition')}</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('전체', 'Total')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{workspace.components.length}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('정상 인식', 'Recognized')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{recognizedComponents}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('부분 인식', 'Partial')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{audit.partialCount}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('일반화 인식', 'Generic')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{audit.genericCount}</div>
                </div>
              </div>

              <div className="mt-4 rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-4 text-[12px] leading-6 text-[#52463b]">
                {verificationLimits > 0
                  ? t(
                      `현재 ${verificationLimits}개 부품은 partial/generic 인식 상태라 보수적으로 판정했습니다.`,
                      `${verificationLimits} components were only partially or generically recognized, so their findings stay conservative.`
                    )
                  : t('현재 검증에서는 인식 제한이 크게 보이지 않습니다.', 'No major recognition limitation is showing in the current review.')}
              </div>
            </div>
          </section>

          <section className="mt-5 grid gap-5 md:grid-cols-2">
            <div className="rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
              <h2 className="text-[18px] font-semibold text-[#322821]">{t('코드-회로 크로스 검증', 'Code-to-Circuit Cross-Check')}</h2>
              <div className="mt-4 space-y-3">
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('총 코드 이슈', 'Total code findings')}</div>
                  <div className="mt-1 text-[18px] font-semibold text-[#352b24]">{formalIssues.length}</div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('코드 파일 상태', 'Code source')}</div>
                  <div className="mt-1 text-[12px] leading-6 text-[#52463b]">
                    {workspace.generatedCode?.trim()
                      ? t('코드 입력이 있어 회로와 교차 검증했습니다.', 'Code was present and cross-checked against the schematic.')
                      : t('아직 코드 입력이 없어 회로 기반 결과 위주로 표시합니다.', 'No code was present, so this report is mostly schematic-driven.')}
                  </div>
                </div>
                <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('파서 단계', 'Parser tier')}</div>
                  <div className="mt-1 text-[12px] leading-6 text-[#52463b]">
                    {audit.formalVerification.engineMeta?.parserTier ?? 'none'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
              <h2 className="text-[18px] font-semibold text-[#322821]">{t('수정 체크리스트', 'Action Checklist')}</h2>
              <div className="mt-4 space-y-2 text-[12px] leading-6 text-[#4c4036]">
                {mustFixIssues.concat(reviewIssues).slice(0, 8).map((issue, index) => (
                  <div key={`${issue.ruleId ?? issue.code ?? issue.title}-check-${index}`} className="rounded-[14px] border border-[#e7dccf] bg-[#fcfaf6] px-3.5 py-3">
                    <div className="font-semibold text-[#352b24]">
                      {index + 1}. {issue.recommendation ?? issue.title}
                    </div>
                    <div className="mt-1 text-[#6d5c4f]">{issueLocation(issue, t)}</div>
                  </div>
                ))}
                {mustFixIssues.length + reviewIssues.length === 0 ? (
                  <div className="rounded-[14px] border border-[#d9e5d9] bg-[#f7fff7] px-3.5 py-3 text-[#3d6d47]">
                    {t('현재 자동 검증 기준에서 바로 막히는 수정 항목은 없습니다.', 'There is no blocking action item in the current automated review.')}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-[22px] border border-[#ddd1c2] bg-[#fffdf8] px-5 py-5">
            <h2 className="text-[18px] font-semibold text-[#322821]">{t('검증 한계 / 가정 / 엔진 정보', 'Limits / Assumptions / Engine Notes')}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-4 text-[12px] leading-6 text-[#52463b]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('PCB 반영 범위', 'PCB coverage')}</div>
                <div className="mt-2">
                  {t('현재 리포트는 schematic/netlist 기준이며 실제 trace 길이, copper area, 배치 열 분산은 직접 반영하지 않습니다.', 'This report is schematic/netlist-driven and does not directly model final trace length, copper area, or placement thermal spread.')}
                </div>
              </div>
              <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-4 text-[12px] leading-6 text-[#52463b]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('입력 품질', 'Input quality')}</div>
                <div className="mt-2">
                  {workspace.importedSchematicSource?.trim()
                    ? t('원본 KiCad 소스를 기준으로 검증했습니다.', 'The report was generated with original KiCad source available.')
                    : t('원본 KiCad 소스 없이 저장된 워크스페이스 상태를 기준으로 검증했습니다.', 'The report was generated from the saved workspace state without original KiCad source text.')}
                </div>
              </div>
              <div className="rounded-[16px] border border-[#e7dccf] bg-[#fcfaf6] px-4 py-4 text-[12px] leading-6 text-[#52463b]">
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#8b7866]">{t('코드 파서', 'Code parser')}</div>
                <div className="mt-2">
                  {audit.formalVerification.engineMeta?.parserTier === 'structured-review'
                    ? t('코드-회로 정합성은 구조화 리뷰 파서 기준입니다. 위험 경로 추적은 가능하지만 완전한 형식 증명 단계는 아닙니다.', 'Code-to-circuit consistency is using the structured review parser. It can trace risky paths, but this is not a full formal-proof pipeline.')
                    : audit.formalVerification.engineMeta?.parserTier === 'pattern-fallback'
                      ? t('코드 검증은 패턴 기반 폴백 단계라 복잡한 구문은 수동 확인이 필요합니다.', 'Code review is currently using the pattern fallback parser, so complex syntax still needs manual confirmation.')
                      : t('코드 파서 정보가 충분하지 않습니다.', 'Code parser information is limited for this report.')}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
