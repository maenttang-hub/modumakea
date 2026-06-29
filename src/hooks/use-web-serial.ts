'use client';

import { useCallback, useMemo, useState } from 'react';

type WebSerialStatus = 'idle' | 'connecting' | 'connected' | 'uploading' | 'error';
type WebSerialActionResult =
  | { success: true; port?: BrowserSerialPort }
  | { success: false; error: string };

type BrowserSerialOutputSignals = {
  dataTerminalReady?: boolean;
};

type BrowserSerialPort = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
  writable?: WritableStream<Uint8Array>;
  setSignals?: (signals: Partial<BrowserSerialOutputSignals>) => Promise<void>;
};

type BrowserSerialNavigator = Navigator & {
  serial?: {
    requestPort: () => Promise<BrowserSerialPort>;
  };
};

function isWebSerialSupported() {
  return typeof navigator !== 'undefined' && 'serial' in (navigator as BrowserSerialNavigator);
}

function getReadableError(error: unknown) {
  if (error instanceof DOMException) {
    return error.message || '브라우저 직렬 통신 권한이 거부되었습니다.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '직렬 통신 중 알 수 없는 오류가 발생했습니다.';
}

export function useWebSerial() {
  const [status, setStatus] = useState<WebSerialStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState<BrowserSerialPort | null>(null);
  const [portLabel, setPortLabel] = useState<string | null>(null);

  const isSupported = useMemo(() => isWebSerialSupported(), []);

  const disconnect = useCallback(async () => {
    if (!port) {
      setStatus('idle');
      setProgress(0);
      return;
    }

    try {
      await port.close();
    } catch {
      // ignore close failures
    } finally {
      setPort(null);
      setPortLabel(null);
      setStatus('idle');
      setProgress(0);
    }
  }, [port]);

  const requestPortAndConnect = useCallback(async (baudRate: number): Promise<WebSerialActionResult> => {
    if (!isWebSerialSupported()) {
      setStatus('error');
      setError('이 브라우저에서는 WebSerial을 지원하지 않습니다.');
      return { success: false, error: '이 브라우저에서는 WebSerial을 지원하지 않습니다.' };
    }

    try {
      setStatus('connecting');
      setError(null);
      const selectedPort = await (navigator as BrowserSerialNavigator).serial!.requestPort();
      await selectedPort.open({ baudRate });
      const info = selectedPort.getInfo();
      setPort(selectedPort);
      setPortLabel(
        info.usbVendorId && info.usbProductId
          ? `VID ${info.usbVendorId.toString(16)} / PID ${info.usbProductId.toString(16)}`
          : '시리얼 포트 연결됨'
      );
      setStatus('connected');
      setProgress(0);
      return { success: true, port: selectedPort };
    } catch (nextError) {
      const message = getReadableError(nextError);
      setStatus('error');
      setError(message);
      return { success: false, error: message };
    }
  }, []);

  const uploadText = useCallback(async (code: string, options?: { baudRate?: number }): Promise<WebSerialActionResult> => {
    if (!code.trim()) {
      return { success: false, error: '전송할 코드가 비어 있습니다.' };
    }

    const baudRate = options?.baudRate ?? 9600;
    let targetPort = port;
    if (!targetPort) {
      const connected = await requestPortAndConnect(baudRate);
      if (!connected.success) {
        return connected;
      }
      targetPort = connected.port ?? null;
    }

    targetPort = targetPort ?? port;
    if (!targetPort?.writable) {
      return { success: false, error: '쓰기 가능한 시리얼 포트를 찾을 수 없습니다.' };
    }

    try {
      setStatus('uploading');
      setError(null);
      setProgress(5);

      if (typeof targetPort.setSignals === 'function') {
        await targetPort.setSignals({ dataTerminalReady: false });
        await new Promise(resolve => window.setTimeout(resolve, 120));
        await targetPort.setSignals({ dataTerminalReady: true });
      }

      const writer = targetPort.writable.getWriter();
      const encoder = new TextEncoder();
      const payload = encoder.encode(code);
      const chunkSize = 128;

      for (let offset = 0; offset < payload.length; offset += chunkSize) {
        const chunk = payload.slice(offset, offset + chunkSize);
        await writer.write(chunk);
        setProgress(Math.min(100, Math.round(((offset + chunk.length) / payload.length) * 100)));
      }

      writer.releaseLock();
      setStatus('connected');
      return { success: true };
    } catch (nextError) {
      const message = getReadableError(nextError);
      setStatus('error');
      setError(message);
      return { success: false, error: message };
    }
  }, [port, requestPortAndConnect]);

  return {
    isSupported,
    status,
    progress,
    error,
    portLabel,
    requestPortAndConnect,
    disconnect,
    uploadText,
  };
}
