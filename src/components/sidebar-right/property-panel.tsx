'use client';

import { ExternalLink } from 'lucide-react';

type PropertyRow = {
  label: string;
  value: string;
  href?: string;
};

export function PropertyPanel({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: PropertyRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col bg-[#fdfaf5]">
        <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">Property</div>
          <div className="mt-1 text-[15px] font-semibold text-[#3f342c]">속성</div>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 text-center text-[11px] text-[#9a8f83]">
          컴포넌트를 클릭하면 속성이 표시됩니다
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#fdfaf5]">
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">Property</div>
        <div className="mt-1 text-[15px] font-semibold text-[#3f342c]">{title}</div>
        <p className="mt-1 text-[10px] leading-5 text-[#9a8f83]">{description}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="rounded-[16px] border border-[#e7ddd1] bg-[#fffdfa]">
          {rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className={`flex items-start justify-between gap-4 px-3.5 py-3 text-[11px] ${
                index < rows.length - 1 ? 'border-b border-[#efe7dc]' : ''
              }`}
            >
              <span className="min-w-[72px] text-[#9a8f83]">{row.label}</span>
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-right text-[#5378a1] hover:text-[#2f5d91]"
                >
                  {row.value}
                  <ExternalLink size={11} />
                </a>
              ) : (
                <span className="font-mono text-right text-[#54483f]">{row.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
