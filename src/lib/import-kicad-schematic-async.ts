import { importKiCadSchematic, type KiCadSchematicImportResult } from '@/lib/kicad-sch-parser';

type ParseCompleteMessage = {
  type: 'PARSE_COMPLETE';
  payload: KiCadSchematicImportResult;
};

type ParseErrorMessage = {
  type: 'PARSE_ERROR';
  error: string;
};

type ParseStartedMessage = {
  type: 'PARSE_STARTED';
};

type ParserWorkerResponse = ParseCompleteMessage | ParseErrorMessage | ParseStartedMessage;

const DEFAULT_WORKER_TIMEOUT_MS = 12000;

function parseInWorker(
  source: string,
  options: { projectName?: string; workerTimeoutMs?: number } = {}
): Promise<KiCadSchematicImportResult> {
  return new Promise<KiCadSchematicImportResult>((resolve, reject) => {
    let worker: Worker | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (!worker) {
        return;
      }
      worker.onmessage = null;
      worker.onmessageerror = null;
      worker.onerror = null;
      worker.terminate();
    };

    try {
      worker = new Worker(
        new URL('../workers/kicad-parser.worker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch (error) {
      reject(error);
      return;
    }

    const parserWorker = worker;
    if (!parserWorker) {
      reject(new Error('KiCad parser worker could not be created'));
      return;
    }

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('KiCad parser worker did not respond in time'));
    }, options.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS);

    parserWorker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
      const message = event.data;

      if (message?.type === 'PARSE_STARTED') {
        return;
      }

      cleanup();
      if (message?.type === 'PARSE_COMPLETE') {
        resolve(message.payload);
        return;
      }
      reject(new Error(message?.type === 'PARSE_ERROR' ? message.error : 'KiCad parse failed'));
    };

    parserWorker.onmessageerror = () => {
      cleanup();
      reject(new Error('KiCad parser worker response could not be decoded'));
    };

    parserWorker.onerror = event => {
      cleanup();
      reject(new Error(event.message || 'KiCad parser worker crashed'));
    };

    parserWorker.postMessage({
      type: 'START_PARSE',
      rawText: source,
      projectName: options.projectName,
    });
  });
}

export async function importKiCadSchematicAsync(
  source: string,
  options?: { projectName?: string; workerTimeoutMs?: number }
): Promise<KiCadSchematicImportResult> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return importKiCadSchematic(source, options);
  }

  try {
    return await parseInWorker(source, options);
  } catch (workerError) {
    try {
      return importKiCadSchematic(source, options);
    } catch (fallbackError) {
      throw fallbackError instanceof Error ? fallbackError : workerError;
    }
  }
}
