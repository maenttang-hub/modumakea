import type { Metadata } from 'next';
import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/product-config';

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} 데이터 처리 기준`,
  description: 'ModuMake 베타/제품 배포에서 사용자 회로 파일과 운영 이벤트를 다루는 기준',
};

const collected = [
  '이벤트 이름',
  '화면 또는 route',
  '성공/실패 결과',
  '파일 확장자',
  '파일 크기 구간',
  'KiCad 파일 종류',
  '실패 stage',
  '이슈 severity/confidence/source bucket',
];

const notCollected = [
  '파일명',
  '로컬 경로',
  'KiCad 원문',
  '코드 원문',
  '프로젝트 본문',
  '전체 에러 원문',
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f7f2ea] px-6 py-10 text-[#3f342c]">
      <div className="mx-auto max-w-4xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9b8d7d]">{PRODUCT_NAME}</div>
        <h1 className="mt-3 text-3xl font-semibold">데이터 처리 기준</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[#6f6257]">
          하드웨어 파일은 프로젝트 자산입니다. 기본 제품 표면은 브라우저 로컬 저장을 우선하며,
          운영 이벤트 수집은 명시적으로 켠 경우에만 제한된 메타데이터를 보냅니다.
        </p>

        <section className="mt-10 border-t border-[#ded3c5] pt-7">
          <h2 className="text-lg font-semibold">수집 가능한 운영 정보</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-7 text-[#5f5448] sm:grid-cols-2">
            {collected.map(item => (
              <li key={item} className="rounded-lg border border-[#e1d7ca] bg-white px-3 py-2">{item}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10 border-t border-[#ded3c5] pt-7">
          <h2 className="text-lg font-semibold">수집하지 않는 정보</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-7 text-[#5f5448] sm:grid-cols-2">
            {notCollected.map(item => (
              <li key={item} className="rounded-lg border border-[#e1d7ca] bg-[#fffdf9] px-3 py-2">{item}</li>
            ))}
          </ul>
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/editor"
            className="inline-flex h-10 items-center rounded-lg bg-[#4f84be] px-4 text-sm font-semibold text-white transition hover:bg-[#3f74af]"
          >
            워크스페이스로 이동
          </Link>
          <Link
            href="/support"
            className="inline-flex h-10 items-center rounded-lg border border-[#d8cdbf] bg-white px-4 text-sm font-semibold text-[#54473d] transition hover:bg-[#f6f1ea]"
          >
            피드백 보내기
          </Link>
        </div>
      </div>
    </main>
  );
}

