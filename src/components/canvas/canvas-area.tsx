'use client';

import type { ReactNode } from 'react';

export function CanvasArea({
  toolbar,
  canvas,
  overlay,
}: {
  toolbar: ReactNode;
  canvas: ReactNode;
  overlay?: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f6f0e7_0%,#f2eadf_100%)]">
      {toolbar}
      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{
          backgroundColor: '#fbf7f0',
          backgroundImage: [
            'radial-gradient(circle at top, rgba(255,255,255,0.68), transparent 42%)',
            'radial-gradient(circle at 1px 1px, rgba(188,172,151,0.18) 1px, transparent 0)',
          ].join(','),
          backgroundSize: '100% 100%, 24px 24px',
        }}
      >
        {canvas}
        {overlay}
      </div>
    </section>
  );
}
