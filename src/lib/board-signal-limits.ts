import { getBoardById } from '@/constants/boards';
import { canonicalizeJoinableNetLabel, normalizeNetLabelToken, parseVoltageFromPowerNetLabel } from '@/lib/net-label-utils';
import type { PinType } from '@/types';

export interface BoardSignalLimits {
  nominal: number;
  maxSafe: number;
  supportsAdc: boolean;
  isGround: boolean;
  isPower: boolean;
  types: PinType[];
}

export function getBoardSignalLimits(boardId: string, pinId: string): BoardSignalLimits | undefined {
  const board = getBoardById(boardId);
  const requestedPinKey = canonicalizeJoinableNetLabel(pinId);
  const pin = board.pinDefinitions.find(item => item.id === pinId || canonicalizeJoinableNetLabel(item.id) === requestedPinKey);
  if (!pin) {
    return undefined;
  }

  if (pin.type.includes('POWER')) {
    const normalizedPinId = normalizeNetLabelToken(pin.id);
    const voltage =
      parseVoltageFromPowerNetLabel(pin.id) ??
      (normalizedPinId === 'VBUS' || normalizedPinId === 'VUSB' ? 5 : board.logicVoltage === '3.3V' ? 3.3 : 5);
    return {
      nominal: voltage,
      maxSafe: voltage + 0.25,
      supportsAdc: false,
      isGround: false,
      isPower: true,
      types: pin.type,
    };
  }

  if (pin.type.includes('GND')) {
    return {
      nominal: 0,
      maxSafe: 0,
      supportsAdc: false,
      isGround: true,
      isPower: false,
      types: pin.type,
    };
  }

  const nominal = board.logicVoltage === '3.3V' ? 3.3 : 5;
  return {
    nominal,
    maxSafe: board.logicVoltage === '3.3V' ? 3.6 : 5.5,
    supportsAdc: pin.type.includes('ANALOG'),
    isGround: false,
    isPower: false,
    types: pin.type,
  };
}
