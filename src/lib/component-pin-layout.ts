import type { ComponentCategory, RequiredPin } from '@/types';

const POWER_KEYWORDS = ['vcc', 'vin', '5v', '3.3v', 'gnd', 'ground', 'power'];

export function isPowerRailPinName(pinName: string) {
  const normalized = pinName.toLowerCase();
  return POWER_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function shouldUseSingleSidedLayout(category?: ComponentCategory) {
  return category === 'SENSOR';
}

export function getComponentPinLayout(
  requiredPins: RequiredPin[],
  category?: ComponentCategory
) {
  const left: RequiredPin[] = [];
  const right: RequiredPin[] = [];
  const remaining: RequiredPin[] = [];

  for (const pin of requiredPins) {
    if (pin.preferredSide === 'left') {
      left.push(pin);
      continue;
    }

    if (pin.preferredSide === 'right') {
      right.push(pin);
      continue;
    }

    remaining.push(pin);
  }

  if (shouldUseSingleSidedLayout(category)) {
    left.push(...remaining);

    return {
      leftPins: left,
      rightPins: right,
    };
  }

  if (left.length === 0 && right.length === 0) {
    if (category === 'PASSIVE') {
      remaining.forEach((pin, index) => {
        if (index % 2 === 0) {
          left.push(pin);
        } else {
          right.push(pin);
        }
      });
    } else {
      remaining.forEach(pin => {
        if (isPowerRailPinName(pin.name)) {
          left.push(pin);
        } else {
          right.push(pin);
        }
      });
    }
  } else {
    remaining.forEach(pin => {
      if (isPowerRailPinName(pin.name)) {
        left.push(pin);
      } else {
        right.push(pin);
      }
    });
  }

  if (requiredPins.length === 2 && left.length === 2 && right.length === 0) {
    right.push(left.pop()!);
  }

  if (requiredPins.length === 2 && right.length === 2 && left.length === 0) {
    left.push(right.shift()!);
  }

  return { leftPins: left, rightPins: right };
}
