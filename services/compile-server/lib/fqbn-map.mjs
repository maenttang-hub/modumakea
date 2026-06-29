export const FQBN_MAP = {
  uno: 'arduino:avr:uno',
  nano: 'arduino:avr:nano:cpu=atmega328',
  esp32: 'esp32:esp32:esp32',
};

export function resolveFqbnForBoard(boardId) {
  return FQBN_MAP[boardId] ?? null;
}

export function listSupportedBoards() {
  return Object.entries(FQBN_MAP).map(([boardId, fqbn]) => ({
    boardId,
    fqbn,
  }));
}
