/**
 * lib/auto-router.ts
 * [핵심 알고리즘] 자동 배선 엔진
 * 부품을 캔버스에 올렸을 때 아두이노의 빈 핀을 찾아 자동 매핑
 */

import type {
  PlacedComponent,
  BoardPin,
  ComponentTemplate,
  AutoRouterResult,
} from '@/types';
import { getBoardById } from '@/constants/boards';
import { getBoardAvoidPins, getPreferredPinsForRequirement } from '@/lib/datasheet-rules';
import { isGroundRequirement, isPowerRequirement } from '@/lib/pin-compatibility';

const SHARED_PIN_IDS = new Set(['5V', '3.3V', 'GND']);

function choosePowerPin(
  template: ComponentTemplate,
  boardPins: Record<string, BoardPin>,
  boardId: string
): string | null {
  const board = getBoardById(boardId);
  const availablePowerPins = Object.values(boardPins)
    .filter(pin => pin.type.includes('POWER'))
    .map(pin => pin.id);

  const priority =
    template.compatibleVoltage === '3.3V'
      ? ['3.3V', '5V']
      : template.compatibleVoltage === '5V'
        ? ['5V', '3.3V']
        : [board.logicVoltage, board.logicVoltage === '5V' ? '3.3V' : '5V'];

  return priority.find(pinId => availablePowerPins.includes(pinId)) ?? null;
}

export function assignSharedRailPins(
  template: ComponentTemplate,
  boardPins: Record<string, BoardPin>,
  boardId: string
) {
  const assigned: Record<string, string> = {};

  for (const reqPin of template.requiredPins) {
    if (isPowerRequirement(reqPin)) {
      const powerPin = choosePowerPin(template, boardPins, boardId);
      if (!powerPin) {
        return {
          success: false,
          assigned: {},
          error: `"${template.name}"에 필요한 전원 핀을 ${boardId.toUpperCase()} 보드에서 찾을 수 없습니다.`,
        };
      }
      assigned[reqPin.name] = powerPin;
      continue;
    }

    if (isGroundRequirement(reqPin)) {
      assigned[reqPin.name] = 'GND';
    }
  }

  return {
    success: true,
    assigned,
  };
}

/**
 * 핀 이름으로 연결 타입 판단 (전선 색상 결정용)
 */
export function getPinColorType(pinName: string): 'VCC' | 'GND' | 'SIGNAL' {
  const upper = pinName.toUpperCase();
  if (upper === 'VCC' || upper === '5V' || upper === '3.3V' || upper === 'POWER') return 'VCC';
  if (upper === 'GND' || upper === 'GROUND') return 'GND';
  return 'SIGNAL';
}

/**
 * [Auto-Routing Algorithm]
 *
 * 단계:
 * 1. 부품의 requiredPins를 순회
 * 2. POWER/GND 핀은 중복 허용 (공유 가능)
 * 3. 그 외 핀은 isUsed=false인 호환 보드 핀을 탐색
 * 4. 빈 핀 발견 시 assignedPins에 저장 및 isUsed=true로 갱신
 * 5. 핀 부족 시 실패 반환
 */
export function autoAssignPins(
  component: PlacedComponent,
  template: ComponentTemplate,
  boardPins: Record<string, BoardPin>,
  boardId: string
): AutoRouterResult {
  const assigned: Record<string, string> = {};
  const updatedPins: Record<string, BoardPin> = Object.fromEntries(
    Object.entries(boardPins).map(([k, v]) => [k, { ...v }])
  );
  const board = getBoardById(boardId);

  // Prefer pins that are actually rendered in the board UI so assigned wires are visible.
  const visiblePinOrder = [...board.digitalPins, ...board.leftPins];
  const orderedPins = [
    ...visiblePinOrder
      .map(pinId => updatedPins[pinId])
      .filter((pin): pin is BoardPin => Boolean(pin)),
    ...Object.values(updatedPins).filter(pin => !visiblePinOrder.includes(pin.id)),
  ];

  for (const reqPin of template.requiredPins) {
    const preassignedPinId = component.assignedPins[reqPin.name];
    if (preassignedPinId) {
      const existingBoardPin = updatedPins[preassignedPinId];
      if (!existingBoardPin) {
        return {
          success: false,
          assigned: {},
          updatedPins: boardPins,
          error: `"${reqPin.name}"에 연결된 ${preassignedPinId} 핀 정의를 찾을 수 없습니다.`,
        };
      }

      assigned[reqPin.name] = preassignedPinId;

      if (!SHARED_PIN_IDS.has(preassignedPinId)) {
        updatedPins[preassignedPinId] = {
          ...existingBoardPin,
          isUsed: true,
          connectedTo: component.instanceId,
          assignmentMode: existingBoardPin.assignmentMode ?? 'auto',
        };
      }

      continue;
    }

    // ── POWER 핀: 5V 고정 (공유 허용) ──
    if (isPowerRequirement(reqPin)) {
      const powerPin = choosePowerPin(template, updatedPins, boardId);
      if (!powerPin) {
        return {
          success: false,
          assigned: {},
          updatedPins: boardPins,
          error: `"${template.name}"에 필요한 전원 핀을 ${boardId.toUpperCase()} 보드에서 찾을 수 없습니다.`,
        };
      }
      assigned[reqPin.name] = powerPin;
      continue;
    }

    // ── GND 핀: GND 고정 (공유 허용) ──
    if (isGroundRequirement(reqPin)) {
      assigned[reqPin.name] = 'GND';
      continue;
    }

    // ── 신호 핀: 빈 호환 핀 탐색 ──
    // PWM 우선 정렬: PWM을 요구하면 PWM 지원 핀을 먼저 검색
    const needsPWM = reqPin.allowedTypes.includes('PWM');
    const preferredPins = getPreferredPinsForRequirement(template, boardId, reqPin.name);
    const avoidPins = new Set([
      ...getBoardAvoidPins(boardId),
      ...(template.design?.avoidBoardPins?.[boardId] ?? []),
    ]);

    const sortedPins = [...orderedPins].sort((a, b) => {
      const aPreferred = preferredPins.includes(a.id) ? 0 : 1;
      const bPreferred = preferredPins.includes(b.id) ? 0 : 1;
      if (aPreferred !== bPreferred) {
        return aPreferred - bPreferred;
      }

      const aAvoid = avoidPins.has(a.id) ? 1 : 0;
      const bAvoid = avoidPins.has(b.id) ? 1 : 0;
      if (aAvoid !== bAvoid) {
        return aAvoid - bAvoid;
      }

      if (!needsPWM) {
        return 0;
      }

      const aHasPWM = a.type.includes('PWM') ? 0 : 1;
      const bHasPWM = b.type.includes('PWM') ? 0 : 1;
      return aHasPWM - bHasPWM;
    });

    const availablePin = sortedPins.find(
      pin =>
        !pin.isUsed &&
        pin.type.some(t => reqPin.allowedTypes.includes(t)) &&
        !['5V', '3.3V', 'GND'].includes(pin.id)
    );

    if (!availablePin) {
      const manualLockedPins = sortedPins
        .filter(
          pin =>
            pin.assignmentMode === 'manual' &&
            pin.type.some(type => reqPin.allowedTypes.includes(type)) &&
            !['5V', '3.3V', 'GND'].includes(pin.id)
        )
        .map(pin => pin.id);

      return {
        success: false,
        assigned: {},
        updatedPins: boardPins,
        error:
          manualLockedPins.length > 0
            ? `"${reqPin.name}" 핀 할당에 실패했습니다. 호환 핀 ${manualLockedPins.join(', ')}은(는) 수동으로 잠겨 있습니다.`
            : `"${reqPin.name}" 핀 할당에 실패했습니다. 아두이노의 호환 가능한 핀이 부족합니다.`,
      };
    }

    assigned[reqPin.name] = availablePin.id;
    updatedPins[availablePin.id] = {
      ...availablePin,
      isUsed: true,
      connectedTo: component.instanceId,
      assignmentMode: 'auto',
    };
  }

  return {
    success: true,
    assigned,
    updatedPins,
  };
}

/**
 * 부품 제거 시 할당된 핀을 보드에서 해제
 */
export function releasePins(
  instanceId: string,
  assignedPins: Record<string, string>,
  boardPins: Record<string, BoardPin>
): Record<string, BoardPin> {
  const updatedPins: Record<string, BoardPin> = Object.fromEntries(
    Object.entries(boardPins).map(([k, v]) => [k, { ...v }])
  );

  // 할당된 핀들을 순회하며 해제 (POWER/GND 제외)
  for (const [, boardPinId] of Object.entries(assignedPins)) {
    if (['5V', '3.3V', 'GND'].includes(boardPinId)) continue;
    if (updatedPins[boardPinId]?.connectedTo === instanceId) {
      updatedPins[boardPinId] = {
        ...updatedPins[boardPinId],
        isUsed: false,
        connectedTo: undefined,
        assignmentMode: undefined,
      };
    }
  }

  return updatedPins;
}
