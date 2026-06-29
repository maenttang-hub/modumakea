import { sanitizePlainText } from '@/lib/security-input';
import {
  childForms,
  collectNestedForms,
  parseKiCadSExpression,
  stringAt,
  type SExprNode,
} from '@/lib/s-expr-parser';
import type {
  ComponentCategory,
  CustomComponentPackage,
  PinType,
  RequiredPin,
} from '@/types';

export { parseKiCadSExpression } from '@/lib/s-expr-parser';

export interface ParsedKiCadSymbolPin {
  number: string;
  name: string;
  electricalType: string;
  side: 'left' | 'right';
}

export interface ParsedKiCadSymbol {
  name: string;
  displayName: string;
  referencePrefix: string;
  footprint?: string;
  description?: string;
  pins: ParsedKiCadSymbolPin[];
}

function isList(value: SExprNode): value is SExprNode[] {
  return Array.isArray(value);
}

function inferPinSide(pinNode: SExprNode[]) {
  const at = childForms(pinNode, 'at')[0];
  const x = Number(stringAt(at, 1, '0'));
  const angle = Number(stringAt(at, 3, '0'));

  if (Number.isFinite(x) && x !== 0) {
    return x < 0 ? 'left' : 'right';
  }

  return angle === 180 ? 'right' : 'left';
}

function extractPin(pinNode: SExprNode[]): ParsedKiCadSymbolPin | null {
  const electricalType = stringAt(pinNode, 1);
  const nameNode = childForms(pinNode, 'name')[0];
  const numberNode = childForms(pinNode, 'number')[0];
  const name = stringAt(nameNode, 1);
  const number = stringAt(numberNode, 1);

  if (!name || !number) {
    return null;
  }

  return {
    electricalType,
    number,
    name,
    side: inferPinSide(pinNode),
  };
}

function inferAllowedTypes(pin: ParsedKiCadSymbolPin): PinType[] {
  const normalizedName = pin.name.toLowerCase();
  const normalizedType = pin.electricalType.toLowerCase();

  if (normalizedName.includes('gnd') || normalizedName.includes('ground')) {
    return ['GND'];
  }

  if (
    normalizedType.includes('power') ||
    normalizedName.includes('vcc') ||
    normalizedName.includes('vin') ||
    normalizedName.includes('3.3v') ||
    normalizedName.includes('5v')
  ) {
    return ['POWER'];
  }

  if (normalizedType === 'output') {
    return ['DIGITAL'];
  }

  if (normalizedType === 'input') {
    return ['DIGITAL', 'ANALOG'];
  }

  if (normalizedType === 'passive' && normalizedName.includes('a')) {
    return ['ANALOG'];
  }

  return ['DIGITAL', 'PWM'];
}

function inferCategory(symbol: ParsedKiCadSymbol): ComponentCategory {
  const name = symbol.displayName.toLowerCase();
  if (/led|relay|servo|buzzer|motor|switch|button/.test(name)) {
    return /button|switch/.test(name) ? 'PASSIVE' : 'ACTUATOR';
  }
  if (/display|oled|lcd/.test(name)) {
    return 'DISPLAY';
  }
  if (/rfid|bluetooth|wifi|nrf|uart|spi|i2c|esp/.test(name)) {
    return 'COMMUNICATION';
  }
  if (/resistor|capacitor|inductor|diode|transistor/.test(name)) {
    return 'PASSIVE';
  }
  return 'SENSOR';
}

function normalizeTemplateId(name: string, prefix = 'kicad') {
  const raw = name.includes(':') ? name.split(':').pop() ?? name : name;
  return `${prefix}_${raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

export function extractKiCadSymbols(source: string): ParsedKiCadSymbol[] {
  const tree = parseKiCadSExpression(source);
  const root = tree.find(isList);
  if (!root || stringAt(root, 0) !== 'kicad_symbol_lib') {
    return [];
  }

  const symbols = childForms(root, 'symbol');
  return symbols.flatMap(symbolNode => {
    const symbolName = stringAt(symbolNode, 1);
    if (!symbolName) {
      return [];
    }

    const pinNodes = collectNestedForms(symbolNode, 'pin');
    const pins = pinNodes
      .map(extractPin)
      .filter((pin): pin is ParsedKiCadSymbolPin => Boolean(pin))
      .sort((left, right) => left.number.localeCompare(right.number, undefined, { numeric: true }));

    if (pins.length === 0) {
      return [];
    }

    const referenceProperty = childForms(symbolNode, 'property').find(property => stringAt(property, 1) === 'Reference');
    const footprintProperty = childForms(symbolNode, 'property').find(property => stringAt(property, 1) === 'Footprint');
    const descriptionProperty = childForms(symbolNode, 'property').find(property => stringAt(property, 1) === 'Description');
    const displayName = symbolName.includes(':') ? (symbolName.split(':').pop() ?? symbolName) : symbolName;

    return [{
      name: symbolName,
      displayName: sanitizePlainText(displayName, { maxLength: 80, fallback: displayName }),
      referencePrefix: stringAt(referenceProperty, 2, 'U') || 'U',
      footprint: stringAt(footprintProperty, 2) || undefined,
      description: stringAt(descriptionProperty, 2) || undefined,
      pins,
    }];
  });
}

export function kicadSymbolToCustomComponentPackage(
  symbol: ParsedKiCadSymbol,
  options: {
    templateIdPrefix?: string;
    category?: ComponentCategory;
    compatibleVoltage?: CustomComponentPackage['compatibleVoltage'];
  } = {}
): CustomComponentPackage {
  const requiredPins: RequiredPin[] = symbol.pins.map(pin => ({
    name: sanitizePlainText(pin.name, { maxLength: 48, fallback: pin.name }),
    allowedTypes: inferAllowedTypes(pin),
    preferredSide: pin.side,
  }));

  return {
    version: '1.0.0',
    templateId: normalizeTemplateId(symbol.name, options.templateIdPrefix ?? 'kicad'),
    name: symbol.displayName,
    category: options.category ?? inferCategory(symbol),
    description: symbol.description ?? `${symbol.displayName} imported from KiCad symbol library`,
    icon: 'Cpu',
    compatibleVoltage: options.compatibleVoltage ?? 'BOTH',
    requiredPins,
    schematic: {
      symbol: normalizeTemplateId(symbol.name, options.templateIdPrefix ?? 'kicad'),
      referencePrefix: sanitizePlainText(symbol.referencePrefix, { maxLength: 8, fallback: 'U' }) || 'U',
    },
  };
}

export function renderCustomComponentPackagesModule(packages: CustomComponentPackage[]) {
  const body = JSON.stringify(packages, null, 2);
  return [
    "import type { CustomComponentPackage } from '@/types';",
    '',
    '// Generated by scripts/kicad-sym-parser.mjs',
    `export const KICAD_IMPORTED_COMPONENT_PACKAGES: CustomComponentPackage[] = ${body};`,
    '',
  ].join('\n');
}
