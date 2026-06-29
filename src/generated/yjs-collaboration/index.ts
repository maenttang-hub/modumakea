import type { ModuMakeCollaborationDocument } from '@/lib/collaboration-doc';
import { loadVendoredYjsCollaborationDocumentFactory } from './vendor/index';

export type ModuMakeYjsCollaborationDocumentFactory = (
  projectId: string
) => ModuMakeCollaborationDocument | null;

export function loadGeneratedYjsCollaborationDocumentFactory(): ModuMakeYjsCollaborationDocumentFactory | null {
  return loadVendoredYjsCollaborationDocumentFactory();
}
