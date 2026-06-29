import { solveDcNetwork, solveLinearSystem } from '@/lib/engine-kernel';

export type SpiceAnalysisMode = 'op' | 'dc' | 'tran' | 'ac';

export interface SpiceRunOptions {
  analysis?: SpiceAnalysisMode;
  start?: number;
  stop?: number;
  step?: number;
  pointCount?: number;
  onProgress?: (percent: number) => void;
}

export interface SpiceTracePoint {
  x: number;
  y: number;
}

export interface SpiceTrace {
  label: string;
  points: SpiceTracePoint[];
}

export interface SpiceResult {
  backend: 'fallback-solver';
  analysis: SpiceAnalysisMode;
  nodeVoltages: Record<string, number>;
  traces: SpiceTrace[];
  warnings: string[];
  fidelity: 'preview-grade' | 'solver-grade';
  model: 'linear-dc-with-pwl-preview' | 'transient-companion-preview';
}

type ParsedSpiceNetlist = {
  nets: Array<{ id: string; knownVoltage: number | null }>;
  resistors: Array<{ netA: string; netB: string; resistanceOhms: number }>;
  capacitors: Array<{ netA: string; netB: string; capacitanceFarads: number }>;
  diodes: Array<{ netA: string; netK: string; forwardVoltageDrop?: number }>;
};

export class SpiceSimulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpiceSimulationError';
  }
}

function parseSpiceNumber(raw: string) {
  const trimmed = raw.trim();
  const normalized = trimmed.toLowerCase();
  const suffixMap: Array<[string, number]> = [
    ['meg', 1_000_000],
    ['k', 1_000],
    ['m', 0.001],
    ['u', 0.000001],
    ['n', 0.000000001],
    ['p', 0.000000000001],
  ];

  for (const [suffix, multiplier] of suffixMap) {
    if (normalized.endsWith(suffix)) {
      const base = Number.parseFloat(normalized.slice(0, -suffix.length));
      if (!Number.isFinite(base)) {
        throw new SpiceSimulationError(`Invalid SPICE numeric value: ${raw}`);
      }
      return base * multiplier;
    }
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) {
    throw new SpiceSimulationError(`Invalid SPICE numeric value: ${raw}`);
  }

  return value;
}

function parseNetlist(netlist: string): ParsedSpiceNetlist {
  const nets = new Map<string, { id: string; knownVoltage: number | null }>();
  const resistors: ParsedSpiceNetlist['resistors'] = [];
  const capacitors: ParsedSpiceNetlist['capacitors'] = [];
  const diodes: ParsedSpiceNetlist['diodes'] = [];

  const ensureNet = (id: string) => {
    if (!nets.has(id)) {
      nets.set(id, { id, knownVoltage: id === '0' ? 0 : null });
    }
    return nets.get(id)!;
  };

  for (const rawLine of netlist.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('*') || line.startsWith('.')) {
      continue;
    }

    const parts = line.split(/\s+/);
    const designator = parts[0]?.toUpperCase();
    if (!designator) {
      continue;
    }

    if (designator.startsWith('V') && parts.length >= 4) {
      const nodeA = parts[1];
      const nodeB = parts[2];
      const valueToken = parts.at(-1) ?? '0';
      const value = parseSpiceNumber(valueToken);
      ensureNet(nodeA);
      ensureNet(nodeB);
      if (nodeB === '0') {
        ensureNet(nodeA).knownVoltage = value;
      } else if (nodeA === '0') {
        ensureNet(nodeB).knownVoltage = -value;
      }
      continue;
    }

    if (designator.startsWith('R') && parts.length >= 4) {
      const nodeA = parts[1];
      const nodeB = parts[2];
      ensureNet(nodeA);
      ensureNet(nodeB);
      resistors.push({
        netA: nodeA,
        netB: nodeB,
        resistanceOhms: parseSpiceNumber(parts[3]),
      });
      continue;
    }

    if (designator.startsWith('C') && parts.length >= 4) {
      const nodeA = parts[1];
      const nodeB = parts[2];
      ensureNet(nodeA);
      ensureNet(nodeB);
      capacitors.push({
        netA: nodeA,
        netB: nodeB,
        capacitanceFarads: parseSpiceNumber(parts[3]),
      });
      continue;
    }

    if (designator.startsWith('D') && parts.length >= 4) {
      const nodeA = parts[1];
      const nodeK = parts[2];
      const model = (parts[3] ?? '').toUpperCase();
      ensureNet(nodeA);
      ensureNet(nodeK);
      diodes.push({
        netA: nodeA,
        netK: nodeK,
        forwardVoltageDrop: model.includes('LED') ? 2 : 0.7,
      });
    }
  }

  return {
    nets: Array.from(nets.values()),
    resistors,
    capacitors,
    diodes,
  };
}

function buildVoltageSeed(
  nets: ParsedSpiceNetlist['nets'],
  solved?: ReturnType<typeof solveDcNetwork> | null
) {
  const map = new Map<string, number>();

  for (const net of nets) {
    if (typeof net.knownVoltage === 'number') {
      map.set(net.id, net.knownVoltage);
      continue;
    }

    map.set(net.id, solved?.voltages.get(net.id) ?? 0);
  }

  return map;
}

function solveTransientStep(
  parsed: ParsedSpiceNetlist,
  previousVoltages: Map<string, number>,
  deltaTime: number
) {
  const unknownNetIds = parsed.nets.filter(net => net.knownVoltage == null).map(net => net.id);
  const knownVoltages = new Map(
    parsed.nets
      .filter(net => typeof net.knownVoltage === 'number')
      .map(net => [net.id, net.knownVoltage as number])
  );

  if (unknownNetIds.length === 0) {
    return new Map<string, number>();
  }

  const indexByNetId = new Map(unknownNetIds.map((netId, index) => [netId, index]));
  let current = unknownNetIds.map(netId => previousVoltages.get(netId) ?? 0);

  const readVoltage = (netId: string, vector: number[]) => {
    const index = indexByNetId.get(netId);
    if (typeof index === 'number') {
      return vector[index];
    }

    return knownVoltages.get(netId) ?? previousVoltages.get(netId) ?? 0;
  };

  const stampBranch = (
    matrix: number[][],
    rhs: number[],
    netA: string,
    netB: string,
    conductance: number,
    offsetVoltage = 0
  ) => {
    const aIndex = indexByNetId.get(netA);
    const bIndex = indexByNetId.get(netB);
    const knownA = knownVoltages.get(netA);
    const knownB = knownVoltages.get(netB);

    if (typeof aIndex === 'number') {
      matrix[aIndex][aIndex] += conductance;
      rhs[aIndex] += conductance * offsetVoltage;
      if (typeof bIndex === 'number') {
        matrix[aIndex][bIndex] -= conductance;
      } else if (typeof knownB === 'number') {
        rhs[aIndex] += conductance * knownB;
      }
    }

    if (typeof bIndex === 'number') {
      matrix[bIndex][bIndex] += conductance;
      rhs[bIndex] -= conductance * offsetVoltage;
      if (typeof aIndex === 'number') {
        matrix[bIndex][aIndex] -= conductance;
      } else if (typeof knownA === 'number') {
        rhs[bIndex] += conductance * knownA;
      }
    }
  };

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const matrix = unknownNetIds.map(() => new Array(unknownNetIds.length).fill(0));
    const rhs = new Array(unknownNetIds.length).fill(0);

    for (const resistor of parsed.resistors) {
      if (resistor.resistanceOhms <= 0 || resistor.netA === resistor.netB) {
        continue;
      }

      stampBranch(matrix, rhs, resistor.netA, resistor.netB, 1 / resistor.resistanceOhms, 0);
    }

    if (deltaTime > 0) {
      for (const capacitor of parsed.capacitors) {
        if (capacitor.capacitanceFarads <= 0 || capacitor.netA === capacitor.netB) {
          continue;
        }

        const conductance = capacitor.capacitanceFarads / deltaTime;
        const previousDelta =
          (previousVoltages.get(capacitor.netA) ?? knownVoltages.get(capacitor.netA) ?? 0) -
          (previousVoltages.get(capacitor.netB) ?? knownVoltages.get(capacitor.netB) ?? 0);
        stampBranch(matrix, rhs, capacitor.netA, capacitor.netB, conductance, previousDelta);
      }
    }

    for (const diode of parsed.diodes) {
      if (diode.netA === diode.netK) {
        continue;
      }

      const voltageDelta = readVoltage(diode.netA, current) - readVoltage(diode.netK, current);
      const forwardDrop = diode.forwardVoltageDrop ?? 0.7;
      const conductance = voltageDelta >= forwardDrop ? 1000 : 1e-9;
      const offset = voltageDelta >= forwardDrop ? forwardDrop : 0;
      stampBranch(matrix, rhs, diode.netA, diode.netK, conductance, offset);
    }

    const solved = solveLinearSystem(matrix, rhs);
    if (!solved) {
      return null;
    }

    const largestStep = solved.reduce(
      (max, value, index) => Math.max(max, Math.abs(value - current[index])),
      0
    );
    current = solved;

    if (largestStep < 1e-6) {
      break;
    }
  }

  return new Map(unknownNetIds.map((netId, index) => [netId, current[index]]));
}

function buildTransientTraceSamples(
  parsed: ParsedSpiceNetlist,
  solved: ReturnType<typeof solveDcNetwork> | null,
  options: SpiceRunOptions
) {
  const start = options.start ?? 0;
  const stop = options.stop ?? 1;
  const pointCount = Math.max(options.pointCount ?? 32, 2);
  const deltaTime = (stop - start) / (pointCount - 1 || 1);
  const seeds = buildVoltageSeed(parsed.nets, solved);
  const tracesByNode = new Map<string, SpiceTracePoint[]>();

  for (const net of parsed.nets) {
    tracesByNode.set(net.id, []);
  }

  let previousVoltages = new Map<string, number>(
    parsed.nets.map(net => [net.id, typeof net.knownVoltage === 'number' ? net.knownVoltage : 0])
  );

  for (let index = 0; index < pointCount; index += 1) {
    const x = start + deltaTime * index;
    const stepSolved =
      index === 0
        ? previousVoltages
        : solveTransientStep(parsed, previousVoltages, deltaTime) ?? previousVoltages;

    for (const net of parsed.nets) {
      const value =
        typeof net.knownVoltage === 'number'
          ? net.knownVoltage
          : stepSolved.get(net.id) ?? seeds.get(net.id) ?? 0;
      tracesByNode.get(net.id)?.push({ x, y: value });
    }

    previousVoltages = new Map(
      parsed.nets.map(net => [
        net.id,
        typeof net.knownVoltage === 'number'
          ? net.knownVoltage
          : stepSolved.get(net.id) ?? previousVoltages.get(net.id) ?? 0,
      ])
    );
  }

  return Array.from(tracesByNode.entries()).map(([label, points]) => ({ label, points }));
}

function buildTraceSamples(nodeVoltages: Record<string, number>, options: SpiceRunOptions, analysis: SpiceAnalysisMode) {
  const traces: SpiceTrace[] = [];

  if (analysis === 'op' || analysis === 'dc') {
    return Object.entries(nodeVoltages).map(([node, voltage]) => ({
      label: node,
      points: [{ x: 0, y: voltage }],
    }));
  }

  const start = options.start ?? 0;
  const stop = options.stop ?? (analysis === 'ac' ? 1_000 : 1);
  const pointCount = Math.max(options.pointCount ?? 16, 2);
  const step = options.step ?? (stop - start) / (pointCount - 1);

  for (const [node, voltage] of Object.entries(nodeVoltages)) {
    const points: SpiceTracePoint[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      points.push({
        x: start + step * index,
        y: voltage,
      });
    }
    traces.push({ label: node, points });
  }

  return traces;
}

export async function runSpice(netlist: string, options: SpiceRunOptions = {}): Promise<SpiceResult> {
  try {
    options.onProgress?.(10);
    const analysis = options.analysis ?? 'op';
    const parsed = parseNetlist(netlist);
    options.onProgress?.(45);
    const solved = solveDcNetwork({
      nets: parsed.nets,
      resistors: parsed.resistors,
      diodes: parsed.diodes,
    });
    options.onProgress?.(85);

    if (!solved) {
      throw new SpiceSimulationError('The fallback simulator could not solve the supplied netlist.');
    }

    const nodeVoltages: Record<string, number> = {};
    for (const [node, voltage] of solved.voltages.entries()) {
      nodeVoltages[node] = voltage;
    }

    const traces =
      analysis === 'tran' && parsed.capacitors.length > 0
        ? buildTransientTraceSamples(parsed, solved, options)
        : buildTraceSamples(nodeVoltages, options, analysis);

    return {
      backend: 'fallback-solver',
      analysis,
      nodeVoltages,
      traces,
      fidelity: analysis === 'op' || analysis === 'dc' ? 'solver-grade' : 'preview-grade',
      model:
        analysis === 'tran' && parsed.capacitors.length > 0
          ? 'transient-companion-preview'
          : 'linear-dc-with-pwl-preview',
      warnings: analysis === 'ac' || analysis === 'tran'
        ? [
            parsed.capacitors.length > 0 && analysis === 'tran'
              ? 'Using the lightweight fallback simulator. Transient capacitor traces use a piecewise-linear companion model.'
              : 'Using the lightweight fallback simulator. Time/frequency traces are currently DC-derived previews.',
          ]
        : [],
    };
  } catch (error) {
    if (error instanceof SpiceSimulationError) {
      throw error;
    }

    throw new SpiceSimulationError(
      error instanceof Error ? error.message : 'Unknown SPICE simulation failure.'
    );
  } finally {
    options.onProgress?.(100);
  }
}
