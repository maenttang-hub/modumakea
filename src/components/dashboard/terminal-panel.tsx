'use client';

/**
 * components/dashboard/terminal-panel.tsx
 * 하단 터미널 / 시리얼 모니터 패널 (EDA 스타일)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Cpu, Radio, Trash2, ChevronRight, PlugZap, Send, Unplug } from 'lucide-react';
import { useBoardStore } from '@/store/use-board-store';
import { getBoardById } from '@/constants/boards';
import { deriveRuntimeComponentStates } from '@/lib/runtime-code-bridge';
import { useWebSerial } from '@/hooks/use-web-serial';
import type { ComponentRuntimeState, CompilerManifest, CompileJobRequest, CompileJobResponse } from '@/types';
import { UsbTroubleshooterDialog } from '@/components/dashboard/usb-troubleshooter-dialog';

type LogEntry = {
  time:    string;
  type:    'info' | 'warn' | 'error' | 'data' | 'system';
  message: string;
};

const TYPE_COLOR: Record<LogEntry['type'], string> = {
  info:   '#60a5fa',
  warn:   '#fbbf24',
  error:  '#f87171',
  data:   '#4ade80',
  system: '#94a3b8',
};

const TYPE_PREFIX: Record<LogEntry['type'], string> = {
  info:   '[INFO ]',
  warn:   '[WARN ]',
  error:  '[ERROR]',
  data:   '[DATA ]',
  system: '[SYS  ]',
};

function now() {
  return new Date().toTimeString().slice(0, 8);
}

type TabId = 'terminal' | 'serial' | 'log';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'terminal', label: 'TERMINAL', icon: Terminal },
  { id: 'serial',   label: 'SERIAL',   icon: Radio },
  { id: 'log',      label: 'OUTPUT',   icon: Cpu },
];

function createInitialLogs(): LogEntry[] {
  return [
    { time: now(), type: 'system', message: 'ModuMake Terminal v2.0.0 initialized.' },
    { time: now(), type: 'system', message: 'Serial monitor ready. Connect your board to begin.' },
    { time: now(), type: 'info',   message: 'Tip: 도면을 검토하고 필요한 위치에 주석을 남길 수 있습니다.' },
  ];
}

function createCompileJobId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}`;
}

export function TerminalPanel() {
  const [activeTab, setActiveTab]     = useState<TabId>('terminal');
  const [logs, setLogs]               = useState<LogEntry[]>(createInitialLogs);
  const [input, setInput]             = useState('');
  const [baudRate, setBaudRate]       = useState('9600');
  const [isTroubleshooterOpen, setIsTroubleshooterOpen] = useState(false);
  const bottomRef                     = useRef<HTMLDivElement>(null);
  const simIntervalRef                = useRef<NodeJS.Timeout | null>(null);
  const runtimePulseStatesRef         = useRef<Record<string, ComponentRuntimeState>>({});
  const {
    activeBoardId,
    components,
    generatedCode,
    lastCompilerManifest,
    setRuntimeComponentStates,
    clearRuntimeComponentStates,
  } = useBoardStore();
  const board                         = getBoardById(activeBoardId);
  const webSerial                     = useWebSerial();

  // 새 로그 추가 시 자동 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 컴포넌트 언마운트 시 시뮬레이터 정리
  useEffect(() => {
    return () => {
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
      clearRuntimeComponentStates();
    };
  }, [clearRuntimeComponentStates]);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { time: now(), type, message }]);
  }, []);

  // 가상 C/Python 시뮬레이터 실행 루프
  const startSimulationLoop = useCallback((lang: string, code: string) => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
    }

    const baseRuntimeStates = deriveRuntimeComponentStates({
      boardId: activeBoardId,
      targetLanguage: board.targetLanguage,
      code,
      components,
    });
    runtimePulseStatesRef.current = baseRuntimeStates;
    setRuntimeComponentStates(baseRuntimeStates);

    const prefix = lang === 'python' ? '[MicroPython]' : '[Serial]';
    
    // 코드에서 print 문 추출하여 가상 출력 시뮬레이션에 활용
    const customPrints: string[] = [];
    if (code) {
      const pyMatches = code.match(/print\s*\(\s*["'](.*?)["']\s*\)/g);
      if (pyMatches) {
        pyMatches.forEach(m => {
          const content = m.replace(/print\s*\(\s*["']|["']\s*\)/g, '');
          customPrints.push(content);
        });
      }
      const cppMatches = code.match(/Serial\.println\s*\(\s*["'](.*?)["']\s*\)/g);
      if (cppMatches) {
        cppMatches.forEach(m => {
          const content = m.replace(/Serial\.println\s*\(\s*["']|["']\s*\)/g, '');
          customPrints.push(content);
        });
      }
    }

    let tick = 0;
    simIntervalRef.current = setInterval(() => {
      tick++;

      const runtimeEntries = Object.entries(runtimePulseStatesRef.current);
      if (runtimeEntries.length > 0) {
        const animatedStates: Record<string, ComponentRuntimeState> = Object.fromEntries(
          runtimeEntries.map(([instanceId, state]) => [
            instanceId,
            state.mode === 'pulse'
              ? {
                  ...state,
                  mode: tick % 2 === 0 ? 'active' : 'idle',
                }
              : state,
          ])
        );
        setRuntimeComponentStates(animatedStates);
      }
      
      // 사용자 작성 코드 내의 커스텀 프린트 먼저 출력
      if (customPrints.length > 0 && tick <= customPrints.length) {
        addLog('data', `${prefix} ${customPrints[tick - 1]}`);
        return;
      }

      // 캔버스 부품 현황 로드
      if (components.length === 0) {
        addLog('info', `${prefix} 캔버스에 배치된 센서가 없습니다. 대기 중...`);
        return;
      }

      const routedComps = components.filter(c => c.isFullyRouted);
      if (routedComps.length === 0) {
        addLog('warn', `${prefix} 확인된 연결 정보가 없습니다. 도면의 배선 상태를 먼저 검토해주세요.`);
        return;
      }

      // 부품별 모사 로그 생성
      const comp = routedComps[(tick - 1) % routedComps.length];
      const name = comp.name;
      const tplId = comp.templateId.toLowerCase();
      
      if (tplId.includes('dht') || tplId.includes('temp') || tplId.includes('moisture')) {
        const temp = (23.8 + Math.sin(tick * 0.5) * 1.5).toFixed(1);
        const hum = (48.2 + Math.cos(tick * 0.5) * 4.0).toFixed(1);
        addLog('data', `${prefix} [${name}] DHT 센서 수신 완료 -> Temp: ${temp}°C, Humid: ${hum}%`);
      } else if (tplId.includes('ultrasonic') || tplId.includes('radar')) {
        const dist = (45.3 + Math.sin(tick) * 25.0).toFixed(1);
        addLog('data', `${prefix} [${name}] 초음파 거리 센서 감지값: ${dist} cm`);
      } else if (tplId.includes('photoresistor') || tplId.includes('sun') || tplId.includes('light')) {
        const lux = Math.floor(450 + Math.sin(tick * 0.8) * 180);
        addLog('data', `${prefix} [${name}] 조도 센서 아날로그 입력: ${lux} Lx`);
      } else if (tplId.includes('button')) {
        const pressed = tick % 4 === 0;
        addLog('data', `${prefix} [${name}] 버튼 감지 상태: ${pressed ? 'HIGH (눌림)' : 'LOW (열림)'}`);
      } else if (tplId.includes('led') || tplId.includes('buzzer') || tplId.includes('relay')) {
        const state = tick % 2 === 0 ? 'HIGH' : 'LOW';
        addLog('data', `${prefix} [${name}] 구동기 제어 명령 전송: ${state}`);
      } else {
        addLog('data', `${prefix} [${name}] 활성 루프 작동 중 (Tick #${tick})`);
      }
    }, 1500);
  }, [activeBoardId, addLog, board.targetLanguage, components, setRuntimeComponentStates]);

  const runVirtualCompilation = useCallback((language: string, code: string) => {
    addLog('system', `컴파일 및 빌드 프로세스 시작: sketch.${language === 'python' ? 'py' : 'ino'}`);

    let step = 0;
    const compileInterval = setInterval(() => {
      step++;
      if (language === 'python') {
        if (step === 1) addLog('info', 'MicroPython v1.22.0 가상 런타임 초기화 중...');
        if (step === 2) addLog('info', '가상 인터프리터 구동 및 bytecode 컴파일 성공.');
        if (step === 3) {
          addLog('system', 'MicroPython 인터프리터 구동 시작. 시리얼 스트리밍을 연결합니다.');
          clearInterval(compileInterval);
          setActiveTab('serial');
          startSimulationLoop('python', code);
        }
      } else {
        if (step === 1) addLog('info', '컴파일러 검사 및 헤더 파일 로딩 중 (Arduino.h, Wire.h)...');
        if (step === 2) addLog('info', 'gcc-arm-none-eabi -c -g -Os -Wall sketch.ino');
        if (step === 3) addLog('info', '바이너리 패키징 및 메모리 링커 할당 완료.');
        if (step === 4) {
          addLog('system', '빌드 성공! 바이너리 크기: 24.5 KB (Flash 5%), 1.4 KB (SRAM 7%)');
          addLog('system', '가상 하드웨어 실행을 위해 시리얼 포트를 Open합니다.');
          clearInterval(compileInterval);
          setActiveTab('serial');
          startSimulationLoop('cpp', code);
        }
      }
    }, 500);

    return () => clearInterval(compileInterval);
  }, [addLog, startSimulationLoop]);

  const runCloudCompile = useCallback(async (code: string) => {
    const requiredLibraries = lastCompilerManifest?.arduinoDependencies ?? [];
    const payload: CompileJobRequest = {
      jobId: createCompileJobId(),
      boardId: activeBoardId,
      sourceCode: code,
      requiredLibraries,
    };

    addLog('system', `실제 컴파일 서버로 전송합니다. (${board.name})`);
    const response = await fetch('/api/compile/job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as CompileJobResponse;
    if (response.status === 401 || response.status === 429) {
      addLog('warn', `클라우드 컴파일 제한: ${result.errorDetails ?? '권한 또는 사용량 한도 확인이 필요합니다.'}`);
      addLog('info', '로컬 가상 컴파일로 자동 전환합니다.');
      runVirtualCompilation('cpp', code);
      return;
    }

    if (response.status === 503 || result.status === 'COMPILATION_UNAVAILABLE') {
      addLog('warn', `컴파일 서버 연결 실패: ${result.errorDetails ?? '백엔드 응답 없음'}`);
      addLog('info', '로컬 가상 컴파일로 자동 전환합니다.');
      runVirtualCompilation('cpp', code);
      return;
    }

    if (response.status === 202 || result.status === 'COMPILATION_QUEUED') {
      addLog('system', `컴파일 요청을 내부 큐에 등록했습니다. (${result.queueJob?.queueJobId ?? 'unknown'})`);
      if (result.queueJob?.pollPath) {
        addLog('info', `상태 조회 경로: ${result.queueJob.pollPath}`);
      }
      return;
    }

    const lines = (result.buildLogs || '').split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines.slice(0, 12)) {
      addLog(result.success ? 'info' : 'error', line);
    }

    if (!result.success) {
      addLog('error', result.errorDetails ?? '실제 컴파일에 실패했습니다.');
      return;
    }

    addLog('system', '실제 arduino-cli 컴파일 성공. 이어서 가상 런타임 피드백을 시작합니다.');
    setActiveTab('serial');
    startSimulationLoop('cpp', code);
  }, [activeBoardId, addLog, board.name, lastCompilerManifest?.arduinoDependencies, runVirtualCompilation, startSimulationLoop]);

  // 실행 커맨드 이벤트 수신
  useEffect(() => {
    const handleRunCode = async (e: Event) => {
      const customEvent = e as CustomEvent<{ code: string; language: string }>;
      const { code, language } = customEvent.detail;

      // 1. OUTPUT (log) 탭으로 스위칭
      setActiveTab('log');
      setLogs([]);

      if (language === 'python') {
        runVirtualCompilation(language, code);
        return;
      }

      if (lastCompilerManifest?.compileStrategy === 'cloud-compiler-ready') {
        await runCloudCompile(code);
        return;
      }

      runVirtualCompilation(language, code);
    };

    window.addEventListener('modumake:run-code', handleRunCode);
    return () => {
      window.removeEventListener('modumake:run-code', handleRunCode);
    };
  }, [lastCompilerManifest?.compileStrategy, runCloudCompile, runVirtualCompilation]);

  useEffect(() => {
    const handleCompilerManifest = (event: Event) => {
      const customEvent = event as CustomEvent<CompilerManifest | null>;
      const manifest = customEvent.detail;
      const dependencyCount = manifest?.arduinoDependencies?.length ?? 0;
      if (dependencyCount > 0) {
        addLog('info', `외부 아두이노 라이브러리 ${dependencyCount}개를 컴파일 의존성으로 준비했습니다.`);
      }

      if (!manifest) {
        return;
      }

      if (manifest.compileStrategy === 'cloud-compiler-ready') {
        addLog(
          'system',
          `클라우드 컴파일 준비 완료: ${manifest.cloudTarget.fqbn ?? manifest.cloudTarget.boardId}`
        );
        return;
      }

      if (manifest.unresolvedHeaders.length > 0) {
        addLog(
          'warn',
          `컴파일 전 확인 필요: ${manifest.unresolvedHeaders.join(', ')}`
        );
        return;
      }

      if (manifest.cloudTarget.reason) {
        addLog('info', `현재 상태: ${manifest.cloudTarget.reason}`);
      }
    };

    window.addEventListener('modumake:compiler-manifest', handleCompilerManifest);
    return () => window.removeEventListener('modumake:compiler-manifest', handleCompilerManifest);
  }, [addLog]);

  const handleSerialConnect = useCallback(async () => {
    setActiveTab('serial');
    const result = await webSerial.requestPortAndConnect(Number(baudRate));
    if (!result.success) {
      addLog('error', result.error ?? '시리얼 포트 연결에 실패했습니다.');
      setIsTroubleshooterOpen(true);
      return;
    }

    addLog('system', `WebSerial 포트 연결 완료 (${webSerial.portLabel ?? '직렬 포트'})`);
  }, [addLog, baudRate, webSerial]);

  const handleSerialUpload = useCallback(async () => {
    setActiveTab('serial');
    const codeToUpload = generatedCode.trim();
    if (!codeToUpload) {
      addLog('warn', '전송할 코드가 없습니다. 코드 에디터에서 먼저 코드를 생성해 주세요.');
      return;
    }

    if (lastCompilerManifest?.arduinoDependencies?.length) {
      addLog(
        'info',
        `전송 전 의존성 확인: ${lastCompilerManifest.arduinoDependencies.join(', ')}`
      );
    }

    addLog('system', 'WebSerial 코드 전송을 시작합니다. 보드별 부트로더 업로드 단계는 후속 연결 대상입니다.');
    const result = await webSerial.uploadText(codeToUpload, { baudRate: Number(baudRate) });
    if (!result.success) {
      addLog('error', result.error ?? '코드 전송에 실패했습니다.');
      setIsTroubleshooterOpen(true);
      return;
    }

    addLog('system', '시리얼 코드 전송 완료. 이어서 가상 런타임 피드백을 시작합니다.');
    startSimulationLoop(board.targetLanguage === 'Python' ? 'python' : 'cpp', codeToUpload);
  }, [addLog, baudRate, board.targetLanguage, generatedCode, lastCompilerManifest, startSimulationLoop, webSerial]);

  const handleSerialDisconnect = useCallback(async () => {
    await webSerial.disconnect();
    addLog('system', '직렬 포트를 분리했습니다.');
  }, [addLog, webSerial]);

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || !input.trim()) return;
    const cmd = input.trim();
    addLog('data', `> ${cmd}`);
    setInput('');

    // 간단한 커맨드 인터프리터
    if (cmd === 'clear' || cmd === 'cls') {
      setLogs([]);
      if (simIntervalRef.current) {
        clearInterval(simIntervalRef.current);
      }
      clearRuntimeComponentStates();
      return;
    }
    if (cmd === 'help') {
      addLog('info', 'Commands: clear, status, board, pins, version');
      return;
    }
    if (cmd === 'status') {
      addLog('info', `Board: ${board.name} (${board.chipset})`);
      addLog('info', `Components: ${components.length}개 배치됨`);
      addLog('info', `Routed: ${components.filter(c => c.isFullyRouted).length}개 배선 완료`);
      return;
    }
    if (cmd === 'board') {
      addLog('info', `Target: ${board.name} | ${board.chipset} | ${board.logicVoltage} | ${board.targetLanguage}`);
      return;
    }
    if (cmd === 'pins') {
      addLog('info', `Digital: ${board.digitalPins.join(', ')}`);
      addLog('info', `Left: ${board.leftPins.join(', ')}`);
      return;
    }
    if (cmd === 'version') {
      addLog('system', 'ModuMake v2.0.0 — EDA Platform');
      return;
    }
    addLog('warn', `알 수 없는 명령어: '${cmd}'. 'help'를 입력하세요.`);
  };

  return (
    <div
      data-mm-scope="terminal-panel"
      className="flex flex-col h-full font-mono text-xs overflow-hidden"
      style={{ background: '#0d1117' }}
    >
      {/* 탭 헤더 */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ borderBottom: '1px solid #21262d', background: '#161b22' }}
      >
        {TABS.map(tab => {
          const Icon    = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold transition-colors relative"
              style={{
                color:      isActive ? '#58a6ff' : '#64748b',
                background: isActive ? '#0d1117'  : 'transparent',
                borderRight: '1px solid #21262d',
              }}
            >
              {isActive && (
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{ height: 1.5, background: '#58a6ff' }}
                />
              )}
              <Icon size={11} />
              {tab.label}
            </button>
          );
        })}

        {/* 시리얼 탭 추가 설정 */}
        {activeTab === 'serial' && (
          <div className="ml-auto flex items-center gap-2 px-3">
            <span style={{ color: '#64748b' }}>Baud:</span>
            <select
              value={baudRate}
              onChange={e => setBaudRate(e.target.value)}
              className="bg-transparent text-xs font-mono focus:outline-none"
              style={{ color: '#94a3b8', border: '1px solid #30363d', padding: '1px 4px' }}
            >
              {['300','1200','2400','4800','9600','19200','38400','57600','115200'].map(b => (
                <option key={b} value={b} style={{ background: '#161b22' }}>{b}</option>
              ))}
            </select>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                color:
                  webSerial.status === 'connected'
                    ? '#4ade80'
                    : webSerial.status === 'uploading'
                      ? '#60a5fa'
                      : webSerial.status === 'error'
                        ? '#f87171'
                        : '#94a3b8',
                background:
                  webSerial.status === 'connected'
                    ? 'rgba(74, 222, 128, 0.12)'
                    : webSerial.status === 'uploading'
                      ? 'rgba(96, 165, 250, 0.12)'
                      : webSerial.status === 'error'
                        ? 'rgba(248, 113, 113, 0.12)'
                        : 'rgba(148, 163, 184, 0.12)',
              }}
            >
              {webSerial.status === 'connected'
                ? '연결됨'
                : webSerial.status === 'uploading'
                  ? `${webSerial.progress}%`
                  : webSerial.status === 'connecting'
                    ? '연결 중'
                    : webSerial.status === 'error'
                      ? '오류'
                      : '대기'}
            </span>
            <button
              type="button"
              onClick={() => { void handleSerialConnect(); }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
              style={{ color: '#93c5fd', border: '1px solid rgba(96, 165, 250, 0.32)' }}
              disabled={!webSerial.isSupported || webSerial.status === 'connecting' || webSerial.status === 'uploading'}
            >
              <PlugZap size={10} />
              연결
            </button>
            <button
              type="button"
              onClick={() => { void handleSerialUpload(); }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
              style={{ color: '#c4b5fd', border: '1px solid rgba(196, 181, 253, 0.32)' }}
              disabled={!webSerial.isSupported || webSerial.status === 'connecting' || webSerial.status === 'uploading'}
            >
              <Send size={10} />
              전송
            </button>
            <button
              type="button"
              onClick={() => { void handleSerialDisconnect(); }}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
              style={{ color: '#fca5a5', border: '1px solid rgba(248, 113, 113, 0.28)' }}
              disabled={webSerial.status === 'idle'}
            >
              <Unplug size={10} />
              분리
            </button>
            {(webSerial.error || webSerial.status === 'error') && (
              <button
                type="button"
                onClick={() => setIsTroubleshooterOpen(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
                style={{ color: '#fde68a', border: '1px solid rgba(250, 204, 21, 0.28)' }}
              >
                🔌 해결사
              </button>
            )}
          </div>
        )}

        {/* 클리어 버튼 */}
        <button
          onClick={() => {
            setLogs([]);
            if (simIntervalRef.current) {
              clearInterval(simIntervalRef.current);
            }
            clearRuntimeComponentStates();
          }}
          className="mr-2 flex items-center gap-1 px-2 py-1 text-xs transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b'; }}
          title="로그 지우기"
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* 로그 출력 영역 */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ background: '#0d1117' }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#30363d' }} className="italic mt-2">
            — 로그가 없습니다 —
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 leading-5">
              <span style={{ color: '#30363d', flexShrink: 0 }}>{log.time}</span>
              <span style={{ color: TYPE_COLOR[log.type], flexShrink: 0 }}>
                {TYPE_PREFIX[log.type]}
              </span>
              <span style={{ color: log.type === 'data' ? '#4ade80' : '#c9d1d9' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {activeTab === 'serial' && !webSerial.isSupported && (
          <div className="mt-3 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: 'rgba(248, 113, 113, 0.28)', color: '#fca5a5' }}>
            <div>이 브라우저는 WebSerial을 지원하지 않습니다. Chrome 계열 브라우저에서 시리얼 연결 버튼을 사용해 주세요.</div>
            <button
              type="button"
              onClick={() => setIsTroubleshooterOpen(true)}
              className="mt-3 inline-flex items-center gap-1 rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold text-amber-200"
            >
              🔌 USB 연결 문제 해결사
            </button>
          </div>
        )}
        {activeTab === 'serial' && webSerial.error && (
          <div className="mt-3 rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: 'rgba(248, 113, 113, 0.28)', color: '#fca5a5' }}>
            <div>{webSerial.error}</div>
            <button
              type="button"
              onClick={() => setIsTroubleshooterOpen(true)}
              className="mt-3 inline-flex items-center gap-1 rounded border border-amber-400/30 px-2 py-1 text-[10px] font-bold text-amber-200"
            >
              🔌 USB 연결 문제 해결사
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div
        className="flex items-center flex-shrink-0 px-3"
        style={{ borderTop: '1px solid #21262d', background: '#0d1117', height: 30 }}
      >
        <ChevronRight size={11} style={{ color: '#22c55e', flexShrink: 0 }} />
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleCommand}
          placeholder="명령어 입력... (help 입력 시 도움말)"
          className="flex-1 bg-transparent text-xs font-mono focus:outline-none ml-1.5"
          style={{
            color:            '#c9d1d9',
            caretColor:       '#22c55e',
          }}
        />
      </div>
      <UsbTroubleshooterDialog
        open={isTroubleshooterOpen}
        onOpenChange={setIsTroubleshooterOpen}
        activeBoardId={activeBoardId}
        currentBaudRate={baudRate}
        onApplyBaudRate={nextBaudRate => {
          setBaudRate(nextBaudRate);
          addLog('info', `시리얼 속도를 ${nextBaudRate}로 변경했습니다. 다시 연결 또는 전송을 시도해 보세요.`);
        }}
      />
    </div>
  );
}
