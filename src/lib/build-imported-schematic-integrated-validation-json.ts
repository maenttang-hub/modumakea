import { getBoardById } from '@/constants/boards';
import { buildIntegratedValidationJson } from '@/lib/build-integrated-validation-json';
import { parseKiCadSchematicToUnifiedCircuitModel } from '@/lib/v3-kicad-parser';
import { isReportableValidationComponent } from '@/lib/validation-reportable-component-policy';
import type { KiCadImportSummary } from '@/lib/kicad-sch-parser';
import type {
  DatasheetReviewBusProtocol,
  DatasheetReviewComponentInput,
  DatasheetReviewExtractionTarget,
  DatasheetReviewInputPayload,
  DatasheetReviewPinInput,
  ModuMakeProjectData,
  PlacedComponent,
} from '@/types';

interface BuildImportedSchematicIntegratedValidationJsonParams {
  document: ModuMakeProjectData;
  importedSource: string;
  importSummary?: KiCadImportSummary;
}

function dedupeStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw?.trim().replace(/\s+/g, ' ');
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

function inferImportedPinProtocols(pinName: string): DatasheetReviewBusProtocol[] {
  const upper = pinName.trim().toUpperCase();
  const protocols = new Set<DatasheetReviewBusProtocol>();

  if (['VCC', 'VDD', 'VIN', 'VBAT', 'VBUS', 'AVCC', '3V3', '3.3V', '5V'].includes(upper)) {
    protocols.add('POWER');
  }
  if (['GND', 'GNDPWR', 'VSS', 'AGND', 'DGND', 'PGND'].includes(upper)) {
    protocols.add('GND');
  }
  if (upper.includes('SDA') || upper.includes('SCL')) protocols.add('I2C');
  if (upper.includes('MISO') || upper.includes('MOSI') || upper.includes('SCK') || upper === 'CS' || upper.includes('RST')) protocols.add('SPI');
  if (upper === 'RX' || upper === 'TX' || upper.includes('RXD') || upper.includes('TXD')) protocols.add('UART');
  if (upper === 'DATA' || upper === 'DQ') protocols.add('ONEWIRE');
  if (upper.includes('PWM')) protocols.add('PWM');
  if (upper.includes('AOUT') || /^A\d+$/.test(upper)) protocols.add('ADC');
  if (/^(?:D\d+|G\d+|GPIO\d+|IO\d+)$/.test(upper)) protocols.add('GPIO');

  return protocols.size > 0 ? [...protocols] : ['UNKNOWN'];
}

function isReportableFallbackComponent(component: PlacedComponent) {
  return isReportableValidationComponent({
    importedReference: component.importedReference,
    name: component.name,
    templateId: component.templateId,
    libraryId: component.importedMapping?.libraryId,
  });
}

function buildFallbackPins(component: PlacedComponent): DatasheetReviewPinInput[] {
  const anchors = component.importedGeometry?.pinAnchors ?? [];

  return anchors.map(anchor => {
    const pinName = anchor.label || anchor.name || anchor.pinId || anchor.number;
    const assignedNet = component.assignedPins[anchor.pinId];

    return {
      pinId: anchor.pinId,
      pinName,
      pinNumber: anchor.number,
      direction: 'unknown',
      electricalType: undefined,
      assignedBoardPin: undefined,
      connectedNetIds: [],
      netLabels: dedupeStrings([assignedNet]),
      protocols: inferImportedPinProtocols(pinName),
    };
  });
}

function buildFallbackComponentInput(component: PlacedComponent): DatasheetReviewComponentInput {
  const pins = buildFallbackPins(component);
  const reference = component.importedReference ?? component.name;
  const libraryId = component.importedMapping?.libraryId;
  const footprint = component.importedMapping?.footprint;
  const value = component.value ?? component.importedMapping?.value;

  return {
    instanceId: component.instanceId,
    reference,
    displayName: value ?? component.name ?? reference,
    value,
    category: /^[RCLD]\d+/i.test(reference) ? 'PASSIVE' : undefined,
    sourceKind: 'imported_symbol',
    templateId: component.templateId,
    libraryId,
    footprint,
    symbolName: libraryId?.split(':').pop(),
    referencePrefix: reference.replace(/\d+/g, '') || undefined,
    pinNames: dedupeStrings(pins.map(pin => pin.pinName)),
    netLabels: dedupeStrings(pins.flatMap(pin => pin.netLabels)),
    connectedNetIds: [],
    mpnCandidates: dedupeStrings([value, component.name, libraryId?.split(':').pop()]),
    manufacturerCandidates: [],
    tags: dedupeStrings([
      'imported',
      'fallback-preserved',
      component.importedMapping?.source,
      component.importedMapping?.matchedBy,
      libraryId,
    ]),
    pins,
  };
}

function buildFallbackExtractionTarget(component: DatasheetReviewComponentInput): DatasheetReviewExtractionTarget {
  const candidate = component.mpnCandidates[0] ?? component.value ?? component.displayName;

  return {
    reference: component.reference,
    displayName: component.displayName,
    libraryId: component.libraryId,
    footprint: component.footprint,
    mpnCandidates: component.mpnCandidates,
    manufacturerCandidates: component.manufacturerCandidates,
    requestedSections: [
      'pin-description',
      'recommended-operating-conditions',
      'absolute-maximum-ratings',
      ...(component.footprint ? ['package-information' as const] : []),
    ],
    searchQueries: dedupeStrings([
      `${candidate} datasheet pdf`,
      `${candidate} pinout`,
      component.libraryId ? `${component.libraryId} datasheet` : undefined,
      component.footprint ? `${component.footprint} datasheet` : undefined,
    ]),
    reviewQuestions: [
      `${component.reference}는 v3 파서에서 unresolved였지만 KiCad import fallback으로 보존된 부품입니다. 데이터시트 기준 핀아웃과 풋프린트를 먼저 확인해 주세요.`,
      `${component.reference}의 전원/신호 핀 연결이 실제 부품 핀 설명과 맞는지 확인해 주세요.`,
    ],
  };
}

function mergeFallbackImportedComponents(
  payload: DatasheetReviewInputPayload,
  document: ModuMakeProjectData
): DatasheetReviewInputPayload {
  const existingIds = new Set(payload.components.map(component => component.instanceId));
  const missingComponents = document.components
    .filter(component => !existingIds.has(component.instanceId))
    .filter(isReportableFallbackComponent)
    .map(buildFallbackComponentInput);

  if (missingComponents.length === 0) {
    return payload;
  }

  return {
    ...payload,
    components: [...payload.components, ...missingComponents],
    extractionPlan: {
      ...payload.extractionPlan,
      targets: [
        ...payload.extractionPlan.targets,
        ...missingComponents.map(buildFallbackExtractionTarget),
      ],
    },
  };
}

export function buildImportedSchematicIntegratedValidationJson(
  params: BuildImportedSchematicIntegratedValidationJsonParams
): DatasheetReviewInputPayload | null {
  try {
    const { document, importedSource, importSummary } = params;
    const unifiedModel = parseKiCadSchematicToUnifiedCircuitModel(importedSource, {
      projectName: document.projectName,
    });
    const board = getBoardById(document.activeBoardId);

    const payload = buildIntegratedValidationJson({
      unifiedModel,
      boardId: document.activeBoardId,
      boardName: board.name,
      logicVoltage: board.logicVoltage,
      boardPinNames: Object.keys(document.pins),
      sourceKind: 'kicad_import',
      sourceCode: document.generatedCode,
      auditIssues: [],
      formalReport: undefined,
      importedComponentCount: importSummary?.importedComponentCount ?? document.components.length,
      importedConnectionCount:
        importSummary?.importedConnectionCount ??
        document.importedSchematicScene?.wireSegments.length ??
        0,
      generatedCustomComponentCount: document.customComponentPackages?.length ?? 0,
    });

    return mergeFallbackImportedComponents(payload, document);
  } catch {
    return null;
  }
}
