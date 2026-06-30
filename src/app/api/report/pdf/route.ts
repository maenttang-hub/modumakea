export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ReportPdfRequest = {
  errorCount: number;
  filenameBase: string;
  infoCount: number;
  language: 'ko' | 'en';
  markdown: string;
  reportId: string;
  status: 'passed' | 'warning' | 'critical';
  title: string;
  warningCount: number;
};

const MAX_MARKDOWN_LENGTH = 220_000;

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeFilename(value: string) {
  const filename = value
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return filename || 'modumake-verification-report';
}

function readStringField(payload: Record<string, unknown>, field: keyof ReportPdfRequest) {
  const value = payload[field];
  return typeof value === 'string' ? value : '';
}

function readNumberField(payload: Record<string, unknown>, field: keyof ReportPdfRequest) {
  const value = payload[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parsePayload(payload: unknown): ReportPdfRequest | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const markdown = readStringField(record, 'markdown');
  const filenameBase = normalizeFilename(readStringField(record, 'filenameBase'));
  const reportId = readStringField(record, 'reportId').trim() || 'MM-REPORT';
  const title = readStringField(record, 'title').trim() || 'ModuMake Verification Report';
  const language = record.language === 'en' ? 'en' : 'ko';
  const status = record.status === 'critical' || record.status === 'warning' || record.status === 'passed'
    ? record.status
    : 'warning';

  if (!markdown.trim() || markdown.length > MAX_MARKDOWN_LENGTH) {
    return null;
  }

  return {
    errorCount: readNumberField(record, 'errorCount'),
    filenameBase,
    infoCount: readNumberField(record, 'infoCount'),
    language,
    markdown,
    reportId,
    status,
    title,
    warningCount: readNumberField(record, 'warningCount'),
  };
}

function closeList(currentList: 'ol' | 'ul' | null) {
  return currentList ? `</${currentList}>` : '';
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  let html = '';
  let currentList: 'ol' | 'ul' | null = null;
  let sectionOpen = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      html += closeList(currentList);
      currentList = null;
      html += '<div class="spacer"></div>';
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      html += closeList(currentList);
      currentList = null;
      const level = heading[1].length;
      if (level === 2) {
        if (sectionOpen) {
          html += '</section>';
        }
        sectionOpen = true;
        html += `<section class="report-section"><h2>${escapeHtml(heading[2])}</h2>`;
      } else {
        html += `<h${level}>${escapeHtml(heading[2])}</h${level}>`;
      }
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (currentList !== 'ol') {
        html += closeList(currentList);
        currentList = 'ol';
        html += '<ol>';
      }
      html += `<li>${escapeHtml(ordered[1])}</li>`;
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      if (currentList !== 'ul') {
        html += closeList(currentList);
        currentList = 'ul';
        html += '<ul>';
      }
      html += `<li>${escapeHtml(bullet[1])}</li>`;
      continue;
    }

    html += closeList(currentList);
    currentList = null;
    const keyValue = trimmed.match(/^([^:]{2,42}):\s+(.+)$/);
    if (keyValue) {
      html += `<p class="kv-line"><strong>${escapeHtml(keyValue[1])}</strong><span>${escapeHtml(keyValue[2])}</span></p>`;
    } else {
      html += `<p>${escapeHtml(trimmed)}</p>`;
    }
  }

  html += closeList(currentList);
  if (sectionOpen) {
    html += '</section>';
  }
  return html;
}

function buildReportHtml(payload: ReportPdfRequest) {
  const lang = payload.language === 'ko' ? 'ko' : 'en';
  const generatedLabel = lang === 'ko' ? '검토 보고서' : 'Review Report';
  const statusLabel = payload.status === 'critical'
    ? (lang === 'ko' ? '수정 필요' : 'Fix required')
    : payload.status === 'warning'
      ? (lang === 'ko' ? '검토 필요' : 'Review required')
      : (lang === 'ko' ? '주문 가능' : 'Ready for fabrication');

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      @page {
        size: A4;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: #f4f1ea;
        color: #201a15;
        font-family: "Apple SD Gothic Neo", AppleGothic, "Noto Sans KR", "Malgun Gothic", "Segoe UI", Arial, sans-serif;
        font-size: 10.2pt;
        line-height: 1.56;
      }

      .report-paper {
        background: #fffdf9;
        border: 1px solid #d6c8b7;
        padding: 28px 32px 34px;
      }

      .document-topline {
        align-items: flex-start;
        border-bottom: 2px solid #4f3b2a;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding-bottom: 14px;
      }

      .brand {
        color: #2f271f;
        font-size: 9pt;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .doc-meta {
        color: #74675b;
        font-size: 8.5pt;
        line-height: 1.6;
        text-align: right;
      }

      .cover {
        padding: 28px 0 20px;
      }

      .status-pill {
        background: ${payload.status === 'critical' ? '#fff1f0' : payload.status === 'warning' ? '#fff6e4' : '#eef8ef'};
        border: 1px solid ${payload.status === 'critical' ? '#e5b4b1' : payload.status === 'warning' ? '#e3c783' : '#aed1b4'};
        color: ${payload.status === 'critical' ? '#9d3e39' : payload.status === 'warning' ? '#8a5a12' : '#2d6b3b'};
        display: inline-block;
        font-size: 9pt;
        font-weight: 700;
        margin-bottom: 12px;
        padding: 4px 10px;
      }

      h1,
      h2,
      h3,
      p,
      ol,
      ul {
        margin-left: 0;
        margin-right: 0;
      }

      h1 {
        color: #201a15;
        font-size: 25pt;
        line-height: 1.16;
        margin: 0 0 9px;
      }

      h2 {
        color: #2f271f;
        font-size: 14pt;
        line-height: 1.28;
        margin: 0 0 10px;
      }

      h3 {
        color: #4d4034;
        font-size: 12pt;
        margin: 16px 0 7px;
      }

      p {
        margin-bottom: 6px;
        margin-top: 0;
      }

      .metric-row {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(3, 1fr);
        margin-top: 16px;
      }

      .metric {
        border: 1px solid #e0d4c4;
        padding: 10px 12px;
      }

      .metric span {
        color: #77685a;
        display: block;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .metric strong {
        color: #2f271f;
        display: block;
        font-size: 16pt;
        margin-top: 3px;
      }

      .report-section {
        border-top: 1px solid #d8cbb9;
        break-inside: avoid;
        margin-top: 18px;
        padding-top: 14px;
      }

      .kv-line {
        border-bottom: 1px solid #eee4d8;
        display: grid;
        gap: 12px;
        grid-template-columns: 145px 1fr;
        margin-bottom: 0;
        padding: 5px 0;
      }

      .kv-line strong {
        color: #6f5f51;
        font-weight: 700;
      }

      ol,
      ul {
        margin-bottom: 10px;
        margin-top: 0;
        padding-left: 19px;
      }

      li {
        margin-bottom: 5px;
      }

      .spacer {
        height: 5px;
      }
    </style>
  </head>
  <body>
    <main class="report-paper">
      <header class="document-topline">
        <div class="brand">ModuMake · ${generatedLabel}</div>
        <div class="doc-meta">
          <div>Document ID: ${escapeHtml(payload.reportId)}</div>
          <div>Export: PDF/A4</div>
        </div>
      </header>
      <section class="cover">
        <div class="status-pill">${escapeHtml(statusLabel)}</div>
        <h1>${escapeHtml(payload.title)}</h1>
        <p>${lang === 'ko' ? 'PCB 제작 전 자동 검증 결과와 제작 리스크를 정리한 문서형 보고서입니다.' : 'A document-style report summarizing automated pre-fabrication checks and fabrication risk.'}</p>
        <div class="metric-row">
          <div class="metric"><span>${lang === 'ko' ? '오류' : 'Errors'}</span><strong>${payload.errorCount}</strong></div>
          <div class="metric"><span>${lang === 'ko' ? '경고' : 'Warnings'}</span><strong>${payload.warningCount}</strong></div>
          <div class="metric"><span>${lang === 'ko' ? '정보' : 'Info'}</span><strong>${payload.infoCount}</strong></div>
        </div>
      </section>
      ${markdownToHtml(payload.markdown)}
    </main>
  </body>
</html>`;
}

export async function POST(request: Request) {
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: 'Invalid PDF request body.' }, { status: 400 });
  }

  const payload = parsePayload(parsedBody);
  if (!payload) {
    return Response.json({ error: 'Invalid or too large report payload.' }, { status: 400 });
  }

  let browser: Awaited<ReturnType<typeof import('playwright').chromium.launch>> | null = null;

  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(buildReportHtml(payload), { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      displayHeaderFooter: true,
      footerTemplate: `
        <div style="width:100%;padding:0 16mm;color:#8c7966;font-family:Arial,sans-serif;font-size:8px;text-align:right;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
      format: 'A4',
      headerTemplate: '<div></div>',
      margin: {
        bottom: '16mm',
        left: '14mm',
        right: '14mm',
        top: '14mm',
      },
      printBackground: true,
      preferCSSPageSize: true,
    });

    const filename = `${payload.filenameBase}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Type': 'application/pdf',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF generation failed.';
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
