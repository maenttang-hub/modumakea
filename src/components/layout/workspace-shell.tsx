'use client';

import type { ReactNode } from 'react';

export function WorkspaceShell({
  titleBar,
  leftSidebar,
  canvasArea,
  rightSidebar,
  bottomBar,
}: {
  titleBar: ReactNode;
  leftSidebar: ReactNode;
  canvasArea: ReactNode;
  rightSidebar: ReactNode;
  bottomBar: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#f7f2ea] text-[#3f342c]">
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#fbf8f3]">
        {titleBar}
        <div className="hidden min-h-0 flex-1 gap-1.5 bg-[#f7f2ea] px-2 pb-2 pt-1.5 lg:flex">
          {leftSidebar}
          <div className="min-w-0 flex-1 bg-[#f5efe6]">{canvasArea}</div>
          {rightSidebar}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-[#f7f2ea] px-5 py-8 lg:hidden">
          <div className="w-full max-w-[420px] rounded-[16px] border border-[#e1d5c6] bg-[#fffdf9] px-5 py-5 shadow-[0_16px_36px_rgba(92,73,54,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9b8d7d]">
              Desktop workspace
            </div>
            <div className="mt-2 text-[16px] font-semibold text-[#3f342c]">
              데스크톱 화면에서 사용해 주세요
            </div>
            <div className="mt-2 text-[12px] leading-6 text-[#76685b]">
              회로 검토 화면은 좌측 구조, 중앙 회로도, 우측 검토 패널을 동시에 비교하도록 설계되어 있습니다.
              공식 최소 폭은 1024px이며, 권장 폭은 1280px 이상입니다.
            </div>
          </div>
        </div>
        {bottomBar}
      </div>
    </div>
  );
}
