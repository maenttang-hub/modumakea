/**
 * constants/board-pins.ts
 * BOARD_REGISTRY 기반 핀 맵 초기화 유틸
 * (Phase 2: BoardDefinition에서 핀 데이터를 읽어 동적으로 생성)
 */

import { BOARD_REGISTRY, getBoardById } from '@/constants/boards';
import type { BoardPin } from '@/types';

/**
 * 보드 ID에 따른 초기 핀 맵 반환
 */
export function getInitialPins(boardId: string): Record<string, BoardPin> {
  const board = getBoardById(boardId);
  return board.pinDefinitions.reduce<Record<string, BoardPin>>((acc, pinDef) => {
    acc[pinDef.id] = {
      id: pinDef.id,
      type: pinDef.type,
      isUsed: false,
      connectedTo: undefined,
      assignmentMode: undefined,
    };
    return acc;
  }, {});
}

/**
 * 특정 보드의 디지털 핀 ID 목록 반환
 */
export function getDigitalPins(boardId: string): string[] {
  return getBoardById(boardId).digitalPins;
}

/**
 * 특정 보드의 좌측 핀 ID 목록 반환
 */
export function getLeftPins(boardId: string): string[] {
  return getBoardById(boardId).leftPins;
}

// ─── 하위 호환성 유지 (기존 코드에서 UNO_DIGITAL_PINS 참조 시) ───
export const UNO_DIGITAL_PINS = BOARD_REGISTRY['uno'].digitalPins;
export const UNO_LEFT_PINS    = BOARD_REGISTRY['uno'].leftPins;
