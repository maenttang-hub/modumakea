import type {
  CoarseRegion,
  GeometryMatchResult,
  PatternCandidate,
  PatternMatchResult,
  InterpretationParsedSchematic,
} from '@/lib/kicad-interpretation/contracts';

const PATTERN_ORDER: ReadonlyArray<PatternCandidate['pattern_name']> = [
  'SPI_ISP_HEADER',
  'UART_HEADER',
  'I2C_BUS',
  'POWER_BLOCK',
  'MCU_CORE_CLUSTER',
  'PASSIVE_DECOUPLING_GROUP',
  'GENERIC_CONNECTOR_BLOCK',
];

function uniqueUpper(values: ReadonlyArray<string>) {
  return Array.from(new Set(values.map(value => value.trim().toUpperCase()).filter(Boolean)));
}

function countMatches(values: ReadonlyArray<string>, pattern: RegExp) {
  return values.filter(value => pattern.test(value)).length;
}

function scoreByCoverage(
  present: ReadonlyArray<string>,
  required: ReadonlyArray<string>,
  optional: ReadonlyArray<string> = []
) {
  const requiredHits = required.filter(item => present.includes(item)).length;
  const optionalHits = optional.filter(item => present.includes(item)).length;
  if (required.length === 0) {
    return 0;
  }
  const requiredScore = requiredHits / required.length;
  const optionalScore = optional.length > 0 ? optionalHits / optional.length : 0;
  return Math.min(1, requiredScore * 0.85 + optionalScore * 0.15);
}

function scoreConnectorLike(params: {
  signalNames: ReadonlyArray<string>;
  regionTexts: ReadonlyArray<string>;
  shapeTags: ReadonlyArray<string>;
  mechanicalLike: boolean;
}) {
  if (params.mechanicalLike) {
    return 0;
  }

  const genericSignals = params.signalNames.filter(name =>
    /^(D\d+|A\d+|GPIO\d+|SDA|SCL|MISO|MOSI|SCK|RX|TX|VCC|VIN|GND|3V3|5V|RESET)$/.test(name)
  ).length;
  const connectorHints = countMatches(params.regionTexts, /(CONNECTOR|HEADER|TERMINAL|CONN_|SCREW_TERMINAL|PIN_[1-9]|J\d+)/);
  const shapeHint = params.shapeTags.includes('CONNECTOR_CLUSTER') ? 1 : 0;
  const signalScore = params.signalNames.length > 0 ? Math.min(1, genericSignals / Math.max(2, params.signalNames.length)) : 0;
  const connectorScore = Math.min(1, connectorHints / 4);
  return Math.min(1, signalScore * 0.45 + connectorScore * 0.45 + shapeHint * 0.1);
}

function scoreMcuLike(signalNames: ReadonlyArray<string>) {
  const explicitMcuMarkers = signalNames.filter(name =>
    /(MCU|STM32|ATMEGA|ATSAMD|ESP32|ESP8266|NRF52|RP2040|PIC16|PIC18|PROCESSOR|MICROCONTROLLER)/.test(name)
  ).length;
  const ioSignals = signalNames.filter(name =>
    /^(GPIO\d+|IO\d+|PA\d+|PB\d+|PC\d+|PD\d+|PE\d+|PF\d+|PG\d+|PH\d+|PI\d+|D\d+|A\d+|ADC\d+|PWM\d+)$/.test(name)
  ).length;

  if (explicitMcuMarkers === 0) {
    return 0;
  }

  const explicitScore = Math.min(1, explicitMcuMarkers / 2);
  const ioScore = Math.min(1, ioSignals / 6);
  return Math.min(1, explicitScore * 0.8 + ioScore * 0.2);
}

function scorePowerLike(params: {
  signalNames: ReadonlyArray<string>;
  regionTexts: ReadonlyArray<string>;
  passiveLike: boolean;
  mechanicalLike: boolean;
}) {
  if (params.mechanicalLike) {
    return 0;
  }

  const railHits = params.signalNames.filter(name => /^(VCC|GND|VIN|VBAT|3V3|5V|12V|24V)$/.test(name)).length;
  const powerPartHints = countMatches(params.regionTexts, /(LDO|REGULATOR|BUCK|BOOST|TVS|SRV|ESD|ZENER|SCHOTTKY|LED|FUSE|VBAT|VIN|\+5V|\+3V3)/);
  const hasPowerCore = params.signalNames.includes('VCC') && params.signalNames.includes('GND');
  if (!hasPowerCore && powerPartHints === 0) {
    return 0;
  }

  const railScore = Math.min(1, railHits / 4);
  const partScore = Math.min(1, powerPartHints / 4);
  const passivePenalty = params.passiveLike ? 0.1 : 0;
  return Math.max(0, Math.min(1, railScore * 0.55 + partScore * 0.45 - passivePenalty));
}

function scorePassiveDecouplingLike(params: {
  signalNames: ReadonlyArray<string>;
  regionTexts: ReadonlyArray<string>;
  shapeTags: ReadonlyArray<string>;
  powerScore: number;
}) {
  const passiveRefs = countMatches(params.regionTexts, /^(R|C|L)\d+$/);
  const passiveParts = countMatches(params.regionTexts, /^(R|C|L|CAPACITOR|INDUCTOR|RESISTOR|CP)$/);
  const passiveShape = params.shapeTags.includes('PASSIVE_GROUP') ? 1 : 0;
  if (params.powerScore <= 0 && passiveRefs + passiveParts === 0) {
    return 0;
  }

  return Math.min(1, params.powerScore * 0.35 + Math.min(1, passiveRefs / 6) * 0.35 + Math.min(1, passiveParts / 4) * 0.2 + passiveShape * 0.1);
}

function collectRegionSignalNames(params: {
  region: CoarseRegion;
  geometryMatch: GeometryMatchResult | undefined;
  parsed: InterpretationParsedSchematic;
}) {
  const directTexts = params.region.ocr_like_texts;
  const nearbyTexts = params.geometryMatch?.nearby_labels ?? [];
  const signalTexts = [...directTexts, ...nearbyTexts];

  if (params.geometryMatch?.matched_entity_type === 'sheet' && params.geometryMatch.matched_entity_id) {
    const sheet = params.parsed.sheets.find(candidate => candidate.id === params.geometryMatch?.matched_entity_id);
    if (sheet) {
      signalTexts.push(...sheet.sheet_pins.map(pin => pin.name));
    }
  }

  return uniqueUpper(signalTexts);
}

function scoreRegionPatterns(params: {
  region: CoarseRegion;
  signalNames: ReadonlyArray<string>;
}): PatternCandidate[] {
  const regionTexts = uniqueUpper([
    ...params.region.ocr_like_texts,
    ...(params.region.sub_candidates ?? []),
    ...params.region.observed_shape_tags,
    params.region.freeform_observation ?? '',
  ]);
  const shapeTags = uniqueUpper(params.region.observed_shape_tags);
  const mechanicalLike = regionTexts.some(value => /(MOUNTINGHOLE|MOUNTING_HOLE|MECHANICAL|HOLE)/.test(value));
  const passiveLike = shapeTags.includes('PASSIVE_GROUP') || countMatches(regionTexts, /^(R|C|L)\d+$|^(R|C|L|CP)$/) >= 3;
  const powerScore = scorePowerLike({
    signalNames: params.signalNames,
    regionTexts,
    passiveLike,
    mechanicalLike,
  });
  const passiveScore = scorePassiveDecouplingLike({
    signalNames: params.signalNames,
    regionTexts,
    shapeTags,
    powerScore,
  });
  const candidates: PatternCandidate[] = [
    {
      pattern_name: 'SPI_ISP_HEADER',
      score: scoreByCoverage(params.signalNames, ['MISO', 'MOSI', 'SCK'], ['RESET', 'VCC', 'GND', '5V', '3V3']),
    },
    {
      pattern_name: 'UART_HEADER',
      score: scoreByCoverage(params.signalNames, ['RX', 'TX'], ['GND', 'VCC', '5V', '3V3']),
    },
    {
      pattern_name: 'I2C_BUS',
      score: scoreByCoverage(params.signalNames, ['SDA', 'SCL'], ['GND', 'VCC', '5V', '3V3']),
    },
    {
      pattern_name: 'POWER_BLOCK',
      score: powerScore,
    },
    {
      pattern_name: 'MCU_CORE_CLUSTER',
      score: scoreMcuLike(params.signalNames),
    },
    {
      pattern_name: 'PASSIVE_DECOUPLING_GROUP',
      score: passiveScore,
    },
    {
      pattern_name: 'GENERIC_CONNECTOR_BLOCK',
      score: scoreConnectorLike({
        signalNames: params.signalNames,
        regionTexts,
        shapeTags,
        mechanicalLike,
      }),
    },
  ];

  return candidates
    .sort((left, right) => right.score - left.score || PATTERN_ORDER.indexOf(left.pattern_name) - PATTERN_ORDER.indexOf(right.pattern_name))
    .map(candidate => ({
      ...candidate,
      score: Number(candidate.score.toFixed(6)),
    }));
}

export function matchRegionsByPattern(params: {
  parsed: InterpretationParsedSchematic;
  regions: ReadonlyArray<CoarseRegion>;
  geometryMatches: ReadonlyArray<GeometryMatchResult>;
}): PatternMatchResult[] {
  return params.regions.map(region => {
    const geometryMatch = params.geometryMatches.find(candidate => candidate.region_id === region.region_id);
    const signalNames = collectRegionSignalNames({
      region,
      geometryMatch,
      parsed: params.parsed,
    });

    return {
      region_id: region.region_id,
      pattern_candidates: scoreRegionPatterns({
        region,
        signalNames,
      }),
    };
  });
}
