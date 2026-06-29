import { getBoardById } from '@/constants/boards';
import { getStaticTemplateById } from '@/constants/component-templates';
import { resolveIssueSourceBucketInfo } from '@/lib/issue-source-bucket';
import { mergeCodePinUsage } from '@/lib/merge-code-pin-usage';
import { summarizeComponentNetLabels } from '@/lib/net-label-utils';
import type {
  ComponentTemplate,
  DatasheetReviewBusProtocol,
  DatasheetReviewComponentInput,
  DatasheetReviewComponentSourceKind,
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
  ModuMakeProjectData,
  PlacedComponent,
  ProjectAuditIssue,
} from '@/types';
import type { KiCadImportSummary } from '@/lib/kicad-sch-parser';

type EndpointKey = string;

type NetBuildContext = {
  endpointMembers: Map<EndpointKey, { ownerType: 'board' | 'component'; ownerId: string; pinId: string }>;
  nets: DatasheetReviewNetInput[];
  endpointToNetId: Map<EndpointKey, string>;
};

class EndpointUnionFind {
  private parent = new Map<string, string>();

  ensure(key: string) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
    }
  }

  find(key: string): string {
    this.ensure(key);
    const parent = this.parent.get(key)!;
    if (parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parent.set(key, root);
    return root;
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function endpointKey(ownerType: 'board' | 'component', ownerId: string, pinId: string) {
  return `${ownerType}:${ownerId}:${pinId}`;
}

function normalizeToken(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function dedupeStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    if (!raw) {
      continue;
    }
    const value = normalizeToken(raw);
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

function inferNetKind(label: string | undefined, members: DatasheetReviewNetInput['memberRefs']): DatasheetReviewNetKind {
  const normalized = (label ?? '').trim().toUpperCase();
  if (normalized === 'GND' || normalized.includes('GNDPWR')) {
    return 'ground';
  }
  if (
    normalized === 'VCC' ||
    normalized === 'VDD' ||
    normalized === 'VIN' ||
    normalized === '3V' ||
    normalized === '3.3V' ||
    normalized === '5V' ||
    normalized.startsWith('AVCC')
  ) {
    return 'power';
  }
  if (normalized.includes('SCL') || normalized.includes('SDA') || normalized.includes('MISO') || normalized.includes('MOSI') || normalized.includes('SCK')) {
    return 'bus';
  }
  if (normalized.includes('CLK') || normalized.includes('XTAL')) {
    return 'clock';
  }
  if (normalized.startsWith('A') && /\d/.test(normalized)) {
    return 'analog';
  }

  const boardPowerOnly = members.every(member => member.ownerType === 'board' && /^(GND|GNDPWR|3V|3\.3V|5V|VCC|VIN)$/i.test(member.pinId));
  if (boardPowerOnly) {
    return members.some(member => /^(GND|GNDPWR)$/i.test(member.pinId)) ? 'ground' : 'power';
  }

  return 'signal';
}

function inferProtocols(pinName: string, assignedBoardPin: string | undefined): DatasheetReviewBusProtocol[] {
  const upper = pinName.trim().toUpperCase();
  const protocols = new Set<DatasheetReviewBusProtocol>();

  if (upper === 'VCC' || upper === 'VDD' || upper === 'VIN' || upper === 'AVCC' || upper === '3V' || upper === '3.3V' || upper === '5V') {
    protocols.add('POWER');
  }
  if (upper === 'GND' || upper === 'GNDPWR' || upper === 'VSS') {
    protocols.add('GND');
  }
  if (upper.includes('SDA')) protocols.add('I2C');
  if (upper.includes('SCL')) protocols.add('I2C');
  if (upper.includes('MISO') || upper.includes('MOSI') || upper.includes('SCK') || upper === 'CS' || upper.includes('RST')) protocols.add('SPI');
  if (upper === 'RX' || upper === 'TX') protocols.add('UART');
  if (upper === 'DATA' || upper === 'DQ') protocols.add('ONEWIRE');
  if (upper.includes('PWM')) protocols.add('PWM');
  if (upper.includes('AOUT') || upper.match(/^A\d+$/)) protocols.add('ADC');

  if (assignedBoardPin?.startsWith('A')) protocols.add('ADC');
  if (assignedBoardPin && /^D\d+$|^G\d+$|^GPIO\d+$/i.test(assignedBoardPin)) protocols.add('GPIO');

  if (protocols.size === 0) {
    protocols.add('UNKNOWN');
  }

  return [...protocols];
}

function inferPinDirection(pinName: string): DatasheetReviewPinDirection {
  const upper = pinName.trim().toUpperCase();
  if (upper === 'VCC' || upper === 'VDD' || upper === 'VIN' || upper === 'AVCC' || upper === '3V' || upper === '3.3V' || upper === '5V') {
    return 'power_in';
  }
  if (upper === 'GND' || upper === 'GNDPWR' || upper === 'VSS') {
    return 'ground';
  }
  if (upper === 'MISO' || upper === 'TX' || upper === 'DOUT' || upper === 'AOUT' || upper === 'ECHO' || upper === 'OUT') {
    return 'output';
  }
  if (upper === 'MOSI' || upper === 'RX' || upper === 'TRIG' || upper === 'IN') {
    return 'input';
  }
  if (upper === 'SDA' || upper === 'SCL' || upper === 'DATA' || upper === 'SIG' || upper === 'SIGNAL') {
    return 'bidirectional';
  }
  return 'unknown';
}

function inferComponentSourceKind(component: PlacedComponent, template: ComponentTemplate | undefined, boardId: string): DatasheetReviewComponentSourceKind {
  if (boardId === 'kicad_generic' && component.importedGeometry) {
    return 'imported_symbol';
  }
  if (template?.librarySource === 'custom') {
    return 'custom_component';
  }
  return 'catalog_template';
}

function looksLikeMpnCandidate(value: string) {
  const token = value.trim();
  if (token.length < 3 || token.length > 60) {
    return false;
  }
  if (!/[A-Z]/i.test(token) || !/\d/.test(token)) {
    return false;
  }
  if (/^(R|C|L|D|U|J|SW)\d+$/i.test(token)) {
    return false;
  }
  return /^[A-Za-z0-9_.:+\-\/]+$/.test(token);
}

function extractMpnCandidates(component: PlacedComponent, template: ComponentTemplate | undefined) {
  const candidates = dedupeStrings([
    component.value,
    component.name,
    template?.defaultValue,
    template?.schematic?.symbol,
    template?.pcb?.footprint,
  ]);

  return candidates.filter(looksLikeMpnCandidate);
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

function resolveTemplate(document: ModuMakeProjectData, component: PlacedComponent) {
  return document.templateCache?.[component.templateId] ?? getStaticTemplateById(component.templateId);
}

function buildNetContext(document: ModuMakeProjectData): NetBuildContext {
  const unionFind = new EndpointUnionFind();
  const endpointMembers = new Map<EndpointKey, { ownerType: 'board' | 'component'; ownerId: string; pinId: string }>();
  const edgeLabels = new Map<string, string[]>();

  const registerEndpoint = (ownerType: 'board' | 'component', ownerId: string, pinId: string) => {
    const key = endpointKey(ownerType, ownerId, pinId);
    unionFind.ensure(key);
    endpointMembers.set(key, { ownerType, ownerId, pinId });
    return key;
  };

  for (const component of document.components) {
    for (const [pinId, boardPinId] of Object.entries(component.assignedPins)) {
      const componentKey = registerEndpoint('component', component.instanceId, pinId);
      const boardKey = registerEndpoint('board', document.activeBoardId, boardPinId);
      unionFind.union(componentKey, boardKey);
    }
  }

  for (const connection of document.manualConnections) {
    const sourceKey = registerEndpoint(connection.source.ownerType, connection.source.ownerId, connection.source.pinId);
    const targetKey = registerEndpoint(connection.target.ownerType, connection.target.ownerId, connection.target.pinId);
    unionFind.union(sourceKey, targetKey);
    if (connection.suggestedNetName) {
      const pairKey = [sourceKey, targetKey].sort().join('::');
      const labels = edgeLabels.get(pairKey) ?? [];
      labels.push(connection.suggestedNetName);
      edgeLabels.set(pairKey, labels);
    }
  }

  const groupedMembers = new Map<string, NetBuildContext['nets'][number]['memberRefs']>();
  for (const [key, member] of endpointMembers.entries()) {
    const root = unionFind.find(key);
    const bucket = groupedMembers.get(root) ?? [];
    bucket.push({
      ownerType: member.ownerType,
      ownerId: member.ownerId,
      pinId: member.pinId,
    });
    groupedMembers.set(root, bucket);
  }

  const endpointToNetId = new Map<string, string>();
  const nets: DatasheetReviewNetInput[] = [];
  let netIndex = 0;

  for (const [root, memberRefs] of groupedMembers.entries()) {
    const labels = new Set<string>();
    for (const member of memberRefs) {
      if (member.ownerType === 'board') {
        labels.add(member.pinId);
      }
    }
    for (const [pairKey, pairLabels] of edgeLabels.entries()) {
      const [leftKey, rightKey] = pairKey.split('::');
      if (leftKey && rightKey && unionFind.find(leftKey) === root && unionFind.find(rightKey) === root) {
        pairLabels.forEach(label => labels.add(label));
      }
    }

    const label = [...labels][0];
    const netId = `net-${++netIndex}`;
    const net: DatasheetReviewNetInput = {
      netId,
      label,
      kind: inferNetKind(label, memberRefs),
      memberRefs,
    };
    nets.push(net);

    for (const member of memberRefs) {
      endpointToNetId.set(endpointKey(member.ownerType, member.ownerId, member.pinId), netId);
    }
  }

  return {
    endpointMembers,
    nets,
    endpointToNetId,
  };
}

function buildComponentPins(component: PlacedComponent, template: ComponentTemplate | undefined, netContext: NetBuildContext): DatasheetReviewPinInput[] {
  const templatePins = template?.requiredPins ?? [];
  const pinIds = dedupeStrings([
    ...templatePins.map(pin => pin.name),
    ...Object.keys(component.assignedPins),
    ...((component.importedGeometry?.pinAnchors ?? []).map(pin => pin.pinId)),
  ]);

  return pinIds.map(pinId => {
    const importedPin = component.importedGeometry?.pinAnchors.find(pin => pin.pinId === pinId);
    const assignedBoardPin = component.assignedPins[pinId];
    const endpoint = endpointKey('component', component.instanceId, pinId);
    const connectedNetId = netContext.endpointToNetId.get(endpoint);
    const net = connectedNetId ? netContext.nets.find(candidate => candidate.netId === connectedNetId) : undefined;

    return {
      pinId,
      pinName: importedPin?.label ?? pinId,
      pinNumber: importedPin?.number,
      direction: inferPinDirection(importedPin?.label ?? pinId),
      electricalType: undefined,
      assignedBoardPin,
      connectedNetIds: connectedNetId ? [connectedNetId] : [],
      netLabels: net?.label ? [net.label] : [],
      protocols: inferProtocols(importedPin?.label ?? pinId, assignedBoardPin),
    };
  });
}

function buildComponentInput(
  document: ModuMakeProjectData,
  component: PlacedComponent,
  netContext: NetBuildContext
): DatasheetReviewComponentInput {
  const template = resolveTemplate(document, component);
  const pins = buildComponentPins(component, template, netContext);
  const sourceKind = inferComponentSourceKind(component, template, document.activeBoardId);
  const mpnCandidates = extractMpnCandidates(component, template);
  const manufacturerCandidates = dedupeStrings(
    mpnCandidates.flatMap(candidate => {
      const parts = candidate.split(/[:/_-]/).filter(Boolean);
      return parts.length > 1 ? [parts[0]] : [];
    })
  );

  return {
    instanceId: component.instanceId,
    reference: component.importedReference ?? `${template?.schematic?.referencePrefix ?? 'U'}_${component.instanceId}`,
    displayName: component.name,
    value: component.value ?? component.importedGeometry?.valueLabel ?? template?.defaultValue,
    category: template?.category,
    sourceKind,
    templateId: component.templateId,
    libraryId: template?.schematic?.symbol,
    footprint: template?.pcb?.footprint,
    symbolName: template?.schematic?.symbol,
    referencePrefix: template?.schematic?.referencePrefix,
    pinNames: dedupeStrings(pins.map(pin => pin.pinName)),
    netLabels: summarizeComponentNetLabels(pins),
    connectedNetIds: dedupeStrings(pins.flatMap(pin => pin.connectedNetIds)),
    mpnCandidates,
    manufacturerCandidates,
    tags: dedupeStrings([
      template?.category,
      ...(template?.design?.tags ?? []),
      sourceKind === 'imported_symbol' ? 'imported' : undefined,
    ]),
    pins,
  };
}

function buildRuleFindings(issues: ProjectAuditIssue[], placedComponents: PlacedComponent[]): DatasheetReviewRuleFinding[] {
  return issues.map(issue => {
    const bucketInfo = resolveIssueSourceBucketInfo(issue, placedComponents);
    return {
      severity: issue.severity,
      ruleId: issue.ruleId ?? issue.code ?? 'engine.unknown',
      title: issue.title,
      message: issue.message,
      confidence: issue.confidence,
      evidenceSummary: issue.evidence?.evidenceSummary,
      sourceBucket: bucketInfo.sourceBucket,
      sourceQuality: bucketInfo.sourceQuality,
      mappingConfidence: bucketInfo.mappingConfidence,
      mappingSource: bucketInfo.mappingSource,
      lowConfidenceReasons: bucketInfo.lowConfidenceReasons,
      componentReference: issue.componentName,
      boardPin: issue.boardPin,
      netLabel: undefined,
      recommendation: issue.recommendation,
    };
  });
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
    confidence: issue.confidence,
    evidenceSummary: issue.evidence?.evidenceSummary,
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

function buildExtractionTargets(components: DatasheetReviewComponentInput[]): DatasheetReviewExtractionTarget[] {
  return components
    .filter(component =>
      component.category !== 'PASSIVE' ||
      component.mpnCandidates.length > 0 ||
      component.sourceKind === 'imported_symbol'
    )
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

export function buildDatasheetReviewPayload(params: {
  document: ModuMakeProjectData;
  importSummary?: KiCadImportSummary;
  auditIssues?: ProjectAuditIssue[];
  sourceCode?: string;
  formalReport?: FormalVerificationReport;
}): DatasheetReviewInputPayload {
  const { document } = params;
  const board = getBoardById(document.activeBoardId);
  const netContext = buildNetContext(document);
  const components = document.components.map(component => buildComponentInput(document, component, netContext));
  const extractionTargets = buildExtractionTargets(components);
  const codePinUsage = mergeCodePinUsage({
    sourceCode: params.sourceCode,
    boardId: document.activeBoardId,
    components,
    nets: netContext.nets,
  });
  const validationFlags = buildValidationFlags({
    auditIssues: params.auditIssues ?? [],
    formalReport: params.formalReport,
  });

  const project: DatasheetReviewProjectMeta = {
    projectName: document.projectName,
    boardId: document.activeBoardId,
    boardName: board.name,
    sourceKind: params.importSummary ? 'kicad_import' : 'modumake_canvas',
    importedAsGenericBoard: document.activeBoardId === 'kicad_generic' || undefined,
    importedComponentCount: params.importSummary?.importedComponentCount ?? document.components.length,
    importedConnectionCount: params.importSummary?.importedConnectionCount ?? document.manualConnections.length,
    generatedCustomComponentCount: params.importSummary?.generatedCustomComponentCount ?? (document.customComponentPackages?.length ?? 0),
  };

  return {
    schemaVersion: '2026-06-19',
    project,
    board: {
      boardId: board.id,
      boardName: board.name,
      logicVoltage: board.logicVoltage,
      netLabels: dedupeStrings(netContext.nets.map(net => net.label)),
      pinNames: board.pinDefinitions.map(pin => pin.id),
    },
    components,
    nets: netContext.nets,
    codePinUsage,
    validationFlags,
    ruleFindings: buildRuleFindings(params.auditIssues ?? [], document.components),
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
