import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { DevWarningSuppressor } from '@/components/dev-warning-suppressor';
import { APP_LANGUAGE_COOKIE, resolveAppLanguage } from '@/lib/ui-language';

export const metadata: Metadata = {
  title: 'ModuMake — PCB 만들기 전에 회로 실수를 잡아주는 AI 하드웨어 리뷰어',
  description:
    '센서/보드 조합 오류를 데이터시트 기준으로 잡아주고, PCB 넘어가기 전 하드웨어 실수를 줄여주는 검증 중심 설계 도구',
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
