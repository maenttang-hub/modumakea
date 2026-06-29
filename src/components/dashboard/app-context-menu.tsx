'use client';

import type { LucideIcon } from 'lucide-react';

export type AppContextMenuItem = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  icon: LucideIcon;
  onSelect: () => void;
};

export function AppContextMenu({
  x,
  y,
  title,
  items,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  items: AppContextMenuItem[];
  onClose: () => void;
}) {
  return (
    <div
      data-mm-context-menu="true"
      className="fixed z-[3000] w-64 rounded-xl border border-slate-800 bg-[#0b1220]/98 p-2 shadow-2xl backdrop-blur-md"
      style={{ left: x, top: y }}
      onContextMenu={event => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-1 space-y-1">
        {items.map(item => {
          const Icon = item.icon;
          const toneClass =
            item.tone === 'danger'
              ? 'text-red-300 hover:bg-red-950/30 hover:text-red-200'
              : 'text-slate-200 hover:bg-slate-800/80 hover:text-white';

          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.disabled) {
                  return;
                }
                item.onSelect();
                onClose();
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed opacity-45 text-slate-600'
                  : toneClass
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{item.label}</div>
                {item.hint && (
                  <div className="mt-0.5 truncate text-[10px] text-slate-500">{item.hint}</div>
                )}
              </div>
              {item.shortcut ? (
                <span className="shrink-0 rounded border border-slate-700 bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
