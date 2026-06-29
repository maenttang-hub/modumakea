'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { requestAiConceptDesign, applyAiDesignResult } from '@/integration/ai-bridge';
import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { useBoardStore } from '@/store/use-board-store';
import type { AIConceptDesignResult } from '@/types';
import { Loader2, Sparkles, CheckCircle2, Cpu, GitBranch, Code2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

type ConceptWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConceptWizard({ open, onOpenChange }: ConceptWizardProps) {
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const components = useBoardStore(state => state.components);
  const pins = useBoardStore(state => state.pins);
  const customComponentPackages = useBoardStore(state => state.customComponentPackages);
  const [concept, setConcept] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<AIConceptDesignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedBoard = useMemo(() => {
    const boardId = preview?.board.id ?? activeBoardId;
    return getBoardById(boardId);
  }, [activeBoardId, preview?.board.id]);
  const previewMetaTone = useMemo(() => {
    if (!preview?.meta) {
      return {
        background: 'rgba(71,85,105,0.18)',
        borderColor: 'rgba(148,163,184,0.28)',
        color: '#cbd5e1',
      };
    }

    if (preview.meta.provider === 'gemini') {
      return {
        background: 'rgba(14,165,233,0.16)',
        borderColor: 'rgba(56,189,248,0.32)',
        color: '#7dd3fc',
      };
    }

    if (preview.meta.provider === 'anthropic') {
      return {
        background: 'rgba(168,85,247,0.16)',
        borderColor: 'rgba(192,132,252,0.32)',
        color: '#d8b4fe',
      };
    }

    return {
      background: 'rgba(245,158,11,0.16)',
      borderColor: 'rgba(251,191,36,0.32)',
      color: '#fcd34d',
    };
  }, [preview]);
  const previewMetaText = useMemo(() => {
    if (isLoading) {
      return 'AI 설계 중';
    }

    if (!preview?.meta) {
      return 'AI 대기';
    }

    return `${preview.meta.label}${preview.meta.fallback ? ' · 폴백' : ''}`;
  }, [isLoading, preview]);

  const currentDesignContext = useMemo(() => ({
    boardId: activeBoardId,
    components: components.map(component => ({
      instanceId: component.instanceId,
      templateId: component.templateId,
      name: component.name,
      position: component.position,
      rotation: component.rotation,
      assignedPins: component.assignedPins,
    })),
    usedBoardPins: Object.values(pins)
      .filter(pin => pin.isUsed)
      .map(pin => pin.id),
    lockedBoardPins: Object.values(pins)
      .filter(pin => pin.assignmentMode === 'manual')
      .map(pin => pin.id),
  }), [activeBoardId, components, pins]);

  const handleGenerate = async () => {
    const trimmed = concept.trim();
    if (!trimmed) {
      toast.error('설계할 컨셉을 먼저 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPreview(null);

    try {
      const result = await requestAiConceptDesign({
        concept: trimmed,
        preferredBoardId: activeBoardId,
        currentDesign: currentDesignContext,
        availableCustomComponents: customComponentPackages,
      });
      setPreview(result);
      toast.success('AI 설계 초안이 준비되었습니다.', {
        description: '부품, 배선, 코드 미리보기를 확인한 뒤 적용할 수 있습니다.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 설계 생성에 실패했습니다.';
      setError(message);
      toast.error('AI 설계 실패', { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = () => {
    if (!preview) {
      return;
    }

    const result = applyAiDesignResult(preview);
    if (!result.success) {
      if (result.status === 'manual-review-required') {
        toast.warning('AI 설계는 생성됐지만 수동 확인이 필요합니다.', {
          description: result.error,
        });
        return;
      }

      toast.error('AI 설계 적용 실패', { description: result.error });
      return;
    }

    if (result.status === 'applied-with-autocorrect') {
      toast.success('AI 설계를 적용했고 필요한 항목은 자동 보정했습니다.', {
        description:
          result.notice ??
          `${preview.components.length}개 부품과 코드가 반영되었습니다. 자동으로 필요한 보조 부품도 함께 맞췄습니다.`,
      });
    } else {
      toast.success('AI 설계를 프로젝트에 적용했습니다.', {
        description:
          result.notice ??
          `${preview.components.length}개 부품과 코드가 반영되었습니다. Undo로 한 번에 되돌릴 수 있습니다.`,
      });
    }
    handleOpenChange(false);
  };

  const resetWizard = () => {
    setPreview(null);
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetWizard();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(92vh,960px)] w-[min(960px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220] p-0 text-slate-200 shadow-2xl"
      >
        <DialogHeader className="shrink-0 border-b border-slate-800 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                <Sparkles size={16} />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-slate-100">AI 설계 시작</DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-400">
                  만들고 싶은 장치를 한 줄로 설명하면, 부품 배치와 핀 연결, 코드 초안을 함께 제안합니다.
                </DialogDescription>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono"
              style={previewMetaTone}
              title={preview?.meta?.model ?? '설계가 생성되면 사용된 엔진이 표시됩니다.'}
            >
              <Sparkles size={11} />
              {previewMetaText}
            </span>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-800 p-5 lg:border-r lg:border-b-0">
            <div className="space-y-3 pb-1">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">현재 시작 보드</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Cpu size={14} className="text-sky-300" />
                  {getBoardById(activeBoardId).name}
                </div>
                <div className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  현재 캔버스 부품 {components.length}개, 사용 중인 핀 {currentDesignContext.usedBoardPins.length}개를 참고해서 이어서 설계합니다.
                </div>
              </div>

              <textarea
                value={concept}
                onChange={event => setConcept(event.target.value)}
                placeholder="예: 스마트 화분 - 토양 수분 센서, 온습도 센서, 물 펌프를 연결하고 자동으로 물을 주고 싶어요."
                className="min-h-[180px] w-full resize-none rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500/60 focus:outline-none"
              />

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <Button
                  onClick={handleGenerate}
                  disabled={isLoading}
                  className="h-10 w-full gap-2 bg-[linear-gradient(135deg,#7c3aed,#2563eb)] text-white hover:opacity-90"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      AI 설계 중...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      AI 설계 시작
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetWizard}
                  disabled={isLoading && !preview}
                  className="h-10 border-slate-700 bg-slate-950/30 text-slate-300 hover:bg-slate-900"
                >
                  다시 입력
                </Button>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-[11px] leading-relaxed text-slate-400">
                입력 → AI 설계 → 미리보기 확인 → 수락 순서로 진행됩니다. 적용 후에는 <span className="font-bold text-slate-200">Cmd/Ctrl+Z</span>로 한 번에 되돌릴 수 있습니다.
              </div>
            </div>
          </div>

          <div className="min-h-0 min-w-0 overflow-y-auto p-5">
            {!preview && !error && !isLoading && (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-xl border border-dashed border-slate-800 bg-slate-950/20 p-8 text-center text-sm text-slate-500">
                컨셉을 입력하고 AI 설계를 시작하면 여기에서 부품, 배선, 코드 미리보기를 바로 확인할 수 있습니다.
              </div>
            )}

            {isLoading && (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-slate-800 bg-slate-950/20 p-8 text-center">
                <Loader2 size={28} className="animate-spin text-violet-300" />
                <div className="mt-4 text-sm font-bold text-slate-100">AI가 회로와 코드를 설계 중입니다...</div>
                <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
                  현재 라이브러리, 보드 핀, 전원 규칙을 기준으로 JSON 설계안을 만들고 있습니다.
                </p>
              </div>
            )}

            {error && !isLoading && (
              <div className="rounded-xl border border-red-950/40 bg-red-950/10 p-4">
                <div className="text-sm font-bold text-red-200">설계에 문제가 있습니다.</div>
                <p className="mt-2 text-xs leading-relaxed text-red-200/80">{error}</p>
              </div>
            )}

            {preview && !isLoading && (
              <div className="space-y-4 pb-1">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">선택 보드</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">{selectedBoard.name}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">설계 엔진</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">{preview.meta?.label ?? 'AI'}</div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      {preview.meta?.fallback ? '원격 응답 대신 로컬 설계안 사용' : preview.meta?.model ?? '모델 정보 없음'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">부품 수</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">{preview.components.length}개</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">배선 수</div>
                    <div className="mt-2 text-sm font-bold text-slate-100">{preview.connections.length}개</div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-300">
                        <CheckCircle2 size={13} className="text-emerald-300" />
                        부품 리스트
                      </div>
                      <div className="space-y-2">
                        {preview.components.map(component => {
                          const template = getTemplateById(component.templateId);
                          return (
                            <div key={component.instanceId} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-bold text-slate-100">{template?.name ?? component.templateId}</div>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    {component.instanceId} · {template?.category ?? 'PART'} · {component.position.x},{component.position.y}
                                  </div>
                                </div>
                                <div className="text-[10px] text-slate-500">{template?.compatibleVoltage ?? 'BOTH'}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-300">
                        <GitBranch size={13} className="text-sky-300" />
                        배선 미리보기
                      </div>
                      <div className="space-y-2">
                        {preview.connections.map((connection, index) => {
                          const component = preview.components.find(item => item.instanceId === connection.instanceId);
                          const template = component ? getTemplateById(component.templateId) : undefined;
                          return (
                            <div key={`${connection.instanceId}-${connection.componentPin}-${connection.boardPin}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
                              <span className="font-bold text-slate-100">{template?.name ?? connection.instanceId}</span>
                              <span className="text-slate-500"> · {connection.componentPin}</span>
                              <span className="mx-2 text-slate-600">→</span>
                              <span className="font-bold text-sky-300">{connection.boardPin}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-300">
                      <Code2 size={13} className="text-violet-300" />
                      생성 코드 초안
                    </div>
                    <pre className="max-h-[420px] min-w-0 overflow-auto rounded-lg border border-slate-800 bg-[#090f1a] p-3 text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                      {preview.code}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-slate-800 bg-[#0b1020]">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-900"
          >
            취소
          </Button>
          <Button
            variant="outline"
            onClick={resetWizard}
            className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-900"
          >
            <RotateCcw size={14} />
            초기화
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!preview || isLoading}
            className="bg-emerald-600 text-white hover:bg-emerald-500"
          >
            수락하고 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
