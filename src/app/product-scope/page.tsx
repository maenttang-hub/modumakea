import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PRODUCT_NAME,
  PRODUCT_ONE_LINE,
  PRODUCT_RELEASE_VERSION,
  PRODUCT_SUPPORTED_SCOPE,
  PRODUCT_UNSUPPORTED_CLAIMS,
} from '@/lib/product-config';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} 제품 범위`,
  description: PRODUCT_ONE_LINE,
};

export default function ProductScopePage() {
  return (
    <main className="min-h-screen bg-[#f7f2ea] px-6 py-10 text-[#3f342c]">
      <div className="mx-auto max-w-4xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b8d7d]">
          {PRODUCT_NAME} {PRODUCT_RELEASE_VERSION}
        </div>
        <h1 className="mt-3 text-3xl font-semibold">제품 범위</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6f6257]">{PRODUCT_ONE_LINE}</p>

        <section className="mt-10 border-t border-[#ded3c5] pt-7">
          <h2 className="text-lg font-semibold">지원하는 일</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-7 text-[#5f5448] sm:grid-cols-2">
            {PRODUCT_SUPPORTED_SCOPE.map(item => (
              <li key={item} className="rounded-lg border border-[#e1d7ca] bg-white px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10 border-t border-[#ded3c5] pt-7">
          <h2 className="text-lg font-semibold">아직 약속하지 않는 일</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-7 text-[#5f5448] sm:grid-cols-2">
            {PRODUCT_UNSUPPORTED_CLAIMS.map(item => (
              <li key={item} className="rounded-lg border border-[#e1d7ca] bg-[#fffdf9] px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/editor"
            className="inline-flex h-10 items-center rounded-lg bg-[#4f84be] px-4 text-sm font-semibold text-white transition hover:bg-[#3f74af]"
          >
            리뷰 워크스페이스 열기
          </Link>
          <Link
            href="/privacy"
            className="inline-flex h-10 items-center rounded-lg border border-[#d8cdbf] bg-white px-4 text-sm font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
          >
            데이터 처리 기준
          </Link>
        </div>
      </div>
    </main>
  );
}

