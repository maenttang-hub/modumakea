'use client';

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportReportElementAsPdf(element: HTMLElement, filenameBase: string) {
  const canvas = await html2canvas(element, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    useCORS: true,
    backgroundColor: '#f3ede3',
  });

  const imageData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;
  const imageHeight = (canvas.height * usableWidth) / canvas.width;

  let remainingHeight = imageHeight;
  let offsetY = margin;

  pdf.addImage(imageData, 'PNG', margin, offsetY, usableWidth, imageHeight, undefined, 'FAST');
  remainingHeight -= usableHeight;

  while (remainingHeight > 0) {
    offsetY = remainingHeight - imageHeight + margin;
    pdf.addPage();
    pdf.addImage(imageData, 'PNG', margin, offsetY, usableWidth, imageHeight, undefined, 'FAST');
    remainingHeight -= usableHeight;
  }

  pdf.save(`${filenameBase}.pdf`);
}
