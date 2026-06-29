import { getBoardById } from '@/constants/boards';
import { isImportedSchematicBoard } from '@/lib/component-template-utils';
import {
  findPartMasterRecordByLookupCandidates,
  type PartMasterRecord,
} from '@/lib/part-master-catalog';
import { resolveCommonModuleAlias } from '@/lib/module-alias-catalog';
import {
  BOARD_ANALYSIS,
  BOARD_AVOID_PINS,
  BOARD_POWER_BUDGETS,
  BOARD_PROTOCOL_HINTS,
  BOARD_SIGNAL_CURRENT_LIMITS,
  COMMON_PIN_PREFERENCES,
  COMPONENT_BUS_PROFILES,
  COMPONENT_ELECTRICAL_PROFILES,
  COMPONENT_POWER_PROFILES,
  COMPONENT_RULES,
  COMPONENT_SIGNAL_LOADS,
  PASSIVE_TEMPLATE_KIND,
  POWER_INPUT_PROFILES,
} from '@/lib/datasheet-catalog';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { createDrcIssue } from '@/lib/drc-issue-factory';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import { createProjectAuditIssue } from '@/lib/engine-i18n';
import { buildIssueDedupKey, deduplicateIssues } from '@/lib/issue-utils';
import { buildOrthogonalRoute, type RoutePoint, type RouteRect } from '@/lib/orthogonal-router';
import type {
  BoardDesignAnalysis,
  CompanionPartSuggestion,
  CompanionSummaryLine,
  ComponentBoardAnalysis,
  ComponentCompanionSuggestion,
  ComponentDesignRules,
  ComponentTemplate,
  DatasheetSource,
  DatasheetStatus,
  DesignWarning,
  PlacedComponent,
  ProjectAuditIssue,
  ProjectAuditReport,
  ProjectComponentPowerModes,
  ProjectCompanionReport,
  ProjectPowerInputMode,
  ProjectPowerRailSummary,
  ProjectRegulatorThermalScenario,
  ProjectStageReadiness,
} from '@/types';

type PowerProfile = {
  typicalMa: number;
  peakMa?: number;
  preferredRail?: '5V' | '3.3V';
  inferred?: boolean;
  note: string;
};

type BoardQuiescentProfile = {
  rail: '5V' | '3.3V';
  typicalMa: number;
  peakMa?: number;
  note: string;
};

type SupportedProtocol =
  | 'I2C_SDA'
  | 'I2C_SCL'
  | 'SPI_SCK'
  | 'SPI_MISO'
  | 'SPI_MOSI'
  | 'SPI_CS'
  | 'UART_TX'
  | 'UART_RX'
  | 'ADC'
  | 'PWM'
  | 'ONEWIRE';

type ElectricalPinSpec = {
  id: string;
  direction: 'IN' | 'OUT' | 'BIDIR' | 'POWER' | 'GND';
  voltageLevel: {
    min: number;
    nominal: number;
    max: number;
  };
  maxCurrent: {
    source: number;
    sink: number;
  };
  supportedProtocols: SupportedProtocol[];
};

const BOARD_NODE_POSITION = { x: 80, y: 60 };
const BOARD_NODE_HEADER_HEIGHT = 38;
const BOARD_NODE_ROW_HEIGHT = 20;
const BOARD_NODE_WIDTH = 200;
const SENSOR_NODE_WIDTH = 104;
const SENSOR_NODE_ROW_HEIGHT = 16;
const SENSOR_NODE_HEADER_HEIGHT = 20;
const SENSOR_NODE_FOOTER_HEIGHT = 12;
const SENSOR_NODE_PIN_LEG = 8;
const SENSOR_NODE_HANDLE_SIZE = 7;

function buildCompanionItem(
  item: CompanionPartSuggestion
): CompanionPartSuggestion {
  return item;
}

type ProjectAuditIssueInput =
  Omit<ProjectAuditIssue, 'title' | 'message' | 'recommendation'> & {
    title?: string;
    message?: string;
    recommendation?: string;
  };

function shouldReportUnroutedComponent(component: PlacedComponent, boardId: string): boolean {
  if (component.isFullyRouted) return false;

  if (
    isImportedSchematicBoard(boardId) &&
    Boolean(component.importedGeometry || component.importedReference || component.importedMapping)
  ) {
    return false;
  }

  return true;
}

function getBoardPinElectricalSpec(boardId: string, pinId: string): ElectricalPinSpec | undefined {
  const board = getBoardById(boardId);
  const pinDefinition = board.pinDefinitions.find(pin => pin.id === pinId);
  if (!pinDefinition) {
    return undefined;
  }

  if (pinDefinition.type.includes('POWER')) {
    const nominal = pinId === '3.3V' ? 3.3 : 5;
    return {
      id: pinId,
      direction: 'POWER',
      voltageLevel: { min: 0, nominal, max: nominal + 0.25 },
      maxCurrent: { source: 0, sink: 0 },
      supportedProtocols: [],
    };
  }

  if (pinDefinition.type.includes('GND')) {
    return {
      id: pinId,
      direction: 'GND',
      voltageLevel: { min: 0, nominal: 0, max: 0 },
      maxCurrent: { source: 0, sink: 0 },
      supportedProtocols: [],
    };
  }

  const nominal = board.logicVoltage === '5V' ? 5 : 3.3;
  const current = BOARD_SIGNAL_CURRENT_LIMITS[boardId] ?? { source: 8, sink: 8 };
  const supportedProtocols = [
    ...(pinDefinition.type.includes('ANALOG') ? ['ADC' as const] : []),
    ...(pinDefinition.type.includes('PWM') ? ['PWM' as const] : []),
    ...(BOARD_PROTOCOL_HINTS[boardId]?.[pinId] ?? []),
  ];

  return {
    id: pinId,
    direction: 'BIDIR',
    voltageLevel: { min: -0.3, nominal, max: nominal + 0.5 },
    maxCurrent: current,
    supportedProtocols: Array.from(new Set(supportedProtocols)),
  };
}

function getBusProfile(templateId: string) {
  return COMPONENT_BUS_PROFILES[templateId];
}

export function getTemplateBusProfile(templateId: string) {
  const profile = getBusProfile(templateId);
  if (!profile) {
    return undefined;
  }

  return {
    protocol: profile.protocol,
    addresses: profile.addresses ? [...profile.addresses] : undefined,
    addressConfigurable: profile.addressConfigurable,
    signalPins: profile.signalPins ? { ...profile.signalPins } : undefined,
    chipSelectPinName: profile.chipSelectPinName,
  };
}

function getSignalLoadProfile(templateId: string) {
  return COMPONENT_SIGNAL_LOADS[templateId];
}

function getComponentElectricalProfile(templateId: string) {
  return COMPONENT_ELECTRICAL_PROFILES[templateId];
}

function getPassiveKindForTemplate(templateId: string) {
  return PASSIVE_TEMPLATE_KIND[templateId];
}

function getProjectPowerInputProfile(boardId: string, powerInputMode: ProjectPowerInputMode) {
  return POWER_INPUT_PROFILES[boardId]?.[powerInputMode] ?? POWER_INPUT_PROFILES[boardId]?.['usb-5v'];
}

export function getProjectPowerInputLabel(boardId: string, powerInputMode: ProjectPowerInputMode) {
  return getProjectPowerInputProfile(boardId, powerInputMode)?.label ?? 'USB 5V';
}

function getPlacedCompanionInventory(components: PlacedComponent[]) {
  const inventory = new Map<CompanionPartSuggestion['kind'], number>();

  for (const component of components) {
    const kind = getPassiveKindForTemplate(component.templateId);
    if (!kind) {
      continue;
    }

    inventory.set(kind, (inventory.get(kind) ?? 0) + 1);
  }

  return inventory;
}

function normalizeAuditText(value?: string) {
  return (value ?? '').trim().toLowerCase();
}

function buildComponentIdentityText(
  component: PlacedComponent,
  template?: ComponentTemplate
) {
  return [
    component.name,
    component.value,
    template?.id,
    template?.name,
    template?.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function parseResistanceOhms(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/Ω/g, 'ohm').replace(/\s+/g, '');

  const kiloMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)k(?:ohm)?$/);
  if (kiloMatch) {
    return Number.parseFloat(kiloMatch[1]) * 1_000;
  }

  const megaMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)m(?:ohm)?$/);
  if (megaMatch) {
    return Number.parseFloat(megaMatch[1]) * 1_000_000;
  }

  const rStyleMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)r$/);
  if (rStyleMatch) {
    return Number.parseFloat(rStyleMatch[1]);
  }

  const ohmMatch = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(?:ohm)?$/);
  if (ohmMatch) {
    return Number.parseFloat(ohmMatch[1]);
  }

  return undefined;
}

function parseCapacitanceFarads(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, '');
  const embedded = normalized.match(/^(\d+)([munp])(\d+)(?:f)?(?:\/.*)?$/);
  if (embedded) {
    const [, whole, marker, fractional] = embedded;
    const base = Number.parseFloat(`${whole}.${fractional}`);
    const multiplier =
      marker === 'm' ? 1e-3 :
      marker === 'u' ? 1e-6 :
      marker === 'n' ? 1e-9 :
      1e-12;
    return base * multiplier;
  }

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)([munp]?)(?:f)?(?:\/.*)?$/);
  if (!match) {
    return undefined;
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base) || base <= 0) {
    return undefined;
  }

  const suffix = match[2];
  const multiplier =
    suffix === 'm' ? 1e-3 :
    suffix === 'u' ? 1e-6 :
    suffix === 'n' ? 1e-9 :
    suffix === 'p' ? 1e-12 :
    1;
  return base * multiplier;
}

function getRecommendedRegulatorUsageRatio(scenario: Pick<ProjectRegulatorThermalScenario, 'packageLabel' | 'label'>) {
  const text = `${scenario.packageLabel ?? ''} ${scenario.label}`.toLowerCase();
  if (/boost|charge pump|inverting/.test(text)) {
    return 0.5;
  }
  if (/lm2576|lm2575|xlsemi/.test(text)) {
    return 0.66;
  }
  if (/lm2596|xl4015|xl4016|xl6009/.test(text)) {
    return 0.7;
  }
  if (/buck-boost|step-up\/step-down/.test(text)) {
    return 0.68;
  }
  if (/lm2675|lm2676|lm2678/.test(text)) {
    return 0.68;
  }
  if (/mp1584en|mp1584\b|ap6320|tps6216|sy8\d+/.test(text)) {
    return 0.78;
  }
  if (/mp2307|mp1584en|mp1584\b|ap34063|tps5430|tps5420/.test(text)) {
    return 0.74;
  }
  if (/tps54231|tps54331|mp2307dn|sy8208|sy8208b/.test(text)) {
    return 0.73;
  }
  if (/buck|switching|dcdc|dc-dc|step-down/.test(text)) {
    return 0.78;
  }
  if (/ap2112|xc6206|mcp1700|ht7333/.test(text)) {
    return 0.43;
  }
  if (/me6211|rt9193|tlv700|lp5907/.test(text)) {
    return 0.4;
  }
  if (/lt1763|lt1963|lt3015|adm7\d+/.test(text)) {
    return 0.46;
  }
  if (/lm3940|ap7361|mic29302|mic2930|ldo.*automotive/.test(text)) {
    return 0.55;
  }
  if (/ld1117|lm1117|ncp1117/.test(text)) {
    return 0.5;
  }
  if (/ams1117/.test(text)) {
    return 0.52;
  }
  if (/sot-223|sot223/.test(text)) {
    return 0.56;
  }
  if (/sot-89|sot89/.test(text)) {
    return 0.5;
  }
  if (/78m|lm78m/.test(text)) {
    return 0.62;
  }
  if (/7805|78l|lm78|to-220|to220/.test(text)) {
    return 0.66;
  }
  if (/to-252|dpak|d2pak/.test(text)) {
    return 0.7;
  }
  if (/qfn|qfp|htssop|msop/.test(text)) {
    return 0.56;
  }
  if (/sot-23|sot23/.test(text)) {
    return 0.42;
  }
  return 0.66;
}

function getRegulatorReliabilityGuidance(
  scenario: Pick<ProjectRegulatorThermalScenario, 'packageLabel' | 'label'>
) {
  const text = `${scenario.packageLabel ?? ''} ${scenario.label}`.toLowerCase();

  if (/boost|charge pump|inverting/.test(text)) {
    return '부스트/차지펌프 계열은 열과 스위칭 손실이 겹치기 쉬워 연속 운용은 대략 정격의 50~52% 안쪽으로 보는 편이 안전합니다. VIN 범위, 스위치 피크전류, 주변 온도 디레이팅 표를 함께 확인해 주세요.';
  }
  if (/lm2576|lm2575|xlsemi/.test(text)) {
    return 'LM2575/LM2576, XLsemi 계열처럼 오래된 범용 스위칭 레귤레이터는 카탈로그 정격보다 외부 다이오드·인덕터·방열 영향이 커서 연속 운용은 대략 정격의 65~68% 안쪽으로 보는 편이 안전합니다. 스위치 피크전류, 외부 쇼트키 다이오드 정격, 권장 보드 면적을 같이 확인해 주세요.';
  }
  if (/lm2675|lm2676|lm2678/.test(text)) {
    return 'LM2675/LM2676/LM2678 같은 SIMPLE SWITCHER 계열은 오래된 정격표보다 외부 쇼트키 다이오드, 인덕터 Isat, 방열면적 편차의 영향을 크게 받습니다. 연속 운용은 대략 정격의 70% 안쪽으로 보고, 스위치 피크전류와 외부 정류 다이오드 평균전류 표를 같이 확인해 주세요.';
  }
  if (/lm2596|xl4015|xl4016|xl6009/.test(text)) {
    return 'LM2596/XL4015/XL6009 같은 범용 파워 모듈은 카탈로그 정격보다 실제 방열과 인덕터 품질 편차가 커서 연속 운용은 대략 정격의 70% 안쪽으로 보는 편이 안전합니다. 모듈 실장면적, 인덕터 Isat, 다이오드 열, 효율 곡선을 같이 확인해 주세요.';
  }
  if (/tps54231|tps54331|mp2307dn|sy8208|sy8208b/.test(text)) {
    return 'TPS54231/TPS54331, MP2307DN, SY8208 계열처럼 비교적 최신 소형 벅 컨버터는 효율은 좋지만 보드 방열과 인덕터 온도 상승 영향이 커서 연속 운용은 대략 정격의 75~76% 안쪽으로 보는 편이 안전합니다. Thermal Pad 조건, 최대 스위치 전류, 효율 곡선, 인덕터 Isat 표를 같이 확인해 주세요.';
  }
  if (/buck-boost|step-up\/step-down/.test(text)) {
    return '벅부스트 계열은 입력 조건 변화 폭이 커서 연속 운용은 대략 정격의 70% 안쪽으로 보는 편이 안전합니다. 데이터시트의 Thermal Derating Curve, 최대 스위치 전류, 최소/최대 입력 조건 표도 같이 확인해 주세요.';
  }
  if (/mp1584en|mp1584\b|ap6320|tps6216|sy8\d+/.test(text)) {
    return 'MP1584, AP6320, TPS6216, SY82xx 같은 소형 고효율 벅 컨버터는 칩 정격보다 인덕터 온도 상승과 보드 방열 품질 차이에 더 민감합니다. 연속 운용은 대략 정격의 78~80% 안쪽으로 보고, 효율 곡선, Thermal Pad 조건, 인덕터 Isat/Irms를 같이 확인해 주세요.';
  }
  if (/mp2307|ap34063|tps5430|tps5420/.test(text)) {
    return '소형 스위칭 레귤레이터 모듈은 데이터시트 정격보다 PCB 방열과 외부 인덕터/다이오드 품질의 영향을 더 크게 받습니다. 연속 운용은 대략 정격의 75~78% 안쪽으로 보고, 효율 곡선, 최대 스위치 전류, 권장 레이아웃 조건을 같이 확인해 주세요.';
  }
  if (/buck|switching|dcdc|dc-dc|step-down/.test(text)) {
    return '벅 컨버터라도 인덕터·레이아웃·방열 편차가 커서 연속 운용은 대략 정격의 80% 안쪽으로 보는 편이 안전합니다. 최대 출력전류 표뿐 아니라 권장 PCB 구리면적, 효율 곡선, 스위칭 주파수 조건도 같이 확인해 주세요.';
  }
  if (/ap2112|xc6206|mcp1700|ht7333|sot-23|sot23|sot-89|sot89/.test(text)) {
    return '소형 LDO는 방열 여유가 작아 연속 운용은 대략 정격의 43~50% 안쪽으로 보는 편이 안전합니다. 입력-출력 전압차, RθJA, 보드 구리면적, 주변 온도 조건을 같이 보수적으로 잡아 주세요.';
  }
  if (/me6211|rt9193|tlv700|lp5907/.test(text)) {
    return '초소형 저잡음 LDO는 발열뿐 아니라 dropout과 패키지 열확산이 작아서 연속 운용은 대략 정격의 40% 안쪽으로 보는 편이 안전합니다. 출력 전류 표만 보지 말고 dropout 조건, 최대 접합온도, 보드 구리면적도 같이 확인해 주세요.';
  }
  if (/lt1763|lt1963|lt3015|adm7\d+/.test(text)) {
    return '정밀/저잡음 LDO 계열은 노이즈 성능은 좋지만 연속 부하에서는 열확산과 dropout 조건이 빠르게 한계가 됩니다. 연속 운용은 대략 정격의 46~48% 안쪽으로 보고, dropout 대 load current 표, 최대 접합온도, PSRR 조건이 유지되는 부하 구간을 같이 확인해 주세요.';
  }
  if (/lm3940|ap7361|mic29302|mic2930|ldo.*automotive/.test(text)) {
    return '자동차/중전류 LDO 계열은 순간 전류는 버텨도 입력-출력 전압차가 커지면 열적 안전영역이 빨리 줄어듭니다. 연속 운용은 대략 정격의 55% 안쪽으로 보고, dropout 조건, Safe Operating Area, Thermal Resistance 표를 같이 확인해 주세요.';
  }
  if (/ld1117|lm1117|ncp1117|ams1117|sot-223|sot223/.test(text)) {
    return '1117 계열은 동작은 되더라도 발열 누적이 빠르기 쉬워 연속 운용은 대략 정격의 52~60% 안쪽으로 보는 편이 안전합니다. 특히 VIN-VOUT 전압차, 방열 패턴 면적, 주변 온도 조건을 데이터시트 표 기준으로 다시 확인해 주세요.';
  }
  if (/to-252|dpak|d2pak|to-220|to220|7805|78l|lm78|78m|lm78m/.test(text)) {
    return '중형 선형 레귤레이터는 방열 조건 영향을 크게 받아 연속 운용은 대략 정격의 65~74% 안쪽으로 보는 편이 안전합니다. 방열판 유무, 주변 대기온도, 데이터시트 Pd/Thermal Resistance 표와 안전동작영역을 같이 확인해 주세요.';
  }

  return '이 계열은 당장 정격 초과가 아니어도 장기 발열 누적을 고려해 연속 운용은 대략 정격의 70% 안쪽으로 보는 편이 안전합니다. 최대 출력전류 표, 열저항 조건, 주변 온도 조건을 함께 보고 여유를 잡아 주세요.';
}

function isNegativeRailName(value?: string) {
  const normalized = normalizeAuditText(value);
  if (!normalized) {
    return false;
  }

  return (
    /^-\d+(?:\.\d+)?v$/.test(normalized) ||
    normalized.startsWith('-v') ||
    normalized.includes('vee') ||
    normalized.includes('vss') ||
    normalized.includes('-vs') ||
    normalized.includes('-batt')
  );
}

function isGroundLikeNet(value?: string) {
  const normalized = normalizeAuditText(value);
  if (!normalized) {
    return false;
  }

  return normalized === 'gnd' || normalized.endsWith('gnd') || normalized.includes('agnd');
}

function findFirstAssignedPin(
  component: PlacedComponent,
  template: ComponentTemplate,
  matcher: (pinName: string) => boolean
) {
  const pinName = template.requiredPins.find(pin => matcher(pin.name))?.name;
  return pinName ? component.assignedPins[pinName] : undefined;
}

function looksLikeMosfet(component: PlacedComponent, template?: ComponentTemplate) {
  const identity = buildComponentIdentityText(component, template);
  if (/\bmosfet\b|\bnmos\b|\bpmos\b|\bn-?fet\b|\bp-?fet\b/.test(identity)) {
    return true;
  }

  const pinNames = new Set((template?.requiredPins ?? []).map(pin => pin.name.toLowerCase()));
  return (
    (pinNames.has('g') || pinNames.has('gate')) &&
    (pinNames.has('d') || pinNames.has('drain')) &&
    (pinNames.has('s') || pinNames.has('source'))
  );
}

function looksLikeAdjustableRegulator(component: PlacedComponent, template?: ComponentTemplate) {
  const identity = buildComponentIdentityText(component, template);
  if (/\b(lm317|lm337|lt1085|lt1084|lt1963)\b/.test(identity)) {
    return true;
  }

  return (template?.requiredPins ?? []).some(pin => normalizeAuditText(pin.name) === 'adj');
}

function looksLikeAudioAmplifier(component: PlacedComponent, template?: ComponentTemplate) {
  const identity = buildComponentIdentityText(component, template);
  return /\baudio\b|\bamp\b|\bamplifier\b|\blm386\b|\blm3886\b|\btpa\d+\b|\bpam\d+\b|\btda\d+\b/.test(identity);
}

function looksLikeAudioInputOrSpeaker(component: PlacedComponent, template?: ComponentTemplate) {
  const identity = buildComponentIdentityText(component, template);
  return /\bjack\b|\brca\b|\blinein\b|\baudioin\b|\bmicrophone\b|\bmic\b|\bspeaker\b|\bspk\b/.test(identity);
}

function getProjectResistorValues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  return components.flatMap(component => {
    const template = resolveTemplate(component.templateId);
    const isResistor =
      component.templateId === 'tpl_resistor' ||
      template?.id === 'tpl_resistor' ||
      /^r\d+/i.test(component.name.trim());

    if (!isResistor) {
      return [];
    }

    const ohms = parseResistanceOhms(component.value ?? component.name);
    return typeof ohms === 'number' && Number.isFinite(ohms) ? [ohms] : [];
  });
}

function hasPlacedCompanion(
  components: PlacedComponent[],
  kind: CompanionPartSuggestion['kind'],
  minimum = 1
) {
  return (getPlacedCompanionInventory(components).get(kind) ?? 0) >= minimum;
}

function getTemplateSignalMaxVoltage(template: ComponentTemplate) {
  if (template.compatibleVoltage === '3.3V') {
    return 3.6;
  }

  return 5.5;
}

function getComponentSignalPins(template: ComponentTemplate) {
  return template.requiredPins.filter(
    pin => !pin.allowedTypes.includes('POWER') && !pin.allowedTypes.includes('GND')
  );
}

function getSignalProfileForPin(templateId: string, pinName: string) {
  return getComponentElectricalProfile(templateId)?.signalPins?.[pinName];
}

function getSignalOutputVoltage(
  component: PlacedComponent,
  template: ComponentTemplate,
  pinName: string,
  boardId: string
) {
  const signalProfile = getSignalProfileForPin(template.id, pinName);
  if (!signalProfile) {
    return undefined;
  }

  if (typeof signalProfile.outputVoltage === 'number') {
    return signalProfile.outputVoltage;
  }

  if (signalProfile.analogMaxVoltageSource === 'fixed') {
    return signalProfile.fixedAnalogMaxVoltage;
  }

  if (signalProfile.analogMaxVoltageSource === 'power-rail') {
    const rail = inferAssignedPowerRail(component, template, boardId);
    return rail === '3.3V' ? 3.3 : 5;
  }

  return undefined;
}

function getComponentBodyRectForAudit(
  component: PlacedComponent,
  template: ComponentTemplate | undefined
): RouteRect {
  if (component.importedGeometry) {
    const importedLayout = layoutImportedGeometry(component.importedGeometry, component.rotation);
    return {
      x: component.position.x,
      y: component.position.y,
      width: importedLayout.width,
      height: importedLayout.height,
    };
  }

  const requiredPins = template?.requiredPins ?? [];
  const { leftPins, rightPins } = getComponentPinLayout(requiredPins, template?.category);
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const hasConnectionSummary = Object.keys(component.assignedPins).length > 0;
  const contentHeight =
    SENSOR_NODE_HEADER_HEIGHT +
    maxPins * SENSOR_NODE_ROW_HEIGHT +
    (hasConnectionSummary ? 18 : 0) +
    SENSOR_NODE_FOOTER_HEIGHT;
  const isVertical = component.rotation === 90 || component.rotation === 270;

  return {
    x: component.position.x + 12,
    y: component.position.y + 12,
    width: isVertical ? contentHeight : SENSOR_NODE_WIDTH,
    height: isVertical ? SENSOR_NODE_WIDTH : contentHeight,
  };
}

function buildProjectObstacleRects(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
): RouteRect[] {
  const board = getBoardById(boardId);
  const boardRows = Math.max(board.digitalPins.length, board.leftPins.length);
  const boardHeight = BOARD_NODE_HEADER_HEIGHT + boardRows * BOARD_NODE_ROW_HEIGHT + 12;

  const componentRects = components.map(component =>
    getComponentBodyRectForAudit(component, resolveTemplate(component.templateId))
  );

  return [
    {
      x: BOARD_NODE_POSITION.x,
      y: BOARD_NODE_POSITION.y,
      width: BOARD_NODE_WIDTH,
      height: boardHeight,
    },
    ...componentRects,
  ];
}

function getBoardPinPoint(boardId: string, pinId: string): RoutePoint | undefined {
  const board = getBoardById(boardId);
  const leftIndex = board.leftPins.indexOf(pinId);
  if (leftIndex >= 0) {
    return {
      x: BOARD_NODE_POSITION.x - 21,
      y: BOARD_NODE_POSITION.y + 4 + BOARD_NODE_HEADER_HEIGHT + leftIndex * BOARD_NODE_ROW_HEIGHT + BOARD_NODE_ROW_HEIGHT / 2,
    };
  }

  const rightIndex = board.digitalPins.indexOf(pinId);
  if (rightIndex >= 0) {
    return {
      x: BOARD_NODE_POSITION.x + BOARD_NODE_WIDTH + 21,
      y: BOARD_NODE_POSITION.y + 4 + BOARD_NODE_HEADER_HEIGHT + rightIndex * BOARD_NODE_ROW_HEIGHT + BOARD_NODE_ROW_HEIGHT / 2,
    };
  }

  return undefined;
}

function rotateOffset(dx: number, dy: number, rotation: 0 | 90 | 180 | 270) {
  switch (rotation) {
    case 90:
      return { dx: -dy, dy: dx };
    case 180:
      return { dx: -dx, dy: -dy };
    case 270:
      return { dx: dy, dy: -dx };
    default:
      return { dx, dy };
  }
}

function getRotatedComponentPinPoint(
  component: PlacedComponent,
  template: ComponentTemplate,
  pinName: string
): RoutePoint | undefined {
  const { leftPins, rightPins } = getComponentPinLayout(template.requiredPins, template.category);
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const contentHeight = SENSOR_NODE_HEADER_HEIGHT + maxPins * SENSOR_NODE_ROW_HEIGHT + SENSOR_NODE_FOOTER_HEIGHT;
  const isVertical = component.rotation === 90 || component.rotation === 270;
  const pinExtent = SENSOR_NODE_PIN_LEG + SENSOR_NODE_HANDLE_SIZE / 2;
  const rotatedBodyWidth = isVertical ? contentHeight : SENSOR_NODE_WIDTH;
  const rotatedBodyHeight = isVertical ? SENSOR_NODE_WIDTH : contentHeight;
  const outerWidth = rotatedBodyWidth + pinExtent * 2;
  const outerHeight = rotatedBodyHeight + pinExtent * 2;
  const bodyCenterX = SENSOR_NODE_WIDTH / 2;
  const bodyCenterY = contentHeight / 2;
  const outerCenterX = outerWidth / 2;
  const outerCenterY = outerHeight / 2;

  const leftIndex = leftPins.findIndex(pin => pin.name === pinName);
  const rightIndex = rightPins.findIndex(pin => pin.name === pinName);
  const isLeft = leftIndex >= 0;
  const rowIndex = isLeft ? leftIndex : rightIndex;
  if (rowIndex < 0) {
    return undefined;
  }

  const baseX = isLeft ? -SENSOR_NODE_PIN_LEG : SENSOR_NODE_WIDTH + SENSOR_NODE_PIN_LEG;
  const baseY = SENSOR_NODE_HEADER_HEIGHT + rowIndex * SENSOR_NODE_ROW_HEIGHT + SENSOR_NODE_ROW_HEIGHT / 2;
  const rotated = rotateOffset(baseX - bodyCenterX, baseY - bodyCenterY, component.rotation);

  return {
    x: component.position.x + outerCenterX + rotated.dx,
    y: component.position.y + outerCenterY + rotated.dy,
  };
}

function getRouteSegments(points: RoutePoint[]) {
  const segments: Array<{ orientation: 'h' | 'v'; from: RoutePoint; to: RoutePoint }> = [];

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (from.x === to.x) {
      segments.push({ orientation: 'v', from, to });
    } else if (from.y === to.y) {
      segments.push({ orientation: 'h', from, to });
    }
  }

  return segments;
}

function getOverlapLength(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  const start = Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd));
  const end = Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd));
  return Math.max(0, end - start);
}

function getPathLength(points: RoutePoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.abs(points[index].x - points[index - 1].x) + Math.abs(points[index].y - points[index - 1].y);
  }
  return total;
}

function getCompanionIssueSeverity(kind: CompanionPartSuggestion['kind']) {
  switch (kind) {
    case 'level_shifter':
    case 'driver':
    case 'power_supply':
      return 'error' as const;
    default:
      return 'warning' as const;
  }
}

function getPrimarySource(
  template: ComponentTemplate
): DatasheetSource | undefined {
  return (template.design ?? getDesignRules(template.id))?.datasheetSources?.[0];
}

function buildI2cSensorCompanions(template: ComponentTemplate) {
  const source = getPrimarySource(template);

  return [
    buildCompanionItem({
      kind: 'capacitor',
      level: 'recommended',
      label: '전원 디커플링 콘덴서',
      value: '0.1uF',
      quantity: 1,
      reason: 'I2C 디지털 센서는 전원 핀 근처에 로컬 바이패스 콘덴서를 두는 편이 안정적입니다.',
      note: '브레이크아웃 모듈에는 이미 포함된 경우가 많아서 원칩/커스텀 PCB일 때 특히 중요합니다.',
      sourceLabel: source?.label,
      sourceUrl: source?.url,
      likelyIncludedOnModule: true,
    }),
    buildCompanionItem({
      kind: 'resistor',
      level: 'conditional',
      label: 'I2C 풀업 저항',
      value: '2.2k-10k',
      quantity: 2,
      reason: 'SDA/SCL 라인은 버스 전체 기준 풀업 구성이 필요합니다.',
      note: '센서 모듈, 보드, 다른 I2C 장치 중 이미 풀업이 있는지 먼저 확인하세요.',
      sourceLabel: source?.label,
      sourceUrl: source?.url,
      likelyIncludedOnModule: true,
    }),
  ];
}

function getCompanionItemsForTemplate(
  template: ComponentTemplate,
  boardId: string
): CompanionPartSuggestion[] {
  const source = getPrimarySource(template);
  const board = getBoardById(boardId);

  switch (template.id) {
    case 'tpl_led':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'required',
          label: 'LED 전류 제한 저항',
          value: '220-330 Ohm',
          quantity: 1,
          reason: 'MCU GPIO와 LED를 직접 연결하면 전류 제한이 없어 핀과 LED 모두 무리할 수 있습니다.',
          note: 'ATmega328P 계열은 핀당 40mA가 절대 최대치라 실사용 설계에서는 여유 있게 제한하는 편이 안전합니다.',
          sourceLabel: 'Arduino UNO R3 Datasheet',
          sourceUrl: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf',
        }),
      ];
    case 'tpl_rgb_led':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'required',
          label: 'RGB 채널 전류 제한 저항',
          value: '220-330 Ohm',
          quantity: 3,
          reason: 'R/G/B 채널마다 개별 전류 제한이 필요합니다.',
          note: '세 채널 밝기 균형을 위해 같은 계열 값을 쓰고, 필요하면 색상별로 미세 조정하세요.',
          sourceLabel: 'Arduino UNO R3 Datasheet',
          sourceUrl: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf',
        }),
      ];
    case 'tpl_button':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'conditional',
          label: '버튼 풀업/풀다운 저항',
          value: '10k Ohm',
          quantity: 1,
          reason: '스위치 입력은 부동 상태를 막아야 안정적으로 읽을 수 있습니다.',
          note: '내부 풀업을 쓰면 외부 저항 없이도 설계 가능하지만 배선 방식이 달라집니다.',
        }),
      ];
    case 'tpl_dht11':
    case 'tpl_dht22':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'conditional',
          label: '싱글버스 데이터 풀업 저항',
          value: '4.7k-10k Ohm',
          quantity: 1,
          reason: 'DHT 계열 단일 버스는 데이터 라인 풀업 구성이 필요할 수 있습니다.',
          note: '3핀 모듈 버전은 풀업이 이미 포함된 경우가 많아서 정확한 모듈 SKU를 먼저 확인하세요.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
          likelyIncludedOnModule: true,
        }),
      ];
    case 'tpl_ds18b20':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'required',
          label: '1-Wire 데이터 풀업 저항',
          value: '4.7k Ohm',
          quantity: 1,
          reason: 'DS18B20 기본 응용 회로는 DQ 라인 풀업 저항을 전제로 합니다.',
          note: '여러 개를 한 버스에 묶을 때도 버스당 기본 풀업 구성을 먼저 잡는 편이 좋습니다.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        }),
      ];
    case 'tpl_lm35':
      return [
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: '센서 바이패스 콘덴서',
          value: '0.1uF',
          quantity: 1,
          reason: '아날로그 센서는 전원 노이즈에 민감해서 로컬 바이패스가 도움이 됩니다.',
          note: '센서와 MCU 사이 배선이 길어지면 출력 필터링까지 검토하는 편이 좋습니다.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        }),
      ];
    case 'tpl_gas_mq2':
      return [
        buildCompanionItem({
          kind: 'resistor',
          level: 'conditional',
          label: '감도 설정용 부하 저항 확인',
          value: 'RL 가변 / 모듈 기준 확인',
          quantity: 1,
          reason: 'MQ-2 데이터시트 기본 회로는 부하 저항과 함께 센서 출력 특성을 정합니다.',
          note: '완성 모듈은 포텐셔미터나 온보드 저항으로 이미 구현된 경우가 많습니다.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
          likelyIncludedOnModule: true,
        }),
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: '5V 레일 디커플링 세트',
          value: '0.1uF + 10uF',
          quantity: 2,
          reason: '히터 부하 센서는 전원 변동이 커서 로컬 디커플링을 같이 두는 편이 안전합니다.',
          note: '모듈 가까이에 배치하고, 고부하일 때는 외부 5V 전원도 함께 검토하세요.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        }),
        buildCompanionItem({
          kind: 'power_supply',
          level: 'recommended',
          label: '외부 5V 전원 분리',
          quantity: 1,
          reason: '히터 전류가 큰 센서는 보드 5V 레일 단독 구동보다 분리 전원이 더 안전합니다.',
          note: `${board.name} 보드 전원 예산과 워밍업 부하를 함께 확인하세요.`,
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        }),
      ];
    case 'tpl_servo':
      return [
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: '서보 전원 벌크 콘덴서',
          value: '220uF-470uF',
          quantity: 1,
          reason: '서보 기동 순간 전류 때문에 전원 레일이 흔들릴 수 있습니다.',
          note: '서보가 여러 개이거나 토크가 크면 외부 5V 전원을 우선 검토하세요.',
        }),
        buildCompanionItem({
          kind: 'power_supply',
          level: 'recommended',
          label: '외부 5V 서보 전원',
          quantity: 1,
          reason: '서보는 MCU 보드 핀보다 훨씬 큰 순간 전류를 요구할 수 있습니다.',
          note: 'GND는 MCU와 공통으로 묶고 전원만 분리하는 구성이 보통 더 안전합니다.',
        }),
      ];
    case 'tpl_dc_motor':
      return [
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: '모터 전원 벌크 콘덴서',
          value: '100uF-470uF',
          quantity: 1,
          reason: '모터 구동 전원은 기동 전류와 브러시 노이즈 영향이 커서 완충이 필요할 수 있습니다.',
          note: 'L298N 모듈 온보드 부품만 믿지 말고 실제 부하 크기 기준으로 다시 확인하세요.',
        }),
        buildCompanionItem({
          kind: 'power_supply',
          level: 'recommended',
          label: '모터 외부 전원 분리',
          quantity: 1,
          reason: '모터 전류를 보드 5V 레일 하나에 몰면 브라운아웃과 리셋 루프가 생길 수 있습니다.',
          note: '모터 전원은 별도로 두고 GND만 공통으로 묶는 구성이 보통 더 안전합니다.',
        }),
      ];
    case 'tpl_rfid_rc522': {
      const items: CompanionPartSuggestion[] = [
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: 'RFID 로컬 디커플링 콘덴서',
          value: '0.1uF',
          quantity: 1,
          reason: '3.3V RFID 프론트엔드는 전원 노이즈 영향을 줄이는 편이 좋습니다.',
          note: '브레이크아웃 모듈이면 이미 포함될 수 있습니다.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
          likelyIncludedOnModule: true,
        }),
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: 'RF 전송용 벌크 콘덴서',
          value: '10uF',
          quantity: 1,
          reason: '무선/RF 모듈은 순간 전류 스파이크로 전원 레일이 흔들릴 수 있습니다.',
          note: '모듈 바로 근처 3.3V-GND 사이에 두는 편이 좋습니다.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
          likelyIncludedOnModule: true,
        }),
      ];

      if (board.logicVoltage === '5V') {
        items.push(
          buildCompanionItem({
            kind: 'level_shifter',
            level: 'required',
            label: '3.3V SPI 레벨 시프터',
            quantity: 1,
            reason: 'MFRC522 계열은 3.3V 구동을 전제로 하므로 5V GPIO 보드에서는 신호 레벨 정리가 필요합니다.',
            note: '모듈이 5V tolerant인지 불명확하면 안전하게 레벨 시프터를 넣는 편이 좋습니다.',
            sourceLabel: source?.label,
            sourceUrl: source?.url,
          })
        );
      }

      return items;
    }
    case 'tpl_bluetooth_hc05':
      return [
        buildCompanionItem({
          kind: 'capacitor',
          level: 'recommended',
          label: '무선 모듈 벌크 콘덴서',
          value: '10uF',
          quantity: 1,
          reason: '블루투스 송신 순간의 전류 스파이크를 완충해 통신 불안정과 전압 강하를 줄입니다.',
          note: '모듈 전원 입력단 가까이에 배치하는 편이 좋습니다.',
          likelyIncludedOnModule: true,
        }),
        ...(board.logicVoltage === '5V'
          ? [
              buildCompanionItem({
                kind: 'resistor',
                level: 'conditional',
                label: 'HC-05 RX 분압 저항 세트',
                value: '예: 1k + 2k',
                quantity: 2,
                reason: '5V MCU TX를 HC-05 RX에 넣을 때는 분압이나 레벨 정리를 검토하는 편이 안전합니다.',
                note: '정확한 모듈 보드에 레벨 보호 회로가 있는지 먼저 확인하세요.',
                likelyIncludedOnModule: true,
              }),
            ]
          : []),
      ];
    default:
      break;
  }

  if ((template.design?.preferredInterface ?? getDesignRules(template.id)?.preferredInterface) === 'I2C') {
    return buildI2cSensorCompanions(template);
  }

  return [];
}

export function getCompanionSuggestionsForTemplate(
  template: ComponentTemplate,
  boardId: string
): CompanionPartSuggestion[] {
  return getCompanionItemsForTemplate(template, boardId);
}

export function getDesignRules(templateId: string): ComponentDesignRules | undefined {
  return COMPONENT_RULES[templateId];
}

export function getDatasheetStatusLabel(status: DatasheetStatus): string {
  switch (status) {
    case 'official-complete':
      return 'Official';
    case 'official-partial':
      return 'Partial';
    case 'needs-vendor-pin':
      return 'SKU Needed';
    case 'generic-module':
    default:
      return 'Generic';
  }
}

export function isDatasheetVerifiedStatus(status: DatasheetStatus): boolean {
  return status === 'official-complete' || status === 'official-partial';
}

export function getBoardAvoidPins(boardId: string): string[] {
  return BOARD_AVOID_PINS[boardId] ?? [];
}

export function getBoardDesignAnalysis(boardId: string): BoardDesignAnalysis {
  return BOARD_ANALYSIS[boardId] ?? {
    datasheetStatus: 'generic-module',
    warnings: [],
    sources: [],
    notes: [],
  };
}

function getComponentPowerProfile(templateId: string): PowerProfile | undefined {
  return COMPONENT_POWER_PROFILES[templateId];
}

const TEMPLATE_TO_PART_MASTER_CANDIDATES: Record<string, string[]> = {
  tpl_dht11: ['DHT11'],
  tpl_dht22: ['DHT22'],
  tpl_bme680: ['BME680'],
  tpl_bmp280: ['BMP280'],
  tpl_bme280: ['BME280'],
  tpl_sht31: ['SHT31-DIS-B'],
  tpl_ds18b20: ['DS18B20'],
  tpl_lm35: ['LM35'],
  tpl_vl53l0x: ['VL53L0X'],
  tpl_vl53l1x: ['VL53L1X'],
  tpl_ina219: ['INA219AIDCNR'],
  tpl_max30102: ['MAX30102'],
  tpl_bluetooth_hc05: ['HC-05', 'HC-06'],
  tpl_oled: ['SSD1306'],
  tpl_adc_module: ['MCP3008-I/P'],
  tpl_rfid_rc522: ['MFRC522'],
};

const BOARD_QUIESCENT_PROFILES: Record<string, Partial<Record<ProjectPowerInputMode, BoardQuiescentProfile>>> = {
  uno: {
    'usb-5v': {
      rail: '5V',
      typicalMa: 45,
      peakMa: 70,
      note: 'UNO 보드 자체 MCU, USB-serial, power LED 소비전류를 보수적으로 포함한 기저 부하',
    },
    'vin-9v': {
      rail: '5V',
      typicalMa: 45,
      peakMa: 70,
      note: 'VIN 9V에서도 보드 자체 5V 기저 부하는 계속 존재',
    },
    'vin-12v': {
      rail: '5V',
      typicalMa: 45,
      peakMa: 70,
      note: 'VIN 12V에서도 보드 자체 5V 기저 부하는 계속 존재',
    },
    'ext-5v': {
      rail: '5V',
      typicalMa: 45,
      peakMa: 70,
      note: '외부 5V 공급 시에도 보드 자체 quiescent current는 예산에 포함',
    },
  },
  nano: {
    'usb-5v': {
      rail: '5V',
      typicalMa: 33,
      peakMa: 55,
      note: 'Nano 보드 자체 MCU, USB-serial, LED 기저 부하 포함',
    },
    'vin-9v': {
      rail: '5V',
      typicalMa: 33,
      peakMa: 55,
      note: 'VIN 9V에서도 보드 자체 5V 기저 부하는 계속 존재',
    },
    'vin-12v': {
      rail: '5V',
      typicalMa: 33,
      peakMa: 55,
      note: 'VIN 12V에서도 보드 자체 5V 기저 부하는 계속 존재',
    },
    'ext-5v': {
      rail: '5V',
      typicalMa: 33,
      peakMa: 55,
      note: '외부 5V 공급 시에도 보드 자체 quiescent current는 예산에 포함',
    },
  },
};

export interface ComponentPowerModeOption {
  name: string;
  currentMa?: number;
  peakMa?: number;
  note?: string;
  isDefault: boolean;
}

export interface ComponentPowerModeCatalog {
  canonicalMpn: string;
  defaultMode?: string;
  options: ComponentPowerModeOption[];
}

function currentConsumptionToPowerProfile(
  record: PartMasterRecord,
  railHint?: '5V' | '3.3V',
  selectedMode?: string
): PowerProfile | undefined {
  const current = record.specsJson.currentConsumption;
  if (!current) {
    return undefined;
  }

  const modes = current.modes ?? [];
  const effectiveModeName = selectedMode ?? current.defaultMode;
  const effectiveMode = effectiveModeName
    ? modes.find(mode => mode.name === effectiveModeName)
    : undefined;

  const modeTypicalMa = modes
    .map(mode => (typeof mode.currentUa === 'number' ? mode.currentUa / 1000 : undefined))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const modePeakMa = modes
    .map(mode => mode.peakMa)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  const moduleOverheadMa =
    typeof current.moduleOverheadMa === 'number' && Number.isFinite(current.moduleOverheadMa)
      ? current.moduleOverheadMa
      : 0;

  const fallbackTypicalCandidates = [
    typeof current.typicalActiveUa === 'number' ? current.typicalActiveUa / 1000 : undefined,
    typeof current.measureUa === 'number' ? current.measureUa / 1000 : undefined,
    typeof current.idleUa === 'number' ? current.idleUa / 1000 : undefined,
    ...modeTypicalMa,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  const fallbackPeakCandidates = [
    typeof current.maxPeakMa === 'number' ? current.maxPeakMa : undefined,
    typeof current.typicalPeakMa === 'number' ? current.typicalPeakMa : undefined,
    typeof current.peakMa === 'number' ? current.peakMa : undefined,
    typeof current.maxActiveUa === 'number' ? current.maxActiveUa / 1000 : undefined,
    typeof current.typicalActiveUa === 'number' ? current.typicalActiveUa / 1000 : undefined,
    ...modeTypicalMa,
    ...modePeakMa,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);

  const selectedTypicalMa =
    typeof effectiveMode?.currentUa === 'number' ? effectiveMode.currentUa / 1000 : undefined;
  const selectedPeakMa =
    typeof effectiveMode?.peakMa === 'number'
      ? effectiveMode.peakMa
      : selectedTypicalMa;

  const candidateTypicalMa =
    typeof selectedTypicalMa === 'number' && Number.isFinite(selectedTypicalMa) && selectedTypicalMa > 0
      ? [selectedTypicalMa]
      : fallbackTypicalCandidates;
  const candidatePeakMa =
    typeof selectedPeakMa === 'number' && Number.isFinite(selectedPeakMa) && selectedPeakMa > 0
      ? [selectedPeakMa]
      : fallbackPeakCandidates;

  if (candidateTypicalMa.length === 0 && candidatePeakMa.length === 0) {
    return undefined;
  }

  const preferredRail = railHint ?? (
    (record.specsJson.supplyVoltage?.recommended ?? []).some(value => value >= 4.5)
      ? '5V'
      : '3.3V'
  );

  return {
    typicalMa: Number(((candidateTypicalMa.length > 0 ? Math.max(...candidateTypicalMa) : Math.max(...candidatePeakMa)) + moduleOverheadMa).toFixed(2)),
    peakMa: Number(((candidatePeakMa.length > 0 ? Math.max(...candidatePeakMa) : Math.max(...candidateTypicalMa)) + moduleOverheadMa).toFixed(2)),
    preferredRail,
    inferred: record.sourceQuality !== 'official-complete',
    note:
      effectiveMode?.note ??
      current.notes?.[0] ??
      `${record.canonicalMpn} part_master current profile${moduleOverheadMa > 0 ? ` + module overhead ${moduleOverheadMa}mA` : ''}`,
  };
}

export function getPartMasterRecordForComponent(
  component: PlacedComponent,
  template: ComponentTemplate
) {
  const rawCandidates = [
    component.name,
    component.value,
    template.name,
    template.id,
    component.importedMapping?.value,
    component.importedMapping?.reference,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const aliasCandidates = rawCandidates
    .map(raw => resolveCommonModuleAlias(raw)?.canonicalChip)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const directOrAliasMatch = findPartMasterRecordByLookupCandidates([
    ...aliasCandidates,
    ...rawCandidates,
  ]);
  if (directOrAliasMatch) {
    return directOrAliasMatch;
  }

  const templateCandidates = TEMPLATE_TO_PART_MASTER_CANDIDATES[template.id] ?? [];
  return findPartMasterRecordByLookupCandidates(templateCandidates);
}

function buildPartMasterValidationIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const record = getPartMasterRecordForComponent(component, template);
  const hints = record?.specsJson.validationHints;
  if (!record || !hints) {
    return issues;
  }

  const inventory = getPlacedCompanionInventory(components);
  const capacitorCount = inventory.get('capacitor') ?? 0;
  const resistorCount = inventory.get('resistor') ?? 0;

  const decoupling = hints.decoupling;
  if (decoupling) {
    const minimumCapacitorCount = decoupling.minimumCapacitorCount ?? 1;
    if (capacitorCount < minimumCapacitorCount) {
      const recommendedValues = decoupling.recommendedValues?.join(', ');
      issues.push(createDrcIssue({
        severity: decoupling.severity ?? 'warning',
        code: 'part-master.decoupling-missing',
        title: '전원 디커플링 커패시터 확인 필요',
        message: `${component.name} (${record.canonicalMpn}) 주변에서 데이터시트 기준 전원 디커플링 커패시터를 아직 확인하지 못했습니다.`,
        componentName: component.name,
        ruleId: 'part-master.decoupling-missing',
        recommendation: recommendedValues
          ? `${recommendedValues} 급 커패시터를 전원 핀 가까이에 배치하는 구성을 우선 확인하세요.${decoupling.note ? ` ${decoupling.note}` : ''}`
          : `전원 핀 가까이에 디커플링 커패시터를 추가하는 구성을 확인하세요.${decoupling.note ? ` ${decoupling.note}` : ''}`,
        sourceLabel: `${record.canonicalMpn} Datasheet`,
        sourceUrl: record.datasheetUrl,
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name} 주변에서 데이터시트가 요구하는 최소 디커플링 커패시터 수를 아직 확인하지 못했습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Detected capacitor count: ${capacitorCount}`,
            `Required capacitor count: ${minimumCapacitorCount}`,
            recommendedValues ? `Recommended values: ${recommendedValues}` : 'Recommended values: unspecified',
          ],
          assumptions: [
            '현재 companion inventory는 커패시터가 실제 전원 핀 바로 근처에 있는지까지는 보지 못하고, 프로젝트 내 존재 여부를 우선 확인합니다.',
          ],
          checkedBy: ['datasheet-rule'],
          affectedComponents: [component.instanceId],
          howToVerify: recommendedValues
            ? `${recommendedValues} 급 커패시터가 실제 전원 핀 가까이에 배치되어 있는지 확인하세요.${decoupling.note ? ` ${decoupling.note}` : ''}`
            : `전원 핀 가까이에 디커플링 커패시터가 실제 배치되어 있는지 확인하세요.${decoupling.note ? ` ${decoupling.note}` : ''}`,
        },
      }));
    }
  }

  for (const bias of hints.biasResistors ?? []) {
    if (bias.reason === 'i2c-bus') {
      continue;
    }

    const hasRelevantPinAssigned = bias.pinNames.some(pinName => {
      const matchedAssignedPin = Object.keys(component.assignedPins).find(
        assignedPin => normalizeAuditText(assignedPin) === normalizeAuditText(pinName)
      );
      return Boolean(matchedAssignedPin && component.assignedPins[matchedAssignedPin]);
    });

    if (!hasRelevantPinAssigned) {
      continue;
    }

    const minimumCount = bias.minimumCount ?? 1;
    if (resistorCount >= minimumCount) {
      continue;
    }

    const resistanceRange = bias.resistanceRangeOhms
      ? `${bias.resistanceRangeOhms[0]}Ω~${bias.resistanceRangeOhms[1]}Ω`
      : '권장 저항값';
    const kindLabel = bias.kind === 'pull-down' ? '풀다운' : '풀업';

    issues.push(createDrcIssue({
      severity: bias.severity ?? 'warning',
      code: 'part-master.bias-resistor-missing',
      title: `${kindLabel} 저항 확인 필요`,
      message: `${component.name} (${record.canonicalMpn})의 ${bias.pinNames.join('/')} 핀은 데이터시트 기준 ${kindLabel} 바이어스가 필요한데 현재 프로젝트에서는 해당 저항을 아직 확인하지 못했습니다.`,
      componentName: component.name,
      ruleId: 'part-master.bias-resistor-missing',
      recommendation: `${bias.pinNames.join('/')} 라인에 ${resistanceRange} 범위의 ${kindLabel} 저항 구성을 먼저 확인하세요.${bias.note ? ` ${bias.note}` : ''}`,
      sourceLabel: `${record.canonicalMpn} Datasheet`,
      sourceUrl: record.datasheetUrl,
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `${component.name}의 ${bias.pinNames.join('/')} 핀에서 데이터시트가 요구하는 ${kindLabel} 저항 구성을 아직 확인하지 못했습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Target pins: ${bias.pinNames.join('/')}`,
          `Detected resistor count: ${resistorCount}`,
          `Required resistor count: ${minimumCount}`,
        ],
        assumptions: [
          '현재 inventory 기반 검사는 저항이 실제 해당 핀 net에 연결됐는지까지는 보지 않고, 프로젝트 내 존재 여부를 먼저 확인합니다.',
        ],
        checkedBy: ['datasheet-rule'],
        affectedComponents: [component.instanceId],
        howToVerify: `${bias.pinNames.join('/')} 라인에 ${resistanceRange} 범위의 ${kindLabel} 저항이 실제로 연결되어 있는지 확인하세요.${bias.note ? ` ${bias.note}` : ''}`,
      },
    }));
  }

  return issues;
}

export function getComponentPowerModeCatalog(
  component: PlacedComponent,
  template: ComponentTemplate
): ComponentPowerModeCatalog | null {
  const record = getPartMasterRecordForComponent(component, template);
  const current = record?.specsJson.currentConsumption;
  const modes = current?.modes ?? [];

  if (!record || modes.length === 0) {
    return null;
  }

  return {
    canonicalMpn: record.canonicalMpn,
    defaultMode: current?.defaultMode,
    options: modes.map((mode): ComponentPowerModeCatalog['options'][number] => ({
      name: mode.name,
      currentMa:
        typeof mode.currentUa === 'number' && Number.isFinite(mode.currentUa)
          ? Number((mode.currentUa / 1000).toFixed(2))
          : undefined,
      peakMa:
        typeof mode.peakMa === 'number' && Number.isFinite(mode.peakMa)
          ? Number(mode.peakMa.toFixed(2))
          : undefined,
      note: mode.note,
      isDefault: current?.defaultMode === mode.name,
    })),
  };
}

function getMergedPowerProfile(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string,
  componentPowerModes?: ProjectComponentPowerModes
) {
  const templateProfile = getComponentPowerProfile(template.id);
  const partMasterRecord = getPartMasterRecordForComponent(component, template);
  const selectedMode = componentPowerModes?.[component.instanceId];
  const partMasterProfile = partMasterRecord
    ? currentConsumptionToPowerProfile(
        partMasterRecord,
        templateProfile?.preferredRail ?? inferAssignedPowerRail(component, template, boardId),
        selectedMode
      )
    : undefined;

  if (templateProfile && partMasterProfile) {
    return {
      typicalMa: Math.max(templateProfile.typicalMa, partMasterProfile.typicalMa),
      peakMa: Math.max(templateProfile.peakMa ?? templateProfile.typicalMa, partMasterProfile.peakMa ?? partMasterProfile.typicalMa),
      preferredRail: templateProfile.preferredRail ?? partMasterProfile.preferredRail,
      inferred: templateProfile.inferred || partMasterProfile.inferred,
      note: `${templateProfile.note} ${partMasterProfile.note}`.trim(),
    } satisfies PowerProfile;
  }

  return partMasterProfile ?? templateProfile;
}

function inferAssignedPowerRail(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string
): '5V' | '3.3V' | undefined {
  const explicitPowerPin = Object.entries(component.assignedPins).find(([componentPin]) => {
    const requirement = template.requiredPins.find(pin => pin.name === componentPin);
    return requirement?.allowedTypes.includes('POWER');
  })?.[1];

  if (explicitPowerPin === '5V' || explicitPowerPin === '3.3V') {
    return explicitPowerPin;
  }

  const profile = getComponentPowerProfile(template.id);
  if (profile?.preferredRail) {
    return profile.preferredRail;
  }

  const board = getBoardById(boardId);
  return board.logicVoltage === '5V' ? '5V' : '3.3V';
}

function buildProjectPowerReport(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  powerInputMode: ProjectPowerInputMode = 'usb-5v',
  componentPowerModes?: ProjectComponentPowerModes
) {
  const powerProfile = getProjectPowerInputProfile(boardId, powerInputMode);
  const budgetTemplates: ProjectPowerRailSummary[] = powerProfile?.rails?.length
    ? powerProfile.rails.map(item => ({
        rail: item.rail,
        usedMa: 0,
        budgetMa: item.budgetMa,
        inferred: item.inferred,
        note: item.note,
      }))
    : (BOARD_POWER_BUDGETS[boardId] ?? []).map(item => ({ ...item }));
  const rails: ProjectPowerRailSummary[] = budgetTemplates.map(item => ({ ...item }));
  const issues: ProjectAuditIssue[] = [];
  const railPeakUsage: Partial<Record<'5V' | '3.3V', number>> = {};
  const boardQuiescent = BOARD_QUIESCENT_PROFILES[boardId]?.[powerInputMode];

  if (boardQuiescent) {
    const summary = rails.find(item => item.rail === boardQuiescent.rail);
    if (summary) {
      summary.usedMa += boardQuiescent.typicalMa;
      summary.peakMa = (summary.peakMa ?? 0) + (boardQuiescent.peakMa ?? boardQuiescent.typicalMa);
      railPeakUsage[boardQuiescent.rail] = (railPeakUsage[boardQuiescent.rail] ?? 0) + (boardQuiescent.peakMa ?? boardQuiescent.typicalMa);
      summary.note = summary.note
        ? `${summary.note} ${boardQuiescent.note}`
        : boardQuiescent.note;
    }
  }

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) continue;

    const profile = getMergedPowerProfile(component, template, boardId, componentPowerModes);
    if (!profile) continue;

    const rail = inferAssignedPowerRail(component, template, boardId);
    if (!rail) continue;

    const summary = rails.find(item => item.rail === rail);
    if (summary) {
      summary.usedMa += profile.typicalMa;
      summary.peakMa = (summary.peakMa ?? 0) + (profile.peakMa ?? profile.typicalMa);
      railPeakUsage[rail] = (railPeakUsage[rail] ?? 0) + (profile.peakMa ?? profile.typicalMa);
    }

    if ((boardId === 'uno' || boardId === 'nano') && rail === '5V' && (profile.peakMa ?? profile.typicalMa) >= 100) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'power.high-5v-load',
        params: {
          componentName: component.name,
          peakMa: profile.peakMa ?? profile.typicalMa,
        },
        componentName: component.name,
        ruleId: 'power.high-5v-load',
      }));
    }
  }

  for (const summary of rails) {
    if (!summary.budgetMa) continue;
    summary.headroomMa = summary.budgetMa - summary.usedMa;
    summary.usageRatio = summary.budgetMa > 0 ? summary.usedMa / summary.budgetMa : 0;
    summary.status =
      summary.usedMa > summary.budgetMa
        ? 'error'
        : summary.usedMa >= summary.budgetMa * 0.85
          ? 'warning'
          : 'ok';

    if (summary.usedMa > summary.budgetMa) {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'power.rail-over-budget',
        params: {
          rail: summary.rail,
          usedMa: summary.usedMa,
          budgetMa: summary.budgetMa,
          note: summary.note ?? '외부 전원 또는 부하 재분배가 필요합니다.',
        },
        ruleId: `power.rail-over-budget.${summary.rail.toLowerCase()}`,
        policyKey: 'power.rail-over-budget',
        evidence: {
          confidence: 'strong-inference',
          evidenceSummary: `${summary.rail} 레일 추정 부하가 ${summary.usedMa}mA로 예산 ${summary.budgetMa}mA를 넘습니다.${summary.note ? ` ${summary.note}` : ''}`,
          observedFacts: [
            `Rail: ${summary.rail}`,
            `Estimated load: ${summary.usedMa}mA`,
            `Configured budget: ${summary.budgetMa}mA`,
            typeof summary.peakMa === 'number' ? `Estimated peak load: ${summary.peakMa}mA` : 'Estimated peak load: unavailable',
          ],
          assumptions: [
            '현재 rail budget은 part_master 전류 프로파일, 선택된 보드 전원 모드, 보드 자체 quiescent current를 바탕으로 한 보수적 추정입니다.',
          ],
          checkedBy: ['datasheet-rule'],
          howToVerify: '고부하 부품 전원을 분리하거나 더 큰 전원원을 사용하고, 실제 모듈 소비전류와 보드 전원 사양을 대조해 레일 예산을 다시 계산하세요.',
        },
      }));
      continue;
    }

    if (summary.usedMa >= summary.budgetMa * 0.85) {
      issues.push(createDrcIssue({
        severity: 'warning',
        code: 'power.rail-low-headroom',
        params: {
          rail: summary.rail,
          usedMa: summary.usedMa,
          budgetMa: summary.budgetMa,
          note: summary.note ?? '전원 여유를 다시 확인하세요.',
        },
        ruleId: `power.rail-low-headroom.${summary.rail.toLowerCase()}`,
        policyKey: 'power.rail-low-headroom',
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${summary.rail} 레일 추정 부하가 예산의 ${Math.round((summary.usageRatio ?? 0) * 100)}% 수준까지 올라가 전원 여유가 작습니다.`,
          observedFacts: [
            `Rail: ${summary.rail}`,
            `Estimated load: ${summary.usedMa}mA`,
            `Configured budget: ${summary.budgetMa}mA`,
            `Headroom: ${summary.headroomMa ?? summary.budgetMa - summary.usedMa}mA`,
          ],
          assumptions: [
            '현재 전류 예산은 부품 모드, 모듈 오버헤드, 실제 동시동작률에 따라 달라질 수 있어 보수적으로 계산됩니다.',
          ],
          checkedBy: ['datasheet-rule'],
          howToVerify: '실제 동시에 켜지는 부하와 전원원 정격을 다시 확인하고, 여유가 10~15% 이상 남도록 레일 부하를 재배치하거나 외부 전원을 분리하세요.',
        },
      }));
    }
  }

  const regulators: ProjectRegulatorThermalScenario[] = (powerProfile?.regulators ?? []).map(scenario => {
    const railCurrentMa = railPeakUsage[scenario.rail] ?? railPeakUsage[scenario.outputVoltage === 5 ? '5V' : '3.3V'] ?? 0;
    const dissipationW = (scenario.inputVoltage - scenario.outputVoltage) * (railCurrentMa / 1000);
    const ratio = scenario.safeLimitW > 0 ? dissipationW / scenario.safeLimitW : 0;
    const recommendedUsageRatio = getRecommendedRegulatorUsageRatio(scenario);
    const ambientTempC = scenario.ambientTempC ?? 25;
    const thermalResistanceCPerW = scenario.thermalResistanceCPerW;
    const junctionTempC =
      typeof thermalResistanceCPerW === 'number'
        ? ambientTempC + thermalResistanceCPerW * dissipationW
        : undefined;
    const status: ProjectRegulatorThermalScenario['status'] =
      typeof junctionTempC === 'number'
        ? junctionTempC >= 100
          ? 'error'
          : junctionTempC >= 85 || ratio >= recommendedUsageRatio
            ? 'warning'
            : 'ok'
        : ratio > 1
          ? 'error'
          : ratio >= recommendedUsageRatio
            ? 'warning'
            : 'ok';

    return {
      id: scenario.id,
      label: scenario.label,
      inputVoltage: scenario.inputVoltage,
      outputVoltage: scenario.outputVoltage,
      estimatedCurrentMa: railCurrentMa,
      dissipationW: Number(dissipationW.toFixed(2)),
      safeLimitW: scenario.safeLimitW,
      thermalResistanceCPerW,
      ambientTempC,
      junctionTempC: typeof junctionTempC === 'number' ? Number(junctionTempC.toFixed(1)) : undefined,
      usageRatio: ratio,
      packageLabel: scenario.packageLabel,
      status,
      note: scenario.note,
    };
  });

  for (const regulator of regulators) {
    if (regulator.estimatedCurrentMa <= 0) {
      continue;
    }

    if (regulator.status === 'error') {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'power.regulator-thermal',
        params: {
          regulatorLabel: regulator.label,
          dissipationW: regulator.dissipationW,
          safeLimitW: regulator.safeLimitW,
        },
        ruleId: `power.regulator-thermal.${regulator.id}`,
        message: `${regulator.label}에서 추정 손실이 ${regulator.dissipationW}W로 계산되어 안전 한계 ${regulator.safeLimitW}W를 넘습니다.${regulator.packageLabel ? ` 패키지는 ${regulator.packageLabel}` : ''}${typeof regulator.junctionTempC === 'number' ? `, 추정 접합 온도는 약 ${regulator.junctionTempC}°C입니다.` : '.'}`,
        recommendation: '이 레귤레이터는 이미 정격 한계를 넘는 쪽으로 보입니다. 데이터시트의 Pd(허용 손실), RθJA, 최대 접합 온도(Tj max)를 확인하고, 입력 전압을 낮추거나 외부 5V/DCDC로 부하를 분리하는 쪽을 우선 검토해 주세요.',
        policyKey: 'power.regulator-thermal',
        visualTargets: {
          componentIds: [regulator.id],
        },
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: `${regulator.label}의 추정 전력 손실이 계산상 안전 한계를 넘습니다.`,
          observedFacts: [
            `Regulator: ${regulator.label}`,
            `Estimated dissipation: ${regulator.dissipationW}W`,
            `Safe dissipation limit: ${regulator.safeLimitW}W`,
            typeof regulator.junctionTempC === 'number' ? `Estimated junction temperature: ${regulator.junctionTempC}°C` : 'Estimated junction temperature: unavailable',
            regulator.packageLabel ? `Package: ${regulator.packageLabel}` : 'Package: unspecified',
          ],
          assumptions: [],
          checkedBy: ['datasheet-rule'],
          howToVerify: '데이터시트의 Pd, RθJA, Tj max를 실제 입력 전압/부하 전류 조건과 대조하고, 필요하면 입력 전압을 낮추거나 외부 DCDC/5V 전원으로 부하를 분리하세요.',
        },
      }));
      continue;
    }

    if (regulator.status === 'warning') {
      const marginGuidance = getRegulatorReliabilityGuidance(regulator);
      issues.push(createDrcIssue({
        severity: 'warning',
        code: 'power.regulator-headroom',
        params: {
          regulatorLabel: regulator.label,
          dissipationW: regulator.dissipationW,
        },
        ruleId: `power.regulator-headroom.${regulator.id}`,
        message: `${regulator.label}는 아직 즉시 과열 수준은 아니지만, 추정 손실이 ${regulator.dissipationW}W로 장기 운용 여유가 빠듯합니다.${regulator.packageLabel ? ` ${regulator.packageLabel}` : ''}${typeof regulator.junctionTempC === 'number' ? ` 기준 추정 접합 온도는 약 ${regulator.junctionTempC}°C입니다.` : '.'}`,
        recommendation: `당장 절대 정격 초과는 아니지만 장기 신뢰성 여유가 부족할 수 있습니다. ${marginGuidance} 데이터시트의 연속 손실 허용치, RθJA, 권장 구리면적 조건을 확인하고, 입력 전압 또는 5V 부하를 줄여 여유를 더 확보해 주세요.`,
        policyKey: 'power.regulator-headroom',
        visualTargets: {
          componentIds: [regulator.id],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${regulator.label}는 즉시 과열로 단정할 수준은 아니지만 장기 운용 기준 열 여유가 작습니다.`,
          observedFacts: [
            `Regulator: ${regulator.label}`,
            `Estimated dissipation: ${regulator.dissipationW}W`,
            `Recommended usage ratio: ${getRecommendedRegulatorUsageRatio(regulator).toFixed(2)}`,
            `Estimated usage ratio: ${(regulator.usageRatio ?? 0).toFixed(2)}`,
            typeof regulator.junctionTempC === 'number' ? `Estimated junction temperature: ${regulator.junctionTempC}°C` : 'Estimated junction temperature: unavailable',
          ],
          assumptions: [
            '열 판정은 선택된 전원 모드, 추정 peak current, 패키지 기반 보수적 headroom 기준을 사용합니다.',
          ],
          checkedBy: ['datasheet-rule'],
          howToVerify: '데이터시트의 연속 손실 허용치, RθJA, 권장 구리면적 조건을 실제 입력 전압과 부하 전류 조건에 대조하고, 필요하면 입력 전압 또는 5V 레일 부하를 줄여 여유를 늘리세요.',
        },
      }));
    }
  }

  return {
    rails,
    regulators,
    issues: deduplicateAuditIssues(issues),
  };
}

function buildProjectCompanionReport(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
): ProjectCompanionReport {
  const suggestions: ComponentCompanionSuggestion[] = [];
  let requiredCount = 0;
  let recommendedCount = 0;
  let conditionalCount = 0;

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) continue;

    const items = getCompanionItemsForTemplate(template, boardId);
    if (items.length === 0) continue;

    for (const item of items) {
      if (item.level === 'required') requiredCount += item.quantity;
      else if (item.level === 'recommended') recommendedCount += item.quantity;
      else conditionalCount += item.quantity;
    }

    suggestions.push({
      componentInstanceId: component.instanceId,
      componentName: component.name,
      templateId: component.templateId,
      items,
    });
  }

  const summaryMap = new Map<string, CompanionSummaryLine>();
  for (const suggestion of suggestions) {
    for (const item of suggestion.items) {
      const key = [
        item.level,
        item.kind,
        item.label,
        item.value ?? '',
      ].join('::');

      const existing = summaryMap.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        if (!existing.components.includes(suggestion.componentName)) {
          existing.components.push(suggestion.componentName);
        }
        continue;
      }

      summaryMap.set(key, {
        key,
        kind: item.kind,
        level: item.level,
        label: item.label,
        value: item.value,
        quantity: item.quantity,
        components: [suggestion.componentName],
        note: item.note,
      });
    }
  }

  return {
    requiredCount,
    recommendedCount,
    conditionalCount,
    suggestions,
    summary: Array.from(summaryMap.values()).sort((a, b) => {
      const priority = { required: 0, recommended: 1, conditional: 2 };
      return priority[a.level] - priority[b.level] || a.label.localeCompare(b.label, 'ko');
    }),
  };
}

export function getProjectedPowerIssueForComponent(
  components: PlacedComponent[],
  boardId: string,
  template: ComponentTemplate,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  powerInputMode: ProjectPowerInputMode = 'usb-5v',
  componentPowerModes?: ProjectComponentPowerModes
) {
  const projectedComponent: PlacedComponent = {
    instanceId: `power-preview-${template.id}`,
    templateId: template.id,
    name: template.name,
    position: { x: 0, y: 0 },
    rotation: 0,
    assignedPins: {},
    isFullyRouted: false,
  };

  const report = buildProjectPowerReport(
    [...components, projectedComponent],
    boardId,
    resolveTemplate,
    powerInputMode,
    componentPowerModes
  );

  return report.issues.find(issue => issue.severity === 'error');
}

export function getPreferredPinsForRequirement(
  template: ComponentTemplate,
  boardId: string,
  requirementName: string
): string[] {
  const rules = template.design ?? getDesignRules(template.id);
  return (
    rules?.preferredBoardPins?.[boardId]?.[requirementName] ??
    COMMON_PIN_PREFERENCES[boardId]?.[requirementName] ??
    []
  );
}

function pushWarning(list: DesignWarning[], warning: DesignWarning) {
  if (!list.some(item => item.title === warning.title && item.message === warning.message)) {
    list.push(warning);
  }
}

export function analyzeComponentForBoard(
  template: ComponentTemplate,
  boardId: string
): ComponentBoardAnalysis {
  const board = getBoardById(boardId);
  const rules = template.design ?? getDesignRules(template.id);
  const warnings: DesignWarning[] = [...(rules?.warnings ?? [])];

  if (isImportedSchematicBoard(boardId)) {
    return {
      datasheetStatus: rules?.datasheetStatus ?? 'generic-module',
      preferredInterface: rules?.preferredInterface,
      warnings,
      sources: rules?.datasheetSources ?? [],
      tags: rules?.tags ?? [],
      requiredRail: 'BOTH',
    };
  }

  if (template.compatibleVoltage !== 'BOTH' && template.compatibleVoltage !== board.logicVoltage) {
    pushWarning(warnings, {
      severity: 'error',
      title: '보드 전압 비호환',
      message:
        board.logicVoltage === '5V' && template.compatibleVoltage === '3.3V'
          ? `${board.name}에는 3.3V 전원 핀이 있어도 기본 GPIO 신호는 5V 기준이라 레벨 변환과 전원 구성을 함께 확인해야 합니다.`
          : `${template.compatibleVoltage} 전용 부품이라 ${board.name} (${board.logicVoltage})에 직접 연결하면 전원 또는 신호 레벨 문제가 생길 수 있습니다.`,
    });
  }

  if (boardId === 'rpi4' && ['ACTUATOR'].includes(template.category)) {
    pushWarning(warnings, {
      severity: 'warning',
      title: '라즈베리파이 GPIO 직접 구동 주의',
      message: 'Raspberry Pi 4 GPIO는 직접 부하 구동 여유가 작아서 드라이버나 외부 전원 분리가 필요할 수 있습니다.',
    });
  }

  if (boardId === 'esp32' && template.compatibleVoltage === '5V') {
    pushWarning(warnings, {
      severity: 'warning',
      title: 'ESP32 레벨 주의',
      message: 'ESP32는 3.3V GPIO 환경이라 5V 신호를 그대로 받는 센서는 레벨 매칭을 먼저 확인해야 합니다.',
    });
  }

  if (boardId === 'rpi4' && template.id === 'tpl_gas_mq2') {
    pushWarning(warnings, {
      severity: 'warning',
      title: '아날로그 입력 별도 필요',
      message: 'Raspberry Pi 4는 기본 아날로그 입력이 없어서 MQ-2 아날로그 출력을 읽으려면 ADC가 추가로 필요합니다.',
    });
  }

  if (boardId === 'rpi4' && template.requiredPins.some(pin => pin.allowedTypes.includes('ANALOG'))) {
    pushWarning(warnings, {
      severity: 'error',
      title: '라즈베리파이 아날로그 입력 부재',
      message: 'Raspberry Pi 4는 기본 아날로그 입력이 없어서 이 센서를 그대로 읽으려면 외부 ADC가 필요합니다.',
    });
  }

  return {
    datasheetStatus: rules?.datasheetStatus ?? 'generic-module',
    preferredInterface: rules?.preferredInterface,
    warnings,
    sources: rules?.datasheetSources ?? [],
    tags: rules?.tags ?? [],
    requiredRail: template.compatibleVoltage,
  };
}

function buildPowerShortCircuitIssues(
  component: PlacedComponent,
  template: ComponentTemplate
) {
  const issues: ProjectAuditIssue[] = [];
  const source = getPrimarySource(template);
  const powerPins = template.requiredPins.filter(pin => pin.allowedTypes.includes('POWER'));
  const groundPins = template.requiredPins.filter(pin => pin.allowedTypes.includes('GND'));

  const powerAssignments = powerPins
    .map(pin => ({ pinName: pin.name, boardPin: component.assignedPins[pin.name] }))
    .filter(item => Boolean(item.boardPin));
  const groundAssignments = groundPins
    .map(pin => ({ pinName: pin.name, boardPin: component.assignedPins[pin.name] }))
    .filter(item => Boolean(item.boardPin));

  for (const assignment of powerAssignments) {
    if (assignment.boardPin === 'GND') {
      issues.push({
        severity: 'error',
        title: '전원 단락 위험',
        message: `${component.name} ${assignment.pinName}이(가) 전원 대신 GND에 연결되어 있습니다. 전원 인가 시 즉시 단락으로 이어질 수 있습니다.`,
        componentName: component.name,
        ruleId: 'power.dead-short.power-to-ground',
        recommendation: '전원 입력 핀은 5V 또는 3.3V 레일로 다시 연결하고, GND와 직접 마주보는 연결은 제거하세요.',
        sourceLabel: source?.label,
        sourceUrl: source?.url,
      });
    }
  }

  for (const assignment of groundAssignments) {
    if (assignment.boardPin === '5V' || assignment.boardPin === '3.3V') {
      issues.push({
        severity: 'error',
        title: '전원 단락 위험',
        message: `${component.name} ${assignment.pinName}이(가) 접지 대신 ${assignment.boardPin} 레일에 연결되어 있습니다. 전원 인가 시 보드와 부품이 손상될 수 있습니다.`,
        componentName: component.name,
        ruleId: 'power.dead-short.ground-to-power',
        recommendation: 'GND 핀은 반드시 접지 레일로만 연결하고, 전원 레일과의 직접 연결은 제거하세요.',
        sourceLabel: source?.label,
        sourceUrl: source?.url,
      });
    }
  }

  for (const powerAssignment of powerAssignments) {
    if (!powerAssignment.boardPin) {
      continue;
    }

    const sameNetGroundPin = groundAssignments.find(
      groundAssignment => groundAssignment.boardPin === powerAssignment.boardPin
    );

    if (!sameNetGroundPin) {
      continue;
    }

    issues.push({
      severity: 'error',
      title: '전원 단락 위험',
      message: `${component.name}에서 ${powerAssignment.pinName}과(와) ${sameNetGroundPin.pinName}이(가) 동일한 ${powerAssignment.boardPin} 레일로 묶여 있습니다. 임피던스 없는 직접 쇼트로 판단됩니다.`,
      componentName: component.name,
      ruleId: 'power.dead-short.same-net',
      recommendation: 'VCC 계열 핀과 GND 핀은 서로 다른 전원 네트로 분리하고, 중간 보호 회로나 실제 부하 경로가 없는 직접 연결은 피하세요.',
      sourceLabel: source?.label,
      sourceUrl: source?.url,
    });
  }

  return issues;
}

function buildVoltageDomainIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const source = getPrimarySource(template);
  const hasDivider = (getPlacedCompanionInventory(components).get('resistor') ?? 0) >= 2;

  for (const signalPin of getComponentSignalPins(template)) {
    const boardPinId = component.assignedPins[signalPin.name];
    if (!boardPinId) {
      continue;
    }

    const boardPinSpec = getBoardPinElectricalSpec(boardId, boardPinId);
    if (!boardPinSpec) {
      continue;
    }

    const signalProfile = getSignalProfileForPin(template.id, signalPin.name);
    const inputTolerance = signalProfile?.maxInputVoltage ?? (
      signalProfile?.direction === 'input' || signalProfile?.direction === 'bidirectional'
        ? getTemplateSignalMaxVoltage(template)
        : undefined
    );

    if (typeof inputTolerance === 'number' && boardPinSpec.voltageLevel.nominal > inputTolerance) {
      const mitigated = hasDivider;
      issues.push(createDrcIssue({
        severity: mitigated ? 'warning' : 'error',
        code: 'electrical.logic-level.overvoltage',
        params: {
          componentName: component.name,
          pinName: signalPin.name,
          inputTolerance,
          boardPin: boardPinId,
          boardVoltage: boardPinSpec.voltageLevel.nominal,
          mitigationRecommendation: mitigated
            ? '분압 저항을 프로젝트에 배치해 두었더라도 현재 신호선에 실제로 적용되는지 다시 확인하세요.'
            : '레벨 시프터 또는 분압 회로를 추가해 5V 신호가 3.3V 입력에 직접 들어가지 않도록 바꾸세요.',
          mitigationRecommendationEn: mitigated
            ? 'Even if the project already includes a divider, confirm that this exact signal line really passes through it.'
            : 'Add a level shifter or divider so a 5V signal does not go straight into a 3.3V input.',
        },
        componentName: component.name,
        ruleId: 'electrical.logic-level.overvoltage',
        sourceLabel: source?.label,
        sourceUrl: source?.url,
        visualTargets: {
          componentIds: [component.instanceId],
        },
        confidence: mitigated ? 'strong-inference' : 'confirmed',
        evidence: {
          confidence: mitigated ? 'strong-inference' : 'confirmed',
          evidenceSummary: `${component.name}의 ${signalPin.name} 입력 허용치 ${inputTolerance}V보다 보드 ${boardPinId}의 논리 레벨 ${boardPinSpec.voltageLevel.nominal}V가 높습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected pin: ${signalPin.name}`,
            `Board pin: ${boardPinId}`,
            `Board nominal voltage: ${boardPinSpec.voltageLevel.nominal}V`,
            `Input tolerance: ${inputTolerance}V`,
          ],
          assumptions: mitigated
            ? ['프로젝트에 분압 저항이 있더라도 이 신호선 경로에 실제로 들어가 있는지는 별도 확인이 필요합니다.']
            : [],
          checkedBy: ['datasheet-rule'],
          affectedComponents: [component.instanceId],
          howToVerify: mitigated
            ? '분압 또는 레벨 시프터가 이 정확한 신호선 경로에 들어가는지 net 기준으로 다시 확인하세요.'
            : '레벨 시프터 또는 분압 회로를 추가해 5V 신호가 3.3V 입력에 직접 들어가지 않게 수정하세요.',
        },
      }));
    }

    if (
      typeof signalProfile?.minHighVoltage === 'number' &&
      boardPinSpec.voltageLevel.nominal < signalProfile.minHighVoltage
    ) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'electrical.logic-level.low-high-threshold',
        params: {
          componentName: component.name,
          pinName: signalPin.name,
          minHighVoltage: signalProfile.minHighVoltage,
          boardPin: boardPinId,
          boardVoltage: boardPinSpec.voltageLevel.nominal,
        },
        componentName: component.name,
        ruleId: 'electrical.logic-level.low-high-threshold',
        sourceLabel: source?.label,
        sourceUrl: source?.url,
      }));
    }

    const outputVoltage = getSignalOutputVoltage(component, template, signalPin.name, boardId);
    if (
      typeof outputVoltage === 'number' &&
      (signalProfile?.direction === 'output' || signalProfile?.direction === 'bidirectional') &&
      outputVoltage > boardPinSpec.voltageLevel.max
    ) {
      const mitigated = hasDivider;
      issues.push(createProjectAuditIssue({
        severity: mitigated ? 'warning' : 'error',
        code: 'electrical.logic-level.overvoltage-output',
        params: {
          componentName: component.name,
          pinName: signalPin.name,
          outputVoltage,
          boardPin: boardPinId,
          maxSafeVoltage: boardPinSpec.voltageLevel.max,
          mitigationRecommendation: mitigated
            ? '분압 저항이 실제로 이 라인 사이에 들어가는지 다시 확인하세요.'
            : '5V 출력이 3.3V GPIO에 바로 들어가지 않도록 레벨 시프터 또는 전압 분배 저항을 추가하세요.',
          mitigationRecommendationEn: mitigated
            ? 'Confirm that the divider really sits on this exact line.'
            : 'Add a level shifter or voltage divider so the 5V output does not feed the 3.3V GPIO directly.',
        },
        componentName: component.name,
        ruleId: 'electrical.logic-level.overvoltage-output',
        sourceLabel: source?.label,
        sourceUrl: source?.url,
      }));
    }
  }

  return issues;
}

function buildAdcOverRangeIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const source = getPrimarySource(template);
  const hasDivider = (getPlacedCompanionInventory(components).get('resistor') ?? 0) >= 2;
  const hasAdcModule = hasPlacedCompanion(components, 'adc');

  for (const signalPin of getComponentSignalPins(template)) {
    const boardPinId = component.assignedPins[signalPin.name];
    if (!boardPinId) {
      continue;
    }

    const boardPinSpec = getBoardPinElectricalSpec(boardId, boardPinId);
    if (!boardPinSpec?.supportedProtocols.includes('ADC')) {
      continue;
    }

    const signalProfile = getSignalProfileForPin(template.id, signalPin.name);
    const maxAnalogVoltage = getSignalOutputVoltage(component, template, signalPin.name, boardId);
    if (
      !signalProfile ||
      typeof maxAnalogVoltage !== 'number' ||
      signalProfile.direction !== 'output' ||
      maxAnalogVoltage <= boardPinSpec.voltageLevel.nominal
    ) {
      continue;
    }

    issues.push(createProjectAuditIssue({
      severity: hasDivider || hasAdcModule ? 'warning' : 'error',
      code: 'electrical.adc-over-range',
      params: {
        componentName: component.name,
        pinName: signalPin.name,
        maxAnalogVoltage,
        boardPin: boardPinId,
        nominalVoltage: boardPinSpec.voltageLevel.nominal,
        mitigationRecommendation: hasDivider || hasAdcModule
          ? '분압 저항 또는 외부 ADC를 추가해 둔 상태라면 실제로 해당 아날로그 라인에 적용되는지 다시 확인하세요.'
          : '신호선에 전압 분배 저항을 넣거나, 외부 ADC/버퍼를 사용해 ADC 입력 범위를 넘지 않도록 조정하세요.',
        mitigationRecommendationEn: hasDivider || hasAdcModule
          ? 'If you already added a divider or external ADC, confirm that it is actually wired into this analog path.'
          : 'Add a voltage divider or use an external ADC or buffer so the ADC input stays inside range.',
      },
      componentName: component.name,
      ruleId: 'electrical.adc-over-range',
      sourceLabel: source?.label,
      sourceUrl: source?.url,
    }));
  }

  return issues;
}

function buildLedCurrentLimitingIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const resistorCount = getPlacedCompanionInventory(components).get('resistor') ?? 0;

  if (template.id === 'tpl_led' && resistorCount < 1) {
    issues.push({
      severity: 'error',
      title: 'LED 보호 저항 누락',
      message: `${component.name}이(가) 전류 제한 저항 없이 보드 핀에 직접 연결된 것으로 보입니다.`,
      componentName: component.name,
      ruleId: 'actuator.led-current-limit-missing',
      recommendation: '220Ω~330Ω 직렬 저항을 추가해 LED와 MCU 핀이 과전류로 손상되지 않도록 하세요.',
      sourceLabel: 'Arduino UNO R3 Datasheet',
      sourceUrl: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf',
    });
  }

  if (template.id === 'tpl_rgb_led' && resistorCount < 3) {
    issues.push({
      severity: 'error',
      title: 'RGB LED 채널 저항 부족',
      message: `${component.name}은(는) R/G/B 각 채널마다 전류 제한 저항이 필요하지만 현재 프로젝트에는 ${resistorCount}개만 배치되어 있습니다.`,
      componentName: component.name,
      ruleId: 'actuator.rgb-current-limit-missing',
      recommendation: '채널별로 220Ω~330Ω 저항을 하나씩 두어 총 3개의 직렬 저항을 확보하세요.',
      sourceLabel: 'Arduino UNO R3 Datasheet',
      sourceUrl: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf',
    });
  }

  return issues;
}

function buildActuatorPowerIsolationIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const powerPin = component.assignedPins.VCC;
  const hasExternalPower = hasPlacedCompanion(components, 'power_supply');

  if (!powerPin || hasExternalPower) {
    return issues;
  }

  if (template.id === 'tpl_servo' && (powerPin === '5V' || powerPin === '3.3V')) {
    issues.push({
      severity: 'warning',
      title: '서보 외부 전원 분리 권장',
      message: `${component.name}의 VCC가 보드 ${powerPin} 레일에 직접 연결되어 있어 기동/락 전류 순간에 보드가 리셋될 수 있습니다.`,
      componentName: component.name,
      ruleId: 'power.actuator-servo-isolation',
      recommendation: '서보 전원은 외부 5V 전원으로 분리하고, GND만 MCU와 공통으로 묶는 구성을 우선 검토하세요.',
    });
  }

  if (template.id === 'tpl_dc_motor' && (powerPin === '5V' || powerPin === '3.3V')) {
    issues.push({
      severity: 'warning',
      title: '모터 전원 분리 권장',
      message: `${component.name}의 구동 전원이 보드 ${powerPin} 레일에 직접 물려 있어 브라운아웃이나 노이즈 유입 가능성이 큽니다.`,
      componentName: component.name,
      ruleId: 'power.actuator-motor-isolation',
      recommendation: '모터 전원은 별도 공급원으로 분리하고 GND만 공통으로 묶어 보드 리셋과 전원 강하를 줄이세요.',
    });
  }

  return issues;
}

function buildBulkDecouplingIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const capacitorCount = getPlacedCompanionInventory(components).get('capacitor') ?? 0;

  if (capacitorCount > 0) {
    return issues;
  }

  if (template.id === 'tpl_bluetooth_hc05') {
    issues.push(createDrcIssue({
      severity: 'warning',
      code: 'power.bulk-cap-wireless',
      title: '무선 모듈 벌크 콘덴서 미확인',
      message: `${component.name} 주변에 10uF급 전원 안정화 콘덴서를 아직 확인하지 못했습니다. 블루투스 송신 순간 전압 강하가 생길 수 있습니다.`,
      componentName: component.name,
      ruleId: 'power.bulk-cap-wireless',
      recommendation: '모듈 전원 입력단 가까이에 10uF 이상 벌크 콘덴서를 병렬 배치해 순간 전류 스파이크를 완충하세요.',
      visualTargets: {
        componentIds: [component.instanceId],
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `${component.name} 주변에서 무선 송신 순간 전류를 완충할 벌크 커패시터를 아직 확인하지 못했습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Detected capacitor count: ${capacitorCount}`,
          'Recommended bulk capacitor: 10uF or larger near module supply input',
        ],
        assumptions: [
          '현재 검사는 커패시터가 실제 모듈 전원 입력 바로 근처에 있는지까지는 보지 못하고, 프로젝트 내 capacitor 존재 여부를 우선 확인합니다.',
        ],
        checkedBy: ['datasheet-rule'],
        affectedComponents: [component.instanceId],
        howToVerify: 'HC-05/HC-06 모듈 전원 입력 가까이에 10uF 이상 벌크 커패시터와 로컬 디커플링이 실제로 배치되어 있는지 확인하세요.',
      },
    }));
  }

  if (template.id === 'tpl_rfid_rc522') {
    issues.push({
      severity: 'warning',
      title: 'RF 모듈 전원 안정화 미확인',
      message: `${component.name} 주변에 충분한 벌크 콘덴서를 아직 확인하지 못했습니다. RF 송수신 시 3.3V 레일이 흔들릴 수 있습니다.`,
      componentName: component.name,
      ruleId: 'power.bulk-cap-rf',
      recommendation: '모듈 근처 3.3V-GND 사이에 10uF급 벌크 콘덴서를 추가해 통신 불안정 가능성을 줄이세요.',
      sourceLabel: getPrimarySource(template)?.label,
      sourceUrl: getPrimarySource(template)?.url,
    });
  }

  return issues;
}

function buildComponentRuleIssues(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardId: string,
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const source = getPrimarySource(template);
  const busProfile = getBusProfile(template.id);

  for (const issue of buildPowerShortCircuitIssues(component, template)) {
    issues.push(issue);
  }

  for (const issue of buildVoltageDomainIssues(component, template, boardId, components)) {
    issues.push(issue);
  }

  for (const issue of buildAdcOverRangeIssues(component, template, boardId, components)) {
    issues.push(issue);
  }

  for (const issue of buildLedCurrentLimitingIssues(component, template, components)) {
    issues.push(issue);
  }

  for (const issue of buildActuatorPowerIsolationIssues(component, template, boardId, components)) {
    issues.push(issue);
  }

  for (const issue of buildBulkDecouplingIssues(component, template, components)) {
    issues.push(issue);
  }

  for (const issue of buildPartMasterValidationIssues(component, template, components)) {
    issues.push(issue);
  }

  if (busProfile?.signalPins) {
    for (const [componentPin, protocol] of Object.entries(busProfile.signalPins)) {
      const boardPinId = component.assignedPins[componentPin];
      if (!boardPinId) {
        continue;
      }

      const pinSpec = getBoardPinElectricalSpec(boardId, boardPinId);
      if (!pinSpec) {
        continue;
      }

      const protocolSupported =
        protocol === 'ONEWIRE'
          ? pinSpec.direction === 'BIDIR'
          : pinSpec.supportedProtocols.includes(protocol);

      if (!protocolSupported) {
        issues.push({
          severity: busProfile.protocol === 'SINGLE_BUS' ? 'warning' : 'error',
          title: `${busProfile.protocol} 핀 배정 불일치`,
          message: `${componentPin}이(가) ${boardPinId}에 연결되어 있지만 ${busProfile.protocol} 기본 역할(${protocol})로 선언된 핀이 아닙니다.`,
          componentName: component.name,
          ruleId: `protocol.pin-role.${busProfile.protocol.toLowerCase()}`,
          recommendation: `${busProfile.protocol} 기본 핀 맵 또는 데이터시트 권장 핀으로 다시 연결하세요.`,
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        });
      }
    }
  }

  const signalLoad = getSignalLoadProfile(template.id);
  if (signalLoad?.directDrive) {
    const candidatePins = signalLoad.pinNames ?? Object.keys(component.assignedPins);

    for (const componentPin of candidatePins) {
      const boardPinId = component.assignedPins[componentPin];
      if (!boardPinId) {
        continue;
      }

      const pinSpec = getBoardPinElectricalSpec(boardId, boardPinId);
      if (!pinSpec) {
        continue;
      }

      const signalMaxVoltage = getTemplateSignalMaxVoltage(template);
      if (pinSpec.voltageLevel.nominal > signalMaxVoltage) {
        issues.push(createProjectAuditIssue({
          severity: 'error',
          code: 'electrical.voltage-mismatch',
          params: {
            boardPin: boardPinId,
            boardVoltage: pinSpec.voltageLevel.nominal,
            componentName: component.name,
            signalMaxVoltage,
          },
          componentName: component.name,
          ruleId: 'electrical.voltage-mismatch',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        }));
      }

      if (signalLoad.defaultCurrentMa > pinSpec.maxCurrent.source) {
        issues.push({
          severity: 'error',
          title: 'GPIO 직접 구동 전류 초과',
          message: `${component.name} ${componentPin}은(는) 약 ${signalLoad.defaultCurrentMa}mA 부하로 가정되며 ${boardPinId} 핀의 권장 공급 한계 ${pinSpec.maxCurrent.source}mA를 넘습니다.`,
          componentName: component.name,
          ruleId: 'electrical.gpio-overcurrent',
          recommendation: '직접 구동 대신 트랜지스터/드라이버를 추가하거나 외부 전원 경로로 분리하세요.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        });
      } else if (signalLoad.defaultCurrentMa > pinSpec.maxCurrent.source * 0.8) {
        issues.push({
          severity: 'warning',
          title: 'GPIO 전류 여유 부족',
          message: `${component.name} ${componentPin} 부하는 ${boardPinId} 핀의 권장 전류 한계에 가깝습니다. ${signalLoad.note}`,
          componentName: component.name,
          ruleId: 'electrical.gpio-low-headroom',
          recommendation: '전류 제한 저항과 외부 드라이버 사용 여부를 함께 점검하세요.',
          sourceLabel: source?.label,
          sourceUrl: source?.url,
        });
      }
    }
  }

  return issues;
}

function buildBusAuditIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const i2cDevices = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && getBusProfile(item.template.id)?.protocol === 'I2C');

  const exactAddressMap = new Map<string, string[]>();
  const configurableAddressMap = new Map<string, string[]>();

  for (const { component, template } of i2cDevices) {
    const profile = template ? getBusProfile(template.id) : undefined;
    if (!profile?.addresses || profile.addresses.length === 0) {
      continue;
    }

    if (profile.addresses.length === 1 && !profile.addressConfigurable) {
      const key = profile.addresses[0];
      exactAddressMap.set(key, [...(exactAddressMap.get(key) ?? []), component.name]);
      continue;
    }

    const defaultKey = profile.addresses[0];
    configurableAddressMap.set(defaultKey, [...(configurableAddressMap.get(defaultKey) ?? []), component.name]);
  }

  for (const [address, names] of exactAddressMap.entries()) {
    if (names.length > 1) {
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'bus.i2c-address-collision',
        params: {
          componentNames: names.join(', '),
          address,
        },
        ruleId: 'bus.i2c-address-collision',
      }));
    }
  }

  for (const [address, names] of configurableAddressMap.entries()) {
    if (names.length > 1) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'bus.i2c-address-planning',
        params: {
          componentNames: names.join(', '),
          address,
        },
        ruleId: 'bus.i2c-address-planning',
      }));
    }
  }

  const spiDevices = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && getBusProfile(item.template.id)?.protocol === 'SPI');

  if (spiDevices.length > 1) {
    const chipSelectOwners = new Map<string, string[]>();

    for (const { component, template } of spiDevices) {
      const csPinName = template ? getBusProfile(template.id)?.chipSelectPinName : undefined;
      const boardPin = csPinName ? component.assignedPins[csPinName] : undefined;
      if (!boardPin) {
        continue;
      }
      chipSelectOwners.set(boardPin, [...(chipSelectOwners.get(boardPin) ?? []), component.name]);
    }

    for (const [boardPin, owners] of chipSelectOwners.entries()) {
      if (owners.length > 1) {
        issues.push({
          severity: 'error',
          title: 'SPI CS 핀 충돌',
          message: `${owners.join(', ')} 이(가) 동일한 CS 핀 ${boardPin}을 공유하고 있습니다.`,
          ruleId: 'bus.spi-cs-collision',
          recommendation: 'SPI 장치마다 고유한 CS/SS GPIO를 배정하세요.',
        });
      }
    }
  }

  return issues;
}

function buildI2cPullupAuditIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
): ProjectAuditIssue[] {
  const i2cDevices = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && getBusProfile(item.template.id)?.protocol === 'I2C');

  if (i2cDevices.length === 0) {
    return [];
  }

  const resistorCount = getPlacedCompanionInventory(components).get('resistor') ?? 0;
  if (resistorCount >= 2) {
    return [];
  }

  const names = i2cDevices.map(item => item.component.name);
  const componentIds = i2cDevices.map(item => item.component.instanceId);
  return [
    createDrcIssue({
      severity: 'warning',
      code: 'bus.i2c-pullup-missing',
      params: {
        componentNames: names.join(', '),
      },
      ruleId: 'bus.i2c-pullup-missing',
      visualTargets: {
        componentIds,
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `I2C 장치 ${names.join(', ')} 가 배치돼 있지만 프로젝트 내 풀업 저항 수가 SDA/SCL 두 라인을 만족하기에 부족합니다.`,
        observedFacts: [
          `I2C devices: ${names.join(', ')}`,
          `Detected pull-up resistor candidates: ${resistorCount}`,
          `Expected pull-up resistor candidates: at least 2`,
        ],
        assumptions: [
          '현재 검사는 저항이 실제 SDA/SCL net에 연결됐는지까지는 추적하지 않고, 프로젝트 내 저항 존재 수를 먼저 봅니다.',
        ],
        checkedBy: ['datasheet-rule'],
        affectedComponents: componentIds,
        howToVerify: 'SDA와 SCL 각각에 적절한 풀업 저항이 실제로 연결돼 있는지 확인하고, 모듈 내부 풀업이 이미 있는 SKU라면 그 근거를 데이터시트나 보드 문서로 다시 확인하세요.',
      },
    }),
  ];
}

function buildInductiveProtectionIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const inventory = getPlacedCompanionInventory(components);
  const hasDiode = (inventory.get('diode') ?? 0) > 0;
  const hasDriver = (inventory.get('driver') ?? 0) > 0 || (inventory.get('transistor') ?? 0) > 0;

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const inductiveProfile = getComponentElectricalProfile(template.id)?.inductiveLoad;
    if (!inductiveProfile) {
      continue;
    }

    if (hasDiode || hasDriver) {
      continue;
    }

    issues.push({
      severity: inductiveProfile.moduleLikelyProtected ? 'warning' : 'error',
      title: '유도성 부하 보호 회로 미확인',
      message: `${component.name}은(는) ${inductiveProfile.label}을 포함한 유도성 부하로 보이지만 플라이백 다이오드나 드라이버 보호 회로를 프로젝트에서 아직 확인하지 못했습니다.`,
      componentName: component.name,
      ruleId: 'inductive.flyback-protection-missing',
      recommendation: inductiveProfile.moduleLikelyProtected
        ? '사용 중인 모듈 SKU에 다이오드/드라이버가 내장되어 있는지 먼저 확인하고, 확실하지 않다면 보호 다이오드 또는 드라이버 부품을 BOM에 추가하세요.'
        : '역기전력으로 MCU가 손상되지 않도록 부하 양단에 플라이백 다이오드를 추가하고 필요하면 별도 드라이버 단계도 넣으세요.',
      sourceLabel: getPrimarySource(template)?.label,
      sourceUrl: getPrimarySource(template)?.url,
    });
  }

  return issues;
}

function buildDualRailPolarityIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const positiveRail = findFirstAssignedPin(
      component,
      template,
      pinName => ['+', 'plus', 'v+', 'pos', 'anode', 'a'].includes(normalizeAuditText(pinName))
    );
    const negativeRail = findFirstAssignedPin(
      component,
      template,
      pinName => ['-', 'minus', 'v-', 'neg', 'cathode', 'k'].includes(normalizeAuditText(pinName))
    );

    if (positiveRail && isNegativeRailName(positiveRail)) {
      issues.push({
        severity: 'error',
        code: 'maker.dual-rail-polarity',
        title: '음전원 극성 연결 재검토 필요',
        message: `${component.name}의 양(+) 쪽 핀이 ${positiveRail} 같은 음전원 레일에 연결되어 있습니다.`,
        componentName: component.name,
        ruleId: 'maker.dual-rail-polarity',
        recommendation: '양전원 회로에서는 전해 커패시터/극성 소자의 (+) 단자가 GND 쪽, (-) 단자가 음전원 레일 쪽에 가도록 다시 확인하세요.',
      });
    }

    if (
      component.templateId === 'tpl_diode' &&
      negativeRail &&
      isNegativeRailName(negativeRail) &&
      positiveRail &&
      isGroundLikeNet(positiveRail)
    ) {
      issues.push({
        severity: 'warning',
        code: 'maker.negative-rail-diode-review',
        title: '음전원 다이오드 방향 재검토 필요',
        message: `${component.name}의 캐소드가 ${negativeRail}에, 애노드가 ${positiveRail}에 연결되어 있어 음전원 보호 방향이 맞는지 다시 확인이 필요합니다.`,
        componentName: component.name,
        ruleId: 'maker.negative-rail-diode-review',
        recommendation: '음전원 레일용 다이오드는 데이터시트의 극성 예제를 기준으로 다시 대조하고, 역류 방지 목적이라면 방향을 한 번 더 확인하세요.',
      });
    }
  }

  return issues;
}

function buildMosfetGateResistorIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const resistorValues = getProjectResistorValues(components, resolveTemplate);
  const hasGateResistorCandidate = resistorValues.some(value => value >= 10 && value <= 220);
  const hasDriverStage = components.some(component => {
    const template = resolveTemplate(component.templateId);
    return component.templateId === 'tpl_driver_ic' || template?.id === 'tpl_driver_ic';
  });

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template || !looksLikeMosfet(component, template)) {
      continue;
    }

    const gateNet = findFirstAssignedPin(
      component,
      template,
      pinName => ['g', 'gate'].includes(normalizeAuditText(pinName))
    );

    if (!gateNet || isGroundLikeNet(gateNet) || gateNet === '5V' || gateNet === '3.3V') {
      continue;
    }

    if (hasGateResistorCandidate) {
      continue;
    }

    issues.push({
      severity: hasDriverStage ? 'info' : 'warning',
      code: 'maker.mosfet-gate-resistor',
      title: 'MOSFET 게이트 직렬 저항 확인 필요',
      message: `${component.name} 게이트 구동 경로에서 10Ω~220Ω 범위의 직렬 댐핑 저항을 아직 확인하지 못했습니다.`,
      componentName: component.name,
      ruleId: 'maker.mosfet-gate-resistor',
      recommendation: hasDriverStage
        ? '전용 드라이버가 있어도 게이트 링잉과 돌입 전류를 줄이려면 보통 10Ω~220Ω 직렬 저항을 한 번 더 검토하는 편이 안전합니다.'
        : 'MCU 또는 드라이버 출력과 게이트 사이에 10Ω~220Ω 직렬 저항을 추가해 링잉과 충전 스파이크를 줄이세요.',
    });
  }

  return issues;
}

function buildAdjustableRegulatorIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const resistorValues = getProjectResistorValues(components, resolveTemplate).sort((a, b) => a - b);
  const lowVoltageSensitiveParts = components.filter(component => {
    const template = resolveTemplate(component.templateId);
    return template?.compatibleVoltage === '3.3V';
  });

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template || !looksLikeAdjustableRegulator(component, template)) {
      continue;
    }

    if (resistorValues.length < 2) {
      issues.push({
        severity: 'error',
        code: 'maker.adjustable-regulator-divider-missing',
        title: '가변 레귤레이터 분압 저항 미확인',
        message: `${component.name}은(는) LM317/LM337 계열처럼 보이지만 출력 전압을 결정할 분압 저항 2개를 프로젝트에서 아직 확인하지 못했습니다.`,
        componentName: component.name,
        ruleId: 'maker.adjustable-regulator-divider-missing',
        recommendation: 'OUT-ADJ 사이 기준 저항과 ADJ-GND(또는 음전원) 사이 설정 저항을 넣고, 목표 출력 전압을 다시 계산하세요.',
      });
      continue;
    }

    if (resistorValues.length > 4) {
      issues.push({
        severity: 'info',
        code: 'maker.adjustable-regulator-divider-review',
        title: '가변 레귤레이터 출력 전압 수동 확인 권장',
        message: `${component.name} 주변에 저항이 여러 개 있어 분압망을 자동으로 특정하기 어렵습니다.`,
        componentName: component.name,
        ruleId: 'maker.adjustable-regulator-divider-review',
        recommendation: 'LM317/LM337 데이터시트 식으로 목표 출력 전압을 다시 계산하고, 하류 IC 허용 전압을 넘지 않는지 수동으로 확인해 주세요.',
      });
      continue;
    }

    const r1 = resistorValues[0];
    const r2 = resistorValues[resistorValues.length - 1];
    const estimatedVout = 1.25 * (1 + r2 / r1) + 0.00005 * r2;

    if (estimatedVout > 5.5 || (lowVoltageSensitiveParts.length > 0 && estimatedVout > 3.8)) {
      issues.push({
        severity: lowVoltageSensitiveParts.length > 0 ? 'error' : 'warning',
        code: 'maker.adjustable-regulator-vout-review',
        title: '가변 레귤레이터 출력 전압 재검토 필요',
        message: `${component.name} 분압값을 기준으로 추정한 출력 전압이 약 ${estimatedVout.toFixed(2)}V입니다.${lowVoltageSensitiveParts.length > 0 ? ` 프로젝트에는 ${lowVoltageSensitiveParts.map(item => item.name).join(', ')} 같은 3.3V 계열 부품도 포함되어 있습니다.` : ''}`,
        componentName: component.name,
        ruleId: 'maker.adjustable-regulator-vout-review',
        recommendation: 'R1/R2 값을 다시 계산해 목표 전압으로 맞추고, 특히 3.3V 전용 IC가 있다면 최대 입력 허용치를 넘지 않도록 출력 전압을 낮추세요.',
      });
    }
  }

  return issues;
}

function buildAudioProtectionReviewIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const resolved = components.map(component => ({
    component,
    template: resolveTemplate(component.templateId),
  }));

  const amplifiers = resolved.filter(item => looksLikeAudioAmplifier(item.component, item.template));
  const audioEndpoints = resolved.filter(item => looksLikeAudioInputOrSpeaker(item.component, item.template));
  if (amplifiers.length === 0 || audioEndpoints.length === 0) {
    return issues;
  }

  const capacitors = resolved
    .filter(item => item.component.templateId === 'tpl_capacitor')
    .map(item => ({
      component: item.component,
      capacitanceFarads: parseCapacitanceFarads(item.component.value ?? item.component.name),
    }));

  const hasInputCouplingCap = capacitors.some(item => (item.capacitanceFarads ?? 0) >= 0.47e-6);
  if (!hasInputCouplingCap) {
    issues.push({
      severity: 'warning',
      code: 'maker.audio-input-coupling-review',
      title: '오디오 입력 커플링 커패시터 확인 필요',
      message: `${amplifiers.map(item => item.component.name).join(', ')} 주변에서 입력 DC 차단용 0.47uF 이상 커패시터를 아직 확인하지 못했습니다.`,
      ruleId: 'maker.audio-input-coupling-review',
      recommendation: '잭/RCA/마이크 입력이 증폭단으로 바로 들어간다면, 입력단에 직렬 커플링 커패시터를 넣어 DC 오프셋 유입을 막는 구성을 검토하세요.',
      visualTargets: {
        componentIds: Array.from(new Set([
          ...amplifiers.map(item => item.component.instanceId),
          ...audioEndpoints.map(item => item.component.instanceId),
        ])),
      },
    });
  }

  const hasZobelResistor = resolved.some(item => {
    if (item.component.templateId !== 'tpl_resistor') {
      return false;
    }
    const ohms = parseResistanceOhms(item.component.value ?? item.component.name);
    return typeof ohms === 'number' && ohms >= 8 && ohms <= 22;
  });
  const hasZobelCap = capacitors.some(item => {
    const farads = item.capacitanceFarads ?? 0;
    return farads >= 0.068e-6 && farads <= 0.22e-6;
  });

  if (!(hasZobelResistor && hasZobelCap)) {
    issues.push({
      severity: 'info',
      code: 'maker.audio-zobel-review',
      title: '오디오 출력 조벨 네트워크 확인 권장',
      message: `${amplifiers.map(item => item.component.name).join(', ')} 출력단 주변에서 전형적인 조벨 네트워크(약 10Ω + 0.1uF)를 아직 확인하지 못했습니다.`,
      ruleId: 'maker.audio-zobel-review',
      recommendation: '스피커나 유도성 출력 부하가 붙는 증폭단이라면, 출력 안정화를 위해 직렬 RC 조벨 네트워크를 둘지 검토해 주세요.',
      visualTargets: {
        componentIds: amplifiers.map(item => item.component.instanceId),
      },
    });
  }

  return issues;
}

function buildOutputCollisionIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const owners = new Map<string, Array<{ componentName: string; pinName: string; protocol?: SupportedProtocol }>>();
  const sharedBusProtocols: SupportedProtocol[] = ['I2C_SDA', 'I2C_SCL', 'SPI_SCK', 'SPI_MISO', 'SPI_MOSI'];

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const busProfile = getBusProfile(template.id);
    for (const signalPin of getComponentSignalPins(template)) {
      const boardPinId = component.assignedPins[signalPin.name];
      if (!boardPinId) {
        continue;
      }

      const protocol = busProfile?.signalPins?.[signalPin.name];
      owners.set(boardPinId, [
        ...(owners.get(boardPinId) ?? []),
        { componentName: component.name, pinName: signalPin.name, protocol },
      ]);
    }
  }

  for (const [boardPinId, entries] of owners.entries()) {
    if (entries.length <= 1) {
      continue;
    }

    const allSharedBus = entries.every(entry => entry.protocol && sharedBusProtocols.includes(entry.protocol));
    if (allSharedBus) {
      continue;
    }

    issues.push({
      severity: 'error',
      title: '출력 핀 충돌 위험',
      message: `${boardPinId} 핀이 ${entries.map(entry => `${entry.componentName}:${entry.pinName}`).join(', ')}에 동시에 연결되어 있습니다.`,
      ruleId: 'io.output-collision',
      recommendation: '일반 디지털 출력끼리는 같은 보드 핀을 공유하지 않도록 분리하고, 버스 통신이 아니라면 서로 다른 GPIO로 다시 배선하세요.',
    });
  }

  return issues;
}

function buildI2cPullupImpedanceIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const i2cDevices = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && getBusProfile(item.template.id)?.protocol === 'I2C');

  if (i2cDevices.length < 2) {
    return issues;
  }

  const resistorPairs = Math.floor((getPlacedCompanionInventory(components).get('resistor') ?? 0) / 2);
  const estimatedPullupBranches = i2cDevices.length + resistorPairs;
  const estimatedImpedance = 4700 / estimatedPullupBranches;

  if (estimatedImpedance >= 2200) {
    return issues;
  }

  issues.push({
    severity: 'warning',
    title: 'I2C 합성 풀업 임피던스 과다 저하',
    message: `${i2cDevices.length}개의 I2C 장치가 ${getBoardById(boardId).name} 버스에 함께 올라가 있어, 장치별 4.7kΩ 풀업이 모두 살아 있다고 가정하면 합성 저항이 약 ${Math.round(estimatedImpedance)}Ω까지 낮아질 수 있습니다.`,
    ruleId: 'bus.i2c-total-pullup-impedance',
    recommendation: '일부 모듈의 풀업 점퍼를 끄거나 제거하고, 버스 전체 기준 2.2kΩ~10kΩ 범위가 되도록 다시 조정하세요.',
  });

  return issues;
}

function buildSwitchDebounceIssues(
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const capacitorCount = getPlacedCompanionInventory(components).get('capacitor') ?? 0;
  const buttons = components.filter(component => component.templateId === 'tpl_button');

  if (buttons.length === 0 || capacitorCount > 0) {
    return issues;
  }

  for (const button of buttons) {
    issues.push({
      severity: 'warning',
      title: '스위치 디바운스 콘덴서 미확인',
      message: `${button.name} 회로에서 100nF급 하드웨어 디바운스 콘덴서를 아직 확인하지 못했습니다.`,
      componentName: button.name,
      ruleId: 'input.switch-debounce-capacitor',
      recommendation: '소프트웨어 디바운스만 믿지 말고 스위치 양단 또는 입력 필터 경로에 100nF 세라믹 콘덴서를 추가하는 구성을 검토하세요.',
    });
  }

  return issues;
}

function buildAnalogPowerIsolationIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const inventory = getPlacedCompanionInventory(components);
  const hasFilterInductor = (inventory.get('inductor') ?? 0) > 0;
  const hasFilterCapacitor = (inventory.get('capacitor') ?? 0) > 0;
  const analogSensitive = new Set(['tpl_sound', 'tpl_lm35', 'tpl_light', 'tpl_soil']);
  const noisyLoads = new Set(['tpl_servo', 'tpl_dc_motor', 'tpl_relay', 'tpl_gas_mq2', 'tpl_bluetooth_hc05', 'tpl_rfid_rc522']);

  const analogComponents = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && analogSensitive.has(item.template.id));
  const noisyComponents = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && noisyLoads.has(item.template.id));

  if (analogComponents.length === 0 || noisyComponents.length === 0 || (hasFilterInductor && hasFilterCapacitor)) {
    return issues;
  }

  for (const { component, template } of analogComponents) {
    if (!template) {
      continue;
    }

    const analogRail = inferAssignedPowerRail(component, template, boardId);
    const railConflict = noisyComponents.some(({ component: noisy, template: noisyTemplate }) => {
      if (!noisyTemplate) {
        return false;
      }
      return inferAssignedPowerRail(noisy, noisyTemplate, boardId) === analogRail;
    });

    if (!railConflict) {
      continue;
    }

    issues.push({
      severity: 'warning',
      title: '아날로그 전원 노이즈 유입 우려',
      message: `${component.name} 전원 라인이 모터/무선/히터 부하와 같은 레일을 공유하는 것으로 보이며, LC 또는 페라이트 필터 구성은 아직 확인되지 않았습니다.`,
      componentName: component.name,
      ruleId: 'power.analog-digital-domain-isolation',
      recommendation: '아날로그 센서 전원 입력 앞에 페라이트 비드 또는 소형 인덕터와 바이패스 콘덴서를 추가해 디지털 부하 노이즈를 분리하세요.',
    });
  }

  return issues;
}

function buildShootThroughDangerIssues(
  components: PlacedComponent[]
) {
  const issues: ProjectAuditIssue[] = [];
  const inventory = getPlacedCompanionInventory(components);
  const transistorCount = inventory.get('transistor') ?? 0;
  const driverCount = inventory.get('driver') ?? 0;
  const motorLikeLoads = components.filter(component => component.templateId === 'tpl_dc_motor');

  if (transistorCount < 4 || driverCount > 0 || motorLikeLoads.length === 0) {
    return issues;
  }

  issues.push({
    severity: 'warning',
    title: 'H-Bridge 슛스루 검토 필요',
    message: `프로젝트에 트랜지스터 ${transistorCount}개와 모터 구동부가 함께 있어 디스크리트 H-Bridge를 구성하려는 것으로 보이지만, 상하 스위치 동시 ON 방지 구조는 아직 확인되지 않았습니다.`,
    ruleId: 'motor.hbridge-shoot-through-review',
    recommendation: '상측/하측 게이트 신호가 완전히 분리되어 있는지, 데드타임 또는 전용 드라이버가 있는지 다시 확인하세요.',
  });

  return issues;
}

function buildCrosstalkIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const obstacleRects = buildProjectObstacleRects(components, resolveTemplate, boardId);
  const candidateRoutes: Array<{
    componentName: string;
    pinName: string;
    className: 'analog' | 'highspeed';
    points: RoutePoint[];
  }> = [];

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const busProfile = getBusProfile(template.id);
    for (const signalPin of getComponentSignalPins(template)) {
      const boardPinId = component.assignedPins[signalPin.name];
      if (!boardPinId) {
        continue;
      }

      const boardPoint = getBoardPinPoint(boardId, boardPinId);
      const componentPoint = getRotatedComponentPinPoint(component, template, signalPin.name);
      if (!boardPoint || !componentPoint) {
        continue;
      }

      const boardPinSpec = getBoardPinElectricalSpec(boardId, boardPinId);
      const protocol = busProfile?.signalPins?.[signalPin.name];
      const isAnalog = Boolean(boardPinSpec?.supportedProtocols.includes('ADC') || signalPin.allowedTypes.includes('ANALOG') || signalPin.name.toLowerCase().includes('aout'));
      const isHighSpeed = Boolean(
        boardPinSpec?.supportedProtocols.includes('PWM') ||
        protocol === 'SPI_SCK' ||
        protocol === 'SPI_MOSI' ||
        protocol === 'UART_TX'
      );

      if (!isAnalog && !isHighSpeed) {
        continue;
      }

      candidateRoutes.push({
        componentName: component.name,
        pinName: signalPin.name,
        className: isAnalog ? 'analog' : 'highspeed',
        points: buildOrthogonalRoute(boardPoint, componentPoint, obstacleRects, 0),
      });
    }
  }

  const analogRoutes = candidateRoutes.filter(route => route.className === 'analog');
  const highSpeedRoutes = candidateRoutes.filter(route => route.className === 'highspeed');

  for (const analogRoute of analogRoutes) {
    const analogSegments = getRouteSegments(analogRoute.points);

    for (const highRoute of highSpeedRoutes) {
      if (analogRoute.componentName === highRoute.componentName) {
        continue;
      }

      const highSegments = getRouteSegments(highRoute.points);
      const conflict = analogSegments.some(analogSegment =>
        highSegments.some(highSegment => {
          if (analogSegment.orientation !== highSegment.orientation) {
            return false;
          }

          if (analogSegment.orientation === 'h') {
            const distance = Math.abs(analogSegment.from.y - highSegment.from.y);
            const overlap = getOverlapLength(analogSegment.from.x, analogSegment.to.x, highSegment.from.x, highSegment.to.x);
            return distance <= 20 && overlap >= 120;
          }

          const distance = Math.abs(analogSegment.from.x - highSegment.from.x);
          const overlap = getOverlapLength(analogSegment.from.y, analogSegment.to.y, highSegment.from.y, highSegment.to.y);
          return distance <= 20 && overlap >= 120;
        })
      );

      if (!conflict) {
        continue;
      }

      issues.push({
        severity: 'warning',
        title: '고주파 간섭(크로스토크) 우려',
        message: `${highRoute.componentName}:${highRoute.pinName} 고속 신호선이 ${analogRoute.componentName}:${analogRoute.pinName} 아날로그 라인과 장거리 평행 구간을 만들고 있는 것으로 보입니다.`,
        ruleId: 'routing.crosstalk-risk',
        recommendation: '고속 클럭/PWM 라인과 아날로그 입력선의 이격 거리를 늘리거나, 중간에 GND 실드 라인을 두는 쪽으로 배치를 조정하세요.',
      });

      return issues;
    }
  }

  return issues;
}

function buildReversePolarityProtectionIssues(
  components: PlacedComponent[],
  boardId: string,
  powerInputMode: ProjectPowerInputMode
) {
  const issues: ProjectAuditIssue[] = [];
  const inventory = getPlacedCompanionInventory(components);
  const hasProtection = (inventory.get('diode') ?? 0) > 0 || (inventory.get('transistor') ?? 0) > 0;
  const usesExternalInput = powerInputMode !== 'usb-5v';

  if (!usesExternalInput || hasProtection) {
    return issues;
  }

  issues.push(createDrcIssue({
    severity: 'error',
    code: 'power.reverse-polarity-protection-missing',
    title: '역전압 보호 회로 미확인',
    message: `${getBoardById(boardId).name} 프로젝트가 ${getProjectPowerInputLabel(boardId, powerInputMode)} 입력을 기준으로 설계되어 있지만, 입력단 역극성 보호용 다이오드 또는 MOSFET 보호 회로는 아직 확인하지 못했습니다.`,
    ruleId: 'power.reverse-polarity-protection-missing',
    recommendation: '전원 입력 경로에 쇼트키 다이오드 또는 P채널 MOSFET 기반 역전압 방지 회로를 추가해 배터리/어댑터 오배선을 보호하세요.',
    evidence: {
      confidence: 'strong-inference',
      evidenceSummary: `${getProjectPowerInputLabel(boardId, powerInputMode)} 입력을 쓰는 프로젝트인데 역전압 보호 소자를 아직 확인하지 못했습니다.`,
      observedFacts: [
        `Board: ${getBoardById(boardId).name}`,
        `Power input mode: ${powerInputMode}`,
        `Detected diode count: ${inventory.get('diode') ?? 0}`,
        `Detected transistor count: ${inventory.get('transistor') ?? 0}`,
      ],
      assumptions: [
        '현재 검사는 입력단 보호용 다이오드나 P채널 MOSFET이 프로젝트 내 존재하는지를 먼저 보며, 실제 입력 경로 직렬 배치 여부까지는 추적하지 않습니다.',
      ],
      checkedBy: ['datasheet-rule'],
      howToVerify: '전원 입력단에 역극성 보호용 쇼트키 다이오드나 P채널 MOSFET이 실제 직렬로 배치되어 있는지 확인하고, 단순 일반 다이오드 존재만으로 경고를 해제하지 마세요.',
    },
  }));

  return issues;
}

function buildUsbBackpowerIssues(
  components: PlacedComponent[],
  boardId: string,
  powerInputMode: ProjectPowerInputMode
) {
  const issues: ProjectAuditIssue[] = [];
  if (powerInputMode !== 'usb-5v') {
    return issues;
  }

  const externalPowerRails = components
    .filter(component => component.templateId === 'tpl_external_power')
    .map(component => ({
      component,
      rail: component.assignedPins['V+'],
    }))
    .filter((item): item is { component: PlacedComponent; rail: string } => Boolean(item.rail))
    .filter(item => item.rail === '5V' || item.rail === '3.3V');

  if (externalPowerRails.length === 0) {
    return issues;
  }

  const hasProtectionDiode = components.some(component => component.templateId === 'tpl_diode');
  if (hasProtectionDiode) {
    return issues;
  }

  issues.push(createDrcIssue({
    severity: 'error',
    code: 'power.usb-backpower-risk',
    title: '역전류 위험',
    message: `${getBoardById(boardId).name} 프로젝트가 USB 5V 입력 모드인데, ${externalPowerRails.map(item => `${item.component.name}:${item.rail}`).join(', ')} 외부 전원이 보호 다이오드 없이 보드 전원 레일에 직접 연결되어 있습니다.`,
    ruleId: 'power.usb-backpower-risk',
    recommendation: 'USB 전원과 외부 전원을 동시에 쓰려면 역류 방지 다이오드나 전원 OR-ing 회로를 추가하고, 가능하면 전원 경로를 분리하세요.',
    evidence: {
      confidence: 'strong-inference',
      evidenceSummary: `USB 5V 입력 모드에서 외부 전원이 보호 다이오드 없이 같은 보드 전원 레일에 함께 연결된 것으로 보입니다.`,
      observedFacts: [
        `Board input mode: usb-5v`,
        `External power rail count: ${externalPowerRails.length}`,
        `External rails: ${externalPowerRails.map(item => `${item.component.name}:${item.rail}`).join(', ')}`,
      ],
      assumptions: [
        '현재 프로젝트에 ideal diode, 전원 멀티플렉서, 또는 보드 내부 역류 방지 구조가 존재하지만 명시적으로 모델링되지 않았을 수 있습니다.',
      ],
      checkedBy: ['datasheet-rule'],
      howToVerify: 'USB 5V와 외부 전원이 같은 레일에 직접 합쳐지는지 확인하고, 역류 방지 다이오드나 OR-ing 회로 없이 병렬 연결되지 않도록 전원 경로를 분리하세요.',
    },
  }));

  return issues;
}

function buildRfKeepoutIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const obstacleRects = buildProjectObstacleRects(components, resolveTemplate, boardId);

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template || !['tpl_bluetooth_hc05', 'tpl_rfid_rc522'].includes(template.id)) {
      continue;
    }

    const bodyRect = getComponentBodyRectForAudit(component, template);
    const keepoutRect: RouteRect = {
      x: bodyRect.x + bodyRect.width - 6,
      y: bodyRect.y - 12,
      width: 54,
      height: bodyRect.height + 24,
    };

    const nearbyBody = components.some(other => {
      if (other.instanceId === component.instanceId) {
        return false;
      }
      const otherRect = getComponentBodyRectForAudit(other, resolveTemplate(other.templateId));
      return !(
        otherRect.x + otherRect.width < keepoutRect.x ||
        otherRect.x > keepoutRect.x + keepoutRect.width ||
        otherRect.y + otherRect.height < keepoutRect.y ||
        otherRect.y > keepoutRect.y + keepoutRect.height
      );
    });

    let routeIntrusion = false;
    if (!nearbyBody) {
      for (const other of components) {
        const otherTemplate = resolveTemplate(other.templateId);
        if (!otherTemplate) {
          continue;
        }

        for (const [pinName, boardPinId] of Object.entries(other.assignedPins)) {
          const boardPoint = getBoardPinPoint(boardId, boardPinId);
          const componentPoint = getRotatedComponentPinPoint(other, otherTemplate, pinName);
          if (!boardPoint || !componentPoint) {
            continue;
          }

          const points = buildOrthogonalRoute(boardPoint, componentPoint, obstacleRects, 0);
          if (points.some(point => point.x >= keepoutRect.x && point.x <= keepoutRect.x + keepoutRect.width && point.y >= keepoutRect.y && point.y <= keepoutRect.y + keepoutRect.height)) {
            routeIntrusion = true;
            break;
          }
        }

        if (routeIntrusion) {
          break;
        }
      }
    }

    if (!nearbyBody && !routeIntrusion) {
      continue;
    }

    issues.push({
      severity: 'warning',
      title: 'RF 안테나 Keepout 침범 우려',
      message: `${component.name} 안테나 끝단으로 추정되는 영역 반경 약 10mm 이내에 다른 부품 또는 신호선이 가까이 배치되어 있습니다.`,
      componentName: component.name,
      ruleId: 'rf.keepout-intrusion',
      recommendation: '안테나 주변은 부품과 신호선을 비우고, 특히 금속성 구조와 구리 면적이 가까이 오지 않도록 Keepout 영역을 따로 확보하세요.',
    });
  }

  return issues;
}

function buildI2cCapacitanceIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const obstacleRects = buildProjectObstacleRects(components, resolveTemplate, boardId);
  const i2cDevices = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && getBusProfile(item.template.id)?.protocol === 'I2C');

  if (i2cDevices.length < 4) {
    return issues;
  }

  let estimatedCapPf = i2cDevices.length * 45;

  for (const { component, template } of i2cDevices) {
    if (!template) {
      continue;
    }

    for (const pinName of ['SDA', 'SCL']) {
      const boardPinId = component.assignedPins[pinName];
      const boardPoint = boardPinId ? getBoardPinPoint(boardId, boardPinId) : undefined;
      const componentPoint = getRotatedComponentPinPoint(component, template, pinName);
      if (!boardPoint || !componentPoint) {
        continue;
      }

      const points = buildOrthogonalRoute(boardPoint, componentPoint, obstacleRects, 0);
      estimatedCapPf += getPathLength(points) / 18;
    }
  }

  if (estimatedCapPf <= 400) {
    return issues;
  }

  issues.push({
    severity: 'warning',
    title: 'I2C 누적 정전 용량 한계 초과 추정',
    message: `현재 I2C 장치 ${i2cDevices.length}개와 배선 길이를 기준으로 버스 누적 정전 용량이 약 ${Math.round(estimatedCapPf)}pF 수준으로 추정됩니다.`,
    ruleId: 'bus.i2c-total-capacitance',
    recommendation: '일부 장치를 멀티플렉서나 별도 버스로 나누고, 배선을 짧게 유지하며 통신 속도도 보수적으로 잡으세요.',
  });

  return issues;
}

function buildCrystalOscillatorIssues(
  components: PlacedComponent[],
  boardId: string
) {
  const issues: ProjectAuditIssue[] = [];
  const board = getBoardById(boardId);
  const noisyComponentIds = new Set(['tpl_dc_motor', 'tpl_servo', 'tpl_relay', 'tpl_bluetooth_hc05', 'tpl_rfid_rc522']);

  if (!['uno', 'nano'].includes(boardId)) {
    return issues;
  }

  const noisyCount = components.filter(component => noisyComponentIds.has(component.templateId)).length;
  if (noisyCount === 0) {
    return issues;
  }

  issues.push({
    severity: 'warning',
    title: '클럭 오실레이터 주변 배선 검토 필요',
    message: `${board.name} 계열은 온보드 16MHz 클럭 회로를 사용하며, 현재 프로젝트에는 노이즈가 큰 부하 ${noisyCount}개가 포함되어 있습니다. XTAL 주변 최단 배선과 가드 링 여부는 아직 확인되지 않았습니다.`,
    ruleId: 'clock.crystal-guard-review',
    recommendation: 'PCB 단계에서 XTAL/로드 커패시터를 MCU 가까이에 붙이고, 주변에 GND 실딩과 짧은 배선을 확보했는지 따로 검토하세요.',
  });

  return issues;
}

function buildThermalDissipationIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const hotComponentIds = new Set(['tpl_dc_motor', 'tpl_relay', 'tpl_gas_mq2', 'tpl_driver_ic', 'tpl_transistor_npn']);
  const hotComponents = components
    .map(component => ({ component, template: resolveTemplate(component.templateId) }))
    .filter(item => item.template && hotComponentIds.has(item.template.id));

  if (hotComponents.length === 0) {
    return issues;
  }

  for (const { component } of hotComponents) {
    issues.push(createDrcIssue({
      severity: 'warning',
      code: 'thermal.via-copper-review',
      title: '파워 소자 방열 경로 미확인',
      message: `${component.name}은(는) 장시간 구동 시 발열이 커질 수 있지만, 현재 schematic 단계에서는 열 비아와 방열 동박 면적을 아직 확인할 수 없습니다.`,
      componentName: component.name,
      ruleId: 'thermal.via-copper-review',
      recommendation: 'PCB 단계에서 하단 GND 면적 확보, 열 비아 배열, 굵은 전류 패턴 폭을 별도로 검토해 열 폭주를 막으세요.',
      visualTargets: {
        componentIds: [component.instanceId],
      },
      evidence: {
        confidence: 'needs-review',
        evidenceSummary: `${component.name}은 장시간 동작 시 발열이 커질 수 있지만, schematic 단계에서는 방열 경로 품질을 아직 판단할 수 없습니다.`,
        observedFacts: [
          `Affected component: ${component.name}`,
          `Template id: ${component.templateId}`,
          'Thermal via array: not available in schematic-only review',
          'Copper area around hot component: not available in schematic-only review',
        ],
        assumptions: [
          '이 경고는 PCB 레이아웃 정보가 없는 schematic 단계 리뷰이므로, 실제 방열 동박 면적과 thermal via 배치는 아직 반영되지 않습니다.',
        ],
        checkedBy: ['datasheet-rule'],
        affectedComponents: [component.instanceId],
        howToVerify: 'PCB 단계에서 해당 부품 주변의 GND/thermal copper 면적, thermal via 배열, 전류 경로 폭, 패키지 노출패드 접속 여부를 확인하세요.',
      },
    }));
  }

  return issues;
}

function buildCompanionPlacementIssues(
  components: PlacedComponent[],
  companionReport: ProjectCompanionReport
) {
  const issues: ProjectAuditIssue[] = [];
  const inventory = getPlacedCompanionInventory(components);

  for (const item of companionReport.summary.filter(summary => summary.level === 'required')) {
    const placed = inventory.get(item.kind) ?? 0;
    if (placed >= item.quantity) {
      continue;
    }

    const missing = item.quantity - placed;
    issues.push({
      severity: getCompanionIssueSeverity(item.kind),
      title: '필수 동반 부품 수량 부족',
      message: `${item.label}${item.value ? ` (${item.value})` : ''}이(가) 프로젝트 기준 ${item.quantity}개 필요하지만 현재 ${placed}개만 배치되어 있습니다.`,
      ruleId: `companion.shortage.${item.kind}`,
      recommendation: `${missing}개 이상 추가 배치해 BOM과 회로 검토 목록을 맞추세요.${item.note ? ` ${item.note}` : ''}`,
    });
  }

  return issues;
}

function pushAuditIssue(list: ProjectAuditIssue[], issue: ProjectAuditIssueInput) {
  const normalizedIssue = normalizeAuditIssue(issue);
  const issueKey = buildIssueDedupKey(normalizedIssue);

  if (!list.some(item => buildIssueDedupKey(item) === issueKey)) {
    list.push(normalizedIssue);
  }
}

function normalizeAuditIssue(issue: ProjectAuditIssueInput): ProjectAuditIssue {
  if (!(issue.code || issue.ruleId)) {
    return issue as ProjectAuditIssue;
  }

  return createProjectAuditIssue({
    ...issue,
    code: issue.code ?? issue.ruleId ?? 'engine.unknown',
    params: issue.params,
    title: issue.title,
    message: issue.message,
    recommendation: issue.recommendation,
  });
}

function deduplicateAuditIssues(issues: ProjectAuditIssue[]) {
  return deduplicateIssues(issues.map(normalizeAuditIssue));
}

export function auditProjectDesign(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  powerInputMode: ProjectPowerInputMode = 'usb-5v',
  componentPowerModes?: ProjectComponentPowerModes
): ProjectAuditReport {
  let verifiedCount = 0;
  let partialCount = 0;
  let genericCount = 0;
  const issues: ProjectAuditIssue[] = [];

  for (const component of components) {
    const template = resolveTemplate(component.templateId);

    if (!template) {
      pushAuditIssue(issues, {
        severity: 'error',
        code: 'audit.template-missing',
        componentName: component.name,
      });
      continue;
    }

    const analysis = analyzeComponentForBoard(template, boardId);
    const shouldTrackDatasheetStatus = template.category !== 'PASSIVE';

    if (shouldTrackDatasheetStatus) {
      if (analysis.datasheetStatus === 'official-complete') verifiedCount++;
      else if (analysis.datasheetStatus === 'official-partial') partialCount++;
      else genericCount++;
    }

    if (shouldReportUnroutedComponent(component, boardId)) {
      pushAuditIssue(issues, {
        severity: 'warning',
        componentName: component.name,
        code: 'routing.unrouted-component',
        ruleId: 'routing.unrouted-component',
      });
    }

    if (shouldTrackDatasheetStatus && analysis.datasheetStatus === 'generic-module') {
      pushAuditIssue(issues, {
        severity: 'warning',
        code: 'audit.generic-sku-unfixed',
        componentName: component.name,
      });
    }

    if (shouldTrackDatasheetStatus && analysis.datasheetStatus === 'needs-vendor-pin') {
      pushAuditIssue(issues, {
        severity: 'warning',
        code: 'audit.vendor-pin-needed',
        componentName: component.name,
      });
    }

    if (shouldTrackDatasheetStatus && analysis.datasheetStatus === 'official-partial') {
      pushAuditIssue(issues, {
        severity: 'info',
        code: 'audit.partial-datasheet',
        componentName: component.name,
      });
    }

    for (const warning of analysis.warnings) {
      pushAuditIssue(issues, {
        severity: warning.severity,
        title: warning.title,
        message: warning.message,
        componentName: component.name,
      });
    }

    for (const requirement of template.design?.requiresExternalParts ?? []) {
      pushAuditIssue(issues, {
        severity: 'info',
        code: 'companion.external-part-check',
        params: {
          requirement,
        },
        componentName: component.name,
        ruleId: 'companion.external-part-check',
      });
    }

    for (const issue of buildComponentRuleIssues(component, template, boardId, components)) {
      pushAuditIssue(issues, issue);
    }
  }

  for (const issue of buildBusAuditIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildI2cPullupAuditIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildInductiveProtectionIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildDualRailPolarityIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildMosfetGateResistorIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildAdjustableRegulatorIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildAudioProtectionReviewIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildOutputCollisionIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildI2cPullupImpedanceIssues(components, resolveTemplate, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildSwitchDebounceIssues(components)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildAnalogPowerIsolationIssues(components, resolveTemplate, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildShootThroughDangerIssues(components)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildCrosstalkIssues(components, resolveTemplate, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildReversePolarityProtectionIssues(components, boardId, powerInputMode)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildUsbBackpowerIssues(components, boardId, powerInputMode)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildRfKeepoutIssues(components, resolveTemplate, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildI2cCapacitanceIssues(components, resolveTemplate, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildCrystalOscillatorIssues(components, boardId)) {
    pushAuditIssue(issues, issue);
  }

  for (const issue of buildThermalDissipationIssues(components, resolveTemplate)) {
    pushAuditIssue(issues, issue);
  }

  const companionReport = buildProjectCompanionReport(components, boardId, resolveTemplate);
  for (const issue of buildCompanionPlacementIssues(components, companionReport)) {
    pushAuditIssue(issues, issue);
  }

  const powerReport = buildProjectPowerReport(components, boardId, resolveTemplate, powerInputMode, componentPowerModes);
  for (const issue of powerReport.issues) {
    pushAuditIssue(issues, issue);
  }

  const deduplicatedIssues = deduplicateAuditIssues(issues);

  return {
    verifiedCount,
    partialCount,
    genericCount,
    issueCount: deduplicatedIssues.length,
    issues: deduplicatedIssues,
    powerReport,
    companionReport,
  };
}

export function getProjectStageReadiness(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  powerInputMode: ProjectPowerInputMode = 'usb-5v',
  componentPowerModes?: ProjectComponentPowerModes
): ProjectStageReadiness {
  const audit = auditProjectDesign(components, boardId, resolveTemplate, powerInputMode, componentPowerModes);
  const pcbReasons: string[] = [];
  const manufacturingReasons: string[] = [];

  if (components.length === 0) {
    pcbReasons.push('부품이 아직 배치되지 않았습니다.');
    manufacturingReasons.push('부품이 아직 배치되지 않았습니다.');
  }

  const unroutedCount = components.filter(component => shouldReportUnroutedComponent(component, boardId)).length;
  if (unroutedCount > 0) {
    pcbReasons.push(`미배선 부품 ${unroutedCount}개를 먼저 연결해야 합니다.`);
    manufacturingReasons.push(`미배선 부품 ${unroutedCount}개를 먼저 연결해야 합니다.`);
  }

  const errorCount = audit.issues.filter(issue => issue.severity === 'error').length;
  if (errorCount > 0) {
    pcbReasons.push(`치명 경고 ${errorCount}개가 해결되지 않았습니다.`);
    manufacturingReasons.push(`치명 경고 ${errorCount}개가 해결되지 않았습니다.`);
  }

  if (audit.genericCount > 0) {
    manufacturingReasons.push(`제조 단계 전에는 generic-module 센서 ${audit.genericCount}개를 검증 상태로 바꾸는 편이 좋습니다.`);
  }

  if (audit.partialCount > 0) {
    manufacturingReasons.push(`partial 상태 센서 ${audit.partialCount}개는 최종 제조 전 전기 특성표를 다시 확인해야 합니다.`);
  }

  return {
    canEnterPcb: pcbReasons.length === 0,
    canEnterManufacturing: manufacturingReasons.length === 0,
    pcbReasons,
    manufacturingReasons,
  };
}
