'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { toast } from 'sonner';
import { exportElementAsImage } from '@/lib/export-schematic-image';

export function useCanvasExport(
  exportRef: RefObject<HTMLDivElement | null>,
  projectName: string
) {
  useEffect(() => {
    const handleExportPng = async () => {
      if (!exportRef.current) {
        toast.error('회로도 이미지 내보내기 실패', {
          description: '내보낼 캔버스를 찾을 수 없습니다.',
        });
        return;
      }

      try {
        const exportedFormat = await exportElementAsImage(
          exportRef.current,
          `${projectName || 'modumake-schematic'}`
        );
        toast.success('🖼️ 설계도 이미지 저장 완료', {
          description:
            exportedFormat === 'png'
              ? '현재 회로도를 PNG 파일로 저장했습니다.'
              : '현재 환경에서는 SVG 파일로 저장했습니다.',
        });
      } catch (error) {
        toast.error('회로도 이미지 내보내기 실패', {
          description: error instanceof Error ? error.message : '이미지 생성 중 오류가 발생했습니다.',
        });
      }
    };

    window.addEventListener('modumake:export-schematic-png', handleExportPng);
    return () => window.removeEventListener('modumake:export-schematic-png', handleExportPng);
  }, [exportRef, projectName]);
}
