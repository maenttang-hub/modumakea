import kicadMapper from '../constants/kicad-mapper.json' with { type: 'json' };
import { getBoardById, type BoardDefinition } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import { buildPcbDocument } from '@/lib/pcb-document';
import type {
  ComponentTemplate,
  ManualNetConnection,
  PcbPoint,
  PlacedComponent,
  RequiredPin,
} from '@/types';

export interface KiCadSchematicExportInput {
  projectName: string;
  activeBoardId: string;
  components: PlacedComponent[];
  manualConnections?: ManualNetConnection[];
}

export interface KiCadSchematicExportOptions {
  generator?: string;
  title?: string;
  projectToken?: string;
}

export interface KiCadExportMappingEntry {
  ownerType: 'board' | 'component';
  ownerId: string;
  name: string;
  templateId?: string;
  libraryId: string;
  footprint: string;
  mode: 'standard-symbol' | 'generic-connector-fallback';
  pinCount: number;
  reason?: string;
}

export interface KiCadExportSummary {
  board: KiCadExportMappingEntry;
  components: KiCadExportMappingEntry[];
  standardCount: number;
  fallbackCount: number;
}

interface KiCadComponentMapping {
  kicadLibrary: string;
  kicadSymbol: string;
  pinMap: Record<string, string>;
  referencePrefix?: string;
  footprint?: string;
}

interface KiCadMappingDictionary {
  boards: Record<string, KiCadComponentMapping>;
  templates: Record<string, KiCadComponentMapping>;
}

type KiCadPinSpec = {
  id: string;
  label: string;
  number: string;
  side: 'left' | 'right';
  kind: 'input' | 'output' | 'bidirectional' | 'passive' | 'power_in';
};

type KiCadSymbolShape = {
  width: number;
  height: number;
};

type KiCadLibrarySymbolMeta = {
  entry: string;
  pinNumbersById: Record<string, string>;
  libraryId: string;
};

const CANVAS_TO_MM = 0.18;
const PIN_LENGTH_MM = 2.54;
const PIN_PITCH_MM = 2.54;
const DEFAULT_FALLBACK_LIBRARY = 'Connector_Generic';
const DEFAULT_FALLBACK_REFERENCE = 'J';

const mappingDictionary = kicadMapper as KiCadMappingDictionary;

function sanitizeToken(value: string) {
  return value.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function sanitizeFilenameStem(value: string) {
  return (value || 'modumake_project')
    .trim()
    .replace(/[.<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'modumake_project';
}

function safeText(value: string) {
  return value.replace(/\r?\n/g, ' ').trim();
}

function quote(value: string) {
  return `"${safeText(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function fmt(value: number) {
  return Number(value.toFixed(3)).toString();
}

function scalePoint(point: PcbPoint) {
  return {
    x: Number((point.x * CANVAS_TO_MM).toFixed(3)),
    y: Number((point.y * CANVAS_TO_MM).toFixed(3)),
  };
}

function seededUuid(seed: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193;

  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    a ^= code;
    a = Math.imul(a, 0x01000193);
    b ^= code + index;
    b = Math.imul(b, 0x27d4eb2d);
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    const source = index % 2 === 0 ? a : b;
    bytes[index] = (source >>> ((index % 4) * 8)) & 0xff;
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function buildReference(basePrefix: string, currentCount: number) {
  return `${basePrefix}${currentCount + 1}`;
}

function inferPinKind(pin: RequiredPin): KiCadPinSpec['kind'] {
  if (pin.allowedTypes.includes('POWER') || pin.allowedTypes.includes('GND')) {
    return 'power_in';
  }
  if (pin.allowedTypes.includes('PWM') || pin.allowedTypes.includes('DIGITAL')) {
    return 'bidirectional';
  }
  if (pin.allowedTypes.includes('ANALOG')) {
    return 'input';
  }
  return 'passive';
}

function buildLibraryId(mapping: KiCadComponentMapping) {
  return `${mapping.kicadLibrary}:${mapping.kicadSymbol}`;
}

function buildBoardPinSpecs(board: BoardDefinition, mapping: KiCadComponentMapping): KiCadPinSpec[] {
  return [
    ...board.leftPins.map(pinId => ({
      id: pinId,
      label: pinId,
      number: mapping.pinMap[pinId] ?? pinId,
      side: 'left' as const,
      kind: pinId === 'GND' || pinId === '5V' || pinId === '3.3V' ? 'power_in' as const : 'bidirectional' as const,
    })),
    ...board.digitalPins.map(pinId => ({
      id: pinId,
      label: pinId,
      number: mapping.pinMap[pinId] ?? pinId,
      side: 'right' as const,
      kind: 'bidirectional' as const,
    })),
  ];
}

function buildComponentPinSpecs(template: ComponentTemplate, mapping: KiCadComponentMapping): KiCadPinSpec[] {
  const { leftPins, rightPins } = getComponentPinLayout(template.requiredPins, template.category);

  return [
    ...leftPins.map((pin, index) => ({
      id: pin.name,
      label: pin.name,
      number: mapping.pinMap[pin.name] ?? String(index + 1),
      side: 'left' as const,
      kind: inferPinKind(pin),
    })),
    ...rightPins.map((pin, index) => ({
      id: pin.name,
      label: pin.name,
      number: mapping.pinMap[pin.name] ?? String(leftPins.length + index + 1),
      side: 'right' as const,
      kind: inferPinKind(pin),
    })),
  ];
}

function buildFallbackMapping(template: ComponentTemplate): KiCadComponentMapping {
  const pinMap = template.requiredPins.reduce<Record<string, string>>((acc, pin, index) => {
    acc[pin.name] = String(index + 1);
    return acc;
  }, {});
  const pinCount = Math.max(template.requiredPins.length, 1);
  const paddedCount = pinCount < 10 ? `0${pinCount}` : String(pinCount);

  return {
    kicadLibrary: DEFAULT_FALLBACK_LIBRARY,
    kicadSymbol: `Conn_01x${paddedCount}_Male`,
    referencePrefix: DEFAULT_FALLBACK_REFERENCE,
    footprint: `Connector_PinHeader_2.54mm:PinHeader_1x${pinCount}_P2.54mm_Vertical`,
    pinMap,
  };
}

function isFallbackMapping(mapping: KiCadComponentMapping) {
  return mapping.kicadLibrary === DEFAULT_FALLBACK_LIBRARY && /^Conn_01x\d+_Male$/.test(mapping.kicadSymbol);
}

function resolveBoardMapping(boardId: string): KiCadComponentMapping {
  return mappingDictionary.boards[boardId] ?? {
    kicadLibrary: DEFAULT_FALLBACK_LIBRARY,
    kicadSymbol: 'Conn_01x20_Male',
    referencePrefix: 'J',
    footprint: 'Connector_PinHeader_2.54mm:PinHeader_1x20_P2.54mm_Vertical',
    pinMap: {},
  };
}

function resolveTemplateMapping(template: ComponentTemplate): KiCadComponentMapping {
  return mappingDictionary.templates[template.id] ?? buildFallbackMapping(template);
}

export function buildKiCadExportSummary(
  input: Pick<KiCadSchematicExportInput, 'activeBoardId' | 'components'>
): KiCadExportSummary {
  const board = getBoardById(input.activeBoardId);
  const boardMapping = resolveBoardMapping(board.id);
  const boardLibraryId = buildLibraryId(boardMapping);
  const boardEntry: KiCadExportMappingEntry = {
    ownerType: 'board',
    ownerId: board.id,
    name: board.name,
    libraryId: boardLibraryId,
    footprint: boardMapping.footprint ?? `Board:${board.id}_interface`,
    mode: 'standard-symbol',
    pinCount: [...new Set([...board.leftPins, ...board.digitalPins])].length,
    reason: 'kicad-mapper.json에 등록된 표준 보드 심볼 매핑을 사용합니다.',
  };

  const components = input.components.flatMap(component => {
    const template = getTemplateById(component.templateId);
    if (!template) {
      return [];
    }

    const mapping = resolveTemplateMapping(template);
    const fallback = isFallbackMapping(mapping);
    return [{
      ownerType: 'component' as const,
      ownerId: component.instanceId,
      name: component.name,
      templateId: template.id,
      libraryId: buildLibraryId(mapping),
      footprint: mapping.footprint ?? template.pcb?.footprint ?? `Module:${template.id.replace(/^tpl_/, '')}`,
      mode: fallback ? 'generic-connector-fallback' as const : 'standard-symbol' as const,
      pinCount: template.requiredPins.length,
      reason: fallback
        ? `kicad-mapper.json에 전용 심볼 매핑이 없어 ${template.requiredPins.length}핀 범용 커넥터로 대체합니다.`
        : 'kicad-mapper.json에 등록된 표준 부품 심볼 매핑을 사용합니다.',
    }];
  });

  const fallbackCount = components.filter(item => item.mode === 'generic-connector-fallback').length;

  return {
    board: boardEntry,
    components,
    standardCount: components.length - fallbackCount + 1,
    fallbackCount,
  };
}

function buildSymbolShape(pinSpecs: KiCadPinSpec[]) {
  const leftCount = pinSpecs.filter(pin => pin.side === 'left').length;
  const rightCount = pinSpecs.filter(pin => pin.side === 'right').length;
  const rows = Math.max(leftCount, rightCount, 2);

  return {
    width: 20.32,
    height: Math.max(10.16, (rows - 1) * PIN_PITCH_MM + 7.62),
  };
}

function buildPinYMap(pinSpecs: KiCadPinSpec[]) {
  const left = pinSpecs.filter(pin => pin.side === 'left');
  const right = pinSpecs.filter(pin => pin.side === 'right');
  const rows = Math.max(left.length, right.length, 2);
  const startY = ((rows - 1) * PIN_PITCH_MM) / -2;
  const yMap = new Map<string, number>();

  left.forEach((pin, index) => {
    yMap.set(`left:${pin.id}`, Number((startY + index * PIN_PITCH_MM).toFixed(3)));
  });
  right.forEach((pin, index) => {
    yMap.set(`right:${pin.id}`, Number((startY + index * PIN_PITCH_MM).toFixed(3)));
  });

  return yMap;
}

function buildPinDefinition(pin: KiCadPinSpec, shape: KiCadSymbolShape, yMap: Map<string, number>) {
  const y = yMap.get(`${pin.side}:${pin.id}`) ?? 0;
  const atX = pin.side === 'left'
    ? Number((-shape.width / 2 - PIN_LENGTH_MM).toFixed(3))
    : Number((shape.width / 2 + PIN_LENGTH_MM).toFixed(3));
  const angle = pin.side === 'left' ? 0 : 180;

  return [
    `      (pin ${pin.kind} line (at ${fmt(atX)} ${fmt(y)} ${angle}) (length ${fmt(PIN_LENGTH_MM)})`,
    `        (name ${quote(pin.label)} (effects (font (size 1.27 1.27))))`,
    `        (number ${quote(pin.number)} (effects (font (size 1.27 1.27))))`,
    '      )',
  ].join('\n');
}

function buildSymbolLibraryEntry(params: {
  mapping: KiCadComponentMapping;
  symbolName: string;
  footprint: string;
  pinSpecs: KiCadPinSpec[];
}): KiCadLibrarySymbolMeta {
  const libraryId = buildLibraryId(params.mapping);
  const shape = buildSymbolShape(params.pinSpecs);
  const yMap = buildPinYMap(params.pinSpecs);
  const bodyTop = Number((shape.height / 2).toFixed(3));
  const bodyBottom = Number((-shape.height / 2).toFixed(3));
  const bodyLeft = Number((-shape.width / 2).toFixed(3));
  const bodyRight = Number((shape.width / 2).toFixed(3));
  const childSymbolBase = sanitizeToken(params.mapping.kicadSymbol);
  const pinNumbersById = params.pinSpecs.reduce<Record<string, string>>((acc, pin) => {
    acc[pin.id] = pin.number;
    return acc;
  }, {});

  const pinBlocks = params.pinSpecs
    .map(pin => buildPinDefinition(pin, shape, yMap))
    .join('\n');

  return {
    libraryId,
    pinNumbersById,
    entry: [
      `  (symbol ${quote(libraryId)}`,
      '    (pin_numbers)',
      '    (pin_names',
      '      (offset 0)',
      '    )',
      '    (exclude_from_sim no)',
      '    (in_bom yes)',
      '    (on_board yes)',
      '    (in_pos_files yes)',
      '    (duplicate_pin_numbers_are_jumpers no)',
      `    (property "Reference" ${quote(params.mapping.referencePrefix ?? 'U')}`,
      `      (at 0 ${fmt(bodyTop + 3.81)} 0)`,
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      `    (property "Value" ${quote(params.symbolName)}`,
      `      (at 0 ${fmt(bodyBottom - 3.81)} 0)`,
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      `    (property "Footprint" ${quote(params.footprint)}`,
      `      (at 0 ${fmt(bodyBottom - 6.35)} 0)`,
      '      (hide yes)',
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      '    (property "Datasheet" ""',
      '      (at 0 0 0)',
      '      (hide yes)',
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      `    (symbol ${quote(`${childSymbolBase}_0_1`)}`,
      '      (rectangle',
      `        (start ${fmt(bodyLeft)} ${fmt(bodyTop)})`,
      `        (end ${fmt(bodyRight)} ${fmt(bodyBottom)})`,
      '        (stroke (width 0.254) (type default))',
      '        (fill (type background))',
      '      )',
      '    )',
      `    (symbol ${quote(`${childSymbolBase}_1_1`)}`,
      pinBlocks,
      '    )',
      '  )',
    ].join('\n'),
  };
}

function buildInstanceBlock(params: {
  libraryId: string;
  reference: string;
  value: string;
  footprint: string;
  at: PcbPoint;
  rotation: 0 | 90 | 180 | 270;
  seed: string;
  projectName: string;
  rootUuid: string;
  pinNumbersById?: Record<string, string>;
}) {
  const uuid = seededUuid(params.seed);
  const x = fmt(params.at.x);
  const y = fmt(params.at.y);
  const pinBlocks = Object.entries(params.pinNumbersById ?? {})
    .map(([pinId, pinNumber]) => `    (pin ${quote(pinNumber)} (uuid ${quote(seededUuid(`${params.seed}:pin:${pinId}`))}))`)
    .join('\n');

  return {
    symbolBlock: [
      '  (symbol',
      `    (lib_id ${quote(params.libraryId)})`,
      `    (at ${x} ${y} ${params.rotation})`,
      '    (unit 1)',
      '    (body_style 1)',
      '    (exclude_from_sim no)',
      '    (in_bom yes)',
      '    (on_board yes)',
      '    (in_pos_files yes)',
      '    (dnp no)',
      '    (fields_autoplaced yes)',
      `    (uuid ${quote(uuid)})`,
      `    (property "Reference" ${quote(params.reference)}`,
      `      (at ${x} ${fmt(params.at.y - 6.35)} 0)`,
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      `    (property "Value" ${quote(params.value)}`,
      `      (at ${x} ${fmt(params.at.y + 6.35)} 0)`,
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      `    (property "Footprint" ${quote(params.footprint)}`,
      `      (at ${x} ${fmt(params.at.y + 8.89)} 0)`,
      '      (hide yes)',
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      '    (property "Datasheet" ""',
      '      (at 0 0 0)',
      '      (hide yes)',
      '      (show_name no)',
      '      (do_not_autoplace no)',
      '      (effects',
      '        (font (size 1.27 1.27))',
      '      )',
      '    )',
      pinBlocks,
      '    (instances',
      `      (project ${quote(params.projectName)}`,
      `        (path ${quote(`/${params.rootUuid}`)}`,
      `          (reference ${quote(params.reference)})`,
      '          (unit 1)',
      '        )',
      '      )',
      '    )',
      '  )',
    ].filter(Boolean).join('\n'),
  };
}

function buildWireBlock(start: PcbPoint, end: PcbPoint, seed: string) {
  return [
    '  (wire',
    `    (pts (xy ${fmt(start.x)} ${fmt(start.y)}) (xy ${fmt(end.x)} ${fmt(end.y)}))`,
    '    (stroke (width 0) (type default))',
    `    (uuid ${quote(seededUuid(seed))})`,
    '  )',
  ].join('\n');
}

function buildJunctionBlock(point: PcbPoint, seed: string) {
  return `  (junction (at ${fmt(point.x)} ${fmt(point.y)}) (diameter 0) (color 0 0 0 0) (uuid ${quote(seededUuid(seed))}))`;
}

export function buildKiCadSchematic(
  input: KiCadSchematicExportInput,
  options: KiCadSchematicExportOptions = {}
) {
  const projectToken = sanitizeToken(options.projectToken ?? input.projectName ?? 'modumake');
  const generator = options.generator ?? 'ModuMake';
  const board = getBoardById(input.activeBoardId);
  const boardMapping = resolveBoardMapping(board.id);
  const pcbDocument = buildPcbDocument(
    input.components,
    input.activeBoardId,
    input.manualConnections ?? [],
    new Date().toISOString()
  );
  const rootUuid = seededUuid(`${projectToken}:root`);
  const projectName = input.projectName || 'ModuMake project';

  const libraryEntries: string[] = [];
  const instanceBlocks: string[] = [];
  const libraryPinMaps = new Map<string, Record<string, string>>();
  const referenceCounters = new Map<string, number>();

  const boardLibrary = buildSymbolLibraryEntry({
    mapping: boardMapping,
    symbolName: board.name,
    footprint: boardMapping.footprint ?? `Board:${board.id}_interface`,
    pinSpecs: buildBoardPinSpecs(board, boardMapping),
  });
  libraryEntries.push(boardLibrary.entry);
  libraryPinMaps.set(boardLibrary.libraryId, boardLibrary.pinNumbersById);

  const boardPlacement = pcbDocument.placements.find(placement => placement.ownerType === 'board');
  if (boardPlacement) {
    const boardCenter = scalePoint({
      x: boardPlacement.body.x + boardPlacement.body.width / 2,
      y: boardPlacement.body.y + boardPlacement.body.height / 2,
    });
    const boardRef = buildReference(boardMapping.referencePrefix ?? 'A', 0);
    const boardInstance = buildInstanceBlock({
      libraryId: boardLibrary.libraryId,
      reference: boardRef,
      value: board.name,
      footprint: boardMapping.footprint ?? `Board:${board.id}_interface`,
      at: boardCenter,
      rotation: 0,
      seed: `board:${board.id}`,
      projectName,
      rootUuid,
      pinNumbersById: libraryPinMaps.get(boardLibrary.libraryId),
    });
    instanceBlocks.push(boardInstance.symbolBlock);
  }

  const emittedTemplateIds = new Set<string>();
  for (const placement of pcbDocument.placements) {
    if (placement.ownerType !== 'component') {
      continue;
    }

    const template = getTemplateById(placement.templateId);
    if (!template) {
      continue;
    }

    const mapping = resolveTemplateMapping(template);
    const libraryId = buildLibraryId(mapping);

    if (!emittedTemplateIds.has(template.id)) {
      const library = buildSymbolLibraryEntry({
        mapping,
        symbolName: template.name,
        footprint: mapping.footprint ?? template.pcb?.footprint ?? placement.footprint,
        pinSpecs: buildComponentPinSpecs(template, mapping),
      });
      libraryEntries.push(library.entry);
      libraryPinMaps.set(libraryId, library.pinNumbersById);
      emittedTemplateIds.add(template.id);
    }

    const referencePrefix = mapping.referencePrefix ?? template.schematic?.referencePrefix ?? 'U';
    const count = referenceCounters.get(referencePrefix) ?? 0;
    const nextReference = buildReference(referencePrefix, count);
    referenceCounters.set(referencePrefix, count + 1);

    const center = scalePoint({
      x: placement.body.x + placement.body.width / 2,
      y: placement.body.y + placement.body.height / 2,
    });

    const instance = buildInstanceBlock({
      libraryId,
      reference: nextReference,
      value: placement.name,
      footprint: mapping.footprint ?? placement.footprint,
      at: center,
      rotation: placement.rotation,
      seed: `${placement.id}:${nextReference}`,
      projectName,
      rootUuid,
      pinNumbersById: libraryPinMaps.get(libraryId),
    });
    instanceBlocks.push(instance.symbolBlock);
  }

  const wireBlocks: string[] = [];
  const junctionPointCounts = new Map<string, number>();
  for (const trace of pcbDocument.traces) {
    const scaledPoints = trace.points.map(scalePoint);
    for (let index = 0; index < scaledPoints.length - 1; index += 1) {
      const start = scaledPoints[index];
      const end = scaledPoints[index + 1];
      wireBlocks.push(buildWireBlock(start, end, `${trace.id}:${index}`));

      const pointKeys = [start, end].map(point => `${fmt(point.x)}:${fmt(point.y)}`);
      pointKeys.forEach(key => {
        junctionPointCounts.set(key, (junctionPointCounts.get(key) ?? 0) + 1);
      });
    }
  }

  const junctionBlocks = Array.from(junctionPointCounts.entries())
    .filter(([, count]) => count > 2)
    .map(([key]) => {
      const [x, y] = key.split(':');
      return buildJunctionBlock({ x: Number(x), y: Number(y) }, `junction:${key}`);
    });

  const title = options.title ?? `${input.projectName || 'ModuMake project'} schematic export`;

  return [
    '(kicad_sch',
    '  (version 20260306)',
    `  (generator ${quote(generator)})`,
    '  (generator_version "1.0")',
    `  (uuid ${quote(rootUuid)})`,
    '  (paper "A4")',
    '  (title_block',
    `    (title ${quote(title)})`,
    '  )',
    '  (lib_symbols',
    libraryEntries.join('\n'),
    '  )',
    instanceBlocks.join('\n'),
    wireBlocks.join('\n'),
    junctionBlocks.join('\n'),
    '  (sheet_instances',
    '    (path "/"',
    '      (page "1")',
    '    )',
    '  )',
    '  (embedded_fonts no)',
    ')',
    '',
  ].join('\n');
}

export function buildKiCadSchematicFilename(projectName: string) {
  return `${sanitizeFilenameStem(projectName)}.kicad_sch`;
}
