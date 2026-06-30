/**
 * types/index.ts
 * ModuMake 플랫폼 전체 TypeScript 인터페이스 정의 (Phase 2)
 */

import type { Node, Edge } from 'reactflow';
import type { TargetLanguage, LogicVoltage } from '@/constants/boards';
import type { DatasheetReviewInputPayload } from './datasheet-review';

// ============================================================
// 1. 시스템 공통 타입 (Common Types)
// ============================================================

/** 아두이노 핀의 기능 종류 */
export type PinType = 'DIGITAL' | 'ANALOG' | 'PWM' | 'POWER' | 'GND';

/** 부품 카테고리 */
export type ComponentCategory =
  | 'SENSOR'
  | 'ACTUATOR'
  | 'DISPLAY'
  | 'COMMUNICATION'
  | 'PASSIVE'
  | 'IC'
  | 'CONNECTOR';

/** EASYEDA식 작업 단계 */
export type WorkspaceMode = 'simulation' | 'schematic' | 'pcb' | 'manufacturing';

/** 배선 방식 */
export type WiringMode = 'auto' | 'manual';

/** 데이터시트 품질 상태 */
export type DatasheetStatus =
  | 'official-complete'
  | 'official-partial'
  | 'generic-module'
  | 'needs-vendor-pin';

/** 경고 심각도 */
export type WarningSeverity = 'info' | 'warning' | 'error';

/**
 * 부품의 전압 호환성
 * - BOTH: 3.3V / 5V 모두 호환
 * - 5V:   5V 전용 (3.3V 보드에서 사용 불가)
 * - 3.3V: 3.3V 전용
 */
export type VoltageCompatibility = 'BOTH' | '5V' | '3.3V';
export type KiCadMappingConfidence = 'high' | 'medium' | 'low';
export type KiCadMappingSource =
  | 'kicad-library'
  | 'refdes'
  | 'value-regex'
  | 'footprint-regex'
  | 'pin-shape'
  | 'custom-fallback';

export type ProjectPowerInputMode =
  | 'usb-5v'
  | 'vin-9v'
  | 'vin-12v'
  | 'ext-5v'
  | 'ext-3v3';

export type ProjectComponentPowerModes = Record<string, string>;
export type ProjectPullupSource = 'external' | 'onboard' | 'internal' | 'user-confirmed' | 'unknown';
export interface ProjectPullupDeclaration {
  pins: string[];
  source: Exclude<ProjectPullupSource, 'external' | 'unknown'>;
  resistanceOhms?: number;
  note?: string;
}
export type ProjectPullupSourceConfig =
  | ProjectPullupSource
  | {
      source: ProjectPullupSource;
      resistanceOhms?: number;
      note?: string;
    };
export type ProjectComponentPullupSources = Record<string, Partial<Record<string, ProjectPullupSourceConfig>>>;
export type ProjectUnusedPinBiasMode =
  | 'internal-pullup'
  | 'internal-pulldown'
  | 'external-pullup'
  | 'external-pulldown'
  | 'floating-ok'
  | 'analog-hi-z';
export type ProjectComponentUnusedPinModes = Record<string, Partial<Record<string, ProjectUnusedPinBiasMode>>>;
export type Ads1x15DifferentialPairKey = 'AIN0_AIN1' | 'AIN0_AIN3' | 'AIN1_AIN3' | 'AIN2_AIN3';
export type Ads1x15InputMode = 'single-ended' | 'differential';
export type Mcp3208ChannelMode =
  | 'unused'
  | 'single-ended'
  | 'pseudo-differential-positive'
  | 'pseudo-differential-negative';
export type Mcp3208VrefQuality = 'clean' | 'shared-digital-rail' | 'noisy' | 'unknown';

export interface ProjectAds1x15AdcConfig {
  pgaFullScaleV?: number;
  dataRateSps?: number;
  pairModes?: Partial<Record<Ads1x15DifferentialPairKey, Ads1x15InputMode>>;
}

export interface ProjectMcp3208AdcConfig {
  vrefVoltage?: number;
  vrefQuality?: Mcp3208VrefQuality;
  vrefSourceImpedanceOhms?: number;
  scanRateSps?: number;
  channelModes?: Partial<Record<'CH0' | 'CH1' | 'CH2' | 'CH3' | 'CH4' | 'CH5' | 'CH6' | 'CH7', Mcp3208ChannelMode>>;
}

export interface ProjectAdcComponentConfig {
  ads1x15?: ProjectAds1x15AdcConfig;
  mcp3208?: ProjectMcp3208AdcConfig;
}

export type ProjectAdcConfigurations = Record<string, ProjectAdcComponentConfig>;

export type CloudProjectVisibility = 'private' | 'unlisted' | 'public';
export type CloudValidationPersistStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'skipped';
export type ProjectCommentTargetType = 'canvas_coord' | 'node' | 'wire' | 'code_line';
export type ProjectCommentStatus = 'open' | 'resolved' | 'orphaned';
export type AppLanguage = 'ko' | 'en';
export type ImportedSchematicTheme = 'dark' | 'light';
export type ImportedSchematicViewMode = 'original' | 'structured';
export type I18nMessageParamValue = string | number | boolean | Array<string | number | boolean> | null | undefined;
export type I18nMessageParams = Record<string, I18nMessageParamValue>;

export type PinAssignmentMode = 'auto' | 'manual';

// ============================================================
// 2. 아두이노 핀 상태 (Pin State)
// ============================================================

/**
 * 보드의 각 핀 런타임 상태
 */
export interface BoardPin {
  readonly id: string;        // 핀 이름 (예: "D2", "A0", "5V", "GND")
  readonly type: PinType[];   // 핀이 지원하는 기능 목록
  isUsed: boolean;            // 현재 핀 사용 여부
  connectedTo?: string;       // 연결된 부품의 instanceId
  assignmentMode?: PinAssignmentMode;
}

// ============================================================
// 3. 부품 원형/템플릿 (Component Template)
// ============================================================

/** 부품 핀 요구사항 */
export interface RequiredPin {
  name: string;               // 부품 자체의 핀 이름 (예: "Trig", "Echo", "Signal")
  allowedTypes: PinType[];    // 허용되는 아두이노 핀 타입
  preferredSide?: 'left' | 'right';
  allowBoardRails?: boolean;
}

export interface SimulationModel {
  type: 'digital_input' | 'digital_output' | 'analog_input' | 'actuator' | 'display' | 'communication' | 'passive' | 'custom';
  controllable?: boolean;
  valueRange?: { min: number; max: number; unit?: string };
}

export interface SchematicModel {
  symbol: string;
  referencePrefix: string;
}

export interface PcbModel {
  footprint: string;
  packageType: 'THT' | 'SMD' | 'MODULE' | 'VIRTUAL';
  manufacturable: boolean;
  bodySize?: {
    width: number;
    height: number;
  };
  pads?: PcbPadModel[];
  keepoutHints?: PcbKeepoutHint[];
  zoneHints?: PcbZoneHint[];
}

export type PcbLayerId =
  | 'F.Cu'
  | 'B.Cu'
  | 'F.SilkS'
  | 'B.SilkS'
  | 'F.Mask'
  | 'B.Mask'
  | 'Edge.Cuts'
  | 'Dwgs.User';

export type PcbPadShape = 'circle' | 'oval' | 'rect' | 'roundrect';

export interface PcbPoint {
  x: number;
  y: number;
}

export interface ImportedSchematicPoint {
  x: number;
  y: number;
}

export type ImportedSchematicPrimitive =
  | {
      kind: 'rect';
      start: ImportedSchematicPoint;
      end: ImportedSchematicPoint;
      fill?: 'none' | 'outline' | 'background';
      strokeStyle?: 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot';
      strokeWidth?: number;
    }
  | {
      kind: 'polyline';
      points: ImportedSchematicPoint[];
      fill?: 'none' | 'outline' | 'background';
      strokeStyle?: 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot';
      strokeWidth?: number;
    }
  | {
      kind: 'circle';
      center: ImportedSchematicPoint;
      radius: number;
      fill?: 'none' | 'outline' | 'background';
      strokeStyle?: 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot';
      strokeWidth?: number;
    }
  | {
      kind: 'arc';
      start: ImportedSchematicPoint;
      mid: ImportedSchematicPoint;
      end: ImportedSchematicPoint;
      strokeStyle?: 'default' | 'dash' | 'dot' | 'dash_dot' | 'dash_dot_dot';
      strokeWidth?: number;
    }
  | {
      kind: 'text';
      at: ImportedSchematicPoint;
      text: string;
      angle: 0 | 90 | 180 | 270;
      originalAngle?: 0 | 90 | 180 | 270;
      preserveNativeOrientation?: boolean;
      sizeMm: number;
      role?: 'reference' | 'value' | 'annotation' | 'pin-name' | 'pin-number';
      textAnchor?: 'start' | 'middle' | 'end';
      baseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
      alignmentExplicit?: boolean;
    };

export interface ImportedSchematicPinAnchor {
  pinId: string;
  label: string;
  number: string;
  name?: string;
  at: ImportedSchematicPoint;
  angle: 0 | 90 | 180 | 270;
  lengthMm: number;
}

export interface ImportedSchematicGeometry {
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  renderSource?: 'primitive' | 'fallback';
  pinRenderMode?: 'overlay' | 'primitive';
  primitives: ImportedSchematicPrimitive[];
  pinAnchors: ImportedSchematicPinAnchor[];
  referenceLabel?: string;
  valueLabel?: string;
}

export interface ImportedKiCadMapping {
  templateId?: string;
  confidence: KiCadMappingConfidence;
  source: KiCadMappingSource;
  matchedBy?: string;
  reference?: string;
  value?: string;
  footprint?: string;
  libraryId?: string;
}

export interface FootprintPinPadOverrideCacheEntry {
  key: string;
  title: string;
  footprint: string;
  packageLabel: string;
  pinPadMap: Record<string, string>;
  templateId?: string;
  libraryId?: string;
  componentName?: string;
  updatedAt: string;
}

export interface ImportedSchematicWireSegment {
  start: ImportedSchematicPoint;
  end: ImportedSchematicPoint;
}

export interface ImportedSchematicLabel {
  text: string;
  at: ImportedSchematicPoint;
  angle?: 0 | 90 | 180 | 270;
  sizeMm?: number;
  textAnchor?: 'start' | 'middle' | 'end';
  baseline?: 'auto' | 'middle' | 'hanging' | 'ideographic';
}

export interface ImportedSchematicSheetPin {
  text: string;
  at: ImportedSchematicPoint;
  angle: 0 | 90 | 180 | 270;
}

export interface ImportedSchematicSheetFrame {
  start: ImportedSchematicPoint;
  end: ImportedSchematicPoint;
  name?: string;
  file?: string;
  pins: ImportedSchematicSheetPin[];
}

export interface ImportedSchematicTitleBlock {
  title?: string;
  date?: string;
  rev?: string;
  company?: string;
  comments: string[];
}

export interface ImportedSchematicPageFrame {
  start: ImportedSchematicPoint;
  end: ImportedSchematicPoint;
  paper?: string;
  titleBlock?: ImportedSchematicTitleBlock;
}

export interface ImportedSchematicSceneSymbol {
  instanceId: string;
  reference: string;
  value: string;
  family?: 'passive' | 'power' | 'connector' | 'mcu' | 'generic';
  libraryId?: string;
  primitives: ImportedSchematicPrimitive[];
  pinAnchors: ImportedSchematicPinAnchor[];
}

export interface ImportedSchematicScene {
  wireSegments: ImportedSchematicWireSegment[];
  junctions: ImportedSchematicPoint[];
  noConnects?: ImportedSchematicPoint[];
  labels: ImportedSchematicLabel[];
  drawings?: ImportedSchematicPrimitive[];
  pageFrame?: ImportedSchematicPageFrame | null;
  sheetFrames?: ImportedSchematicSheetFrame[];
  symbols?: ImportedSchematicSceneSymbol[];
}

export interface PcbRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PcbPadModel {
  id: string;
  label: string;
  offset: PcbPoint;
  size: { width: number; height: number };
  shape: PcbPadShape;
  layers: PcbLayerId[];
}

export interface PcbKeepoutHint {
  id: string;
  reason: string;
  layers: PcbLayerId[];
  rect: PcbRect;
}

export interface PcbZoneHint {
  id: string;
  netName: string;
  layer: PcbLayerId;
  purpose: 'ground-pour' | 'power-rail' | 'shield' | 'thermal';
}

export interface PcbNetNodeRef {
  id: string;
  ownerId: string;
  ownerType: 'board' | 'component';
  pinId: string;
  label: string;
}

export interface PcbNet {
  id: string;
  name: string;
  className: 'signal' | 'power' | 'ground';
  nodes: PcbNetNodeRef[];
}

export interface PcbPadInstance {
  id: string;
  label: string;
  netId: string | null;
  center: PcbPoint;
  size: { width: number; height: number };
  shape: PcbPadShape;
  layers: PcbLayerId[];
}

export interface PcbPlacement {
  id: string;
  ref: string;
  ownerId: string;
  ownerType: 'board' | 'component';
  templateId: string;
  name: string;
  footprint: string;
  packageType: PcbModel['packageType'];
  layer: 'top' | 'bottom';
  position: PcbPoint;
  rotation: 0 | 90 | 180 | 270;
  body: PcbRect;
  pads: PcbPadInstance[];
}

export interface PcbTrace {
  id: string;
  netId: string;
  layer: PcbLayerId;
  width: number;
  points: PcbPoint[];
  source: PcbNetNodeRef;
  target: PcbNetNodeRef;
}

export interface PcbVia {
  id: string;
  netId: string;
  at: PcbPoint;
  drill: number;
  diameter: number;
  fromLayer: PcbLayerId;
  toLayer: PcbLayerId;
}

export interface PcbZone {
  id: string;
  netId: string;
  layer: PcbLayerId;
  purpose: 'ground-pour' | 'power-rail' | 'keepout-buffer';
  polygon: PcbPoint[];
  clearance: number;
}

export interface PcbKeepoutRegion {
  id: string;
  ownerId: string;
  reason: string;
  layers: PcbLayerId[];
  polygon: PcbPoint[];
}

export interface PcbOutlineSegment {
  id: string;
  layer: 'Edge.Cuts';
  kind: 'line';
  start: PcbPoint;
  end: PcbPoint;
}

export interface PcbDocument {
  version: number;
  generatedAt: string;
  boardId: string;
  boardName: string;
  layers: PcbLayerId[];
  outline: PcbOutlineSegment[];
  placements: PcbPlacement[];
  nets: PcbNet[];
  traces: PcbTrace[];
  vias: PcbVia[];
  zones: PcbZone[];
  keepouts: PcbKeepoutRegion[];
}

export type ImportedPcbLayerId = string;
export type ImportedPcbValidationSource = 'modumake-pcb' | 'kicad-cli';

export interface ImportedPcbPoint {
  x: number;
  y: number;
}

export interface ImportedPcbBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ImportedPcbLayer {
  id?: number;
  name: ImportedPcbLayerId;
  type?: string;
}

export interface ImportedPcbNet {
  code: number;
  name: string;
}

export interface ImportedPcbSetup {
  traceClearance?: number;
  traceMin?: number;
  zoneClearance?: number;
  edgeWidth?: number;
  padToMaskClearance?: number;
  solderMaskMinWidth?: number;
  copperToEdgeClearance?: number;
  viaSize?: number;
  viaDrill?: number;
  viaMinSize?: number;
  viaMinDrill?: number;
}

export interface ImportedPcbNetClass {
  name: string;
  description?: string;
  clearance?: number;
  traceWidth?: number;
  viaDiameter?: number;
  viaDrill?: number;
  diffPairWidth?: number;
  diffPairGap?: number;
  diffPairViaGap?: number;
  lengthMatchTolerance?: number;
  nets: string[];
}

export type ImportedPcbGraphic =
  | {
      id: string;
      kind: 'line';
      layer: ImportedPcbLayerId;
      start: ImportedPcbPoint;
      end: ImportedPcbPoint;
      width: number;
      source: 'board' | 'footprint';
      footprintId?: string;
    }
  | {
      id: string;
      kind: 'polyline';
      layer: ImportedPcbLayerId;
      points: ImportedPcbPoint[];
      width: number;
      fill?: boolean;
      source: 'board' | 'footprint';
      footprintId?: string;
    }
  | {
      id: string;
      kind: 'circle';
      layer: ImportedPcbLayerId;
      center: ImportedPcbPoint;
      radius: number;
      width: number;
      fill?: boolean;
      source: 'board' | 'footprint';
      footprintId?: string;
    }
  | {
      id: string;
      kind: 'arc';
      layer: ImportedPcbLayerId;
      start: ImportedPcbPoint;
      mid: ImportedPcbPoint;
      end: ImportedPcbPoint;
      width: number;
      source: 'board' | 'footprint';
      footprintId?: string;
    }
  | {
      id: string;
      kind: 'text';
      layer: ImportedPcbLayerId;
      text: string;
      at: ImportedPcbPoint;
      angle: number;
      size: { width: number; height: number };
      source: 'board' | 'footprint';
      footprintId?: string;
    };

export interface ImportedPcbPad {
  id: string;
  number: string;
  type: string;
  shape: string;
  at: ImportedPcbPoint;
  absoluteAt: ImportedPcbPoint;
  angle: number;
  size: { width: number; height: number };
  drill?: number;
  clearance?: number;
  solderMaskMargin?: number;
  layers: ImportedPcbLayerId[];
  netCode: number;
  netName: string;
  footprintId: string;
  footprintRef: string;
}

export interface ImportedPcbFootprint {
  id: string;
  libraryId: string;
  reference: string;
  value: string;
  layer: ImportedPcbLayerId;
  at: ImportedPcbPoint;
  angle: number;
  description?: string;
  tags?: string;
  pads: ImportedPcbPad[];
  graphics: ImportedPcbGraphic[];
  bounds: ImportedPcbBounds | null;
}

export interface ImportedPcbTrackSegment {
  id: string;
  start: ImportedPcbPoint;
  end: ImportedPcbPoint;
  width: number;
  layer: ImportedPcbLayerId;
  netCode: number;
  netName: string;
}

export interface ImportedPcbVia {
  id: string;
  at: ImportedPcbPoint;
  size: number;
  drill: number;
  layers: ImportedPcbLayerId[];
  netCode: number;
  netName: string;
}

export interface ImportedPcbZone {
  id: string;
  netCode: number;
  netName: string;
  layer: ImportedPcbLayerId;
  polygon: ImportedPcbPoint[];
  filledPolygons: ImportedPcbPoint[][];
  clearance?: number;
  minThickness?: number;
}

export interface ImportedPcbDocument {
  schemaVersion: 1;
  sourceFilename?: string;
  importedAt: string;
  kicadVersion?: string;
  generator?: string;
  layers: ImportedPcbLayer[];
  nets: ImportedPcbNet[];
  setup: ImportedPcbSetup;
  netClasses: ImportedPcbNetClass[];
  footprints: ImportedPcbFootprint[];
  segments: ImportedPcbTrackSegment[];
  vias: ImportedPcbVia[];
  zones: ImportedPcbZone[];
  drawings: ImportedPcbGraphic[];
  bounds: ImportedPcbBounds | null;
  stats: {
    layerCount: number;
    netCount: number;
    footprintCount: number;
    padCount: number;
    segmentCount: number;
    viaCount: number;
    zoneCount: number;
    drawingCount: number;
  };
}

export interface ImportedPcbValidationIssue {
  id: string;
  source: ImportedPcbValidationSource;
  severity: WarningSeverity;
  code: string;
  title: string;
  message: string;
  recommendation?: string;
  layer?: ImportedPcbLayerId;
  netName?: string;
  footprintRef?: string;
  padNumber?: string;
  at?: ImportedPcbPoint;
  items?: Array<{
    description: string;
    at?: ImportedPcbPoint;
  }>;
}

export interface ImportedPcbValidationReport {
  engineVersion: string;
  generatedAt: string;
  source: ImportedPcbValidationSource | 'mixed';
  issueCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  checks: {
    geometry: boolean;
    netContinuity: boolean;
    manufacturability: boolean;
    polygonClearance?: boolean;
    differentialPairs?: boolean;
    schematicParity?: boolean;
    renderFidelity?: boolean;
    kicadDrc: boolean;
  };
  issues: ImportedPcbValidationIssue[];
}

export interface CodeTemplateModel {
  arduino?: {
    includes?: string[];
    setup?: string[];
    loop?: string[];
  };
  python?: {
    imports?: string[];
    setup?: string[];
    loop?: string[];
  };
}

export interface DatasheetSource {
  label: string;
  url: string;
}

export interface DesignWarning {
  severity: WarningSeverity;
  title: string;
  message: string;
  titleKey?: string;
  messageKey?: string;
}

export interface SoftwareLibraryDependency {
  name: string;
  version?: string;
  registry?: 'arduino' | 'platformio' | 'python';
}

export interface ComponentDependencyMap {
  arduino?: SoftwareLibraryDependency[];
  python?: SoftwareLibraryDependency[];
}

export interface ComponentAiHints {
  initialize?: string;
  [key: string]: string | undefined;
}

export interface ComponentDesignRules {
  datasheetStatus: DatasheetStatus;
  datasheetSources?: DatasheetSource[];
  preferredInterface?: 'GPIO' | 'ANALOG' | 'I2C' | 'SPI' | 'UART' | 'SINGLE_BUS';
  preferredBoardPins?: Record<string, Record<string, string[]>>;
  avoidBoardPins?: Record<string, string[]>;
  pullups?: ProjectPullupDeclaration[];
  warnings?: DesignWarning[];
  requiresExternalParts?: string[];
  tags?: string[];
}

export interface ProjectPowerRailSummary {
  rail: '5V' | '3.3V';
  usedMa: number;
  peakMa?: number;
  budgetMa?: number;
  headroomMa?: number;
  usageRatio?: number;
  status?: 'ok' | 'warning' | 'error';
  inferred?: boolean;
  note?: string;
}

export interface ProjectRegulatorThermalScenario {
  id: string;
  label: string;
  inputVoltage: number;
  outputVoltage: number;
  estimatedCurrentMa: number;
  dissipationW: number;
  safeLimitW: number;
  thermalResistanceCPerW?: number;
  ambientTempC?: number;
  junctionTempC?: number;
  usageRatio?: number;
  packageLabel?: string;
  status: 'ok' | 'warning' | 'error';
  note?: string;
}

export interface ProjectPowerReport {
  rails: ProjectPowerRailSummary[];
  regulators: ProjectRegulatorThermalScenario[];
}

export type CompanionPartKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'transistor'
  | 'driver'
  | 'adc'
  | 'level_shifter'
  | 'power_supply';

export type CompanionRequirementLevel = 'required' | 'recommended' | 'conditional';

export interface CompanionPartSuggestion {
  kind: CompanionPartKind;
  level: CompanionRequirementLevel;
  label: string;
  value?: string;
  quantity: number;
  reason: string;
  note?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  likelyIncludedOnModule?: boolean;
}

export interface ComponentCompanionSuggestion {
  componentInstanceId: string;
  componentName: string;
  templateId: string;
  items: CompanionPartSuggestion[];
}

export interface CompanionSummaryLine {
  key: string;
  kind: CompanionPartKind;
  level: CompanionRequirementLevel;
  label: string;
  value?: string;
  quantity: number;
  components: string[];
  note?: string;
}

export interface ProjectCompanionReport {
  requiredCount: number;
  recommendedCount: number;
  conditionalCount: number;
  suggestions: ComponentCompanionSuggestion[];
  summary: CompanionSummaryLine[];
}

export interface ComponentBoardAnalysis {
  datasheetStatus: DatasheetStatus;
  preferredInterface?: ComponentDesignRules['preferredInterface'];
  warnings: DesignWarning[];
  sources: DatasheetSource[];
  tags: string[];
  requiredRail: VoltageCompatibility;
}

export interface BoardDesignAnalysis {
  datasheetStatus: DatasheetStatus;
  warnings: DesignWarning[];
  sources: DatasheetSource[];
  notes: string[];
}

export type ProjectAuditIssueConfidence =
  | 'confirmed'
  | 'strong-inference'
  | 'needs-review'
  | 'informational';

export type ProjectAuditIssueEvidenceChecker =
  | 'netlist'
  | 'datasheet-rule'
  | 'formal-code'
  | 'kicad-import'
  | 'solver';

export type ProjectAuditIssueSourceQuality =
  | 'official-complete'
  | 'official-partial'
  | 'module-verified'
  | 'generic-module'
  | 'needs-vendor-pin';

export type ProjectAuditIssueFalsePositiveRisk = 'low' | 'medium' | 'high';

export interface RuleConfidencePolicy {
  ruleId: string;
  defaultSeverity: WarningSeverity;
  defaultConfidence: ProjectAuditIssueConfidence;
  falsePositiveRisk: ProjectAuditIssueFalsePositiveRisk;
  suppressible: boolean;
  evidenceRequirements: {
    observedFactsMin?: number;
    requireVisualTargets?: boolean;
    requireAssumptions?: boolean;
    requireHowToVerify?: boolean;
  };
}

export interface ProjectAuditIssueEvidence {
  confidence: ProjectAuditIssueConfidence;
  evidenceSummary: string;
  observedFacts: string[];
  assumptions: string[];
  sourceQuality?: ProjectAuditIssueSourceQuality;
  pullupSources?: Array<{
    source: ProjectPullupSource;
    pinName?: string;
    componentId?: string;
    componentName?: string;
    resistanceOhms?: number;
    note?: string;
  }>;
  checkedBy: ProjectAuditIssueEvidenceChecker[];
  affectedComponents?: string[];
  affectedNets?: string[];
  howToVerify?: string;
}

export interface ProjectAuditIssue {
  severity: WarningSeverity;
  title: string;
  message: string;
  code?: string;
  params?: I18nMessageParams;
  componentName?: string;
  boardPin?: string;
  line?: number;
  operation?: string;
  ruleId?: string;
  recommendation?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  confidence?: ProjectAuditIssueConfidence;
  evidence?: ProjectAuditIssueEvidence;
  visualTargets?: {
    componentIds?: string[];
    netIds?: string[];
    pinIds?: string[];
  };
}

export type AutoFixAction =
  | {
      type: 'add_component';
      componentId: string;
      templateId: string;
      value?: string;
      position: { x: number; y: number };
      rotation?: 0 | 90 | 180 | 270;
      name?: string;
    }
  | {
      type: 'remove_component';
      componentId: string;
    }
  | {
      type: 'add_wire';
      from: string;
      to: string;
      id?: string;
      suggestedNetName?: string;
    }
  | {
      type: 'remove_wire';
      connectionId?: string;
      from?: string;
      to?: string;
    };

export interface AutoFixInstruction {
  issueId: string;
  explanation: string;
  recommendation: string;
  actions: AutoFixAction[];
}

export interface GhostFixPreview {
  issueId: string;
  explanation: string;
  recommendation: string;
  actions: AutoFixAction[];
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
}

export interface ProjectAuditReport {
  verifiedCount: number;
  partialCount: number;
  genericCount: number;
  genericComponentNames?: string[];
  issueCount: number;
  issues: ProjectAuditIssue[];
  powerReport: ProjectPowerReport;
  companionReport: ProjectCompanionReport;
}

export interface FormalVerificationIssue {
  severity: WarningSeverity;
  title: string;
  message: string;
  code?: string;
  params?: I18nMessageParams;
  componentName?: string;
  boardPin?: string;
  operation?: string;
  line?: number;
  recommendation?: string;
  ruleId?: string;
}

export interface ReviewEngineMeta {
  language: 'cpp' | 'python' | 'unknown';
  parserBackend: 'fallback' | 'rust-wasm' | 'tree-sitter' | 'generated' | 'none';
  parserTier: 'pattern-fallback' | 'structured-review' | 'tree-sitter-ast' | 'none';
}

export type BoardPinDriveMode =
  | 'input'
  | 'input_pullup'
  | 'output_high'
  | 'output_low'
  | 'output_pwm'
  | 'unknown';

export interface BoardPinDriveState {
  boardPin: string;
  mode: BoardPinDriveMode;
  sourceOperation?: 'pinMode' | 'digitalWrite' | 'analogWrite';
  line?: number;
  pwmDutyCycle?: number | null;
}

export interface FormalVerificationReport {
  analyzed: boolean;
  operationCount: number;
  issueCount: number;
  issues: FormalVerificationIssue[];
  engineMeta?: ReviewEngineMeta;
  boardPinDriveStates?: BoardPinDriveState[];
}

export type CanvasCoordCommentTargetMeta = {
  x: number;
  y: number;
};

export type NodeCommentTargetMeta = {
  nodeId: string;
  x?: number;
  y?: number;
};

export type WireCommentTargetMeta = {
  wireId: string;
  x?: number;
  y?: number;
};

export type CodeLineCommentTargetMeta = {
  lineNumber: number;
};

export type ProjectCommentTargetMeta =
  | CanvasCoordCommentTargetMeta
  | NodeCommentTargetMeta
  | WireCommentTargetMeta
  | CodeLineCommentTargetMeta;

export interface ProjectCommentRecord {
  id: string;
  projectId: string;
  authorId: string | null;
  content: string;
  targetType: ProjectCommentTargetType;
  targetMeta: ProjectCommentTargetMeta;
  status: ProjectCommentStatus;
  parentId: string | null;
  createdAt: string;
}

export interface ProjectCommentThread {
  root: ProjectCommentRecord;
  replies: ProjectCommentRecord[];
}

export interface ProjectStageReadiness {
  canEnterPcb: boolean;
  canEnterManufacturing: boolean;
  pcbReasons: string[];
  manufacturingReasons: string[];
}

/**
 * 좌측 사이드바에 표시되는 부품 템플릿 (설계도)
 */
export interface ComponentTemplate {
  readonly id: string;
  readonly name: string;
  readonly nameKey?: string;
  readonly category: ComponentCategory;
  readonly description: string;
  readonly descriptionKey?: string;
  readonly icon: string;
  readonly requiredPins: RequiredPin[];
  readonly defaultValue?: string;
  readonly libraryIncludes?: string[];
  /** 전압 호환성: 사이드바 필터링 및 경고에 사용 */
  readonly compatibleVoltage: VoltageCompatibility;
  /** 사용자가 나중에 추가할 수 있는 라이브러리 출처 */
  readonly librarySource?: 'core' | 'custom';
  /** 사용자 패키지 버전 */
  readonly packageVersion?: string;
  /** 외부 라이브러리 의존성 */
  readonly dependencies?: ComponentDependencyMap;
  /** AI 코드 생성 힌트 */
  readonly aiHints?: ComponentAiHints;
  /** 시뮬레이션 엔진에서 사용하는 동작 모델 */
  readonly simulation?: SimulationModel;
  /** 회로도 심볼 정보 */
  readonly schematic?: SchematicModel;
  /** PCB 변환 시 사용할 풋프린트 정보 */
  readonly pcb?: PcbModel;
  /** 자동 코드 생성에 사용할 선택적 템플릿 */
  readonly code?: CodeTemplateModel;
  /** 데이터시트 기반 제약/배선 힌트 */
  readonly design?: ComponentDesignRules;
  /** 프로젝트 내부에서 재사용되는 계층형 서브 서킷 여부 */
  readonly isSubCircuit?: boolean;
  /** 서브 서킷 내부 원본 회로 상태 */
  readonly internalState?: SubCircuitInternalState;
  /** 외부 포트와 내부 핀 간 매핑 */
  readonly portMappings?: SubCircuitPortMapping[];
}

export interface SubCircuitPortMapping {
  externalPinId: string;
  internalEndpoint: ManualPadEndpoint;
  internalComponentName?: string;
  internalPinLabel?: string;
}

export interface SubCircuitInternalState {
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
}

export interface SubCircuitTemplate extends ComponentTemplate {
  readonly isSubCircuit: true;
  readonly internalState: SubCircuitInternalState;
  readonly portMappings: SubCircuitPortMapping[];
}

export interface SubCircuitTemplateUpdate {
  templateName?: string;
  internalState: SubCircuitInternalState;
  portMappings: SubCircuitPortMapping[];
}

export interface CustomComponentPackage {
  version: string;
  templateId: string;
  name: string;
  category?: ComponentCategory;
  description?: string;
  icon?: string;
  defaultValue?: string;
  compatibleVoltage: VoltageCompatibility;
  requiredPins: RequiredPin[];
  dependencies?: ComponentDependencyMap;
  schematic?: Partial<SchematicModel>;
  aiHints?: ComponentAiHints;
  design?: Partial<ComponentDesignRules>;
}

// ============================================================
// 4. 캔버스에 배치된 부품 인스턴스
// ============================================================

/**
 * 사용자가 캔버스에 올려놓은 실제 부품
 */
export interface PlacedComponent {
  readonly instanceId: string;
  readonly templateId: string;
  name: string;
  value?: string;
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  assignedPins: Record<string, string>;
  footprintPinPadOverrides?: Record<string, string>;
  isFullyRouted: boolean;
  isSubCircuitInstance?: boolean;
  importedGeometry?: ImportedSchematicGeometry;
  importedReference?: string;
  importedMapping?: ImportedKiCadMapping;
}

export interface ManualPadEndpoint {
  ownerType: 'board' | 'component';
  ownerId: string;
  pinId: string;
}

export interface ManualNetConnection {
  id: string;
  source: ManualPadEndpoint;
  target: ManualPadEndpoint;
  suggestedNetName?: string;
}

export type ValidationReviewPrimaryStatus = 'fixed' | 'already-handled' | 'false-positive';
export type ValidationReviewFlagStatus = 'included-in-module' | 'verified-by-datasheet';
export type IssueFeedbackStatus = ValidationReviewPrimaryStatus | ValidationReviewFlagStatus;

export interface ValidationReviewDecision {
  primary?: ValidationReviewPrimaryStatus;
  flags: ValidationReviewFlagStatus[];
  updatedAt?: string;
}

export interface ModuMakeProjectData {
  version: number;
  savedAt: string;
  projectName: string;
  appLanguage?: AppLanguage;
  activeBoardId: string;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  importedSchematicScene?: ImportedSchematicScene | null;
  importedSchematicSource?: string | null;
  importedPcbDocument?: ImportedPcbDocument | null;
  importedPcbSource?: string | null;
  importedPcbValidation?: ImportedPcbValidationReport | null;
  integratedValidationJson?: DatasheetReviewInputPayload | null;
  validationReviewDecisions?: Record<string, ValidationReviewDecision>;
  templateCache?: Record<string, ComponentTemplate>;
  installedLibraries?: InstalledProjectLibrary[];
  generatedCode: string;
  codeError: string | null;
  lastCodeGenerationMeta?: AICodeGenerationMeta | null;
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes?: ProjectComponentPowerModes;
  componentUnusedPinModes?: ProjectComponentUnusedPinModes;
  workspaceMode: WorkspaceMode;
  wiringMode: WiringMode;
  showGrid: boolean;
  showMinimap: boolean;
  schematicTheme?: ImportedSchematicTheme;
  importedSchematicViewMode?: ImportedSchematicViewMode;
  isGuestStudentMode?: boolean;
  customComponentPackages?: CustomComponentPackage[];
  pcbDocument?: PcbDocument;
}

export interface ProjectHistorySnapshot {
  activeBoardId: string;
  pinStates: Array<{
    pinId: string;
    connectedTo?: string;
    assignmentMode?: PinAssignmentMode;
  }>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes?: ProjectComponentPowerModes;
  componentUnusedPinModes?: ProjectComponentUnusedPinModes;
}

export interface ProjectAppliedPartialState {
  activeBoardId: string;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  generatedCode: string;
  codeError: string | null;
  componentPowerModes?: ProjectComponentPowerModes;
  componentUnusedPinModes?: ProjectComponentUnusedPinModes;
  selectedComponentId: string;
  workspaceMode: WorkspaceMode;
}

export interface CollaborationSelection {
  componentId?: string;
  boardPin?: string;
  lineNumber?: number;
  label?: string;
}

export interface CollaborationCursor {
  x?: number;
  y?: number;
  lineNumber?: number;
}

export interface CollaborationParticipant {
  sessionId: string;
  userName: string;
  color: string;
  isOwner: boolean;
  scope: 'idle' | 'canvas' | 'code' | 'review';
  updatedAt: number;
  selection?: CollaborationSelection;
  cursor?: CollaborationCursor;
}

// ============================================================
// 5. React Flow 커스텀 노드/엣지 타입
// ============================================================

/** 보드 노드 데이터 (보드 종류에 무관한 공통 구조) */
export interface BoardNodeData {
  boardId: string;
  boardName: string;
  chipset: string;
  logicVoltage: LogicVoltage;
  targetLanguage: TargetLanguage;
  color: string;
  accentColor: string;
  digitalPins: string[];
  leftPins: string[];
  pins: Record<string, BoardPin>;
  pinUsage: Record<string, { componentName: string; componentPin: string; componentInstanceId?: string }>;
  collaborators?: Array<Pick<CollaborationParticipant, 'sessionId' | 'userName' | 'color'>>;
  highlightedBoardPin?: string;
  highlightSeverity?: WarningSeverity;
  highlightTitle?: string;
  isDimmed?: boolean;
}

/** 센서/부품 노드 데이터 */
export interface SensorNodeData {
  instanceId: string;
  templateId: string;
  componentName: string;
  name?: string;
  value?: string;
  category: ComponentCategory;
  rotation: 0 | 90 | 180 | 270;
  assignedPins: Record<string, string>;
  footprintPinPadOverrides?: Record<string, string>;
  requiredPins: RequiredPin[];
  isFullyRouted: boolean;
  importedGeometry?: ImportedSchematicGeometry;
  importedReference?: string;
  importedMapping?: ImportedKiCadMapping;
  isOverlayOnly?: boolean;
  runtimeState?: ComponentRuntimeState;
  collaborators?: Array<Pick<CollaborationParticipant, 'sessionId' | 'userName' | 'color'>>;
  isHighlighted?: boolean;
  highlightedPinId?: string;
  highlightSeverity?: WarningSeverity;
  highlightTitle?: string;
  isDimmed?: boolean;
  isGhost?: boolean;
  onDelete: (instanceId: string) => void;
  onRotate: (instanceId: string) => void;
}

export interface ImportedSchematicOverlayNodeData {
  scene: ImportedSchematicScene | null;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  viewMode: ImportedSchematicViewMode;
  highlightedComponentIds?: string[];
  dimNonTargets?: boolean;
  pulse?: boolean;
}

export interface CommentPinNodeData {
  commentId: string;
  status: ProjectCommentStatus;
  label: string;
  preview: string;
  replyCount: number;
  isSelected?: boolean;
  isRecentlyHighlighted?: boolean;
  onOpen: (commentId: string) => void;
}

/** 전선 엣지 데이터 */
export interface WireEdgeData {
  pinName: string;
  pinType: 'VCC' | 'GND' | 'SIGNAL';
  laneOffset: number;
  routingMode?: 'full' | 'preview';
  renderStyle?: 'default' | 'kicad-import';
  isOverlayOnly?: boolean;
  routeContextKey?: string;
  label?: string;
  sourcePin?: string;
  targetPin?: string;
  connectionId?: string;
  isManual?: boolean;
  isHighlighted?: boolean;
  highlightSeverity?: WarningSeverity;
  isDimmed?: boolean;
  isGhost?: boolean;
}

/** React Flow용 커스텀 노드 타입 */
export type AppNode =
  | Node<BoardNodeData, 'boardNode'>
  | Node<SensorNodeData, 'sensorComponent'>
  | Node<SensorNodeData, 'importedSchematicComponent'>
  | Node<CommentPinNodeData, 'commentPin'>;

/** React Flow용 커스텀 엣지 타입 */
export type AppEdge = Edge<WireEdgeData>;

export type ComponentRuntimeMode = 'idle' | 'active' | 'pulse';

export interface ComponentRuntimeState {
  mode: ComponentRuntimeMode;
  label?: string;
}

export interface CompilerManifest {
  compileStrategy: 'cloud-compiler-ready' | 'local-review-only';
  platformioConfig?: string | null;
  arduinoDependencies: string[];
  requiredHeaders: string[];
  unresolvedHeaders: string[];
  libraryRequirements: CompilerLibraryRequirement[];
  cloudTarget: CompilerCloudTarget;
}

export interface ArduinoLibraryCatalogEntry {
  name: string;
  author: string;
  sentence: string;
  paragraph?: string;
  includes: string[];
  category: string;
  version?: string;
}

export interface InstalledProjectLibrary {
  name: string;
  version: string | 'latest';
  includes: string[];
  author?: string;
  sentence?: string;
  category?: string;
}

export interface CompilerLibraryRequirement {
  header: string;
  source: 'component-include' | 'component-dependency' | 'code-include';
  registry?: 'arduino' | 'platformio' | 'python';
  dependencyLabel?: string;
  resolved: boolean;
}

export interface CompilerCloudTarget {
  provider: 'arduino-cli' | 'micropython';
  supported: boolean;
  boardId: string;
  boardName: string;
  targetLanguage: TargetLanguage;
  fqbn?: string;
  reason?: string;
}

export interface CompilerPreflightResponse {
  ready: boolean;
  manifest: CompilerManifest;
  summary: string;
  unresolvedRequirements: string[];
}

export interface CompileJobRequest {
  jobId: string;
  boardId: string;
  sourceCode: string;
  requiredLibraries: string[];
}

export type CompileQueueJobState =
  | 'queued'
  | 'dispatching'
  | 'running'
  | 'succeeded'
  | 'failed';

export type CompileSandboxLaunchRequestState =
  | 'pending'
  | 'claimed'
  | 'submitted'
  | 'failed';

export type CompileExecutionResultState =
  | 'running'
  | 'succeeded'
  | 'failed';

export interface CompileQueueJobRecord {
  queueJobId: string;
  requestId: string;
  ownerKey: string;
  boardId: string;
  requiredLibraries: string[];
  sourceCodeHash: string;
  sourceCodeLength: number;
  state: CompileQueueJobState;
  createdAt: string;
  updatedAt: string;
  latestResultId?: string;
  startedAt?: string;
  completedAt?: string;
  buildLogs?: string;
  errorDetails?: string;
  hexBinary?: string;
}

export interface CompileSandboxLaunchRequestRecord {
  launchRequestId: string;
  queueJobId: string;
  requestId: string;
  ownerKey: string;
  boardId: string;
  requiredLibraries: string[];
  sourceCodeHash: string;
  sourceCodeLength: number;
  state: CompileSandboxLaunchRequestState;
  createdAt: string;
  updatedAt: string;
  latestResultId?: string;
  claimedAt?: string;
  submittedAt?: string;
  errorDetails?: string;
}

export interface CompileExecutionResultRecord {
  resultId: string;
  launchRequestId: string;
  queueJobId: string;
  state: CompileExecutionResultState;
  createdAt: string;
  updatedAt: string;
  primaryArtifactId?: string;
  buildLogs?: string;
  errorDetails?: string;
}

export interface CompileArtifactRecord {
  artifactId: string;
  resultId: string;
  kind: 'hex';
  createdAt: string;
  sizeBytes: number;
}

export interface CompileJobResponse {
  success: boolean;
  status:
    | 'COMPILATION_QUEUED'
    | 'COMPILATION_SUCCESS'
    | 'COMPILATION_ERROR'
    | 'COMPILATION_UNAVAILABLE'
    | 'BAD_REQUEST';
  buildLogs: string;
  errorDetails?: string;
  hexBinary?: string;
  queueJob?: {
    queueJobId: string;
    state: CompileQueueJobState;
    pollPath: string;
  };
}

export interface AICodeGenerationMeta {
  provider: 'gemini' | 'anthropic' | 'local';
  model: string;
  label: string;
  repaired?: boolean;
  fallback?: boolean;
  reviewIssueCount?: number;
  reviewErrorCount?: number;
}

export interface AIConceptDesignMeta {
  provider: 'gemini' | 'anthropic' | 'local';
  model: string;
  label: string;
  fallback?: boolean;
}

// ============================================================
// 6. Zustand 전역 상태 저장소 인터페이스
// ============================================================

export interface ModuMakeStore {
  // ─── 상태 (State) ───
  projectName: string;
  appLanguage: AppLanguage;
  activeBoardId: string;                    // BOARD_REGISTRY의 키
  pins: Record<string, BoardPin>;           // 현재 보드 핀 상태 맵
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  ghostFixPreview: GhostFixPreview | null;
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicSource: string | null;
  importedPcbDocument: ImportedPcbDocument | null;
  importedPcbSource: string | null;
  importedPcbValidation: ImportedPcbValidationReport | null;
  integratedValidationJson: DatasheetReviewInputPayload | null;
  validationReviewDecisions: Record<string, ValidationReviewDecision>;
  footprintPinPadOverrideCache: Record<string, FootprintPinPadOverrideCacheEntry>;
  templateCache: Record<string, ComponentTemplate>;
  installedLibraries: InstalledProjectLibrary[];
  generatedCode: string;
  isGenerating: boolean;
  codeError: string | null;
  lastCodeGenerationMeta: AICodeGenerationMeta | null;
  componentRuntimeStates: Record<string, ComponentRuntimeState>;
  lastCompilerManifest: CompilerManifest | null;
  customComponentPackages: CustomComponentPackage[];
  isGuestStudentMode: boolean;
  cloudProjectId: string | null;
  cloudProjectTitle: string;
  cloudVisibility: CloudProjectVisibility;
  cloudIsSaving: boolean;
  cloudIsOwner: boolean;
  cloudLastSavedAt: string | null;
  cloudLastValidationJobId: string | null;
  cloudValidationPersistStatus: CloudValidationPersistStatus;
  cloudValidationPersistError: string | null;
  cloudError: string | null;
  cloudEditToken: string | null;
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes: ProjectComponentPowerModes;
  componentUnusedPinModes: ProjectComponentUnusedPinModes;
  selectedComponentId: string | null;       // 현재 선택된 부품 ID
  workspaceMode: WorkspaceMode;
  wiringMode: WiringMode;
  canUndo: boolean;
  canRedo: boolean;
  schematicTheme: ImportedSchematicTheme;
  importedSchematicViewMode: ImportedSchematicViewMode;

  // ─── 보드 액션 ───
  setProjectName: (name: string) => void;
  setAppLanguage: (language: AppLanguage) => void;
  setActiveBoardId: (boardId: string) => void;
  setPowerInputMode: (mode: ProjectPowerInputMode) => void;
  setComponentPowerMode: (instanceId: string, mode: string | null) => void;
  setComponentUnusedPinMode: (
    instanceId: string,
    pinId: string,
    mode: ProjectUnusedPinBiasMode | null
  ) => void;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  setWiringMode: (mode: WiringMode) => void;
  setSchematicTheme: (theme: ImportedSchematicTheme) => void;
  setImportedSchematicViewMode: (mode: ImportedSchematicViewMode) => void;
  setImportedPcbDocument: (
    document: ImportedPcbDocument,
    source: string,
    validation?: ImportedPcbValidationReport | null
  ) => void;
  setImportedPcbValidation: (validation: ImportedPcbValidationReport | null) => void;
  clearImportedPcbDocument: () => void;
  undo: () => void;
  redo: () => void;

  // ─── 부품 액션 ───
  addComponent: (
    template: ComponentTemplate,
    position: { x: number; y: number }
  ) => { success: boolean; error?: string };
  removeComponent: (instanceId: string) => void;
  duplicateComponent: (instanceId: string) => { success: boolean; error?: string; duplicatedId?: string };
  createSubCircuitComponent: (
    instanceIds: string[],
    options: {
      templateName: string;
      ports: Array<{
        externalPinId: string;
        internalEndpoint: ManualPadEndpoint;
        allowedTypes: PinType[];
      }>;
    }
  ) => { success: boolean; error?: string; instanceId?: string; templateId?: string };
  updateSubCircuitTemplate: (
    templateId: string,
    update: SubCircuitTemplateUpdate
  ) => { success: boolean; error?: string };
  updateComponentPosition: (instanceId: string, position: { x: number; y: number }) => void;
  rotateComponent: (instanceId: string) => void;
  updateComponentName: (instanceId: string, name: string) => void;
  updateComponentValue: (instanceId: string, value: string) => void;
  setFootprintPinPadOverride: (instanceId: string, pinId: string, padId: string | null) => void;
  cacheTemplate: (template: ComponentTemplate) => void;
  cacheTemplates: (templates: ComponentTemplate[]) => void;
  installProjectLibrary: (library: ArduinoLibraryCatalogEntry) => { success: boolean; alreadyInstalled?: boolean };
  removeProjectLibrary: (name: string) => void;
  setSelectedComponentId: (id: string | null) => void;

  // ─── 배선 액션 ───
  autoAssignPins: (instanceId: string) => { success: boolean; error?: string };
  autoAssignAllComponents: () => { successCount: number; failCount: number };
  assignPinToComponent: (instanceId: string, componentPin: string, boardPin: string) => { success: boolean; error?: string };
  connectPads: (
    sourceNodeId: string,
    sourceHandle: string,
    targetNodeId: string,
    targetHandle: string
  ) => { success: boolean; error?: string };
  removeManualConnection: (connectionId: string) => void;
  removeAssignedPin: (instanceId: string, componentPin: string) => void;
  clearEdges: () => void;   // 부품 유지, 배선만 초기화
  clearBoard: () => void;   // 전체 초기화
  insertCompanionParts: (
    componentInstanceId: string,
    items: CompanionPartSuggestion[]
  ) => { success: boolean; addedCount: number; error?: string };
  applyGhostFix: (instruction: AutoFixInstruction) => { success: boolean; error?: string };
  commitGhostFix: () => { success: boolean; error?: string };
  rollbackGhostFix: () => void;

  // ─── 코드 상태 ───
  setGeneratedCode: (code: string) => void;
  setIsGenerating: (loading: boolean) => void;
  setCodeError: (error: string | null) => void;
  setCodeGenerationMeta: (meta: AICodeGenerationMeta | null) => void;
  setCompilerManifest: (manifest: CompilerManifest | null) => void;
  setValidationReviewDecision: (issueKey: string, decision: ValidationReviewDecision | null) => void;
  setRuntimeComponentStates: (states: Record<string, ComponentRuntimeState>) => void;
  clearRuntimeComponentStates: () => void;
  setGuestStudentMode: (enabled: boolean) => void;
  setCloudProjectState: (
    patch: Partial<{
      cloudProjectId: string | null;
      cloudProjectTitle: string;
      cloudVisibility: CloudProjectVisibility;
      cloudIsSaving: boolean;
      cloudIsOwner: boolean;
      cloudLastSavedAt: string | null;
      cloudLastValidationJobId: string | null;
      cloudValidationPersistStatus: CloudValidationPersistStatus;
      cloudValidationPersistError: string | null;
      cloudError: string | null;
      cloudEditToken: string | null;
    }>
  ) => void;
  clearCloudProjectState: () => void;
  applyAiDesignResult: (
    result: AIConceptDesignResult
  ) => {
    success: boolean;
    error?: string;
    notice?: string;
    status?: 'applied' | 'applied-with-autocorrect' | 'manual-review-required' | 'failed';
  };
  importCustomComponentPackage: (payload: unknown) => { success: boolean; templateId?: string; error?: string };
  removeCustomComponentPackage: (templateId: string) => { success: boolean; error?: string };

  // ─── 프로젝트 저장/불러오기 ───
  serializeProject: () => ModuMakeProjectData;
  hydrateProject: (payload: unknown) => { success: boolean; error?: string; notice?: string };
  saveProjectToBrowser: () => Promise<{ success: boolean; savedAt?: string; error?: string }>;
  loadProjectFromBrowser: () => Promise<{ success: boolean; error?: string; notice?: string }>;
  saveProjectToCloud: () => Promise<{ success: boolean; savedAt?: string; error?: string }>;
  createCloudProject: (
    visibility?: CloudProjectVisibility
  ) => Promise<{ success: boolean; projectId?: string; error?: string }>;
  loadCloudProjectFromLink: (
    projectId: string,
    options?: { forceReload?: boolean }
  ) => Promise<{ success: boolean; isOwner?: boolean; error?: string }>;
  forkCloudProject: () => Promise<{ success: boolean; projectId?: string; error?: string }>;
  updateCloudVisibility: (
    visibility: CloudProjectVisibility
  ) => Promise<{ success: boolean; error?: string }>;

  // ─── 보기(View) 상태 및 액션 ───
  showGrid: boolean;
  showMinimap: boolean;
  toggleGrid: () => void;
  toggleMinimap: () => void;

  // ─── 헬퍼 ───
  getComponentTemplate: (instanceId: string) => PlacedComponent | undefined;
}

// ============================================================
// 7. AI 코드 생성 페이로드 (Phase 2: boardId + targetLanguage 추가)
// ============================================================

/**
 * Claude API로 전송될 최종 정제된 데이터 구조
 */
export interface AICodeGenerationPayload {
  boardId: string;
  boardName: string;
  chipset: string;
  targetLanguage: TargetLanguage;
  connectedComponents: {
    templateId: string;
    componentName: string;
    pinConnections: Record<string, string>;
    librarySource?: 'core' | 'custom';
    libraryIncludes?: string[];
    dependencies?: ComponentDependencyMap;
    aiHints?: ComponentAiHints;
  }[];
  installedLibraries?: InstalledProjectLibrary[];
  userIntent?: string;
}

/** API 성공 응답 */
export interface GenerateCodeResponse {
  code: string;
  compilerManifest?: CompilerManifest;
  fallback?: boolean;
  aiMeta?: AICodeGenerationMeta;
}

/** API 에러 응답 */
export interface GenerateCodeErrorResponse {
  error: string;
  details?: string;
}

export interface AIConceptBoardSelection {
  id: string;
}

export interface AIConceptExistingComponentContext {
  instanceId: string;
  templateId: string;
  name: string;
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  assignedPins: Record<string, string>;
}

export interface AIConceptDesignContext {
  boardId: string;
  components: AIConceptExistingComponentContext[];
  usedBoardPins: string[];
  lockedBoardPins: string[];
}

export interface AIConceptComponentDraft {
  instanceId: string;
  templateId: string;
  position: { x: number; y: number };
  rotation: 0 | 90 | 180 | 270;
  assignedPins: Record<string, string>;
}

export interface AIConceptConnectionDraft {
  instanceId: string;
  componentPin: string;
  boardPin: string;
}

export interface AIConceptDesignResult {
  board: AIConceptBoardSelection;
  components: AIConceptComponentDraft[];
  connections: AIConceptConnectionDraft[];
  code: string;
  meta?: AIConceptDesignMeta;
}

export interface AIConceptRequestPayload {
  concept: string;
  preferredBoardId?: string;
  currentDesign?: AIConceptDesignContext;
  availableCustomComponents?: CustomComponentPackage[];
}

export interface AIConceptErrorResponse {
  error: string;
  details?: string[] | string;
}

// ============================================================
// 8. Auto-Router 결과 타입
// ============================================================

export interface AutoRouterResult {
  success: boolean;
  assigned: Record<string, string>;
  updatedPins: Record<string, BoardPin>;
  error?: string;
}

export {
  DATASHEET_REVIEW_SCHEMA_VERSION,
  type DatasheetReviewBoardInput,
  type DatasheetReviewCodePinUsage,
  type DatasheetReviewBusProtocol,
  type DatasheetReviewComponentInput,
  type DatasheetReviewComponentSourceKind,
  type DatasheetReviewExtractionPlan,
  type DatasheetReviewExtractionTarget,
  type DatasheetReviewInputPayload,
  type DatasheetReviewNetInput,
  type DatasheetReviewNetKind,
  type DatasheetReviewNetMemberRef,
  type DatasheetReviewPinDirection,
  type DatasheetReviewPinInput,
  type DatasheetReviewProjectMeta,
  type DatasheetReviewRuleFinding,
  type DatasheetReviewSectionKey,
  type DatasheetReviewSeverity,
  type DatasheetReviewSourceKind,
  type DatasheetReviewValidationFlag,
  type DatasheetReviewValidationFlagSource,
} from './datasheet-review';

export {
  UNIFIED_CIRCUIT_MODEL_SCHEMA_VERSION,
  type UnifiedCircuitComponent,
  type UnifiedCircuitComponentPin,
  type UnifiedCircuitIgnoredSymbol,
  type UnifiedCircuitModel,
  type UnifiedCircuitModelStats,
  type UnifiedCircuitNet,
  type UnifiedCircuitNetKind,
  type UnifiedCircuitNetMember,
  type UnifiedCircuitPinDirection,
  type UnifiedCircuitSourceMeta,
  type UnifiedCircuitUnresolvedSymbol,
} from './unified-circuit-model';

export {
  LIGHTWEIGHT_VALIDATION_JSON_SCHEMA_VERSION,
  type LightweightValidationJson,
  type LightweightValidationJsonComponent,
  type LightweightValidationJsonNet,
  type LightweightValidationJsonNetMember,
  type LightweightValidationJsonPin,
} from './lightweight-validation-json';

export {
  type AIAnalyzeProvider,
  type AIAnalyzeRecommendation,
  type AIAnalyzeRequestPayload,
  type AIAnalyzeResultSet,
  type AIAnalyzeResponse,
  type AIAnalyzeSemanticIssue,
} from './ai-analyze';

export {
  VALIDATION_SNAPSHOT_SCHEMA_VERSION,
  type ProjectValidationSummary,
  type ValidationIssueConfidence,
  type ValidationIssueDiff,
  type ValidationIssueDiffEntry,
  type ValidationJobDetail,
  type ValidationJobSummary,
  type ValidationSnapshot,
  type ValidationSnapshotIssue,
} from './validation-snapshot';
