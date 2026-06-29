import { importKiCadSchematic, type KiCadSchematicImportResult } from '@/lib/kicad-sch-parser';

type StartParseMessage = {
  type: 'START_PARSE';
  rawText: string;
  projectName?: string;
};

type ParseCompleteMessage = {
  type: 'PARSE_COMPLETE';
  payload: KiCadSchematicImportResult;
};

type ParseErrorMessage = {
  type: 'PARSE_ERROR';
  error: string;
};

type ParserWorkerMessage = StartParseMessage;

const workerScope = self as typeof globalThis & {
  postMessage: (message: ParseCompleteMessage | ParseErrorMessage) => void;
  onmessage: ((event: MessageEvent<ParserWorkerMessage>) => void) | null;
};

workerScope.onmessage = (event: MessageEvent<ParserWorkerMessage>) => {
  const message = event.data;
  if (!message || message.type !== 'START_PARSE') {
    return;
  }

  try {
    const payload = importKiCadSchematic(message.rawText, {
      projectName: message.projectName,
    });
    const response: ParseCompleteMessage = {
      type: 'PARSE_COMPLETE',
      payload,
    };
    workerScope.postMessage(response);
  } catch (error) {
    const response: ParseErrorMessage = {
      type: 'PARSE_ERROR',
      error: error instanceof Error ? error.message : 'Unknown KiCad parsing error',
    };
    workerScope.postMessage(response);
  }
};

export {};
