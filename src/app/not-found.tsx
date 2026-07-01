import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#f7f2ea] px-6 py-10 text-[#3f342c]">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b8d7d]">404</div>
        <h1 className="mt-3 text-3xl font-semibold">페이지를 찾을 수 없습니다</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[#6f6257]">
          현재 제품 표면은 회로 리뷰 워크스페이스와 리포트 흐름에 집중되어 있습니다.
          보류된 기능이나 잘못된 링크는 기본 배포에서 열리지 않습니다.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/editor"
            className="inline-flex h-10 items-center rounded-lg bg-[#4f84be] px-4 text-sm font-semibold text-white transition hover:bg-[#3f74af]"
          >
            리뷰 워크스페이스 열기
          </Link>
          <Link
            href="/product-scope"
            className="inline-flex h-10 items-center rounded-lg border border-[#d8cdbf] bg-white px-4 text-sm font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
          >
            제품 범위 보기
          </Link>
        </div>
      </div>
    </main>
  );
}

