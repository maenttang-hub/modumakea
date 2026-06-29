'use client';

/**
 * components/canvas/floating-toolbar.tsx
 * 캔버스 하단 중앙 플로팅 툴바
 * 검증 중심 MVP용 최소 액션만 노출
 */

import { useState } from 'react';
import { useBoardStore } from '@/store/use-board-store';
import { getBoardById, getNextBoardId } from '@/constants/boards';
import { toast } from 'sonner';
import {
  Cpu,
  Wifi, Terminal, AlertTriangle, ImageDown,
} from 'lucide-react';

// 보드별 아이콘
function BoardIcon({ boardId, size = 14 }: { boardId: string; size?: number }) {
  if (boardId === 'esp32') return <Wifi size={size} />;
  if (boardId === 'rpi4')  return <Terminal size={size} />;
  return <Cpu size={size} />;
}

// 보드 전환 확인 Dialog (인라인)
function BoardSwitchDialog({
  targetId,
  onConfirm,
  onCancel,
}: {
  targetId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const board = getBoardById(targetId);

  return (
    <div
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-72 rounded-2xl p-4 z-50"
      style={{
        background: '#0d1428',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      {/* 경고 아이콘 */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(245,158,11,0.2)' }}
        >
          <AlertTriangle size={16} className="text-yellow-400" />
        </div>
        <div>
          <p className="text-white font-bold text-sm">보드 변경</p>
          <p className="text-gray-500 text-xs">캔버스가 초기화됩니다</p>
        </div>
      </div>

      {/* 대상 보드 정보 */}
      <div
        className="flex items-center gap-3 p-3 rounded-xl mb-4"
        style={{ background: board.color + '40', border: `1px solid ${board.accentColor}40` }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: board.accentColor + '30', color: board.accentColor }}
        >
          <BoardIcon boardId={targetId} />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">{board.name}</p>
          <p className="text-gray-400 text-xs">
            {board.logicVoltage} · {board.targetLanguage} · {board.chipset}
          </p>
        </div>
      </div>

      <p className="text-gray-400 text-xs mb-4">
        보드를 변경하면 현재 배치된 모든 부품과 전선이 초기화됩니다. 계속하시겠습니까?
      </p>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          취소
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90"
          style={{
            background: `linear-gradient(135deg, ${board.accentColor}, ${board.accentColor}aa)`,
            boxShadow:  `0 4px 12px ${board.accentColor}40`,
          }}
        >
          변경하기
        </button>
      </div>

      {/* 아래 화살표 */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-4 h-4 rotate-45"
        style={{ background: '#0d1428', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', borderLeft: 'none' }}
      />
    </div>
  );
}

export function FloatingToolbar() {
  const {
    activeBoardId,
    setActiveBoardId,
    components,
    cloudProjectId,
    cloudIsOwner,
  } = useBoardStore();

  const [showBoardDialog, setShowBoardDialog] = useState(false);
  const [pendingBoardId, setPendingBoardId]   = useState<string | null>(null);

  const board     = getBoardById(activeBoardId);
  const nextBoard = getBoardById(getNextBoardId(activeBoardId));
  const isViewOnly = Boolean(cloudProjectId && !cloudIsOwner);

  // 보드 변경 버튼 클릭
  const handleBoardCycle = () => {
    const nextId = getNextBoardId(activeBoardId);
    if (components.length > 0) {
      setPendingBoardId(nextId);
      setShowBoardDialog(true);
    } else {
      applyBoardChange(nextId);
    }
  };

  const applyBoardChange = (boardId: string) => {
    setActiveBoardId(boardId);
    const b = getBoardById(boardId);
    toast.success(`🔄 ${b.name}으로 변경`, {
      description: `${b.logicVoltage} · ${b.targetLanguage} · ${b.chipset}`,
    });
    setShowBoardDialog(false);
    setPendingBoardId(null);
  };

  const handleExportSchematic = () => {
    window.dispatchEvent(new CustomEvent('modumake:export-schematic-png'));
  };

  const TOOLS = [
    {
      id:      'export-schematic',
      label:   'PNG 저장',
      icon:    <ImageDown size={15} />,
      onClick: handleExportSchematic,
      color:   '#60a5fa',
      hint:    '현재 회로도 PNG 저장',
    },
    {
      id:      'board',
      label:   `→ ${nextBoard.name}`,
      icon:    <BoardIcon boardId={getNextBoardId(activeBoardId)} size={15} />,
      onClick: handleBoardCycle,
      color:   board.accentColor,
      hint:    `다음 보드: ${nextBoard.name}`,
      requiresEdit: true,
    },
  ];

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      {/* 보드 전환 확인 Dialog */}
      {showBoardDialog && pendingBoardId && (
        <div className="pointer-events-auto">
          <BoardSwitchDialog
            targetId={pendingBoardId}
            onConfirm={() => applyBoardChange(pendingBoardId)}
            onCancel={() => { setShowBoardDialog(false); setPendingBoardId(null); }}
          />
        </div>
      )}

      {/* 메인 툴바 */}
      <div
        className="pointer-events-auto flex items-center gap-1 px-2 py-1.5 rounded-2xl"
        style={{
          background: 'rgba(8,14,29,0.88)',
          border:     '1px solid rgba(255,255,255,0.1)',
          boxShadow:  '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* 현재 보드 표시 */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl mr-1"
          style={{
            background: board.accentColor + '20',
            border:     `1px solid ${board.accentColor}40`,
          }}
        >
          <span style={{ color: board.accentColor }}>
            <BoardIcon boardId={activeBoardId} size={13} />
          </span>
          <span className="text-xs font-bold" style={{ color: board.accentColor }}>
            {board.name}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-md font-mono" style={{ background: board.accentColor + '25', color: board.accentColor, fontSize: 9 }}>
            {board.logicVoltage}
          </span>
        </div>

        {/* 구분선 */}
        <div className="w-px h-6 mx-1 bg-white/10" />

        {/* 툴 버튼들 */}
        {TOOLS.filter(tool => !isViewOnly || !tool.requiresEdit).map(tool => (
          (() => {
            const isActive = false;

            return (
              <button
                key={tool.id}
                onClick={tool.onClick}
                title={tool.hint}
                className="group flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-200"
                style={{
                  color: isActive ? tool.color : 'rgba(255,255,255,0.55)',
                  background: isActive ? tool.color + '20' : 'transparent',
                  border: isActive ? `1px solid ${tool.color}40` : '1px solid transparent',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget;
                  el.style.background = tool.color + '20';
                  el.style.color      = tool.color;
                  el.style.border     = `1px solid ${tool.color}40`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget;
                  el.style.background = isActive ? tool.color + '20' : 'transparent';
                  el.style.color      = isActive ? tool.color : 'rgba(255,255,255,0.55)';
                  el.style.border     = isActive ? `1px solid ${tool.color}40` : '1px solid transparent';
                }}
              >
                {tool.icon}
                <span className="text-[11px] font-medium whitespace-nowrap">{tool.label}</span>
              </button>
            );
          })()
        ))}
      </div>
    </div>
  );
}
