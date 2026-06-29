export interface KernelNetSpec {
  id: string;
  knownVoltage: number | null;
}

export interface KernelResistorSpec {
  netA: string;
  netB: string;
  resistanceOhms: number;
}

export interface KernelDiodeSpec {
  netA: string;
  netK: string;
  forwardVoltageDrop?: number;
  saturationCurrent?: number;
  emissionCoefficient?: number;
  thermalVoltage?: number;
}

export interface KernelSolveResult {
  voltages: Map<string, number>;
  converged: boolean;
  iterations: number;
  mode: 'linear' | 'nonlinear';
}

const DEFAULT_DIODE_MODEL = {
  saturationCurrent: 2e-9,
  emissionCoefficient: 1.9,
  thermalVoltage: 0.02585,
};
const DEFAULT_DIODE_FORWARD_GUESS = 0.68;
const DEFAULT_PWL_DIODE_ON_CONDUCTANCE = 1000;
const DEFAULT_PWL_DIODE_OFF_CONDUCTANCE = 1e-9;

function clampExpArgument(value: number) {
  if (value > 40) {
    return 40;
  }

  if (value < -40) {
    return -40;
  }

  return value;
}

function solveResistiveGuess(
  nets: KernelNetSpec[],
  resistors: KernelResistorSpec[]
) {
  const connectedNetIds = new Set<string>();

  for (const resistor of resistors) {
    connectedNetIds.add(resistor.netA);
    connectedNetIds.add(resistor.netB);
  }

  const unknownNetIds = nets
    .filter(net => connectedNetIds.has(net.id) && net.knownVoltage == null)
    .map(net => net.id);

  if (unknownNetIds.length === 0) {
    return new Map<string, number>();
  }

  const netMap = new Map(nets.map(net => [net.id, net]));
  const indexByNetId = new Map(unknownNetIds.map((netId, index) => [netId, index]));
  const matrix = unknownNetIds.map(() => new Array(unknownNetIds.length).fill(0));
  const rhs = new Array(unknownNetIds.length).fill(0);

  for (const resistor of resistors) {
    if (resistor.netA === resistor.netB || resistor.resistanceOhms <= 0) {
      continue;
    }

    const conductance = 1 / resistor.resistanceOhms;
    const aIndex = indexByNetId.get(resistor.netA);
    const bIndex = indexByNetId.get(resistor.netB);
    const netA = netMap.get(resistor.netA);
    const netB = netMap.get(resistor.netB);

    if (typeof aIndex === 'number') {
      matrix[aIndex][aIndex] += conductance;
      if (typeof bIndex === 'number') {
        matrix[aIndex][bIndex] -= conductance;
      } else if (typeof netB?.knownVoltage === 'number') {
        rhs[aIndex] += conductance * netB.knownVoltage;
      }
    }

    if (typeof bIndex === 'number') {
      matrix[bIndex][bIndex] += conductance;
      if (typeof aIndex === 'number') {
        matrix[bIndex][aIndex] -= conductance;
      } else if (typeof netA?.knownVoltage === 'number') {
        rhs[bIndex] += conductance * netA.knownVoltage;
      }
    }
  }

  const solution = solveLinearSystem(matrix, rhs);
  if (!solution) {
    return null;
  }

  return new Map(unknownNetIds.map((netId, index) => [netId, solution[index]]));
}

export function solveLinearSystem(matrix: number[][], rhs: number[]) {
  const size = rhs.length;
  if (size === 0) {
    return [] as number[];
  }

  const a = matrix.map(row => [...row]);
  const b = [...rhs];

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
        maxRow = row;
      }
    }

    if (Math.abs(a[maxRow][pivot]) < 1e-12) {
      return null;
    }

    if (maxRow !== pivot) {
      [a[pivot], a[maxRow]] = [a[maxRow], a[pivot]];
      [b[pivot], b[maxRow]] = [b[maxRow], b[pivot]];
    }

    for (let row = pivot + 1; row < size; row += 1) {
      const factor = a[row][pivot] / a[pivot][pivot];
      if (!Number.isFinite(factor)) {
        return null;
      }

      for (let col = pivot; col < size; col += 1) {
        a[row][col] -= factor * a[pivot][col];
      }
      b[row] -= factor * b[pivot];
    }
  }

  const solution = new Array(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = 0;
    for (let col = row + 1; col < size; col += 1) {
      sum += a[row][col] * solution[col];
    }
    if (Math.abs(a[row][row]) < 1e-12) {
      return null;
    }
    solution[row] = (b[row] - sum) / a[row][row];
  }

  return solution;
}

export function solveDcNetwork(params: {
  nets: KernelNetSpec[];
  resistors: KernelResistorSpec[];
  diodes?: KernelDiodeSpec[];
  maxIterations?: number;
  tolerance?: number;
}): KernelSolveResult | null {
  const { nets, resistors, diodes = [], maxIterations = 40, tolerance = 1e-7 } = params;
  const unknownNetIds = nets.filter(net => net.knownVoltage == null).map(net => net.id);

  if (unknownNetIds.length === 0) {
    return {
      voltages: new Map(),
      converged: true,
      iterations: 0,
      mode: diodes.length > 0 ? 'nonlinear' : 'linear',
    };
  }

  if (diodes.length === 0) {
    const guess = solveResistiveGuess(nets, resistors);
    if (!guess) {
      return null;
    }

    return {
      voltages: guess,
      converged: true,
      iterations: 1,
      mode: 'linear',
    };
  }

  const knownVoltages = new Map(
    nets
      .filter(net => typeof net.knownVoltage === 'number')
      .map(net => [net.id, net.knownVoltage as number])
  );
  const guess = solveResistiveGuess(nets, resistors);
  const averageKnownVoltage =
    knownVoltages.size > 0
      ? Array.from(knownVoltages.values()).reduce((sum, value) => sum + value, 0) / knownVoltages.size
      : 0;
  const diodeGuessByNet = new Map<string, number[]>();

  const pushDiodeGuess = (netId: string, voltage: number) => {
    const currentGuesses = diodeGuessByNet.get(netId) ?? [];
    currentGuesses.push(voltage);
    diodeGuessByNet.set(netId, currentGuesses);
  };

  for (const diode of diodes) {
    const anodeKnown = knownVoltages.get(diode.netA);
    const cathodeKnown = knownVoltages.get(diode.netK);
    const forwardGuess = diode.forwardVoltageDrop ?? DEFAULT_DIODE_FORWARD_GUESS;

    if (typeof cathodeKnown === 'number' && !knownVoltages.has(diode.netA)) {
      pushDiodeGuess(diode.netA, cathodeKnown + forwardGuess);
    }

    if (typeof anodeKnown === 'number' && !knownVoltages.has(diode.netK)) {
      pushDiodeGuess(diode.netK, anodeKnown - forwardGuess);
    }
  }

  const indexByNetId = new Map(unknownNetIds.map((netId, index) => [netId, index]));
  let current = unknownNetIds.map(netId => {
    const diodeGuesses = diodeGuessByNet.get(netId);
    if (diodeGuesses && diodeGuesses.length > 0) {
      return diodeGuesses.reduce((sum, value) => sum + value, 0) / diodeGuesses.length;
    }

    return guess?.get(netId) ?? averageKnownVoltage;
  });

  const readVoltage = (netId: string, vector: number[]) => {
    const index = indexByNetId.get(netId);
    if (typeof index === 'number') {
      return vector[index];
    }

    return knownVoltages.get(netId) ?? 0;
  };

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const jacobian = unknownNetIds.map(() => new Array(unknownNetIds.length).fill(0));
    const residual = new Array(unknownNetIds.length).fill(0);

    const stampBranch = (netA: string, netB: string, currentAB: number, conductance: number) => {
      const aIndex = indexByNetId.get(netA);
      const bIndex = indexByNetId.get(netB);

      if (typeof aIndex === 'number') {
        residual[aIndex] += currentAB;
        jacobian[aIndex][aIndex] += conductance;
        if (typeof bIndex === 'number') {
          jacobian[aIndex][bIndex] -= conductance;
        }
      }

      if (typeof bIndex === 'number') {
        residual[bIndex] -= currentAB;
        if (typeof aIndex === 'number') {
          jacobian[bIndex][aIndex] -= conductance;
        }
        jacobian[bIndex][bIndex] += conductance;
      }
    };

    for (const resistor of resistors) {
      if (resistor.netA === resistor.netB || resistor.resistanceOhms <= 0) {
        continue;
      }

      const voltageA = readVoltage(resistor.netA, current);
      const voltageB = readVoltage(resistor.netB, current);
      const conductance = 1 / resistor.resistanceOhms;
      const branchCurrent = conductance * (voltageA - voltageB);

      stampBranch(resistor.netA, resistor.netB, branchCurrent, conductance);
    }

    for (const diode of diodes) {
      if (diode.netA === diode.netK) {
        continue;
      }

      const voltageA = readVoltage(diode.netA, current);
      const voltageK = readVoltage(diode.netK, current);

      if (typeof diode.forwardVoltageDrop === 'number') {
        const voltageDelta = voltageA - voltageK;
        const conductance =
          voltageDelta >= diode.forwardVoltageDrop
            ? DEFAULT_PWL_DIODE_ON_CONDUCTANCE
            : DEFAULT_PWL_DIODE_OFF_CONDUCTANCE;
        const branchCurrent =
          voltageDelta >= diode.forwardVoltageDrop
            ? conductance * (voltageDelta - diode.forwardVoltageDrop)
            : conductance * voltageDelta;

        stampBranch(diode.netA, diode.netK, branchCurrent, conductance);
        continue;
      }

      const thermalBase =
        (diode.emissionCoefficient ?? DEFAULT_DIODE_MODEL.emissionCoefficient) *
        (diode.thermalVoltage ?? DEFAULT_DIODE_MODEL.thermalVoltage);
      const saturationCurrent = diode.saturationCurrent ?? DEFAULT_DIODE_MODEL.saturationCurrent;
      const exponent = Math.exp(clampExpArgument((voltageA - voltageK) / thermalBase));
      const branchCurrent = saturationCurrent * (exponent - 1);
      const conductance = (saturationCurrent / thermalBase) * exponent;

      stampBranch(diode.netA, diode.netK, branchCurrent, conductance);
    }

    const delta = solveLinearSystem(
      jacobian,
      residual.map(value => -value)
    );

    if (!delta) {
      return null;
    }

    current = current.map((value, index) => value + delta[index]);
    const largestStep = delta.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

    if (largestStep < tolerance) {
      return {
        voltages: new Map(unknownNetIds.map((netId, index) => [netId, current[index]])),
        converged: true,
        iterations: iteration + 1,
        mode: 'nonlinear',
      };
    }
  }

  return {
    voltages: new Map(unknownNetIds.map((netId, index) => [netId, current[index]])),
    converged: false,
    iterations: maxIterations,
    mode: 'nonlinear',
  };
}
