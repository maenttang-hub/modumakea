'use client';

import { useCallback, type CSSProperties } from 'react';
import { ClipboardCopy, Download } from 'lucide-react';
import { toast } from 'sonner';

import { buildAiAnalyzeRequest } from '@/lib/build-ai-analyze-request';
import type { AIAnalyzeRequestPayload, LightweightValidationJson } from '@/types';

function buildCompactValidationSample(payload: AIAnalyzeRequestPayload) {
  const firstComponent = payload.validationInput.components[0];
  const firstNet = payload.validationInput.nets[0];

  return JSON.stringify(
    {
      preferredProvider: payload.preferredProvider,
      validationInput: {
        schema_version: payload.validationInput.schema_version,
        source: {
          source_file_kind: payload.validationInput.source.source_file_kind,
          project_name: payload.validationInput.source.project_name,
        },
        components: firstComponent
          ? [{ ref: firstComponent.ref, lib_id: firstComponent.lib_id }]
          : [],
        nets: firstNet
          ? [{ label: firstNet.label, kind: firstNet.kind }]
          : [],
        stats: {
          component_count: payload.validationInput.stats.component_count,
          net_count: payload.validationInput.stats.net_count,
          unresolved_symbol_count: payload.validationInput.stats.unresolved_symbol_count,
          ignored_non_electrical_symbol_count: payload.validationInput.stats.ignored_non_electrical_symbol_count ?? 0,
          non_component_marker_count: payload.validationInput.stats.non_component_marker_count ?? 0,
          wire_segment_count: payload.validationInput.stats.wire_segment_count,
        },
      },
    },
    null,
    2
  );
}

type ValidationAiPreviewCardProps = {
  t: (ko: string, en: string) => string;
  panelCardClassName: string;
  verificationReportFilenameBase: string;
  cardStyle?: CSSProperties;
  actionButtonStyle?: CSSProperties;
  mutedTextStyle?: CSSProperties;
  strongTextStyle?: CSSProperties;
  resolveValidationInput: () => LightweightValidationJson;
  validationInputPreview: LightweightValidationJson | null;
};

export function ValidationAiPreviewCard({
  t,
  panelCardClassName,
  verificationReportFilenameBase,
  cardStyle,
  actionButtonStyle,
  mutedTextStyle,
  strongTextStyle,
  resolveValidationInput,
  validationInputPreview,
}: ValidationAiPreviewCardProps) {
  const ignoredCount = validationInputPreview?.stats.ignored_non_electrical_symbol_count ?? 0;
  const markerCount = validationInputPreview?.stats.non_component_marker_count ?? 0;

  const handleCopyAiValidationJson = useCallback(async () => {
    try {
      const requestPayload = buildAiAnalyzeRequest(resolveValidationInput());
      await navigator.clipboard.writeText(JSON.stringify(requestPayload, null, 2));
      toast.success(t('AI 요청 JSON 복사 완료', 'AI request JSON copied'), {
        description: t('현재 analyze 요청 본문을 바로 공유할 수 있습니다.', 'You can now share the current analyze request body directly.'),
      });
    } catch (error) {
      toast.error(t('AI 요청 JSON 복사 실패', 'Could not copy AI request JSON'), {
        description: error instanceof Error ? error.message : t('브라우저 권한 또는 직렬화 문제일 수 있습니다.', 'This may be a browser permission or serialization issue.'),
      });
    }
  }, [resolveValidationInput, t]);

  const handleDownloadAiValidationJson = useCallback(() => {
    try {
      const requestPayload = buildAiAnalyzeRequest(resolveValidationInput());
      const blob = new Blob([JSON.stringify(requestPayload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement('a');
      anchor.href = url;
      anchor.download = `${verificationReportFilenameBase}-ai-analyze-request.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t('AI 요청 JSON 저장 완료', 'AI request JSON saved'), {
        description: `${verificationReportFilenameBase}-ai-analyze-request.json`,
      });
    } catch (error) {
      toast.error(t('AI 요청 JSON 저장 실패', 'Could not save AI request JSON'), {
        description: error instanceof Error ? error.message : t('직렬화 중 문제가 발생했습니다.', 'There was a problem while serializing the payload.'),
      });
    }
  }, [resolveValidationInput, t, verificationReportFilenameBase]);

  if (!validationInputPreview) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={handleCopyAiValidationJson}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
          style={actionButtonStyle}
          title={t('AI 요청 JSON 복사', 'Copy AI request JSON')}
        >
          <ClipboardCopy size={13} />
        </button>
        <button
          type="button"
          onClick={handleDownloadAiValidationJson}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
          style={actionButtonStyle}
          title={t('AI 요청 JSON 저장', 'Save AI request JSON')}
        >
          <Download size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className={`${panelCardClassName} space-y-2 text-[10px] leading-relaxed`} style={cardStyle}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-slate-200" style={strongTextStyle}>
          {t('AI 요청 계약', 'AI request contract')}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500" style={mutedTextStyle}>
            /api/ai/analyze
          </span>
          <button
            type="button"
            onClick={handleCopyAiValidationJson}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
            style={actionButtonStyle}
            title={t('AI 요청 JSON 복사', 'Copy AI request JSON')}
          >
            <ClipboardCopy size={12} />
          </button>
          <button
            type="button"
            onClick={handleDownloadAiValidationJson}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 text-slate-300 transition-colors hover:border-sky-400/40 hover:text-sky-200"
            style={actionButtonStyle}
            title={t('AI 요청 JSON 저장', 'Save AI request JSON')}
          >
            <Download size={12} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('부품', 'Components')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{validationInputPreview.stats.component_count}</div>
        </div>
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('넷', 'Nets')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{validationInputPreview.stats.net_count}</div>
        </div>
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('라벨', 'Labels')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{validationInputPreview.stats.label_count}</div>
        </div>
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('미해결', 'Unresolved')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{validationInputPreview.stats.unresolved_symbol_count}</div>
        </div>
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('비전기', 'Ignored')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{ignoredCount}</div>
        </div>
        <div>
          <div className="text-slate-500" style={mutedTextStyle}>{t('마커', 'Markers')}</div>
          <div className="font-bold text-slate-200" style={strongTextStyle}>{markerCount}</div>
        </div>
      </div>
      <div className="rounded-lg border border-slate-800/80 bg-slate-950/65 p-2 font-mono text-[9px] leading-relaxed text-slate-300">
        <div className="mb-1 text-[9px] font-semibold text-slate-500" style={mutedTextStyle}>
          {t('요청 샘플', 'Request sample')}
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words">{buildCompactValidationSample(buildAiAnalyzeRequest(validationInputPreview))}</pre>
      </div>
    </div>
  );
}
