import test from 'node:test';
import assert from 'node:assert/strict';

import { getDevScenarioDocument } from '@/lib/dev-scenarios';
import { normalizeProjectDocument } from '@/store/project-document';
import {
  DEFAULT_BOARD_ID,
  DEFAULT_PROJECT_NAME,
  POWER_INPUT_MODES,
  PROJECT_FILE_VERSION,
  WORKSPACE_MODES,
} from '@/store/store-config';

test('monaco review focus scenario normalizes into a reproducible UNO project', () => {
  const scenario = getDevScenarioDocument('monaco-review-focus');
  assert.ok(scenario, 'expected scenario document');

  const normalized = normalizeProjectDocument(scenario, {
    defaultBoardId: DEFAULT_BOARD_ID,
    defaultProjectName: DEFAULT_PROJECT_NAME,
    projectFileVersion: PROJECT_FILE_VERSION,
    workspaceModes: WORKSPACE_MODES,
    powerInputModes: POWER_INPUT_MODES,
  });

  assert.ok(normalized, 'expected normalized scenario');
  assert.equal(normalized?.activeBoardId, 'uno');
  assert.equal(normalized?.components.length, 1);
  assert.equal(normalized?.components[0]?.assignedPins.Signal, 'D2');
  assert.ok(normalized?.generatedCode.includes('digitalWrite(D2, HIGH);'));
});
