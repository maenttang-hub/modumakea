'use client';

import React, { useMemo, useState } from 'react';
import type { FootprintMatcherModel } from '@/lib/footprint-matcher';

type Props = {
  model: FootprintMatcherModel;
  editable?: boolean;
  onLinkChange?: (pinId: string, padId: string) => void;
};

const ROW_HEIGHT = 32;

function getStatusTone(status: FootprintMatcherModel['status']) {
  if (status === 'error') {
    return {
      border: 'border-red-500/30',
      bg: 'bg-red-950/20',
      text: 'text-red-200',
      pill: 'bg-red-500/15 text-red-200 border-red-500/30',
      stroke: '#f87171',
    };
  }
  if (status === 'warning') {
    return {
      border: 'border-amber-500/30',
      bg: 'bg-amber-950/20',
      text: 'text-amber-100',
      pill: 'bg-amber-500/15 text-amber-100 border-amber-500/30',
      stroke: '#fbbf24',
    };
  }
  return {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-950/20',
    text: 'text-emerald-100',
    pill: 'bg-emerald-500/15 text-emerald-100 border-emerald-500/30',
    stroke: '#34d399',
  };
}

export function FootprintMatcherViewer({ model, editable = false, onLinkChange }: Props) {
  const tone = getStatusTone(model.status);
  const rows = Math.max(model.pins.length, model.pads.length);
  const height = Math.max(rows * ROW_HEIGHT, ROW_HEIGHT * 2);
  const [draggingPinId, setDraggingPinId] = useState<string | null>(null);

  const leftMap = useMemo(
    () => new Map(model.pins.map((pin, index) => [pin.id, index])),
    [model.pins]
  );
  const rightMap = useMemo(
    () => new Map(model.pads.map((pad, index) => [pad.id, index])),
    [model.pads]
  );
  const linkMap = useMemo(
    () => new Map(model.links.map(link => [link.pinId, link.padId])),
    [model.links]
  );
  const activeDragPadId = useMemo(
    () => (draggingPinId ? (linkMap.get(draggingPinId) ?? null) : null),
    [draggingPinId, linkMap]
  );

  return (
    <div className={`space-y-2 rounded-sm border ${tone.border} ${tone.bg} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Footprint Matcher</div>
          <div className="mt-0.5 text-xs font-bold text-slate-100">{model.title}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{model.packageLabel} · {model.footprint}</div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${tone.pill}`}>
          {model.status === 'error' ? '불일치 감지' : model.status === 'warning' ? '참고 보기' : '정상 범위'}
        </span>
      </div>

      <p className={`text-[11px] leading-relaxed ${tone.text}`}>{model.summary}</p>

      <div className="relative overflow-hidden rounded-sm border border-white/10 bg-[#0b0f16]">
        <div className="grid grid-cols-[1fr,160px,1fr]">
          <div className="border-r border-white/8 px-3 py-2">
            <div className="mb-2 text-[10px] font-bold uppercase text-slate-500">심볼 핀</div>
            <div className="relative" style={{ height }}>
              {model.pins.map((pin, index) => (
                <div
                  key={pin.id}
                  draggable={editable && Boolean(onLinkChange)}
                  onDragStart={event => {
                    if (!editable || !onLinkChange) {
                      return;
                    }
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', pin.id);
                    setDraggingPinId(pin.id);
                  }}
                  onDragEnd={() => setDraggingPinId(null)}
                  className={[
                    'absolute left-0 right-0 flex items-center justify-between gap-2 rounded-sm border px-2 py-1 text-[11px] text-slate-200 transition-colors',
                    draggingPinId === pin.id
                      ? 'border-sky-400/60 bg-sky-950/30'
                      : 'border-slate-800 bg-slate-950/80',
                    editable && onLinkChange ? 'cursor-grab active:cursor-grabbing' : '',
                  ].join(' ')}
                  style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT - 4 }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{pin.label}</div>
                    <div className="text-[10px] text-slate-500">Pin {pin.number ?? pin.id}</div>
                  </div>
                  {editable && onLinkChange ? (
                    <label className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span>Pad</span>
                      <select
                        value={linkMap.get(pin.id) ?? ''}
                        onChange={event => onLinkChange(pin.id, event.target.value)}
                        className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-200 outline-none"
                      >
                        {model.pads.map(pad => (
                          <option key={pad.id} value={pad.id}>
                            {pad.id}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 160 ${height}`} preserveAspectRatio="none">
              {model.links.map(link => {
                const leftIndex = leftMap.get(link.pinId) ?? 0;
                const rightIndex = rightMap.get(link.padId) ?? 0;
                const y1 = leftIndex * ROW_HEIGHT + (ROW_HEIGHT - 4) / 2;
                const y2 = rightIndex * ROW_HEIGHT + (ROW_HEIGHT - 4) / 2;
                const x1 = 8;
                const x2 = 152;
                const deltaX = Math.abs(x2 - x1) * 0.4;
                const stroke = link.status === 'error' ? '#f87171' : tone.stroke;
                return (
                  <path
                    key={`${link.pinId}:${link.padId}`}
                    d={`M ${x1} ${y1} C ${x1 + deltaX} ${y1} ${x2 - deltaX} ${y2} ${x2} ${y2}`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={link.status === 'error' ? 2.5 : 2}
                    strokeDasharray={link.status === 'error' ? '0' : '5 4'}
                    opacity={0.95}
                  />
                );
              })}
            </svg>
          </div>

          <div className="border-l border-white/8 px-3 py-2">
            <div className="mb-2 text-[10px] font-bold uppercase text-slate-500">풋프린트 패드</div>
            <div className="relative" style={{ height }}>
              {model.pads.map((pad, index) => (
                <div
                  key={pad.id}
                  onDragOver={event => {
                    if (!editable || !onLinkChange) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={event => {
                    if (!editable || !onLinkChange) {
                      return;
                    }
                    event.preventDefault();
                    const pinId = event.dataTransfer.getData('text/plain') || draggingPinId;
                    if (pinId) {
                      onLinkChange(pinId, pad.id);
                    }
                    setDraggingPinId(null);
                  }}
                  className={[
                    'absolute left-0 right-0 flex items-center justify-between rounded-sm border px-2 py-1 text-[11px] text-slate-200 transition-colors',
                    activeDragPadId === pad.id
                      ? 'border-sky-400/60 bg-sky-950/25'
                      : 'border-slate-800 bg-slate-950/80',
                  ].join(' ')}
                  style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT - 4 }}
                >
                  <span className="font-bold">{pad.label}</span>
                  <span className="text-slate-500">{pad.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editable ? (
        <div className="text-[10px] leading-relaxed text-slate-500">
          핀 카드를 패드 쪽으로 끌어다 놓거나, 오른쪽 선택 상자로 바꾸면 저장됩니다. 같은 프로젝트 안에서는 이 매핑이 계속 유지되고, 비슷한 부품군에는 자동 제안으로 다시 사용됩니다.
        </div>
      ) : null}
    </div>
  );
}
