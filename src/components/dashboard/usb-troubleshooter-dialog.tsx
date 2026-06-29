'use client';

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Cable, CheckCircle2, Cpu, Download, Usb, Zap } from 'lucide-react';
import { getBoardById } from '@/constants/boards';

type UsbTroubleshooterDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeBoardId: string;
  currentBaudRate: string;
  onApplyBaudRate: (baudRate: string) => void;
};

type OsType = 'windows' | 'macos' | 'linux';

type DriverChipset = 'ch340' | 'ftdi' | 'cp210x';

const DRIVER_LINKS: Record<
  DriverChipset,
  {
    label: string;
    vendor: string;
    urls: Record<OsType, string>;
    note: string;
  }
> = {
  ch340: {
    label: 'CH340 / CH341',
    vendor: 'WCH',
    urls: {
      windows: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
      macos: 'https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html',
      linux: 'https://www.wch-ic.com/downloads/CH341SER_LINUX_ZIP.html',
    },
    note: '저가형 Uno/Nano 호환 보드에서 가장 흔한 USB-시리얼 칩입니다.',
  },
  ftdi: {
    label: 'FTDI VCP',
    vendor: 'FTDI',
    urls: {
      windows: 'https://ftdichip.com/drivers/vcp-drivers/',
      macos: 'https://ftdichip.com/drivers/vcp-drivers/',
      linux: 'https://ftdichip.com/drivers/vcp-drivers/',
    },
    note: '정품 또는 고급형 Arduino 호환 보드에서 자주 보입니다.',
  },
  cp210x: {
    label: 'CP210x VCP',
    vendor: 'Silicon Labs',
    urls: {
      windows: 'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers',
      macos: 'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers',
      linux: 'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers',
    },
    note: 'ESP32 개발보드에서 흔한 USB-UART 칩입니다.',
  },
};

const BOARD_DRIVER_HINTS: Record<string, DriverChipset[]> = {
  uno: ['ch340', 'ftdi'],
  nano: ['ch340', 'ftdi'],
  esp32: ['cp210x', 'ch340'],
  rpi4: ['cp210x', 'ftdi', 'ch340'],
};

function detectOs(): OsType {
  if (typeof navigator === 'undefined') {
    return 'windows';
  }

  const candidate = [
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(' ');

  if (/mac/i.test(candidate)) {
    return 'macos';
  }
  if (/linux/i.test(candidate)) {
    return 'linux';
  }
  return 'windows';
}

function boardBaudOptions(boardId: string) {
  switch (boardId) {
    case 'nano':
      return ['57600', '115200', '9600'];
    case 'esp32':
      return ['115200', '921600', '9600'];
    default:
      return ['115200', '9600', '57600'];
  }
}

export function UsbTroubleshooterDialog({
  open,
  onOpenChange,
  activeBoardId,
  currentBaudRate,
  onApplyBaudRate,
}: UsbTroubleshooterDialogProps) {
  const [boardId, setBoardId] = useState(activeBoardId);
  const [portDetected, setPortDetected] = useState<'yes' | 'no' | null>(null);
  const [powerLight, setPowerLight] = useState<'yes' | 'no' | null>(null);
  const detectedOs = useMemo(() => detectOs(), []);
  const board = getBoardById(boardId);
  const driverHints = BOARD_DRIVER_HINTS[boardId] ?? ['ch340'];
  const baudOptions = boardBaudOptions(boardId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="w-[min(880px,calc(100vw-2rem))] max-w-none overflow-hidden rounded-xl border border-slate-800 bg-[#0b1220] p-0 text-slate-200 shadow-2xl"
      >
        <DialogHeader className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
              <Usb size={18} />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-slate-100">USB 연결 문제 해결사</DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed text-slate-400">
                보드 전원, 포트 인식, 드라이버, 통신 속도를 순서대로 확인해서 업로드 실패 원인을 빠르게 좁힙니다.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-slate-800 bg-slate-950/30 p-5 lg:border-b-0 lg:border-r">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Cpu size={14} className="text-violet-300" />
                  현재 보드
                </div>
                <div className="mt-3 grid gap-2">
                  {['uno', 'nano', 'esp32', 'rpi4'].map(candidateId => {
                    const candidateBoard = getBoardById(candidateId);
                    const selected = boardId === candidateId;
                    return (
                      <button
                        key={candidateId}
                        type="button"
                        onClick={() => setBoardId(candidateId)}
                        className="flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors"
                        style={{
                          borderColor: selected ? 'rgba(96, 165, 250, 0.45)' : 'rgba(51, 65, 85, 0.6)',
                          background: selected ? 'rgba(15, 23, 42, 0.92)' : 'rgba(2, 6, 23, 0.45)',
                        }}
                      >
                        <span className="text-xs font-bold text-slate-100">{candidateBoard.name}</span>
                        <span className="text-[10px] text-slate-500">{candidateBoard.logicVoltage}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-xs font-bold text-slate-200">1. 보드에 불이 들어옵니까?</div>
                <div className="mt-3 flex gap-2">
                  {(['yes', 'no'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPowerLight(value)}
                      className="rounded-lg border px-3 py-2 text-xs font-bold transition-colors"
                      style={{
                        borderColor: powerLight === value ? 'rgba(52, 211, 153, 0.45)' : 'rgba(51, 65, 85, 0.6)',
                        background: powerLight === value ? 'rgba(6, 78, 59, 0.28)' : 'rgba(2, 6, 23, 0.35)',
                        color: powerLight === value ? '#a7f3d0' : '#cbd5e1',
                      }}
                    >
                      {value === 'yes' ? '네, 켜집니다' : '아니요, 안 켜집니다'}
                    </button>
                  ))}
                </div>
                {powerLight === 'no' && (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                    전원 LED가 안 들어오면 드라이버보다 먼저 케이블/포트/전원 문제를 의심해야 합니다.
                    충전 전용 케이블 대신 데이터 케이블로 바꾸고, USB 허브 대신 본체 포트에 직접 연결해 보세요.
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <div className="text-xs font-bold text-slate-200">2. 장치 관리자 또는 시스템 정보에 포트가 보입니까?</div>
                <div className="mt-3 flex gap-2">
                  {(['yes', 'no'] as const).map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPortDetected(value)}
                      className="rounded-lg border px-3 py-2 text-xs font-bold transition-colors"
                      style={{
                        borderColor: portDetected === value ? 'rgba(96, 165, 250, 0.45)' : 'rgba(51, 65, 85, 0.6)',
                        background: portDetected === value ? 'rgba(15, 23, 42, 0.92)' : 'rgba(2, 6, 23, 0.35)',
                        color: portDetected === value ? '#bfdbfe' : '#cbd5e1',
                      }}
                    >
                      {value === 'yes' ? '보입니다' : '안 보입니다'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <CheckCircle2 size={14} className="text-emerald-300" />
                  현재 진단
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  감지 OS: <span className="font-bold text-slate-200">{detectedOs === 'macos' ? 'macOS' : detectedOs === 'linux' ? 'Linux' : 'Windows'}</span>
                  {' · '}
                  선택 보드: <span className="font-bold text-slate-200">{board.name}</span>
                </p>
              </div>

              {(powerLight === null || portDetected === null) && (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/20 p-5 text-sm leading-relaxed text-slate-500">
                  왼쪽 질문에 답하면, 드라이버 설치가 필요한지 아니면 통신 설정을 먼저 손봐야 하는지 바로 좁혀서 보여줍니다.
                </div>
              )}

              {powerLight === 'yes' && portDetected === 'no' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-sky-100">
                      <Download size={14} />
                      드라이버 설치 가능성이 큽니다
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-sky-50/80">
                      보드 전원은 들어오지만 포트가 전혀 보이지 않으면 USB-UART 드라이버가 빠졌을 가능성이 높습니다.
                      아래 후보 중 보드에 맞는 칩셋 드라이버를 설치해 보세요.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {driverHints.map(chipset => {
                      const entry = DRIVER_LINKS[chipset];
                      return (
                        <div
                          key={chipset}
                          className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-bold text-slate-100">{entry.label}</div>
                              <div className="mt-1 text-[11px] text-slate-500">{entry.vendor} · {entry.note}</div>
                            </div>
                            <a
                              href={entry.urls[detectedOs]}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-100 hover:border-sky-400/40 hover:text-sky-200"
                            >
                              <Download size={12} />
                              {detectedOs === 'macos' ? 'macOS' : detectedOs === 'linux' ? 'Linux' : 'Windows'} 드라이버
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {powerLight === 'yes' && portDetected === 'yes' && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-100">
                      <AlertTriangle size={14} />
                      통신 또는 업로드 설정을 먼저 확인하세요
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-amber-50/80">
                      포트는 보이는데 연결이나 업로드가 실패하면 속도 설정, 접촉 불량, 부트 모드 진입 문제일 수 있습니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                      <Zap size={14} className="text-violet-300" />
                      권장 속도 후보
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {baudOptions.map(option => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onApplyBaudRate(option)}
                          className="rounded-lg border px-3 py-2 text-xs font-bold transition-colors"
                          style={{
                            borderColor: currentBaudRate === option ? 'rgba(52, 211, 153, 0.45)' : 'rgba(51, 65, 85, 0.6)',
                            background: currentBaudRate === option ? 'rgba(6, 78, 59, 0.28)' : 'rgba(2, 6, 23, 0.35)',
                            color: currentBaudRate === option ? '#a7f3d0' : '#cbd5e1',
                          }}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                      지금 선택된 값은 <span className="font-bold text-slate-200">{currentBaudRate}</span> 입니다.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
                      <Cable size={14} className="text-sky-300" />
                      함께 점검할 것
                    </div>
                    <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400">
                      <li>데이터 전송 가능한 USB 케이블인지 확인</li>
                      <li>USB 허브 대신 본체 포트에 직접 연결</li>
                      <li>ESP32는 업로드 순간 BOOT 버튼을 눌러야 하는 보드가 있음</li>
                      <li>Arduino IDE나 다른 시리얼 모니터가 같은 포트를 점유 중이면 닫기</li>
                    </ul>
                  </div>
                </div>
              )}

              {powerLight === 'no' && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                  <div className="text-sm font-bold text-red-100">먼저 전원/케이블부터 확인하세요</div>
                  <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-red-50/80">
                    <li>충전 전용 케이블이 아닌 데이터 케이블 사용</li>
                    <li>포트 방향을 바꿔 꽂아 보기</li>
                    <li>USB 허브 제거 후 직접 연결</li>
                    <li>보드 LED가 계속 꺼져 있으면 케이블 또는 보드 불량 가능성</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
