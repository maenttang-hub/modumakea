'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { useBoardStore } from '@/store/use-board-store';
import { pickLanguage } from '@/lib/ui-language';

type CommentDraftPopoverProps = {
  anchor: { x: number; y: number };
  targetLabel: string;
  onSubmit: (content: string) => Promise<void> | void;
  onCancel: () => void;
};

export function CommentDraftPopover({
  anchor,
  targetLabel,
  onSubmit,
  onCancel,
}: CommentDraftPopoverProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState('');
  const appLanguage = useBoardStore(state => state.appLanguage);
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="pointer-events-auto absolute z-30 w-[280px] rounded-xl border border-sky-400/35 bg-[#0b1020]/98 shadow-2xl shadow-sky-950/30 backdrop-blur"
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: 'translate(14px, -12px)',
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-sky-100">
            <MessageSquarePlus size={12} className="text-sky-300" />
            <span>{t('인라인 피드백', 'Inline feedback')}</span>
          </div>
          <div className="mt-1 truncate text-[10px] text-slate-400">{targetLabel}</div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-700 p-1 text-slate-300 transition-colors hover:border-slate-500"
          aria-label={t('댓글 입력 취소', 'Cancel comment input')}
        >
          <X size={12} />
        </button>
      </div>

      <div className="p-3">
        <textarea
          ref={inputRef}
          value={content}
          onChange={event => setContent(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
              return;
            }

            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              const next = content.trim();
              if (!next) {
                return;
              }
              void onSubmit(next);
            }
          }}
          placeholder={t('여기에 바로 피드백을 남겨주세요.', 'Leave feedback here right away.')}
          className="h-24 w-full resize-none rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
        />

        <div className="mt-2 text-[10px] text-slate-500">{t('Cmd/Ctrl + Enter로 바로 저장', 'Save right away with Cmd/Ctrl + Enter')}</div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-800 bg-[#0f172a] px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-700"
          >
            {t('취소', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = content.trim();
              if (!next) {
                return;
              }
              void onSubmit(next);
            }}
            className="rounded-md border border-sky-400/40 bg-sky-500/14 px-3 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/18"
          >
            {t('저장', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
