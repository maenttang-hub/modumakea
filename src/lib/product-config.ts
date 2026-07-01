export const PRODUCT_NAME = 'ModuMake';

export const PRODUCT_ONE_LINE =
  'KiCad/간단 회로를 가져와서 전원, 배선, 핀, 부품 리스크를 검토하고 리포트로 정리하는 도구';

export const PRODUCT_SUPPORTED_SCOPE = [
  'KiCad schematic/PCB import',
  '전원, 배선, 핀, 부품 리스크 리뷰',
  '근거, 확실도, 확인 방법이 포함된 validation report',
  '사용자 이슈 상태 표시: fixed, already-handled, verified-by-datasheet, false-positive',
  '브라우저 로컬 저장과 제한적 공유 흐름',
] as const;

export const PRODUCT_UNSUPPORTED_CLAIMS = [
  'full PCB CAD',
  '제조 가능 보증',
  'public cloud compile',
  '모든 부품 데이터시트 자동 검증',
  '전문 EDA 대체',
] as const;

export const PRODUCT_RELEASE_VERSION =
  process.env.NEXT_PUBLIC_MODUMAKE_RELEASE_VERSION?.trim() || '0.1.0';

export const PRODUCT_FEEDBACK_URL =
  process.env.NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL?.trim() || '';

export const PRODUCT_SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL?.trim() || '';

export function getProductFeedbackHref() {
  if (PRODUCT_FEEDBACK_URL) {
    return PRODUCT_FEEDBACK_URL;
  }

  if (PRODUCT_SUPPORT_EMAIL) {
    return `mailto:${PRODUCT_SUPPORT_EMAIL}?subject=${encodeURIComponent('ModuMake feedback')}`;
  }

  return '/support';
}

