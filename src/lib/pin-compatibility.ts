import type { BoardPin, ComponentTemplate, PinType, RequiredPin } from '@/types';

const SHARED_BOARD_PINS = new Set(['5V', '3.3V', 'GND']);

export function isSharedBoardPin(pinId: string) {
  return SHARED_BOARD_PINS.has(pinId);
}

export function getRequirementForComponentPin(template: ComponentTemplate, componentPin: string): RequiredPin | undefined {
  return template.requiredPins.find(pin => pin.name === componentPin);
}

export function isPowerRequirement(requirement: RequiredPin) {
  return requirement.allowedTypes.includes('POWER');
}

export function isGroundRequirement(requirement: RequiredPin) {
  return requirement.allowedTypes.includes('GND');
}

export function isBoardPinCompatibleWithRequirement(
  requirement: RequiredPin,
  boardPin: Pick<BoardPin, 'id' | 'type'>
) {
  if (requirement.allowBoardRails && (boardPin.id === 'GND' || boardPin.type.includes('POWER'))) {
    return true;
  }

  if (isPowerRequirement(requirement)) {
    return boardPin.type.includes('POWER');
  }

  if (isGroundRequirement(requirement)) {
    return boardPin.id === 'GND';
  }

  return boardPin.type.some(type => requirement.allowedTypes.includes(type as PinType));
}

export function validateBoardPinAssignment(
  template: ComponentTemplate,
  componentPin: string,
  boardPin: Pick<BoardPin, 'id' | 'type'> | undefined
):
  | {
      valid: true;
      requirement: RequiredPin;
    }
  | {
      valid: false;
      error: string;
    } {
  const requirement = getRequirementForComponentPin(template, componentPin);
  if (!requirement) {
    return {
      valid: false,
      error: `${template.name}에는 ${componentPin} 핀이 없습니다.`,
    };
  }

  if (!boardPin) {
    return {
      valid: false,
      error: `${componentPin}에 연결할 보드 핀 정의를 찾을 수 없습니다.`,
    };
  }

  if (!isBoardPinCompatibleWithRequirement(requirement, boardPin)) {
    if (isPowerRequirement(requirement)) {
      return {
        valid: false,
        error: `${template.name}.${componentPin}에는 ${boardPin.id} 전원 핀을 연결할 수 없습니다.`,
      };
    }

    if (isGroundRequirement(requirement)) {
      return {
        valid: false,
        error: `${template.name}.${componentPin}에는 GND만 연결할 수 있습니다.`,
      };
    }

    return {
      valid: false,
      error: `${template.name}.${componentPin}에는 ${boardPin.id}을 연결할 수 없습니다.`,
    };
  }

  return {
    valid: true,
    requirement,
  };
}
