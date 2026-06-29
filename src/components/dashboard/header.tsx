'use client';

/**
 * components/dashboard/header.tsx
 * EDA 스타일 글로벌 헤더 — 48px 고정, 메뉴바 형태
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConceptWizard } from '@/components/ai/concept-wizard';
import { ShareProjectDialog } from '@/components/dashboard/share-project-dialog';
import { getSurfaceFlags } from '@/constants/product-surface';
import { useBoardStore } from '@/store/use-board-store';
import { getBoardById } from '@/constants/boards';
import { buildStarterCode } from '@/lib/code-starter';
import { buildImportedSchematicIntegratedValidationJson } from '@/lib/build-imported-schematic-integrated-validation-json';
import { buildKiCadSchematic, buildKiCadSchematicFilename } from '@/lib/export-kicad';
import { importKiCadSchematicAsync } from '@/lib/import-kicad-schematic-async';
import {
  buildCloudProjectShareSummary,
  buildCloudProjectPath,
  buildCloudProjectShareUrl,
  getCloudProjectVisibilityLabel,
} from '@/lib/cloud-projects';
import { pickLanguage } from '@/lib/ui-language';
import { getSupabaseStatus } from '@/lib/supabase';
import { useUiDebugMode } from '@/lib/ui-debug';
import { toast } from 'sonner';
import { Zap, Save, Cpu, Wifi, Terminal, CircuitBoard, Settings, Sparkles, Link2, CopyPlus } from 'lucide-react';
import type { AppLanguage } from '@/types';

type HeaderMenuSectionId = 'file' | 'edit' | 'view' | 'tools' | 'help';
type HeaderMenuItemId =
  | 'new-project'
  | 'import-project-file'
  | 'load-browser-save'
  | 'save-project'
  | 'export-project-json'
  | 'export-schematic-image'
  | 'export-kicad'
  | 'export-ino'
  | 'export-py'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'delete'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit-view'
  | 'toggle-grid'
  | 'toggle-minimap'
  | 'start-ai-design'
  | 'change-board'
  | 'user-guide'
  | 'shortcuts'
  | 'about';

const MENU_SECTIONS: Array<{
  id: HeaderMenuSectionId;
  label: { ko: string; en: string };
  items: Array<HeaderMenuItemId | 'separator'>;
}> = [
  {
    id: 'file',
    label: { ko: '파일', en: 'File' },
    items: ['new-project', 'import-project-file', 'load-browser-save', 'save-project', 'export-project-json', 'export-schematic-image', 'export-kicad', 'separator', 'export-ino', 'export-py'],
  },
  {
    id: 'edit',
    label: { ko: '편집', en: 'Edit' },
    items: ['undo', 'redo', 'separator', 'select-all', 'delete'],
  },
  {
    id: 'view',
    label: { ko: '보기', en: 'View' },
    items: ['zoom-in', 'zoom-out', 'fit-view', 'separator', 'toggle-grid', 'toggle-minimap'],
  },
  {
    id: 'tools',
    label: { ko: '도구', en: 'Tools' },
    items: ['start-ai-design', 'change-board'],
  },
  {
    id: 'help',
    label: { ko: '도움말', en: 'Help' },
    items: ['user-guide', 'shortcuts', 'separator', 'about'],
  },
];

const MENU_ITEM_LABELS: Record<HeaderMenuItemId, { ko: string; en: string }> = {
  'new-project': { ko: '새 프로젝트', en: 'New project' },
  'import-project-file': { ko: '설계도 파일 불러오기', en: 'Open project file' },
  'load-browser-save': { ko: '브라우저 저장본 불러오기', en: 'Load browser save' },
  'save-project': { ko: '저장', en: 'Save' },
  'export-project-json': { ko: '설계도 파일 저장 (.json)', en: 'Save project file (.json)' },
  'export-schematic-image': { ko: '설계도 이미지 저장 (.png/.svg)', en: 'Save schematic image (.png/.svg)' },
  'export-kicad': { ko: 'KiCad 회로도 저장 (.kicad_sch)', en: 'Save KiCad schematic (.kicad_sch)' },
  'export-ino': { ko: '펌웨어 저장 (.ino)', en: 'Save firmware (.ino)' },
  'export-py': { ko: '펌웨어 저장 (.py)', en: 'Save firmware (.py)' },
  undo: { ko: '실행 취소', en: 'Undo' },
  redo: { ko: '다시 실행', en: 'Redo' },
  'select-all': { ko: '전체 선택', en: 'Select all' },
  delete: { ko: '삭제', en: 'Delete' },
  'zoom-in': { ko: '확대', en: 'Zoom in' },
  'zoom-out': { ko: '축소', en: 'Zoom out' },
  'fit-view': { ko: '화면에 맞추기', en: 'Fit to screen' },
  'toggle-grid': { ko: '격자 표시', en: 'Show grid' },
  'toggle-minimap': { ko: '미니맵', en: 'Minimap' },
  'start-ai-design': { ko: 'AI 설계 시작', en: 'Start AI design' },
  'change-board': { ko: '보드 변경', en: 'Change board' },
  'user-guide': { ko: '사용 가이드', en: 'Guide' },
  shortcuts: { ko: '단축키', en: 'Shortcuts' },
  about: { ko: 'ModuMake 소개', en: 'About ModuMake' },
};

function isHeaderMenuItemVisible(item: HeaderMenuItemId, flags: ReturnType<typeof getSurfaceFlags>) {
  if (!flags.showKiCadExport && item === 'export-kicad') {
    return false;
  }

  if (!flags.showCompileActions && (item === 'export-ino' || item === 'export-py')) {
    return false;
  }

  if (!flags.showConceptWizard && item === 'start-ai-design') {
    return false;
  }

  return true;
}

function trimHeaderMenuItems(
  items: Array<HeaderMenuItemId | 'separator'>,
  flags: ReturnType<typeof getSurfaceFlags>
) {
  const filtered = items.filter(item => item === 'separator' || isHeaderMenuItemVisible(item, flags));

  return filtered.filter((item, index) => {
    if (item !== 'separator') {
      return true;
    }

    const previous = filtered[index - 1];
    const next = filtered[index + 1];
    return previous !== undefined && previous !== 'separator' && next !== undefined && next !== 'separator';
  });
}

function BoardBadge({ boardId }: { boardId: string }) {
  const board = getBoardById(boardId);
  const Icon = boardId === 'esp32' ? Wifi : boardId === 'rpi4' ? Terminal : Cpu;
  return (
    <div
      className="flex items-center gap-1.5 px-2 h-6 font-mono text-xs font-bold"
      style={{
        background:   board.accentColor + '18',
        border:       `1px solid ${board.accentColor}50`,
        color:        board.accentColor,
      }}
    >
      <Icon size={10} />
      {board.name}
      <span style={{ color: board.accentColor + '70', fontSize: 9 }}>
        {board.logicVoltage}
      </span>
    </div>
  );
}

export function Header() {
  const uiDebugMode = useUiDebugMode();
  const router = useRouter();
  const surfaceFlags = getSurfaceFlags();
  const [activeMenu, setActiveMenu] = useState<HeaderMenuSectionId | null>(null);
  const [isConceptWizardOpen, setIsConceptWizardOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    projectName,
    appLanguage,
    setProjectName,
    setAppLanguage,
    activeBoardId,
    setActiveBoardId,
    clearBoard,
    toggleGrid,
    toggleMinimap,
    generatedCode,
    components,
    manualConnections,
    canUndo,
    canRedo,
    undo,
    redo,
    serializeProject,
    hydrateProject,
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
    cloudValidationPersistStatus,
    cloudValidationPersistError,
    createCloudProject,
    saveProjectToCloud,
    forkCloudProject,
    updateCloudVisibility,
  } = useBoardStore();
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const starterCode = buildStarterCode(activeBoardId, components);
  const supabaseStatus = getSupabaseStatus();
  const aiStatusTone = lastCodeGenerationMeta
    ? lastCodeGenerationMeta.provider === 'gemini'
      ? {
          background: 'rgba(14,165,233,0.14)',
          border: '1px solid rgba(56,189,248,0.32)',
          color: '#7dd3fc',
        }
      : lastCodeGenerationMeta.provider === 'anthropic'
        ? {
            background: 'rgba(168,85,247,0.14)',
            border: '1px solid rgba(192,132,252,0.32)',
            color: '#d8b4fe',
          }
        : {
            background: 'rgba(245,158,11,0.14)',
            border: '1px solid rgba(251,191,36,0.32)',
            color: '#fcd34d',
          }
    : {
        background: '#161b22',
        border: '1px solid rgba(148,163,184,0.24)',
        color: '#94a3b8',
      };
  const aiStatusLabel = lastCodeGenerationMeta
    ? `${lastCodeGenerationMeta.label}${lastCodeGenerationMeta.repaired ? t(' 재점검', ' reviewed') : lastCodeGenerationMeta.fallback ? t(' 폴백', ' fallback') : ''}`
    : t('AI 대기', 'AI idle');
  const visibleMenuSections = MENU_SECTIONS
    .map(menu => ({
      ...menu,
      items: trimHeaderMenuItems(menu.items, surfaceFlags),
    }))
    .filter(menu => menu.items.length > 0);
  const cloudStorageBadge = supabaseStatus.enabled
    ? cloudProjectId
      ? {
          label: cloudIsOwner
            ? cloudValidationPersistStatus === 'failed'
              ? t('검증 저장 재시도 필요', 'Validation save needs retry')
              : cloudValidationPersistStatus === 'saved'
                ? t('클라우드 자동 저장', 'Cloud autosave')
                : t('클라우드 자동 저장', 'Cloud autosave')
            : t('공유 링크 보기 전용', 'Shared link view only'),
          title: cloudIsOwner
            ? cloudValidationPersistStatus === 'failed'
              ? cloudValidationPersistError
                ?? t(
                  '프로젝트 저장은 성공했지만 validation snapshot 저장은 실패했습니다. 다시 저장하면 재시도합니다.',
                  'Project save succeeded, but persisting the validation snapshot failed. Saving again will retry it.'
                )
              : t('이 프로젝트는 링크 주소로 열 수 있고, 변경 사항이 자동으로 클라우드에 저장됩니다.', 'This project can be opened by link, and changes are saved to the cloud automatically.')
            : t('이 링크는 보기 전용 상태입니다. 복제본을 만들면 다시 편집할 수 있습니다.', 'This link is view only. Make a copy to edit it again.'),
          style: cloudIsOwner
            ? cloudValidationPersistStatus === 'failed'
              ? {
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fcd34d',
                  border: '1px solid rgba(251, 191, 36, 0.32)',
                }
              : {
                background: 'rgba(14, 165, 233, 0.14)',
                color: '#7dd3fc',
                border: '1px solid rgba(56, 189, 248, 0.32)',
              }
            : {
                background: 'rgba(148, 163, 184, 0.12)',
                color: '#cbd5e1',
                border: '1px solid rgba(148, 163, 184, 0.22)',
              },
        }
      : {
          label: t('클라우드 공유 가능', 'Cloud sharing ready'),
          title: t('Supabase 설정이 준비되어 있어 링크 공유 프로젝트를 만들 수 있습니다.', 'Supabase is ready, so you can create a shareable cloud project.'),
          style: {
            background: 'rgba(14, 165, 233, 0.14)',
            color: '#7dd3fc',
            border: '1px solid rgba(56, 189, 248, 0.32)',
          },
        }
    : {
        label: t('클라우드 저장 꺼짐', 'Cloud save off'),
        title:
          supabaseStatus.reason === 'invalid-url'
            ? t('Supabase 주소 형식이 올바르지 않아 클라우드 저장이 비활성화되어 있습니다.', 'Cloud save is disabled because the Supabase URL is not valid.')
            : t('Supabase 환경 변수가 비어 있거나 예시 값이라 클라우드 저장이 비활성화되어 있습니다.', 'Cloud save is disabled because the Supabase environment values are empty or still placeholders.'),
        style: {
          background: 'rgba(245, 158, 11, 0.14)',
          color: '#fcd34d',
          border: '1px solid rgba(251, 191, 36, 0.32)',
        },
      };
  const localSaveBadge = isGuestStudentMode
    ? cloudProjectId && cloudIsOwner
      ? {
          label: t('보조 저장: 학생 로컬', 'Backup save: student local'),
          title: t('클라우드 자동 저장과 별도로 학생 로컬 보관함에도 직접 저장할 수 있습니다.', 'You can also save directly to student local storage as a backup alongside cloud autosave.'),
          style: {
            background: 'rgba(16, 185, 129, 0.14)',
            color: '#6ee7b7',
            border: '1px solid rgba(52, 211, 153, 0.42)',
          },
        }
      : {
          label: t('현재 저장: 학생 로컬', 'Current save: student local'),
          title: t('이 프로젝트는 이 브라우저의 학생 로컬 보관함에만 저장됩니다.', 'This project is saved only in this browser student-local storage.'),
          style: {
            background: 'rgba(16, 185, 129, 0.14)',
            color: '#6ee7b7',
            border: '1px solid rgba(52, 211, 153, 0.42)',
          },
        }
    : {
        label: cloudProjectId && cloudIsOwner
          ? t('보조 저장: 브라우저 로컬', 'Backup save: browser local')
          : t('현재 저장: 브라우저 로컬', 'Current save: browser local'),
        title:
          cloudProjectId && cloudIsOwner
            ? t('클라우드 자동 저장과 별도로 이 브라우저 저장소에 저장할 수 있습니다.', 'You can also save to this browser storage as a backup alongside cloud autosave.')
            : t('이 프로젝트는 현재 이 브라우저 저장소에 저장됩니다.', 'This project is currently saved in this browser storage.'),
        style: {
          background: '#161b22',
          color: '#cbd5e1',
          border: '1px solid rgba(148, 163, 184, 0.24)',
        },
      };

  const applyAppLanguage = async (language: AppLanguage) => {
    setAppLanguage(language);

    try {
      await fetch('/api/preferences/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
    } catch {
      // Keep the local toggle responsive even if the cookie sync fails.
    }

    router.refresh();
  };

  const visibilityLabel = getCloudProjectVisibilityLabel(cloudVisibility, appLanguage);
  const primarySaveLabel = cloudProjectId
    ? cloudIsOwner
      ? cloudIsSaving
        ? t('클라우드 저장 중', 'Saving to cloud')
        : t('클라우드 저장', 'Cloud save')
      : t('복제본 만들기', 'Make a copy')
    : supabaseStatus.enabled
      ? t('클라우드 공유 시작', 'Start cloud sharing')
      : isGuestStudentMode
        ? t('학생 로컬 저장', 'Save to student local')
        : t('로컬 저장', 'Save locally');
  const primarySaveTitle = cloudProjectId
    ? cloudIsOwner
      ? t('현재 프로젝트를 링크 공유 가능한 클라우드 작업 공간에 저장합니다.', 'Save this project to a cloud workspace that can be shared by link.')
      : t('이 보기 전용 프로젝트를 내 작업 공간으로 복제합니다.', 'Make a personal editable copy of this view-only project.')
    : supabaseStatus.enabled
      ? t('현재 프로젝트를 클라우드 링크 프로젝트로 올리고 자동 저장을 시작합니다.', 'Turn this project into a cloud link project and start autosave.')
      : isGuestStudentMode
      ? t('현재 작업 내용을 학생 로컬 보관함에 저장합니다. 클라우드 저장은 비활성화 상태입니다.', 'Save this work in student-local storage. Cloud save is currently disabled.')
        : t('현재 작업 내용을 이 브라우저에 로컬 저장합니다. 클라우드 저장은 비활성화 상태입니다.', 'Save this work in this browser. Cloud save is currently disabled.');

  const copyShareLinkForProject = async (projectId: string) => {
    const shareUrl = buildCloudProjectShareUrl(projectId);

    try {
      await navigator.clipboard.writeText(shareUrl);
      return { success: true as const, shareUrl };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : t('브라우저에서 클립보드 복사를 허용하지 않았습니다.', 'Clipboard access is not available in this browser.');
      return { success: false as const, shareUrl, error: message };
    }
  };

  const handleLocalSave = async () => {
    const result = await saveProjectToBrowser();
    if (!result.success) {
      toast.error(t('저장 실패', 'Save failed'), { description: result.error });
      return;
    }

    const savedToLabel = isGuestStudentMode
      ? t('학생 로컬 보관함', 'student-local storage')
      : t('브라우저 로컬 저장소', 'browser local storage');
    const cloudNotice = supabaseStatus.enabled
      ? t('클라우드 저장은 아직 연결되지 않아 이번 저장은 로컬에만 반영되었습니다.', 'Cloud save is not connected yet, so this save was applied only locally.')
      : t('클라우드 저장은 현재 비활성화되어 있어 이번 저장은 로컬에만 반영되었습니다.', 'Cloud save is currently disabled, so this save was applied only locally.');

    const completedLabel = isGuestStudentMode
      ? t('학생 로컬 저장', 'Student local save')
      : t('로컬 저장', 'Local save');
    toast.success(
      appLanguage === 'ko' ? `💾 ${completedLabel} 완료` : `💾 ${completedLabel} complete`,
      {
        description: appLanguage === 'ko'
          ? `${projectName}.modumake 프로젝트를 ${savedToLabel}에 저장했습니다. ${cloudNotice}`
          : `Saved ${projectName}.modumake to ${savedToLabel}. ${cloudNotice}`,
      }
    );
    setActiveMenu(null);
  };

  const handleCopyCloudShareLink = async () => {
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
          ? `${shareSummary}. 링크는 준비됐지만 자동 복사는 실패했습니다. 직접 복사해 주세요. ${copyResult.shareUrl}`
          : `${shareSummary}. The link is ready, but automatic copy failed. Please copy it manually. ${copyResult.shareUrl}`,
      });
      return;
    }

    toast.success(t('링크를 복사했습니다.', 'Link copied.'), {
      description: appLanguage === 'ko'
        ? `${shareSummary}. 방금 복사한 링크는 ${visibilityLabel} 상태입니다. ${copyResult.shareUrl}`
        : `${shareSummary}. The copied link is currently ${visibilityLabel.toLowerCase()}. ${copyResult.shareUrl}`,
    });
  };

  const handlePrimarySaveAction = async () => {
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

      toast.success(t('☁️ 클라우드 저장 완료', '☁️ Cloud save complete'), {
        description: cloudLastSavedAt
          ? appLanguage === 'ko'
            ? `${cloudProjectTitle || projectName} 변경 사항을 링크 프로젝트에 반영했습니다.`
            : `Applied the latest changes from ${cloudProjectTitle || projectName} to the shared project.`
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
      if (copyResult.success) {
        toast.success(t('☁️ 클라우드 공유 시작', '☁️ Cloud sharing started'), {
          description: appLanguage === 'ko'
            ? `${shareSummary}. 링크 프로젝트를 만들고 바로 복사했습니다. ${copyResult.shareUrl}`
            : `${shareSummary}. The shared link project was created and copied right away. ${copyResult.shareUrl}`,
        });
      } else {
        toast.success(t('☁️ 클라우드 공유 시작', '☁️ Cloud sharing started'), {
          description: appLanguage === 'ko'
            ? `${shareSummary}. 링크 프로젝트를 만들었지만 자동 복사는 실패해 링크 버튼으로 다시 복사해 주세요. ${copyResult.shareUrl}`
            : `${shareSummary}. The shared link project was created, but automatic copy failed. Please use the copy button again. ${copyResult.shareUrl}`,
        });
      }
      return;
    }

    await handleLocalSave();
  };

  const handleCreateCloudProjectWithVisibility = async (visibility: 'private' | 'unlisted' | 'public') => {
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
      toast.success(t('☁️ 공유 링크 생성 + 복사 완료', '☁️ Shared link created and copied'), {
        description: appLanguage === 'ko'
          ? `${shareSummary}. 링크 프로젝트를 만들고 바로 복사했습니다. ${copyResult.shareUrl}`
          : `${shareSummary}. The shared link project was created and copied right away. ${copyResult.shareUrl}`,
      });
    } else {
      toast.success(t('☁️ 공유 프로젝트 생성 완료', '☁️ Shared project created'), {
        description: appLanguage === 'ko'
          ? `${shareSummary}. 링크 프로젝트를 만들었지만 자동 복사는 실패해 링크 버튼으로 다시 복사해 주세요. ${copyResult.shareUrl}`
          : `${shareSummary}. The shared project was created, but automatic copy failed. Please use the copy button again. ${copyResult.shareUrl}`,
      });
    }
    return result;
  };

  const handleUpdateCloudVisibility = async (visibility: 'private' | 'unlisted' | 'public') => {
    const result = await updateCloudVisibility(visibility);
    if (!result.success) {
      toast.error(t('공개 범위를 바꾸지 못했습니다.', 'Could not update visibility.'), {
        description: result.error,
      });
      return result;
    }

    toast.success(t('공개 범위를 바꿨습니다.', 'Visibility updated.'), {
      description:
        visibility === 'public'
          ? t('이제 링크 없이도 접근 가능한 공개 프로젝트입니다.', 'This project is now public and can be opened without the link.')
          : visibility === 'private'
            ? t('이제 소유자만 다시 열 수 있는 비공개 프로젝트입니다.', 'This project is now private and only the owner can reopen it.')
            : t('이제 링크를 아는 사람만 볼 수 있는 공유 프로젝트입니다.', 'This project is now link-only and visible only to people with the link.'),
    });
    return result;
  };

  const handleForkCloudProject = async () => {
    const result = await forkCloudProject();
    if (!result.success || !result.projectId) {
      toast.error(t('복제본을 만들지 못했습니다.', 'Could not make a copy.'), {
        description: result.error,
      });
      return result;
    }

    router.push(buildCloudProjectPath(result.projectId), { scroll: false });
    toast.success(t('복제본을 만들었습니다.', 'Copy created.'), {
      description: t('이제 이 프로젝트는 내 편집본으로 전환되어 자유롭게 수정할 수 있습니다.', 'This project is now your editable copy, so you can change it freely.'),
    });
    return result;
  };

  const handleExportProjectJson = () => {
    const projectDocument = serializeProject();
    const filename = `${projectName || 'modumake-project'}.modumake.json`;
    const blob = new Blob([JSON.stringify(projectDocument, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(
      appLanguage === 'ko' ? `💾 ${filename} 내보내기 완료!` : `💾 Exported ${filename}!`
    );
  };

  const handleExportKiCadSchematic = () => {
    const schematic = buildKiCadSchematic({
      projectName,
      activeBoardId,
      components,
      manualConnections,
    });
    const filename = buildKiCadSchematicFilename(projectName);
    const blob = new Blob([schematic], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(appLanguage === 'ko' ? `📐 ${filename} 내보내기 완료` : `📐 Exported ${filename}`, {
      description: t('KiCad에서 이어서 정리할 수 있는 회로도 브릿지 파일을 저장했습니다.', 'Saved a schematic bridge file you can continue with in KiCad.'),
    });
  };

  const handleImportProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      const isKiCadSchematic = file.name.toLowerCase().endsWith('.kicad_sch');
      const payload = isKiCadSchematic
        ? await (async () => {
            const imported = await importKiCadSchematicAsync(text, {
              projectName: file.name.replace(/\.kicad_sch$/i, ''),
            });
            return {
              ...imported.document,
              integratedValidationJson: buildImportedSchematicIntegratedValidationJson({
                document: imported.document,
                importedSource: text,
                importSummary: imported.summary,
              }),
            };
          })()
        : JSON.parse(text);
      const result = hydrateProject(payload);

      if (!result.success) {
        toast.error(t('불러오기 실패', 'Load failed'), { description: result.error });
        return;
      }

      clearCloudProjectState();
      if (cloudProjectId) {
        router.replace('/', { scroll: false });
      }

      toast.success(t('📂 프로젝트 불러오기 완료', '📂 Project loaded'), {
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
                'ModuMake JSON 또는 KiCad .kicad_sch 파일을 읽는 중 오류가 발생했습니다.',
                'There was a problem reading the ModuMake JSON or KiCad .kicad_sch file.'
              ),
      });
    }
  };

  const handleExport = (ext: 'ino' | 'py') => {
    const codeToExport = generatedCode.trim().length > 0 ? generatedCode : starterCode;
    if (!codeToExport.trim()) {
      toast.error(t('❌ 내보낼 코드가 없습니다', '❌ No code to export'), {
        description: t('보드 또는 부품 구성이 준비된 뒤 다시 시도해 주세요.', 'Set up the board or components first, then try again.'),
      });
      return;
    }

    const filename = ext === 'py' ? 'main.py' : 'sketch.ino';
    const blob     = new Blob([codeToExport], { type: 'text/plain' });
    const url      = URL.createObjectURL(blob);
    const a        = window.document.createElement('a');
    a.href         = url;
    a.download     = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(appLanguage === 'ko' ? `💾 ${filename} 내보내기 완료!` : `💾 Exported ${filename}!`);
  };

  const handleMenuItemClick = async (item: HeaderMenuItemId) => {
    if (!isHeaderMenuItemVisible(item, surfaceFlags)) {
      setActiveMenu(null);
      return;
    }

    setActiveMenu(null);

    switch (item) {
      case 'new-project':
        clearBoard();
        toast.info(t('🗑️ 새 프로젝트가 생성되었습니다. 캔버스가 초기화되었습니다.', '🗑️ Started a new project. The canvas has been reset.'));
        break;
      case 'import-project-file':
        fileInputRef.current?.click();
        break;
      case 'load-browser-save': {
        const result = await loadProjectFromBrowser();
        if (!result.success) {
          toast.error(t('불러오기 실패', 'Load failed'), { description: result.error });
          break;
        }
        toast.success(
          isGuestStudentMode
            ? t('📂 학생 로컬 저장본 복구 완료', '📂 Student-local save restored')
            : t('📂 브라우저 저장본 복구 완료', '📂 Browser save restored')
          ,
          result.notice
            ? { description: result.notice }
            : undefined
        );
        break;
      }
      case 'save-project':
        await handlePrimarySaveAction();
        break;
      case 'export-project-json':
        handleExportProjectJson();
        break;
      case 'export-schematic-image':
        window.dispatchEvent(new CustomEvent('modumake:export-schematic-png'));
        break;
      case 'export-kicad':
        handleExportKiCadSchematic();
        break;
      case 'export-ino':
        handleExport('ino');
        break;
      case 'export-py':
        handleExport('py');
        break;
      case 'undo':
        if (!canUndo) {
          toast.info(t('되돌릴 편집 이력이 없습니다.', 'There is no edit history to undo.'));
          break;
        }
        undo();
        toast.success(t('↩️ 최근 회로 편집을 되돌렸습니다.', '↩️ Reverted the latest circuit edit.'));
        break;
      case 'redo':
        if (!canRedo) {
          toast.info(t('다시 적용할 편집 이력이 없습니다.', 'There is no edit history to redo.'));
          break;
        }
        redo();
        toast.success(t('↪️ 회로 편집을 다시 적용했습니다.', '↪️ Reapplied the circuit edit.'));
        break;
      case 'select-all':
        toast.info(t('💡 Ctrl+A 또는 마우스 드래그로 모든 노드를 선택해보세요.', '💡 Try Ctrl+A or drag with the mouse to select all nodes.'));
        break;
      case 'delete':
        toast.info(t('💡 노드를 클릭한 상태에서 Backspace 또는 Delete 키를 눌러 지우거나 부품 삭제 버튼을 사용해 주세요.', '💡 Click a node and press Backspace or Delete, or use the delete button in the component panel.'));
        break;
      case 'zoom-in':
        window.dispatchEvent(new CustomEvent('modumake:zoom-in'));
        break;
      case 'zoom-out':
        window.dispatchEvent(new CustomEvent('modumake:zoom-out'));
        break;
      case 'fit-view':
        window.dispatchEvent(new CustomEvent('modumake:fit-view'));
        break;
      case 'toggle-grid':
        toggleGrid();
        toast.success(t('Grid 격자 토글 완료', 'Grid toggled'));
        break;
      case 'toggle-minimap':
        toggleMinimap();
        toast.success(t('Minimap 미니맵 토글 완료', 'Minimap toggled'));
        break;
      case 'start-ai-design':
        setIsConceptWizardOpen(true);
        break;
      case 'change-board': {
        const order = ['uno', 'esp32', 'rpi4'];
        const idx = order.indexOf(activeBoardId);
        const nextId = order[(idx + 1) % order.length];
        setActiveBoardId(nextId);
        toast.success(
          appLanguage === 'ko'
            ? `🔄 보드가 변경되었습니다: ${nextId.toUpperCase()}`
            : `🔄 Board changed: ${nextId.toUpperCase()}`
        );
        break;
      }
      case 'user-guide':
        toast.info(t('📘 도움말: 도면을 올린 뒤 검증 결과를 보고 필요한 위치에 주석을 남기세요.', '📘 Tip: upload a schematic, review the findings, and leave comments where needed.'));
        break;
      case 'shortcuts':
        toast.info(t('⌨️ 단축키 안내: [Del / Backspace] 부품 삭제, [드래그] 부품 이동 및 스냅', '⌨️ Shortcuts: [Del / Backspace] remove a component, [Drag] move and snap components.'));
        break;
      case 'about':
        toast.info(t('🌟 ModuMake - 회로 실수를 미리 잡아주는 검증 중심 하드웨어 리뷰어', '🌟 ModuMake - a review-first hardware tool that catches circuit mistakes before they bite.'));
        break;
      default:
        break;
    }
  };

  return (
    <header
      className="flex items-center flex-shrink-0 select-none"
      style={{
        height:      48,
        background:  '#0d1117',
        borderBottom: '1px solid #21262d',
        position:    'relative',
        zIndex:      100,
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.modumake.json,.kicad_sch,application/json,text/plain"
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

      {/* 로고 */}
      <div
        className="flex items-center gap-2 px-4 h-full flex-shrink-0"
        style={{ borderRight: '1px solid #21262d' }}
      >
        <div
          className="w-6 h-6 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}
        >
          <Zap size={13} className="text-white" />
        </div>
        <span
          className="font-black text-sm tracking-widest uppercase font-mono"
          style={{
            background:           'linear-gradient(90deg, #60a5fa, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor:  'transparent',
          }}
        >
          ModuMake
        </span>
      </div>

      {/* 메뉴바 */}
      <nav className="flex items-center h-full">
        {visibleMenuSections.map(menu => (
          <div key={menu.id} className="relative h-full flex items-center">
            <button
              className="flex items-center gap-1 px-3 h-full text-xs font-mono transition-colors"
              style={{
                color:      activeMenu === menu.id ? '#e2e8f0' : '#94a3b8',
                background: activeMenu === menu.id ? '#161b22' : 'transparent',
              }}
              onClick={() => setActiveMenu(prev => prev === menu.id ? null : menu.id)}
              onMouseEnter={e => {
                if (activeMenu && activeMenu !== menu.id) setActiveMenu(menu.id);
                (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
              }}
              onMouseLeave={e => {
                if (activeMenu !== menu.id) (e.currentTarget as HTMLElement).style.color = '#94a3b8';
              }}
            >
              {pickLanguage(appLanguage, menu.label)}
            </button>

            {/* 드롭다운 */}
            {activeMenu === menu.id && (
              <div
                className="absolute top-full left-0 min-w-44 z-50 py-1 font-mono text-xs"
                style={{
                  background: '#161b22',
                  border:     '1px solid #30363d',
                  boxShadow:  '0 8px 24px rgba(0,0,0,0.6)',
                }}
              >
                {menu.items.map((item, i) =>
                  item === 'separator' ? (
                    <div key={i} className="my-1 mx-3" style={{ height: 1, background: '#21262d' }} />
                  ) : (
                    <button
                      key={item}
                      className="w-full text-left px-4 py-1.5 transition-colors"
                      style={{ color: '#c9d1d9' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1f6feb30'; (e.currentTarget as HTMLElement).style.color = '#58a6ff'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#c9d1d9'; }}
                      onClick={() => {
                        void handleMenuItemClick(item);
                      }}
                    >
                      {pickLanguage(appLanguage, MENU_ITEM_LABELS[item])}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* 클릭 외부 닫기 오버레이 */}
      {activeMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
      )}

      {/* 중앙: 프로젝트 이름 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          <CircuitBoard size={13} className="text-slate-600" />
          <input
            type="text"
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            className="bg-transparent text-center text-xs font-mono text-slate-400 focus:text-slate-200 focus:outline-none w-40"
            style={{ caretColor: '#60a5fa' }}
          />
          {uiDebugMode ? <span className="text-slate-700 text-xs font-mono">.modumake</span> : null}
        </div>
      </div>

      {/* 우측: 보드 정보 + 저장 */}
      <div
        className="flex items-center gap-2 px-4 h-full flex-shrink-0"
        style={{ borderLeft: '1px solid #21262d' }}
      >
        {surfaceFlags.showConceptWizard ? (
          <button
            type="button"
            onClick={() => setIsConceptWizardOpen(true)}
            className="flex items-center gap-1.5 px-3 h-7 text-xs font-mono font-bold transition-colors"
            style={{
              background: '#161b22',
              color: '#c4b5fd',
              border: '1px solid rgba(124,58,237,0.35)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#1b1532';
              (e.currentTarget as HTMLElement).style.color = '#ddd6fe';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '#161b22';
              (e.currentTarget as HTMLElement).style.color = '#c4b5fd';
            }}
          >
            <Sparkles size={11} />
            {t('AI 설계', 'AI Design')}
          </button>
        ) : null}
        {uiDebugMode ? (
          <div
            className="flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-mono font-bold"
            style={aiStatusTone}
            title={lastCodeGenerationMeta?.model ?? t('아직 코드 생성 전입니다.', 'No code has been generated yet.')}
          >
            <Sparkles size={11} />
            {aiStatusLabel}
          </div>
        ) : null}
        <div
          className="flex items-center h-7 overflow-hidden"
          style={{ border: '1px solid rgba(148, 163, 184, 0.24)', background: '#161b22' }}
          title={t('화면 언어를 한국어와 영어 사이에서 전환합니다.', 'Switch the interface between Korean and English.')}
        >
          {(['ko', 'en'] as const).map(language => {
            const isActive = appLanguage === language;
            return (
              <button
                key={language}
                type="button"
                onClick={() => void applyAppLanguage(language)}
                className="px-2.5 h-full text-[11px] font-mono font-bold transition-colors"
                style={{
                  background: isActive ? '#1d4ed8' : 'transparent',
                  color: isActive ? '#eff6ff' : '#94a3b8',
                }}
              >
                {language.toUpperCase()}
              </button>
            );
          })}
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-mono font-bold"
          style={cloudStorageBadge.style}
          title={cloudStorageBadge.title}
        >
          {cloudStorageBadge.label}
        </div>
        {uiDebugMode ? (
          <div
            className="flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-mono font-bold"
            style={localSaveBadge.style}
            title={localSaveBadge.title}
          >
            {localSaveBadge.label}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setIsShareDialogOpen(true)}
          className="flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-mono font-bold transition-colors"
          style={{
            background: cloudProjectId
              ? 'rgba(56,189,248,0.14)'
              : supabaseStatus.enabled
                ? '#161b22'
                : 'rgba(245,158,11,0.14)',
            color: cloudProjectId ? '#7dd3fc' : supabaseStatus.enabled ? '#cbd5e1' : '#fcd34d',
            border: cloudProjectId
              ? '1px solid rgba(56,189,248,0.28)'
              : supabaseStatus.enabled
                ? '1px solid rgba(148, 163, 184, 0.24)'
                : '1px solid rgba(251, 191, 36, 0.28)',
          }}
          title={
            cloudProjectId
              ? appLanguage === 'ko'
                ? `${visibilityLabel} 상태와 공유 링크를 관리합니다.`
                : `Manage the ${visibilityLabel.toLowerCase()} shared link.`
              : supabaseStatus.enabled
                ? t('공유 링크 프로젝트를 만들고 공개 범위를 정합니다.', 'Create a shared link project and choose its visibility.')
                : t('클라우드 저장이 꺼진 상태에서 공유 준비 조건과 설정 방법을 보여줍니다.', 'Show why cloud sharing is off and how to turn it on.')
          }
        >
          <Link2 size={11} />
          {cloudProjectId ? t('공유 설정', 'Share settings') : supabaseStatus.enabled ? t('공유 시작', 'Start sharing') : t('공유 안내', 'Share info')}
        </button>
        <BoardBadge boardId={activeBoardId} />
        {uiDebugMode ? (
          <button
            type="button"
            onClick={() => {
              const nextEnabled = !isGuestStudentMode;
              setGuestStudentMode(nextEnabled);
              toast.success(
                nextEnabled
                  ? t('학생 로컬 모드 켜짐', 'Student-local mode on')
                  : t('학생 로컬 모드 꺼짐', 'Student-local mode off'),
                {
                  description: nextEnabled
                    ? t('명시적으로 저장한 프로젝트는 브라우저 내부 로컬 보관함만 사용합니다.', 'Projects you save explicitly will use only browser student-local storage.')
                    : t('브라우저 저장본 불러오기/저장이 기본 모드로 돌아갑니다.', 'Browser save/load returns to the default mode.'),
                }
              );
            }}
            className="flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-mono font-bold transition-colors"
            style={{
              background: isGuestStudentMode ? 'rgba(16, 185, 129, 0.14)' : '#161b22',
              color: isGuestStudentMode ? '#6ee7b7' : '#94a3b8',
              border: isGuestStudentMode
                ? '1px solid rgba(52, 211, 153, 0.42)'
                : '1px solid rgba(148, 163, 184, 0.24)',
            }}
          >
            {isGuestStudentMode ? t('학생 로컬', 'Student local') : t('기본 저장', 'Default save')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void handlePrimarySaveAction();
          }}
          title={primarySaveTitle}
          className="flex items-center gap-1.5 px-3 h-7 text-xs font-mono font-bold transition-colors"
          style={{
            background: cloudProjectId && !cloudIsOwner
              ? 'linear-gradient(135deg, #0f766e, #2563eb)'
              : cloudProjectId
                ? 'linear-gradient(135deg, #0284c7, #2563eb)'
                : 'linear-gradient(135deg, #1f6feb, #6e40c9)',
            color:      '#fff',
            border:     '1px solid rgba(255,255,255,0.1)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        >
          {cloudProjectId && !cloudIsOwner ? <CopyPlus size={11} /> : <Save size={11} />}
          {primarySaveLabel}
        </button>
        {uiDebugMode ? (
          <button
            type="button"
            className="w-7 h-7 flex items-center justify-center transition-colors"
            style={{ color: '#64748b', border: '1px solid #21262d' }}
            onClick={() => toast.info(t('프로젝트 설정 패널은 이어서 연결할 예정입니다.', 'Project settings will be connected next.'))}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8'; (e.currentTarget as HTMLElement).style.background = '#161b22'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Settings size={13} />
          </button>
        ) : null}
      </div>
      {surfaceFlags.showConceptWizard ? (
        <ConceptWizard open={isConceptWizardOpen} onOpenChange={setIsConceptWizardOpen} />
      ) : null}
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
