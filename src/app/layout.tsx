import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { DevWarningSuppressor } from '@/components/dev-warning-suppressor';
import { APP_LANGUAGE_COOKIE, resolveAppLanguage } from '@/lib/ui-language';

export const metadata: Metadata = {
  title: 'ModuMake — 회로 리뷰와 KiCad 검토를 돕는 AI 하드웨어 리뷰어',
  description:
    'KiCad 회로도와 센서/보드 연결을 데이터시트 기준으로 검토하고, 실물 제작 전 확인할 리스크를 정리하는 review-first 도구',
  keywords: ['Arduino', 'ESP32', 'Raspberry Pi', '하드웨어 검증', '데이터시트', '회로 설계', 'AI 하드웨어 리뷰어'],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const appLanguage = resolveAppLanguage(cookieStore.get(APP_LANGUAGE_COOKIE)?.value);

  return (
    <html lang={appLanguage} className="dark" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{ background: '#050c1a' }}
      >
        {children}
        <DevWarningSuppressor />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0d1428',
              border: '1px solid rgba(37,99,235,0.3)',
              color: '#f1f5f9',
            },
          }}
        />
      </body>
    </html>
  );
}
