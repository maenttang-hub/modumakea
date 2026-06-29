'use client';

/**
 * components/dashboard/code-panel.tsx
 * Monaco Editor 기반 AI 코드 생성 + 직접 편집 패널 (Phase 2)
 */

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { OnMount } from '@monaco-editor/react';
import { CommentDraftPopover } from '@/components/canvas/comment-draft-popover';
import { useProjectCollaboration } from '@/components/collaboration/project-collaboration-provider';
import { Button } from '@/components/ui/button';
import { useProjectComments } from '@/components/comments/project-comments-provider';
import { useBoardStore } from '@/store/use-board-store';
import { getTemplateById } from '@/constants/component-templates';
import { getBoardById } from '@/constants/boards';
import { buildStarterCode } from '@/lib/code-starter';
import { COMMENT_FOCUS_EVENT, type CommentFocusDetail } from '@/lib/comment-focus';
import { COLLABORATION_FOCUS_EVENT, type CollaborationFocusDetail } from '@/lib/collaboration-focus';
import { summarizeCollaborationParticipant } from '@/lib/collaboration';
import { emitReviewFocus, REVIEW_FOCUS_EVENT, type ReviewFocusDetail } from '@/lib/review-focus';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { buildEditorDiagnosticBundle, type EditorDiagnostic } from '@/lib/editor-diagnostics';
import { verifyCircuitCodeConsistencyAsync } from '@/lib/formal-verifier';
import { buildCodePinMatches, type CodePinMatchRow } from '@/lib/build-code-pin-matches';
import { getCodeCommentThreadLineNumber, getCommentDraftPresentationMode } from '@/lib/project-comments';
import type {
  AICodeGenerationPayload,
  CompilerPreflightResponse,
  FormalVerificationIssue,
  GenerateCodeResponse,
} from '@/types';
import { toast } from 'sonner';
import {
  Wand2, Loader2, Copy, Check, Code2, AlertCircle,
  Download, RefreshCw, Play, Sparkles,
} from 'lucide-react';

// Monaco Editor — SSR 비활성화 (브라우저 전용)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

// Monaco 언어 매핑
const LANGUAGE_MAP: Record<string, string> = {
  'C++':    'cpp',
  'Python': 'python',
};

// Monaco 에디터 기본 옵션
const MONACO_OPTIONS = {
  minimap:          { enabled: false },
  fontSize:         13,
  lineHeight:       20,
  wordWrap:         'on' as const,
  readOnly:         false,
  scrollBeyondLastLine: false,
  fontFamily:       "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures:    true,
  cursorBlinking:   'smooth' as const,
  smoothScrolling:  true,
  renderLineHighlight: 'all' as const,
  padding:          { top: 12, bottom: 12 },
  folding:          true,
  bracketPairColorization: { enabled: true },
  suggest:          { showKeywords: true },
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPinMatchBadge(row: CodePinMatchRow) {
  if (row.severity === 'error') {
    return { label: '충돌', color: '#fca5a5' };
  }
  if (row.severity === 'warning') {
    return { label: '주의', color: '#fcd34d' };
  }
  if (row.status === 'matched') {
    return { label: '일치', color: '#86efac' };
  }
  return { label: '미연결', color: '#cbd5e1' };
}

function getInlineHintText(row: CodePinMatchRow) {
  switch (row.primaryRuleId) {
    case 'formal.output-drive-grounded-net':
    case 'formal.output-collision-sensor-line':
      return `${row.boardPin}: 입력인데 출력`;
    case 'formal.unwired-pin-reference':
    case 'formal.interrupt-pin-unwired':
      return `${row.boardPin}: 회로 연결 없음`;
    case 'formal.button-grounded-needs-input-pullup':
      return `${row.boardPin}: INPUT_PULLUP 권장`;
    case 'formal.button-vcc-needs-pulldown':
      return `${row.boardPin}: 풀다운 확인`;
    case 'formal.pin-mode-state-conflict':
      return `${row.boardPin}: pinMode 점검`;
    default:
      if (row.severity === 'error') {
        return `${row.boardPin}: 회로 충돌`;
      }
      if (row.severity === 'warning') {
        return `${row.boardPin}: 검토 필요`;
      }
      if (row.status === 'unwired') {
        return `${row.boardPin}: 미연결`;
      }
      return '';
  }
}

export function CodePanel({ mode = 'code' }: { mode?: 'code' | 'combined' } = {}) {
  const {
    components,
    manualConnections,
    installedLibraries,
    activeBoardId,
    appLanguage,
    cloudProjectId,
    cloudIsOwner,
    generatedCode,
    isGenerating,
    codeError,
    lastCodeGenerationMeta,
    lastCompilerManifest,
    setGeneratedCode,
    setIsGenerating,
    setCodeError,
    setCodeGenerationMeta,
    setCompilerManifest,
  } = useBoardStore();
  const selectedComponentId = useBoardStore(state => state.selectedComponentId);

  const [copied, setCopied]       = useState(false);
  const [userIntent, setUserIntent] = useState('');
  const [isStarterMode, setIsStarterMode] = useState(() => generatedCode.trim().length === 0);

  const board    = getBoardById(activeBoardId);
  const language = LANGUAGE_MAP[board.targetLanguage] ?? 'cpp';
  const boardPins = useMemo(
    () => [...board.digitalPins, ...board.leftPins, '5V', '3.3V', 'GND'].sort((a, b) => b.length - a.length),
    [board.digitalPins, board.leftPins]
  );
  const starterCode = useMemo(
    () => buildStarterCode(activeBoardId, components),
    [activeBoardId, components]
  );
  const isViewOnly = Boolean(cloudProjectId && !cloudIsOwner);
  const editorCode = generatedCode || starterCode;
  const shouldUseStarter = isStarterMode || generatedCode.trim().length === 0;
  const boardPinsRef = useRef(boardPins);
  const componentsRef = useRef(components);
  const diagnosticMarkersRef = useRef<ReturnType<typeof buildEditorDiagnosticBundle>['markers']>([]);
  const editorMouseListenerRef = useRef<{ dispose: () => void } | null>(null);
  const commentDecorationsRef = useRef<{ clear: () => void } | null>(null);
  const commentFlashDecorationsRef = useRef<{ clear: () => void } | null>(null);
  const collaborationDecorationsRef = useRef<{ clear: () => void } | null>(null);
  const inlineHintDecorationsRef = useRef<{ clear: () => void } | null>(null);
  const hoverWordDecorationsRef = useRef<{ clear: () => void } | null>(null);
  const editorRef = useRef<Parameters<NonNullable<OnMount>>[0] | null>(null);
  const monacoRef = useRef<Parameters<NonNullable<OnMount>>[1] | null>(null);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const verificationRunRef = useRef(0);
  const codePinMatchByLineRef = useRef<Map<number, CodePinMatchRow>>(new Map());
  const hoveredPinMatchIdRef = useRef<string | null>(null);
  const previousSelectedComponentIdRef = useRef<string | null>(null);
  const codeLineFlashTimeoutRef = useRef<number | null>(null);
  const [codeInlineDraftAnchor, setCodeInlineDraftAnchor] = useState<{ x: number; y: number } | null>(null);
  const [visibleDiagnosticAnchors, setVisibleDiagnosticAnchors] = useState<Array<{
    issueKey: string;
    line: number;
    top: number;
    severity: EditorDiagnostic['severity'];
    title: string;
  }>>([]);
  const [lastEditorGesture, setLastEditorGesture] = useState<{ line: number | null; targetType: string | null; focusedIssueKey: string | null }>({
    line: null,
    targetType: null,
    focusedIssueKey: null,
  });
  const [verificationIssues, setVerificationIssues] = useState<FormalVerificationIssue[]>([]);
  const [hoveredPinMatchId, setHoveredPinMatchId] = useState<string | null>(null);
  const [showPinMatchDetails, setShowPinMatchDetails] = useState(false);
  const [showDiagnosticDetails, setShowDiagnosticDetails] = useState(false);
  const {
    commentMode,
    openThreads,
    selectedCommentId,
    highlightedThreadId,
    draft,
    startCommentDraft,
    submitDraft,
    cancelDraft,
    focusComment,
    selectComment,
  } = useProjectComments();
  const {
    enabled: collaborationEnabled,
    participants: collaborationParticipants,
    sessionId: collaborationSessionId,
    sharedDocEngine,
    sharedCodeVersion,
    getSharedCode,
    setSharedCode,
    subscribeSharedCode,
    updatePresence,
    focusParticipant,
  } = useProjectCollaboration();
  const codeParticipants = useMemo(
    () => collaborationParticipants.filter(participant =>
      participant.scope === 'code' ||
      participant.selection?.lineNumber != null ||
      participant.cursor?.lineNumber != null
    ),
    [collaborationParticipants]
  );

  const buildPayload = useCallback((): AICodeGenerationPayload | null => {
    const routed = components.filter(c => c.isFullyRouted && Object.keys(c.assignedPins).length > 0);
    if (routed.length === 0) {
      return null;
    }

    return {
      boardId: activeBoardId,
      boardName: board.name,
      chipset: board.chipset,
      targetLanguage: board.targetLanguage,
      connectedComponents: routed.map(comp => {
        const template = getTemplateById(comp.templateId);
        return {
          templateId: comp.templateId,
          componentName: template?.name ?? comp.name,
          pinConnections: comp.assignedPins,
          librarySource: template?.librarySource,
          libraryIncludes: template?.libraryIncludes,
          dependencies: template?.dependencies,
          aiHints: template?.aiHints,
        };
      }),
      installedLibraries,
      userIntent: userIntent.trim() || undefined,
    };
  }, [activeBoardId, board.chipset, board.name, board.targetLanguage, components, installedLibraries, userIntent]);

  useEffect(() => {
    boardPinsRef.current = boardPins;
  }, [boardPins]);

  useEffect(() => {
    componentsRef.current = components;
  }, [components]);

  useEffect(() => {
    if (shouldUseStarter) {
      setGeneratedCode(starterCode);
    }
  }, [shouldUseStarter, starterCode, setGeneratedCode]);

  useEffect(() => {
    if (!collaborationEnabled) {
      return;
    }

    return subscribeSharedCode(snapshot => {
      if (snapshot.originSessionId === collaborationSessionId) {
        return;
      }

      const currentCode = useBoardStore.getState().generatedCode;
      if (snapshot.text === currentCode) {
        return;
      }

      if (snapshot.text.trim()) {
        setIsStarterMode(false);
      }
      setGeneratedCode(snapshot.text);
    });
  }, [collaborationEnabled, collaborationSessionId, setGeneratedCode, subscribeSharedCode]);

  useEffect(() => {
    if (!collaborationEnabled || isViewOnly) {
      return;
    }

    if (editorCode !== getSharedCode()) {
      setSharedCode(editorCode, 'editor');
    }
  }, [collaborationEnabled, editorCode, getSharedCode, isViewOnly, setSharedCode]);

  useEffect(() => {
    const handleLibraryInstall = (event: Event) => {
      const customEvent = event as CustomEvent<{ includes: string[] }>;
      const includes = customEvent.detail?.includes ?? [];
      if (includes.length === 0 || board.targetLanguage !== 'C++') {
        return;
      }

      const currentCode = useBoardStore.getState().generatedCode || starterCode;
      const missingIncludes = includes.filter(include => {
        const pattern = new RegExp(`^\\s*#include\\s+[<\"]${include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[>\"]`, 'm');
        return !pattern.test(currentCode);
      });

      if (missingIncludes.length === 0) {
        return;
      }

      setIsStarterMode(false);
      setGeneratedCode(`${missingIncludes.map(include => `#include <${include}>`).join('\n')}\n${currentCode}`.trim());
    };

    window.addEventListener('modumake:library-installed', handleLibraryInstall);
    return () => window.removeEventListener('modumake:library-installed', handleLibraryInstall);
  }, [board.targetLanguage, setGeneratedCode, starterCode]);

  // ─── Monaco onChange 핸들러 ───
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (isViewOnly) {
        return;
      }
      const nextValue = value ?? '';
      if (isStarterMode && nextValue !== starterCode) {
        setIsStarterMode(false);
      }
      setGeneratedCode(nextValue);
    },
    [isStarterMode, isViewOnly, setGeneratedCode, starterCode]
  );

  // ─── AI 코드 생성 ───
  const handleGenerate = async () => {
    const payload = buildPayload();

    if (!payload) {
      toast.error('❌ 배치된 부품이 없습니다', {
        description: '좌측 라이브러리에서 부품을 캔버스로 드래그해주세요.',
      });
      return;
    }

    setIsGenerating(true);
    setCodeError(null);

    try {
      const res  = await fetch('/api/generate-code', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      const data = await res.json() as GenerateCodeResponse & { error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? '알 수 없는 오류가 발생했습니다.');
      }

      setIsStarterMode(false);
      setCompilerManifest(data.compilerManifest ?? null);
      setCodeGenerationMeta(data.aiMeta ?? null);
      setGeneratedCode(data.code ?? '');
      window.dispatchEvent(new CustomEvent('modumake:compiler-manifest', {
        detail: data.compilerManifest ?? null,
      }));
      toast.success('🪄 코드 생성 완료!', {
        description:
          data.compilerManifest?.arduinoDependencies?.length
            ? `${payload.connectedComponents.length}개 부품 → ${board.targetLanguage} 코드 생성 · ${data.aiMeta?.label ?? 'AI'} · 외부 라이브러리 ${data.compilerManifest.arduinoDependencies.length}개`
            : `${payload.connectedComponents.length}개 부품 → ${board.targetLanguage} 코드 생성 · ${data.aiMeta?.label ?? 'AI'}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '코드 생성에 실패했습니다.';
      setCodeError(message);
      setCodeGenerationMeta(null);
      setCompilerManifest(null);
      toast.error('❌ 코드 생성 실패', { description: message });
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── 복사 ───
  const handleCopy = async () => {
    await navigator.clipboard.writeText(editorCode);
    setCopied(true);
    toast.success('📋 코드가 클립보드에 복사되었습니다!');
    setTimeout(() => setCopied(false), 2000);
  };

  // ─── 다운로드 ───
  const handleDownload = () => {
    const filename = language === 'python' ? 'main.py' : 'sketch.ino';
    const blob     = new Blob([editorCode], { type: 'text/plain' });
    const url      = URL.createObjectURL(blob);
    const a        = window.document.createElement('a');
    a.href         = url;
    a.download     = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`💾 ${filename} 다운로드 완료!`);
  };

  // ─── 코드 가상 컴파일 & 실행 ───
  const handleRunCode = () => {
    const event = new CustomEvent('modumake:run-code', {
      detail: {
        code: editorCode,
        language,
      },
    });
    window.dispatchEvent(event);
    toast.success('🚀 컴파일 및 가상 실행 시작!');
  };

  const connectedCount = components.filter(c => c.isFullyRouted).length;

  // ─── 보드별 언어 배지 색상 ───
  const LANG_COLOR: Record<string, string> = {
    cpp:    'rgba(37,99,235,0.25)',
    python: 'rgba(234,179,8,0.25)',
  };
  const LANG_TEXT: Record<string, string> = {
    cpp:    '#60a5fa',
    python: '#facc15',
  };
  const aiBadgeTone = useMemo(() => {
    if (!lastCodeGenerationMeta) {
      return {
        background: 'rgba(71,85,105,0.18)',
        borderColor: 'rgba(148,163,184,0.28)',
        color: '#cbd5e1',
      };
    }

    if (lastCodeGenerationMeta.provider === 'gemini') {
      return {
        background: 'rgba(14,165,233,0.16)',
        borderColor: 'rgba(56,189,248,0.32)',
        color: '#7dd3fc',
      };
    }

    if (lastCodeGenerationMeta.provider === 'anthropic') {
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
  }, [lastCodeGenerationMeta]);
  const aiBadgeText = useMemo(() => {
    if (!lastCodeGenerationMeta) {
      return 'AI 미선택';
    }

    const status =
      typeof lastCodeGenerationMeta.reviewErrorCount === 'number'
        ? lastCodeGenerationMeta.reviewErrorCount === 0
          ? '검수 통과'
          : `오류 ${lastCodeGenerationMeta.reviewErrorCount}`
        : '검수 대기';
    const suffix = lastCodeGenerationMeta.repaired
      ? ' · 재점검'
      : lastCodeGenerationMeta.fallback
        ? ' · 폴백'
        : '';
    return `${lastCodeGenerationMeta.label} · ${status}${suffix}`;
  }, [lastCodeGenerationMeta]);

  const compileBadge = useMemo(() => {
    const manifest = lastCompilerManifest;
    if (!manifest) {
      return {
        text: '컴파일 사전 점검 대기',
        title: '코드 또는 회로가 바뀌면 클라우드 컴파일 준비 상태를 다시 계산합니다.',
        tone: {
          background: 'rgba(71,85,105,0.18)',
          borderColor: 'rgba(148,163,184,0.28)',
          color: '#cbd5e1',
        },
      };
    }

    if (manifest.compileStrategy === 'cloud-compiler-ready') {
      return {
        text: `Cloud Ready · ${manifest.cloudTarget.fqbn ?? manifest.cloudTarget.boardId}`,
        title: `${manifest.cloudTarget.boardName} 보드를 바로 클라우드 컴파일할 수 있습니다.`,
        tone: {
          background: 'rgba(34,197,94,0.14)',
          borderColor: 'rgba(74,222,128,0.28)',
          color: '#86efac',
        },
      };
    }

    if (manifest.cloudTarget.supported && manifest.unresolvedHeaders.length > 0) {
      return {
        text: `헤더 확인 ${manifest.unresolvedHeaders.length}개`,
        title: `미해결 헤더: ${manifest.unresolvedHeaders.join(', ')}`,
        tone: {
          background: 'rgba(245,158,11,0.14)',
          borderColor: 'rgba(251,191,36,0.28)',
          color: '#fcd34d',
        },
      };
    }

    return {
      text: '로컬 검토 전용',
      title: manifest.cloudTarget.reason ?? '이 보드는 아직 클라우드 컴파일 대상이 아닙니다.',
      tone: {
        background: 'rgba(148,163,184,0.12)',
        borderColor: 'rgba(148,163,184,0.22)',
        color: '#cbd5e1',
      },
    };
  }, [lastCompilerManifest]);
  const circuitAnalysis = useMemo(
    () =>
      analyzeCircuitNetlist(
        components,
        activeBoardId,
        getTemplateById,
        manualConnections
      ),
    [activeBoardId, components, manualConnections]
  );
  const diagnosticBundle = useMemo(
    () => buildEditorDiagnosticBundle(editorCode, editorCode.trim() ? verificationIssues : [], appLanguage),
    [appLanguage, editorCode, verificationIssues]
  );
  useEffect(() => {
    diagnosticMarkersRef.current = diagnosticBundle.markers;
  }, [diagnosticBundle]);
  const focusDiagnosticMarker = useCallback((matchingDiagnostic: EditorDiagnostic) => {
    const relatedComponent = matchingDiagnostic.componentName
      ? componentsRef.current.find(component => component.name === matchingDiagnostic.componentName)
      : componentsRef.current.find(component =>
          matchingDiagnostic.boardPin
            ? Object.values(component.assignedPins).includes(matchingDiagnostic.boardPin)
            : false
        );
    const componentPin =
      relatedComponent && matchingDiagnostic.boardPin
        ? Object.entries(relatedComponent.assignedPins).find(([, boardPin]) => boardPin === matchingDiagnostic.boardPin)?.[0]
        : undefined;
    const targetInstanceId =
      relatedComponent?.instanceId ?? (matchingDiagnostic.boardPin ? 'board-node' : undefined);

    if (targetInstanceId) {
      window.dispatchEvent(
        new CustomEvent('modumake:focus-component', {
          detail: { instanceId: targetInstanceId },
        })
      );
    }

    emitReviewFocus({
      source: 'code',
      emphasis: 'action',
      issueKey: matchingDiagnostic.issueKey,
      code: matchingDiagnostic.issue.code,
      boardPin: matchingDiagnostic.boardPin,
      componentInstanceId: relatedComponent?.instanceId,
      componentName: relatedComponent?.name ?? matchingDiagnostic.componentName,
      componentPin,
      severity: matchingDiagnostic.severity,
      title: matchingDiagnostic.title,
      message: matchingDiagnostic.issue.message,
      line: matchingDiagnostic.line,
      operation: matchingDiagnostic.operation,
      ruleId: matchingDiagnostic.ruleId,
    });
    setLastEditorGesture(current => ({
      line: matchingDiagnostic.line,
      targetType: current.targetType,
      focusedIssueKey: matchingDiagnostic.issueKey,
    }));
  }, []);
  const diagnosticCounts = useMemo(() => {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const marker of diagnosticBundle.markers) {
      counts[marker.severity] += 1;
    }
    for (const issue of diagnosticBundle.generalIssues) {
      counts[issue.severity] += 1;
    }
    return counts;
  }, [diagnosticBundle]);
  const codePinMatches = useMemo(
    () =>
      buildCodePinMatches({
        sourceCode: editorCode,
        boardId: activeBoardId,
        components,
        issues: verificationIssues,
      }),
    [activeBoardId, components, editorCode, verificationIssues]
  );
  const codePinMatchByLine = useMemo(() => {
    const nextMap = new Map<number, CodePinMatchRow>();
    for (const row of codePinMatches) {
      for (const lineNumber of row.lineNumbers) {
        if (!nextMap.has(lineNumber)) {
          nextMap.set(lineNumber, row);
        }
      }
    }
    return nextMap;
  }, [codePinMatches]);
  const codePinMatchLookup = useMemo(() => {
    const nextMap = new Map<string, CodePinMatchRow>();
    for (const row of codePinMatches) {
      nextMap.set(row.boardPin.toLowerCase(), row);
      for (const name of row.sourceNames) {
        nextMap.set(name.toLowerCase(), row);
      }
    }
    return nextMap;
  }, [codePinMatches]);
  const codePinMatchesByComponentId = useMemo(() => {
    const nextMap = new Map<string, CodePinMatchRow[]>();
    for (const row of codePinMatches) {
      for (const instanceId of row.componentInstanceIds) {
        const current = nextMap.get(instanceId) ?? [];
        current.push(row);
        nextMap.set(instanceId, current);
      }
    }
    return nextMap;
  }, [codePinMatches]);
  const pinMatchCounts = useMemo(() => {
    const counts = { matched: 0, warning: 0, error: 0, unwired: 0 };
    for (const row of codePinMatches) {
      if (row.severity === 'error') {
        counts.error += 1;
      } else if (row.severity === 'warning') {
        counts.warning += 1;
      } else if (row.status === 'matched') {
        counts.matched += 1;
      } else {
        counts.unwired += 1;
      }
    }
    return counts;
  }, [codePinMatches]);
  useEffect(() => {
    codePinMatchByLineRef.current = codePinMatchByLine;
  }, [codePinMatchByLine]);
  useEffect(() => {
    hoveredPinMatchIdRef.current = hoveredPinMatchId;
  }, [hoveredPinMatchId]);

  const findPinMatchTokenRange = useCallback((row: CodePinMatchRow, lineNumber: number) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) {
      return null;
    }

    const lineText = model.getLineContent(lineNumber);
    const lineTokenHints = row.lineTokenHints.find(item => item.lineNumber === lineNumber)?.tokens ?? [];
    const candidates = Array.from(new Set([
      ...lineTokenHints,
      row.primarySourceName,
      ...row.sourceNames,
      row.boardPin,
    ].filter((value): value is string => Boolean(value))));

    const pinCallMatch = lineText.match(/\b(pinMode|digitalWrite|analogWrite|digitalRead|analogRead)\s*\(\s*([^,)\n]+)/);
    if (pinCallMatch?.index != null) {
      const argumentText = pinCallMatch[2] ?? '';
      const argumentStart = lineText.indexOf(argumentText, pinCallMatch.index);
      if (argumentStart >= 0) {
        for (const candidate of candidates) {
          const regex = new RegExp(`\\b${escapeRegExp(candidate)}\\b`);
          const match = argumentText.match(regex);
          if (!match || match.index == null) {
            continue;
          }

          const startColumn = argumentStart + match.index + 1;
          const endColumn = startColumn + candidate.length;
          return { startColumn, endColumn };
        }
      }
    }

    for (const candidate of candidates) {
      const regex = new RegExp(`\\b${escapeRegExp(candidate)}\\b`);
      const match = lineText.match(regex);
      if (!match || match.index == null) {
        continue;
      }

      const startColumn = match.index + 1;
      const endColumn = startColumn + candidate.length;
      return { startColumn, endColumn };
    }

    const fallbackLength = Math.max(Math.min(lineText.length + 1, 12), 2);
    return { startColumn: 1, endColumn: fallbackLength };
  }, []);

  const clearHoveredPinMatchPreview = useCallback(() => {
    setHoveredPinMatchId(null);
    hoverWordDecorationsRef.current?.clear();
    emitReviewFocus({
      source: 'code',
      interaction: 'clear',
    });
  }, []);
  const renderedDiagnosticAnchors = useMemo(() => {
    if (visibleDiagnosticAnchors.length > 0) {
      return visibleDiagnosticAnchors;
    }

    return diagnosticBundle.markers.slice(0, 8).map((marker, index) => ({
      issueKey: marker.issueKey,
      line: marker.line,
      top: 14 + index * 16,
      severity: marker.severity,
      title: marker.title,
    }));
  }, [diagnosticBundle.markers, visibleDiagnosticAnchors]);
  const openCodeCommentThreads = useMemo(
    () => openThreads.filter(thread => thread.root.targetType === 'code_line' && 'lineNumber' in thread.root.targetMeta),
    [openThreads]
  );
  const codeInlineDraft = useMemo(() => {
    if (getCommentDraftPresentationMode(draft) !== 'code-inline' || !draft) {
      return null;
    }

    return draft;
  }, [draft]);
  const codeInlineDraftTargetLabel = useMemo(() => {
    if (!codeInlineDraft || !('lineNumber' in codeInlineDraft.targetMeta)) {
      return '';
    }

    return `코드 ${codeInlineDraft.targetMeta.lineNumber}줄`;
  }, [codeInlineDraft]);
  const syncCodeInlineDraftAnchor = useCallback(() => {
    const editor = editorRef.current;
    const editorSurface = editorSurfaceRef.current;
    if (!editor || !editorSurface || !codeInlineDraft || !('lineNumber' in codeInlineDraft.targetMeta)) {
      setCodeInlineDraftAnchor(null);
      return;
    }

    const lineNumber = codeInlineDraft.targetMeta.lineNumber;
    const linePosition = editor.getScrolledVisiblePosition({ lineNumber, column: 1 });
    const layout = editor.getLayoutInfo();

    if (!linePosition) {
      setCodeInlineDraftAnchor({
        x: Math.max(16, Math.min(editorSurface.clientWidth - 304, 72)),
        y: 16,
      });
      return;
    }

    const left = Math.max(
      16,
      Math.min(
        editorSurface.clientWidth - 304,
        layout.contentLeft + 20
      )
    );
    const top = Math.max(
      12,
      Math.min(
        editorSurface.clientHeight - 196,
        linePosition.top + 8
      )
    );

    setCodeInlineDraftAnchor({ x: left, y: top });
  }, [codeInlineDraft]);
  const syncVisibleDiagnosticAnchors = useCallback(() => {
    const editorSurface = editorSurfaceRef.current;
    if (!editorSurface) {
      setVisibleDiagnosticAnchors([]);
      return;
    }

    const surfaceRect = editorSurface.getBoundingClientRect();
    const visibleLineMap = new Map<number, number>();
    const lineNumberNodes = editorSurface.querySelectorAll<HTMLElement>('.monaco-editor .line-numbers');
    lineNumberNodes.forEach(node => {
      const rawLine = Number.parseInt(node.textContent?.trim() ?? '', 10);
      if (!Number.isFinite(rawLine)) {
        return;
      }

      const rect = node.getBoundingClientRect();
      visibleLineMap.set(rawLine, rect.top - surfaceRect.top + Math.max(0, (rect.height - 12) / 2));
    });

    const nextAnchors = diagnosticMarkersRef.current.flatMap(marker => {
      const mappedTop = visibleLineMap.get(marker.line);
      if (mappedTop == null) {
        return [];
      }

      const top = mappedTop;
      if (top < -16 || top > editorSurface.clientHeight + 8) {
        return [];
      }

      return [{
        issueKey: marker.issueKey,
        line: marker.line,
        top,
        severity: marker.severity,
        title: marker.title,
      }];
    });

    setVisibleDiagnosticAnchors(nextAnchors);
  }, []);

  useEffect(() => {
    if (isGenerating) {
      return;
    }

    const payload = buildPayload();
    if (!payload || !editorCode.trim()) {
      setCompilerManifest(null);
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/compile/preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload,
            code: editorCode,
          }),
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as CompilerPreflightResponse;
        setCompilerManifest(data.manifest);
        window.dispatchEvent(
          new CustomEvent('modumake:compiler-manifest', {
            detail: data.manifest,
          })
        );
      } catch {
        // Preflight는 조용히 재시도 가능한 보조 경로이므로, 편집 중에는 토스트를 띄우지 않습니다.
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [buildPayload, editorCode, isGenerating, setCompilerManifest]);

  useEffect(() => {
    const runId = verificationRunRef.current + 1;
    verificationRunRef.current = runId;

    if (!editorCode.trim()) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void verifyCircuitCodeConsistencyAsync({
        boardId: activeBoardId,
        code: editorCode,
        components,
        resolveTemplate: getTemplateById,
        circuitAnalysis,
      }).then(report => {
        if (verificationRunRef.current !== runId) {
          return;
        }
        setVerificationIssues(report.issues);
      }).catch(() => {
        if (verificationRunRef.current !== runId) {
          return;
        }
        setVerificationIssues([]);
      });
    }, 180);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeBoardId, circuitAnalysis, components, editorCode]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) {
      return;
    }

    monaco.editor.setModelMarkers(
      model,
      'modumake-review',
      diagnosticBundle.markers.map(marker => {
        const matchedRow =
          codePinMatches.find(row =>
            row.boardPin === marker.boardPin &&
            row.lineNumbers.includes(marker.line)
          ) ??
          codePinMatchByLine.get(marker.line);
        const tokenRange = matchedRow ? findPinMatchTokenRange(matchedRow, marker.line) : null;

        return {
          startLineNumber: marker.line,
          endLineNumber: marker.line,
          startColumn: tokenRange?.startColumn ?? marker.startColumn,
          endColumn: tokenRange?.endColumn ?? marker.endColumn,
          message: marker.message,
          severity:
            marker.severity === 'error'
              ? monaco.MarkerSeverity.Error
              : marker.severity === 'warning'
                ? monaco.MarkerSeverity.Warning
                : monaco.MarkerSeverity.Info,
          code: marker.ruleId,
          source: 'ModuMake Review',
        };
      })
    );
  }, [codePinMatchByLine, codePinMatches, diagnosticBundle, findPinMatchTokenRange]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      return;
    }

    collaborationDecorationsRef.current?.clear();
    collaborationDecorationsRef.current = editor.createDecorationsCollection(
      codeParticipants.flatMap(participant => {
          const lineNumber = participant.selection?.lineNumber ?? participant.cursor?.lineNumber;
          if (!lineNumber) {
            return [];
          }

          return [{
            range: {
              startLineNumber: lineNumber,
              endLineNumber: lineNumber,
              startColumn: 1,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              linesDecorationsTooltip: `${participant.userName}: ${summarizeCollaborationParticipant(participant)}`,
              overviewRuler: {
                color: participant.color,
                position: monaco.editor.OverviewRulerLane.Right,
              },
            },
          }];
        })
    );

    return () => {
      collaborationDecorationsRef.current?.clear();
      collaborationDecorationsRef.current = null;
    };
  }, [codeParticipants]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) {
      return;
    }

    inlineHintDecorationsRef.current?.clear();
    inlineHintDecorationsRef.current = editor.createDecorationsCollection(
      codePinMatches.flatMap(row => {
        const lineNumber = row.lineNumbers[0];
        if (!lineNumber) {
          return [];
        }

        const hint = getInlineHintText(row);
        if (!hint) {
          return [];
        }

        const tokenRange = findPinMatchTokenRange(row, lineNumber);
        if (!tokenRange) {
          return [];
        }

        return [{
          range: new monaco.Range(lineNumber, tokenRange.startColumn, lineNumber, tokenRange.endColumn),
          options: {
            inlineClassName:
              row.severity === 'error'
                ? 'mm-code-inline-token mm-code-inline-token-error'
                : row.severity === 'warning'
                  ? 'mm-code-inline-token mm-code-inline-token-warning'
                  : 'mm-code-inline-token mm-code-inline-token-info',
            after: {
              content: `  ${hint}`,
              inlineClassName:
                row.severity === 'error'
                  ? 'mm-code-inline-hint mm-code-inline-hint-error'
                  : row.severity === 'warning'
                    ? 'mm-code-inline-hint mm-code-inline-hint-warning'
                    : 'mm-code-inline-hint mm-code-inline-hint-info',
            },
          },
        }];
      })
    );

    return () => {
      inlineHintDecorationsRef.current?.clear();
      inlineHintDecorationsRef.current = null;
    };
  }, [codePinMatches, findPinMatchTokenRange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    commentDecorationsRef.current?.clear();
    commentDecorationsRef.current = editor.createDecorationsCollection(
      openCodeCommentThreads.map(thread => {
        const lineNumber = 'lineNumber' in thread.root.targetMeta ? thread.root.targetMeta.lineNumber : 1;
        return {
          range: {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: 1,
            endColumn: 1,
          },
          options: {
            isWholeLine: false,
            glyphMarginClassName:
              highlightedThreadId === thread.root.id
                ? 'mm-comment-glyph mm-comment-glyph-highlighted'
                : thread.root.id === selectedCommentId
                  ? 'mm-comment-glyph mm-comment-glyph-active'
                  : 'mm-comment-glyph',
            glyphMarginHoverMessage: {
              value: `피드백: ${thread.root.content}`,
            },
          },
        };
      })
    );

    return () => {
      commentDecorationsRef.current?.clear();
      commentDecorationsRef.current = null;
    };
  }, [highlightedThreadId, openCodeCommentThreads, selectedCommentId]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const highlightedCodeLine = getCodeCommentThreadLineNumber(
      openCodeCommentThreads,
      highlightedThreadId
    );

    if (!highlightedCodeLine) {
      commentFlashDecorationsRef.current?.clear();
      commentFlashDecorationsRef.current = null;
      if (codeLineFlashTimeoutRef.current) {
        window.clearTimeout(codeLineFlashTimeoutRef.current);
        codeLineFlashTimeoutRef.current = null;
      }
      return;
    }

    commentFlashDecorationsRef.current?.clear();
    commentFlashDecorationsRef.current = editor.createDecorationsCollection([
      {
        range: {
          startLineNumber: highlightedCodeLine,
          endLineNumber: highlightedCodeLine,
          startColumn: 1,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'mm-comment-line-flash',
        },
      },
    ]);

    if (codeLineFlashTimeoutRef.current) {
      window.clearTimeout(codeLineFlashTimeoutRef.current);
    }

    codeLineFlashTimeoutRef.current = window.setTimeout(() => {
      commentFlashDecorationsRef.current?.clear();
      commentFlashDecorationsRef.current = null;
      codeLineFlashTimeoutRef.current = null;
    }, 1300);

    return () => {
      if (codeLineFlashTimeoutRef.current) {
        window.clearTimeout(codeLineFlashTimeoutRef.current);
        codeLineFlashTimeoutRef.current = null;
      }
    };
  }, [highlightedThreadId, openCodeCommentThreads]);

  useEffect(() => {
    if (!codeInlineDraft) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      syncCodeInlineDraftAnchor();
    });
    const editor = editorRef.current;
    if (!editor) {
      return () => window.cancelAnimationFrame(frame);
    }

    const scrollDisposable = editor.onDidScrollChange(() => {
      syncCodeInlineDraftAnchor();
    });
    const layoutDisposable = editor.onDidLayoutChange(() => {
      syncCodeInlineDraftAnchor();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      scrollDisposable.dispose();
      layoutDisposable.dispose();
    };
  }, [codeInlineDraft, syncCodeInlineDraftAnchor]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      syncVisibleDiagnosticAnchors();
    });
    const editor = editorRef.current;
    if (!editor) {
      return () => window.cancelAnimationFrame(frame);
    }

    const scrollDisposable = editor.onDidScrollChange(() => {
      syncVisibleDiagnosticAnchors();
    });
    const layoutDisposable = editor.onDidLayoutChange(() => {
      syncVisibleDiagnosticAnchors();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      scrollDisposable.dispose();
      layoutDisposable.dispose();
    };
  }, [diagnosticBundle, syncVisibleDiagnosticAnchors]);

  const emitPinMatchFocus = useCallback((row: CodePinMatchRow | null, interaction: 'hover' | 'focus' | 'clear' = 'focus') => {
    if (interaction === 'clear' || !row) {
      emitReviewFocus({
        source: 'code',
        interaction: 'clear',
      });
      return;
    }

    emitReviewFocus({
      source: 'code',
      interaction,
      emphasis: interaction === 'hover' ? 'card' : 'action',
      boardPin: row.boardPin,
      componentInstanceIds: row.componentInstanceIds,
      componentInstanceId: row.componentInstanceIds[0],
      componentName: row.componentNames[0],
      componentPin: row.componentPins[0],
      severity: row.severity ?? 'info',
      title:
        row.status === 'matched'
          ? `${row.boardPin} ↔ ${row.componentNames.join(', ')}`
          : `${row.boardPin} 핀이 아직 회로와 안 맞습니다`,
      message: row.reason ?? row.linePreview ?? row.operationTypes.join(', '),
      line: row.lineNumbers[0],
      operation: row.operationTypes[0],
    });
  }, []);

  const focusPinMatchRow = useCallback((row: CodePinMatchRow) => {
    const editor = editorRef.current;
    if (editor && row.lineNumbers[0]) {
      const primaryLine = row.lineNumbers[0];
      const tokenRange = findPinMatchTokenRange(row, primaryLine);
      editor.revealLineInCenter(primaryLine);
      editor.setPosition({
        lineNumber: primaryLine,
        column: tokenRange?.startColumn ?? 1,
      });
      editor.focus();
    }

    setHoveredPinMatchId(row.id);
    emitPinMatchFocus(row, 'focus');
  }, [emitPinMatchFocus, findPinMatchTokenRange]);

  useEffect(() => {
    const previousSelectedComponentId = previousSelectedComponentIdRef.current;
    previousSelectedComponentIdRef.current = selectedComponentId;

    if (!selectedComponentId || selectedComponentId === 'board-node' || selectedComponentId === previousSelectedComponentId) {
      return;
    }

    if (editorSurfaceRef.current?.contains(document.activeElement)) {
      return;
    }

    const matchedRows = codePinMatchesByComponentId.get(selectedComponentId) ?? [];
    if (matchedRows.length === 0) {
      return;
    }

    const [bestRow] = [...matchedRows].sort((left, right) => {
      const leftWeight = left.severity === 'error' ? 3 : left.severity === 'warning' ? 2 : left.status === 'matched' ? 1 : 0;
      const rightWeight = right.severity === 'error' ? 3 : right.severity === 'warning' ? 2 : right.status === 'matched' ? 1 : 0;
      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }

      const leftLine = left.lineNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      const rightLine = right.lineNumbers[0] ?? Number.MAX_SAFE_INTEGER;
      return leftLine - rightLine;
    });

    if (!bestRow) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      focusPinMatchRow(bestRow);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [codePinMatchesByComponentId, focusPinMatchRow, selectedComponentId]);

  useEffect(() => {
    const handleReviewFocus = (event: Event) => {
      const detail = (event as CustomEvent<ReviewFocusDetail>).detail;
      if (!detail || detail.source !== 'review') {
        return;
      }

      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) {
        return;
      }

      if (!detail.line && (detail.boardPin || detail.componentInstanceId)) {
        const matchedRow =
          codePinMatches.find(row =>
            row.componentInstanceIds.includes(detail.componentInstanceId ?? '') &&
            (!detail.componentPin || row.componentPins.includes(detail.componentPin))
          ) ??
          codePinMatches.find(row =>
            row.boardPin === detail.boardPin &&
            (!detail.componentPin || row.componentPins.includes(detail.componentPin))
          ) ??
          codePinMatches.find(row => row.boardPin === detail.boardPin) ??
          codePinMatches.find(row => row.componentInstanceIds.includes(detail.componentInstanceId ?? ''));
        if (matchedRow) {
          focusPinMatchRow(matchedRow);
        }
        return;
      }

      if (!detail.line) {
        return;
      }

      editor.revealLineInCenter(detail.line);
      editor.setPosition({ lineNumber: detail.line, column: 1 });
      editor.focus();

      const model = editor.getModel();
      if (!model) {
        return;
      }

      const lineLength = Math.max(model.getLineLength(detail.line), 1);
      editor.setSelection({
        startLineNumber: detail.line,
        startColumn: 1,
        endLineNumber: detail.line,
        endColumn: lineLength + 1,
      });
    };

    window.addEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
    return () => {
      window.removeEventListener(REVIEW_FOCUS_EVENT, handleReviewFocus as EventListener);
    };
  }, [codePinMatches, focusPinMatchRow]);

  useEffect(() => {
    const handleCommentFocus = (event: Event) => {
      const detail = (event as CustomEvent<CommentFocusDetail>).detail;
      if (!detail || detail.targetType !== 'code_line' || !('lineNumber' in detail.targetMeta)) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const lineNumber = detail.targetMeta.lineNumber;
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      editor.focus();
    };

    window.addEventListener(COMMENT_FOCUS_EVENT, handleCommentFocus as EventListener);
    return () => {
      window.removeEventListener(COMMENT_FOCUS_EVENT, handleCommentFocus as EventListener);
    };
  }, []);

  useEffect(() => {
    const handleCollaborationFocus = (event: Event) => {
      const detail = (event as CustomEvent<CollaborationFocusDetail>).detail;
      if (!detail?.lineNumber) {
        return;
      }

      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      editor.revealLineInCenter(detail.lineNumber);
      editor.setPosition({ lineNumber: detail.lineNumber, column: 1 });
      editor.focus();
    };

    window.addEventListener(COLLABORATION_FOCUS_EVENT, handleCollaborationFocus as EventListener);
    return () => {
      window.removeEventListener(COLLABORATION_FOCUS_EVENT, handleCollaborationFocus as EventListener);
    };
  }, []);

  const handleEditorMount = useCallback<NonNullable<OnMount>>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editorMouseListenerRef.current?.dispose();
    editorMouseListenerRef.current = editor.onMouseDown(event => {
      const lineNumber = event.target.position?.lineNumber ?? undefined;
      setLastEditorGesture(current => ({
        ...current,
        line: lineNumber ?? null,
        targetType: String(event.target.type),
      }));
      if (!lineNumber) {
        return;
      }

      const targetType = event.target.type;
      const isGutterClick =
        targetType === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        targetType === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS;

      if (isGutterClick) {
        const existingThread = openCodeCommentThreads.find(thread =>
          'lineNumber' in thread.root.targetMeta &&
          thread.root.targetMeta.lineNumber === lineNumber
        );
        if (existingThread) {
          selectComment(existingThread.root.id);
          focusComment(existingThread.root);
          return;
        }
      }

      if (commentMode && isGutterClick) {
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column: 1 });
        startCommentDraft('code_line', { lineNumber });
        return;
      }

      const matchingDiagnostic = [...diagnosticMarkersRef.current]
        .filter(marker => marker.line === lineNumber)
        .sort((left, right) => {
          const severityRank = { error: 0, warning: 1, info: 2 } as const;
          return severityRank[left.severity] - severityRank[right.severity];
        })[0];

      if (matchingDiagnostic) {
        focusDiagnosticMarker(matchingDiagnostic);
        return;
      }

      const matchedRow = codePinMatchByLineRef.current.get(lineNumber);
      if (matchedRow) {
        focusPinMatchRow(matchedRow);
        return;
      }

      const model = editor.getModel();
      const lineText = model?.getLineContent(lineNumber) ?? '';
      const matchedPin = boardPinsRef.current.find(
        pin => new RegExp(`\\b${pin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lineText)
      );
      if (!matchedPin) {
        return;
      }

      const relatedComponent = componentsRef.current.find(component =>
        Object.values(component.assignedPins).includes(matchedPin)
      );
      const componentPin = relatedComponent
        ? Object.entries(relatedComponent.assignedPins).find(([, boardPin]) => boardPin === matchedPin)?.[0]
        : undefined;

      const targetInstanceId = relatedComponent?.instanceId ?? 'board-node';
      window.dispatchEvent(new CustomEvent('modumake:focus-component', {
        detail: { instanceId: targetInstanceId },
      }));

      emitReviewFocus({
        source: 'code',
        emphasis: 'action',
        boardPin: matchedPin,
        componentInstanceId: relatedComponent?.instanceId,
        componentName: relatedComponent?.name,
        componentPin,
        severity: 'info',
        title: `코드에서 ${matchedPin} 참조`,
        message: lineText.trim(),
        line: lineNumber,
      });
    });
    editor.onMouseMove(event => {
      const lineNumber = event.target.position?.lineNumber;
      if (!lineNumber) {
        if (hoveredPinMatchIdRef.current) {
          clearHoveredPinMatchPreview();
        }
        return;
      }

      const model = editor.getModel();
      const word = model?.getWordAtPosition(event.target.position ?? { lineNumber, column: 1 });
      const matchedRow =
        (word ? codePinMatchLookup.get(word.word.toLowerCase()) : null) ??
        codePinMatchByLineRef.current.get(lineNumber);
      if (!matchedRow) {
        if (hoveredPinMatchIdRef.current) {
          clearHoveredPinMatchPreview();
        }
        return;
      }

      if (hoveredPinMatchIdRef.current === matchedRow.id) {
        return;
      }

      setHoveredPinMatchId(matchedRow.id);
      if (word && model) {
        hoverWordDecorationsRef.current?.clear();
        hoverWordDecorationsRef.current = editor.createDecorationsCollection([
          {
            range: new monaco.Range(lineNumber, word.startColumn, lineNumber, word.endColumn),
            options: {
              inlineClassName: 'mm-code-pin-hover',
            },
          },
        ]);
      }
      emitPinMatchFocus(matchedRow, 'hover');
    });
    editor.onMouseLeave(() => {
      clearHoveredPinMatchPreview();
    });
    editor.onDidChangeCursorPosition(event => {
      if (!collaborationEnabled) {
        return;
      }

      updatePresence({
        scope: 'code',
        selection: {
          lineNumber: event.position.lineNumber,
          label: `코드 ${event.position.lineNumber}줄`,
        },
        cursor: {
          lineNumber: event.position.lineNumber,
        },
      });
    });
    editor.onDidDispose(() => {
      editorMouseListenerRef.current?.dispose();
      editorMouseListenerRef.current = null;
      commentDecorationsRef.current?.clear();
      commentDecorationsRef.current = null;
      commentFlashDecorationsRef.current?.clear();
      commentFlashDecorationsRef.current = null;
      if (codeLineFlashTimeoutRef.current) {
        window.clearTimeout(codeLineFlashTimeoutRef.current);
        codeLineFlashTimeoutRef.current = null;
      }
      collaborationDecorationsRef.current?.clear();
      collaborationDecorationsRef.current = null;
      inlineHintDecorationsRef.current?.clear();
      inlineHintDecorationsRef.current = null;
      hoverWordDecorationsRef.current?.clear();
      hoverWordDecorationsRef.current = null;
      editorRef.current = null;
      monacoRef.current = null;
    });
  }, [clearHoveredPinMatchPreview, codePinMatchLookup, collaborationEnabled, commentMode, emitPinMatchFocus, focusComment, focusDiagnosticMarker, focusPinMatchRow, openCodeCommentThreads, selectComment, startCommentDraft, updatePresence]);

  return (
    <div
      data-mm-scope="code-panel"
      data-mm-last-editor-line={lastEditorGesture.line ?? ''}
      data-mm-last-editor-target-type={lastEditorGesture.targetType ?? ''}
      data-mm-last-focused-issue-key={lastEditorGesture.focusedIssueKey ?? ''}
      className="flex flex-col w-full h-full"
      style={{
        background: '#0d0d0d',
      }}
    >
      {/* ── 패널 헤더 ── */}
      <div
        className="flex-shrink-0 px-4 pt-3 pb-2 border-b space-y-2"
        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
      >
        {/* 타이틀 + 언어 배지 */}
        <div className="flex items-center gap-2">
          <Code2 size={14} className="text-purple-400" />
          <h2 className="text-white font-bold text-sm">코드 에디터</h2>
          <span
            className="text-xs font-mono px-2 py-0.5 rounded-md"
            style={{
              background: LANG_COLOR[language],
              color:      LANG_TEXT[language],
            }}
          >
            {board.targetLanguage}
          </span>
          <span
            className="text-[11px] font-mono px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
            style={aiBadgeTone}
            title={lastCodeGenerationMeta?.model ?? '아직 코드 생성 전입니다.'}
          >
            <Sparkles size={11} />
            {aiBadgeText}
          </span>
          <span
            className="text-[11px] font-mono px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
            style={compileBadge.tone}
            title={compileBadge.title}
          >
            <Play size={11} />
            {compileBadge.text}
          </span>
          {connectedCount > 0 && (
            <span
              className="ml-auto text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}
            >
              {connectedCount}개 연결됨
            </span>
          )}
          {installedLibraries.length > 0 && (
            <span
              className="text-[11px] font-mono px-2 py-0.5 rounded-md border inline-flex items-center gap-1"
              style={{
                background: 'rgba(56,189,248,0.12)',
                borderColor: 'rgba(56,189,248,0.26)',
                color: '#7dd3fc',
              }}
              title={installedLibraries.map(library => library.name).join(', ')}
            >
              <Download size={11} />
              라이브러리 {installedLibraries.length}
            </span>
          )}
          {codeParticipants.length > 0 && (
            <div className="ml-auto flex items-center gap-1.5">
              {codeParticipants.slice(0, 3).map(participant => (
                <button
                  key={participant.sessionId}
                  type="button"
                  onClick={() => focusParticipant(participant.sessionId)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    borderColor: `${participant.color}55`,
                    background: `${participant.color}18`,
                    color: '#e5e7eb',
                  }}
                  title={summarizeCollaborationParticipant(participant)}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: participant.color }}
                  />
                  <span className="max-w-[84px] truncate">{participant.userName}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-400">
          {mode === 'combined'
            ? '지금은 코드와 회로를 함께 대조하는 중입니다. 변수, 핀, 부품 연결을 한 흐름으로 확인할 수 있습니다.'
            : '지금은 코드 검토 중심 화면입니다. 필요할 때 회로와 연결된 핀을 함께 짚어볼 수 있습니다.'}
        </div>

        <div
          className="rounded-lg border px-3 py-2 text-[11px]"
          style={{
            background: mode === 'combined' ? 'rgba(14,165,233,0.08)' : 'rgba(15,23,42,0.42)',
            borderColor: mode === 'combined' ? 'rgba(56,189,248,0.24)' : 'rgba(148,163,184,0.14)',
            color: mode === 'combined' ? '#dbeafe' : '#cbd5e1',
          }}
        >
          <span className="font-semibold">
            {mode === 'combined' ? '함께 검증' : '코드 검증'}
          </span>
          <span className="ml-2">
            {mode === 'combined'
              ? '회로에 배치된 실제 핀과 코드 변수 사용을 같이 봅니다.'
              : '입출력 사용과 변수 선언을 먼저 보고, 필요할 때 회로 쪽으로 이어집니다.'}
          </span>
        </div>

        {codePinMatches.length > 0 && (
          <div
            className="rounded-lg border px-3 py-2"
            style={{
              background: 'rgba(15,23,42,0.62)',
              borderColor: 'rgba(96,165,250,0.18)',
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-sky-100">핀 매칭 표</div>
                <div className="text-[10px] text-slate-400">코드 변수, 보드 핀, 연결된 회로를 한 번에 봅니다.</div>
              </div>
              <div className="text-[10px] text-slate-500">{codePinMatches.length}개 핀</div>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
              <div className="rounded-md border border-slate-800 bg-slate-950/55 px-2 py-1.5 text-slate-300">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">일치</div>
                <div className="mt-0.5 font-semibold text-emerald-300">{pinMatchCounts.matched}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/55 px-2 py-1.5 text-slate-300">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">주의</div>
                <div className="mt-0.5 font-semibold text-amber-300">{pinMatchCounts.warning}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/55 px-2 py-1.5 text-slate-300">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">충돌</div>
                <div className="mt-0.5 font-semibold text-rose-300">{pinMatchCounts.error}</div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/55 px-2 py-1.5 text-slate-300">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">미연결</div>
                <div className="mt-0.5 font-semibold text-slate-200">{pinMatchCounts.unwired}</div>
              </div>
            </div>
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/45 px-2.5 py-2 text-[10px] text-slate-400">
              <span>
                {showPinMatchDetails
                  ? '상세 핀 매칭을 모두 보는 중입니다.'
                  : '첫 화면에서는 요약만 보여주고, 자세한 핀별 연결은 펼쳐서 봅니다.'}
              </span>
              <button
                type="button"
                onClick={() => setShowPinMatchDetails(current => !current)}
                className="shrink-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 font-semibold text-slate-100 transition-colors hover:border-sky-400/40 hover:text-sky-200"
              >
                {showPinMatchDetails ? '접기' : '자세히'}
              </button>
            </div>
            {showPinMatchDetails ? (
            <div className="max-h-44 space-y-1 overflow-auto pr-1">
              {codePinMatches.map(row => {
                const badge = getPinMatchBadge(row);
                const tone =
                  row.severity === 'error'
                    ? {
                        border: 'rgba(239,68,68,0.24)',
                        background: 'rgba(127,29,29,0.14)',
                        status: '#fca5a5',
                      }
                    : row.severity === 'warning'
                      ? {
                          border: 'rgba(245,158,11,0.22)',
                          background: 'rgba(120,53,15,0.14)',
                          status: '#fcd34d',
                        }
                      : row.status === 'matched'
                        ? {
                            border: 'rgba(34,197,94,0.18)',
                            background: 'rgba(20,83,45,0.12)',
                            status: '#86efac',
                          }
                        : {
                            border: 'rgba(148,163,184,0.18)',
                            background: 'rgba(30,41,59,0.28)',
                            status: '#cbd5e1',
                          };

                return (
                  <button
                    key={row.id}
                    type="button"
                    className="w-full rounded-md border px-2.5 py-2 text-left transition-colors"
                    style={{
                      borderColor: tone.border,
                      background: hoveredPinMatchId === row.id ? 'rgba(59,130,246,0.14)' : tone.background,
                    }}
                    onMouseEnter={() => {
                      setHoveredPinMatchId(row.id);
                      emitPinMatchFocus(row, 'hover');
                    }}
                    onMouseLeave={() => {
                      setHoveredPinMatchId(current => (current === row.id ? null : current));
                      emitReviewFocus({
                        source: 'code',
                        interaction: 'clear',
                      });
                    }}
                    onClick={() => focusPinMatchRow(row)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                      <div className="truncate text-[11px] font-medium text-white">
                          {row.primarySourceName ?? row.sourceNames[0] ?? row.boardPin}
                        </div>
                        <div className="truncate text-[10px] text-slate-400">
                          {row.boardPin}
                          {row.primaryComponentPin ? ` ↔ ${row.primaryComponentPin}` : ''}
                          {' · '}
                          {row.operationTypes.join(', ')}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ color: badge.color, background: 'rgba(15,23,42,0.72)' }}>
                        {badge.label}
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] text-slate-300">
                      {row.componentNames.length > 0
                        ? `${row.componentNames.join(', ')} · ${row.componentPins.join(', ')}`
                        : '아직 회로 쪽 연결 대상을 못 찾았습니다.'}
                    </div>
                    {row.reason ? (
                      <div className="mt-1 line-clamp-2 text-[10px] text-slate-400">
                        {row.reason}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{row.lineNumbers.map(line => `${line}줄`).join(', ')}</span>
                      {row.issueCount > 0 ? <span>검토 {row.issueCount}건</span> : <span>이상 없음</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            ) : null}
          </div>
        )}

        {(diagnosticBundle.markers.length > 0 || diagnosticBundle.generalIssues.length > 0) && (
          <div
            className="rounded-lg border px-3 py-2 text-[11px]"
            style={{
              background:
                diagnosticCounts.error > 0
                  ? 'rgba(239,68,68,0.08)'
                  : diagnosticCounts.warning > 0
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(59,130,246,0.08)',
              borderColor:
                diagnosticCounts.error > 0
                  ? 'rgba(239,68,68,0.24)'
                  : diagnosticCounts.warning > 0
                    ? 'rgba(245,158,11,0.22)'
                    : 'rgba(59,130,246,0.24)',
              color:
                diagnosticCounts.error > 0
                  ? '#fecaca'
                  : diagnosticCounts.warning > 0
                    ? '#fde68a'
                    : '#bfdbfe',
            }}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>코드 검토 결과</span>
              {diagnosticCounts.error > 0 && <span>{diagnosticCounts.error}개 차단</span>}
              {diagnosticCounts.warning > 0 && <span>{diagnosticCounts.warning}개 경고</span>}
              {diagnosticCounts.info > 0 && <span>{diagnosticCounts.info}개 정보</span>}
            </div>
            {diagnosticBundle.generalIssues[0] && (
              <div className="mt-1 text-[10px] leading-relaxed text-slate-300">
                {diagnosticBundle.generalIssues[0].title}: {diagnosticBundle.generalIssues[0].message}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950/35 px-2.5 py-2 text-[10px] text-slate-300">
              <span>
                {showDiagnosticDetails
                  ? '상세 경고 문구를 펼쳐서 보는 중입니다.'
                  : '첫 화면에서는 핵심 한 줄만 보여주고, 자세한 원인은 펼쳐서 봅니다.'}
              </span>
              <button
                type="button"
                onClick={() => setShowDiagnosticDetails(current => !current)}
                className="shrink-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 font-semibold text-slate-100 transition-colors hover:border-sky-400/40 hover:text-sky-200"
              >
                {showDiagnosticDetails ? '접기' : '자세히'}
              </button>
            </div>
            {showDiagnosticDetails ? (
              <div className="mt-2 space-y-1">
                {diagnosticBundle.generalIssues.slice(0, 4).map((issue, index) => (
                  <div
                    key={`${issue.ruleId ?? 'issue'}-${issue.title}-${index}`}
                    className="rounded-md border border-white/10 bg-slate-950/35 px-2.5 py-2 text-[10px] leading-relaxed text-slate-200"
                  >
                    <span className="font-semibold">{issue.title}</span>
                    <span className="ml-1 text-slate-400">{issue.message}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {lastCompilerManifest && (
          <div className="text-[11px] text-slate-500 leading-relaxed">
            {lastCompilerManifest.compileStrategy === 'cloud-compiler-ready'
              ? '이 코드는 현재 회로 기준으로 클라우드 컴파일 서버에 바로 넘길 준비가 되어 있습니다.'
              : lastCompilerManifest.unresolvedHeaders.length
                ? `헤더 ${lastCompilerManifest.unresolvedHeaders.join(', ')} 의 라이브러리 매핑을 더 알면 바로 서버 컴파일까지 이어집니다.`
                : lastCompilerManifest.cloudTarget.reason}
          </div>
        )}

        {isViewOnly && (
          <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-100">
            이 코드는 공유 링크의 보기 전용 상태입니다. 복제본을 만들면 코드 수정과 AI 생성이 다시 활성화됩니다.
          </div>
        )}

        {/* 사용자 의도 입력 */}
        <textarea
          value={userIntent}
          onChange={e => setUserIntent(e.target.value)}
          disabled={isViewOnly}
          placeholder="동작 요구사항 입력 (선택)&#10;예: 버튼 누르면 LED ON, 초음파로 거리 출력..."
          className="w-full text-xs bg-slate-900/60 border border-slate-700/50 rounded-lg p-2.5 text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/60 transition-colors"
          rows={2}
          style={{ fontSize: 11 }}
        />

        {/* AI 생성 버튼 */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || isViewOnly}
          className="w-full gap-2 font-semibold text-sm h-10"
          style={{
            background: isGenerating
              ? 'rgba(139,92,246,0.3)'
              : 'linear-gradient(135deg, #7c3aed, #2563eb)',
            border:     'none',
            boxShadow:  isGenerating ? 'none' : '0 4px 20px rgba(124,58,237,0.4)',
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              AI 코드 생성 중...
            </>
          ) : (
            <>
              <Wand2 size={15} />
              🪄 AI 코드 생성 ({board.name})
            </>
          )}
        </Button>
      </div>

      {/* ── 에디터 영역 상단 바 ── */}
      {(!codeError || editorCode) && (
        <div
          className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.05)', background: '#1e1e1e' }}
        >
          {/* 맥OS 스타일 신호등 */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
            </div>
            <span className="text-gray-600 text-xs font-mono">
              {language === 'python' ? 'main.py' : 'sketch.ino'}
            </span>
            {isStarterMode && (
              <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-sm text-[#86efac] bg-[#12301f] border border-[#22c55e40]">
                Starter
              </span>
            )}
            {collaborationEnabled && (
              <span
                className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-sm border"
                style={{
                  color: '#93c5fd',
                  background: 'rgba(30,41,59,0.7)',
                  borderColor: 'rgba(59,130,246,0.25)',
                }}
                title="다음 단계에서 Yjs 문서로 바로 교체할 수 있도록 협업 코드 문서 경계를 먼저 연결했습니다."
              >
                {sharedDocEngine === 'yjs' ? `Yjs • v${sharedCodeVersion}` : `Shared Code • v${sharedCodeVersion}`}
              </span>
            )}
          </div>

          {/* 액션 버튼들 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleRunCode}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-[#22c55e] hover:bg-[#16a34a] text-black font-extrabold transition-all cursor-pointer"
              title="컴파일 및 시뮬레이션 실행"
            >
              <Play size={10} className="fill-black text-black" />
              <span style={{ fontSize: 10 }}>실행</span>
            </button>
            <button
              onClick={() => {
                if (isViewOnly) {
                  return;
                }
                setIsStarterMode(true);
                setCodeGenerationMeta(null);
                setGeneratedCode(starterCode);
                toast.success('기본 스케치로 되돌렸습니다.');
              }}
              disabled={isViewOnly}
              className="p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="초기화"
            >
              <RefreshCw size={10} />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-slate-800 transition-colors cursor-pointer"
              title="다운로드"
            >
              <Download size={10} />
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:text-white transition-colors hover:bg-slate-800 cursor-pointer"
            >
              {copied ? (
                <Check size={10} className="text-green-400" />
              ) : (
                <Copy size={10} />
              )}
              <span style={{ fontSize: 10 }}>{copied ? '복사됨' : '복사'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 에디터 / 에러 / 빈 상태 ── */}
      <div
        ref={editorSurfaceRef}
        className="relative flex-1 min-h-0 overflow-hidden"
        data-mm-diagnostic-count={renderedDiagnosticAnchors.length}
      >
        {codeError ? (
          /* 에러 상태 */
          <div className="m-4 p-4 rounded-xl border" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={14} className="text-red-400" />
              <span className="text-red-400 font-semibold text-sm">오류 발생</span>
            </div>
            <p className="text-red-300 text-xs leading-relaxed">{codeError}</p>
            <button
              onClick={() => setCodeError(null)}
              className="mt-3 text-xs text-red-400 hover:text-red-300 underline"
            >
              닫기
            </button>
          </div>
        ) : (
          /* Monaco Editor */
          <MonacoEditor
            height="100%"
            language={language}
            theme="vs-dark"
            value={editorCode}
            options={{
              ...MONACO_OPTIONS,
              readOnly: isViewOnly,
            }}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            loading={
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={24} className="animate-spin text-purple-400" />
                  <span className="text-gray-500 text-xs">에디터 로딩 중...</span>
                </div>
              </div>
            }
          />
        )}
        {renderedDiagnosticAnchors.map(marker => (
          <button
            key={marker.issueKey}
            type="button"
            className="absolute z-20 flex h-3 w-3 items-center justify-center rounded-full border border-slate-950/60 shadow-sm transition-transform hover:scale-110"
            style={{
              left: 12,
              top: marker.top,
              background:
                marker.severity === 'error'
                  ? '#ef4444'
                  : marker.severity === 'warning'
                    ? '#f59e0b'
                    : '#38bdf8',
            }}
            title={`${marker.title} (${marker.line}줄)`}
            data-mm-diagnostic-marker-line={marker.line}
            data-mm-diagnostic-marker-severity={marker.severity}
            data-mm-diagnostic-issue-key={marker.issueKey}
            onClick={() => {
              const matchingDiagnostic = diagnosticMarkersRef.current.find(
                diagnostic => diagnostic.issueKey === marker.issueKey
              );
              if (matchingDiagnostic) {
                focusDiagnosticMarker(matchingDiagnostic);
              }
            }}
          >
            <span className="sr-only">{`${marker.title} ${marker.line}줄`}</span>
          </button>
        ))}
        {codeInlineDraft && codeInlineDraftAnchor && codeInlineDraftTargetLabel ? (
          <CommentDraftPopover
            anchor={codeInlineDraftAnchor}
            targetLabel={codeInlineDraftTargetLabel}
            onCancel={cancelDraft}
            onSubmit={async content => {
              const result = await submitDraft(content);
              if (!result.success) {
                return;
              }
            }}
          />
        ) : null}
      </div>
      <style jsx global>{`
        .mm-code-inline-hint {
          margin-left: 12px;
          font-size: 11px;
          font-style: italic;
        }
        .mm-code-inline-token {
          border-radius: 4px;
          padding: 0 2px;
        }
        .mm-code-inline-token-error {
          background: rgba(239, 68, 68, 0.14);
          outline: 1px solid rgba(239, 68, 68, 0.18);
        }
        .mm-code-inline-token-warning {
          background: rgba(245, 158, 11, 0.12);
          outline: 1px solid rgba(245, 158, 11, 0.16);
        }
        .mm-code-inline-token-info {
          background: rgba(148, 163, 184, 0.1);
          outline: 1px solid rgba(148, 163, 184, 0.14);
        }
        .mm-code-inline-hint-error {
          color: #fca5a5;
        }
        .mm-code-inline-hint-warning {
          color: #fcd34d;
        }
        .mm-code-inline-hint-info {
          color: #94a3b8;
        }
        .mm-code-pin-hover {
          background: rgba(56, 189, 248, 0.2);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
