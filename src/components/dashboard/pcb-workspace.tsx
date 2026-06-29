'use client';

import { useMemo } from 'react';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { runProjectDrc, runProjectStageDrc } from '@/lib/drc-engine';
import { buildPcbDocument } from '@/lib/pcb-document';
import { useBoardStore } from '@/store/use-board-store';
import {
  Box,
  CheckCircle2,
  Factory,
  GitBranch,
  Layers3,
  Lock,
  Map,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  SquareStack,
} from 'lucide-react';
import { toast } from 'sonner';

function formatPointLabel(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) {
    return 'route unavailable';
  }

  const first = points[0];
  const last = points[points.length - 1];
  return `${Math.round(first.x)},${Math.round(first.y)} → ${Math.round(last.x)},${Math.round(last.y)}`;
}

export function PcbWorkspace() {
  const {
    workspaceMode,
    components,
    manualConnections,
    activeBoardId,
    importedSchematicScene,
    componentPowerModes,
    componentUnusedPinModes,
    generatedCode,
    footprintPinPadOverrideCache,
    setWorkspaceMode,
  } = useBoardStore();
  const board = getBoardById(activeBoardId);
  const pcbDocument = useMemo(
    () => buildPcbDocument(components, activeBoardId, manualConnections),
    [components, activeBoardId, manualConnections]
  );
  const componentPlacements = pcbDocument.placements.filter(placement => placement.ownerType === 'component');
  const routedComponents = components.filter(component => component.isFullyRouted);

  const isManufacturing = workspaceMode === 'manufacturing';
  const readiness = runProjectStageDrc({
    components,
    manualConnections,
    boardId: activeBoardId,
    resolveTemplate: getTemplateById,
  });
  const audit = runProjectDrc({
    components,
    manualConnections,
    boardId: activeBoardId,
    resolveTemplate: getTemplateById,
    importedSchematicScene,
    componentPowerModes,
    componentUnusedPinModes,
    generatedCode,
    footprintPinPadOverrideCache,
  });
  const activeStageReady = isManufacturing ? readiness.canEnterManufacturing : readiness.canEnterPcb;
  const activeStageReasons = isManufacturing ? readiness.manufacturingReasons : readiness.pcbReasons;
  const manufacturingLocked = !readiness.canEnterManufacturing;

  return (
    <div className="h-full w-full bg-[#0b1020] text-slate-300 overflow-hidden flex flex-col">
      <div
        className="h-10 px-4 flex items-center justify-between border-b"
        style={{ background: '#0d1117', borderColor: '#21262d' }}
      >
        <div className="flex items-center gap-2">
          {isManufacturing ? (
            <Factory size={15} className="text-[#38bdf8]" />
          ) : (
            <Box size={15} className="text-[#22c55e]" />
          )}
          <span className="text-xs font-bold">
            {isManufacturing ? 'Manufacturing Output' : 'PCB Layout Preparation'}
          </span>
        </div>
        <button
          onClick={() => {
            if (isManufacturing) {
              setWorkspaceMode('pcb');
              return;
            }

            if (manufacturingLocked) {
              toast.warning('제조 단계는 아직 잠겨 있습니다.', {
                description: readiness.manufacturingReasons.slice(0, 3).join(' / '),
              });
              return;
            }

            setWorkspaceMode('manufacturing');
          }}
          className="h-7 px-3 text-[11px] font-bold border transition-colors"
          style={{
            background: isManufacturing ? '#0d1117' : manufacturingLocked ? '#111827' : '#12301f',
            borderColor: isManufacturing ? '#334155' : manufacturingLocked ? '#7f1d1d' : '#22c55e80',
            color: isManufacturing ? '#94a3b8' : manufacturingLocked ? '#fca5a5' : '#bbf7d0',
            cursor: isManufacturing || !manufacturingLocked ? 'pointer' : 'not-allowed',
          }}
          title={manufacturingLocked ? readiness.manufacturingReasons[0] : undefined}
        >
          {isManufacturing ? 'PCB로 돌아가기' : manufacturingLocked ? '제조 잠금' : '제조 파일 준비'}
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(280px,360px)_1fr]">
        <div className="border-r border-[#21262d] bg-[#080e1d] p-4 overflow-y-auto">
          <div className="space-y-3">
            <div className="border border-[#21262d] bg-[#0d1117] p-3">
              <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">PCB Document</div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Target board</span>
                  <span className="font-bold text-slate-200">{board.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Placed objects</span>
                  <span className="font-bold text-[#22c55e]">{pcbDocument.placements.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Routed nets</span>
                  <span className="font-bold text-[#38bdf8]">{pcbDocument.nets.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Copper traces</span>
                  <span className="font-bold text-[#fbbf24]">{pcbDocument.traces.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Zones / keepouts</span>
                  <span className="font-bold text-slate-200">
                    {pcbDocument.zones.length} / {pcbDocument.keepouts.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-[#21262d] bg-[#0d1117] p-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase mb-3">
                {activeStageReady ? (
                  <ShieldCheck size={12} className="text-[#22c55e]" />
                ) : (
                  <ShieldAlert size={12} className="text-[#f87171]" />
                )}
                Stage Readiness
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">PCB entry</span>
                  <span className={readiness.canEnterPcb ? 'font-bold text-[#22c55e]' : 'font-bold text-[#f87171]'}>
                    {readiness.canEnterPcb ? 'Ready' : 'Blocked'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fabrication</span>
                  <span className={readiness.canEnterManufacturing ? 'font-bold text-[#22c55e]' : 'font-bold text-[#f59e0b]'}>
                    {readiness.canEnterManufacturing ? 'Ready' : 'Hold'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Open issues</span>
                  <span className="font-bold text-slate-200">{audit.issueCount}</span>
                </div>
              </div>
              {activeStageReasons.length > 0 && (
                <div className="mt-3 space-y-2">
                  {activeStageReasons.slice(0, 3).map(reason => (
                    <div key={reason} className="border border-[#3b1620] bg-[#1f1015] px-2 py-2 text-[11px] text-[#fda4af]">
                      {reason}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border border-[#21262d] bg-[#0d1117] p-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase mb-3">
                <PackageCheck size={12} />
                PCB Objects
              </div>
              <div className="space-y-2">
                {componentPlacements.length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    부품을 배치하면 센서, 저항, 다이오드, 외부 전원 같은 보조 부품도 실제 패드 객체로 승격됩니다.
                  </p>
                ) : (
                  componentPlacements.map(placement => {
                    const template = getTemplateById(placement.templateId);
                    const connectedPads = placement.pads.filter(pad => pad.netId).length;
                    return (
                      <div key={placement.id} className="border border-[#21262d] bg-[#080e1d] p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-200 truncate">{placement.name}</span>
                          <CheckCircle2 size={12} className="text-[#22c55e] flex-shrink-0" />
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 truncate">
                          {placement.footprint}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>{template?.category ?? 'PART'} · {placement.packageType}</span>
                          <span>{connectedPads}/{placement.pads.length} pads net-bound</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(#1f2937 1px, transparent 1px), linear-gradient(90deg, #1f2937 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="relative h-full p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="border border-[#334155] bg-[#0d1117]/95 p-3">
                  <Layers3 size={14} className="text-[#22c55e] mb-2" />
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Layer Set</div>
                  <div className="text-sm font-bold text-slate-200 mt-1">{pcbDocument.layers.length} Views</div>
                </div>
                <div className="border border-[#334155] bg-[#0d1117]/95 p-3">
                  <GitBranch size={14} className="text-[#38bdf8] mb-2" />
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Netlist</div>
                  <div className="text-sm font-bold text-slate-200 mt-1">{pcbDocument.nets.length} Nets</div>
                </div>
                <div className="border border-[#334155] bg-[#0d1117]/95 p-3">
                  <SquareStack size={14} className="text-[#fbbf24] mb-2" />
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Copper</div>
                  <div className="text-sm font-bold text-slate-200 mt-1">{pcbDocument.traces.length} Traces</div>
                </div>
                <div className="border border-[#334155] bg-[#0d1117]/95 p-3">
                  {manufacturingLocked ? (
                    <Lock size={14} className="text-[#f87171] mb-2" />
                  ) : (
                    <Factory size={14} className="text-[#f59e0b] mb-2" />
                  )}
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Output</div>
                  <div className="text-sm font-bold text-slate-200 mt-1">
                    {isManufacturing ? 'Gerber Ready Draft' : manufacturingLocked ? 'Verification Hold' : 'Layout Draft'}
                  </div>
                </div>
              </div>

              {!activeStageReady && (
                <div className="border border-[#7f1d1d] bg-[#1f1015] px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#fecaca]">
                    <ShieldAlert size={14} />
                    {isManufacturing ? '제조 단계 잠금' : 'PCB 단계 점검 필요'}
                  </div>
                  <div className="mt-2 space-y-2">
                    {activeStageReasons.map(reason => (
                      <div key={reason} className="text-[11px] text-[#fda4af]">
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-[1.35fr_1fr] gap-4">
                <div className="border border-[#334155] bg-[#0d1117]/95 min-h-[360px] p-4">
                  <div className="flex items-center justify-between border-b border-[#21262d] pb-3 mb-4">
                    <div>
                      <div className="text-xs font-bold text-slate-200">
                        {isManufacturing ? 'Manufacturing Data Preview' : 'Actual Net / Trace Preview'}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        이제 가짜 넷 이름이 아니라 실제 패드, 레이어, 트레이스, 영역 데이터로 구성됩니다.
                      </div>
                    </div>
                  </div>

                  {pcbDocument.nets.length === 0 ? (
                    <div className="h-56 flex items-center justify-center text-center text-slate-500 text-xs">
                      먼저 Simulation 단계에서 부품을 놓고 배선을 완료하세요.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pcbDocument.nets.map(net => {
                        const traces = pcbDocument.traces.filter(trace => trace.netId === net.id);
                        return (
                          <div key={net.id} className="border border-[#21262d] bg-[#080e1d]">
                            <div className="grid grid-cols-[140px_110px_1fr] gap-3 px-3 py-2 border-b border-[#21262d] text-[10px] uppercase font-bold text-slate-500">
                              <span>{net.name}</span>
                              <span>{net.className}</span>
                              <span>{net.nodes.length} nodes / {traces.length} traces</span>
                            </div>
                            <div className="divide-y divide-[#172033]">
                              {traces.length > 0 ? traces.map(trace => (
                                <div key={trace.id} className="grid grid-cols-[110px_80px_1fr] gap-3 px-3 py-2 text-xs">
                                  <span className="text-[#22c55e]">{trace.layer}</span>
                                  <span className="text-slate-400">{trace.width.toFixed(2)}mm</span>
                                  <span className="text-slate-500 truncate">{formatPointLabel(trace.points)}</span>
                                </div>
                              )) : (
                                <div className="px-3 py-2 text-xs text-slate-500">
                                  연결된 노드는 있지만 아직 물리 경로가 생성되지 않았습니다.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="border border-[#334155] bg-[#0d1117]/95 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200 mb-3">
                      <Map size={14} className="text-[#38bdf8]" />
                      Placement / Pads
                    </div>
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {pcbDocument.placements.map(placement => (
                        <div key={placement.id} className="border border-[#21262d] bg-[#080e1d] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200 truncate">{placement.name}</span>
                            <span className="text-[10px] text-slate-500">{placement.layer}</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500 truncate">{placement.footprint}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                            <span>{placement.pads.length} pads</span>
                            <span>{Math.round(placement.body.width)} x {Math.round(placement.body.height)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-[#334155] bg-[#0d1117]/95 p-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200 mb-3">
                      <Layers3 size={14} className="text-[#fbbf24]" />
                      Zones / Keepouts
                    </div>
                    <div className="space-y-2">
                      {pcbDocument.zones.map(zone => (
                        <div key={zone.id} className="border border-[#21262d] bg-[#080e1d] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-200">{zone.purpose}</span>
                            <span className="text-[10px] text-[#22c55e]">{zone.layer}</span>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {zone.netId} · clearance {zone.clearance.toFixed(2)}mm
                          </div>
                        </div>
                      ))}
                      {pcbDocument.keepouts.map(keepout => (
                        <div key={keepout.id} className="border border-[#3b1620] bg-[#1f1015] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#fda4af]">{keepout.reason}</span>
                            <span className="text-[10px] text-slate-400">{keepout.layers.join(', ')}</span>
                          </div>
                        </div>
                      ))}
                      {pcbDocument.zones.length === 0 && pcbDocument.keepouts.length === 0 && (
                        <div className="text-xs text-slate-500">
                          아직 생성된 PCB 영역 데이터가 없습니다.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-[#334155] bg-[#0d1117]/95 p-4">
                    <div className="text-xs font-bold text-slate-200 mb-2">Conversion Notes</div>
                    <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed">
                      <div>현재 단계에서는 원본 회로도 연결을 실제 넷 문서로 올리고, 보조 부품도 패드 객체로 취급합니다.</div>
                      <div>직렬 저항이나 레벨 시프터를 신호 경로 안에 직접 끼워 넣는 완전한 회로 편집은 다음 단계에서 넷 편집기로 확장하면 됩니다.</div>
                      <div>그래도 이제 JSON 저장과 PCB 미리보기에서는 패드, 넷, 레이어, 구리 영역, 킵아웃이 모두 실데이터로 남습니다.</div>
                    </div>
                    <div className="mt-3 text-[10px] text-slate-600">
                      Routed components: {routedComponents.length} / {components.length}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
