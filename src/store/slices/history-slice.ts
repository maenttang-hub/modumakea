import type { StateCreator } from 'zustand';
import {
  applyHistoryPatch,
  buildHistoryFlags,
} from '@/store/board-history';
import {
  HISTORY_LIMIT,
} from '@/store/store-config';
import type { BoardStoreState } from '@/store/store-types';

export const createHistorySlice: StateCreator<BoardStoreState, [], [], Partial<BoardStoreState>> = (set, get) => ({
  undo: () => {
    const { pastHistoryEntries, futureHistoryEntries, ...state } = get();
    const previousEntry = pastHistoryEntries[pastHistoryEntries.length - 1];
    if (!previousEntry) {
      return;
    }

    const nextPast = pastHistoryEntries.slice(0, -1);
    const nextFuture = [previousEntry, ...futureHistoryEntries].slice(0, HISTORY_LIMIT);

    set({
      ...applyHistoryPatch(state, previousEntry.reverse),
      pastHistoryEntries: nextPast,
      futureHistoryEntries: nextFuture,
      historySignature: previousEntry.beforeSignature,
      ...buildHistoryFlags(nextPast, nextFuture),
    });
  },

  redo: () => {
    const { pastHistoryEntries, futureHistoryEntries, ...state } = get();
    const nextEntry = futureHistoryEntries[0];
    if (!nextEntry) {
      return;
    }

    const nextPast = [...pastHistoryEntries, nextEntry].slice(-HISTORY_LIMIT);
    const nextFuture = futureHistoryEntries.slice(1);

    set({
      ...applyHistoryPatch(state, nextEntry.forward),
      pastHistoryEntries: nextPast,
      futureHistoryEntries: nextFuture,
      historySignature: nextEntry.afterSignature,
      ...buildHistoryFlags(nextPast, nextFuture),
    });
  },
});
