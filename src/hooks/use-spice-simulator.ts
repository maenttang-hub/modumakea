'use client';

import { useCallback, useState } from 'react';

import { runSpice, type SpiceResult, type SpiceRunOptions } from '@/lib/spice-simulator';

type SpiceSimulatorStatus = 'idle' | 'running' | 'success' | 'error';

export function useSpiceSimulator() {
  const [status, setStatus] = useState<SpiceSimulatorStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const simulate = useCallback(async (netlist: string, options: SpiceRunOptions = {}) => {
    setStatus('running');
    setProgress(0);
    setError(null);

    try {
      const nextResult = await runSpice(netlist, {
        ...options,
        onProgress: percent => {
          setProgress(percent);
          options.onProgress?.(percent);
        },
      });

      setResult(nextResult);
      setStatus('success');
      return nextResult;
    } catch (simulationError) {
      const message = simulationError instanceof Error ? simulationError.message : 'Simulation failed.';
      setError(message);
      setResult(null);
      setStatus('error');
      throw simulationError;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    progress,
    result,
    error,
    simulate,
    reset,
  };
}
