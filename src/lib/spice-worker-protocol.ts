import type { SpiceResult, SpiceRunOptions } from '@/lib/spice-simulator';

export type SpiceWorkerRequestMessage = {
  type: 'run';
  netlist: string;
  options?: SpiceRunOptions;
};

export type SpiceWorkerProgressMessage = {
  type: 'progress';
  percent: number;
};

export type SpiceWorkerResultMessage = {
  type: 'result';
  data?: SpiceResult;
  error?: string;
};

export type SpiceWorkerMessage =
  | SpiceWorkerRequestMessage
  | SpiceWorkerProgressMessage
  | SpiceWorkerResultMessage;
