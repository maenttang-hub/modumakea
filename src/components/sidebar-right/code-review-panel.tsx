'use client';

import { Copy, Download, FileCode2 } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

export function CodeReviewPanel({
  code,
  languageLabel,
  onChange,
}: {
  code: string;
  languageLabel: string;
  onChange: (value: string) => void;
}) {
  const lineCount = useMemo(() => Math.max(1, code.split('\n').length), [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    toast.success('코드를 복사했습니다.');
  };

  const handleDownload = () => {
    const filename = languageLabel.toLowerCase().includes('python') ? 'firmware.py' : 'firmware.ino';
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(`${filename} 파일을 내보냈습니다.`);
  };

  return (
    <div className="flex h-full flex-col bg-[#fdfaf5]">
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
              Code
            </div>
            <div className="mt-1 text-[15px] font-semibold text-[#3f342c]">
              펌웨어 초안
            </div>
          </div>
          <div className="rounded-full bg-[#efe8dc] px-2.5 py-1 text-[10px] font-semibold text-[#7c6d60]">
            {languageLabel}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-[#918375]">
          <span>{lineCount} lines</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-7 items-center gap-1 rounded-[10px] border border-[#e3d9cc] bg-white px-2.5 text-[10px] font-semibold text-[#5c5045] transition hover:bg-[#faf6f0]"
            >
              <Copy size={11} />
              복사
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex h-7 items-center gap-1 rounded-[10px] border border-[#e3d9cc] bg-white px-2.5 text-[10px] font-semibold text-[#5c5045] transition hover:bg-[#faf6f0]"
            >
              <Download size={11} />
              저장
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-4">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a19386]">
          <FileCode2 size={12} className="text-[#537fb2]" />
          코드 편집
        </div>
        <textarea
          value={code}
          onChange={event => onChange(event.target.value)}
          spellCheck={false}
          className="h-full min-h-[320px] w-full resize-none rounded-[16px] border border-[#e6ddd1] bg-[#fffdfa] px-3.5 py-3 font-mono text-[11px] leading-5 text-[#4e433a] outline-none transition focus:border-[#cdbfaa]"
          placeholder="코드가 여기에 표시됩니다."
        />
      </div>
    </div>
  );
}
