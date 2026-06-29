import type { BoardPin, PlacedComponent } from '@/types';

export function isManualLockedBoardPin(pin: BoardPin | undefined) {
  return pin?.assignmentMode === 'manual';
}

export function getManualLockedBoardPins(pins: Record<string, BoardPin>) {
  return Object.values(pins).filter(isManualLockedBoardPin);
}

export function getPinnedAssignmentsForComponent(
  component: PlacedComponent,
  pins: Record<string, BoardPin>,
  mode: 'auto' | 'manual'
) {
  return Object.fromEntries(
    Object.entries(component.assignedPins).filter(([, boardPinId]) => pins[boardPinId]?.assignmentMode === mode)
  );
}
