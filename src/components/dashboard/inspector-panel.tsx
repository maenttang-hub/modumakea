'use client';

/**
 * components/dashboard/inspector-panel.tsx
 * EDA 스타일 속성(Inspector) 패널 컴포넌트
 * - 선택된 노드(보드 또는 부품)의 속성을 정밀 출력하고 이름 수정/제거 가능
 * - 실시간 보드 핀 맵 상태 모니터링 포함
 */

import React, { useState } from 'react';
import { useBoardStore } from '@/store/use-board-store';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import {
  analyzeComponentForBoard,
  getComponentPowerModeCatalog,
  getBoardDesignAnalysis,
  getProjectPowerInputLabel,
} from '@/lib/datasheet-rules';
import { getLocalizedDatasheetStatusLabel } from '@/lib/catalog-i18n';
import {
  getCompanionDisplayValue,
  getCompanionOriginalValueRange,
  getCompanionValueSelectionHint,
} from '@/lib/companion-part-display';
import { runProjectDrc } from '@/lib/drc-engine';
import {
  getRequirementForComponentPin,
  isBoardPinCompatibleWithRequirement,
  isSharedBoardPin,
} from '@/lib/pin-compatibility';
import { buildFootprintMatcherModel } from '@/lib/footprint-matcher';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { useUiDebugMode } from '@/lib/ui-debug';
import { FootprintMatcherViewer } from '@/components/dashboard/footprint-matcher-viewer';
import type { ProjectUnusedPinBiasMode } from '@/types';
import {
  Sliders,
  Cpu,
  Settings,
  Copy,
  Trash2,
  Check,
  CircuitBoard,
  AlertTriangle,
  ExternalLink,
  RotateCw,
  ShieldCheck,
  PackagePlus,
} from 'lucide-react';
import { toast } from 'sonner';

export function InspectorPanel() {
  const uiDebugMode = useUiDebugMode();
  const {
    components,
    manualConnections,
    activeBoardId,
    importedSchematicScene,
    generatedCode,
    pins,
    footprintPinPadOverrideCache,
    powerInputMode,
    componentPowerModes,
    componentUnusedPinModes,
    appLanguage,
    schematicTheme,
    selectedComponentId,
    setPowerInputMode,
    setComponentPowerMode,
    setComponentUnusedPinMode,
    updateComponentName,
    updateComponentValue,
    rotateComponent,
    removeComponent,
    assignPinToComponent,
    removeAssignedPin,
    setFootprintPinPadOverride,
    setSelectedComponentId,
  } = useBoardStore();

  const [copied, setCopied] = useState(false);
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const importedPalette = getImportedSchematicPalette(schematicTheme);
  const board = getBoardById(activeBoardId);
  const boardAnalysis = getBoardDesignAnalysis(activeBoardId);
  const projectAudit = runProjectDrc({
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
  });
  const UNUSED_PIN_MODE_OPTIONS: Array<{ value: ProjectUnusedPinBiasMode; label: string }> = [
    { value: 'internal-pullup', label: '내부 풀업' },
    { value: 'internal-pulldown', label: '내부 풀다운' },
    { value: 'external-pullup', label: '외부 풀업' },
    { value: 'external-pulldown', label: '외부 풀다운' },
    { value: 'floating-ok', label: '부동 허용' },
    { value: 'analog-hi-z', label: '아날로그 Hi-Z' },
  ];
  const POWER_INPUT_OPTIONS = [
    { id: 'usb-5v', label: 'USB 5V' },
    { id: 'vin-9v', label: 'VIN 9V' },
    { id: 'vin-12v', label: 'VIN 12V' },
    { id: 'ext-5v', label: '외부 5V' },
    { id: 'ext-3v3', label: '외부 3.3V' },
  ] as const;

  // 1. 선택된 대상 확인
  const isBoardSelected = selectedComponentId === 'board-node';
  const activeComp = components.find(c => c.instanceId === selectedComponentId);

  const handleCopyId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    toast.success('ID가 복사되었습니다.');
    setTimeout(() => setCopied(false), 1500);
  };

  // ─────────────────────────────────────────
  // A. 부품 노드가 선택된 경우
  // ─────────────────────────────────────────
  if (activeComp) {
    const template = getTemplateById(activeComp.templateId);
    const analysis = template ? analyzeComponentForBoard(template, activeBoardId) : null;
    const footprintMatcher = buildFootprintMatcherModel(activeComp, template, footprintPinPadOverrideCache);
    const componentPowerModeCatalog = template ? getComponentPowerModeCatalog(activeComp, template) : null;
    const selectedPowerMode = componentPowerModes[activeComp.instanceId] ?? '';
    const activePowerModeOption = componentPowerModeCatalog?.options.find(
      option => option.name === (selectedPowerMode || componentPowerModeCatalog.defaultMode)
    );
    const pinoutMismatchIssue = projectAudit.issues.find(
      issue =>
        issue.ruleId === 'electrical.pinout-mismatch' &&
        issue.visualTargets?.componentIds?.includes(activeComp.instanceId)
    );
    const quickValuePresets =
      template?.id === 'tpl_resistor'
        ? ['220 Ohm', '330 Ohm', '1k Ohm', '4.7k Ohm', '10k Ohm']
        : [];
    const companionSuggestion = projectAudit.companionReport.suggestions.find(
      suggestion => suggestion.componentInstanceId === activeComp.instanceId
    );
    const configurableUnusedPins = (template?.requiredPins ?? []).filter(pin => {
      if (
        pin.allowedTypes.some(type => type === 'POWER' || type === 'GND') ||
        /^NC\d*$/i.test(pin.name) ||
        /^(RST|RESET|NRST|MCLR|EN|CHIP_EN|XTAL|OSC|XI|XO)/i.test(pin.name)
      ) {
        return false;
      }

      return pin.allowedTypes.some(type => type === 'DIGITAL' || type === 'ANALOG' || type === 'PWM');
    });
    const getBoardPinOptions = (componentPin: string) => {
      if (!template) {
        return [];
      }

      const requirement = getRequirementForComponentPin(template, componentPin);
      if (!requirement) {
        return [];
      }

      return Object.values(pins)
        .filter(boardPin => isBoardPinCompatibleWithRequirement(requirement, boardPin))
        .filter(boardPin => {
          const alreadyUsedBySameComponent = Object.entries(activeComp.assignedPins).some(
            ([otherComponentPin, assignedBoardPin]) =>
              otherComponentPin !== componentPin && assignedBoardPin === boardPin.id
          );

          if (alreadyUsedBySameComponent) {
            return false;
          }

          if (isSharedBoardPin(boardPin.id)) {
            return true;
          }

          return !boardPin.isUsed || boardPin.connectedTo === activeComp.instanceId;
        })
        .sort((left, right) => {
          const currentBoardPin = activeComp.assignedPins[componentPin];
          if (left.id === currentBoardPin) return -1;
          if (right.id === currentBoardPin) return 1;
          if (left.isUsed !== right.isUsed) return left.isUsed ? 1 : -1;
          return left.id.localeCompare(right.id);
        });
    };

    const handlePinMappingChange = (componentPin: string, nextBoardPinId: string) => {
      const currentBoardPinId = activeComp.assignedPins[componentPin] ?? '';
      if (nextBoardPinId === currentBoardPinId) {
        return;
      }

      if (!nextBoardPinId) {
        removeAssignedPin(activeComp.instanceId, componentPin);
        toast.success('핀 연결 해제', {
          description: `${activeComp.name}의 ${componentPin} 연결을 해제했습니다.`,
        });
        return;
      }

      const result = assignPinToComponent(activeComp.instanceId, componentPin, nextBoardPinId);
      if (!result.success) {
        toast.error('핀 변경 실패', {
          description: result.error ?? '핀 매핑을 바꾸지 못했습니다.',
        });
        return;
      }

      toast.success('핀 연결 변경 완료', {
        description: `${activeComp.name}.${componentPin}을 ${nextBoardPinId}에 고정했습니다.`,
      });
    };

    return (
      <div data-mm-scope="inspector-panel" className="h-full flex flex-col font-mono text-xs text-slate-300">
        {/* 상단 서브 타이틀 */}
        <div className="flex items-center gap-2 pb-3 border-b border-[#21262d] mb-4">
          <CircuitBoard size={14} className="text-[#eab308]" />
          <span className="font-bold text-slate-200">부품 속성</span>
        </div>

        {/* 속성 입력창 */}
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          {/* 부품 식별 이름 (수정 가능) */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">부품 지정 이름 (Designator)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={activeComp.name}
                onChange={e => updateComponentName(activeComp.instanceId, e.target.value)}
                className="flex-1 px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] text-xs text-slate-200 focus:outline-none focus:border-[#22c55e] transition-colors rounded-sm"
              />
            </div>
          </div>

          {(template?.defaultValue || activeComp.value !== undefined || template?.category === 'PASSIVE') && (
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">부품 값 (Value)</label>
              <input
                type="text"
                value={activeComp.value ?? ''}
                onChange={e => updateComponentValue(activeComp.instanceId, e.target.value)}
                placeholder={template?.defaultValue ?? '예: 10k Ohm, 0.1uF, 1N4148'}
                className="w-full px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] text-xs text-slate-200 focus:outline-none focus:border-[#22c55e] transition-colors rounded-sm"
              />
              {quickValuePresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {quickValuePresets.map(preset => {
                    const isActive = (activeComp.value ?? template?.defaultValue ?? '') === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => updateComponentValue(activeComp.instanceId, preset)}
                        className={[
                          'rounded-sm border px-2 py-1 text-[10px] transition-colors',
                          isActive
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-[#30363d] bg-[#111827] text-slate-400 hover:border-[#22c55e] hover:text-slate-200',
                        ].join(' ')}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">카테고리</span>
              <span className="text-xs font-bold text-slate-300">{template?.category ?? 'SENSOR'}</span>
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">허용 전압</span>
              <span className="text-xs font-bold text-slate-300">{template?.compatibleVoltage ?? '5V'}</span>
            </div>
          </div>

          {componentPowerModeCatalog ? (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">전력 모드</label>
              <select
                value={selectedPowerMode}
                onChange={event => {
                  setComponentPowerMode(activeComp.instanceId, event.target.value || null);
                  toast.success('전력 모드 반영', {
                    description: event.target.value
                      ? `${activeComp.name}을 ${event.target.value} 모드로 반영했습니다.`
                      : `${activeComp.name}을 기본 전력 모드로 되돌렸습니다.`,
                  });
                }}
                className="w-full rounded-sm border border-[#30363d] bg-[#111827] px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-[#38bdf8]"
              >
                <option value="">
                  기본값 {componentPowerModeCatalog.defaultMode ? `(${componentPowerModeCatalog.defaultMode})` : '(자동)'}
                </option>
                {componentPowerModeCatalog.options.map(option => (
                  <option key={option.name} value={option.name}>
                    {option.name}
                    {option.isDefault ? ' · default' : ''}
                  </option>
                ))}
              </select>
              <div className="rounded-sm border border-[#21262d] bg-[#0d1117] px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
                <div className="text-slate-300">
                  매칭 부품: <span className="font-semibold text-sky-300">{componentPowerModeCatalog.canonicalMpn}</span>
                </div>
                <div>
                  현재 반영: <span className="font-semibold text-emerald-300">{selectedPowerMode || componentPowerModeCatalog.defaultMode || '보수적 자동'}</span>
                </div>
                {activePowerModeOption ? (
                  <div>
                    예산 전류: <span className="font-semibold text-slate-200">{activePowerModeOption.currentMa ?? '-'} mA</span>
                    {typeof activePowerModeOption.peakMa === 'number' ? ` / peak ${activePowerModeOption.peakMa} mA` : ''}
                  </div>
                ) : null}
                {activePowerModeOption?.note ? <div>{activePowerModeOption.note}</div> : null}
              </div>
            </div>
          ) : null}

          {configurableUnusedPins.length > 0 ? (
            <div className="space-y-2 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">미사용 핀 처리</label>
              <div className="space-y-2 rounded-sm border border-[#21262d] bg-[#0d1117] p-2.5">
                <div className="text-[11px] leading-relaxed text-slate-400">
                  연결하지 않을 GPIO 처리 방식을 기록하면 unused pin 검토가 더 정확해집니다.
                </div>
                {configurableUnusedPins.map(pin => {
                  const currentMode = componentUnusedPinModes[activeComp.instanceId]?.[pin.name] ?? '';
                  const isAssigned = Boolean(activeComp.assignedPins[pin.name]);

                  return (
                    <div key={pin.name} className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-2">
                      <div>
                        <div className="text-[11px] font-semibold text-slate-200">{pin.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {isAssigned ? '현재 연결됨' : `허용: ${pin.allowedTypes.join('/')}`}
                        </div>
                      </div>
                      <select
                        value={currentMode}
                        disabled={isAssigned}
                        onChange={event => {
                          setComponentUnusedPinMode(
                            activeComp.instanceId,
                            pin.name,
                            (event.target.value as ProjectUnusedPinBiasMode) || null
                          );
                          toast.success('미사용 핀 정책 반영', {
                            description: event.target.value
                              ? `${activeComp.name}.${pin.name}을 ${event.target.value}로 기록했습니다.`
                              : `${activeComp.name}.${pin.name}을 자동 검토 상태로 되돌렸습니다.`,
                          });
                        }}
                        className="w-full rounded-sm border border-[#30363d] bg-[#111827] px-2 py-1.5 text-[11px] text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">자동 검토</option>
                        {UNUSED_PIN_MODE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">부품 회전</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
                <span className="text-[9px] text-slate-500 block">현재 각도</span>
                <span className="text-xs font-bold text-slate-300">{activeComp.rotation}°</span>
              </div>
              <button
                onClick={() => {
                  rotateComponent(activeComp.instanceId);
                  toast.success(`${activeComp.name} 회전`, {
                    description: '센서를 90도 회전했습니다.',
                  });
                }}
                className="h-full px-3 py-2 bg-[#0d1117] border border-[#30363d] text-slate-300 hover:border-[#22c55e] hover:text-[#86efac] transition-colors rounded-sm flex items-center gap-2"
              >
                <RotateCw size={12} />
                <span className="text-xs font-bold">90도 회전</span>
              </button>
            </div>
          </div>

          {uiDebugMode ? (
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">고유 ID (Instance ID)</label>
            <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-sm text-slate-400">
              <span className="truncate max-w-[170px] select-all">{activeComp.instanceId}</span>
              <button
                onClick={() => handleCopyId(activeComp.instanceId)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
              </button>
            </div>
          </div>
          ) : null}

          {uiDebugMode ? (
          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">라이브러리 모델</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
                <span className="text-[9px] text-slate-500 block">시뮬레이션</span>
                <span className="text-xs font-bold text-[#60a5fa]">{template?.simulation?.type ?? 'custom'}</span>
              </div>
              <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
                <span className="text-[9px] text-slate-500 block">회로도 심볼</span>
                <span className="text-xs font-bold text-slate-300">{template?.schematic?.symbol ?? template?.id}</span>
              </div>
              <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm col-span-2">
                <span className="text-[9px] text-slate-500 block">패키지 정보</span>
                <span className="text-xs font-bold text-[#22c55e] break-all">{template?.pcb?.footprint ?? 'Module:custom'}</span>
              </div>
              <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
                <span className="text-[9px] text-slate-500 block">데이터시트 상태</span>
                <span className="text-xs font-bold text-[#93c5fd]">
                  {analysis ? getLocalizedDatasheetStatusLabel(analysis.datasheetStatus, appLanguage) : 'Generic'}
                </span>
              </div>
              <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
                <span className="text-[9px] text-slate-500 block">권장 인터페이스</span>
                <span className="text-xs font-bold text-[#fbbf24]">
                  {analysis?.preferredInterface ?? 'GPIO'}
                </span>
              </div>
            </div>
          </div>
          ) : null}

          {uiDebugMode && footprintMatcher && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">핀아웃 ↔ 풋프린트 매칭</label>
              <FootprintMatcherViewer
                model={footprintMatcher}
                editable
                onLinkChange={(pinId, padId) => {
                  setFootprintPinPadOverride(activeComp.instanceId, pinId, padId);
                  toast.success('핀-패드 매핑 저장', {
                    description: `${activeComp.name}.${pinId}를 패드 ${padId} 기준으로 반영했습니다.`,
                  });
                }}
              />
              {footprintMatcher.mappingSource === 'component' ? (
                <div className="rounded-sm border border-emerald-500/25 bg-emerald-950/15 px-2.5 py-2 text-[11px] leading-relaxed text-emerald-100">
                  사용자 지정 핀 규칙이 이 부품 매칭과 검수에 직접 반영되고 있습니다.
                </div>
              ) : footprintMatcher.mappingSource === 'cache' ? (
                <div className="rounded-sm border border-sky-500/25 bg-sky-950/15 px-2.5 py-2 text-[11px] leading-relaxed text-sky-100">
                  저장된 핀 규칙이 자동 제안으로 적용되었습니다. 비슷한 부품군에도 다시 사용할 수 있습니다.
                </div>
              ) : null}
              {pinoutMismatchIssue && (
                <div className="rounded-sm border border-red-500/30 bg-red-950/20 px-2.5 py-2 text-[11px] leading-relaxed text-red-100">
                  {pinoutMismatchIssue.message}
                </div>
              )}
            </div>
          )}

          {/* 핀 맵핑 현황 */}
          {uiDebugMode ? (
          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">핀 배선 매핑 (Netlist)</label>
            <div className="border border-[#21262d] rounded-sm overflow-hidden bg-[#0d1117]">
              <div className="grid grid-cols-[72px,1fr] bg-[#161a22] text-[9px] font-bold text-slate-400 border-b border-[#21262d] px-2 py-1">
                <span>부품 핀 (Pin)</span>
                <span>보드 핀 (Net)</span>
              </div>
              <div className="divide-y divide-[#21262d]">
                {template?.requiredPins.map((p, index) => {
                  const mapped = activeComp.assignedPins[p.name];
                  const boardPinState = mapped ? pins[mapped] : undefined;
                  const boardPinOptions = getBoardPinOptions(p.name);
                  const assignmentLabel =
                    boardPinState?.assignmentMode === 'manual'
                      ? '수동 락'
                      : boardPinState?.assignmentMode === 'auto'
                        ? '자동'
                        : null;
                  return (
                    <div key={`${p.name}:${index}`} className="grid grid-cols-[72px,1fr] gap-2 px-2 py-2 text-xs">
                      <span className="pt-1 text-slate-300 font-bold">{p.name}</span>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <select
                            value={mapped ?? ''}
                            onChange={event => handlePinMappingChange(p.name, event.target.value)}
                            className="flex-1 rounded-sm border border-[#30363d] bg-[#111827] px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-[#38bdf8]"
                          >
                            <option value="">미연결</option>
                            {boardPinOptions.map(boardPin => (
                              <option key={boardPin.id} value={boardPin.id}>
                                {boardPin.id} · {boardPin.type.join('/')}
                              </option>
                            ))}
                          </select>
                          {mapped && (
                            <button
                              type="button"
                              onClick={() => handlePinMappingChange(p.name, '')}
                              className="rounded-sm border border-slate-700 bg-slate-950/70 px-2 py-1 text-[10px] font-bold text-slate-300 transition-colors hover:border-red-400/40 hover:text-red-200"
                            >
                              해제
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-[10px]">
                          <span className={mapped ? 'text-[#22c55e] font-bold' : 'text-yellow-500/80'}>
                            {mapped ? `현재 연결: ${mapped}` : '현재 연결 없음'}
                          </span>
                          {assignmentLabel && (
                            <span className={`px-1.5 py-0.5 border ${
                              boardPinState?.assignmentMode === 'manual'
                                ? 'border-slate-700 bg-slate-900/60 text-slate-300'
                                : 'border-sky-900/40 bg-sky-950/20 text-sky-300'
                            }`}>
                              {assignmentLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-sm border border-[#21262d] bg-[#0d1117] px-2.5 py-2">
              <span className="text-[10px] leading-relaxed text-slate-500">
                드롭다운으로 바꾸면 수동 고정으로 저장됩니다.
              </span>
            </div>
            {template?.category === 'PASSIVE' && (
              <p className="text-[10px] leading-relaxed text-slate-500">
                수동소자는 원본 도면 기준으로 값과 연결 위치를 확인하는 흐름이 가장 자연스럽습니다.
              </p>
            )}
          </div>
          ) : null}

          {/* 위치 정보 */}
          {uiDebugMode ? (
          <div className="space-y-1.5 pt-1">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">좌표 (Coordinates)</label>
            <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono text-[11px] bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <div>X: <span className="text-slate-200">{Math.round(activeComp.position.x)}px</span></div>
              <div>Y: <span className="text-slate-200">{Math.round(activeComp.position.y)}px</span></div>
            </div>
          </div>
          ) : null}

          {uiDebugMode && analysis && analysis.warnings.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">데이터시트 경고</label>
              <div className="space-y-2">
                {analysis.warnings.map(warning => {
                  const color =
                    warning.severity === 'error'
                      ? 'rgba(239,68,68,0.18)'
                      : warning.severity === 'warning'
                        ? 'rgba(245,158,11,0.16)'
                        : 'rgba(59,130,246,0.14)';
                  const border =
                    warning.severity === 'error'
                      ? 'rgba(239,68,68,0.4)'
                      : warning.severity === 'warning'
                        ? 'rgba(245,158,11,0.35)'
                        : 'rgba(59,130,246,0.35)';
                  const text =
                    warning.severity === 'error'
                      ? '#fca5a5'
                      : warning.severity === 'warning'
                        ? '#fcd34d'
                        : '#93c5fd';

                  return (
                    <div
                      key={`${warning.title}-${warning.message}`}
                      className="p-2 rounded-sm border"
                      style={{ background: color, borderColor: border }}
                    >
                      <div className="flex items-center gap-1.5 mb-1" style={{ color: text }}>
                        <AlertTriangle size={11} />
                        <span className="font-bold">{warning.title}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">{warning.message}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {uiDebugMode && companionSuggestion && companionSuggestion.items.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">동반 부품 규칙</label>
              <div className="space-y-2">
                {companionSuggestion.items.map(item => {
                  const tone =
                    item.level === 'required'
                      ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5', badge: '필수' }
                      : item.level === 'recommended'
                        ? { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#fcd34d', badge: '권장' }
                        : { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd', badge: '조건부' };
                  const displayValue = getCompanionDisplayValue(item);
                  const originalValueRange = getCompanionOriginalValueRange(item, displayValue);
                  const selectionHint = getCompanionValueSelectionHint(item);

                  return (
                    <div
                      key={`${item.label}-${item.value ?? 'na'}`}
                      className="p-2 rounded-sm border"
                      style={{ background: tone.bg, borderColor: tone.border }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5" style={{ color: tone.text }}>
                          <PackagePlus size={11} />
                          <span className="font-bold">
                            {item.label}{displayValue ? ` · ${displayValue}` : ''}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {tone.badge} x{item.quantity}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-300">{item.reason}</p>
                      {originalValueRange && (
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                          추천 범위: {originalValueRange}
                        </p>
                      )}
                      {selectionHint && (
                        <p className="mt-1 rounded-sm border border-white/8 bg-black/15 px-2 py-1 text-[10px] leading-relaxed text-slate-200">
                          {selectionHint}
                        </p>
                      )}
                      {item.note && (
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{item.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {uiDebugMode && analysis && analysis.sources.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">공식 참고 문서</label>
              <div className="space-y-1">
                {analysis.sources.map(source => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-2 bg-[#0d1117] border border-[#21262d] rounded-sm text-slate-300 hover:border-[#2563eb] transition-colors"
                  >
                    <span className="truncate">{source.label}</span>
                    <ExternalLink size={11} className="flex-shrink-0 text-slate-500" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 부품 삭제 단축 버튼 */}
        <div className="pt-4 border-t border-[#21262d] mt-auto">
          <button
            onClick={() => {
              removeComponent(activeComp.instanceId);
              setSelectedComponentId(null);
              toast.info(`🗑️ ${activeComp.name} 삭제 완료`);
            }}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-red-950/40 hover:bg-red-900/40 border border-red-900/60 hover:border-red-600/80 text-red-400 font-bold transition-all rounded-sm cursor-pointer"
          >
            <Trash2 size={13} />
            부품 삭제하기
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // B. 메인 보드 노드가 선택된 경우
  // ─────────────────────────────────────────
  if (isBoardSelected) {
    // 사용 중인 핀 수집
    const pinUsage: Record<string, string> = {};
    components.forEach(c => {
      Object.entries(c.assignedPins).forEach(([partPin, boardPin]) => {
        pinUsage[boardPin] = `${c.name} (${partPin})`;
      });
    });

    return (
      <div className="h-full flex flex-col font-mono text-xs text-slate-300">
        <div className="flex items-center gap-2 pb-3 border-b border-[#21262d] mb-4">
          <Cpu size={14} className="text-[#22c55e]" />
          <span className="font-bold text-slate-200">개발 보드 정보</span>
        </div>

        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase">보드명</span>
            <div className="text-slate-200 font-bold text-sm">{board.name}</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">칩셋</span>
              <span className="text-xs font-bold text-slate-300">{board.chipset}</span>
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">동작 전압</span>
              <span className="text-xs font-bold text-slate-300">{board.logicVoltage}</span>
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">데이터시트 상태</span>
              <span className="text-xs font-bold text-[#93c5fd]">
                {getLocalizedDatasheetStatusLabel(boardAnalysis.datasheetStatus, appLanguage)}
              </span>
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm">
              <span className="text-[9px] text-slate-500 block">기본 인터페이스</span>
              <span className="text-xs font-bold text-[#fbbf24]">
                {board.id === 'rpi4' ? 'I2C / SPI / UART' : board.id === 'esp32' ? 'GPIO / I2C / SPI / UART' : 'GPIO / I2C'}
              </span>
            </div>
            <div className="bg-[#0d1117] border border-[#21262d] p-2 rounded-sm col-span-2">
              <span className="text-[9px] text-slate-500 block">프로젝트 전원 입력</span>
              <span className="text-xs font-bold text-[#38bdf8]">
                {getProjectPowerInputLabel(activeBoardId, powerInputMode)}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">전원 입력 시나리오</label>
            <div className="grid grid-cols-2 gap-2">
              {POWER_INPUT_OPTIONS.map(option => (
                <button
                  key={option.id}
                  onClick={() => setPowerInputMode(option.id)}
                  className="px-2.5 py-2 border text-left transition-colors rounded-sm"
                  style={{
                    background: powerInputMode === option.id ? 'rgba(56,189,248,0.12)' : '#0d1117',
                    borderColor: powerInputMode === option.id ? 'rgba(56,189,248,0.45)' : '#21262d',
                    color: powerInputMode === option.id ? '#7dd3fc' : '#94a3b8',
                  }}
                >
                  <div className="font-bold text-[11px]">{option.label}</div>
                  <div className="text-[10px] text-slate-500 mt-1">전원/발열 예산을 이 기준으로 계산합니다.</div>
                </button>
              ))}
            </div>
          </div>

          {uiDebugMode && boardAnalysis.warnings.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">보드 주의 사항</label>
              <div className="space-y-2">
                {boardAnalysis.warnings.map(warning => (
                  <div
                    key={`${warning.title}-${warning.message}`}
                    className="p-2 rounded-sm border"
                    style={{ background: 'rgba(245,158,11,0.16)', borderColor: 'rgba(245,158,11,0.35)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[#fcd34d]">
                      <AlertTriangle size={11} />
                      <span className="font-bold">{warning.title}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300">{warning.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uiDebugMode && boardAnalysis.notes.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">보드 분석 메모</label>
              <div className="border border-[#21262d] rounded-sm overflow-hidden bg-[#0d1117]">
                {boardAnalysis.notes.map(note => (
                  <div key={note} className="px-2 py-1.5 text-[11px] text-slate-300 border-b last:border-b-0 border-[#21262d]">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 핀 맵 상태 모니터 */}
          {uiDebugMode ? (
          <div className="space-y-1.5 pt-2">
            <label className="text-[10px] text-slate-500 font-semibold block uppercase">실시간 핀 맵 상태 (Pinmap Monitor)</label>
            <div className="border border-[#21262d] rounded-sm overflow-hidden bg-[#0d1117] max-h-60 overflow-y-auto">
              <div className="grid grid-cols-2 bg-[#161a22] text-[9px] font-bold text-slate-400 border-b border-[#21262d] px-2 py-1 sticky top-0">
                <span>보드 핀 (Pin)</span>
                <span>연결 대상 (Connection)</span>
              </div>
              <div className="divide-y divide-[#21262d]">
                {/* 5V, GND, Digital, Analog 핀들 순회 */}
                {[...new Set(['5V', '3.3V', 'GND', ...board.digitalPins, ...board.leftPins])].map(pinId => {
                  const connected = pinUsage[pinId];
                  return (
                    <div key={pinId} className="grid grid-cols-2 px-2 py-1 text-xs items-center">
                      <span className="text-slate-300 font-bold flex items-center gap-1.5">
                        <div
                          className="w-1.5 h-1.5"
                          style={{
                            background: pinId === '5V' ? '#ef4444' : pinId === 'GND' ? '#64748b' : '#3b82f6'
                          }}
                        />
                        {pinId}
                      </span>
                      <span className={`text-[10px] truncate ${connected ? 'text-[#22c55e]' : 'text-slate-600'}`}>
                        {connected ? `🔗 ${connected}` : '• FREE'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          ) : null}

          {uiDebugMode && boardAnalysis.sources.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-[10px] text-slate-500 font-semibold block uppercase">보드 공식 문서</label>
              <div className="space-y-1">
                {boardAnalysis.sources.map(source => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 px-2.5 py-2 bg-[#0d1117] border border-[#21262d] rounded-sm text-slate-300 hover:border-[#2563eb] transition-colors"
                  >
                    <span className="truncate">{source.label}</span>
                    <ExternalLink size={11} className="flex-shrink-0 text-slate-500" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────
  // C. 선택된 대상이 없는 경우: 프로젝트 대시보드 상태 표시
  // ─────────────────────────────────────────
  const routedCount = components.filter(c => c.isFullyRouted).length;
  return (
    <div
      data-mm-scope="inspector-panel"
      className="h-full flex flex-col font-mono text-xs text-slate-300"
      style={{
        background: importedSchematicMode ? importedPalette.shellPanelAltBackground : undefined,
        color: importedSchematicMode ? importedPalette.shellForeground : '#cbd5e1',
      }}
    >
      <div
        className="flex items-center gap-2 pb-3 border-b mb-4"
        style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : '#21262d' }}
      >
        <Sliders size={14} className="text-slate-400" />
        <span className="font-bold" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#e2e8f0' }}>속성</span>
      </div>

      <div className="flex-1 overflow-y-auto text-slate-500 py-2">
        <div className="flex flex-col justify-center items-center text-center py-4">
          <Settings size={28} className="mb-3 text-[#30363d] animate-spin-slow" />
          <span className="text-xs text-slate-400 font-bold mb-1">선택된 항목 없음</span>
          <span className="text-[10px] max-w-[200px] leading-relaxed">
            캔버스에서 항목을 누르면 여기서 값을 보고 바꿀 수 있습니다.
          </span>
        </div>

        {/* 현재 프로젝트 요약 카드 */}
        <div className="w-full mt-6 bg-[#0d1117] border border-[#21262d] rounded-sm p-3 text-left space-y-2">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-[#21262d] pb-1">
            프로젝트 상태
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">지정 개발 보드:</span>
            <span className="text-slate-300 font-bold">{board.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">배치된 총 부품:</span>
            <span className="text-[#eab308] font-bold">{components.length} 개</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">확인된 연결:</span>
            <span className="text-[#22c55e] font-bold">{routedCount} / {components.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">프로젝트 전원:</span>
            <span className="text-[#38bdf8] font-bold">{getProjectPowerInputLabel(activeBoardId, powerInputMode)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">검토 준비:</span>
            <span className={routedCount > 0 ? 'text-[#38bdf8] font-bold' : 'text-slate-600 font-bold'}>
              {routedCount > 0 ? '가능' : '대기'}
            </span>
          </div>
        </div>

        <div className="w-full mt-4 bg-[#0d1117] border border-[#21262d] rounded-sm p-3 text-left space-y-2">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-[#21262d] pb-1">
            전원 입력
          </div>
          <div className="grid grid-cols-2 gap-2">
            {POWER_INPUT_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setPowerInputMode(option.id)}
                className="px-2.5 py-2 border text-left transition-colors rounded-sm"
                style={{
                  background: powerInputMode === option.id ? 'rgba(56,189,248,0.12)' : '#0b1020',
                  borderColor: powerInputMode === option.id ? 'rgba(56,189,248,0.45)' : '#21262d',
                  color: powerInputMode === option.id ? '#7dd3fc' : '#94a3b8',
                }}
              >
                <div className="font-bold text-[11px]">{option.label}</div>
                <div className="text-[10px] text-slate-500 mt-1">감사 엔진이 전류와 발열을 이 조건으로 계산합니다.</div>
              </button>
            ))}
          </div>
        </div>

        {uiDebugMode ? (
        <div className="w-full mt-4 bg-[#0d1117] border border-[#21262d] rounded-sm p-3 text-left space-y-3">
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-[#21262d] pb-2">
            <ShieldCheck size={12} className="text-[#22c55e]" />
            프로젝트 감사
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5">
              <span className="text-slate-500 block">Verified</span>
              <span className="text-[#86efac] font-bold">{projectAudit.verifiedCount}</span>
            </div>
            <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5">
              <span className="text-slate-500 block">Partial</span>
              <span className="text-[#fcd34d] font-bold">{projectAudit.partialCount}</span>
            </div>
            <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5">
              <span className="text-slate-500 block">Generic</span>
              <span className="text-[#f87171] font-bold">{projectAudit.genericCount}</span>
            </div>
            <div className="border border-slate-800 bg-slate-950/50 px-2 py-1.5">
              <span className="text-slate-500 block">Issues</span>
              <span className="text-slate-300 font-bold">{projectAudit.issueCount}</span>
            </div>
          </div>

          {projectAudit.issues.length === 0 ? (
            <div className="border border-emerald-900/40 bg-emerald-950/20 px-2.5 py-2 text-[11px] text-emerald-200">
              현재 배치된 회로에서는 즉시 눈에 띄는 데이터시트 경고가 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {projectAudit.issues.slice(0, 8).map(issue => {
                const tone =
                  issue.severity === 'error'
                    ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5' }
                    : issue.severity === 'warning'
                      ? { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)', text: '#fcd34d' }
                      : { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd' };

                return (
                  <div
                    key={`${issue.componentName ?? 'project'}-${issue.title}-${issue.message}`}
                    className="border px-2.5 py-2"
                    style={{ background: tone.bg, borderColor: tone.border }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold" style={{ color: tone.text }}>{issue.title}</span>
                      {issue.componentName && (
                        <span className="text-[10px] text-slate-400 truncate">{issue.componentName}</span>
                      )}
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-300">{issue.message}</p>
                  </div>
                );
              })}
              {projectAudit.issues.length > 8 && (
                <div className="text-[10px] text-slate-500">
                  나머지 {projectAudit.issues.length - 8}개 항목은 부품별 상세 패널에서 이어서 확인할 수 있습니다.
                </div>
              )}
            </div>
          )}
        </div>
        ) : null}

        {uiDebugMode && projectAudit.powerReport.rails.length > 0 && (
          <div className="w-full mt-4 bg-[#0d1117] border border-[#21262d] rounded-sm p-3 text-left space-y-3">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider border-b border-[#21262d] pb-2">
              전원 예산 검토
            </div>
            <div className="space-y-2">
              {projectAudit.powerReport.rails.map(rail => {
                const usageRatio = rail.budgetMa ? rail.usedMa / rail.budgetMa : 0;
                const tone =
                  rail.budgetMa && usageRatio > 1
                    ? 'text-[#fca5a5]'
                    : rail.budgetMa && usageRatio > 0.8
                      ? 'text-[#fcd34d]'
                      : 'text-[#86efac]';

                return (
                  <div key={rail.rail} className="border border-slate-800 bg-slate-950/50 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">{rail.rail} Rail</span>
                      <span className={`font-bold ${tone}`}>
                        {rail.usedMa}mA{rail.budgetMa ? ` / ${rail.budgetMa}mA` : ''}
                      </span>
                    </div>
                    {rail.note && (
                      <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                        {rail.note}{rail.inferred ? ' (보수적 추정 포함)' : ''}
                      </p>
                    )}
                  </div>
                );
              })}
              {projectAudit.powerReport.regulators.map(regulator => {
                const tone =
                  regulator.status === 'error'
                    ? 'text-[#fca5a5]'
                    : regulator.status === 'warning'
                      ? 'text-[#fcd34d]'
                      : 'text-[#86efac]';

                return (
                  <div key={regulator.id} className="border border-slate-800 bg-slate-950/50 px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-bold">{regulator.label}</span>
                      <span className={`font-bold ${tone}`}>
                        {regulator.dissipationW}W / {regulator.safeLimitW}W
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500 leading-relaxed">
                      Vin {regulator.inputVoltage}V {'->'} Vout {regulator.outputVoltage}V, 부하 {regulator.estimatedCurrentMa}mA
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
