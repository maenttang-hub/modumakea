'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Waves,
} from 'lucide-react';
import { useBoardStore } from '@/store/use-board-store';
import { getTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist, toSpiceNetlistFromAnalysis } from '@/lib/circuit-netlist';
import { describeReviewEngineMeta, describeSimulationEngine } from '@/lib/engine-honesty';
import { runSpice, type SpiceAnalysisMode, type SpiceResult, type SpiceTrace } from '@/lib/spice-simulator';
import { verifyCircuitCodeConsistencyAsync } from '@/lib/formal-verifier';
import { pickLanguage } from '@/lib/ui-language';
import type { FormalVerificationReport } from '@/types';

const ANALYSIS_OPTIONS: Array<{
  id: SpiceAnalysisMode;
  label: string;
  detail: string;
  directive: string;
}> = [
  { id: 'op', label: 'DC', detail: '정지 상태 전압', directive: '.op' },
  { id: 'tran', label: 'Transient', detail: '시간 변화 파형', directive: '.tran 0.05 1' },
  { id: 'ac', label: 'AC', detail: '주파수 미리보기', directive: '.ac lin 16 1 1000' },
];

function formatVoltage(value: number) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return `${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}V`;
}

function buildChartPath(points: Array<{ x: number; y: number }>, width: number, height: number, xMin: number, xMax: number, yMin: number, yMax: number) {
  if (points.length === 0) {
    return '';
  }

  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  return points
    .map((point, index) => {
      const x = ((point.x - xMin) / xSpan) * width;
      const y = height - ((point.y - yMin) / ySpan) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function TraceChart({ traces }: { traces: SpiceTrace[] }) {
  const visibleTraces = traces.slice(0, 4);

  const metrics = useMemo(() => {
    const allPoints = visibleTraces.flatMap(trace => trace.points);
    if (allPoints.length === 0) {
      return null;
    }

    const xValues = allPoints.map(point => point.x);
    const yValues = allPoints.map(point => point.y);

    return {
      xMin: Math.min(...xValues),
      xMax: Math.max(...xValues),
      yMin: Math.min(...yValues),
      yMax: Math.max(...yValues),
    };
  }, [visibleTraces]);

  if (!metrics) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-4 text-[11px] text-slate-500">
        표시할 파형이 아직 없습니다.
      </div>
    );
  }

  const width = 360;
  const height = 140;
  const traceColors = ['#60a5fa', '#34d399', '#fbbf24', '#c084fc'];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="mb-2 flex flex-wrap gap-2 text-[10px]">
        {visibleTraces.map((trace, index) => (
          <span
            key={trace.label}
            className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/70 px-2 py-1 text-slate-300"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: traceColors[index % traceColors.length] }} />
            {trace.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[140px] w-full rounded bg-[#090f18]">
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(148,163,184,0.12)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1="1" x2={width} y2="1" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        {visibleTraces.map((trace, index) => (
          <path
            key={trace.label}
            d={buildChartPath(trace.points, width, height, metrics.xMin, metrics.xMax, metrics.yMin, metrics.yMax)}
            fill="none"
            stroke={traceColors[index % traceColors.length]}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>x: {metrics.xMin.toFixed(2)} → {metrics.xMax.toFixed(2)}</span>
        <span>y: {metrics.yMin.toFixed(2)}V → {metrics.yMax.toFixed(2)}V</span>
      </div>
    </div>
  );
}

export function SimulationPanel() {
  const appLanguage = useBoardStore(state => state.appLanguage);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const components = useBoardStore(state => state.components);
  const manualConnections = useBoardStore(state => state.manualConnections);
  const generatedCode = useBoardStore(state => state.generatedCode);
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });

  const [analysisMode, setAnalysisMode] = useState<SpiceAnalysisMode>('op');
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunLabel, setLastRunLabel] = useState<string | null>(null);
  const [formalReport, setFormalReport] = useState<FormalVerificationReport | null>(null);
  const [simulationResult, setSimulationResult] = useState<SpiceResult | null>(null);

  const circuitAnalysis = useMemo(
    () => analyzeCircuitNetlist(components, activeBoardId, getTemplateById, manualConnections),
    [activeBoardId, components, manualConnections]
  );

  const selectedAnalysis = ANALYSIS_OPTIONS.find(option => option.id === analysisMode) ?? ANALYSIS_OPTIONS[0];
  const netlistText = useMemo(
    () =>
      toSpiceNetlistFromAnalysis(circuitAnalysis, {
        title: 'ModuMake review-first simulation',
        analysisDirective: selectedAnalysis.directive,
      }),
    [circuitAnalysis, selectedAnalysis.directive]
  );

  const runPipeline = useCallback(async () => {
    if (components.length === 0) {
      setError('먼저 보드와 부품을 배치해야 시뮬레이션 흐름을 볼 수 있습니다.');
      setSimulationResult(null);
      setFormalReport(null);
      return;
    }

    setIsRunning(true);
    setError(null);
    setProgress(4);

    try {
      const nextFormal = await verifyCircuitCodeConsistencyAsync({
        boardId: activeBoardId,
        code: generatedCode,
        components,
        resolveTemplate: getTemplateById,
        circuitAnalysis,
      });
      setFormalReport(nextFormal);
      setProgress(32);

      const nextSimulation = await runSpice(netlistText, {
        analysis: analysisMode,
        start: analysisMode === 'ac' ? 1 : 0,
        stop: analysisMode === 'ac' ? 1000 : 1,
        pointCount: analysisMode === 'tran' ? 24 : 16,
        onProgress: percent => {
          setProgress(Math.max(32, Math.min(100, 32 + percent * 0.68)));
        },
      });

      setSimulationResult(nextSimulation);
      setLastRunLabel(
        new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (nextError) {
      setSimulationResult(null);
      setError(nextError instanceof Error ? nextError.message : '시뮬레이션을 실행하지 못했습니다.');
    } finally {
      setProgress(100);
      setIsRunning(false);
    }
  }, [activeBoardId, analysisMode, circuitAnalysis, components, generatedCode, netlistText]);

  const formalErrorCount = formalReport?.issues.filter(issue => issue.severity === 'error').length ?? 0;
  const formalWarningCount = formalReport ? formalReport.issueCount - formalErrorCount : 0;
  const capacitorCount = circuitAnalysis.capacitors?.length ?? 0;
  const diodeCount = circuitAnalysis.diodes?.length ?? 0;
  const reviewEngineSummary = describeReviewEngineMeta(formalReport?.engineMeta, appLanguage);
  const simulationEngineSummary = describeSimulationEngine(simulationResult, appLanguage);

  return (
    <div data-mm-scope="simulation-panel" className="h-full overflow-y-auto bg-[#0d1117] p-4 font-mono text-xs text-slate-300">
      <div className="mb-4 flex items-center gap-2 border-b border-[#21262d] pb-3">
        <Cpu size={14} className="text-sky-300" />
        <span className="font-bold text-slate-200">{t('회로 리뷰 + 시뮬레이션 미리보기', 'Circuit review + simulation preview')}</span>
      </div>

      <div className="space-y-4">
        <div className="border border-sky-900/30 bg-sky-950/10 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Flow</div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
            {t(
              '먼저 코드/배선 리뷰 결과를 읽고, 같은 회로를 넷리스트로 바꾼 뒤, 그 넷을 시뮬레이션 미리보기로 확인합니다. 아직 실 ngspice WASM 단계는 아니므로, 여기 결과는 제작 전 판단을 돕는 리뷰용 출력으로 읽는 편이 정확합니다.',
              'The flow reads the code-and-wiring review first, then converts the same circuit into a netlist and runs a simulation preview. This is not full ngspice WASM yet, so treat the result as review-oriented guidance before build time.'
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <div className="border border-violet-900/30 bg-violet-950/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-200">
              {t('코드 리뷰 엔진', 'Code review engine')}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-slate-100">{reviewEngineSummary.title}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{reviewEngineSummary.body}</p>
          </div>
          <div className="border border-sky-900/30 bg-sky-950/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200">
              {t('시뮬레이션 경로', 'Simulation path')}
            </div>
            <div className="mt-2 text-[11px] font-semibold text-slate-100">{simulationEngineSummary.title}</div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{simulationEngineSummary.body}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2">
            <div className="text-slate-500">부품</div>
            <div className="font-bold text-slate-200">{components.length}</div>
          </div>
          <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2">
            <div className="text-slate-500">넷</div>
            <div className="font-bold text-slate-200">{circuitAnalysis.nets.length}</div>
          </div>
          <div className="border border-slate-800 bg-slate-950/40 px-2.5 py-2">
            <div className="text-slate-500">코드</div>
            <div className={generatedCode.trim() ? 'font-bold text-emerald-300' : 'font-bold text-slate-400'}>
              {generatedCode.trim() ? '있음' : '없음'}
            </div>
          </div>
        </div>

        <div className="border border-[#21262d] bg-[#0b1020] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Analysis Mode</div>
              <div className="mt-1 text-[11px] text-slate-400">{t('리뷰 → 넷리스트 → 시뮬레이션 미리보기를 지금 모드로 실행합니다.', 'Run the review -> netlist -> simulation preview flow in this mode.')}</div>
            </div>
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={isRunning}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 text-[11px] font-bold text-sky-100 transition-colors hover:border-sky-400/50 hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {isRunning ? t('실행 중...', 'Running...') : t('흐름 실행', 'Run flow')}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {ANALYSIS_OPTIONS.map(option => {
              const isActive = option.id === analysisMode;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAnalysisMode(option.id)}
                  className={`rounded border px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-sky-400/40 bg-sky-500/10 text-sky-100'
                      : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-bold">{option.label}</div>
                  <div className="mt-1 text-[10px] opacity-80">{option.detail}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900">
            <div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.max(4, progress)}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
            <span>{selectedAnalysis.label} · {selectedAnalysis.detail}</span>
            <span>{lastRunLabel ? t(`최근 실행 ${lastRunLabel}`, `Last run ${lastRunLabel}`) : t('아직 실행 전', 'Not run yet')}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div className="border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {formalReport?.analyzed ? <CheckCircle2 size={11} className="text-emerald-300" /> : <RefreshCw size={11} className="text-slate-500" />}
              {t('1. 코드 리뷰', '1. Code review')}
            </div>
            <div className="mt-3 text-[11px] text-slate-300">
              {formalReport ? t(`${formalReport.operationCount}개 코드 경로 분석`, `${formalReport.operationCount} code paths analyzed`) : t('아직 리뷰 전', 'Review not run yet')}
            </div>
            <div className="mt-2 flex gap-2 text-[10px]">
              <span className="rounded border border-red-950/40 bg-red-950/10 px-2 py-1 text-red-200">
                Error {formalErrorCount}
              </span>
              <span className="rounded border border-amber-950/40 bg-amber-950/10 px-2 py-1 text-amber-200">
                Warning {formalWarningCount}
              </span>
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Sparkles size={11} className="text-violet-300" />
              {t('2. 넷리스트', '2. Netlist')}
            </div>
            <div className="mt-3 text-[11px] text-slate-300">
              {t(`저항 ${circuitAnalysis.resistors.length} · 커패시터 ${capacitorCount} · 다이오드 ${diodeCount}`, `Resistors ${circuitAnalysis.resistors.length} · Capacitors ${capacitorCount} · Diodes ${diodeCount}`)}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {netlistText.trim().split('\n').length} lines generated
            </div>
          </div>

          <div className="border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Waves size={11} className="text-sky-300" />
              {t('3. 시뮬레이션 미리보기', '3. Simulation preview')}
            </div>
            <div className="mt-3 text-[11px] text-slate-300">
              {simulationResult ? `${simulationResult.backend} · ${simulationResult.analysis} · ${simulationResult.fidelity}` : t('아직 실행 전', 'Not run yet')}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {simulationResult ? t(`노드 ${Object.keys(simulationResult.nodeVoltages).length}개 해석`, `${Object.keys(simulationResult.nodeVoltages).length} nodes evaluated`) : t('실행 후 전압/파형 요약 표시', 'Voltage and waveform summary will appear after running')}
            </div>
          </div>
        </div>

        {error ? (
          <div className="border border-red-950/40 bg-red-950/10 p-3 text-[11px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="border border-[#21262d] bg-[#0b1020] p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <AlertTriangle size={11} className="text-amber-300" />
            넷리스트 미리보기
          </div>
          <pre className="max-h-[220px] overflow-auto rounded-md border border-slate-800 bg-slate-950/60 p-3 text-[10px] leading-relaxed text-slate-300">
            {netlistText}
          </pre>
        </div>

        {simulationResult ? (
          <>
            <div className="border border-[#21262d] bg-[#0b1020] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <Waves size={11} className="text-sky-300" />
                파형 요약
              </div>
              <TraceChart traces={simulationResult.traces} />
              {simulationResult.warnings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {simulationResult.warnings.map(warning => (
                    <div key={warning} className="rounded border border-amber-950/40 bg-amber-950/10 px-2.5 py-2 text-[10px] text-amber-200">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="border border-[#21262d] bg-[#0b1020] p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <Cpu size={11} className="text-emerald-300" />
                노드 전압
              </div>
              <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
                {Object.entries(simulationResult.nodeVoltages).map(([nodeId, voltage]) => (
                  <div key={nodeId} className="rounded border border-slate-800 bg-slate-950/40 px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">{nodeId}</div>
                    <div className="mt-1 text-[11px] font-bold text-slate-100">{formatVoltage(voltage)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
