import { childForms, collectNestedForms, stringAt, type SExprNode } from '@/lib/s-expr-parser';
import { sanitizePlainText } from '@/lib/security-input';

export type V3Point = { x: number; y: number };

export interface V3LibraryPin {
  number: string;
  name: string;
  electricalType: string;
  lengthMm: number;
  at: { x: number; y: number; angle: number };
}

export interface V3LibrarySymbol {
  libId: string;
  symbolName: string;
  referencePrefix: string;
  pins: V3LibraryPin[];
}

export interface V3SymbolInstance {
  instanceId: string;
  libId: string;
  reference: string;
  value?: string;
  footprint?: string;
  at: {
    x: number;
    y: number;
    rotation: 0 | 90 | 180 | 270;
    mirrorX: boolean;
    mirrorY: boolean;
  };
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAtNode(node: SExprNode[] | undefined) {
  return {
    x: toNumber(stringAt(node, 1, '0')),
    y: toNumber(stringAt(node, 2, '0')),
    angle: toNumber(stringAt(node, 3, '0')),
  };
}

function normalizeRotation(value: number): 0 | 90 | 180 | 270 {
  const rounded = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  if (rounded === 90 || rounded === 180 || rounded === 270) {
    return rounded;
  }
  return 0;
}

function parseLibraryPin(node: SExprNode[]): V3LibraryPin | null {
  const electricalType = stringAt(node, 1);
  const at = parseAtNode(childForms(node, 'at')[0]);
  const nameNode = childForms(node, 'name')[0];
  const numberNode = childForms(node, 'number')[0];
  const number = sanitizePlainText(stringAt(numberNode, 1), { maxLength: 40, fallback: '' });
  const name = sanitizePlainText(stringAt(nameNode, 1), { maxLength: 80, fallback: '' }) || number;

  if (!number) {
    return null;
  }

  return {
    number,
    name,
    electricalType: electricalType || 'unknown',
    lengthMm: toNumber(stringAt(childForms(node, 'length')[0], 1, '2.54'), 2.54),
    at,
  };
}

function parseLibrarySymbol(node: SExprNode[]): V3LibrarySymbol | null {
  const libId = sanitizePlainText(stringAt(node, 1), { maxLength: 200, fallback: '' });
  if (!libId) {
    return null;
  }

  const referenceProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Reference');
  const symbolName = libId.includes(':') ? libId.split(':').at(-1) ?? libId : libId;
  const referencePrefix = sanitizePlainText(stringAt(referenceProperty, 2), { maxLength: 40, fallback: 'U' }) || 'U';
  const pins = collectNestedForms(node, 'pin')
    .map(parseLibraryPin)
    .filter((pin): pin is V3LibraryPin => Boolean(pin));

  return {
    libId,
    symbolName,
    referencePrefix,
    pins,
  };
}

export function extractLibrarySymbols(root: SExprNode[]) {
  const libSymbolsNode = childForms(root, 'lib_symbols')[0];
  const symbols = new Map<string, V3LibrarySymbol>();

  if (!libSymbolsNode) {
    return symbols;
  }

  for (const child of childForms(libSymbolsNode, 'symbol')) {
    const parsed = parseLibrarySymbol(child);
    if (parsed) {
      symbols.set(parsed.libId, parsed);
    }
  }

  return symbols;
}

export function extractSymbolInstances(root: SExprNode[]) {
  const instances: V3SymbolInstance[] = [];

  for (const node of childForms(root, 'symbol')) {
      const libId = sanitizePlainText(stringAt(childForms(node, 'lib_id')[0], 1), { maxLength: 200, fallback: '' });
      if (!libId) {
        continue;
      }

      const at = parseAtNode(childForms(node, 'at')[0]);
      const mirrorNode = childForms(node, 'mirror')[0];
      const mirrorToken = stringAt(mirrorNode, 1, '').toLowerCase();
      const referenceProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Reference');
      const valueProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Value');
      const footprintProperty = childForms(node, 'property').find(property => stringAt(property, 1) === 'Footprint');

      instances.push({
        instanceId: sanitizePlainText(stringAt(childForms(node, 'uuid')[0], 1, libId), { maxLength: 120, fallback: libId }),
        libId,
        reference: sanitizePlainText(stringAt(referenceProperty, 2, libId), { maxLength: 80, fallback: libId }),
        value: sanitizePlainText(stringAt(valueProperty, 2, ''), { maxLength: 160, fallback: '' }) || undefined,
        footprint: sanitizePlainText(stringAt(footprintProperty, 2, ''), { maxLength: 200, fallback: '' }) || undefined,
        at: {
          x: at.x,
          y: at.y,
          rotation: normalizeRotation(at.angle),
          mirrorX: mirrorToken === 'x' || mirrorToken === 'xy',
          mirrorY: mirrorToken === 'y' || mirrorToken === 'xy',
        },
      });
  }

  return instances;
}
