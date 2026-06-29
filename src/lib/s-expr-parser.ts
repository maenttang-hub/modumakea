export type SExprNode = string | SExprNode[];

export function tokenizeSExpression(source: string) {
  const tokens: string[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push(char);
      index += 1;
      continue;
    }

    if (char === '"') {
      let value = '';
      index += 1;

      while (index < source.length) {
        const next = source[index];
        if (next === '\\') {
          const escaped = source[index + 1] ?? '';
          if (escaped === 'n') {
            value += '\n';
          } else if (escaped === 'r') {
            value += '\r';
          } else if (escaped === 't') {
            value += '\t';
          } else {
            value += escaped;
          }
          index += 2;
          continue;
        }
        if (next === '"') {
          index += 1;
          break;
        }
        value += next;
        index += 1;
      }

      tokens.push(value);
      continue;
    }

    let atom = '';
    while (
      index < source.length &&
      !/\s/.test(source[index] ?? '') &&
      source[index] !== '(' &&
      source[index] !== ')'
    ) {
      atom += source[index];
      index += 1;
    }
    tokens.push(atom);
  }

  return tokens;
}

export function parseSExpressionNode(tokens: string[], cursor: { index: number }): SExprNode {
  const token = tokens[cursor.index];
  if (token !== '(') {
    cursor.index += 1;
    return token;
  }

  cursor.index += 1;
  const list: SExprNode[] = [];
  while (cursor.index < tokens.length && tokens[cursor.index] !== ')') {
    list.push(parseSExpressionNode(tokens, cursor));
  }

  cursor.index += 1;
  return list;
}

export function parseKiCadSExpression(source: string) {
  const tokens = tokenizeSExpression(source);
  const cursor = { index: 0 };
  const nodes: SExprNode[] = [];

  while (cursor.index < tokens.length) {
    nodes.push(parseSExpressionNode(tokens, cursor));
  }

  return nodes;
}

export function isSExprList(value: SExprNode): value is SExprNode[] {
  return Array.isArray(value);
}

export function childForms(node: SExprNode[], name: string) {
  return node.filter(
    child => Array.isArray(child) && child.length > 0 && child[0] === name
  ) as SExprNode[][];
}

export function stringAt(node: SExprNode[] | undefined, index: number, fallback = '') {
  if (!node) {
    return fallback;
  }
  return typeof node[index] === 'string' ? node[index] as string : fallback;
}

export function collectNestedForms(node: SExprNode, name: string, bucket: SExprNode[][] = []) {
  if (!Array.isArray(node)) {
    return bucket;
  }

  if (node[0] === name) {
    bucket.push(node);
  }

  for (const child of node) {
    if (Array.isArray(child)) {
      collectNestedForms(child, name, bucket);
    }
  }

  return bucket;
}
