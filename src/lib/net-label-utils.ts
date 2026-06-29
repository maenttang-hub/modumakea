function normalizeLabelToken(name: string) {
  return name.trim().toUpperCase().replace(/\s+/g, '').replace(/^\+/, '');
}

export function canonicalizeJoinableNetLabel(name: string) {
  const normalized = normalizeLabelToken(name);
  if (!normalized) {
    return '';
  }

  if (normalized === '3V3' || normalized === '3.3V') {
    return '3.3V';
  }

  if (normalized === '5.0V' || normalized === '5V') {
    return '5V';
  }

  if (normalized === '12.0V' || normalized === '12V') {
    return '12V';
  }

  if (normalized === 'VDD' || normalized === 'VCC') {
    return 'VCC';
  }

  return normalized;
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
