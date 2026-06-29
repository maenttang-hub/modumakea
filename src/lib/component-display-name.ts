const EXACT_LABEL_MAP: Array<[RegExp, string]> = [
  [/^온습도 센서 Pro$/i, '온습Pro'],
  [/^온습도 센서$/i, '온습'],
  [/^SHT31 온습도 센서(?: \(I2C\))?$/i, 'SHT31'],
  [/^초음파 센서$/i, '초음파'],
  [/^토양 수분 센서$/i, '토양수분'],
  [/^조도 센서$/i, '조도'],
  [/^사운드 센서$/i, '사운드'],
  [/^가스 센서$/i, '가스'],
  [/^PIR 모션 센서$/i, 'PIR'],
  [/^적외선 수신 센서$/i, 'IR'],
  [/^OLED 디스플레이$/i, 'OLED'],
  [/^LCD 1602(?: \(I2C\))?$/i, 'LCD1602'],
  [/^7-세그먼트$/i, '7SEG'],
  [/^단색 LED$/i, 'LED'],
  [/^RGB LED$/i, 'RGB'],
  [/^LED$/i, 'LED'],
  [/^저항$/i, 'R'],
  [/^콘덴서$/i, 'C'],
  [/^커패시터$/i, 'C'],
  [/^인덕터$/i, 'L'],
  [/^다이오드$/i, 'D'],
  [/^트랜지스터$/i, 'Q'],
];

function splitInstanceSuffix(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const match = trimmed.match(/^(.*?)(?:\s+(\d+))$/);

  if (!match) {
    return { base: trimmed, suffix: '' };
  }

  return {
    base: match[1]?.trim() ?? trimmed,
    suffix: match[2] ?? '',
  };
}

function compactBaseName(base: string) {
  for (const [pattern, replacement] of EXACT_LABEL_MAP) {
    if (pattern.test(base)) {
      return replacement;
    }
  }

  return base
    .replace(/\s+(디스플레이|모듈)$/i, '')
    .replace(/\s+센서$/i, '')
    .replace(/\s+/g, '');
}

export function formatCanvasComponentName(
  name: string,
  options?: { maxLength?: number }
) {
  const { base, suffix } = splitInstanceSuffix(name);
  const compact = compactBaseName(base);
  const combined = `${compact}${suffix}`;

  if (!options?.maxLength || combined.length <= options.maxLength) {
    return combined;
  }

  return `${combined.slice(0, options.maxLength)}…`;
}
