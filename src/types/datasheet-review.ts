/**
 * 데이터시트 리뷰용 입력 계약
 *
 * 목표:
 * - KiCad import / ModuMake 캔버스에서 추출한 구조화 정보를
 *   모델 공급자와 무관한 고정 payload로 정리한다.
 * - 나중에 Gemini / OpenAI / Claude 중 무엇을 붙이더라도
 *   이 스키마는 그대로 유지하고, 어댑터만 바꿀 수 있게 한다.
 */

export const DATASHEET_REVIEW_SCHEMA_VERSION = '2026-06-19';

export type DatasheetReviewSourceKind = 'kicad_import' | 'modumake_canvas';
export type DatasheetReviewSeverity = 'info' | 'warning' | 'error';
export type DatasheetReviewValidationFlagSource = 'rule_based' | 'formal_verifier';

export type DatasheetReviewComponentSourceKind =
  | 'board'
  | 'catalog_template'
  | 'custom_component'
  | 'imported_symbol';

export type DatasheetReviewNetKind =
  | 'power'
  | 'ground'
  | 'signal'
  | 'clock'
  | 'bus'
  | 'analog'
  | 'unknown';

export type DatasheetReviewPinDirection =
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'power_in'
  | 'power_out'
  | 'ground'
  | 'passive'
  | 'unknown';

export type DatasheetReviewBusProtocol =
  | 'GPIO'
  | 'ADC'
  | 'PWM'
  | 'I2C'
  | 'SPI'
  | 'UART'
  | 'ONEWIRE'
  | 'POWER'
  | 'GND'
  | 'UNKNOWN';

export type DatasheetReviewSectionKey =
  | 'pin-description'
  | 'absolute-maximum-ratings'
  | 'recommended-operating-conditions'
  | 'power-supply'
  | 'application-circuit'
  | 'reference-design'
  | 'timing-characteristics'
  | 'i2c-addressing'
  | 'memory-map'
  | 'package-information';

export interface DatasheetReviewProjectMeta {
  projectName: string;
  boardId: string;
  boardName: string;
  sourceKind: DatasheetReviewSourceKind;
  importedWithGenerator?: string;
  importedAsGenericBoard?: boolean;
  importedComponentCount: number;
  importedConnectionCount: number;
  generatedCustomComponentCount: number;
}

export interface DatasheetReviewBoardInput {
  boardId: string;
  boardName: string;
  logicVoltage?: string;
  reference?: string;
  libraryId?: string;
  footprint?: string;
  value?: string;
  netLabels: string[];
  pinNames: string[];
}

export interface DatasheetReviewPinInput {
  pinId: string;
  pinName: string;
  pinNumber?: string;
  direction: DatasheetReviewPinDirection;
  electricalType?: string;
  assignedBoardPin?: string;
  connectedNetIds: string[];
  netLabels: string[];
  protocols: DatasheetReviewBusProtocol[];
}

export interface DatasheetReviewComponentInput {
  instanceId: string;
  reference: string;
  displayName: string;
  value?: string;
  category?: string;
  sourceKind: DatasheetReviewComponentSourceKind;
  templateId?: string;
  libraryId?: string;
  footprint?: string;
  symbolName?: string;
  referencePrefix?: string;
  pinNames: string[];
  netLabels: string[];
  connectedNetIds: string[];
  mpnCandidates: string[];
  manufacturerCandidates: string[];
  tags: string[];
  pins: DatasheetReviewPinInput[];
}

export interface DatasheetReviewNetMemberRef {
  ownerType: 'board' | 'component';
  ownerId: string;
  ownerReference?: string;
  pinId: string;
  pinName?: string;
}

export interface DatasheetReviewNetInput {
  netId: string;
  label?: string;
  kind: DatasheetReviewNetKind;
  memberRefs: DatasheetReviewNetMemberRef[];
}

export interface DatasheetReviewRuleFinding {
  severity: DatasheetReviewSeverity;
  ruleId: string;
  title: string;
  message: string;
  confidence?: 'confirmed' | 'strong-inference' | 'needs-review' | 'informational';
  evidenceSummary?: string;
  sourceBucket?: 'official' | 'partial' | 'generic' | 'fallback' | 'other';
  sourceQuality?: 'official-complete' | 'official-partial' | 'module-verified' | 'generic-module' | 'needs-vendor-pin';
  mappingConfidence?: 'high' | 'medium' | 'low';
  mappingSource?: 'kicad-library' | 'refdes' | 'value-regex' | 'footprint-regex' | 'pin-shape' | 'custom-fallback';
  lowConfidenceReasons?: string[];
  componentReference?: string;
  boardPin?: string;
  netLabel?: string;
  recommendation?: string;
}

export interface DatasheetReviewCodePinUsage {
  operationType: 'pinMode' | 'digitalWrite' | 'analogWrite' | 'digitalRead' | 'analogRead';
  pinArgument: string;
  matchedMcuPinLabel: string | null;
  lineNumber: number;
  scope: 'setup' | 'loop' | 'other';
  mode?: string;
  value?: string;
  conditional: boolean;
  conditions: string[];
  callPath: string[];
  connectedNetLabels: string[];
  connectedComponentReferences: string[];
}

export interface DatasheetReviewValidationFlag {
  source: DatasheetReviewValidationFlagSource;
  severity: DatasheetReviewSeverity;
  code: string;
  ruleId: string;
  title: string;
  message: string;
  confidence?: 'confirmed' | 'strong-inference' | 'needs-review' | 'informational';
  evidenceSummary?: string;
  componentReference?: string;
  boardPin?: string;
  lineNumber?: number;
  operation?: string;
  recommendation?: string;
}

export interface DatasheetReviewExtractionTarget {
  reference: string;
  displayName: string;
  libraryId?: string;
  footprint?: string;
  mpnCandidates: string[];
  manufacturerCandidates: string[];
  requestedSections: DatasheetReviewSectionKey[];
  searchQueries: string[];
  reviewQuestions: string[];
}

export interface DatasheetReviewExtractionPlan {
  strategy: 'focused-sections' | 'full-datasheet-fallback';
  globalSections: DatasheetReviewSectionKey[];
  targets: DatasheetReviewExtractionTarget[];
}

export interface DatasheetReviewInputPayload {
  schemaVersion: typeof DATASHEET_REVIEW_SCHEMA_VERSION;
  project: DatasheetReviewProjectMeta;
  board: DatasheetReviewBoardInput;
  components: DatasheetReviewComponentInput[];
  nets: DatasheetReviewNetInput[];
  codePinUsage: DatasheetReviewCodePinUsage[];
  validationFlags: DatasheetReviewValidationFlag[];
  ruleFindings: DatasheetReviewRuleFinding[];
  extractionPlan: DatasheetReviewExtractionPlan;
}
