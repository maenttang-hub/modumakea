const GROUND_NET_LABELS = new Set(['GND', 'AGND', 'DGND', 'PGND', 'GNDPWR', 'GNDREF', 'VSS', 'VSSA']);
const POWER_NET_LABELS = new Set([
  'VCC',
  'VDD',
  'VDDA',
  'VDDD',
  'AVCC',
  'AVDD',
  'VIN',
  'VAA',
  'VPP',
  'VBUS',
  'VDC',
  'VBAT',
  'VUSB',
  'VSYS',
  'VDRIVE',
  'BATT',
  'VREF',
  'VREF+',
  'VREF-',
  'VREFH',
  'VREFL',
]);

export function normalizeNetLabelToken(name: string) {
  return name.trim().toUpperCase().replace(/\s+/g, '').replace(/^\+/, '');
}

export function canonicalizePowerNetLabel(name: string) {
  const normalized = normalizeNetLabelToken(name);
  if (!normalized) {
    return '';
  }

  if (normalized === '3V3' || normalized === '3.3V' || normalized === '3.30V') {
    return '3.3V';
  }

  const embeddedDecimalVoltage = normalized.match(/^(\d+)V(\d+)$/);
  if (embeddedDecimalVoltage) {
    return `${embeddedDecimalVoltage[1]}.${embeddedDecimalVoltage[2]}V`;
  }

  const voltage = normalized.match(/^(\d+(?:\.\d+)?)V$/);
  if (voltage) {
    const numeric = Number(voltage[1]);
    return Number.isFinite(numeric) ? `${Number.isInteger(numeric) ? numeric.toFixed(0) : String(numeric)}V` : normalized;
  }

  if (normalized === 'VDD' || normalized === 'VCC') {
    return 'VCC';
  }

  return normalized;
}

export function canonicalizeJoinableNetLabel(name: string) {
  const normalized = normalizeNetLabelToken(name);
  if (!normalized) {
    return '';
  }

  if (isPowerLikeNetLabel(normalized)) {
    return canonicalizePowerNetLabel(normalized);
  }

  return normalized;
}

export function isGroundLikeNetLabel(name: string) {
  const normalized = normalizeNetLabelToken(name);
  return GROUND_NET_LABELS.has(normalized) || normalized.includes('GNDPWR');
}

export function isPowerLikeNetLabel(name: string) {
  const normalized = normalizeNetLabelToken(name);
  return POWER_NET_LABELS.has(normalized) || /^(\d+(?:\.\d+)?V|\d+V\d+)$/.test(normalized);
}

export function expandPowerNetAliases(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return [];
  }

  const aliases = [trimmed];
  const canonical = canonicalizePowerNetLabel(trimmed);
  if (canonical && canonical !== trimmed.toUpperCase()) {
    aliases.push(canonical);
  }
  return aliases;
}

export function parseVoltageFromPowerNetLabel(name: string) {
  const canonical = canonicalizePowerNetLabel(name);
  const embeddedDecimalVoltage = normalizeNetLabelToken(canonical).match(/^(\d+)V(\d+)$/);
  if (embeddedDecimalVoltage) {
    return Number(`${embeddedDecimalVoltage[1]}.${embeddedDecimalVoltage[2]}`);
  }

  const voltage = canonical.match(/^(\d+(?:\.\d+)?)V$/);
  if (!voltage) {
    return undefined;
  }

  const value = Number(voltage[1]);
  return Number.isFinite(value) ? value : undefined;
}

type PinLike = {
  connectedNetIds: string[];
  netLabels: string[];
};

export function summarizeComponentNetLabels(pins: PinLike[]) {
  const distinctNetIds = new Set(
    pins.flatMap(pin => pin.connectedNetIds).map(netId => netId.trim()).filter(Boolean)
  );

  if (distinctNetIds.size !== 1) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const pin of pins) {
    for (const rawLabel of pin.netLabels) {
      const label = rawLabel.trim().replace(/\s+/g, ' ');
      if (!label) {
        continue;
      }
      const key = label.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(label);
    }
  }

  return result;
}
