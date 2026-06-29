import type {
  ComponentTemplate,
  FootprintPinPadOverrideCacheEntry,
  PlacedComponent,
} from '@/types';

export type FootprintMatcherStatus = 'ok' | 'warning' | 'error';

export interface FootprintMatcherPin {
  id: string;
  label: string;
  role: string;
  number?: string;
}

export interface FootprintMatcherPad {
  id: string;
  label: string;
  side?: 'left' | 'right';
}

export interface FootprintMatcherLink {
  pinId: string;
  padId: string;
  label: string;
  status: FootprintMatcherStatus;
}

export interface FootprintMatcherModel {
  title: string;
  footprint: string;
  packageLabel: string;
  status: FootprintMatcherStatus;
  summary: string;
  pins: FootprintMatcherPin[];
  pads: FootprintMatcherPad[];
  links: FootprintMatcherLink[];
  mappingSource: 'default' | 'component' | 'cache';
  cacheKey?: string;
}

type PinoutRule = {
  title: string;
  expectedPinMap: Record<string, string>;
  templateIds: string[];
  hintPatterns: RegExp[];
  requiredRoles: string[];
};

const PINOUT_RULES: PinoutRule[] = [
  {
    title: '다이오드',
    expectedPinMap: { A: '2', K: '1' },
    templateIds: ['tpl_diode'],
    hintPatterns: [/\bdiode\b/i, /\bled\b/i, /\b1n\d+/i],
    requiredRoles: ['A', 'K'],
  },
  {
    title: 'BJT',
    expectedPinMap: { B: '1', C: '2', E: '3' },
    templateIds: ['tpl_transistor_npn'],
    hintPatterns: [/\btransistor\b/i, /\bbjt\b/i, /\b2n\d+/i, /\bbc\d+/i],
    requiredRoles: ['B', 'C', 'E'],
  },
  {
    title: 'MOSFET',
    expectedPinMap: { G: '1', D: '2', S: '3' },
    templateIds: ['tpl_mosfet', 'tpl_mosfet_n', 'tpl_mosfet_p'],
    hintPatterns: [/\bmosfet\b/i, /\bfet\b/i, /\bnmos\b/i, /\bpmos\b/i, /\birlz/i, /\birf/i],
    requiredRoles: ['G', 'D', 'S'],
  },
  {
    title: 'LDO/레귤레이터',
    expectedPinMap: { VIN: '1', GND: '2', VOUT: '3' },
    templateIds: ['tpl_ldo', 'tpl_ldo_regulator', 'tpl_regulator', 'tpl_linear_regulator'],
    hintPatterns: [/\bldo\b/i, /\bregulator\b/i, /\bams1117\b/i, /\b1117\b/i, /\b7805\b/i, /\b78m\d+/i, /\b78l\d+/i, /\blm78/i],
    requiredRoles: ['VIN', 'GND', 'VOUT'],
  },
  {
    title: '드라이버 IC',
    expectedPinMap: { IN: '1', GND: '8', VCC: '9', OUT: '16' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [/\buln2003\b/i, /\bdriver\b/i],
    requiredRoles: ['IN', 'GND', 'VCC', 'OUT'],
  },
  {
    title: 'OP-Amp 버퍼',
    expectedPinMap: { OUT: '1', IN: '3', GND: '4', VCC: '8' },
    templateIds: ['tpl_op_amp_buffer'],
    hintPatterns: [/\blm358\b/i, /\bopamp\b/i, /\bop-amp\b/i, /\bbuffer\b/i],
    requiredRoles: ['IN', 'OUT', 'GND', 'VCC'],
  },
];

function normalizeRole(value: string) {
  const normalized = value
    .trim()
    .replace(/^~\{?/, '')
    .replace(/\}?$/, '')
    .replace(/[\s_\-\/()+]/g, '')
    .toUpperCase();

  switch (normalized) {
    case 'ANODE':
      return 'A';
    case 'CATHODE':
    case 'KATHODE':
      return 'K';
    case 'BASE':
      return 'B';
    case 'COLLECTOR':
      return 'C';
    case 'EMITTER':
      return 'E';
    case 'GATE':
      return 'G';
    case 'DRAIN':
      return 'D';
    case 'SOURCE':
      return 'S';
    case 'VI':
    case 'VIN':
      return 'VIN';
    case 'VO':
    case 'VOUT':
      return 'VOUT';
    case 'INPUT':
      return 'IN';
    case 'OUTPUT':
      return 'OUT';
    case 'GROUND':
    case 'PGND':
    case 'DGND':
    case 'AGND':
      return 'GND';
    default:
      return normalized;
  }
}

function inferRule(component: PlacedComponent, template?: ComponentTemplate) {
  const effectiveTemplateIds = new Set(
    [component.templateId, component.importedMapping?.templateId]
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value))
  );

  for (const rule of PINOUT_RULES) {
    if (rule.templateIds.some(templateId => effectiveTemplateIds.has(templateId))) {
      return rule;
    }
  }

  const roles = new Set(
    (component.importedGeometry?.pinAnchors ?? []).flatMap(anchor => [
      normalizeRole(anchor.pinId),
      normalizeRole(anchor.label),
    ]).filter(Boolean)
  );
  const hintText = [
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ].filter(Boolean).join(' ');

  for (const rule of PINOUT_RULES) {
    if (rule.requiredRoles.every(role => roles.has(role)) && rule.hintPatterns.some(pattern => pattern.test(hintText))) {
      return rule;
    }
  }

  if (template?.category === 'COMMUNICATION' && (component.importedGeometry?.pinAnchors.length ?? 0) > 0) {
    return {
      title: '커넥터',
      expectedPinMap: {},
      templateIds: [],
      hintPatterns: [],
      requiredRoles: [],
    };
  }

  return null;
}

function inferPackageLabel(footprint: string) {
  const normalized = footprint.toUpperCase();
  if (normalized.includes('SOT-23')) return 'SOT-23';
  if (normalized.includes('SOT-223')) return 'SOT-223';
  if (normalized.includes('TO-220')) return 'TO-220';
  if (normalized.includes('TO-92')) return 'TO-92';
  if (normalized.includes('DO-35')) return 'DO-35';
  if (normalized.includes('DO-41')) return 'DO-41';
  if (normalized.includes('CONN_02X02')) return '2x2 Connector';
  if (normalized.includes('CONN_01X')) {
    const match = normalized.match(/CONN_01X(\d+)/);
    return match ? `1x${match[1]} Connector` : '1xN Connector';
  }
  return footprint.split(':').pop() ?? footprint;
}

function normalizeFootprintCacheToken(value?: string) {
  return (value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function buildRoleSignature(pins: FootprintMatcherPin[]) {
  return [...pins]
    .map(pin => `${normalizeRole(pin.role || pin.label)}:${pin.number ?? pin.id}`)
    .sort()
    .join('|');
}

function buildPads(footprint: string, pinCount: number) {
  const normalized = footprint.toUpperCase();

  if (normalized.includes('CONN_02X02')) {
    return [
      { id: '1', label: 'Pad 1', side: 'left' as const },
      { id: '2', label: 'Pad 2', side: 'left' as const },
      { id: '3', label: 'Pad 3', side: 'right' as const },
      { id: '4', label: 'Pad 4', side: 'right' as const },
    ];
  }

  if (normalized.includes('CONN_01X')) {
    const match = normalized.match(/CONN_01X(\d+)/);
    const count = match ? Number.parseInt(match[1] ?? `${pinCount}`, 10) : pinCount;
    return Array.from({ length: Math.max(count, pinCount) }, (_, index) => ({
      id: `${index + 1}`,
      label: `Pad ${index + 1}`,
    }));
  }

  if (normalized.includes('SOT-223')) {
    return [
      { id: '1', label: 'Pad 1', side: 'left' as const },
      { id: '2', label: 'Pad 2', side: 'left' as const },
      { id: '3', label: 'Pad 3', side: 'left' as const },
    ];
  }

  return Array.from({ length: Math.max(pinCount, 2) }, (_, index) => ({
    id: `${index + 1}`,
    label: `Pad ${index + 1}`,
  }));
}

function sortPins(pins: FootprintMatcherPin[]) {
  return [...pins].sort((left, right) => {
    const leftNumber = Number.parseInt(left.number ?? left.id, 10);
    const rightNumber = Number.parseInt(right.number ?? right.id, 10);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }
    return left.label.localeCompare(right.label);
  });
}

function resolveTargetPadId(
  component: PlacedComponent,
  pin: FootprintMatcherPin,
  index: number,
  effectiveOverrides?: Record<string, string>
) {
  const overridePadId = effectiveOverrides?.[pin.id] ?? component.footprintPinPadOverrides?.[pin.id];
  if (overridePadId) {
    return overridePadId;
  }

  return pin.number || `${index + 1}`;
}

export function buildFootprintPinPadCacheKey(
  component: PlacedComponent,
  template: ComponentTemplate | undefined,
  pins: FootprintMatcherPin[],
  footprint: string
) {
  const rule = inferRule(component, template);
  if (!rule || !footprint || pins.length === 0) {
    return null;
  }

  const footprintToken = normalizeFootprintCacheToken(footprint);
  const templateToken = normalizeFootprintCacheToken(component.templateId || template?.id);
  const libraryToken = normalizeFootprintCacheToken(component.importedMapping?.libraryId);
  const roleSignature = buildRoleSignature(pins);

  return [
    `rule:${rule.title}`,
    `fp:${footprintToken}`,
    `tpl:${templateToken || 'UNKNOWN'}`,
    `lib:${libraryToken || 'UNKNOWN'}`,
    `roles:${roleSignature}`,
  ].join('::');
}

export function resolveFootprintPinPadOverrideCacheEntry(
  component: PlacedComponent,
  template: ComponentTemplate | undefined,
  pins: FootprintMatcherPin[],
  footprint: string,
  cache?: Record<string, FootprintPinPadOverrideCacheEntry>
) {
  const cacheKey = buildFootprintPinPadCacheKey(component, template, pins, footprint);
  if (!cacheKey || !cache) {
    return { cacheKey, cacheEntry: undefined };
  }

  return {
    cacheKey,
    cacheEntry: cache[cacheKey],
  };
}

export function buildFootprintMatcherModel(
  component: PlacedComponent,
  template?: ComponentTemplate,
  cache?: Record<string, FootprintPinPadOverrideCacheEntry>
): FootprintMatcherModel | null {
  const footprint =
    component.importedMapping?.footprint?.trim() ||
    template?.pcb?.footprint?.trim() ||
    '';
  const anchors = component.importedGeometry?.pinAnchors ?? [];
  const requiredPins = template?.requiredPins ?? [];

  if (!footprint && anchors.length === 0 && requiredPins.length === 0) {
    return null;
  }

  const pins = sortPins(
    anchors.length > 0
      ? anchors.map(anchor => ({
          id: anchor.pinId,
          label: anchor.label || anchor.pinId,
          role: normalizeRole(anchor.pinId || anchor.label || anchor.number),
          number: anchor.number,
        }))
      : requiredPins.map((pin, index) => ({
          id: pin.name,
          label: pin.name,
          role: normalizeRole(pin.name),
          number: `${index + 1}`,
        }))
  );

  const rule = inferRule(component, template);
  const pads = buildPads(footprint || 'Unknown', pins.length);
  const expectedPinMap = rule?.expectedPinMap ?? {};
  const { cacheKey, cacheEntry } = resolveFootprintPinPadOverrideCacheEntry(
    component,
    template,
    pins,
    footprint,
    cache
  );
  const effectiveOverrides = {
    ...(cacheEntry?.pinPadMap ?? {}),
    ...(component.footprintPinPadOverrides ?? {}),
  };
  const mappingSource =
    Object.keys(component.footprintPinPadOverrides ?? {}).length > 0
      ? 'component'
      : cacheEntry
        ? 'cache'
        : 'default';

  const links = pins.map((pin, index) => {
    const targetPadId = resolveTargetPadId(component, pin, index, effectiveOverrides);
    const targetPad = pads.find(pad => pad.id === targetPadId) ?? pads[index] ?? pads[0];
    const expectedPadId = pin.role ? expectedPinMap[pin.role] : undefined;
    const isMismatch = Boolean(targetPad && expectedPadId && targetPad.id !== expectedPadId);
    return {
      pinId: pin.id,
      padId: targetPad?.id ?? `${index + 1}`,
      label: pin.role || pin.label,
      status: isMismatch ? 'error' as const : 'ok' as const,
    };
  });

  const mismatchLines = links
    .filter(link => link.status === 'error')
    .map(link => {
      const pin = pins.find(item => item.id === link.pinId);
      const expectedPadId = expectedPinMap[link.label];
      return `${link.label}: 심볼 ${pin?.number ?? '?'} -> 패드 ${expectedPadId ?? link.padId}`;
    });

  const status: FootprintMatcherStatus =
    mismatchLines.length > 0 ? 'error' :
    footprint ? 'ok' :
    'warning';

  return {
    title: rule?.title ?? '핀-패드 매칭',
    footprint: footprint || '알 수 없는 풋프린트',
    packageLabel: inferPackageLabel(footprint || 'Unknown'),
    status,
    summary:
      mismatchLines.length > 0
        ? mismatchLines.join(', ')
        : footprint
          ? '심볼 핀 번호와 예상 패드 번호가 크게 어긋나지 않습니다.'
          : '풋프린트 정보가 없어 일반 패드 배열 기준으로만 보여줍니다.',
    pins,
    pads,
    links,
    mappingSource,
    cacheKey: cacheKey ?? undefined,
  };
}
