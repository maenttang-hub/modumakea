import { PROJECT_FILE_VERSION } from '@/store/store-config';
import type { ModuMakeProjectData } from '@/types';

export type DevScenarioId = 'monaco-review-focus';

function buildMonacoReviewFocusScenario(): ModuMakeProjectData {
  return {
    version: PROJECT_FILE_VERSION,
    savedAt: '2026-06-18T00:00:00.000Z',
    projectName: 'monaco_review_focus_demo',
    appLanguage: 'ko',
    activeBoardId: 'uno',
    pins: {},
    components: [
      {
        instanceId: 'button-review-demo',
        templateId: 'tpl_button',
        name: '버튼 1',
        position: { x: 320, y: 220 },
        rotation: 0,
        assignedPins: {
          Signal: 'D2',
          GND: 'GND',
        },
        isFullyRouted: true,
      },
    ],
    manualConnections: [],
    templateCache: {},
    installedLibraries: [],
      generatedCode: [
        'void setup() {',
        '  pinMode(D2, INPUT); digitalWrite(D2, HIGH);',
        '}',
      ].join('\n'),
    codeError: null,
    lastCodeGenerationMeta: null,
    customComponentPackages: [],
    isGuestStudentMode: false,
    powerInputMode: 'usb-5v',
    workspaceMode: 'simulation',
    wiringMode: 'auto',
    showGrid: true,
    showMinimap: true,
  };
}

export function getDevScenarioDocument(id: string | null | undefined): ModuMakeProjectData | null {
  switch (id) {
    case 'monaco-review-focus':
      return buildMonacoReviewFocusScenario();
    default:
      return null;
  }
}
