'use client';

import type { ProjectVerificationReport } from '@/lib/project-verification-report';
import type { AppLanguage } from '@/types';

type ExportReportDocumentPdfInput = {
  report: ProjectVerificationReport;
  language: AppLanguage;
  title: string;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

async function readPdfError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    return typeof body.error === 'string' ? body.error : response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function exportReportDocumentAsPdf({
  report,
  language,
  title,
}: ExportReportDocumentPdfInput) {
  const response = await window.fetch('/api/report/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      errorCount: report.errorCount,
      filenameBase: report.filenameBase,
      infoCount: report.infoCount,
      language,
      markdown: report.markdown,
      reportId: report.reportId,
      status: report.status,
      title,
      warningCount: report.warningCount,
    }),
  });

  if (!response.ok) {
    throw new Error(await readPdfError(response));
  }

  const blob = await response.blob();
  downloadBlob(blob, `${report.filenameBase}.pdf`);
}
