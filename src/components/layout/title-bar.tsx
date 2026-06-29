'use client';

import { FileText, Loader2, Play, Plus, Save } from 'lucide-react';

export function TitleBar({
  projectName,
  fileLabel,
  hasCode,
  isAnalyzing,
  onProjectNameChange,
  onOpenSchematic,
  onAddCode,
  onRunAnalysis,
  onOpenReport,
  onSave,
}: {
  projectName: string;
  fileLabel: string;
  hasCode: boolean;
  isAnalyzing: boolean;
  onProjectNameChange: (value: string) => void;
  onOpenSchematic: () => void;
  onAddCode: () => void;
  onRunAnalysis: () => void;
  onOpenReport: () => void;
  onSave: () => void;
}) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-[#e4d8ca] bg-[#fbf8f3] px-5 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-[13px] font-semibold tracking-[0.02em] text-[#756658]">ModuMake</span>
        <button
          type="button"
          onClick={onOpenSchematic}
          className="max-w-[220px] truncate rounded-[11px] border border-[#dfd2c1] bg-[#fffdfa] px-3 py-1.5 font-mono text-[11px] text-[#66584b] shadow-[0_1px_2px_rgba(86,65,45,0.05)] transition hover:border-[#cbbba8]"
          title={fileLabel}
        >
          {fileLabel}
        </button>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <input
          value={projectName}
          onChange={event => onProjectNameChange(event.target.value)}
          className="h-8 w-[132px] rounded-[11px] border border-[#dfd2c1] bg-[#fffdfa] px-3 text-[11px] font-medium text-[#5b4e42] outline-none transition focus:border-[#c1b09c] xl:w-[144px]"
        />
        <button
          type="button"
          onClick={onAddCode}
          className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-[#ddd0bf] bg-[#fffdfa] px-3.5 text-[11px] font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
        >
          <Plus size={12} />
          {hasCode ? '코드 보기' : '코드 추가'}
        </button>
        <button
          type="button"
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-[#cdbba7] bg-[#fbf6ef] px-3.5 text-[11px] font-semibold text-[#473b31] transition hover:bg-[#f2eadf] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          {isAnalyzing ? '분석 중…' : '분석 실행'}
        </button>
        <button
          type="button"
          onClick={onOpenReport}
          className="inline-flex h-8 items-center gap-1.5 rounded-[12px] border border-[#d8cdbf] bg-white px-3.5 text-[11px] font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
        >
          <FileText size={12} />
          분석 보고서 보기
        </button>
        <button
          type="button"
          onClick={onSave}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#8b7d70] transition hover:border-[#d7cec1] hover:bg-[#fffdfa]"
          title="저장"
        >
          <Save size={13} />
        </button>
      </div>
    </header>
  );
}
