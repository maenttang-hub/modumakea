import { collectNestedForms, childForms, type SExprNode } from '@/lib/s-expr-parser';
import { sanitizePlainText } from '@/lib/security-input';

export interface V3LabelAnchor {
  name: string;
  point: { x: number; y: number };
}

function toNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseAtNode(node: SExprNode[] | undefined) {
  return {
    x: toNumber(typeof node?.[1] === 'string' ? node[1] : '0'),
    y: toNumber(typeof node?.[2] === 'string' ? node[2] : '0'),
  };
}

export function extractJunctionPoints(root: SExprNode[]) {
  return childForms(root, 'junction').map(node => parseAtNode(childForms(node, 'at')[0]));
}

export function extractLabels(root: SExprNode[]) {
  const labelNodes = [
    ...collectNestedForms(root, 'label'),
    ...collectNestedForms(root, 'global_label'),
    ...collectNestedForms(root, 'hierarchical_label'),
  ];

  return labelNodes.flatMap(node => {
    const name = sanitizePlainText(typeof node[1] === 'string' ? node[1] : '', {
      maxLength: 120,
      fallback: '',
    });
    if (!name) {
      return [];
    }

    return [{
      name,
      point: parseAtNode(childForms(node, 'at')[0]),
    }] satisfies V3LabelAnchor[];
  });
}
