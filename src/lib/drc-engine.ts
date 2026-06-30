import { analyzeCircuitNetlist, type CircuitAnalysisReport, type CircuitNet } from '@/lib/circuit-netlist';
import { getBoardSignalLimits } from '@/lib/board-signal-limits';
import { isImportedSchematicBoard } from '@/lib/component-template-utils';
import { createDrcIssue } from '@/lib/drc-issue-factory';
import { createProjectAuditIssue } from '@/lib/engine-i18n';
import { resolveFootprintPinPadOverrideCacheEntry } from '@/lib/footprint-matcher';
import { verifyCircuitCodeConsistency } from '@/lib/formal-verifier';
import { buildImportedSchematicAuditIssues } from '@/lib/imported-schematic-audit';
import { deduplicateIssues, mapFormalIssueToAuditIssue } from '@/lib/issue-utils';
import {
  auditProjectDesign,
  getPartMasterRecordForComponent,
  getProjectStageReadiness,
  getTemplateBusProfile,
} from '@/lib/datasheet-rules';
import { COMPONENT_ELECTRICAL_PROFILES } from '@/lib/datasheet-catalog';
import type {
  BoardPinDriveState,
  ComponentTemplate,
  FormalVerificationReport,
  ImportedSchematicScene,
  ManualNetConnection,
  PlacedComponent,
  ProjectAdcConfigurations,
  ProjectAuditIssue,
  ProjectAuditReport,
  ProjectComponentPowerModes,
  ProjectComponentUnusedPinModes,
  ProjectPowerInputMode,
  ProjectStageReadiness,
  FootprintPinPadOverrideCacheEntry,
} from '@/types';

export interface DrcRuleDescriptor {
  id: string;
  description: string;
  category: 'routing' | 'power' | 'signal' | 'protection' | 'documentation' | 'manufacturing';
}

export interface DrcEngineContext {
  components: PlacedComponent[];
  boardId: string;
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  powerInputMode?: ProjectPowerInputMode;
  componentPowerModes?: ProjectComponentPowerModes;
  componentUnusedPinModes?: ProjectComponentUnusedPinModes;
  adcConfigurations?: ProjectAdcConfigurations;
  manualConnections?: ManualNetConnection[];
  importedSchematicScene?: ImportedSchematicScene | null;
  generatedCode?: string;
  footprintPinPadOverrideCache?: Record<string, FootprintPinPadOverrideCacheEntry>;
}

export interface DrcEngineReport extends ProjectAuditReport {
  engineId: 'modumake-drc-v1';
  ruleCatalog: DrcRuleDescriptor[];
  circuitAnalysis: CircuitAnalysisReport;
  formalVerification: FormalVerificationReport;
}

export const CORE_DRC_RULES: DrcRuleDescriptor[] = [
  { id: 'routing.unrouted-component', description: '미배선 부품과 기본 연결 누락 검사', category: 'routing' },
  { id: 'power.rail-over-budget', description: '전원 레일 예산 초과 및 여유 부족 검사', category: 'power' },
  { id: 'power.regulator-thermal', description: '레귤레이터 열 손실 및 과열 위험 검사', category: 'power' },
  { id: 'power.source-collision', description: '독립 전원 소스 간 직접 충돌 및 역전류 위험 검사', category: 'power' },
  { id: 'mcu.boot-strap-audit', description: '부트 스트래핑 핀의 기본 상태와 풀업/풀다운 누락 검사', category: 'signal' },
  { id: 'clock.crystal-load-cap-missing', description: '크리스털 양단의 로드 커패시터 및 GND 복귀 누락 검사', category: 'signal' },
  { id: 'clock.clock-source-review', description: '크리스털/오실레이터의 실제 클럭 소스 연결성과 구동 대상을 검사', category: 'signal' },
  { id: 'power.regulator-max-input', description: '레귤레이터 최대 입력 전압 초과 검사', category: 'power' },
  { id: 'electrical.nc-pin-violation', description: 'NC 핀 오연결 검사', category: 'signal' },
  { id: 'electrical.reserved-pin-violation', description: 'reserved 핀 오연결 검사', category: 'signal' },
  { id: 'signal.unused-pin-review', description: '미사용 핀의 부동 상태와 처리 정책 검토', category: 'signal' },
  { id: 'electrical.pinout-mismatch', description: '심볼 핀 번호와 기대 풋프린트 핀아웃 불일치 검사', category: 'signal' },
  { id: 'bus.i2c-pullup', description: 'I2C 풀업, 주소 충돌, 버스 임피던스 검사', category: 'signal' },
  { id: 'bus.i2c-impedance-voltage', description: 'I2C 버스 합성 풀업 저항과 전압 도메인 정합성 검사', category: 'signal' },
  { id: 'signal.output-collision', description: '출력 핀 충돌과 ADC 범위 오류 검사', category: 'signal' },
  { id: 'netlist.power-topology', description: '실제 넷 기준 short, 레일 충돌, 분압 해석 검사', category: 'signal' },
  { id: 'netlist.power-short.trace', description: '0옴 링크/인덕터를 통한 저임피던스 합선 경로 추적', category: 'power' },
  { id: 'formal.code-circuit-consistency', description: '생성 코드와 물리 회로 배선 간의 의미론적 충돌 검사', category: 'signal' },
  { id: 'protection.inductive-load', description: '플라이백 다이오드와 보호 소자 누락 검사', category: 'protection' },
  { id: 'maker.dual-rail-polarity', description: '음전원 레일의 극성 소자 방향과 양전원 배치 검사', category: 'power' },
  { id: 'maker.mosfet-gate-resistor', description: '파워 MOSFET 게이트 직렬 저항 누락 검사', category: 'protection' },
  { id: 'maker.adjustable-regulator', description: 'LM317/LM337 계열 가변 레귤레이터 분압 설정 검사', category: 'power' },
  { id: 'companion.external-part-check', description: '저항, 커패시터, 레벨 시프터 같은 동반 부품 검사', category: 'documentation' },
  { id: 'part-master.same-net-companion', description: '데이터시트 기준 바이어스 저항과 신호 레벨 조건을 실제 net 경로로 검사', category: 'signal' },
  { id: 'part-master.signal-level-mismatch', description: '데이터시트 입력 레벨 한계를 넘는 실제 신호 경로 검사', category: 'signal' },
  { id: 'signal.mixed-voltage-tolerance-review', description: '3.3V/5V 혼합 GPIO가 레벨 매칭 없이 직접 묶였는지 검사', category: 'signal' },
  { id: 'reset.por-supervisor-review', description: '리셋 풀업과 POR 지연 또는 supervisor 경로를 검사', category: 'signal' },
  { id: 'manufacturing.reverse-polarity', description: '역극성, RF keepout, 열 방출 같은 제조 전 위험 검사', category: 'manufacturing' },
];

const REGULATOR_MAX_INPUT_FALLBACKS: Array<{ pattern: RegExp; maxVoltage: number }> = [
  { pattern: /\bams?1117\b|\b1117\b/i, maxVoltage: 15 },
  { pattern: /\b(lm|l)?78m0?5\b|\b78m0?5\b|\b7805\b|\bl7805\b|\blm340[-\s]*5(?:\.0)?\b/i, maxVoltage: 35 },
  { pattern: /\blm317[a-z0-9-]*\b/i, maxVoltage: 40 },
];

function createEngineRuntimeIssue(stage: 'audit' | 'netlist' | 'formal' | 'stage-readiness', error: unknown) {
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : '원인을 확인할 수 없는 예외가 발생했습니다.';

  const stageLabel = {
    audit: '설계 리뷰',
    netlist: '회로망 해석',
    formal: '코드-회로 정합성 검사',
    'stage-readiness': '단계 진입 검사',
  }[stage];

  return createProjectAuditIssue({
    severity: 'warning',
    code: 'engine.runtime-error',
    ruleId: 'engine.runtime-error',
    title: '엔진 실행 중 오류 발생',
    message: `${stageLabel} 단계에서 오류가 발생해 일부 결과만 표시합니다. (${detail})`,
    recommendation: '문제가 계속되면 해당 부품 템플릿이나 최근 변경 회로를 먼저 확인한 뒤 다시 검증해 주세요.',
    operation: stage,
  });
}

function createEmptyAuditReport(): ProjectAuditReport {
  return {
    verifiedCount: 0,
    partialCount: 0,
    genericCount: 0,
    issueCount: 0,
    issues: [],
    powerReport: {
      rails: [],
      regulators: [],
    },
    companionReport: {
      requiredCount: 0,
      recommendedCount: 0,
      conditionalCount: 0,
      suggestions: [],
      summary: [],
    },
  };
}

function createEmptyCircuitAnalysisReport(): CircuitAnalysisReport {
  return {
    nets: [],
    resistors: [],
    issues: [],
  };
}

function createEmptyFormalVerificationReport(): FormalVerificationReport {
  return {
    analyzed: false,
    operationCount: 0,
    issueCount: 0,
    issues: [],
    boardPinDriveStates: [],
    engineMeta: {
      language: 'unknown',
      parserBackend: 'none',
      parserTier: 'none',
    },
  };
}

function normalizePinRole(value: string) {
  const normalized = value
    .trim()
    .replace(/^~\{?/, '')
    .replace(/\}?$/, '')
    .replace(/[\s_\-\/()+]/g, '')
    .toUpperCase();

  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'ANODE':
      return 'A';
    case 'CATHODE':
    case 'KATHODE':
      return 'K';
    case 'GROUND':
    case 'PGND':
    case 'DGND':
    case 'AGND':
      return 'GND';
    case 'VI':
    case 'VIN':
    case 'IN':
      return 'VIN';
    case 'VO':
    case 'VOUT':
    case 'OUT':
      return 'VOUT';
    case 'ENABLE':
    case 'CHIPEN':
      return 'EN';
    default:
      return normalized;
  }
}

function parseVoltageFromText(value?: string) {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+(?:\.\d+)?)\s*V\b/i);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function getNetForComponentPin(
  circuitAnalysis: CircuitAnalysisReport,
  componentId: string,
  pinId: string
) {
  return circuitAnalysis.nets.find(net =>
    net.nodes.some(node => node.ownerType === 'component' && node.ownerId === componentId && node.pinId === pinId)
  );
}

function findAssignedComponentPinName(
  circuitAnalysis: CircuitAnalysisReport,
  component: PlacedComponent,
  candidatePinNames: string[]
) {
  const assignedPinName = Object.keys(component.assignedPins).find(pinName =>
    candidatePinNames.some(candidate => normalizePinRole(candidate) === normalizePinRole(pinName))
  );

  if (assignedPinName) {
    return assignedPinName;
  }

  const netMatchedPinName = candidatePinNames.find(candidate =>
    Boolean(getNetForComponentPin(circuitAnalysis, component.instanceId, candidate))
  );
  if (netMatchedPinName) {
    return netMatchedPinName;
  }

  return candidatePinNames[0];
}

function getNetById(circuitAnalysis: CircuitAnalysisReport, netId: string) {
  return circuitAnalysis.nets.find(net => net.id === netId);
}

function isGroundNet(net: CircuitNet) {
  return (
    net.knownVoltage === 0 ||
    net.sourceLabels.some(label => label.toUpperCase().includes('GND')) ||
    net.nodes.some(node => node.electricalType === 'ground')
  );
}

function isPowerNet(net: CircuitNet) {
  return (
    (typeof net.knownVoltage === 'number' && net.knownVoltage > 0) ||
    net.sourceLabels.some(label => {
      const normalized = label.toUpperCase();
      return normalized.includes('5V') || normalized.includes('3.3V') || normalized.includes('VCC') || normalized.includes('VIN');
    })
  );
}

function getNetNominalVoltage(net: CircuitNet) {
  if (typeof net.knownVoltage === 'number') {
    return net.knownVoltage;
  }

  for (const label of net.sourceLabels) {
    const match = label.match(/(\d+(?:\.\d+)?)\s*V/i);
    if (match) {
      const parsed = Number.parseFloat(match[1] ?? '');
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

type LevelShifterChannelNet = {
  componentId: string;
  componentName: string;
  channelId: string;
  hvSupplyNet?: CircuitNet;
  lvSupplyNet?: CircuitNet;
  hvSignalNet?: CircuitNet;
  lvSignalNet?: CircuitNet;
};

type DerivedSignalLimit = {
  pinNames: string[];
  maxVoltage?: number;
  minVoltage?: number;
  note?: string;
  severity?: 'info' | 'warning' | 'error';
};

function collectLevelShifterChannels(
  components: PlacedComponent[],
  circuitAnalysis: CircuitAnalysisReport
): LevelShifterChannelNet[] {
  const channels: LevelShifterChannelNet[] = [];

  for (const component of components) {
    const shifterIdentityText = [
      component.templateId,
      component.name,
      component.value,
      component.importedMapping?.libraryId,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const looksLikeLevelShifter =
      component.templateId === 'tpl_level_shifter' ||
      /level\s*shifter/.test(shifterIdentityText) ||
      /\bbss138\b/.test(shifterIdentityText) ||
      /\btxs0108\b/.test(shifterIdentityText) ||
      /\btxb0108\b/.test(shifterIdentityText);

    if (!looksLikeLevelShifter) {
      continue;
    }

    const hvSupplyNet = getNetForComponentPin(circuitAnalysis, component.instanceId, 'HV');
    const lvSupplyNet = getNetForComponentPin(circuitAnalysis, component.instanceId, 'LV');
    const channelSuffixes = new Set<string>();

    for (const pinName of Object.keys(component.assignedPins)) {
      const match = pinName.match(/^(HV|LV)(\d+)$/i);
      if (match) {
        channelSuffixes.add(match[2] ?? '');
      }
    }

    if (channelSuffixes.size === 0) {
      channelSuffixes.add('1');
    }

    for (const suffix of channelSuffixes) {
      channels.push({
        componentId: component.instanceId,
        componentName: component.name,
        channelId: suffix,
        hvSupplyNet,
        lvSupplyNet,
        hvSignalNet: getNetForComponentPin(circuitAnalysis, component.instanceId, `HV${suffix}`),
        lvSignalNet: getNetForComponentPin(circuitAnalysis, component.instanceId, `LV${suffix}`),
      });
    }
  }

  return channels;
}

function inferSupportedProtocolForPinName(pinName: string) {
  const normalized = normalizePinRole(pinName);

  if (normalized === 'SDA') {
    return 'I2C_SDA';
  }
  if (normalized === 'SCL') {
    return 'I2C_SCL';
  }
  if (normalized === 'SCK' || normalized === 'CLK') {
    return 'SPI_SCK';
  }
  if (normalized === 'MOSI' || normalized === 'DIN' || normalized === 'SDI') {
    return 'SPI_MOSI';
  }
  if (normalized === 'MISO' || normalized === 'DOUT' || normalized === 'SDO') {
    return 'SPI_MISO';
  }
  if (normalized === 'CS' || normalized === 'SS' || normalized === 'NSS' || normalized === 'CSB') {
    return 'SPI_CS';
  }
  if (normalized === 'TX') {
    return 'UART_TX';
  }
  if (normalized === 'RX') {
    return 'UART_RX';
  }

  return undefined;
}

function getLikelyProtectedSignalPins(
  component: PlacedComponent,
  template: ComponentTemplate,
  record = getPartMasterRecordForComponent(component, template)
) {
  const discovered = new Map<string, string>();
  const busProfile = getTemplateBusProfile(template.id);

  for (const [pinName, protocol] of Object.entries(busProfile?.signalPins ?? {})) {
    discovered.set(pinName, protocol);
  }

  for (const pin of template.requiredPins) {
    const inferred = inferSupportedProtocolForPinName(pin.name);
    if (inferred && !discovered.has(pin.name)) {
      discovered.set(pin.name, inferred);
    }
  }

  for (const pinName of record?.pinSchemaJson.signalPins ?? []) {
    const inferred = inferSupportedProtocolForPinName(pinName);
    if (inferred && !discovered.has(pinName)) {
      discovered.set(pinName, inferred);
    }
  }

  return Array.from(discovered.entries()).map(([pinName, protocol]) => ({ pinName, protocol }));
}

function deriveSignalLevelLimits(
  component: PlacedComponent,
  template: ComponentTemplate,
  record = getPartMasterRecordForComponent(component, template)
): DerivedSignalLimit[] {
  const explicitLimits = record?.specsJson.validationHints?.signalLevelLimits ?? [];
  const derivedByPin = new Map<string, DerivedSignalLimit>();

  for (const limit of explicitLimits) {
    for (const pinName of limit.pinNames) {
      derivedByPin.set(normalizePinRole(pinName), {
        pinNames: [...limit.pinNames],
        maxVoltage: limit.maxVoltage,
        minVoltage: limit.minVoltage,
        note: limit.note,
        severity: limit.severity,
      });
    }
  }

  const genericIoMax =
    record?.specsJson.ioVoltage?.max ??
    record?.specsJson.absoluteMax?.ioVoltageMax;

  if (typeof genericIoMax === 'number') {
    for (const { pinName } of getLikelyProtectedSignalPins(component, template, record)) {
      const normalizedPin = normalizePinRole(pinName);
      if (derivedByPin.has(normalizedPin)) {
        continue;
      }
      derivedByPin.set(normalizedPin, {
        pinNames: [pinName],
        maxVoltage: genericIoMax,
        note: `${pinName} 신호는 부품의 I/O 전압 한계 안에서 동작하도록 레벨을 맞추는 편이 안전합니다.`,
        severity: 'error',
      });
    }
  }

  const electricalProfile = COMPONENT_ELECTRICAL_PROFILES[template.id];
  for (const [pinName, pinProfile] of Object.entries(electricalProfile?.signalPins ?? {})) {
    if (typeof pinProfile.maxInputVoltage !== 'number') {
      continue;
    }

    const normalizedPin = normalizePinRole(pinName);
    if (derivedByPin.has(normalizedPin)) {
      continue;
    }

    derivedByPin.set(normalizedPin, {
      pinNames: [pinName],
      maxVoltage: pinProfile.maxInputVoltage,
      note: `${pinName} 입력은 약 ${pinProfile.maxInputVoltage}V 이하로 유지되도록 보호하는 편이 안전합니다.`,
      severity: 'error',
    });
  }

  return Array.from(derivedByPin.values());
}

function isPassivePathOnlyComponent(
  component: PlacedComponent,
  resolveTemplate: DrcEngineContext['resolveTemplate']
) {
  if (component.templateId === 'tpl_resistor' || component.templateId === 'tpl_capacitor' || component.templateId === 'tpl_diode') {
    return true;
  }

  const template = resolveTemplate(component.templateId);
  return template?.category === 'PASSIVE';
}

function getSignalPeerNodesForNet(
  net: CircuitNet | undefined,
  excludedComponentId: string,
  componentById: Map<string, PlacedComponent>,
  resolveTemplate: DrcEngineContext['resolveTemplate']
) {
  if (!net) {
    return [];
  }

  return net.nodes.filter(node => {
    if (node.ownerType === 'board') {
      return true;
    }

    if (node.ownerId === excludedComponentId) {
      return false;
    }

    const component = componentById.get(node.ownerId);
    if (!component) {
      return true;
    }

    return !isPassivePathOnlyComponent(component, resolveTemplate);
  });
}

function isTvsOrEsdLikeComponent(component: PlacedComponent) {
  const identityText = [
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.value,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\btvs\b|\besd\b|\bpesd\b|\btransorb\b/.test(identityText);
}

function hasShuntProtectionOnNet(
  net: CircuitNet,
  circuitAnalysis: CircuitAnalysisReport,
  componentById: Map<string, PlacedComponent>
) {
  return (circuitAnalysis.diodes ?? []).some(diode => {
    if (diode.netA !== net.id && diode.netK !== net.id) {
      return false;
    }

    const component = componentById.get(diode.componentId);
    if (!component || !isTvsOrEsdLikeComponent(component)) {
      return false;
    }

    const peerNetId = diode.netA === net.id ? diode.netK : diode.netA;
    const peerNet = getNetById(circuitAnalysis, peerNetId);
    return Boolean(peerNet && (isGroundNet(peerNet) || isPowerNet(peerNet)));
  });
}

function getLevelShifterChannelForProtectedPin(
  componentId: string,
  pinName: string,
  net: CircuitNet,
  channels: LevelShifterChannelNet[]
) {
  return channels.find(channel => {
    if (channel.lvSignalNet?.id !== net.id && channel.hvSignalNet?.id !== net.id) {
      return false;
    }

    const sideNodes = (channel.lvSignalNet?.id === net.id ? channel.lvSignalNet : channel.hvSignalNet)?.nodes ?? [];
    return sideNodes.some(node =>
      node.ownerType === 'component' &&
      node.ownerId === componentId &&
      normalizePinRole(node.pinId) === normalizePinRole(pinName)
    );
  });
}

function inferRegulatorMaxInputVoltage(
  component: PlacedComponent,
  template: ComponentTemplate | undefined
) {
  const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
  const catalogValue = record?.specsJson.absoluteMax?.supplyVoltageMax;
  if (typeof catalogValue === 'number') {
    return catalogValue;
  }

  const text = [
    component.name,
    component.value,
    template?.name,
    component.importedMapping?.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ]
    .filter(Boolean)
    .join(' ');

  return REGULATOR_MAX_INPUT_FALLBACKS.find(entry => entry.pattern.test(text))?.maxVoltage ?? null;
}

function isRegulatorLike(component: PlacedComponent) {
  if (['tpl_ldo', 'tpl_ldo_regulator', 'tpl_regulator', 'tpl_linear_regulator'].includes(component.templateId)) {
    return true;
  }
  const text = [component.name, component.value, component.importedMapping?.libraryId].filter(Boolean).join(' ');
  return /\bldo\b/i.test(text) || /\bregulator\b/i.test(text) || /\b1117\b/i.test(text) || /\b78m\d+/i.test(text) || /\b78l\d+/i.test(text) || /\blm78/i.test(text);
}

function isCrystalLike(component: PlacedComponent) {
  if (component.templateId === 'tpl_crystal') {
    return true;
  }
  const text = [component.name, component.value, component.importedMapping?.libraryId].filter(Boolean).join(' ');
  return /\bxtal\b/i.test(text) || /\bcrystal\b/i.test(text) || /\bosc\b/i.test(text);
}

function isRtcOscillatorDriver(component: PlacedComponent, template?: ComponentTemplate) {
  const text = [
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.value,
    template?.name,
  ].filter(Boolean).join(' ');

  return /rtc|ds13(?:02|07|37)|ds323[12]|pcf85(?:63|63a)|mcp794|rv-?\d+|rx-?\d+/i.test(text);
}

function isRtcCrystalPin(pinName: string) {
  const normalized = normalizePinRole(pinName);
  return normalized === 'X1' || normalized === 'X2' || normalized === 'XI' || normalized === 'XO';
}

function hasRtcIntegratedLoadCapDriver(
  crystal: PlacedComponent,
  crystalSignalNets: CircuitNet[],
  componentById: Map<string, PlacedComponent>,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const rtcPinsByComponent = new Map<string, Set<string>>();

  for (const net of crystalSignalNets) {
    for (const node of net.nodes) {
      if (node.ownerType !== 'component' || node.ownerId === crystal.instanceId) {
        continue;
      }

      if (!isRtcCrystalPin(node.pinId)) {
        continue;
      }

      const peer = componentById.get(node.ownerId);
      const template = peer ? resolveTemplate(peer.templateId) : undefined;
      if (!peer || !isRtcOscillatorDriver(peer, template)) {
        continue;
      }

      const pins = rtcPinsByComponent.get(peer.instanceId) ?? new Set<string>();
      pins.add(normalizePinRole(node.pinId));
      rtcPinsByComponent.set(peer.instanceId, pins);
    }
  }

  return Array.from(rtcPinsByComponent.values()).some(pins =>
    (pins.has('X1') && pins.has('X2')) || (pins.has('XI') && pins.has('XO'))
  );
}

function isOscillatorPinName(pinName: string) {
  return /^(XTAL1|XTAL2|OSCIN|OSCOUT|XIN|XOUT|XI|XO)$/i.test(pinName.trim());
}

function isResetLikePinName(pinName: string) {
  return /^(RST|RESET|NRST|NRESET|POR|POR_B|NPOR|PORST|RUN|EN|CHIP_EN)$/i.test(pinName.trim());
}

function isLikelyGeneralIoPin(pinName: string) {
  return /^(GPIO\d+|IO\d+|D\d+|A\d+|SDA|SCL|TX|RX|MISO|MOSI|SCK|CLK|CS|SS|INT\d*|PWM\d*)$/i.test(pinName.trim());
}

function isResetSupervisorLike(
  component: PlacedComponent,
  template?: ComponentTemplate
) {
  const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
  if (
    record?.specsJson.tags?.some(tag => /reset-supervisor|voltage-detector|por/i.test(tag)) ||
    /reset\s*supervisor|voltage\s*detector|brown[\s-]*out|power[\s-]*on\s*reset/i.test(record?.normalizedPartName ?? '')
  ) {
    return true;
  }

  const text = [
    component.templateId,
    component.name,
    component.value,
    template?.name,
    component.importedMapping?.libraryId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\breset\b|\bsupervisor\b|\bpor\b|\btps38|\bmcp10|\btlv80|\bstm66/i.test(text);
}

function isMcuLikeComponent(
  component: PlacedComponent,
  template: ComponentTemplate | undefined,
  record = template ? getPartMasterRecordForComponent(component, template) : undefined
) {
  if (record?.specsJson.category === 'mcu') {
    return true;
  }

  const text = [
    component.name,
    component.value,
    template?.id,
    template?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /\bmcu\b|\besp32\b|\batmega\b|\brp2040\b|\bstm32\b|\bpico\b/.test(text);
}

function getComponentSignalNominalVoltage(
  component: PlacedComponent,
  template: ComponentTemplate | undefined,
  pinId: string
) {
  const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
  const normalizedPin = normalizePinRole(pinId);
  const templateProfile = template ? COMPONENT_ELECTRICAL_PROFILES[template.id] : undefined;

  const matchingSignalPin = Object.entries(templateProfile?.signalPins ?? {}).find(
    ([candidatePin]) => normalizePinRole(candidatePin) === normalizedPin
  )?.[1];
  if (typeof matchingSignalPin?.maxInputVoltage === 'number') {
    return matchingSignalPin.maxInputVoltage;
  }

  const ioNominal = record?.specsJson.ioVoltage?.nominal?.[0];
  if (typeof ioNominal === 'number') {
    return ioNominal;
  }

  const supplyTyp = record?.specsJson.supplyVoltage?.typ ?? record?.specsJson.supplyVoltage?.max;
  if (typeof supplyTyp === 'number' && supplyTyp <= 6) {
    return supplyTyp;
  }

  return null;
}

function getActivePeerNodesForNet(
  net: CircuitNet,
  excludedComponentIds: Set<string>,
  componentById: Map<string, PlacedComponent>,
  resolveTemplate: DrcEngineContext['resolveTemplate']
) {
  return net.nodes.filter(node => {
    if (node.ownerType === 'board') {
      return true;
    }

    if (excludedComponentIds.has(node.ownerId)) {
      return false;
    }

    const component = componentById.get(node.ownerId);
    if (!component) {
      return true;
    }

    return !isPassivePathOnlyComponent(component, resolveTemplate);
  });
}

function getConfiguredUnusedPinMode(
  componentUnusedPinModes: ProjectComponentUnusedPinModes | undefined,
  instanceId: string,
  pinId: string
) {
  const pinMap = componentUnusedPinModes?.[instanceId];
  if (!pinMap) {
    return undefined;
  }

  const normalizedTarget = normalizePinRole(pinId);
  return Object.entries(pinMap).find(([candidatePin]) => normalizePinRole(candidatePin) === normalizedTarget)?.[1];
}

function buildCriticalElectricalIssues(
  context: DrcEngineContext,
  circuitAnalysis: CircuitAnalysisReport
) {
  const issues: ProjectAuditIssue[] = [];
  const componentById = new Map(context.components.map(component => [component.instanceId, component]));
  const groundNets = new Set(circuitAnalysis.nets.filter(isGroundNet).map(net => net.id));
  const levelShifterChannels = collectLevelShifterChannels(context.components, circuitAnalysis);

  for (const net of circuitAnalysis.nets) {
    const sources = new Set<string>();

    if (net.sourceLabels.some(label => label === '5V' || label === '3.3V')) {
      sources.add(`board:${net.sourceLabels.filter(label => label === '5V' || label === '3.3V').join('/')}`);
    }

    for (const node of net.nodes) {
      if (node.ownerType !== 'component') {
        continue;
      }
      const component = componentById.get(node.ownerId);
      if (!component) {
        continue;
      }
      const role = normalizePinRole(node.pinId);

      if (component.templateId === 'tpl_external_power' && ['V+', 'VIN', 'VOUT'].includes(node.pinId)) {
        sources.add(`${component.name}:${node.pinId}`);
      } else if (isRegulatorLike(component) && role === 'VOUT') {
        sources.add(`${component.name}:${node.pinId}`);
      }
    }

    if (sources.size >= 2) {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'power.source-collision',
        params: {
          sourceList: Array.from(sources),
        },
        title: '전원 소스 충돌 위험',
        message: `같은 전원 넷에 ${Array.from(sources).join(', ')} 이(가) 동시에 전원 소스로 보입니다. 보호 회로 없이 직접 묶이면 역전류나 전원 충돌이 발생할 수 있습니다.`,
        ruleId: 'power.source-collision',
        recommendation: '전원 OR-ing 다이오드, ideal diode, 전원 셀렉터, 또는 명확한 분리 경로를 두어 독립 전원 소스가 직접 충돌하지 않게 정리하세요.',
        visualTargets: {
          netIds: [net.id],
          componentIds: net.nodes
            .filter(node => node.ownerType === 'component')
            .map(node => node.ownerId),
        },
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: `전원 net ${net.id}에서 둘 이상의 독립 전원 소스가 동시에 공급원으로 감지됐습니다.`,
          observedFacts: [
            `Affected net: ${net.id}`,
            `Detected source count: ${sources.size}`,
            `Detected sources: ${Array.from(sources).join(', ')}`,
          ],
          assumptions: [],
          checkedBy: ['netlist'],
          affectedComponents: net.nodes.filter(node => node.ownerType === 'component').map(node => node.ownerId),
          affectedNets: [net.id],
          howToVerify: '같은 전원 net에 독립 소스가 직접 묶였는지 확인하고, OR-ing 다이오드나 전원 셀렉터 없이 병합되지 않도록 분리하세요.',
        },
      }));
    }
  }

  for (const component of context.components) {
    const template = context.resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const record = getPartMasterRecordForComponent(component, template);
    const canonicalLabel = record?.canonicalMpn ?? template.name ?? component.templateId;
    const hints = record?.specsJson.validationHints;
    const signalLevelLimits = deriveSignalLevelLimits(component, template, record);

    if (signalLevelLimits.length === 0 && !hints) {
      continue;
    }

    for (const signalLimit of signalLevelLimits) {
      const matchedPinName = findAssignedComponentPinName(circuitAnalysis, component, signalLimit.pinNames);
      if (!matchedPinName) {
        continue;
      }

      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, matchedPinName);
      if (!net) {
        continue;
      }

      const matchedLevelShifterChannel = getLevelShifterChannelForProtectedPin(
        component.instanceId,
        matchedPinName,
        net,
        levelShifterChannels
      );

      const overdrivingBoardNode = net.nodes.find(node => {
        if (node.ownerType !== 'board') {
          return false;
        }
        const spec = getBoardSignalLimits(context.boardId, node.pinId);
        if (!spec || spec.isGround) {
          return false;
        }
        if (typeof signalLimit.maxVoltage === 'number' && spec.nominal > signalLimit.maxVoltage + 1e-6) {
          return true;
        }
        if (typeof signalLimit.minVoltage === 'number' && spec.nominal < signalLimit.minVoltage - 1e-6) {
          return true;
        }
        return false;
      });

      if (overdrivingBoardNode) {
        const boardSpec = getBoardSignalLimits(context.boardId, overdrivingBoardNode.pinId);
        issues.push(createDrcIssue({
          severity: signalLimit.severity ?? 'error',
          code: 'part-master.signal-level-mismatch',
          ruleId: 'part-master.signal-level-mismatch',
          title: '데이터시트 입력 레벨 한계 초과 위험',
          message: `${component.name} (${canonicalLabel})의 ${matchedPinName} 핀이 ${overdrivingBoardNode.pinId} 보드 신호와 같은 net에 직접 연결되어 있습니다. 이 라인은 약 ${boardSpec?.nominal ?? '?'}V로 동작할 수 있어 데이터시트 한계와 맞지 않을 수 있습니다.`,
          recommendation: signalLimit.note ?? `${matchedPinName} 입력 앞에 분압 또는 레벨 시프터를 두고 허용 입력 전압 범위 안으로 맞추세요.`,
          componentName: component.name,
          visualTargets: {
            componentIds: [component.instanceId],
            netIds: [net.id],
            pinIds: [matchedPinName],
          },
          evidence: {
            confidence: 'confirmed',
            evidenceSummary: `${component.name}의 ${matchedPinName} 핀이 약 ${boardSpec?.nominal ?? '?'}V 보드 신호와 직접 같은 net에 있어 허용 입력 범위를 넘길 가능성이 높습니다.`,
            observedFacts: [
              `Affected component: ${component.name}`,
              `Affected pin: ${matchedPinName}`,
              `Board pin: ${overdrivingBoardNode.pinId}`,
              `Board nominal voltage: ${boardSpec?.nominal ?? '?'}V`,
              `Signal net: ${net.id}`,
            ],
            assumptions: [],
            checkedBy: ['netlist', 'datasheet-rule'],
            affectedComponents: [component.instanceId],
            affectedNets: [net.id],
            howToVerify: signalLimit.note ?? `${matchedPinName} 입력 앞에 분압 또는 레벨 시프터를 두고 허용 입력 전압 범위 안으로 맞추세요.`,
          },
        }));

        if (!hasShuntProtectionOnNet(net, circuitAnalysis, componentById)) {
          issues.push(createDrcIssue({
            severity: 'info',
            code: 'part-master.protection-path-missing',
            policyKey: 'part-master.protection-path-missing',
            ruleId: 'part-master.same-net-companion',
            title: '보호 소자의 실제 신호 경로 미확인',
            message: `${component.name} (${canonicalLabel})의 ${matchedPinName} 핀이 과전압 가능성이 있는 ${overdrivingBoardNode.pinId} net에 직접 연결되어 있지만, 같은 신호 net에서 GND/전원으로 빠지는 TVS/ESD 클램프 경로를 찾지 못했습니다.`,
            recommendation: `${matchedPinName} 라인에 실제 신호 net 기준 TVS/ESD 클램프나 올바른 레벨 시프터 경로를 추가해 과전압 스트레스를 줄이세요.`,
            componentName: component.name,
            visualTargets: {
              componentIds: [component.instanceId],
              netIds: [net.id],
              pinIds: [matchedPinName],
            },
            evidence: {
              confidence: 'needs-review',
              evidenceSummary: `${component.name}의 ${matchedPinName} 신호선에서 실제 GND/전원 클램프 경로가 확인되지 않았습니다.`,
              observedFacts: [
                `Affected component: ${component.name}`,
                `Affected pin: ${matchedPinName}`,
                `Signal net: ${net.id}`,
                `Overdriving board pin: ${overdrivingBoardNode.pinId}`,
              ],
              assumptions: [
                '보호 다이오드나 TVS가 다른 시트에 있거나 현재 net graph에서 신호선과 정확히 연결된 경로로 복원되지 않았을 수 있습니다.',
              ],
              checkedBy: ['netlist', 'datasheet-rule'],
              affectedComponents: [component.instanceId],
              affectedNets: [net.id],
              howToVerify: `${matchedPinName} 라인에 실제 신호 net 기준 TVS/ESD 클램프나 올바른 레벨 시프터 경로가 있는지 경로 기준으로 다시 확인하세요.`,
            },
          }));
        }
        continue;
      }

      const shifterMismatch = levelShifterChannels.find(channel => {
        if (channel.hvSignalNet?.id !== net.id) {
          return false;
        }

        const hvVoltage = channel.hvSupplyNet ? getNetNominalVoltage(channel.hvSupplyNet) : null;
        const lvVoltage = channel.lvSupplyNet ? getNetNominalVoltage(channel.lvSupplyNet) : null;
        if (hvVoltage == null || lvVoltage == null) {
          return false;
        }
        if (typeof signalLimit.maxVoltage !== 'number' || hvVoltage <= signalLimit.maxVoltage + 1e-6) {
          return false;
        }
        if (lvVoltage > signalLimit.maxVoltage + 1e-6) {
          return false;
        }

        return (
          channel.lvSignalNet?.nodes.some(node => {
            if (node.ownerType === 'board') {
              return true;
            }
            return !(node.ownerType === 'component' && node.ownerId === channel.componentId);
          }) ?? false
        );
      });

      if (shifterMismatch) {
        const hvVoltage = shifterMismatch.hvSupplyNet ? getNetNominalVoltage(shifterMismatch.hvSupplyNet) : null;
        const lvVoltage = shifterMismatch.lvSupplyNet ? getNetNominalVoltage(shifterMismatch.lvSupplyNet) : null;
        issues.push(createDrcIssue({
          severity: signalLimit.severity ?? 'error',
          code: 'part-master.level-shifter-side-mismatch',
          policyKey: 'part-master.level-shifter-side-mismatch',
          ruleId: 'part-master.same-net-companion',
          title: '레벨 시프터 채널 방향 배치 오류 가능성',
          message: `${component.name} (${canonicalLabel})의 ${matchedPinName} 핀이 ${shifterMismatch.componentName}의 HV${shifterMismatch.channelId} 쪽에 연결된 것으로 보입니다. 이 채널의 HV 전원은 약 ${hvVoltage ?? '?'}V, LV 전원은 약 ${lvVoltage ?? '?'}V라서 저전압 입력 핀은 보통 LV${shifterMismatch.channelId} 쪽에 두는 편이 안전합니다.`,
          recommendation: signalLimit.note ?? `${matchedPinName} 같은 저전압 입력은 레벨 시프터의 LV 채널에 두고, 보드 쪽 고전압 신호를 HV 채널에 연결해 주세요.`,
          componentName: component.name,
          visualTargets: {
            componentIds: [component.instanceId, shifterMismatch.componentId],
            netIds: [net.id, shifterMismatch.hvSignalNet?.id, shifterMismatch.lvSignalNet?.id].filter(Boolean) as string[],
            pinIds: [matchedPinName],
          },
          evidence: {
            confidence: 'strong-inference',
            evidenceSummary: `${component.name}의 ${matchedPinName} 저전압 핀이 레벨 시프터 ${shifterMismatch.componentName}의 HV 채널 쪽에 연결된 것으로 보입니다.`,
            observedFacts: [
              `Affected component: ${component.name}`,
              `Affected pin: ${matchedPinName}`,
              `Level shifter: ${shifterMismatch.componentName}`,
              `Matched channel side: HV${shifterMismatch.channelId}`,
              `HV supply voltage: ${hvVoltage ?? '?'}V`,
              `LV supply voltage: ${lvVoltage ?? '?'}V`,
            ],
            assumptions: [],
            checkedBy: ['netlist', 'datasheet-rule'],
            affectedComponents: [component.instanceId, shifterMismatch.componentId],
            affectedNets: [net.id, shifterMismatch.hvSignalNet?.id, shifterMismatch.lvSignalNet?.id].filter(Boolean) as string[],
            howToVerify: signalLimit.note ?? `${matchedPinName} 같은 저전압 입력은 레벨 시프터의 LV 채널에 두고, 보드 쪽 고전압 신호를 HV 채널에 연결해 주세요.`,
          },
        }));
        continue;
      }

      if (matchedLevelShifterChannel) {
        const channel = matchedLevelShifterChannel;
        const protectedPinOnHvSide = channel.hvSignalNet?.id === net.id;
        const protectedPinOnLvSide = channel.lvSignalNet?.id === net.id;
        const oppositeNet = protectedPinOnHvSide ? channel.lvSignalNet : protectedPinOnLvSide ? channel.hvSignalNet : undefined;
        const oppositePeers = getSignalPeerNodesForNet(
          oppositeNet,
          channel.componentId,
          componentById,
          context.resolveTemplate
        );

        if (oppositePeers.length === 0) {
          const oppositePinLabel = protectedPinOnHvSide ? `LV${channel.channelId}` : `HV${channel.channelId}`;
          issues.push(createDrcIssue({
            severity: 'info',
            code: 'part-master.level-shifter-path-incomplete',
            ruleId: 'part-master.level-shifter-path-incomplete',
            title: '레벨 시프터 실제 신호 경로 미완성',
            message: `${component.name} (${canonicalLabel})의 ${matchedPinName} 핀이 ${channel.componentName}의 ${protectedPinOnHvSide ? `HV${channel.channelId}` : `LV${channel.channelId}`} 쪽에는 연결되어 있지만, 반대편 ${oppositePinLabel} 쪽에서 실제 외부 신호 peer를 찾지 못했습니다.`,
            recommendation: signalLimit.note ?? `${matchedPinName} 신호가 레벨 시프터를 실제로 통과하려면 같은 채널의 반대편 ${oppositePinLabel}에도 대응 신호를 연결해 주세요.`,
            componentName: component.name,
            visualTargets: {
              componentIds: [component.instanceId, channel.componentId],
              netIds: [net.id, oppositeNet?.id].filter(Boolean) as string[],
            },
            confidence: 'needs-review',
            evidence: {
              confidence: 'needs-review',
              evidenceSummary: `${matchedPinName} 신호가 레벨 시프터 ${channel.componentName}의 한쪽 채널에는 닿지만 반대편에서는 이어지는 실제 peer 신호가 확인되지 않았습니다.`,
              observedFacts: [
                `Affected component: ${component.name}`,
                `Matched pin: ${matchedPinName}`,
                `Level shifter: ${channel.componentName}`,
                `Connected side: ${protectedPinOnHvSide ? `HV${channel.channelId}` : `LV${channel.channelId}`}`,
                `Missing peer side: ${oppositePinLabel}`,
              ],
              assumptions: [
                '오프시트 연결이나 생략된 보조 배선이 현재 net graph에 반영되지 않았을 수 있습니다.',
              ],
              checkedBy: ['netlist', 'datasheet-rule'],
              affectedComponents: [component.instanceId, channel.componentId],
              affectedNets: [net.id, oppositeNet?.id].filter(Boolean) as string[],
              howToVerify: signalLimit.note ?? `${matchedPinName}가 실제로 레벨 시프터를 통과하도록 ${oppositePinLabel} 쪽 peer 신호도 같은 채널에 연결했는지 확인하세요.`,
            },
          }));
        }
      }
    }

    if (!hints) {
      continue;
    }

    for (const bias of hints.biasResistors ?? []) {
      const matchedPinName = findAssignedComponentPinName(circuitAnalysis, component, bias.pinNames);
      if (!matchedPinName) {
        continue;
      }

      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, matchedPinName);
      if (!net) {
        continue;
      }

      const expectedReference = bias.kind === 'pull-down' ? isGroundNet : isPowerNet;
      const matchingResistors = circuitAnalysis.resistors.filter(resistor => {
        const touchesPinNet = resistor.netA === net.id || resistor.netB === net.id;
        if (!touchesPinNet) {
          return false;
        }
        const peerNetId = resistor.netA === net.id ? resistor.netB : resistor.netA;
        const peerNet = circuitAnalysis.nets.find(candidate => candidate.id === peerNetId);
        if (!peerNet || !expectedReference(peerNet)) {
          return false;
        }
        if (bias.resistanceRangeOhms) {
          const [minOhms, maxOhms] = bias.resistanceRangeOhms;
          return resistor.resistanceOhms >= minOhms && resistor.resistanceOhms <= maxOhms;
        }
        return true;
      });

      if (matchingResistors.length >= (bias.minimumCount ?? 1)) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: bias.severity ?? 'warning',
        code: 'part-master.same-net-bias-missing',
        ruleId: 'part-master.same-net-companion',
        title: '데이터시트 기준 바이어스 저항 미확인',
        message: `${component.name} (${record.canonicalMpn})의 ${matchedPinName} net에서 ${bias.kind === 'pull-down' ? '풀다운' : '풀업'} 저항 경로를 찾지 못했습니다.`,
        recommendation: bias.note ?? `${matchedPinName} 라인을 ${bias.kind === 'pull-down' ? 'GND' : '전원'} 쪽으로 바이어스하는 저항을 실제 회로 net에 넣어 주세요.`,
        componentName: component.name,
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [matchedPinName],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name}의 ${matchedPinName} net에서 기대되는 ${bias.kind === 'pull-down' ? '풀다운' : '풀업'} 저항 경로가 확인되지 않았습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected pin: ${matchedPinName}`,
            `Signal net: ${net.id}`,
            `Matching resistor count: ${matchingResistors.length}`,
          ],
          assumptions: [
            '보조 저항이 다른 시트에 있거나, 허용 저항 범위를 벗어난 값으로 배치되어 현재 규칙에 잡히지 않았을 수 있습니다.',
          ],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: bias.note ?? `${matchedPinName} 라인을 ${bias.kind === 'pull-down' ? 'GND' : '전원'} 쪽으로 바이어스하는 저항을 실제 같은 net에 배치했는지 확인하세요.`,
        },
      }));
    }

    for (const strap of hints.strapPins ?? []) {
      const matchedPinName = findAssignedComponentPinName(circuitAnalysis, component, strap.pinNames);
      if (!matchedPinName) {
        continue;
      }

      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, matchedPinName);
      if (!net) {
        continue;
      }

      const matchingResistors = circuitAnalysis.resistors.filter(resistor => {
        const touchesPinNet = resistor.netA === net.id || resistor.netB === net.id;
        if (!touchesPinNet) {
          return false;
        }

        const peerNet = getNetById(circuitAnalysis, resistor.netA === net.id ? resistor.netB : resistor.netA);
        if (!peerNet) {
          return false;
        }

        const matchesReference = strap.allowedReferences.some(reference => {
          if (reference === 'ground') {
            return isGroundNet(peerNet);
          }
          return isPowerNet(peerNet);
        });
        if (!matchesReference) {
          return false;
        }

        if (strap.resistanceRangeOhms) {
          const [minOhms, maxOhms] = strap.resistanceRangeOhms;
          return resistor.resistanceOhms >= minOhms && resistor.resistanceOhms <= maxOhms;
        }

        return true;
      });

      if (matchingResistors.length >= (strap.minimumCount ?? 1)) {
        continue;
      }

      const referenceLabel = strap.allowedReferences
        .map(reference => (reference === 'ground' ? 'GND' : '전원'))
        .join(' 또는 ');

      issues.push(createDrcIssue({
        severity: strap.severity ?? 'warning',
        code: 'part-master.strap-bias-missing',
        ruleId: 'part-master.same-net-companion',
        title: '데이터시트 기준 스트랩 저항 미확인',
        message: `${component.name} (${record.canonicalMpn})의 ${matchedPinName} net에서 ${referenceLabel} 기준 스트랩 저항을 찾지 못했습니다.`,
        recommendation: strap.note ?? `${matchedPinName} 핀을 ${referenceLabel} 쪽 기준으로 실제 net에 저항 연결해 부팅/주소 상태를 고정해 주세요.`,
        componentName: component.name,
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [matchedPinName],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name}의 ${matchedPinName} net에서 ${referenceLabel} 기준 스트랩 저항이 확인되지 않았습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected pin: ${matchedPinName}`,
            `Signal net: ${net.id}`,
            `Matching strap resistor count: ${matchingResistors.length}`,
          ],
          assumptions: [
            '주소/부트 스트랩 저항이 다른 시트에 있거나 현재 허용 기준과 다른 값으로 배치되어 있을 수 있습니다.',
          ],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: strap.note ?? `${matchedPinName} 핀을 ${referenceLabel} 쪽 기준으로 실제 같은 net에 저항 연결해 부팅/주소 상태를 고정했는지 확인하세요.`,
        },
      }));
    }
  }

  for (const component of context.components) {
    const explicitNcPins = new Set<string>();
    const template = context.resolveTemplate(component.templateId);
    const record = template ? getPartMasterRecordForComponent(component, template) : undefined;

    for (const pin of template?.requiredPins ?? []) {
      if (/^NC\d*$/i.test(pin.name.trim())) {
        explicitNcPins.add(pin.name);
      }
    }

    for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
      if (/^NC\d*$/i.test(anchor.pinId.trim()) || /^NC\d*$/i.test(anchor.label.trim())) {
        explicitNcPins.add(anchor.pinId);
        explicitNcPins.add(anchor.label);
      }
    }

    for (const pinId of explicitNcPins) {
      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (!net) {
        continue;
      }

      const isConnected = net.nodes.some(node => !(node.ownerType === 'component' && node.ownerId === component.instanceId && node.pinId === pinId));
      if (!isConnected) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: 'error',
        code: 'electrical.nc-pin-violation',
        params: {
          componentName: component.name,
          pinId,
        },
        componentName: component.name,
        title: 'NC 핀 연결 금지 위반',
        message: `${component.name}의 ${pinId} 핀은 NC(No Connect)로 보이는데, 현재 다른 넷과 연결되어 있습니다.`,
        ruleId: 'electrical.nc-pin-violation',
        recommendation: 'NC 핀은 비워 두는 것이 안전합니다. 해당 핀으로 지나가는 배선을 제거하고, 필요한 신호는 실제 기능 핀으로 옮기세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [pinId],
        },
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: `${component.name}의 ${pinId} 핀이 NC로 보이는데도 net ${net.id}에 실제 연결되어 있습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected pin: ${pinId}`,
            `Connected net: ${net.id}`,
          ],
          assumptions: [],
          checkedBy: ['netlist'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: '해당 핀이 정말 NC인지 데이터시트를 다시 확인하고, NC가 맞으면 이 핀으로 이어진 배선을 제거하세요.',
        },
      }));
    }

    for (const pinId of record?.pinSchemaJson.reservedPins ?? []) {
      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (!net) {
        continue;
      }

      const isConnected = net.nodes.some(node => !(node.ownerType === 'component' && node.ownerId === component.instanceId && normalizePinRole(node.pinId) === normalizePinRole(pinId)));
      if (!isConnected) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: 'error',
        code: 'electrical.reserved-pin-violation',
        componentName: component.name,
        title: 'Reserved 핀 연결 금지 위반',
        message: `${component.name}의 ${pinId} 핀은 reserved 핀으로 분류되는데, 현재 다른 신호와 연결되어 있습니다.`,
        ruleId: 'electrical.reserved-pin-violation',
        recommendation: 'Reserved 핀은 데이터시트에서 허용한 경우가 아니면 연결하지 않는 편이 안전합니다. 해당 연결을 제거하거나 공식 권장 용도로만 사용하세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [pinId],
        },
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: `${component.name}의 reserved 핀 ${pinId}이 net ${net.id}에 실제 연결되어 있습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected reserved pin: ${pinId}`,
            `Connected net: ${net.id}`,
          ],
          assumptions: [],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: '이 핀이 reserved 핀인지 데이터시트를 다시 확인하고, 공식 권장 용도가 아니라면 연결을 제거하세요.',
        },
      }));
    }
  }

  for (const component of context.components) {
    if (!isCrystalLike(component)) {
      continue;
    }

    const nets = circuitAnalysis.nets.filter(net =>
      net.nodes.some(node => node.ownerType === 'component' && node.ownerId === component.instanceId)
    );
    const crystalSignalNets = nets.filter(net => !isGroundNet(net) && !isPowerNet(net));
    if (crystalSignalNets.length < 2) {
      continue;
    }

    if (hasRtcIntegratedLoadCapDriver(component, crystalSignalNets, componentById, context.resolveTemplate)) {
      continue;
    }

    const missingLoadCap = crystalSignalNets.some(crystalNet => {
      return !((circuitAnalysis.capacitors ?? []).some(capacitor =>
        (capacitor.netA === crystalNet.id && groundNets.has(capacitor.netB)) ||
        (capacitor.netB === crystalNet.id && groundNets.has(capacitor.netA))
      ));
    });

    if (!missingLoadCap) {
      continue;
    }

    issues.push(createDrcIssue({
      severity: 'error',
      code: 'clock.crystal-load-cap-missing',
      params: {
        componentName: component.name,
      },
      componentName: component.name,
      title: '크리스털 로드 커패시터 누락 의심',
      message: `${component.name}의 양단 신호선 중 하나 이상에서 GND로 복귀하는 로드 커패시터를 찾지 못했습니다.`,
      ruleId: 'clock.crystal-load-cap-missing',
      recommendation: '크리스털 양단 각각에 12pF~22pF 정도의 커패시터를 GND로 연결하고, MCU와 최대한 가깝게 배치하세요.',
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: crystalSignalNets.map(net => net.id),
      },
      evidence: {
        confidence: 'strong-inference',
        evidenceSummary: `${component.name} 양단에서 기대되는 GND 복귀 로드 커패시터 중 하나 이상이 netlist에서 확인되지 않았습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Crystal signal nets: ${crystalSignalNets.map(net => net.id).join(', ')}`,
          `Ground nets reviewed: ${Array.from(groundNets).join(', ') || 'none'}`,
        ],
        assumptions: [],
        checkedBy: ['netlist'],
        affectedComponents: [component.instanceId],
        affectedNets: crystalSignalNets.map(net => net.id),
        howToVerify: '크리스털 양단 각각에서 GND로 돌아가는 로드 커패시터가 실제로 있는지 확인하고, 없으면 12pF~22pF 수준으로 추가하세요.',
      },
    }));
  }

  for (const component of context.components) {
    if (!isCrystalLike(component)) {
      continue;
    }

    const nets = circuitAnalysis.nets.filter(net =>
      net.nodes.some(node => node.ownerType === 'component' && node.ownerId === component.instanceId)
    );
    const crystalSignalNets = nets.filter(net => !isGroundNet(net) && !isPowerNet(net));
    if (crystalSignalNets.length === 0) {
      continue;
    }

    const activePeers = crystalSignalNets.flatMap(net =>
      getActivePeerNodesForNet(
        net,
        new Set([component.instanceId]),
        componentById,
        context.resolveTemplate
      )
    );

    if (activePeers.length >= 2) {
      continue;
    }

    issues.push(createDrcIssue({
      severity: 'warning',
      code: 'clock.clock-source-missing',
      componentName: component.name,
      title: '크리스털 구동 대상 또는 클럭 경로 미확인',
      message: `${component.name} 주변에서 실제로 이 크리스털을 사용하는 MCU/클럭 입력 peer를 충분히 찾지 못했습니다.`,
      ruleId: 'clock.clock-source-review',
      recommendation: '크리스털 양단이 MCU의 XTAL/XIN/XOUT 같은 클럭 핀으로 실제 연결되는지, 또는 외부 오실레이터/클럭 소스로 대체한 것인지 다시 확인하세요.',
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: crystalSignalNets.map(net => net.id),
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `${component.name}가 연결된 크리스털 신호선에서 실제 MCU 클럭 입력 peer가 충분히 확인되지 않았습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Crystal signal nets: ${crystalSignalNets.map(net => net.id).join(', ')}`,
          `Active peer count: ${activePeers.length}`,
        ],
        assumptions: [
          '오프시트 클럭 연결이나 외부 오실레이터 모듈이 현재 net graph에 완전히 반영되지 않았을 수 있습니다.',
        ],
        checkedBy: ['netlist'],
        affectedComponents: [component.instanceId],
        affectedNets: crystalSignalNets.map(net => net.id),
        howToVerify: '크리스털 양단이 실제 MCU XTAL/XIN/XOUT 핀으로 이어지는지, 아니면 외부 클럭 소스를 쓰는 설계인지 회로도와 설정에서 다시 확인하세요.',
      },
    }));
  }

  for (const component of context.components) {
    const template = context.resolveTemplate(component.templateId);
    const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
    if (!isMcuLikeComponent(component, template, record)) {
      continue;
    }

    const oscillatorPins = new Set<string>();
    for (const pin of template?.requiredPins ?? []) {
      if (isOscillatorPinName(pin.name)) {
        oscillatorPins.add(pin.name);
      }
    }
    for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
      if (isOscillatorPinName(anchor.pinId)) {
        oscillatorPins.add(anchor.pinId);
      }
      if (isOscillatorPinName(anchor.label)) {
        oscillatorPins.add(anchor.label);
      }
    }

    if (oscillatorPins.size === 0) {
      continue;
    }

    const connectedOscillatorNets = Array.from(oscillatorPins)
      .map(pinId => getNetForComponentPin(circuitAnalysis, component.instanceId, pinId))
      .filter((net): net is CircuitNet => Boolean(net));

    if (connectedOscillatorNets.length === 0) {
      continue;
    }

    const hasCrystalOrOscillatorSource = connectedOscillatorNets.some(net =>
      net.nodes.some(node => {
        if (node.ownerType !== 'component' || node.ownerId === component.instanceId) {
          return false;
        }
        const peer = componentById.get(node.ownerId);
        return Boolean(peer && isCrystalLike(peer));
      })
    );

    if (hasCrystalOrOscillatorSource) {
      continue;
    }

    issues.push(createDrcIssue({
      severity: 'warning',
      code: 'clock.clock-source-missing',
      componentName: component.name,
      title: 'MCU 클럭 소스 미확인',
      message: `${component.name}의 XTAL/OSC 계열 핀은 연결되어 있지만, 실제 크리스털 또는 오실레이터 소스를 찾지 못했습니다.`,
      ruleId: 'clock.clock-source-review',
      recommendation: '외부 크리스털을 쓴다면 양단과 로드 커패시터를 확인하고, 내부 클럭만 쓸 계획이면 해당 핀이 떠 있지 않게 회로와 설정을 일치시키세요.',
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: connectedOscillatorNets.map(net => net.id),
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `${component.name}의 XTAL/OSC 핀은 연결되어 있지만, 반대편에서 크리스털 또는 오실레이터 소스가 확인되지 않았습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Oscillator pins: ${Array.from(oscillatorPins).join(', ')}`,
          `Connected oscillator nets: ${connectedOscillatorNets.map(net => net.id).join(', ')}`,
        ],
        assumptions: [
          '해당 MCU가 내부 클럭만 사용하도록 의도되었거나, 외부 클럭 소스가 현재 복원 모델에 드러나지 않았을 수 있습니다.',
        ],
        checkedBy: ['netlist'],
        affectedComponents: [component.instanceId],
        affectedNets: connectedOscillatorNets.map(net => net.id),
        howToVerify: '외부 크리스털/오실레이터를 실제로 쓰는지 확인하고, 내부 클럭만 쓰는 설계라면 XTAL/OSC 핀 배선과 펌웨어 설정이 일치하는지 점검하세요.',
      },
    }));
  }

  for (const component of context.components) {
    if (!isRegulatorLike(component)) {
      continue;
    }

    const template = context.resolveTemplate(component.templateId);
    const inputCandidates = ['VIN', 'VI', 'IN', 'V+', '1'];
    let inputNet: CircuitNet | undefined;
    for (const pinId of inputCandidates) {
      inputNet = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (inputNet) {
        break;
      }
    }

    if (!inputNet) {
      continue;
    }

    let inputVoltage = typeof inputNet.knownVoltage === 'number' ? inputNet.knownVoltage : null;
    if (inputVoltage == null) {
      for (const node of inputNet.nodes) {
        if (node.ownerType !== 'component') {
          continue;
        }
        const sourceComponent = componentById.get(node.ownerId);
        if (!sourceComponent) {
          continue;
        }
        inputVoltage = parseVoltageFromText(sourceComponent.value) ?? parseVoltageFromText(sourceComponent.name);
        if (inputVoltage != null) {
          break;
        }
      }
    }

    const maxInputVoltage = inferRegulatorMaxInputVoltage(component, template);
    if (!maxInputVoltage) {
      issues.push(createDrcIssue({
        severity: 'warning',
        code: 'power.regulator-max-input-unknown',
        policyKey: 'power.regulator-max-input-unknown',
        componentName: component.name,
        title: '레귤레이터 최대 입력 전압 데이터 미확인',
        message: `${component.name}의 입력 전압 경로는 보이지만, 이 레귤레이터의 최대 입력 전압을 카탈로그나 fallback 패밀리 규칙에서 확정하지 못했습니다.`,
        ruleId: 'power.regulator-max-input',
        recommendation: '실제 부품명을 part master에 연결하거나 데이터시트의 absolute maximum ratings에서 VIN 한계를 확인해 입력 전압과 비교하세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [inputNet.id],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name} 입력 net은 확인됐지만, 최대 허용 입력 전압 데이터를 part master나 fallback 규칙에서 찾지 못했습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Input net: ${inputNet.id}`,
            `Observed input voltage: ${inputVoltage == null ? 'unknown' : `${inputVoltage}V`}`,
          ],
          assumptions: [
            '현재 부품명이 generic하거나 part master 매칭이 부족해 실제 절대최대 입력 스펙을 확정하지 못했을 수 있습니다.',
          ],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [inputNet.id],
          howToVerify: '정확한 MPN으로 part master를 보강하거나 데이터시트 absolute maximum ratings에서 VIN 한계를 직접 확인하세요.',
        },
      }));
      continue;
    }

    if (inputVoltage == null || inputVoltage <= maxInputVoltage) {
      continue;
    }

    issues.push(createDrcIssue({
      severity: 'error',
      code: 'power.regulator-max-input',
      params: {
        componentName: component.name,
        inputVoltage,
        maxInputVoltage,
      },
      componentName: component.name,
      title: '레귤레이터 입력 전압 초과',
      message: `${component.name} 입력으로 약 ${inputVoltage}V가 들어가는데, 현재 추정 최대 허용 입력은 ${maxInputVoltage}V 수준입니다.`,
      ruleId: 'power.regulator-max-input',
      recommendation: '입력 전압을 낮추거나, 더 높은 입력 내압을 가진 레귤레이터 또는 DCDC 전원단으로 바꾸세요.',
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: [inputNet.id],
      },
      evidence: {
        confidence: 'confirmed',
        evidenceSummary: `${component.name} 입력 net에서 관측된 전압이 추정 최대 허용 입력 ${maxInputVoltage}V를 초과합니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Input net: ${inputNet.id}`,
          `Observed input voltage: ${inputVoltage}V`,
          `Max input voltage: ${maxInputVoltage}V`,
        ],
        assumptions: [],
        checkedBy: ['netlist', 'datasheet-rule'],
        affectedComponents: [component.instanceId],
        affectedNets: [inputNet.id],
        howToVerify: '실제 입력 전압과 레귤레이터 VIN 절대최대치를 다시 확인하고, 입력을 낮추거나 더 높은 내압의 전원단으로 바꾸세요.',
      },
    }));
  }

  for (const component of context.components) {
    const template = context.resolveTemplate(component.templateId);
    const record = template ? getPartMasterRecordForComponent(component, template) : null;
    if (!isMcuLikeComponent(component, template, record ?? undefined)) {
      continue;
    }

    const hints = record?.specsJson.validationHints;
    const bootstrapPins = new Set<string>();

    for (const pin of template?.requiredPins ?? []) {
      if (/^(GPIO0|IO0|BOOT0|EN|CHIP_EN)$/i.test(pin.name.trim())) {
        bootstrapPins.add(pin.name);
      }
    }

    for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
      if (/^(GPIO0|IO0|BOOT0|EN|CHIP_EN)$/i.test(anchor.pinId.trim()) || /^(GPIO0|IO0|BOOT0|EN|CHIP_EN)$/i.test(anchor.label.trim())) {
        bootstrapPins.add(anchor.pinId);
        bootstrapPins.add(anchor.label);
      }
    }

    for (const pinId of bootstrapPins) {
      const hasSpecificPartMasterRule =
        (hints?.biasResistors ?? []).some(bias =>
          bias.pinNames.some(candidate => normalizePinRole(candidate) === normalizePinRole(pinId))
        ) ||
        (hints?.strapPins ?? []).some(strap =>
          strap.pinNames.some(candidate => normalizePinRole(candidate) === normalizePinRole(pinId))
        );
      if (hasSpecificPartMasterRule) {
        continue;
      }

      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (!net) {
        continue;
      }

      const hasBiasResistor = circuitAnalysis.resistors.some(resistor => {
        const touchesPinNet = resistor.netA === net.id || resistor.netB === net.id;
        const otherNetId = resistor.netA === net.id ? resistor.netB : resistor.netA;
        return touchesPinNet && circuitAnalysis.nets.some(candidate => candidate.id === otherNetId && (isGroundNet(candidate) || isPowerNet(candidate)));
      });

      if (hasBiasResistor) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: 'warning',
        code: 'mcu.boot-strap-audit',
        params: {
          componentName: component.name,
          pinId,
        },
        componentName: component.name,
        title: '부트 스트래핑 핀 기본 상태 미확인',
        message: `${component.name}의 ${pinId} 핀에서 전원/GND 기준을 잡아주는 풀업 또는 풀다운 저항을 확인하지 못했습니다.`,
        ruleId: 'mcu.boot-strap-audit',
        recommendation: '해당 MCU의 데이터시트에 맞는 기본 부트 상태를 확인하고, 보통 10kΩ 수준의 풀업/풀다운 저항으로 기본 전위를 고정하세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [pinId],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name}의 ${pinId} 부트 스트랩 핀에서 전원 또는 GND 기준 저항이 netlist상 확인되지 않았습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected pin: ${pinId}`,
            `Bootstrap net: ${net.id}`,
          ],
          assumptions: [
            '모듈 내부 기본 바이어스나 외부 시트에 있는 저항이 현재 net graph에 드러나지 않았을 수 있습니다.',
          ],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: '데이터시트에서 이 핀의 기본 부트 상태를 확인하고, 외부 풀업/풀다운이 실제로 같은 net에 있는지 점검하세요.',
        },
      }));
    }
  }

  for (const component of context.components) {
    const template = context.resolveTemplate(component.templateId);
    const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
    if (!isMcuLikeComponent(component, template, record)) {
      continue;
    }

    const resetPins = new Set<string>();
    for (const pin of template?.requiredPins ?? []) {
      if (isResetLikePinName(pin.name)) {
        resetPins.add(pin.name);
      }
    }
    for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
      if (isResetLikePinName(anchor.pinId)) {
        resetPins.add(anchor.pinId);
      }
      if (isResetLikePinName(anchor.label)) {
        resetPins.add(anchor.label);
      }
    }
    for (const pin of record?.pinSchemaJson.bootPins ?? []) {
      if (isResetLikePinName(pin)) {
        resetPins.add(pin);
      }
    }

    for (const pinId of resetPins) {
      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (!net) {
        continue;
      }

      const hasPullupToPower = circuitAnalysis.resistors.some(resistor => {
        if (resistor.netA !== net.id && resistor.netB !== net.id) {
          return false;
        }
        const peerNet = getNetById(circuitAnalysis, resistor.netA === net.id ? resistor.netB : resistor.netA);
        return Boolean(peerNet && isPowerNet(peerNet));
      });

      const hasPorCap = (circuitAnalysis.capacitors ?? []).some(capacitor =>
        (capacitor.netA === net.id && groundNets.has(capacitor.netB)) ||
        (capacitor.netB === net.id && groundNets.has(capacitor.netA))
      );

      const hasSupervisor = net.nodes.some(node => {
        if (node.ownerType !== 'component' || node.ownerId === component.instanceId) {
          return false;
        }
        const peer = componentById.get(node.ownerId);
        const peerTemplate = peer ? context.resolveTemplate(peer.templateId) : undefined;
        return Boolean(peer && isResetSupervisorLike(peer, peerTemplate));
      });

      if (hasSupervisor || (hasPullupToPower && hasPorCap)) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: hasPullupToPower ? 'info' : 'warning',
        code: 'reset.por-supervisor-review',
        componentName: component.name,
        title: '리셋 POR 타이밍 경로 검토 필요',
        message: `${component.name}의 ${pinId} 핀에서 ${hasPullupToPower ? '기본 풀업은 보이지만 POR 지연/감시 경로' : '기본 풀업과 POR 지연/감시 경로'}를 충분히 확인하지 못했습니다.`,
        ruleId: 'reset.por-supervisor-review',
        recommendation: '리셋 핀에 기본 풀업을 두고, 필요하면 RC 지연 또는 reset supervisor를 추가해 전원 램프업 동안 확실한 POR 타이밍을 확보하세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          netIds: [net.id],
          pinIds: [pinId],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name}의 ${pinId} 리셋 net에서 POR 지연 또는 supervisor 경로가 충분히 확인되지 않았습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected reset pin: ${pinId}`,
            `Reset net: ${net.id}`,
            `Pull-up present: ${hasPullupToPower ? 'yes' : 'no'}`,
          ],
          assumptions: [
            '외부 시트의 reset supervisor, RC 지연, 또는 보드 내부 POR 회로가 현재 회로 복원 결과에 완전히 드러나지 않았을 수 있습니다.',
          ],
          checkedBy: ['netlist', 'datasheet-rule'],
          affectedComponents: [component.instanceId],
          affectedNets: [net.id],
          howToVerify: '리셋 핀에 기본 풀업, POR 지연 커패시터, 또는 supervisor IC가 실제 같은 net에 있는지 확인하세요.',
        },
      }));
    }
  }

  for (const net of circuitAnalysis.nets) {
    if (isGroundNet(net) || isPowerNet(net)) {
      continue;
    }

    const activeNodes = getActivePeerNodesForNet(
      net,
      new Set(),
      componentById,
      context.resolveTemplate
    );
    if (activeNodes.length < 2) {
      continue;
    }

    const logicVoltages = activeNodes.flatMap(node => {
      if (node.ownerType === 'board') {
        const boardSpec = getBoardSignalLimits(context.boardId, node.pinId);
        return typeof boardSpec?.nominal === 'number' && !boardSpec.isPower && !boardSpec.isGround
          ? [boardSpec.nominal]
          : [];
      }

      const component = componentById.get(node.ownerId);
      if (!component) {
        return [];
      }

      const template = context.resolveTemplate(component.templateId);
      const voltage = getComponentSignalNominalVoltage(component, template, node.pinId);
      return typeof voltage === 'number' ? [voltage] : [];
    });

    if (logicVoltages.length < 2) {
      continue;
    }

    const minVoltage = Math.min(...logicVoltages);
    const maxVoltage = Math.max(...logicVoltages);
    if (maxVoltage - minVoltage < 0.9) {
      continue;
    }

    const hasLevelShifterOnNet = levelShifterChannels.some(channel =>
      channel.hvSignalNet?.id === net.id || channel.lvSignalNet?.id === net.id
    );
    if (hasLevelShifterOnNet) {
      continue;
    }

    issues.push(createDrcIssue({
      severity: 'warning',
      code: 'signal.mixed-voltage-tolerance-review',
      title: '혼합 전압 GPIO 직접 연결 검토 필요',
      message: `같은 신호 net에서 약 ${minVoltage.toFixed(1)}V 계열과 ${maxVoltage.toFixed(1)}V 계열 로직이 함께 보이지만, 명시적인 레벨 시프터 경로는 확인하지 못했습니다.`,
      ruleId: 'signal.mixed-voltage-tolerance-review',
      recommendation: '3.3V 전용 GPIO와 5V GPIO가 직접 만나지 않도록 레벨 시프터, 분압, 오픈드레인 구조 여부를 다시 확인하세요.',
      visualTargets: {
        componentIds: activeNodes
          .filter(node => node.ownerType === 'component')
          .map(node => node.ownerId),
        netIds: [net.id],
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `신호 net ${net.id}에서 ${minVoltage.toFixed(1)}V 계열과 ${maxVoltage.toFixed(1)}V 계열 로직이 함께 감지됐지만 level shifter 경로는 확인되지 않았습니다.`,
        observedFacts: [
          `Affected net: ${net.id}`,
          `Lowest observed logic domain: ${minVoltage.toFixed(1)}V`,
          `Highest observed logic domain: ${maxVoltage.toFixed(1)}V`,
          `Active node count: ${activeNodes.length}`,
        ],
        assumptions: [
          '오픈드레인 버스, 내장 5V tolerant 핀, 또는 시트 밖 레벨 시프터가 현재 net graph에 완전히 반영되지 않았을 수 있습니다.',
        ],
        checkedBy: ['netlist', 'datasheet-rule'],
        affectedComponents: activeNodes.filter(node => node.ownerType === 'component').map(node => node.ownerId),
        affectedNets: [net.id],
        howToVerify: '실제 해당 net이 레벨 시프터, 분압, 오픈드레인, 또는 5V tolerant 입력 구조를 통과하는지 경로 기준으로 다시 확인하세요.',
      },
    }));
  }

  for (const component of context.components) {
    const template = context.resolveTemplate(component.templateId);
    const record = template ? getPartMasterRecordForComponent(component, template) : undefined;
    if (!isMcuLikeComponent(component, template, record)) {
      continue;
    }

    const candidateUnusedPins = new Set<string>();
    for (const pin of template?.requiredPins ?? []) {
      if (
        pin.allowedTypes.some(type => type === 'POWER' || type === 'GND') ||
        /^NC\d*$/i.test(pin.name) ||
        isResetLikePinName(pin.name) ||
        isOscillatorPinName(pin.name)
      ) {
        continue;
      }
      if (isLikelyGeneralIoPin(pin.name)) {
        candidateUnusedPins.add(pin.name);
      }
    }

    const floatingUnusedPins = Array.from(candidateUnusedPins).filter(pinId => {
      const configuredMode = getConfiguredUnusedPinMode(
        context.componentUnusedPinModes,
        component.instanceId,
        pinId
      );
      if (configuredMode) {
        return false;
      }

      if (component.assignedPins[pinId]) {
        return false;
      }

      const net = getNetForComponentPin(circuitAnalysis, component.instanceId, pinId);
      if (!net) {
        return true;
      }

      return !net.nodes.some(node => !(node.ownerType === 'component' && node.ownerId === component.instanceId && normalizePinRole(node.pinId) === normalizePinRole(pinId)));
    });

    if (floatingUnusedPins.length === 0) {
      continue;
    }

    issues.push(createProjectAuditIssue({
      severity: 'info',
      code: 'signal.unused-pin-review',
      componentName: component.name,
      title: '미사용 핀 처리 상태 검토 필요',
      message: `${component.name}에서 ${floatingUnusedPins.slice(0, 4).join(', ')}${floatingUnusedPins.length > 4 ? ' 등' : ''} 미사용 핀의 처리 상태를 아직 확인하지 못했습니다.`,
      ruleId: 'signal.unused-pin-review',
      recommendation: '미사용 GPIO는 데이터시트 권장에 따라 no-connect, 내부 풀업/풀다운, 또는 테스트 포인트 용도 중 하나로 명시해 부동 입력과 EMI 민감도를 줄이세요.',
    }));
  }

  return issues;
}

export function runProjectDrc(context: DrcEngineContext): DrcEngineReport {
  const runtimeIssues: ProjectAuditIssue[] = [];
  const effectiveComponents = context.components.map(component => {
    try {
      if (Object.keys(component.footprintPinPadOverrides ?? {}).length > 0) {
        return component;
      }

      const template = context.resolveTemplate(component.templateId);
      const anchors = component.importedGeometry?.pinAnchors ?? [];
      const footprint =
        component.importedMapping?.footprint?.trim() ||
        template?.pcb?.footprint?.trim() ||
        '';
      const pins = anchors.map(anchor => ({
        id: anchor.pinId,
        label: anchor.label || anchor.pinId,
        role: anchor.pinId || anchor.label || anchor.number,
        number: anchor.number,
      }));
      const { cacheEntry } = resolveFootprintPinPadOverrideCacheEntry(
        component,
        template,
        pins,
        footprint,
        context.footprintPinPadOverrideCache
      );

      if (!cacheEntry) {
        return component;
      }

      return {
        ...component,
        footprintPinPadOverrides: { ...cacheEntry.pinPadMap },
      };
    } catch (error) {
      runtimeIssues.push(createEngineRuntimeIssue('audit', error));
      return component;
    }
  });
  const effectiveContext: DrcEngineContext = {
    ...context,
    components: effectiveComponents,
  };

  let baseAudit = createEmptyAuditReport();
  let circuitAnalysis = createEmptyCircuitAnalysisReport();
  let formalVerification = createEmptyFormalVerificationReport();
  let importedSchematicIssues: ProjectAuditIssue[] = [];
  let smartLinterIssues: ProjectAuditIssue[] = [];
  let boardPinDriveStates: BoardPinDriveState[] = [];

  try {
    baseAudit = auditProjectDesign(
      effectiveComponents,
      context.boardId,
      context.resolveTemplate,
      context.powerInputMode,
      context.componentPowerModes
    );
  } catch (error) {
    runtimeIssues.push(createEngineRuntimeIssue('audit', error));
  }

  try {
    circuitAnalysis = analyzeCircuitNetlist(
      effectiveComponents,
      context.boardId,
      context.resolveTemplate,
      context.manualConnections ?? [],
      { adcConfigurations: context.adcConfigurations }
    );
  } catch (error) {
    runtimeIssues.push(createEngineRuntimeIssue('netlist', error));
  }

  try {
    formalVerification = verifyCircuitCodeConsistency({
      boardId: context.boardId,
      code: context.generatedCode,
      components: effectiveComponents,
      resolveTemplate: context.resolveTemplate,
      circuitAnalysis,
    });
    boardPinDriveStates = formalVerification.boardPinDriveStates ?? [];
  } catch (error) {
    runtimeIssues.push(createEngineRuntimeIssue('formal', error));
  }

  if (boardPinDriveStates.length > 0) {
    try {
      circuitAnalysis = analyzeCircuitNetlist(
        effectiveComponents,
        context.boardId,
        context.resolveTemplate,
        context.manualConnections ?? [],
        { boardPinDriveStates, adcConfigurations: context.adcConfigurations }
      );
    } catch (error) {
      runtimeIssues.push(createEngineRuntimeIssue('netlist', error));
    }
  }

  try {
    smartLinterIssues = buildCriticalElectricalIssues(effectiveContext, circuitAnalysis);
  } catch (error) {
    runtimeIssues.push(createEngineRuntimeIssue('audit', error));
  }

  if (isImportedSchematicBoard(context.boardId)) {
    try {
      importedSchematicIssues = buildImportedSchematicAuditIssues({
        components: effectiveComponents,
        resolveTemplate: context.resolveTemplate,
        manualConnections: context.manualConnections ?? [],
        importedSchematicScene: context.importedSchematicScene ?? null,
      });
    } catch (error) {
      runtimeIssues.push(createEngineRuntimeIssue('audit', error));
    }
  }

  const auditIssues = deduplicateIssues(baseAudit.issues);
  const netlistIssues = deduplicateIssues(circuitAnalysis.issues);
  const criticalElectricalIssues = deduplicateIssues(smartLinterIssues);
  const formalAuditIssues = deduplicateIssues(formalVerification.issues.map(mapFormalIssueToAuditIssue));
  const importedAuditIssues = deduplicateIssues(importedSchematicIssues);
  const engineRuntimeIssues = deduplicateIssues(runtimeIssues);

  const issues = deduplicateIssues([
    ...auditIssues,
    ...netlistIssues,
    ...criticalElectricalIssues,
    ...formalAuditIssues,
    ...importedAuditIssues,
    ...engineRuntimeIssues,
  ]);

  return {
    ...baseAudit,
    issueCount: issues.length,
    issues,
    engineId: 'modumake-drc-v1',
    ruleCatalog: CORE_DRC_RULES,
    circuitAnalysis,
    formalVerification,
  };
}

export function runProjectStageDrc(context: DrcEngineContext): ProjectStageReadiness {
  try {
    return getProjectStageReadiness(
      context.components,
      context.boardId,
      context.resolveTemplate,
      context.powerInputMode,
      context.componentPowerModes
    );
  } catch (error) {
    const warning = createEngineRuntimeIssue('stage-readiness', error);
    return {
      canEnterPcb: false,
      canEnterManufacturing: false,
      pcbReasons: [warning.message],
      manufacturingReasons: [warning.message],
    };
  }
}
