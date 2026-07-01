'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImportedPcbViewer } from '@/components/dashboard/imported-pcb-viewer';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { runProjectStageDrc } from '@/lib/drc-engine';
import { buildEffectiveImportedPcbValidation } from '@/lib/effective-imported-pcb-validation';
import {
  mapKiCadPcbDrcReport,
  mergeImportedPcbValidationReports,
  validateImportedPcbDocument,
} from '@/lib/imported-pcb-validation';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import { buildPcbDocument } from '@/lib/pcb-document';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import type { AppLanguage, ImportedPcbValidationReport, PcbDocument, PcbPoint } from '@/types';
import { Box, CircuitBoard, Factory, Layers3, RefreshCw, ShieldAlert, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';

function formatCount(value: number, koUnit: string, enUnit: string, language: AppLanguage) {
  return pickLanguage(language, { ko: `${value}${koUnit}`, en: `${value} ${enUnit}` });
}

function countImportedPcbIssuesBySource(
  report: ImportedPcbValidationReport | null | undefined,
  source: 'kicad-cli' | 'modumake-pcb'
) {
  return report?.issues.filter(issue => issue.source === source).length ?? 0;
}

function summarizeImportedPcbFindings(
  report: ImportedPcbValidationReport | null | undefined,
  language: AppLanguage
) {
  if (!report) {
    return {
      label: pickLanguage(language, { ko: '검증 대기', en: 'Awaiting checks' }),
      toneClass: 'border-[#d8cbbb] bg-[#fffdf9]/92 text-[#5b4e42]',
    };
  }

  const kicadCount = countImportedPcbIssuesBySource(report, 'kicad-cli');
  const modumakeCount = countImportedPcbIssuesBySource(report, 'modumake-pcb');
  const hasKiCadDrc = report.checks.kicadDrc || kicadCount > 0;

  if (!hasKiCadDrc) {
    return {
      label: language === 'ko'
        ? `대표 사전점검 ${report.issueCount} · 검토 필요`
        : `${report.issueCount} representative pre-checks`,
      toneClass: report.issueCount > 0
        ? 'border-[#ece0c5] bg-[#fffdf7]/92 text-[#94641b]'
        : 'border-[#d7e6d9] bg-[#f8fff9]/92 text-[#34764a]',
    };
  }

  return {
    label: language === 'ko'
      ? `KiCad DRC ${kicadCount} · 사전점검 ${modumakeCount}`
      : `${kicadCount} KiCad DRC · ${modumakeCount} pre-checks`,
    toneClass: report.errorCount > 0
      ? 'border-[#efd3d3] bg-[#fff8f8]/92 text-[#b24f4f]'
      : report.warningCount > 0
        ? 'border-[#ece0c5] bg-[#fffdf7]/92 text-[#94641b]'
        : 'border-[#d7e6d9] bg-[#f8fff9]/92 text-[#34764a]',
  };
}

type KiCadPcbDrcResponse = {
  report?: unknown;
  error?: string;
  drcMode?: 'schematic-parity' | 'board-only';
  warnings?: string[];
};

function collectPcbPoints(document: PcbDocument): PcbPoint[] {
  return [
    ...document.outline.flatMap(segment => [segment.start, segment.end]),
    ...document.placements.flatMap(placement => [
      { x: placement.body.x, y: placement.body.y },
      { x: placement.body.x + placement.body.width, y: placement.body.y + placement.body.height },
      ...placement.pads.map(pad => pad.center),
    ]),
    ...document.traces.flatMap(trace => trace.points),
    ...document.vias.map(via => via.at),
    ...document.zones.flatMap(zone => zone.polygon),
    ...document.keepouts.flatMap(keepout => keepout.polygon),
  ].filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getPcbViewBox(document: PcbDocument) {
  const points = collectPcbPoints(document);
  if (points.length === 0) {
    return '-20 -20 520 340';
  }

  const minX = Math.min(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxX = Math.max(...points.map(point => point.x));
  const maxY = Math.max(...points.map(point => point.y));
  const width = Math.max(120, maxX - minX);
  const height = Math.max(90, maxY - minY);
  const padding = Math.max(28, Math.max(width, height) * 0.08);

  return [
    minX - padding,
    minY - padding,
    width + padding * 2,
    height + padding * 2,
  ].join(' ');
}

function layerStroke(layer: string) {
  if (layer === 'B.Cu') {
    return '#2f7fa7';
  }
  if (layer === 'Edge.Cuts') {
    return '#3f342c';
  }
  if (layer.includes('Silk')) {
    return '#4b4036';
  }
  return '#c76428';
}

function GeneratedPcbCanvas({
  document,
  emptyLabel,
}: {
  document: PcbDocument;
  emptyLabel: string;
}) {
  const viewBox = useMemo(() => getPcbViewBox(document), [document]);
  const hasGeometry = document.placements.length > 0 || document.traces.length > 0 || document.outline.length > 0;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f7f1e8]">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(#e6d9c5 1px, transparent 1px), linear-gradient(90deg, #e6d9c5 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      <svg
        data-testid="generated-pcb-svg"
        className="relative h-full w-full"
        viewBox={viewBox}
        role="img"
        aria-label="PCB workspace"
      >
        {document.zones.map(zone => (
          <polygon
            key={zone.id}
            points={zone.polygon.map(point => `${point.x},${point.y}`).join(' ')}
            fill={zone.purpose === 'ground-pour' ? '#4f8f651f' : '#c7642818'}
            stroke={layerStroke(zone.layer)}
            strokeWidth={0.5}
            opacity={0.75}
          />
        ))}
        {document.outline.map(segment => (
          <line
            key={segment.id}
            x1={segment.start.x}
            y1={segment.start.y}
            x2={segment.end.x}
            y2={segment.end.y}
            stroke="#3f342c"
            strokeWidth={1.8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {document.keepouts.map(keepout => (
          <polygon
            key={keepout.id}
            points={keepout.polygon.map(point => `${point.x},${point.y}`).join(' ')}
            fill="#b24f4f18"
            stroke="#b24f4f"
            strokeDasharray="4 4"
            strokeWidth={0.7}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {document.traces.map(trace => (
          <polyline
            key={trace.id}
            points={trace.points.map(point => `${point.x},${point.y}`).join(' ')}
            fill="none"
            stroke={layerStroke(trace.layer)}
            strokeWidth={Math.max(trace.width, 1.2)}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={trace.layer === 'B.Cu' ? 0.78 : 0.86}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {document.vias.map(via => (
          <g key={via.id}>
            <circle cx={via.at.x} cy={via.at.y} r={via.diameter / 2} fill="#a57019cc" stroke="#fffdfa" strokeWidth={0.7} />
            <circle cx={via.at.x} cy={via.at.y} r={via.drill / 2} fill="#fffdfa" />
          </g>
        ))}
        {document.placements.map(placement => (
          <g key={placement.id} opacity={placement.ownerType === 'board' ? 0.88 : 0.96}>
            <rect
              x={placement.body.x}
              y={placement.body.y}
              width={placement.body.width}
              height={placement.body.height}
              rx={4}
              fill={placement.ownerType === 'board' ? '#f3e6d7' : '#fffdf9'}
              stroke={placement.ownerType === 'board' ? '#b69d80' : '#7b6b5d'}
              strokeWidth={0.9}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={placement.body.x + placement.body.width / 2}
              y={placement.body.y + Math.min(18, placement.body.height / 2)}
              textAnchor="middle"
              fontSize={Math.max(8, Math.min(14, placement.body.height * 0.22))}
              fill="#4d4036"
            >
              {placement.ref}
            </text>
            {placement.pads.map(pad => (
              <rect
                key={pad.id}
                x={pad.center.x - pad.size.width / 2}
                y={pad.center.y - pad.size.height / 2}
                width={pad.size.width}
                height={pad.size.height}
                rx={pad.shape === 'circle' || pad.shape === 'oval' ? Math.min(pad.size.width, pad.size.height) / 2 : 0.5}
                fill={pad.netId ? '#c76428d9' : '#9ca3afcc'}
                stroke="#fffdfa"
                strokeWidth={0.4}
              />
            ))}
          </g>
        ))}
      </svg>
      {!hasGeometry ? (
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm font-semibold text-[#7f7265]">
          {emptyLabel}
        </div>
      ) : null}
    </div>
  );
}

export function PcbWorkspace() {
  const pcbFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPcbIssueId, setSelectedPcbIssueId] = useState<string | null>(null);
  const [isRunningKiCadDrc, setIsRunningKiCadDrc] = useState(false);
  const [lastKiCadDrcError, setLastKiCadDrcError] = useState<string | null>(null);
  const {
    workspaceMode,
    components,
    manualConnections,
    activeBoardId,
    importedSchematicScene,
    importedPcbDocument,
    importedPcbSource,
    importedPcbValidation,
    setImportedPcbDocument,
    setImportedPcbValidation,
    clearImportedPcbDocument,
    setWorkspaceMode,
    appLanguage,
  } = useBoardStore();
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const board = getBoardById(activeBoardId);
  const pcbDocument = useMemo(
    () => buildPcbDocument(components, activeBoardId, manualConnections),
    [components, activeBoardId, manualConnections]
  );
  const readiness = runProjectStageDrc({
    components,
    manualConnections,
    boardId: activeBoardId,
    resolveTemplate: getTemplateById,
  });
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
  const isManufacturing = workspaceMode === 'manufacturing';
  const activeStageReady = isManufacturing ? readiness.canEnterManufacturing : readiness.canEnterPcb;
  const activeStageReasons = isManufacturing ? readiness.manufacturingReasons : readiness.pcbReasons;
  const routedComponents = components.filter(component => component.isFullyRouted).length;
  const importedFindingSummary = useMemo(
    () => summarizeImportedPcbFindings(effectiveImportedPcbValidation, appLanguage),
    [appLanguage, effectiveImportedPcbValidation]
  );

  useEffect(() => {
    const handleIssueFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ issueId?: string | null }>).detail;
      setSelectedPcbIssueId(detail?.issueId ?? null);
    };

    window.addEventListener('modumake:pcb-issue-focus', handleIssueFocus as EventListener);
    return () => window.removeEventListener('modumake:pcb-issue-focus', handleIssueFocus as EventListener);
  }, []);

  const handleImportPcbFile = async (file: File) => {
    try {
      const source = await file.text();
      const document = parseKiCadPcb(source, { sourceFilename: file.name });
      const validation = validateImportedPcbDocument(document, {
        schematicParity: {
          components,
          manualConnections,
          importedSchematicScene,
          resolveTemplate: getTemplateById,
        },
      });
      setImportedPcbDocument(document, source, validation);
      setWorkspaceMode('pcb');
      setSelectedPcbIssueId(validation.issues[0]?.id ?? null);
      setLastKiCadDrcError(null);
      toast.success(t('KiCad PCB 파일을 불러왔습니다.', 'KiCad PCB loaded.'), {
        description: appLanguage === 'ko'
          ? `${document.stats.footprintCount}개 풋프린트 · ${document.stats.segmentCount}개 트랙 · 대표 사전점검 ${validation.issueCount}개`
          : `${document.stats.footprintCount} footprints · ${document.stats.segmentCount} tracks · ${validation.issueCount} representative pre-checks`,
      });
    } catch (error) {
      toast.error(t('PCB 파일을 읽지 못했습니다.', 'Could not read the PCB file.'), {
        description: error instanceof Error ? error.message : t('.kicad_pcb 파일인지 확인해 주세요.', 'Check that this is a .kicad_pcb file.'),
      });
    }
  };

  const handleRunKiCadDrc = async () => {
    if (!importedPcbDocument || !importedPcbSource) {
      toast.error(t('KiCad DRC를 실행할 PCB 원본이 없습니다.', 'No source PCB is available for KiCad DRC.'));
      return;
    }

    setIsRunningKiCadDrc(true);
    setLastKiCadDrcError(null);
    try {
      const response = await fetch('/api/kicad/pcb-drc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: importedPcbSource,
          filename: importedPcbDocument.sourceFilename ?? 'imported.kicad_pcb',
        }),
      });
      const payload = await response.json() as KiCadPcbDrcResponse;
      if (!response.ok || !payload.report) {
        throw new Error(payload.error || t('KiCad DRC 실행에 실패했습니다.', 'KiCad DRC failed.'));
      }

      const localReport = validateImportedPcbDocument(importedPcbDocument, {
        schematicParity: {
          components,
          manualConnections,
          importedSchematicScene,
          resolveTemplate: getTemplateById,
        },
      });
      const kicadReport = mapKiCadPcbDrcReport(payload.report, { drcMode: payload.drcMode });
      const merged = mergeImportedPcbValidationReports(localReport, kicadReport);
      setImportedPcbValidation(merged);
      setSelectedPcbIssueId(merged.issues[0]?.id ?? null);
      const findingSummary = appLanguage === 'ko'
        ? `오류 ${kicadReport.errorCount}개 · 경고 ${kicadReport.warningCount}개`
        : `${kicadReport.errorCount} errors · ${kicadReport.warningCount} warnings`;
      const cappedMarkerNote = kicadReport.issueCount > 240
        ? t('보드 마커는 우선순위순으로 일부만 표시됩니다.', 'Board markers are capped by priority.')
        : null;
      const boardOnlyNote = payload.drcMode === 'board-only'
        ? t('schematic parity는 생략되었습니다.', 'Schematic parity was skipped.')
        : null;
      const description = [findingSummary, boardOnlyNote, cappedMarkerNote, payload.warnings?.[0]]
        .filter(Boolean)
        .join(' · ');

      if (payload.drcMode === 'board-only') {
        toast.warning(t('KiCad board-only DRC를 반영했습니다.', 'KiCad board-only DRC applied.'), {
          description,
        });
      } else {
        toast.success(t('KiCad DRC 리포트를 반영했습니다.', 'KiCad DRC report applied.'), {
          description,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('KiCad DRC 실행 중 오류가 발생했습니다.', 'An error occurred while running KiCad DRC.');
      setLastKiCadDrcError(message);
      toast.error(t('KiCad DRC 실패', 'KiCad DRC failed'), { description: message });
    } finally {
      setIsRunningKiCadDrc(false);
    }
  };

  return (
    <div data-testid="pcb-workspace" className="relative h-full w-full overflow-hidden bg-[#f7f1e8] text-[#564a40]">
      <input
        ref={pcbFileInputRef}
        type="file"
        accept=".kicad_pcb,.pcb,text/plain"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportPcbFile(file);
          }
          currentTarget.value = '';
        }}
      />

      {importedPcbDocument ? (
        <ImportedPcbViewer
          key={`${importedPcbDocument.sourceFilename ?? 'pcb'}:${importedPcbDocument.importedAt}`}
          document={importedPcbDocument}
          validation={effectiveImportedPcbValidation}
          selectedIssueId={selectedPcbIssueId}
          onSelectIssue={setSelectedPcbIssueId}
          language={appLanguage}
        />
      ) : (
        <GeneratedPcbCanvas
          document={pcbDocument}
          emptyLabel={t('회로 파일을 선택하거나 KiCad PCB를 열어 PCB 검토를 시작하세요.', 'Select a schematic or open a KiCad PCB to start PCB review.')}
        />
      )}

      <div
        className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex max-w-[calc(100%-24px)] flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden pb-1 [scrollbar-width:none]"
        data-testid="pcb-workspace-top-controls"
      >
        <div className="pointer-events-auto flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/92 px-3 text-[11px] font-semibold text-[#43372f] shadow-sm backdrop-blur">
          {importedPcbDocument ? <Box size={14} className="text-[#6f5235]" /> : isManufacturing ? <Factory size={14} className="text-[#a57019]" /> : <CircuitBoard size={14} className="text-[#34764a]" />}
          <span className="max-w-[180px] truncate xl:max-w-[260px]">
            {importedPcbDocument
              ? importedPcbDocument.sourceFilename ?? 'imported.kicad_pcb'
              : isManufacturing
                ? t('출력물 검토 준비', 'Output review')
                : t('PCB 레이아웃', 'PCB layout')}
          </span>
        </div>

        <div
          className={`pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[11px] font-semibold shadow-sm backdrop-blur ${
            importedPcbDocument
              ? importedFindingSummary.toneClass
              : activeStageReady
                ? 'border-[#d7e6d9] bg-[#f8fff9]/92 text-[#34764a]'
                : 'border-[#efd3d3] bg-[#fff8f8]/92 text-[#b24f4f]'
          }`}
        >
          {importedPcbDocument ? importedFindingSummary.label : activeStageReady ? t('단계 진입 가능', 'Stage ready') : t('점검 필요', 'Needs review')}
        </div>

        <button
          type="button"
          onClick={() => pcbFileInputRef.current?.click()}
          className="pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/92 px-3 text-[11px] font-semibold text-[#5b4e42] shadow-sm transition hover:bg-white"
          title={importedPcbDocument ? t('다른 PCB', 'Open another PCB') : t('KiCad PCB 열기', 'Open KiCad PCB')}
          aria-label={importedPcbDocument ? t('다른 PCB', 'Open another PCB') : t('KiCad PCB 열기', 'Open KiCad PCB')}
        >
          <Upload size={13} />
          <span className="hidden xl:inline">
            {importedPcbDocument ? t('다른 PCB', 'Open another PCB') : t('KiCad PCB 열기', 'Open KiCad PCB')}
          </span>
        </button>

        {importedPcbDocument ? (
          <>
            <button
              type="button"
              onClick={() => {
                void handleRunKiCadDrc();
              }}
              disabled={isRunningKiCadDrc || !importedPcbSource}
              className="pointer-events-auto flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#c9b494] bg-[#6f5235] px-3 text-[11px] font-semibold text-[#fff6eb] shadow-sm transition hover:bg-[#5f452c] disabled:cursor-not-allowed disabled:opacity-60"
              title={importedPcbSource ? t('KiCad DRC', 'KiCad DRC') : t('원본 PCB 파일이 없어 실행할 수 없습니다.', 'Cannot run without the original PCB source.')}
              aria-label={importedPcbSource ? t('KiCad DRC', 'KiCad DRC') : t('원본 PCB 파일이 없어 실행할 수 없습니다.', 'Cannot run without the original PCB source.')}
            >
              <RefreshCw size={13} className={isRunningKiCadDrc ? 'animate-spin' : ''} />
              <span className="hidden xl:inline">
                {isRunningKiCadDrc ? t('DRC 실행 중', 'Running DRC') : 'KiCad DRC'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                clearImportedPcbDocument();
                setSelectedPcbIssueId(null);
                setWorkspaceMode('schematic');
              }}
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#efd3d3] bg-[#fff8f8]/92 text-[#b24f4f] shadow-sm transition hover:bg-white"
              title={t('가져온 PCB 닫기', 'Close imported PCB')}
              aria-label={t('가져온 PCB 닫기', 'Close imported PCB')}
            >
              <XCircle size={14} />
            </button>
          </>
        ) : null}
      </div>

      {!importedPcbDocument ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex flex-wrap justify-end gap-2 text-[10px] font-semibold text-[#67594d]">
          <span className="rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            {board.name}
          </span>
          <span className="rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            <Layers3 size={11} className="mr-1 inline" />
            {formatCount(pcbDocument.layers.length, '개 레이어', 'layers', appLanguage)}
          </span>
          <span className="rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            {formatCount(pcbDocument.nets.length, '개 넷', 'nets', appLanguage)}
          </span>
          <span className="rounded-[10px] border border-[#d8cbbb] bg-[#fffdf9]/90 px-2.5 py-1.5 shadow-sm backdrop-blur">
            {t('배선 완료', 'Routed')} {routedComponents}/{components.length}
          </span>
        </div>
      ) : null}

      {activeStageReasons.length > 0 && !importedPcbDocument ? (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[min(560px,calc(100%-24px))] rounded-[10px] border border-[#efd3d3] bg-[#fff8f8]/92 px-3 py-2 text-[11px] leading-5 text-[#b24f4f] shadow-sm backdrop-blur">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldAlert size={13} />
            {isManufacturing ? t('출력 단계 잠금', 'Output locked') : t('PCB 단계 점검 필요', 'PCB stage needs review')}
          </div>
          {activeStageReasons.slice(0, 2).map(reason => (
            <div key={reason}>{reason}</div>
          ))}
        </div>
      ) : null}

      {lastKiCadDrcError ? (
        <div className="absolute bottom-3 left-3 z-20 max-w-[min(620px,calc(100%-24px))] rounded-[10px] border border-[#efd3d3] bg-[#fff8f8] px-3 py-2 text-[11px] leading-5 text-[#b24f4f] shadow-lg">
          {lastKiCadDrcError}
        </div>
      ) : null}
    </div>
  );
}
