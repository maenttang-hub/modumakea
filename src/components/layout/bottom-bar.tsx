'use client';

import { AlertTriangle, Check, FileText, Share2, XCircle } from 'lucide-react';

function Divider() {
  return <span className="h-3 w-px bg-[#ddd5ca]" aria-hidden="true" />;
}

export function BottomBar({
  errorCount,
  warningCount,
  okLabel,
  onExportReport,
  onShare,
}: {
  errorCount: number;
  warningCount: number;
  okLabel: string;
  onExportReport: () => void;
  onShare: () => void;
}) {
  return (
    <footer className="flex h-[38px] items-center justify-between border-t border-[#e3d7c9] bg-[#fbf8f3] px-4 text-[11px]">
      <div className="flex items-center gap-2 text-[#6c6056]">
        <span className="inline-flex items-center gap-1 text-[#b94747]">
          <XCircle size={12} />
          오류 {errorCount}
        </span>
        <Divider />
        <span className="inline-flex items-center gap-1 text-[#b67b17]">
          <AlertTriangle size={12} />
          경고 {warningCount}
        </span>
        <Divider />
        <span className="inline-flex items-center gap-1 text-[#2f8a46]">
          <Check size={12} />
          {okLabel}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExportReport}
          className="inline-flex items-center gap-1 text-[#847568] transition hover:text-[#4f4339]"
        >
          <FileText size={12} />
          리포트 내보내기
        </button>
        <button
          type="button"
          onClick={onShare}
          className="inline-flex items-center gap-1 text-[#847568] transition hover:text-[#4f4339]"
        >
          <Share2 size={12} />
          공유
        </button>
      </div>
    </footer>
  );
}
