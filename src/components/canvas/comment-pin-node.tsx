'use client';

import type { NodeProps } from 'reactflow';
import { MessageSquare, CornerDownRight } from 'lucide-react';
import type { CommentPinNodeData } from '@/types';

export function CommentPinNode({ data }: NodeProps<CommentPinNodeData>) {
  const isResolved = data.status === 'resolved';
  const isFresh = data.isRecentlyHighlighted;

  return (
    <button
      type="button"
      onClick={() => data.onOpen(data.commentId)}
      className="group flex items-center gap-2 rounded-full border px-2.5 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5"
      style={{
        background: isFresh
          ? 'rgba(76,29,149,0.9)'
          : isResolved
            ? 'rgba(71,85,105,0.9)'
            : 'rgba(30,41,59,0.96)',
        borderColor: isFresh
          ? 'rgba(196,181,253,0.9)'
          : data.isSelected
            ? '#60a5fa'
            : isResolved
              ? 'rgba(148,163,184,0.32)'
              : 'rgba(251,191,36,0.4)',
        color: isFresh
          ? '#f5f3ff'
          : data.isSelected
            ? '#dbeafe'
            : isResolved
              ? '#cbd5e1'
              : '#fde68a',
        boxShadow: isFresh
          ? '0 0 0 1px rgba(196,181,253,0.3), 0 0 32px rgba(139,92,246,0.38)'
          : undefined,
        minWidth: 0,
      }}
      title={data.preview}
    >
      <MessageSquare size={12} />
      <span className="max-w-[110px] truncate text-[10px] font-semibold">{data.label}</span>
      {data.replyCount > 0 && (
        <span className="inline-flex items-center gap-1 text-[9px] text-slate-200">
          <CornerDownRight size={10} />
          {data.replyCount}
        </span>
      )}
    </button>
  );
}
