'use client';

/**
 * components/dev-warning-suppressor.tsx
 * 개발 모드 전용: Turbopack + reactflow v11 간 알려진 콘솔 경고 억제
 * (프로덕션 빌드에서는 자동으로 비활성화됨)
 */

import { useEffect } from 'react';

export function DevWarningSuppressor() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const originalWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? '');
      // React Flow nodeTypes 관련 Turbopack Fast Refresh 경고 억제
      if (msg.includes('nodeTypes') || msg.includes('edgeTypes') || msg.includes('reactflow.dev/error')) {
        return;
      }
      originalWarn(...args);
    };

    return () => {
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
