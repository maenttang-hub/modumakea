import rawThresholds from '../../../config/thresholds.json' with { type: 'json' };
import type { InterpretationThresholds } from '@/lib/kicad-interpretation/contracts';

const thresholds = rawThresholds as InterpretationThresholds;

export function getInterpretationThresholds(): InterpretationThresholds {
  return thresholds;
}

export function getInterpretationThresholdsVersion(): string {
  return thresholds.version;
}
