import { importKiCadSchematic, type KiCadSchematicImportResult } from '@/lib/kicad-sch-parser';

type ParseCompleteMessage = {
  type: 'PARSE_COMPLETE';
  payload: KiCadSchematicImportResult;
};

type ParseErrorMessage = {
  type: 'PARSE_ERROR';
  error: string;
};

type ParserWorkerResponse = ParseCompleteMessage | ParseErrorMessage;

export async function importKiCadSchematicAsync(
  source: string,
  options?: { projectName?: string }
): Promise<KiCadSchematicImportResult> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return importKiCadSchematic(source, options);
  }

  return await new Promise<KiCadSchematicImportResult>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/kicad-parser.worker.ts', import.meta.url),
      { type: 'module' }
    );

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
      const message = event.data;
      cleanup();
      if (message?.type === 'PARSE_COMPLETE') {
        resolve(message.payload);
        return;
      }
      reject(new Error(message?.type === 'PARSE_ERROR' ? message.error : 'KiCad parse failed'));
    };

    worker.onerror = event => {
      cleanup();
      reject(new Error(event.message || 'KiCad parser worker crashed'));
    };

    worker.postMessage({
      type: 'START_PARSE',
      rawText: source,
      projectName: options?.projectName,
    });
  });
}
