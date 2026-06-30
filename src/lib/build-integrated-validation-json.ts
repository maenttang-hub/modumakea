import { getBoardById } from '@/constants/boards';
import { mergeCodePinUsage } from '@/lib/merge-code-pin-usage';
import { summarizeComponentNetLabels } from '@/lib/net-label-utils';
import { isReportableValidationComponent } from '@/lib/validation-reportable-component-policy';
import type {
  DatasheetReviewBusProtocol,
  DatasheetReviewComponentInput,
  DatasheetReviewExtractionTarget,
  DatasheetReviewInputPayload,
  DatasheetReviewNetInput,
  DatasheetReviewNetKind,
  DatasheetReviewPinDirection,
  DatasheetReviewPinInput,
  DatasheetReviewProjectMeta,
  DatasheetReviewRuleFinding,
  DatasheetReviewSectionKey,
  DatasheetReviewValidationFlag,
  FormalVerificationReport,
  ProjectAuditIssue,
  UnifiedCircuitComponent,
  UnifiedCircuitComponentPin,
  UnifiedCircuitModel,
  UnifiedCircuitNet,
} from '@/types';

function dedupeStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    if (!raw) {
      continue;
    }
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function inferProtocols(pin: UnifiedCircuitComponentPin): DatasheetReviewBusProtocol[] {
  const upper = pin.pinName.trim().toUpperCase();
  const protocols = new Set<DatasheetReviewBusProtocol>();

  if (upper === 'VCC' || upper === 'VDD' || upper === 'VIN' || upper === 'AVCC' || upper === '3V' || upper === '3.3V' || upper === '5V') {
    protocols.add('POWER');
  }
  if (upper === 'GND' || upper === 'GNDPWR' || upper === 'VSS') {
    protocols.add('GND');
  }
  if (upper.includes('SDA') || upper.includes('SCL')) protocols.add('I2C');
  if (upper.includes('MISO') || upper.includes('MOSI') || upper.includes('SCK') || upper === 'CS' || upper.includes('RST')) protocols.add('SPI');
  if (upper === 'RX' || upper === 'TX') protocols.add('UART');
  if (upper === 'DATA' || upper === 'DQ') protocols.add('ONEWIRE');
  if (upper.includes('PWM')) protocols.add('PWM');
  if (upper.includes('AOUT') || upper.match(/^A\d+$/)) protocols.add('ADC');
  if (/^D\d+$|^G\d+$|^GPIO\d+$/i.test(upper)) protocols.add('GPIO');

  if (protocols.size === 0) {
    protocols.add('UNKNOWN');
  }

  return [...protocols];
}

function inferComponentCategory(component: UnifiedCircuitComponent) {
  const ref = component.reference.toUpperCase();
  if (ref.startsWith('R') || ref.startsWith('C') || ref.startsWith('L') || ref.startsWith('D')) {
    return 'PASSIVE';
  }
  return undefined;
}

function manufacturerCandidates(component: UnifiedCircuitComponent) {
  return dedupeStrings(
    component.mpnCandidates.flatMap(candidate => {
      const parts = candidate.split(/[:/_-]/).filter(Boolean);
      return parts.length > 1 ? [parts[0]] : [];
    })
  );
}

function buildComponentPins(component: UnifiedCircuitComponent): DatasheetReviewPinInput[] {
  return component.pins.map(pin => ({
    pinId: pin.pinNumber || pin.pinName,
    pinName: pin.pinName,
    pinNumber: pin.pinNumber,
    direction: pin.direction as DatasheetReviewPinDirection,
    electricalType: pin.electricalType,
    assignedBoardPin: pin.pinName,
    connectedNetIds: pin.netId ? [pin.netId] : [],
    netLabels: dedupeStrings([pin.netLabel, ...pin.netAliases]),
    protocols: inferProtocols(pin),
  }));
}

function buildComponentInput(component: UnifiedCircuitComponent): DatasheetReviewComponentInput {
  const pins = buildComponentPins(component);

  return {
    instanceId: component.instanceId,
    reference: component.reference,
    displayName: component.value ?? component.symbolName ?? component.reference,
    value: component.value,
    category: inferComponentCategory(component),
    sourceKind: 'imported_symbol',
    libraryId: component.libId,
    footprint: component.footprint,
    symbolName: component.symbolName,
    referencePrefix: component.reference.replace(/\d+/g, '') || undefined,
    pinNames: dedupeStrings(pins.map(pin => pin.pinName)),
    netLabels: summarizeComponentNetLabels(pins),
    connectedNetIds: dedupeStrings(pins.flatMap(pin => pin.connectedNetIds)),
    mpnCandidates: component.mpnCandidates,
    manufacturerCandidates: manufacturerCandidates(component),
    tags: dedupeStrings(['imported', component.symbolName, component.libId]),
    pins,
  };
}

function buildNetInput(net: UnifiedCircuitNet, boardId: string, boardPinNames: Set<string>): DatasheetReviewNetInput {
  const memberRefs: DatasheetReviewNetInput['memberRefs'] = net.members.map(member => ({
      ownerType: 'component' as const,
      ownerId: member.instanceId,
      ownerReference: member.reference,
      pinId: member.pinNumber,
      pinName: member.pinName,
  }));

  const synthesizedBoardPins = new Set<string>();
  for (const label of [net.primaryLabel, ...net.aliases]) {
    if (label && boardPinNames.has(label)) {
      synthesizedBoardPins.add(label);
    }
  }
  for (const member of net.members) {
    if (boardPinNames.has(member.pinName)) {
      synthesizedBoardPins.add(member.pinName);
    }
  }

  for (const pinId of synthesizedBoardPins) {
    memberRefs.push({
      ownerType: 'board',
      ownerId: boardId,
      pinId,
    });
  }

  return {
    netId: net.netId,
    label: net.primaryLabel,
    kind: net.kind as DatasheetReviewNetKind,
    memberRefs,
  };
}

function buildRuleFindings(issues: ProjectAuditIssue[]): DatasheetReviewRuleFinding[] {
  return issues.map(issue => ({
    severity: issue.severity,
    ruleId: issue.ruleId ?? issue.code ?? 'engine.unknown',
    title: issue.title,
    message: issue.message,
    componentReference: issue.componentName,
    boardPin: issue.boardPin,
    netLabel: undefined,
    recommendation: issue.recommendation,
  }));
}

function buildValidationFlags(params: {
  auditIssues: ProjectAuditIssue[];
  formalReport?: FormalVerificationReport;
}): DatasheetReviewValidationFlag[] {
  const auditFlags = params.auditIssues.map(issue => ({
    source: 'rule_based' as const,
    severity: issue.severity,
    code: issue.code ?? issue.ruleId ?? 'engine.unknown',
    ruleId: issue.ruleId ?? issue.code ?? 'engine.unknown',
    title: issue.title,
    message: issue.message,
    componentReference: issue.componentName,
    boardPin: issue.boardPin,
    lineNumber: issue.line,
    operation: issue.operation,
    recommendation: issue.recommendation,
  }));

  const formalFlags = (params.formalReport?.issues ?? []).map(issue => ({
    source: 'formal_verifier' as const,
    severity: issue.severity,
    code: issue.code ?? issue.ruleId ?? 'formal.unknown',
    ruleId: issue.ruleId ?? issue.code ?? 'formal.unknown',
    title: issue.title,
    message: issue.message,
    componentReference: issue.componentName,
    boardPin: issue.boardPin,
    lineNumber: issue.line,
    operation: issue.operation,
    recommendation: issue.recommendation,
  }));

  return [...auditFlags, ...formalFlags];
}

function buildSearchQueries(component: DatasheetReviewComponentInput) {
  const candidate = component.mpnCandidates[0] ?? component.value ?? component.displayName;
  const footprintHint = component.footprint ? `${component.footprint} datasheet` : undefined;
  return dedupeStrings([
    `${candidate} datasheet pdf`,
    `${candidate} pinout`,
    component.libraryId ? `${component.libraryId} datasheet` : undefined,
    footprintHint,
  ]);
}

function buildReviewQuestions(component: DatasheetReviewComponentInput) {
  const protocols = dedupeStrings(component.pins.flatMap(pin => pin.protocols));
  const questions = [
    `${component.reference}의 전원 핀 구성이 데이터시트 권장 전원 회로와 맞는지 확인해 주세요.`,
    `${component.reference}의 핀 이름과 현재 연결 넷이 데이터시트 핀 설명과 충돌하지 않는지 확인해 주세요.`,
  ];

  if (protocols.includes('I2C')) {
    questions.push(`${component.reference}의 I2C 주소, 풀업 요구사항, 전압 조건을 확인해 주세요.`);
  }
  if (protocols.includes('SPI')) {
    questions.push(`${component.reference}의 SPI 핀 역할과 CS/RESET 연결이 데이터시트 권장과 맞는지 확인해 주세요.`);
  }
  if (protocols.includes('ADC')) {
    questions.push(`${component.reference}의 아날로그 출력 또는 ADC 입력 조건이 전압 범위를 넘지 않는지 확인해 주세요.`);
  }

  return dedupeStrings(questions);
}

function buildRequestedSections(component: DatasheetReviewComponentInput) {
  const sections = new Set<DatasheetReviewSectionKey>([
    'pin-description',
    'recommended-operating-conditions',
    'absolute-maximum-ratings',
  ]);

  const pinNames = component.pinNames.map(name => name.toUpperCase());
  const protocols = component.pins.flatMap(pin => pin.protocols);

  if (pinNames.some(name => ['VCC', 'VDD', 'VIN', 'AVCC', 'GND', 'VSS', '3V', '3.3V', '5V'].includes(name))) {
    sections.add('power-supply');
    sections.add('application-circuit');
  }
  if (protocols.includes('I2C')) {
    sections.add('i2c-addressing');
    sections.add('timing-characteristics');
  }
  if (protocols.includes('SPI')) {
    sections.add('timing-characteristics');
  }
  if (component.footprint) {
    sections.add('package-information');
  }

  return [...sections];
}

function buildExtractionTargets(components: DatasheetReviewComponentInput[]): DatasheetReviewExtractionTarget[] {
  return components
    .filter(component => component.mpnCandidates.length > 0 || component.libraryId || component.sourceKind === 'imported_symbol')
    .map(component => ({
      reference: component.reference,
      displayName: component.displayName,
      libraryId: component.libraryId,
      footprint: component.footprint,
      mpnCandidates: component.mpnCandidates,
      manufacturerCandidates: component.manufacturerCandidates,
      requestedSections: buildRequestedSections(component),
      searchQueries: buildSearchQueries(component),
      reviewQuestions: buildReviewQuestions(component),
    }));
}

export function buildIntegratedValidationJson(params: {
  unifiedModel: UnifiedCircuitModel;
  boardId: string;
  boardName?: string;
  logicVoltage?: string;
  boardPinNames?: string[];
  sourceKind?: 'kicad_import' | 'modumake_canvas';
  sourceCode?: string;
  auditIssues?: ProjectAuditIssue[];
  formalReport?: FormalVerificationReport;
  importedComponentCount?: number;
  importedConnectionCount?: number;
  generatedCustomComponentCount?: number;
}): DatasheetReviewInputPayload {
  const board = getBoardById(params.boardId);
  const boardName = params.boardName ?? board.name;
  const logicVoltage = params.logicVoltage ?? board.logicVoltage;
  const boardPinNames = dedupeStrings(params.boardPinNames ?? board.pinDefinitions.map(pin => pin.id));
  const boardPinNameSet = new Set(boardPinNames);

  const components = params.unifiedModel.components
    .filter(isReportableValidationComponent)
    .map(buildComponentInput);
  const nets = params.unifiedModel.nets.map(net => buildNetInput(net, params.boardId, boardPinNameSet));
  const extractionTargets = buildExtractionTargets(components);
  const codePinUsage = mergeCodePinUsage({
    sourceCode: params.sourceCode,
    boardId: params.boardId,
    components,
    nets,
  });
  const validationFlags = buildValidationFlags({
    auditIssues: params.auditIssues ?? [],
    formalReport: params.formalReport,
  });

  const project: DatasheetReviewProjectMeta = {
    projectName: params.unifiedModel.source.projectName,
    boardId: params.boardId,
    boardName,
    sourceKind: params.sourceKind ?? 'kicad_import',
    importedWithGenerator: params.unifiedModel.source.generator,
    importedAsGenericBoard: params.boardId === 'kicad_generic' || undefined,
    importedComponentCount: params.importedComponentCount ?? params.unifiedModel.stats.componentCount,
    importedConnectionCount: params.importedConnectionCount ?? params.unifiedModel.stats.wireSegmentCount,
    generatedCustomComponentCount: params.generatedCustomComponentCount ?? 0,
  };

  return {
    schemaVersion: '2026-06-19',
    project,
    board: {
      boardId: params.boardId,
      boardName,
      logicVoltage,
      netLabels: dedupeStrings(params.unifiedModel.nets.flatMap(net => [net.primaryLabel, ...net.aliases])),
      pinNames: boardPinNames,
    },
    components,
    nets,
    codePinUsage,
    validationFlags,
    ruleFindings: buildRuleFindings(params.auditIssues ?? []),
    extractionPlan: {
      strategy: 'focused-sections',
      globalSections: [
        'pin-description',
        'recommended-operating-conditions',
        'absolute-maximum-ratings',
      ],
      targets: extractionTargets,
    },
  };
}
