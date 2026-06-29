import { parseKiCadSchAst } from '@/lib/v3-kicad-parser';
import { buildSchematicDomainModel } from '@/lib/v3-kicad-parser';
import { SchematicConnectivitySolver } from '@/lib/v3-kicad-parser';
import { childForms, stringAt, type SExprNode } from '@/lib/s-expr-parser';
import type { InterpretationParsedRect, InterpretationParsedSchematic, InterpretationParsedSheet } from '@/lib/kicad-interpretation/contracts';

const PAPER_SIZES_MM: Record<string, { width: number; height: number }> = {
  A: { width: 279.4, height: 215.9 },
  A0: { width: 1189, height: 841 },
  A1: { width: 841, height: 594 },
  A2: { width: 594, height: 420 },
  A3: { width: 420, height: 297 },
  A4: { width: 297, height: 210 },
  A5: { width: 210, height: 148 },
  B: { width: 431.8, height: 279.4 },
  C: { width: 558.8, height: 431.8 },
  D: { width: 863.6, height: 558.8 },
  E: { width: 1117.6, height: 863.6 },
  USLetter: { width: 279.4, height: 215.9 },
  USLegal: { width: 355.6, height: 215.9 },
  USLedger: { width: 431.8, height: 279.4 },
};

function micronToMm(value: number): number {
  return Number((value / 1000).toFixed(3));
}

function pointToMmTuple(point: { x: number; y: number }): readonly [number, number] {
  return [micronToMm(point.x), micronToMm(point.y)];
}

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bboxFromPoints(points: ReadonlyArray<{ x: number; y: number }>): readonly [number, number, number, number] {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return [
    Number(Math.min(...xs).toFixed(3)),
    Number(Math.min(...ys).toFixed(3)),
    Number(Math.max(...xs).toFixed(3)),
    Number(Math.max(...ys).toFixed(3)),
  ];
}

function parseAtNode(node: SExprNode[] | undefined) {
  return {
    x: toNumber(stringAt(node, 1, '0')),
    y: toNumber(stringAt(node, 2, '0')),
  };
}

function extractRects(root: SExprNode[], parsedSymbols: InterpretationParsedSchematic['symbols']): InterpretationParsedRect[] {
  return childForms(root, 'rectangle').map((node, index) => {
    const startNode = childForms(node, 'start')[0];
    const endNode = childForms(node, 'end')[0];
    const start = { x: toNumber(stringAt(startNode, 1, '0')), y: toNumber(stringAt(startNode, 2, '0')) };
    const end = { x: toNumber(stringAt(endNode, 1, '0')), y: toNumber(stringAt(endNode, 2, '0')) };
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    const contained_entities = parsedSymbols
      .filter(symbol => {
        const [x, y] = symbol.position_mm;
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
      })
      .map(symbol => symbol.reference);

    return {
      id: `rect_${String(index + 1).padStart(4, '0')}`,
      bbox_mm: [minX, minY, maxX, maxY],
      contained_entities,
      nearby_labels: [],
    };
  });
}

function extractSheets(root: SExprNode[]): InterpretationParsedSheet[] {
  return childForms(root, 'sheet').map((node, index) => {
    const propertyName = childForms(node, 'property').find(property => stringAt(property, 1) === 'Sheet name');
    const propertyFile = childForms(node, 'property').find(property => stringAt(property, 1) === 'Sheet file');
    const at = parseAtNode(childForms(node, 'at')[0]);
    const sizeNode = childForms(node, 'size')[0];
    const width = toNumber(stringAt(sizeNode, 1, '0'));
    const height = toNumber(stringAt(sizeNode, 2, '0'));

    return {
      id: `sheet_${index + 1}`,
      sheet_name: stringAt(propertyName, 2) || undefined,
      sheet_file: stringAt(propertyFile, 2, ''),
      bbox_mm: [at.x, at.y, at.x + width, at.y + height],
      sheet_pins: childForms(node, 'pin').map(pinNode => {
        const pinAt = parseAtNode(childForms(pinNode, 'at')[0]);
        return {
          name: stringAt(pinNode, 1, ''),
          position_mm: [pinAt.x, pinAt.y] as const,
          direction: stringAt(pinNode, 2) || undefined,
        };
      }),
      nearby_labels: [],
    };
  });
}

function extractPageSettings(root: SExprNode[]) {
  const paperNode = childForms(root, 'paper')[0];
  const rawPaper = stringAt(paperNode, 1, 'A4') || 'A4';
  const orientationToken = stringAt(paperNode, 2, '').toLowerCase();
  const orientation = orientationToken === 'portrait' ? 'portrait' : 'landscape';
  const baseSize = PAPER_SIZES_MM[rawPaper] ?? PAPER_SIZES_MM.A4;
  const width_mm = orientation === 'portrait'
    ? Math.min(baseSize.width, baseSize.height)
    : Math.max(baseSize.width, baseSize.height);
  const height_mm = orientation === 'portrait'
    ? Math.max(baseSize.width, baseSize.height)
    : Math.min(baseSize.width, baseSize.height);

  return {
    paper: rawPaper,
    width_mm: Number(width_mm.toFixed(3)),
    height_mm: Number(height_mm.toFixed(3)),
    orientation,
  } as const;
}

export function adaptKiCadSourceToInterpretationParsed(source: string, schematicFile: string): InterpretationParsedSchematic {
  const { root } = parseKiCadSchAst(source);
  const model = buildSchematicDomainModel(root);
  const nets = SchematicConnectivitySolver.resolveNets(model);

  const symbols: InterpretationParsedSchematic['symbols'] = model.symbols.map(symbol => {
    const position_mm = pointToMmTuple(symbol.position);
    const pinPointsMm = symbol.pins.map(pin => ({
      x: micronToMm(pin.absoluteAnchor.x),
      y: micronToMm(pin.absoluteAnchor.y),
    }));

    return {
      id: symbol.uuid,
      reference: symbol.reference,
      value: symbol.value,
      footprint: symbol.footprint,
      lib_id: symbol.libId,
      position_mm,
      rotation_deg: symbol.rotation,
      mirror: symbol.mirrorX && symbol.mirrorY ? 'xy' : symbol.mirrorX ? 'x' : symbol.mirrorY ? 'y' : false,
      bbox_mm: pinPointsMm.length > 0 ? bboxFromPoints(pinPointsMm) : undefined,
      pins: symbol.pins.map(pin => ({
        number: pin.number,
        name: pin.name,
        electrical_type: pin.electricalType,
        position_mm: pointToMmTuple(pin.absoluteAnchor),
      })),
    };
  });

  return {
    schematic_file: schematicFile,
    source_model: model,
    kicad_version: stringAt(childForms(root, 'version')[0], 1) || undefined,
    page_settings: extractPageSettings(root),
    symbols,
    nets: nets.map(net => ({
      name: net.primaryLabel ?? net.netId,
      connected_pins: net.members.map(pin => [pin.reference, pin.pinNumber] as const),
    })),
    wires: model.wires.map(wire => ({
      start_mm: pointToMmTuple(wire.start),
      end_mm: pointToMmTuple(wire.end),
    })),
    labels: model.labels.map(label => ({
      label_type: label.kind,
      text: label.text,
      position_mm: pointToMmTuple(label.position),
    })),
    rects: extractRects(root, symbols),
    sheets: extractSheets(root),
    cross_sheet_links: [],
    warnings: model.unresolvedSymbols.map(symbol => `Unresolved symbol: ${symbol.reference ?? symbol.libId}`),
    errors: [],
  };
}
