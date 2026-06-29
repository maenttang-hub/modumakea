import { childForms, type SExprNode } from '@/lib/s-expr-parser';

export interface V3WireSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function extractWireSegments(root: SExprNode[]) {
  const segments: V3WireSegment[] = [];

  for (const wireNode of childForms(root, 'wire')) {
    const pts = childForms(wireNode, 'pts')[0];
    if (!pts) {
      continue;
    }

    const xyNodes = childForms(pts, 'xy');
    for (let index = 0; index < xyNodes.length - 1; index += 1) {
      const startNode = xyNodes[index];
      const endNode = xyNodes[index + 1];
      segments.push({
        start: {
          x: toNumber(typeof startNode?.[1] === 'string' ? startNode[1] : '0'),
          y: toNumber(typeof startNode?.[2] === 'string' ? startNode[2] : '0'),
        },
        end: {
          x: toNumber(typeof endNode?.[1] === 'string' ? endNode[1] : '0'),
          y: toNumber(typeof endNode?.[2] === 'string' ? endNode[2] : '0'),
        },
      });
    }
  }

  return segments;
}

