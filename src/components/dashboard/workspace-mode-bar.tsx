'use client';

import { getTemplateById } from '@/constants/component-templates';
import { getSurfaceFlags } from '@/constants/product-surface';
import { runProjectStageDrc } from '@/lib/drc-engine';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import type { WorkspaceMode } from '@/types';
import type React from 'react';
import { Box, CircuitBoard, Factory, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

export function WorkspaceModeBar() {
  const { workspaceMode, setWorkspaceMode, components, manualConnections, activeBoardId, appLanguage, importedPcbDocument } = useBoardStore();
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const surfaceFlags = getSurfaceFlags();
  const readiness = runProjectStageDrc({
    components,
    manualConnections,
    boardId: activeBoardId,
    resolveTemplate: getTemplateById,
  });
  const modes: {
    id: WorkspaceMode;
    label: string;
    caption: string;
    icon: React.ComponentType<{ size?: number }>;
    locked?: boolean;
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

  if (surfaceFlags.showPcbWorkspace || importedPcbDocument) {
    modes.push(
      {
        id: 'pcb',
        label: 'PCB',
        caption: readiness.canEnterPcb ? t('레이아웃', 'Layout') : t('점검 필요', 'Needs check'),
        icon: Box,
      },
      ...(surfaceFlags.showPcbWorkspace
        ? [{
            id: 'manufacturing' as const,
            label: t('제조', 'Manufacturing'),
            caption: readiness.canEnterManufacturing ? t('산출물', 'Outputs') : t('잠김', 'Locked'),
            icon: Factory,
            locked: !readiness.canEnterManufacturing,
          }]
        : [])
    );
  }

  const routedCount = components.filter(component => component.isFullyRouted).length;
  const verifiedCount = components.filter(component => {
    const template = getTemplateById(component.templateId);
    return Boolean(template?.design?.datasheetSources?.length);
  }).length;

  return (
    <div className="flex h-11 items-center justify-between border-b border-[#e4d8ca] bg-[#fbf8f3] px-3">
      <div className="flex items-center gap-1.5">
        {modes.map((mode, index) => {
          const Icon = mode.icon;
          const isActive = workspaceMode === mode.id;

          return (
            <div key={mode.id} className="flex items-center">
              {index > 0 && (
                <div className="mx-1 h-px w-5 bg-[#e6ddd2]" />
              )}
              <button
                type="button"
                onClick={() => {
                  if (mode.locked) {
                    toast.warning(t('제조 단계는 아직 잠겨 있습니다.', 'Manufacturing is still locked.'), {
                      description: readiness.manufacturingReasons.slice(0, 3).join(' / '),
                    });
                    return;
                  }

                  setWorkspaceMode(mode.id);
                }}
                className={`flex h-8 items-center gap-2 rounded-[10px] border px-2.5 text-left transition-colors ${
                  isActive
                    ? 'border-[#cdbba7] bg-[#fbf6ef] text-[#43372f]'
                    : mode.locked
                      ? 'border-[#efd3d3] bg-[#fff8f8] text-[#b24f4f]'
                      : 'border-transparent bg-transparent text-[#76685b] hover:border-[#ddd5ca] hover:bg-white'
                }`}
                title={mode.locked ? readiness.manufacturingReasons[0] : undefined}
              >
                <Icon size={13} />
                <span className="flex flex-col leading-none">
                  <span className="text-[11px] font-semibold">{mode.label}</span>
                  <span className="mt-1 text-[9px] opacity-65">{mode.caption}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="hidden items-center gap-3 text-[10px] text-[#8d8074] md:flex">
        <span>
          {t('부품', 'Parts')} <strong className="text-[#43372f]">{components.length}</strong>
        </span>
        <span>
          {t('배선 완료', 'Routed')} <strong className="text-[#34764a]">{routedCount}</strong>
        </span>
        <span>
          {t('검증됨', 'Verified')} <strong className="text-[#4e79ac]">{verifiedCount}</strong>
        </span>
        <span>
          {t('포커스', 'Focus')} <strong className="text-[#43372f]">{t('검토 우선', 'Review-first')}</strong>
        </span>
      </div>
    </div>
  );
}
