'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  buildCloudProjectShareUrl,
  getCloudProjectVisibilityDescription,
  getCloudProjectVisibilityLabel,
} from '@/lib/cloud-projects';
import type { CloudProjectVisibility } from '@/types';
import { CheckCircle2, CopyPlus, Globe2, Link2, LockKeyhole, Sparkles } from 'lucide-react';

type ShareProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supabaseEnabled: boolean;
  supabaseReason: 'missing-env' | 'invalid-url' | 'placeholder-env' | 'init-failed' | undefined;
  cloudProjectId: string | null;
  cloudProjectTitle: string;
  cloudVisibility: CloudProjectVisibility;
  cloudIsOwner: boolean;
  cloudIsSaving: boolean;
  projectName: string;
  onCreateProject: (visibility: CloudProjectVisibility) => Promise<{
    success: boolean;
    error?: string;
    projectId?: string;
  }>;
  onUpdateVisibility: (visibility: CloudProjectVisibility) => Promise<{
    success: boolean;
    error?: string;
  }>;
  onCopyLink: () => Promise<void>;
  onForkProject: () => Promise<{
    success: boolean;
    error?: string;
    projectId?: string;
  }>;
};

const VISIBILITY_OPTIONS: CloudProjectVisibility[] = ['private', 'unlisted', 'public'];

function toneForVisibility(visibility: CloudProjectVisibility) {
  switch (visibility) {
    case 'public':
      return {
        background: 'rgba(34,197,94,0.14)',
        border: '1px solid rgba(74,222,128,0.3)',
        color: '#86efac',
        icon: Globe2,
      };
    case 'private':
      return {
        background: 'rgba(239,68,68,0.12)',
        border: '1px solid rgba(248,113,113,0.28)',
        color: '#fca5a5',
        icon: LockKeyhole,
      };
    default:
      return {
        background: 'rgba(56,189,248,0.14)',
        border: '1px solid rgba(56,189,248,0.28)',
        color: '#7dd3fc',
        icon: Link2,
      };
  }
}

export function ShareProjectDialog({
  open,
  onOpenChange,
  supabaseEnabled,
  supabaseReason,
  cloudProjectId,
  cloudProjectTitle,
  cloudVisibility,
  cloudIsOwner,
  cloudIsSaving,
  projectName,
  onCreateProject,
  onUpdateVisibility,
  onCopyLink,
  onForkProject,
}: ShareProjectDialogProps) {
  const [selectedVisibility, setSelectedVisibility] = useState<CloudProjectVisibility>(cloudVisibility);
  const [pendingAction, setPendingAction] = useState<'create' | 'visibility' | 'copy' | 'fork' | null>(null);

  const effectiveVisibility = cloudProjectId ? cloudVisibility : selectedVisibility;
  const visibilityTone = toneForVisibility(effectiveVisibility);
  const VisibilityIcon = visibilityTone.icon;
  const shareUrl = useMemo(
    () => (cloudProjectId ? buildCloudProjectShareUrl(cloudProjectId) : null),
    [cloudProjectId]
  );

  const availabilityMessage = supabaseEnabled
    ? '클라우드 공유를 켜면 링크 한 개로 프로젝트를 열고 자동 저장 상태를 이어갈 수 있습니다.'
    : supabaseReason === 'invalid-url'
      ? 'Supabase 주소 형식이 올바르지 않아 지금은 로컬 저장만 사용 중입니다.'
      : supabaseReason === 'init-failed'
        ? 'Supabase 연결 초기화에 실패해 지금은 로컬 저장만 사용 중입니다.'
        : 'Supabase 환경 변수가 예시값 상태라 지금은 로컬 저장만 사용 중입니다.';

  const canCreate = supabaseEnabled && !cloudProjectId;
  const canChangeVisibility = Boolean(cloudProjectId && cloudIsOwner);
  const visibilityDirty = selectedVisibility !== cloudVisibility;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="w-[min(720px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220] p-0 text-slate-200 shadow-2xl"
      >
        <DialogHeader className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
              <Link2 size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-slate-100">공유 설정</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-400">
                {availabilityMessage}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
          <div className="border-b border-slate-800 bg-slate-950/30 p-5 md:border-b-0 md:border-r">
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: visibilityTone.background,
                border: visibilityTone.border,
                color: visibilityTone.color,
              }}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <VisibilityIcon size={15} />
                {getCloudProjectVisibilityLabel(effectiveVisibility)}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-slate-200/90">
                {getCloudProjectVisibilityDescription(effectiveVisibility)}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                현재 상태
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">프로젝트</span>
                  <span className="text-right font-semibold text-slate-100">
                    {cloudProjectTitle || projectName}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">저장 방식</span>
                  <span className="text-right font-semibold text-slate-100">
                    {cloudProjectId ? (cloudIsOwner ? '클라우드 자동 저장' : '공유 링크 보기 전용') : '브라우저 로컬 저장'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">공유 링크</span>
                  <span className="text-right font-semibold text-slate-100">
                    {cloudProjectId ? '생성됨' : supabaseEnabled ? '아직 없음' : '비활성화'}
                  </span>
                </div>
              </div>
            </div>

            {!supabaseEnabled && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                실제 클라우드 저장을 켜려면 Supabase 스키마를 적용하고 `.env.local`에 실제 키를 넣어 주세요.
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <label className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                공개 범위
              </label>
              <select
                value={selectedVisibility}
                disabled={!supabaseEnabled || !cloudIsOwner}
                onChange={event => setSelectedVisibility(event.target.value as CloudProjectVisibility)}
                className="mt-3 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {VISIBILITY_OPTIONS.map(option => (
                  <option key={option} value={option}>
                    {getCloudProjectVisibilityLabel(option)}
                  </option>
                ))}
              </select>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs leading-relaxed text-slate-400">
                {getCloudProjectVisibilityDescription(selectedVisibility)}
              </div>
              {cloudProjectId && !cloudIsOwner && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                  이 링크는 보기 전용이라 공개 범위를 바꿀 수 없습니다. 내 편집본으로 복제하면 직접 설정할 수 있습니다.
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    공유 링크
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {cloudProjectId
                      ? '이 주소를 복사해 그대로 전달하면 됩니다.'
                      : '클라우드 링크 프로젝트를 만들면 실제 주소를 바로 복사하고 여기에 보여줍니다.'}
                  </div>
                </div>
                {cloudProjectId && (
                  <button
                    type="button"
                    onClick={async () => {
                      setPendingAction('copy');
                      try {
                        await onCopyLink();
                      } finally {
                        setPendingAction(null);
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pendingAction !== null}
                  >
                    <CopyPlus size={13} />
                    {pendingAction === 'copy' ? '복사 중...' : '링크 복사'}
                  </button>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-[#0a1020] px-3 py-2 font-mono text-[11px] text-sky-200">
                {shareUrl ?? '공유 링크를 만들면 실제 URL이 여기에 바로 보입니다.'}
              </div>
            </div>

            {cloudProjectId && (
              <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-100">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={14} />
                  {cloudIsOwner ? '자동 저장 연결됨' : '공유 프로젝트 열람 중'}
                </div>
                <div className="mt-1">
                  {cloudIsOwner
                    ? '이 프로젝트는 변경 사항을 클라우드에 바로 반영할 수 있습니다.'
                    : '현재 링크는 보기 전용입니다. 복제본을 만들면 내 편집본으로 이어서 작업할 수 있습니다.'}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-slate-800 bg-slate-950/50 px-5 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            닫기
          </button>

          {!cloudProjectId && (
            <button
              type="button"
              disabled={!canCreate || pendingAction !== null}
              onClick={async () => {
                setPendingAction('create');
                try {
                  const result = await onCreateProject(selectedVisibility);
                  if (result.success) {
                    onOpenChange(false);
                  }
                } finally {
                  setPendingAction(null);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Sparkles size={13} />
              {pendingAction === 'create' || cloudIsSaving ? '링크 만들고 복사하는 중...' : '링크 만들고 복사'}
            </button>
          )}

          {cloudProjectId && !cloudIsOwner && (
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={async () => {
                setPendingAction('fork');
                try {
                  const result = await onForkProject();
                  if (result.success) {
                    onOpenChange(false);
                  }
                } finally {
                  setPendingAction(null);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <CopyPlus size={13} />
              {pendingAction === 'fork' ? '복제본 만드는 중...' : '내 편집본으로 복제'}
            </button>
          )}

          {canChangeVisibility && (
            <button
              type="button"
              disabled={!visibilityDirty || pendingAction !== null}
              onClick={async () => {
                setPendingAction('visibility');
                try {
                  const result = await onUpdateVisibility(selectedVisibility);
                  if (result.success) {
                    onOpenChange(false);
                  }
                } finally {
                  setPendingAction(null);
                }
              }}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              {pendingAction === 'visibility' || cloudIsSaving ? '공개 범위 저장 중...' : '공개 범위 적용'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
