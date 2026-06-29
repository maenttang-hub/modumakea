declare module 'web-tree-sitter' {
  export type QueryCapture = unknown;

  export class Language {
    static load(path: string): Promise<Language>;
  }

  export class Query {
    constructor(language: Language, source: string);
    matches(node: Node): Array<{ captures: QueryCapture[] }>;
  }

  export class Node {}

  export class Tree {
    getLanguage(): Language;
    rootNode: Node;
  }

  export class Parser {
    setLanguage(language: Language): void;
    parse(source: string): Tree;
  }

  export function init(): Promise<void>;
}
