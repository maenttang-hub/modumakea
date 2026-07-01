'use client';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#f7f2ea', color: '#3f342c', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: '100%', maxWidth: 560 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#9b8d7d' }}>
              MODUMAKE ERROR
            </div>
            <h1 style={{ margin: '12px 0 0', fontSize: 30, lineHeight: 1.2 }}>
              화면을 복구하지 못했습니다
            </h1>
            <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.8, color: '#6f6257' }}>
              작업 중이던 파일은 브라우저 로컬 저장에 남아 있을 수 있습니다. 다시 시도해도 반복되면
              오류 코드와 사용 중이던 파일 형식을 피드백으로 보내 주세요.
            </p>
            {error.digest ? (
              <p style={{ marginTop: 12, fontSize: 12, color: '#8a7a6b' }}>오류 코드: {error.digest}</p>
            ) : null}
            <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button
                type="button"
                onClick={() => unstable_retry()}
                style={{
                  height: 40,
                  border: 0,
                  borderRadius: 8,
                  background: '#4f84be',
                  color: 'white',
                  padding: '0 16px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                다시 시도
              </button>
              <a
                href="/editor"
                style={{
                  height: 40,
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 8,
                  border: '1px solid #d8cdbf',
                  background: 'white',
                  color: '#54473d',
                  padding: '0 16px',
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                워크스페이스로 이동
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}

