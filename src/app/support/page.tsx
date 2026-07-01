import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PRODUCT_FEEDBACK_URL,
  PRODUCT_NAME,
  PRODUCT_SUPPORT_EMAIL,
} from '@/lib/product-config';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} 피드백`,
  description: 'ModuMake 제품 피드백과 문제 제보 안내',
};

export default function SupportPage() {
  const feedbackHref = PRODUCT_FEEDBACK_URL || (PRODUCT_SUPPORT_EMAIL ? `mailto:${PRODUCT_SUPPORT_EMAIL}` : '');

  return (
    <main className="min-h-screen bg-[#f7f2ea] px-6 py-10 text-[#3f342c]">
      <div className="mx-auto max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b8d7d]">{PRODUCT_NAME}</div>
        <h1 className="mt-3 text-3xl font-semibold">피드백과 문제 제보</h1>
        <p className="mt-4 text-sm leading-7 text-[#6f6257]">
          베타와 제품 배포에서는 import 실패, 오탐, 이해하기 어려운 경고, 리포트 공유 실패를 우선 수집합니다.
          파일 원문을 보내기 전에는 공유 가능 여부를 먼저 확인해 주세요.
        </p>

        <section className="mt-10 border-t border-[#ded3c5] pt-7">
          <h2 className="text-lg font-semibold">보내면 좋은 정보</h2>
          <ul className="mt-4 space-y-2 text-sm leading-7 text-[#5f5448]">
            <li className="rounded-lg border border-[#e1d7ca] bg-white px-3 py-2">사용한 파일 종류: `.kicad_sch` 또는 `.kicad_pcb`</li>
            <li className="rounded-lg border border-[#e1d7ca] bg-white px-3 py-2">문제가 난 단계: import, 경고 확인, feedback 처리, report export</li>
            <li className="rounded-lg border border-[#e1d7ca] bg-white px-3 py-2">경고 제목과 오탐이라고 판단한 이유</li>
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          {feedbackHref ? (
            <a
              href={feedbackHref}
              className="inline-flex h-10 items-center rounded-lg bg-[#4f84be] px-4 text-sm font-semibold text-white transition hover:bg-[#3f74af]"
            >
              피드백 열기
            </a>
          ) : (
            <div className="rounded-lg border border-[#ead7c8] bg-[#fff8f2] px-4 py-3 text-sm leading-6 text-[#835d38]">
              배포 전 `NEXT_PUBLIC_MODUMAKE_FEEDBACK_URL` 또는 `NEXT_PUBLIC_MODUMAKE_SUPPORT_EMAIL`을 설정해야 합니다.
            </div>
          )}
          <Link
            href="/editor"
            className="inline-flex h-10 items-center rounded-lg border border-[#d8cdbf] bg-white px-4 text-sm font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
          >
            워크스페이스로 이동
          </Link>
        </div>
      </div>
    </main>
  );
}

