'use client';

import { Bolt, ChevronDown, ChevronRight, FileCode2, FileText, HelpCircle, Microchip, Plug, Waves, X } from 'lucide-react';

type SidebarComponentItem = {
  id: string;
  ref: string;
  value: string;
  label: string;
  status: 'error' | 'warning' | 'ok';
  kind: 'mcu' | 'passive' | 'connector' | 'unknown';
};

type SidebarNetItem = {
  id: string;
  name: string;
  connectionSummary: string;
  kind: 'power' | 'signal';
  hasMismatch: boolean;
};

type SidebarFileItem = {
  id: string;
  label: string;
  kind: 'schematic' | 'code';
  removable?: boolean;
};

function Section({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#e7dfd5] px-2 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-10 w-full items-center justify-between rounded-[14px] px-3 text-left text-[11px] font-semibold text-[#7f7265] transition hover:bg-[#f6efe5]"
      >
        <span>{title}</span>
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      </button>
      {!collapsed ? <div className="pb-2">{children}</div> : null}
    </section>
  );
}

function componentIcon(kind: SidebarComponentItem['kind']) {
  switch (kind) {
    case 'mcu':
      return Microchip;
    case 'connector':
      return Plug;
    case 'passive':
      return Waves;
    default:
      return HelpCircle;
  }
}

export function SidebarLeft({
  components,
  nets,
  files,
  selectedComponentId,
  sectionState,
  onToggleSection,
  onSelectComponent,
  onRemoveFile,
}: {
  components: SidebarComponentItem[];
  nets: SidebarNetItem[];
  files: SidebarFileItem[];
  selectedComponentId: string | null;
  sectionState: Record<'components' | 'nets' | 'files', boolean>;
  onToggleSection: (section: 'components' | 'nets' | 'files') => void;
  onSelectComponent: (id: string) => void;
  onRemoveFile: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-[clamp(172px,14vw,196px)] shrink-0 flex-col overflow-hidden rounded-[20px] border border-[#e2d7c8] bg-[linear-gradient(180deg,#fdfaf6_0%,#f7f1e8_100%)] shadow-[0_18px_40px_rgba(103,79,56,0.07)]">
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a29487]">탐색</div>
        <div className="mt-1 text-[15px] font-semibold text-[#40342c]">회로 구조</div>
        <div className="mt-1 text-[11px] leading-5 text-[#918375]">
          부품, 넷, 파일 요약
        </div>
      </div>
      <Section title="컴포넌트" collapsed={sectionState.components} onToggle={() => onToggleSection('components')}>
        <div className="space-y-0.5 px-2">
          {components.map(item => {
            const Icon = componentIcon(item.kind);
            const active = item.id === selectedComponentId;
            const badge = item.status === 'error' ? 'ERC' : item.status === 'warning' ? '?' : null;
            const badgeClass =
              item.status === 'error'
                ? 'bg-[#f8d8d8] text-[#be4d4d]'
                : 'bg-[#fae6bf] text-[#b47c18]';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectComponent(item.id)}
                className={`flex h-[30px] w-full items-center gap-2 rounded-[8px] px-2 text-left text-[11px] transition ${
                  active
                    ? 'bg-[#cfe0f6] text-[#2f5d91]'
                    : 'text-[#5b4f45] hover:bg-[#f3eee6]'
                }`}
              >
                <Icon size={13} className={item.kind === 'unknown' ? 'text-[#d08a1d]' : 'text-[#8b7d70]'} />
                <span className="w-9 shrink-0 font-mono text-[#8b7d70]">{item.ref}</span>
                <span className="min-w-0 flex-1 truncate">{item.value || item.label}</span>
                {badge ? <span className={`rounded px-1 py-0.5 text-[10px] font-semibold ${badgeClass}`}>{badge}</span> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="넷리스트" collapsed={sectionState.nets} onToggle={() => onToggleSection('nets')}>
        <div className="space-y-0.5 px-2">
          {nets.map(net => (
            <div key={net.id} className="flex min-h-[30px] items-center gap-2 rounded-[8px] px-2 text-[11px] text-[#5c5147] hover:bg-[#f3eee6]">
              {net.kind === 'power' ? <Bolt size={13} className="text-[#b67b17]" /> : <Waves size={13} className="text-[#8b7d70]" />}
              <div className="min-w-0 flex-1">
                <div className={net.hasMismatch ? 'text-[#be4d4d]' : 'text-[#493f36]'}>{net.name}</div>
                <div className="truncate text-[10px] text-[#8b7d70]">{net.connectionSummary}</div>
              </div>
              {net.hasMismatch ? <span className="rounded bg-[#f9d8d8] px-1 py-0.5 text-[10px] font-semibold text-[#be4d4d]">!</span> : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="파일" collapsed={sectionState.files} onToggle={() => onToggleSection('files')}>
        <div className="space-y-0.5 px-2">
          {files.map(file => (
            <div key={file.id} className="flex h-[30px] items-center gap-2 rounded-[8px] px-2 text-[11px] text-[#5c5147] hover:bg-[#f3eee6]">
              {file.kind === 'schematic' ? <FileText size={13} className="text-[#8b7d70]" /> : <FileCode2 size={13} className="text-[#5f8cbc]" />}
              <span className="min-w-0 flex-1 truncate">{file.label}</span>
              {file.removable ? (
                <button
                  type="button"
                  onClick={() => onRemoveFile(file.id)}
                  className="rounded p-1 text-[#8b7d70] transition hover:bg-white hover:text-[#5a4c41]"
                  title="파일 제거"
                >
                  <X size={11} />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Section>
      <div className="mt-auto border-t border-[#e9dfd3] bg-[#fcf8f2] px-4 py-3">
        <div className="flex items-center justify-between text-[10px] text-[#8e8073]">
          <span>부품 {components.length}</span>
          <span>넷 {nets.length}</span>
          <span>파일 {files.length}</span>
        </div>
      </div>
    </aside>
  );
}
