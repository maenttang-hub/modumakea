'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  CopyPlus,
  Eye,
  Library,
  Link2,
  Menu,
  MessageSquarePlus,
  PencilLine,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wifi,
  Terminal,
  Cpu,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { ShareProjectDialog } from '@/components/dashboard/share-project-dialog';
import type { ShellMode } from '@/components/app/home-shell-layout';
import { useProjectCollaboration } from '@/components/collaboration/project-collaboration-provider';
import { useProjectComments } from '@/components/comments/project-comments-provider';
import { getBoardById } from '@/constants/boards';
import {
  buildCloudProjectShareSummary,
  buildCloudProjectPath,
  buildCloudProjectShareUrl,
  getCloudProjectVisibilityLabel,
} from '@/lib/cloud-projects';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import { isImportedSchematicProject } from '@/lib/component-template-utils';
import { getImportedSchematicPalette } from '@/lib/imported-schematic-theme';
import { importKiCadSchematicAsync } from '@/lib/import-kicad-schematic-async';
import { detectKiCadFileKind } from '@/lib/kicad-file-kind';
import { validateImportedPcbDocument } from '@/lib/imported-pcb-validation';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import { getSupabaseStatus } from '@/lib/supabase';
import { pickLanguage } from '@/lib/ui-language';
import { useBoardStore } from '@/store/use-board-store';
import type { AppLanguage, CloudProjectVisibility } from '@/types';

type CollaborationHeaderBarProps = {
  issueCount: number;
  shellMode: ShellMode;
  onShellModeChange: (mode: ShellMode) => void;
  onOpenValidation: () => void;
  onOpenComments: () => void;
  onOpenPartsLibrary?: () => void;
  showPartsLibraryLauncher?: boolean;
};

type MenuActionProps = {
  title: string;
  hint?: string;
  onClick: () => void;
};

function buildInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'MM';
  }

  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map(part => part[0]?.toUpperCase() ?? '').join('') || trimmed.slice(0, 2).toUpperCase();
}

function MenuAction({ title, hint, onClick }: MenuActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-900/80"
    >
      <div className="text-sm font-medium text-slate-100">{title}</div>
      {hint ? (
        <div className="shrink-0 rounded-full border border-slate-800 bg-[#111827] px-2 py-0.5 text-[10px] font-semibold text-slate-400">
          {hint}
        </div>
      ) : null}
    </button>
  );
}

function BoardPill({ boardId }: { boardId: string }) {
  const board = getBoardById(boardId);
  const Icon = boardId === 'esp32' ? Wifi : boardId === 'rpi4' ? Terminal : Cpu;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{
        background: `${board.accentColor}18`,
        border: `1px solid ${board.accentColor}40`,
        color: board.accentColor,
      }}
    >
      <Icon size={11} />
      {board.name}
    </div>
  );
}

export function CollaborationHeaderBar({
  issueCount,
  shellMode,
  onShellModeChange,
  onOpenValidation,
  onOpenComments,
  onOpenPartsLibrary,
  showPartsLibraryLauncher = false,
}: CollaborationHeaderBarProps) {
  const router = useRouter();
  const supabaseStatus = getSupabaseStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    me,
    participants,
  } = useProjectCollaboration();
  const { openThreads, enabled: commentsEnabled } = useProjectComments();
  const {
    projectName,
    appLanguage,
    setProjectName,
    setAppLanguage,
    activeBoardId,
    components,
    manualConnections,
    importedSchematicScene,
    toggleGrid,
    toggleMinimap,
    canUndo,
    canRedo,
    undo,
    redo,
    hydrateProject,
    setImportedPcbDocument,
    setWorkspaceMode,
    saveProjectToBrowser,
    loadProjectFromBrowser,
    clearCloudProjectState,
    isGuestStudentMode,
    setGuestStudentMode,
    lastCodeGenerationMeta,
    cloudProjectId,
    cloudProjectTitle,
    cloudVisibility,
    cloudIsSaving,
    cloudIsOwner,
    cloudLastSavedAt,
    createCloudProject,
    saveProjectToCloud,
    forkCloudProject,
    updateCloudVisibility,
    schematicTheme,
  } = useBoardStore();

  const isViewOnly = Boolean(cloudProjectId && !cloudIsOwner);
  const importedSchematicMode = isImportedSchematicProject(activeBoardId, components, importedSchematicScene);
  const importedPalette = getImportedSchematicPalette(schematicTheme);
  const t = useCallback((ko: string, en: string) => pickLanguage(appLanguage, { ko, en }), [appLanguage]);
  const visibilityLabel = getCloudProjectVisibilityLabel(cloudVisibility, appLanguage);
  const openThreadCount = openThreads.length;

  const presencePeople = useMemo(() => {
    const all = [me, ...participants].filter(Boolean);
    const deduped = new Map<string, NonNullable<typeof me>>();
    for (const participant of all) {
      if (!participant) {
        continue;
      }
      deduped.set(participant.sessionId, participant);
    }
    return [...deduped.values()].slice(0, 5);
  }, [me, participants]);

  const cloudStorageBadge = supabaseStatus.enabled
    ? cloudProjectId
      ? {
          label: cloudIsOwner ? t('클라우드 자동 저장', 'Cloud autosave') : t('공유 링크 보기 전용', 'Shared view only'),
          tone: cloudIsOwner ? 'sky' : 'slate',
        }
      : {
          label: t('클라우드 공유 가능', 'Cloud sharing ready'),
          tone: 'sky',
        }
    : {
        label: t('클라우드 저장 꺼짐', 'Cloud save off'),
        tone: 'amber',
      };

  const localSaveBadge = isGuestStudentMode
    ? t('현재 저장: 학생 로컬', 'Current save: student local')
    : t('현재 저장: 브라우저 로컬', 'Current save: browser local');

  const primarySaveLabel = cloudProjectId
    ? cloudIsOwner
      ? cloudIsSaving
        ? t('저장 중', 'Saving')
        : t('저장', 'Save')
      : t('복제', 'Fork')
    : supabaseStatus.enabled
      ? t('클라우드 저장', 'Save to cloud')
      : isGuestStudentMode
        ? t('학생 로컬 저장', 'Save student local')
        : t('로컬 저장', 'Save locally');

  const aiStatusLabel = lastCodeGenerationMeta
    ? `${lastCodeGenerationMeta.label}${lastCodeGenerationMeta.repaired ? t(' 재점검', ' reviewed') : lastCodeGenerationMeta.fallback ? t(' 폴백', ' fallback') : ''}`
    : t('AI 대기', 'AI idle');

  const closeMenu = () => setMenuOpen(false);
  const chromeButtonStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellElevatedBackground,
        color: importedPalette.shellForeground,
      }
    : undefined;
  const chromePillStyle = importedSchematicMode
    ? {
        borderColor: importedPalette.shellBorder,
        background: importedPalette.shellPanelBackground,
        color: importedPalette.shellForeground,
      }
    : undefined;

  const applyAppLanguage = useCallback(async (language: AppLanguage) => {
    setAppLanguage(language);
    try {
      await fetch('/api/preferences/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
    } catch {
      // Keep local language switching responsive even if cookie sync fails.
    }
    router.refresh();
  }, [router, setAppLanguage]);

  const copyShareLinkForProject = useCallback(async (projectId: string) => {
    const shareUrl = buildCloudProjectShareUrl(projectId);

    try {
      await navigator.clipboard.writeText(shareUrl);
      return { success: true as const, shareUrl };
    } catch (error) {
      return {
        success: false as const,
        shareUrl,
        error: error instanceof Error
          ? error.message
          : t('브라우저에서 클립보드 복사를 허용하지 않았습니다.', 'Clipboard access is not available in this browser.'),
      };
    }
  }, [t]);

  const handleLocalSave = useCallback(async () => {
    const result = await saveProjectToBrowser();
    if (!result.success) {
      toast.error(t('저장 실패', 'Save failed'), { description: result.error });
      return;
    }

    toast.success(
      isGuestStudentMode ? t('학생 로컬 저장 완료', 'Student local save complete') : t('로컬 저장 완료', 'Local save complete'),
      {
        description: isGuestStudentMode
          ? t('이 프로젝트는 학생 로컬 보관함에 저장되었습니다.', 'This project has been saved in student-local storage.')
          : t('이 프로젝트는 현재 브라우저 저장소에 저장되었습니다.', 'This project has been saved in the current browser storage.'),
      }
    );
  }, [isGuestStudentMode, saveProjectToBrowser, t]);

  const handleCopyCloudShareLink = useCallback(async () => {
    if (!cloudProjectId) {
      return;
    }

    const copyResult = await copyShareLinkForProject(cloudProjectId);
    const shareSummary = buildCloudProjectShareSummary({
      title: cloudProjectTitle || projectName,
      visibility: cloudVisibility,
      language: appLanguage,
    });
    if (!copyResult.success) {
      toast.error(t('링크 복사 실패', 'Could not copy link'), {
        description: appLanguage === 'ko'
          ? `${shareSummary}. 직접 복사해 주세요. ${copyResult.shareUrl}`
          : `${shareSummary}. Please copy it manually. ${copyResult.shareUrl}`,
      });
      return;
    }

    toast.success(t('링크를 복사했습니다.', 'Link copied.'), {
      description: appLanguage === 'ko'
        ? `${shareSummary}. 방금 복사한 링크는 ${visibilityLabel} 상태입니다. ${copyResult.shareUrl}`
        : `${shareSummary}. The copied link is currently ${visibilityLabel.toLowerCase()}. ${copyResult.shareUrl}`,
    });
  }, [appLanguage, cloudProjectId, cloudProjectTitle, cloudVisibility, copyShareLinkForProject, projectName, t, visibilityLabel]);

  const handlePrimarySaveAction = useCallback(async () => {
    if (cloudProjectId) {
      if (!cloudIsOwner) {
        const result = await forkCloudProject();
        if (!result.success || !result.projectId) {
          toast.error(t('복제본을 만들지 못했습니다.', 'Could not make a copy.'), {
            description: result.error,
          });
          return;
        }

        router.push(buildCloudProjectPath(result.projectId), { scroll: false });
        toast.success(t('복제본을 만들었습니다.', 'Copy created.'), {
          description: t('이제 이 프로젝트는 내 편집본으로 전환되어 자유롭게 수정할 수 있습니다.', 'This project is now your editable copy, so you can change it freely.'),
        });
        return;
      }

      const result = await saveProjectToCloud();
      if (!result.success) {
        toast.error(t('클라우드 저장 실패', 'Cloud save failed'), {
          description: result.error,
        });
        return;
      }

      toast.success(t('클라우드 저장 완료', 'Cloud save complete'), {
        description: cloudLastSavedAt
          ? t('링크 프로젝트의 최신 상태를 반영했습니다.', 'The shared project was updated with the latest changes.')
          : t('링크 프로젝트에 최신 회로와 코드를 반영했습니다.', 'Applied the latest circuit and code changes to the shared project.'),
      });
      return;
    }

    if (supabaseStatus.enabled) {
      const result = await createCloudProject('unlisted');
      if (!result.success || !result.projectId) {
        toast.error(t('클라우드 프로젝트를 만들지 못했습니다.', 'Could not create the cloud project.'), {
          description: result.error,
        });
        return;
      }

      const copyResult = await copyShareLinkForProject(result.projectId);
      const shareSummary = buildCloudProjectShareSummary({
        title: projectName,
        visibility: 'unlisted',
        language: appLanguage,
      });
      router.push(buildCloudProjectPath(result.projectId), { scroll: false });
      toast.success(t('클라우드 공유 시작', 'Cloud sharing started'), {
        description: copyResult.success
          ? appLanguage === 'ko'
            ? `${shareSummary}. 링크 프로젝트를 만들고 바로 복사했습니다. ${copyResult.shareUrl}`
            : `${shareSummary}. The shared link project was created and copied right away. ${copyResult.shareUrl}`
          : appLanguage === 'ko'
            ? `${shareSummary}. 링크 프로젝트를 만들었지만 자동 복사는 실패해 링크 버튼으로 다시 복사해 주세요. ${copyResult.shareUrl}`
            : `${shareSummary}. The shared link project was created, but automatic copy failed. Please use the copy button again. ${copyResult.shareUrl}`,
      });
      return;
    }

    await handleLocalSave();
  }, [
    appLanguage,
    cloudIsOwner,
    cloudLastSavedAt,
    cloudProjectId,
    copyShareLinkForProject,
    createCloudProject,
    forkCloudProject,
    handleLocalSave,
    projectName,
    router,
    saveProjectToCloud,
    supabaseStatus.enabled,
    t,
  ]);

  const handleCreateCloudProjectWithVisibility = useCallback(async (visibility: CloudProjectVisibility) => {
    const result = await createCloudProject(visibility);
    if (!result.success || !result.projectId) {
      toast.error(t('클라우드 프로젝트를 만들지 못했습니다.', 'Could not create the cloud project.'), {
        description: result.error,
      });
      return result;
    }

    const copyResult = await copyShareLinkForProject(result.projectId);
    const shareSummary = buildCloudProjectShareSummary({
      title: projectName,
      visibility,
      language: appLanguage,
    });
    router.push(buildCloudProjectPath(result.projectId), { scroll: false });
    if (copyResult.success) {
      toast.success(t('공유 링크 생성 + 복사 완료', 'Shared link created and copied'), {
        description: appLanguage === 'ko'
          ? `${shareSummary}. 링크 프로젝트를 만들고 바로 복사했습니다. ${copyResult.shareUrl}`
          : `${shareSummary}. The shared link project was created and copied right away. ${copyResult.shareUrl}`,
      });
    } else {
      toast.success(t('공유 프로젝트 생성 완료', 'Shared project created'), {
        description: appLanguage === 'ko'
          ? `${shareSummary}. 링크 프로젝트를 만들었지만 자동 복사는 실패해 링크 버튼으로 다시 복사해 주세요. ${copyResult.shareUrl}`
          : `${shareSummary}. The shared link project was created, but automatic copy failed. Please use the copy button again. ${copyResult.shareUrl}`,
      });
    }
    return result;
  }, [appLanguage, copyShareLinkForProject, createCloudProject, projectName, router, t]);

  const handleUpdateCloudVisibility = useCallback(async (visibility: CloudProjectVisibility) => {
    const result = await updateCloudVisibility(visibility);
    if (!result.success) {
      toast.error(t('공개 범위를 바꾸지 못했습니다.', 'Could not update visibility.'), {
        description: result.error,
      });
    }
    return result;
  }, [t, updateCloudVisibility]);

  const handleForkCloudProject = useCallback(async () => {
    const result = await forkCloudProject();
    if (!result.success || !result.projectId) {
      toast.error(t('복제본을 만들지 못했습니다.', 'Could not make a copy.'), {
        description: result.error,
      });
      return result;
    }

    router.push(buildCloudProjectPath(result.projectId), { scroll: false });
    toast.success(t('복제본을 만들었습니다.', 'Copy created.'));
    return result;
  }, [forkCloudProject, router, t]);

  const handleImportProjectFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const kiCadFileKind = detectKiCadFileKind(file.name, text);
      if (kiCadFileKind === 'pcb') {
        const pcbDocument = parseKiCadPcb(text, { sourceFilename: file.name });
        const validation = validateImportedPcbDocument(pcbDocument, {
          schematicParity: {
            components,
            manualConnections,
            importedSchematicScene,
          },
        });
        setImportedPcbDocument(pcbDocument, text, validation);
        setWorkspaceMode('pcb');
        clearCloudProjectState();
        if (cloudProjectId) {
          router.replace('/', { scroll: false });
        }
        toast.success(t('KiCad PCB 파일을 불러왔습니다.', 'KiCad PCB loaded.'), {
          description: appLanguage === 'ko'
            ? `${pcbDocument.stats.footprintCount}개 풋프린트 · ${pcbDocument.stats.segmentCount}개 트랙 · 대표 사전점검 ${validation.issueCount}개`
            : `${pcbDocument.stats.footprintCount} footprints · ${pcbDocument.stats.segmentCount} tracks · ${validation.issueCount} representative pre-checks`,
        });
        return;
      }

      if (kiCadFileKind !== 'schematic') {
        toast.error(t('KiCad 파일만 불러올 수 있습니다.', 'Only KiCad files can be imported.'), {
          description: t(
            '.kicad_sch, .kicad_pcb 또는 KiCad PCB 텍스트 파일을 선택해 주세요.',
            'Please choose a .kicad_sch, .kicad_pcb, or KiCad PCB text file.'
          ),
        });
        return;
      }

      const imported = await importKiCadSchematicAsync(text, {
        projectName: file.name.replace(/\.kicad_sch$/i, ''),
      });
      const payload = {
        ...imported.document,
        integratedValidationJson: buildImportedSchematicIntegratedValidationJson({
          document: imported.document,
          importedSource: text,
          importSummary: imported.summary,
        }),
      };
      const result = hydrateProject(payload);

      if (!result.success) {
        toast.error(t('불러오기 실패', 'Load failed'), { description: result.error });
        return;
      }

      clearCloudProjectState();
      if (cloudProjectId) {
        router.replace('/', { scroll: false });
      }
      toast.success(t('프로젝트 불러오기 완료', 'Project loaded'), {
        description: appLanguage === 'ko'
          ? `${file.name} 파일을 작업 공간에 복구했습니다.${result.notice ? ` ${result.notice}` : ''}`
          : `Restored ${file.name} into the workspace.${result.notice ? ` ${result.notice}` : ''}`,
      });
    } catch (error) {
      toast.error(t('불러오기 실패', 'Load failed'), {
        description:
          error instanceof Error && error.message
            ? error.message
            : t(
                'KiCad 파일을 읽는 중 오류가 발생했습니다.',
                'There was a problem reading the KiCad file.'
              ),
      });
    }
  }, [appLanguage, clearCloudProjectState, cloudProjectId, components, hydrateProject, importedSchematicScene, manualConnections, router, setImportedPcbDocument, setWorkspaceMode, t]);

  const handleLoadBrowserSave = useCallback(async () => {
    const result = await loadProjectFromBrowser();
    if (!result.success) {
      toast.error(t('불러오기 실패', 'Load failed'), { description: result.error });
      return;
    }
    toast.success(t('브라우저 저장본 복구 완료', 'Browser save restored'), result.notice ? { description: result.notice } : undefined);
  }, [loadProjectFromBrowser, t]);

  const handleOpenImportPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    const openPicker = () => handleOpenImportPicker();
    window.addEventListener('modumake:open-project-file-picker', openPicker);
    return () => window.removeEventListener('modumake:open-project-file-picker', openPicker);
  }, [handleOpenImportPicker]);

  return (
    <header
      className="relative z-[100] flex h-12 items-center gap-3 border-b px-3"
      style={{
        borderColor: importedSchematicMode ? importedPalette.shellBorder : '#21262d',
        background: importedSchematicMode ? importedPalette.shellPanelAltBackground : '#0d1117',
        color: importedSchematicMode ? importedPalette.shellForeground : '#e2e8f0',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".kicad_sch,.kicad_pcb,.pcb,text/plain"
        className="hidden"
        onChange={async event => {
          const file = event.target.files?.[0];
          const currentTarget = event.currentTarget;
          if (file) {
            await handleImportProjectFile(file);
          }
          if (currentTarget) {
            currentTarget.value = '';
          }
        }}
      />

      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMenuOpen(open => !open)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border transition hover:border-slate-600 hover:text-white"
          style={chromeButtonStyle}
          title={t('파일/보기/설정 메뉴', 'File, view, and settings menu')}
        >
          <Menu size={15} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-blue-600 to-violet-600 text-white">
          <Zap size={14} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={projectName}
            onChange={event => setProjectName(event.target.value)}
            className="min-w-[120px] max-w-[220px] truncate bg-transparent text-sm font-medium outline-none"
            style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#f8fafc' }}
          />
          {importedSchematicMode ? null : (
            <span className="hidden text-xs sm:inline" style={{ color: '#64748b' }}>.modumake</span>
          )}
          <BoardPill boardId={activeBoardId} />
          <div
            className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold xl:inline-flex"
            style={
              cloudStorageBadge.tone === 'sky'
                ? { borderColor: 'rgba(56,189,248,0.28)', background: 'rgba(56,189,248,0.12)', color: '#7dd3fc' }
                : cloudStorageBadge.tone === 'amber'
                  ? { borderColor: 'rgba(251,191,36,0.28)', background: 'rgba(245,158,11,0.12)', color: '#fcd34d' }
                  : { borderColor: 'rgba(148,163,184,0.24)', background: 'rgba(148,163,184,0.1)', color: '#cbd5e1' }
            }
          >
            {cloudStorageBadge.label}
          </div>
          <div className="hidden rounded-full border px-2.5 py-1 text-[11px] font-semibold xl:inline-flex" style={chromePillStyle}>
            {localSaveBadge}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 items-center justify-center lg:flex">
        <div className="flex items-center gap-2">
          {presencePeople.length === 0 ? (
            <div className="rounded-full border px-3 py-1 text-[11px]" style={chromePillStyle}>
              {t('혼자 작업 중', 'Working solo')}
            </div>
          ) : (
            <>
              {presencePeople.map((participant, index) => (
                <div
                  key={participant.sessionId}
                  className="flex items-center gap-2 rounded-full border px-2 py-1"
                  style={{ marginLeft: index === 0 ? 0 : -6, ...chromePillStyle }}
                  title={participant.userName}
                >
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-[#0d1117]"
                    style={{ background: participant.color }}
                  >
                    {buildInitials(participant.userName)}
                  </div>
                  <span className="hidden max-w-[96px] truncate text-[11px] 2xl:inline" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#cbd5e1' }}>
                    {participant.userName}
                  </span>
                </div>
              ))}
              <div className="rounded-full border px-2.5 py-1 text-[11px]" style={chromePillStyle}>
                {t('함께 검토 중', 'Reviewing together')}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {!importedSchematicMode && showPartsLibraryLauncher && onOpenPartsLibrary ? (
          <button
            type="button"
            onClick={onOpenPartsLibrary}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition hover:border-violet-500/35 hover:text-violet-200"
            style={chromeButtonStyle}
            title={t('부품 라이브러리를 엽니다.', 'Open the parts library.')}
          >
            <Library size={13} />
            {t('부품', 'Parts')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onOpenValidation}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition ${
            issueCount > 0
              ? 'border-rose-500/35 bg-rose-500/12 text-rose-200 hover:bg-rose-500/18'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/16'
          }`}
          style={
            importedSchematicMode
              ? issueCount > 0
                ? schematicTheme === 'light'
                  ? { borderColor: '#fb7185', background: '#fff1f2', color: '#9f1239' }
                  : { borderColor: 'rgba(251,113,133,0.38)', background: 'rgba(244,63,94,0.12)', color: '#fecdd3' }
                : schematicTheme === 'light'
                  ? { borderColor: '#22c55e', background: '#dcfce7', color: '#14532d' }
                  : { borderColor: 'rgba(34,197,94,0.34)', background: 'rgba(34,197,94,0.12)', color: '#dcfce7' }
              : undefined
          }
          title={issueCount > 0 ? t('검증 이슈를 열어 바로 확인합니다.', 'Open validation issues right away.') : t('검증 결과를 엽니다.', 'Open the validation results.')}
        >
          {issueCount > 0 ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
          {issueCount > 0 ? `${issueCount}` : t('통과', 'Pass')}
        </button>

        <button
          type="button"
          onClick={onOpenComments}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition hover:border-sky-500/35 hover:text-sky-200"
          style={chromeButtonStyle}
          title={commentsEnabled ? t('댓글과 스레드를 엽니다.', 'Open comments and threads.') : t('링크 프로젝트에서 댓글이 활성화됩니다.', 'Comments become available in shared projects.')}
        >
          <MessageSquarePlus size={13} />
          {commentsEnabled ? openThreadCount : 0}
        </button>

        {importedSchematicMode ? (
          <div
            className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold"
            style={chromeButtonStyle}
            title={t('가져온 KiCad 회로도를 검토하는 화면입니다.', 'This screen is dedicated to reviewing the imported KiCad schematic.')}
          >
            <Eye size={12} />
            {t('리뷰 전용', 'Review only')}
          </div>
        ) : (
          <>
            <div className="inline-flex h-8 items-center rounded-md border p-0.5" style={chromeButtonStyle}>
              <button
                type="button"
                disabled={isViewOnly}
                onClick={() => onShellModeChange('review')}
                className={`inline-flex h-full items-center gap-1 rounded-[5px] px-2.5 text-xs font-semibold transition ${isViewOnly ? 'cursor-default opacity-80' : ''}`}
                style={
                  shellMode === 'review'
                    ? importedSchematicMode && schematicTheme === 'dark'
                      ? { background: 'rgba(56,189,248,0.16)', color: '#bae6fd' }
                      : importedSchematicMode
                        ? { background: '#e0f2fe', color: '#075985' }
                        : { background: '#e2e8f0', color: '#0f172a' }
                    : { color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8' }
                }
              >
                <Eye size={12} />
                {t('리뷰', 'Review')}
              </button>
              <button
                type="button"
                disabled={isViewOnly}
                onClick={() => onShellModeChange('edit')}
                className={`inline-flex h-full items-center gap-1 rounded-[5px] px-2.5 text-xs font-semibold transition ${isViewOnly ? 'cursor-default opacity-60' : ''}`}
                style={
                  shellMode === 'edit'
                    ? importedSchematicMode && schematicTheme === 'dark'
                      ? { background: 'rgba(56,189,248,0.16)', color: '#bae6fd' }
                      : importedSchematicMode
                        ? { background: '#e0f2fe', color: '#075985' }
                        : { background: '#e2e8f0', color: '#0f172a' }
                    : { color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8' }
                }
              >
                <PencilLine size={12} />
                {t('편집', 'Edit')}
              </button>
            </div>

            <div
              className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold lg:inline-flex"
              style={{
                background: lastCodeGenerationMeta
                  ? 'rgba(56,189,248,0.12)'
                  : importedSchematicMode
                    ? importedPalette.shellElevatedBackground
                    : '#111827',
                borderColor: lastCodeGenerationMeta
                  ? 'rgba(56,189,248,0.28)'
                  : importedSchematicMode
                    ? importedPalette.shellBorder
                    : '#1f2937',
                color: lastCodeGenerationMeta ? '#7dd3fc' : importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8',
              }}
              title={lastCodeGenerationMeta?.model ?? t('아직 코드 생성 전입니다.', 'No code has been generated yet.')}
            >
              <Sparkles size={12} />
              {aiStatusLabel}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            void handlePrimarySaveAction();
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-[#111827] px-3 text-xs font-semibold text-white transition hover:opacity-90"
          style={{
            background: cloudProjectId && !cloudIsOwner
              ? 'linear-gradient(135deg, #0f766e, #2563eb)'
              : cloudProjectId
                ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                : 'linear-gradient(135deg, #334155, #475569)',
          }}
          title={
            cloudProjectId
              ? cloudIsOwner
                ? t('현재 링크 프로젝트의 최신 상태를 저장합니다.', 'Save the latest state of the shared project.')
                : t('이 프로젝트를 내 편집본으로 복제합니다.', 'Fork this project into your editable copy.')
              : supabaseStatus.enabled
                ? t('클라우드 공유 프로젝트를 만들며 저장합니다.', 'Save by creating a shared cloud project.')
                : t('현재는 로컬 저장 방식으로 저장합니다.', 'Save using the current local mode.')
          }
        >
          {cloudProjectId && !cloudIsOwner ? <CopyPlus size={12} /> : <Save size={12} />}
          {primarySaveLabel}
        </button>

        <button
          type="button"
          onClick={() => setIsShareDialogOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/15 px-3 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/20"
        >
          <Link2 size={12} />
          {t('공유', 'Share')}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div
            className="absolute left-3 top-[44px] z-50 w-[320px] overflow-hidden rounded-xl border shadow-2xl"
            style={{
              borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937',
              background: importedSchematicMode ? importedPalette.shellElevatedBackground : '#0b1220',
            }}
          >
            <div
              className="border-b px-4 py-3"
              style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937' }}
            >
              <div className="text-sm font-semibold" style={{ color: importedSchematicMode ? importedPalette.shellForeground : '#f8fafc' }}>
                {importedSchematicMode ? t('리뷰 메뉴', 'Review menu') : t('작업 메뉴', 'Workspace menu')}
              </div>
              <div className="mt-1 text-xs" style={{ color: importedSchematicMode ? importedPalette.shellMutedText : '#94a3b8' }}>
                {importedSchematicMode
                  ? t('도면 리뷰에 필요한 동작만 남겼습니다.', 'Only the actions needed for schematic review remain here.')
                  : t('자주 쓰는 작업만 짧게 모아뒀습니다.', 'The common actions are kept short and easy to scan here.')}
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('프로젝트', 'Project')}
              </div>
              <MenuAction
                title={t('KiCad 회로도 불러오기', 'Import KiCad schematic')}
                hint=".kicad_sch"
                onClick={() => {
                  closeMenu();
                  handleOpenImportPicker();
                }}
              />
              <MenuAction
                title={t('이 기기 저장본', 'This device save')}
                hint={t('브라우저 로컬', 'Browser local')}
                onClick={() => {
                  closeMenu();
                  void handleLoadBrowserSave();
                }}
              />
              <MenuAction
                title={t('지금 저장', 'Save now')}
                hint={primarySaveLabel}
                onClick={() => {
                  closeMenu();
                  void handlePrimarySaveAction();
                }}
              />
              {importedSchematicMode ? null : (
                <MenuAction
                  title={t('그림으로 저장', 'Save image')}
                  hint="PNG / SVG"
                  onClick={() => {
                    closeMenu();
                    window.dispatchEvent(new CustomEvent('modumake:export-schematic-png'));
                  }}
                />
              )}

              <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {t('보기', 'View')}
              </div>
              <MenuAction
                title={t('화면 맞춤', 'Fit view')}
                hint={t('전체 보기', 'Full view')}
                onClick={() => {
                  closeMenu();
                  window.dispatchEvent(new CustomEvent('modumake:fit-view'));
                }}
              />
              {importedSchematicMode ? null : (
                <>
                  <MenuAction
                    title={t('격자', 'Grid')}
                    hint={t('배치 기준선', 'Guide lines')}
                    onClick={() => {
                      closeMenu();
                      toggleGrid();
                    }}
                  />
                  <MenuAction
                    title={t('미니맵', 'Minimap')}
                    hint={t('전체 위치', 'Overview')}
                    onClick={() => {
                      closeMenu();
                      toggleMinimap();
                    }}
                  />
                </>
              )}
            </div>
            <div
              className="border-t px-4 py-3"
              style={{ borderColor: importedSchematicMode ? importedPalette.shellBorder : '#1f2937' }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-8 items-center rounded-md border p-0.5" style={chromeButtonStyle}>
                  {(['ko', 'en'] as const).map(language => {
                    const isActive = appLanguage === language;
                    return (
                      <button
                        key={language}
                        type="button"
                        onClick={() => void applyAppLanguage(language)}
                        className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition ${
                          isActive ? 'bg-slate-200 text-slate-900' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {language.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                {!importedSchematicMode ? (
                  <button
                    type="button"
                    onClick={() => {
                      const nextEnabled = !isGuestStudentMode;
                      setGuestStudentMode(nextEnabled);
                      toast.success(
                        nextEnabled
                          ? t('학생 로컬 모드 켜짐', 'Student-local mode on')
                          : t('학생 로컬 모드 꺼짐', 'Student-local mode off')
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition hover:border-slate-600 hover:text-white"
                    style={chromeButtonStyle}
                  >
                    <ChevronDown size={11} />
                    {isGuestStudentMode ? t('학생 로컬', 'Student local') : t('기본 저장', 'Default save')}
                  </button>
                ) : null}
              </div>
              {!importedSchematicMode ? (
                <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                  <button
                    type="button"
                    disabled={!canUndo}
                    onClick={() => {
                      closeMenu();
                      undo();
                    }}
                    className="rounded-md border border-slate-800 bg-[#111827] px-2.5 py-1 text-slate-300 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {t('되돌리기', 'Undo')}
                  </button>
                  <button
                    type="button"
                    disabled={!canRedo}
                    onClick={() => {
                      closeMenu();
                      redo();
                    }}
                    className="rounded-md border border-slate-800 bg-[#111827] px-2.5 py-1 text-slate-300 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {t('다시하기', 'Redo')}
                  </button>
                </div>
              ) : (
                <div className="mt-3 text-[11px]" style={{ color: importedPalette.shellMutedText }}>
                  {t(
                    '이 화면에서는 도면 리뷰와 저장, 댓글 흐름만 남겨두었습니다.',
                    'This view keeps only review, save, and commenting actions.'
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ShareProjectDialog
        key={`${isShareDialogOpen ? 'open' : 'closed'}:${cloudProjectId ?? 'local'}:${cloudVisibility}:${cloudIsOwner ? 'owner' : 'viewer'}`}
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
        supabaseEnabled={supabaseStatus.enabled}
        supabaseReason={supabaseStatus.reason}
        cloudProjectId={cloudProjectId}
        cloudProjectTitle={cloudProjectTitle}
        cloudVisibility={cloudVisibility}
        cloudIsOwner={cloudIsOwner}
        cloudIsSaving={cloudIsSaving}
        projectName={projectName}
        onCreateProject={handleCreateCloudProjectWithVisibility}
        onUpdateVisibility={handleUpdateCloudVisibility}
        onCopyLink={handleCopyCloudShareLink}
        onForkProject={handleForkCloudProject}
      />
    </header>
  );
}
