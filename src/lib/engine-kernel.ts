import {
  callModuMakeKernelJsonMethod,
  getModuMakeKernelBackendLabel,
} from '@/lib/modumake-wasm-kernel';
import {
  solveDcNetwork as solveDcNetworkFallback,
  solveLinearSystem,
} from '@/lib/engine-kernel-core';

import type {
  KernelDiodeSpec,
  KernelNetSpec,
  KernelResistorSpec,
  KernelSolveResult,
} from '@/lib/engine-kernel-core';

export type {
  KernelDiodeSpec,
  KernelNetSpec,
  KernelResistorSpec,
  KernelSolveResult,
} from '@/lib/engine-kernel-core';

function deserializeSolveResult(raw: string): KernelSolveResult | null {
  const parsed = JSON.parse(raw) as
    | {
        voltages?: Array<[string, number]>;
        converged?: boolean;
        iterations?: number;
        mode?: 'linear' | 'nonlinear';
      }
    | null;

  if (!parsed) {
    return null;
  }

  return {
    voltages: new Map(parsed.voltages ?? []),
    converged: parsed.converged ?? false,
    iterations: parsed.iterations ?? 0,
    mode: parsed.mode ?? 'linear',
  };
}

export function getEngineKernelBackend() {
  return getModuMakeKernelBackendLabel();
}

export { solveLinearSystem };

export function solveDcNetwork(params: {
  nets: KernelNetSpec[];
  resistors: KernelResistorSpec[];
  diodes?: KernelDiodeSpec[];
  maxIterations?: number;
  tolerance?: number;
}): KernelSolveResult | null {
  const fallback = solveDcNetworkFallback(params);
  const rawResult = callModuMakeKernelJsonMethod(
    'solveDcNetworkJson',
    {
      ...params,
      diodes: params.diodes ?? [],
    },
    null as {
      voltages?: Array<[string, number]>;
      converged?: boolean;
      iterations?: number;
      mode?: 'linear' | 'nonlinear';
    } | null
  );

  if (!rawResult) {
    return fallback;
  }

  try {
    return deserializeSolveResult(JSON.stringify(rawResult));
  } catch {
    return fallback;
  }
}
