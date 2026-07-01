'use client';

import type { ReactNode } from 'react';

type RightTab = 'ai' | 'property' | 'code';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 flex-1 items-center justify-center rounded-[10px] text-[11px] font-semibold transition ${
        active
          ? 'bg-white text-[#352c25] shadow-[0_1px_2px_rgba(92,73,54,0.08)]'
          : 'text-[#9a8f83] hover:text-[#5f5348]'
      }`}
    >
      {children}
    </button>
  );
}

export function SidebarRight({
  activeTab,
  onTabChange,
  aiPanel,
  propertyPanel,
  codePanel,
  compact = false,
}: {
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  aiPanel: ReactNode;
  propertyPanel: ReactNode;
  codePanel: ReactNode;
  compact?: boolean;
}) {
  return (
    <aside className={`flex h-full shrink-0 flex-col overflow-hidden border-l border-[#e2d7c8] bg-[linear-gradient(180deg,#fdfaf6_0%,#f7f1e8_100%)] ${compact ? 'w-[clamp(260px,21vw,320px)]' : 'w-[clamp(280px,24vw,360px)]'}`}>
      <div className="border-b border-[#e7ddd1] px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a29487]">검토</div>
            <div className="mt-1 text-[15px] font-semibold text-[#40342c]">검토 패널</div>
          </div>
          <div className="rounded-full bg-[#efe8dc] px-2.5 py-1 text-[10px] font-semibold text-[#7f7062]">
            작업공간
          </div>
        </div>
        <div className="mt-3 flex rounded-[14px] bg-[#efe8dc] p-1">
          <TabButton active={activeTab === 'ai'} onClick={() => onTabChange('ai')}>
            AI 감수
          </TabButton>
          <TabButton active={activeTab === 'property'} onClick={() => onTabChange('property')}>
            속성
          </TabButton>
          <TabButton active={activeTab === 'code'} onClick={() => onTabChange('code')}>
            코드
          </TabButton>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'ai' ? aiPanel : activeTab === 'property' ? propertyPanel : codePanel}
      </div>
    </aside>
  );
}
