import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCollaborationDisplayName,
  isCollaborationParticipantStale,
  pickCollaboratorColor,
  sanitizeCollaborationParticipant,
  summarizeCollaborationParticipant,
} from '@/lib/collaboration';

test('sanitizeCollaborationParticipant normalizes incoming realtime payloads', () => {
  const participant = sanitizeCollaborationParticipant({
    sessionId: 'session-1',
    userName: '편집자 1',
    color: '#38bdf8',
    isOwner: true,
    scope: 'code',
    updatedAt: 42,
    selection: {
      lineNumber: 12,
      label: '코드 12줄',
    },
  });

  assert.ok(participant);
  assert.equal(participant.sessionId, 'session-1');
  assert.equal(participant.scope, 'code');
  assert.equal(participant.selection?.lineNumber, 12);
  assert.equal(participant.selection?.label, '코드 12줄');
});

test('sanitizeCollaborationParticipant rejects invalid payloads', () => {
  assert.equal(sanitizeCollaborationParticipant(null), null);
  assert.equal(sanitizeCollaborationParticipant({}), null);
  assert.equal(sanitizeCollaborationParticipant({ sessionId: '' }), null);
});

test('pickCollaboratorColor is deterministic per session id', () => {
  assert.equal(pickCollaboratorColor('session-a'), pickCollaboratorColor('session-a'));
  assert.notEqual(buildCollaborationDisplayName('session-a', true), buildCollaborationDisplayName('session-a', false));
});

test('collaboration stale detection and summaries favor explicit labels', () => {
  const participant = sanitizeCollaborationParticipant({
    sessionId: 'session-2',
    scope: 'canvas',
    updatedAt: 100,
    selection: {
      componentId: 'sensor-1',
      label: '온습도 센서 1',
    },
  });

  assert.ok(participant);
  assert.equal(summarizeCollaborationParticipant(participant), '온습도 센서 1');
  assert.equal(isCollaborationParticipantStale(participant, 200, 150), false);
  assert.equal(isCollaborationParticipantStale(participant, 400, 150), true);
});
