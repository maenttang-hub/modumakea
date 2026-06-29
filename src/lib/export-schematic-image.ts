'use client';

function copyComputedStyles(source: Element, target: Element) {
  const sourceElement = source as HTMLElement;
  const targetElement = target as HTMLElement;
  const computed = window.getComputedStyle(sourceElement);

  for (const property of Array.from(computed)) {
    targetElement.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property)
    );
  }

  Array.from(source.children).forEach((child, index) => {
    const clonedChild = target.children[index];
    if (clonedChild) {
      copyComputedStyles(child, clonedChild);
    }
  });
}

function buildSvgMarkup(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));

  const clone = element.cloneNode(true) as HTMLElement;
  copyComputedStyles(element, clone);

  clone.style.margin = '0';
  clone.style.transform = 'none';
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';

  const wrapper = window.document.createElement('div');
  wrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  wrapper.style.width = `${width}px`;
  wrapper.style.height = `${height}px`;
  wrapper.style.background = '#0d1117';
  wrapper.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(wrapper);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        ${serialized}
      </foreignObject>
    </svg>
  `;

  return { svg, width, height };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportElementAsImage(element: HTMLElement, filenameBase: string) {
  const { svg, width, height } = buildSvgMarkup(element);

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('이미지 렌더링에 실패했습니다.'));
      nextImage.src = url;
    });

    const pixelRatio = window.devicePixelRatio || 1;
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('캔버스를 초기화할 수 없습니다.');
    }

    context.scale(pixelRatio, pixelRatio);
    context.fillStyle = '#0d1117';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(output => {
        if (output) {
          resolve(output);
          return;
        }
        reject(new Error('PNG 파일 생성에 실패했습니다.'));
      }, 'image/png');
    });

    downloadBlob(pngBlob, `${filenameBase}.png`);
    return 'png' as const;
  } catch {
    downloadBlob(blob, `${filenameBase}.svg`);
    return 'svg' as const;
  } finally {
    URL.revokeObjectURL(url);
  }
}
