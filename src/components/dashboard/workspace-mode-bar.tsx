'use client';

import { getTemplateById } from '@/constants/component-templates';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import type { WorkspaceMode } from '@/types';
import type React from 'react';
import { CircuitBoard, FlaskConical } from 'lucide-react';

export function WorkspaceModeBar() {
  const { workspaceMode, setWorkspaceMode, components, appLanguage } = useBoardStore();
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const MODES: {
    id: WorkspaceMode;
    label: string;
    caption: string;
    icon: React.ComponentType<{ size?: number }>;
  }[] = [
    {
      id: 'simulation',
      label: t('시뮬레이션', 'Simulation'),
      caption: t('코드 실행', 'Run code'),
      icon: FlaskConical,
    },
    {
      id: 'schematic',
      label: t('회로도', 'Schematic'),
      caption: t('배선/리뷰', 'Wire + review'),
      icon: CircuitBoard,
    },
  ];
  const routedCount = components.filter(component => component.isFullyRouted).length;
  const verifiedCount = components.filter(component => {
    const template = getTemplateById(component.templateId);
    return Boolean(template?.design?.datasheetSources?.length);
  }).length;

  return (
    <div
      className="h-11 flex items-center justify-between px-3 border-b"
      style={{ background: '#0a0f1a', borderColor: '#21262d' }}
    >
      <div className="flex items-center gap-1.5">
        {MODES.map((mode, index) => {
          const Icon = mode.icon;
          const isActive = workspaceMode === mode.id;

          return (
            <div key={mode.id} className="flex items-center">
              {index > 0 && (
                <div className="w-5 h-px mx-1" style={{ background: '#30363d' }} />
              )}
              <button
                onClick={() => setWorkspaceMode(mode.id)}
                className="h-8 px-2.5 flex items-center gap-2 border text-left transition-colors"
                style={{
                  background: isActive ? '#12301f' : '#0d1117',
                  borderColor: isActive ? '#22c55e' : '#30363d',
                  color: isActive ? '#bbf7d0' : '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <Icon size={13} />
                <span className="flex flex-col leading-none">
                  <span className="text-[11px] font-bold">{mode.label}</span>
                  <span className="text-[9px] opacity-60 mt-1">{mode.caption}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="hidden md:flex items-center gap-3 text-[10px] text-slate-500">
        <span>
          {t('부품', 'Parts')} <strong className="text-slate-300">{components.length}</strong>
        </span>
        <span>
          {t('배선 완료', 'Routed')} <strong className="text-[#22c55e]">{routedCount}</strong>
        </span>
        <span>
          {t('검증됨', 'Verified')} <strong className="text-[#86efac]">{verifiedCount}</strong>
        </span>
        <span>
          {t('포커스', 'Focus')} <strong className="text-slate-300">{t('검토 우선', 'Review-first')}</strong>
        </span>
      </div>
    </div>
  );
}
