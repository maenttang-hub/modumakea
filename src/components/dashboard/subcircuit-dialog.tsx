'use client';

import { useMemo, useState } from 'react';
import { PackagePlus } from 'lucide-react';

import type { SubCircuitPortCandidate } from '@/lib/subcircuits';

type PortDraft = {
  candidateKey: string;
  enabled: boolean;
  externalPinId: string;
};

export function SubCircuitDialog({
  open,
  componentNames,
  candidates,
  onClose,
  onCreate,
}: {
  open: boolean;
  componentNames: string[];
  candidates: SubCircuitPortCandidate[];
  onClose: () => void;
  onCreate: (payload: {
    templateName: string;
    ports: Array<{
      candidateKey: string;
      externalPinId: string;
    }>;
  }) => void;
}) {
  const [templateName, setTemplateName] = useState(
    componentNames.length > 0 ? `${componentNames[0]} 모듈` : '사용자 서브서킷'
  );
  const [drafts, setDrafts] = useState<PortDraft[]>(
    candidates.map(candidate => ({
      candidateKey: candidate.key,
      enabled: candidate.isConnectedOutside,
      externalPinId: candidate.defaultPinName,
    }))
  );

  const enabledCount = useMemo(
    () => drafts.filter(draft => draft.enabled && draft.externalPinId.trim().length > 0).length,
    [drafts]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/55 px-6 py-10 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1220] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
              <PackagePlus size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">서브서킷 컴포넌트 만들기</div>
              <div className="text-xs text-slate-400">
                선택한 회로 묶음을 하나의 재사용 가능한 블록으로 압축합니다.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            닫기
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[0.95fr_1.05fr]">
          <div className="border-b border-slate-800 p-5 md:border-b-0 md:border-r">
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                새 컴포넌트 이름
              </label>
              <input
                type="text"
                value={templateName}
                onChange={event => setTemplateName(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
              />
            </div>

            <div className="mt-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                포함되는 부품
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {componentNames.map(name => (
                  <span
                    key={name}
                    className="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
              이미 바깥에 연결된 핀뿐 아니라, 내부에서 하나의 넷으로 묶인 후보까지 함께 보여줍니다.
              재사용 가능한 블랙박스로 만들 때 바깥으로 꺼낼 포트를 더 넓게 고를 수 있습니다.
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  외부 노출 포트
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  어느 내부 핀을 바깥으로 뺄지 정하고 이름을 붙입니다.
                </div>
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-300">
                활성 포트 {enabledCount}개
              </div>
            </div>

            <div className="space-y-3">
              {candidates.map(candidate => {
                const draft = drafts.find(item => item.candidateKey === candidate.key);
                if (!draft) {
                  return null;
                }

                return (
                  <div
                    key={candidate.key}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={event => setDrafts(current =>
                          current.map(item =>
                            item.candidateKey === candidate.key
                              ? { ...item, enabled: event.target.checked }
                              : item
                          )
                        )}
                        className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-100">{candidate.sourceLabel}</div>
                        <div className="mt-1 text-xs text-slate-400">
                          현재 바깥 연결: {candidate.groupedExternalLabels.length > 0 ? candidate.groupedExternalLabels.join(', ') : candidate.externalLabel ?? '없음'}
                        </div>
                        {candidate.groupedSourceLabels.length > 1 ? (
                          <div className="mt-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-2 text-[11px] text-cyan-100">
                            내부에서 이미 하나의 넷으로 묶인 핀: {candidate.groupedSourceLabels.join(', ')}
                          </div>
                        ) : null}
                        <input
                          type="text"
                          value={draft.externalPinId}
                          disabled={!draft.enabled}
                          onChange={event => setDrafts(current =>
                            current.map(item =>
                              item.candidateKey === candidate.key
                                ? { ...item, externalPinId: event.target.value }
                                : item
                            )
                          )}
                          className="mt-3 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-emerald-500 disabled:opacity-45"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <div className="text-xs text-slate-500">
            생성 후에는 현재 프로젝트 안에서 일반 부품처럼 다시 배치해 재사용할 수 있습니다.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              취소
            </button>
            <button
              type="button"
              disabled={enabledCount === 0 || templateName.trim().length === 0}
              onClick={() => onCreate({
                templateName,
                ports: drafts
                  .filter(draft => draft.enabled && draft.externalPinId.trim().length > 0)
                  .map(draft => ({
                    candidateKey: draft.candidateKey,
                    externalPinId: draft.externalPinId,
                  })),
              })}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              서브서킷 생성
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
