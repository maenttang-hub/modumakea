import type { ModuMakeStore } from '@/types';
import type { HistoryEntry } from '@/store/board-history';

export type BoardStoreState = ModuMakeStore & {
  pastHistoryEntries: HistoryEntry[];
  futureHistoryEntries: HistoryEntry[];
  historySignature: string;
};
