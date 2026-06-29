'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, CheckCircle2, CornerDownRight, RefreshCw, XCircle } from 'lucide-react';
import { useBoardStore } from '@/store/use-board-store';
import { useProjectComments } from '@/components/comments/project-comments-provider';
import {
  buildCommentPreview,
  getCommentDraftPresentationMode,
  getCommentTargetLabel,
  shouldUseInlineCommentComposer,
} from '@/lib/project-comments';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { pickLanguage } from '@/lib/ui-language';

const STATUS_COPY = {
  open: { label: { ko: '열림', en: 'Open' }, tone: 'bg-amber-500/12 border-amber-400/30 text-amber-200' },
  resolved: { label: { ko: '해결됨', en: 'Resolved' }, tone: 'bg-emerald-500/12 border-emerald-400/30 text-emerald-200' },
  orphaned: { label: { ko: '고아 상태', en: 'Orphaned' }, tone: 'bg-slate-500/12 border-slate-400/30 text-slate-200' },
} as const;

const COMMENT_SECTION = 'rounded-2xl border border-[#21262d] bg-[#0b1020] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]';
const COMMENT_CARD = 'rounded-xl border border-slate-800 bg-[#0b1020]';

export function CommentsPanel() {
  const components = useBoardStore(state => state.components);
  const activeBoardId = useBoardStore(state => state.activeBoardId);
  const importedSchematicScene = useBoardStore(state => state.importedSchematicScene);
  const schematicTheme = useBoardStore(state => state.schematicTheme);
  const appLanguage = useBoardStore(state => state.appLanguage);
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const importedPalette = getImportedSchematicPalette(schematicTheme);
  const importedSectionStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellPanelBackground,
        color: importedPalette.shellForeground,
      }
    : undefined;
  const importedCardStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellCardBackground,
        color: importedPalette.shellForeground,
      }
    : undefined;
  const importedButtonStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellInputBackground,
        color: importedPalette.shellForeground,
      }
    : undefined;
  const {
    enabled,
    projectId,
    isLoading,
    error,
    commentMode,
    toggleCommentMode,
    threads,
    selectedCommentId,
    highlightedThreadId,
    highlightedCommentId,
    setPollingActive,
    draft,
    refresh,
    startReplyDraft,
    cancelDraft,
    submitDraft,
    setCommentStatus,
    focusComment,
    selectComment,
  } = useProjectComments();
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRefs = useRef(new Map<string, HTMLElement>());
  const replyRefs = useRef(new Map<string, HTMLButtonElement>());
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const draftKey = `${draft?.mode ?? 'none'}:${draft?.parentId ?? 'root'}:${draft?.targetType ?? 'none'}`;
  const draftPresentationMode = getCommentDraftPresentationMode(draft);
  const showInlineDraftHint = shouldUseInlineCommentComposer(draft);
  const showCodeInlineDraftHint = draftPresentationMode === 'code-inline';
  const showPanelDraftComposer = draftPresentationMode === 'panel';
  const panelDraft = showPanelDraftComposer ? draft : null;

  useEffect(() => {
    setPollingActive(true);
    return () => setPollingActive(false);
  }, [setPollingActive]);

  const selectedThread = useMemo(
    () => threads.find(thread => thread.root.id === selectedCommentId) ?? null,
    [selectedCommentId, threads]
  );

  const filteredThreads = useMemo(() => {
    if (filter === 'all') {
      return threads;
    }

    if (filter === 'resolved') {
      return threads.filter(thread => thread.root.status === 'resolved');
    }

    return threads.filter(thread => thread.root.status === 'open' || thread.root.status === 'orphaned');
  }, [filter, threads]);

  useEffect(() => {
    if (highlightedCommentId) {
      replyRefs.current.get(highlightedCommentId)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
      return;
    }

    if (highlightedThreadId) {
      threadRefs.current.get(highlightedThreadId)?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedCommentId, highlightedThreadId]);

  if (!enabled) {
    return (
      <div className="h-full overflow-y-auto p-4 text-xs font-mono text-slate-300">
        <div className={`${COMMENT_SECTION} p-4`} style={importedSectionStyle}>
          <div className="flex items-center gap-2 text-slate-100">
            <MessageSquarePlus size={14} className="text-sky-300" />
            <span className="font-semibold">{t('팀 피드백', 'Team feedback')}</span>
          </div>
          <p className="mt-2 leading-relaxed text-slate-400">
            {t(
              '공유 링크를 켜면 캔버스와 코드 줄에 바로 메모를 남길 수 있습니다.',
              'Turn on link sharing to leave notes directly on the canvas and code lines.'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col font-mono text-xs text-slate-300"
      style={{
        background: importedSchematicMode ? importedPalette.shellPanelAltBackground : '#0d1117',
        color: importedSchematicMode ? importedPalette.shellForeground : '#cbd5e1',
      }}
    >
      <div
        className="border-b px-4 py-5"
        style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : '#21262d' }}
      >
        <div className="flex items-center gap-2">
          <MessageSquarePlus size={14} className="text-sky-300" />
          <div>
            <div className="font-semibold text-slate-100">{t('팀 피드백', 'Team feedback')}</div>
            <div className="text-[10px] text-slate-500">
              {projectId
                ? t(`공유 프로젝트 ${projectId.slice(0, 8)}…`, `Shared project ${projectId.slice(0, 8)}…`)
                : t('공유 프로젝트 준비 중', 'Preparing shared project')}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCommentMode}
            className={[
              'rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-colors',
              commentMode
                ? 'border-sky-400/40 bg-sky-500/14 text-sky-100'
                : 'border-slate-800 bg-[#0b1020] text-slate-300 hover:border-slate-700',
            ].join(' ')}
            style={!commentMode ? importedButtonStyle : undefined}
          >
            {commentMode ? t('댓글 모드 켜짐 (C)', 'Comment mode on (C)') : t('댓글 모드 켜기 (C)', 'Turn on comment mode (C)')}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-slate-800 bg-[#0b1020] px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-slate-700"
            title={t('댓글 다시 불러오기', 'Reload comments')}
            style={importedButtonStyle}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
          {t(
            '댓글 모드에서 캔버스, 부품, 배선, 코드 줄에 바로 남길 수 있습니다.',
            'In comment mode, leave feedback directly on the canvas, parts, wires, or code lines.'
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[11px] text-rose-100">
            {error}
          </div>
        )}

        {showInlineDraftHint && (
          <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5">
            <div className="text-[11px] font-semibold text-violet-100">{t('캔버스에 바로 입력창이 열렸습니다.', 'An inline input opened on the canvas.')}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-violet-200/85">
              {t(
                '핀을 꽂은 위치 옆 작은 입력창에서 바로 피드백을 남길 수 있습니다.',
                'You can leave feedback right away in the small input next to the pin.'
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-md border border-slate-800 bg-[#0b1020] px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-700"
                style={importedButtonStyle}
              >
                {t('입력 취소', 'Cancel input')}
              </button>
            </div>
          </div>
        )}

        {showCodeInlineDraftHint && draft && (
          <div className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5">
            <div className="text-[11px] font-semibold text-violet-100">{t('코드 줄 옆에 작은 입력창이 열렸습니다.', 'A small input opened next to the code line.')}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-violet-200/85">
              {t(
                '선택한 줄 가까이에서 바로 피드백을 남길 수 있습니다.',
                'You can leave feedback right next to the selected line.'
              )}
            </div>
            <div className="mt-2 text-[10px] text-violet-200/70">
              {getCommentTargetLabel(draft.targetType, draft.targetMeta, components, appLanguage)}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-md border border-slate-800 bg-[#0b1020] px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-700"
                style={importedButtonStyle}
              >
                {t('입력 취소', 'Cancel input')}
              </button>
            </div>
          </div>
        )}

        {panelDraft && (
          <div className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold text-sky-100">
                  {panelDraft.mode === 'reply' ? t('답글 작성', 'Write reply') : t('새 피드백', 'New feedback')}
                </div>
                <div className="mt-1 text-[10px] text-sky-200/80">
                  {getCommentTargetLabel(panelDraft.targetType, panelDraft.targetMeta, components, appLanguage)}
                </div>
              </div>
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-md border border-slate-700 p-1 text-slate-300 hover:border-slate-500"
              >
                <XCircle size={12} />
              </button>
            </div>

            <textarea
              key={draftKey}
              ref={draftInputRef}
              defaultValue=""
              placeholder={t('여기에 피드백을 남겨주세요.', 'Leave your feedback here.')}
              className="mt-3 h-24 w-full rounded-lg border border-slate-700 bg-[#0b1020] px-3 py-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-400/40"
              style={importedButtonStyle}
            />

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDraft}
                className="rounded-md border border-slate-800 bg-[#0b1020] px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-700"
                style={importedButtonStyle}
              >
                {t('취소', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submitDraft(draftInputRef.current?.value ?? '')}
                className="rounded-md border border-sky-400/40 bg-sky-500/14 px-3 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/18"
              >
                {t('저장', 'Save')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-2 border-b px-4 py-3 text-[11px] text-slate-400"
        style={{
          borderColor: importedSchematicMode ? importedPalette.shellBorder : '#21262d',
          color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8',
        }}
      >
        {(['open', 'resolved', 'all'] as const).map(option => {
          const isActive = filter === option;
          const label =
            option === 'open'
              ? t('열린 피드백', 'Open')
              : option === 'resolved'
                ? t('해결됨', 'Resolved')
                : t('전체', 'All');
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={[
                'rounded-full border px-2.5 py-1 transition-colors',
                isActive
                  ? 'border-sky-400/40 bg-sky-500/14 text-sky-100'
                  : 'border-slate-800 bg-[#0b1020] text-slate-400 hover:border-slate-700',
              ].join(' ')}
              style={!isActive ? importedButtonStyle : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5">
        {isLoading && filteredThreads.length === 0 ? (
          <div className="text-slate-500">{t('피드백을 불러오는 중입니다…', 'Loading feedback…')}</div>
        ) : filteredThreads.length === 0 ? (
          <div className={`${COMMENT_SECTION} p-4 text-slate-500`} style={importedSectionStyle}>
            {t('아직 표시할 피드백이 없습니다.', 'No feedback to show yet.')}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredThreads.map(thread => {
              const targetLabel = getCommentTargetLabel(thread.root.targetType, thread.root.targetMeta, components, appLanguage);
              const isSelected = selectedThread?.root.id === thread.root.id;
              const statusMeta = STATUS_COPY[thread.root.status];

              return (
                <article
                  key={thread.root.id}
                  ref={node => {
                    if (node) {
                      threadRefs.current.set(thread.root.id, node);
                    } else {
                      threadRefs.current.delete(thread.root.id);
                    }
                  }}
                  className={[
                    'rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow,transform] duration-200',
                    isSelected
                      ? 'border-sky-400/40 bg-sky-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'
                      : 'border-slate-800 bg-[#0b1020] hover:border-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
                    highlightedThreadId === thread.root.id
                      ? 'ring-1 ring-violet-300/60 shadow-[0_0_0_1px_rgba(196,181,253,0.28),0_0_28px_rgba(139,92,246,0.28)]'
                      : '',
                  ].join(' ')}
                  style={!isSelected ? importedCardStyle : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        selectComment(thread.root.id);
                        focusComment(thread.root);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusMeta.tone}`}>
                          {pickLanguage(appLanguage, statusMeta.label)}
                        </span>
                        <span className="truncate text-[10px] text-slate-500">{targetLabel}</span>
                      </div>
                      <div className="mt-2 text-[12px] leading-relaxed text-slate-100">
                        {thread.root.content}
                      </div>
                      <div className="mt-2 text-[10px] text-slate-500">
                        {new Date(thread.root.createdAt).toLocaleString(appLanguage === 'ko' ? 'ko-KR' : 'en-US')}
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-1.5 self-start">
                      <button
                        type="button"
                        onClick={() => startReplyDraft(thread)}
                      className="rounded-md border border-slate-800 bg-[#101726] px-2 py-1 text-[10px] text-slate-300 hover:border-slate-700"
                      style={importedButtonStyle}
                    >
                        {t('답글', 'Reply')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void setCommentStatus(thread.root.id, thread.root.status === 'resolved' ? 'open' : 'resolved')}
                      className="rounded-md border border-slate-800 bg-[#101726] px-2 py-1 text-[10px] text-slate-300 hover:border-slate-700"
                      style={importedButtonStyle}
                    >
                        {thread.root.status === 'resolved' ? t('다시 열기', 'Reopen') : t('해결', 'Resolve')}
                      </button>
                    </div>
                  </div>

                  {thread.replies.length > 0 && (
                    <div className="mt-3.5 space-y-2.5 border-t border-slate-800/80 pt-3.5">
                      {thread.replies.map(reply => (
                        <button
                          key={reply.id}
                          ref={node => {
                            if (node) {
                              replyRefs.current.set(reply.id, node);
                            } else {
                              replyRefs.current.delete(reply.id);
                            }
                          }}
                          type="button"
                          onClick={() => {
                            selectComment(thread.root.id);
                            focusComment(reply);
                          }}
                          className={[
                            `flex w-full items-start gap-2 ${COMMENT_CARD} px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200`,
                            highlightedCommentId === reply.id
                              ? 'border-violet-300/60 bg-violet-500/12 shadow-[0_0_0_1px_rgba(196,181,253,0.22),0_0_24px_rgba(139,92,246,0.22)]'
                              : 'border-slate-800 hover:border-slate-700',
                          ].join(' ')}
                          style={highlightedCommentId === reply.id ? undefined : importedCardStyle}
                        >
                          <CornerDownRight size={12} className="mt-0.5 shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] leading-relaxed text-slate-200">
                              {reply.content}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-500">
                              {buildCommentPreview(reply.content, 72)} · {new Date(reply.createdAt).toLocaleString(appLanguage === 'ko' ? 'ko-KR' : 'en-US')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="border-t px-4 py-2 text-[10px] text-slate-500"
        style={{
          borderColor: importedSchematicMode ? importedPalette.shellBorder : '#21262d',
          color: importedSchematicMode ? importedPalette.shellMutedText : '#64748b',
        }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={11} className="text-slate-600" />
          {t(
            '해결 처리된 피드백은 캔버스에서 숨겨지고, 이 목록에서 다시 열 수 있습니다.',
            'Resolved feedback is hidden on the canvas and can be reopened from this list.'
          )}
        </div>
      </div>
    </div>
  );
}
