import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProjectCommentThreads,
  getCommentDraftPresentationMode,
  getCodeCommentThreadLineNumber,
  getCommentThreadId,
  getCommentTargetLabel,
  resolveCommentAnchor,
  resolveCommentTargetAnchor,
  shouldUseInlineCommentComposer,
  sortCommentThreadsByStatus,
} from '@/lib/project-comments';
import type { ProjectCommentRecord } from '@/types';

const baseComment = {
  projectId: 'project-1',
  authorId: null,
  createdAt: '2026-06-18T00:00:00.000Z',
} as const;

test('buildProjectCommentThreads groups replies under their root comment', () => {
  const comments: ProjectCommentRecord[] = [
    {
      ...baseComment,
      id: 'root-1',
      content: '센서 위치를 조금 더 왼쪽으로',
      targetType: 'node',
      targetMeta: { nodeId: 'sensor-1' },
      status: 'open',
      parentId: null,
    },
    {
      ...baseComment,
      id: 'reply-1',
      content: '수정했습니다.',
      targetType: 'node',
      targetMeta: { nodeId: 'sensor-1' },
      status: 'open',
      parentId: 'root-1',
      createdAt: '2026-06-18T00:01:00.000Z',
    },
  ];

  const threads = buildProjectCommentThreads(comments);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].root.id, 'root-1');
  assert.equal(threads[0].replies.length, 1);
  assert.equal(threads[0].replies[0].id, 'reply-1');
});

test('getCommentThreadId resolves replies back to their root thread id', () => {
  assert.equal(
    getCommentThreadId({ id: 'reply-1', parentId: 'root-1' }),
    'root-1'
  );
  assert.equal(
    getCommentThreadId({ id: 'root-1', parentId: null }),
    'root-1'
  );
});

test('getCodeCommentThreadLineNumber resolves only code-line threads', () => {
  const threads = buildProjectCommentThreads([
    {
      ...baseComment,
      id: 'code-root',
      content: '이 줄에서 저장 후 강조되어야 합니다.',
      targetType: 'code_line',
      targetMeta: { lineNumber: 33 },
      status: 'open',
      parentId: null,
    },
    {
      ...baseComment,
      id: 'node-root',
      content: '이건 캔버스 쪽입니다.',
      targetType: 'node',
      targetMeta: { nodeId: 'sensor-1' },
      status: 'open',
      parentId: null,
      createdAt: '2026-06-18T00:01:00.000Z',
    },
  ]);

  assert.equal(getCodeCommentThreadLineNumber(threads, 'code-root'), 33);
  assert.equal(getCodeCommentThreadLineNumber(threads, 'node-root'), null);
  assert.equal(getCodeCommentThreadLineNumber(threads, 'missing'), null);
});

test('resolveCommentAnchor returns component-relative anchor for node comments', () => {
  const anchor = resolveCommentAnchor({
    ...baseComment,
    id: 'comment-1',
    content: '이 저항은 너무 가까워요.',
    targetType: 'node',
    targetMeta: { nodeId: 'res-1' },
    status: 'open',
    parentId: null,
  }, [
    {
      instanceId: 'res-1',
      templateId: 'tpl_resistor',
      name: '저항 1',
      value: '220 Ohm',
      position: { x: 400, y: 220 },
      rotation: 0,
      assignedPins: {},
      isFullyRouted: false,
    },
  ]);

  assert.deepEqual(anchor, { x: 508, y: 202 });
});

test('resolveCommentTargetAnchor falls back to stored coordinates for deleted node comments', () => {
  const anchor = resolveCommentTargetAnchor('node', {
    nodeId: 'missing-node',
    x: 260,
    y: 180,
  }, []);

  assert.deepEqual(anchor, { x: 260, y: 180 });
});

test('sortCommentThreadsByStatus keeps open threads ahead of resolved ones', () => {
  const openThread = {
    root: {
      ...baseComment,
      id: 'open-1',
      content: '열린 피드백',
      targetType: 'canvas_coord' as const,
      targetMeta: { x: 10, y: 20 },
      status: 'open' as const,
      parentId: null,
    },
    replies: [],
  };
  const resolvedThread = {
    root: {
      ...baseComment,
      id: 'resolved-1',
      content: '닫힌 피드백',
      targetType: 'code_line' as const,
      targetMeta: { lineNumber: 14 },
      status: 'resolved' as const,
      parentId: null,
      createdAt: '2026-06-18T02:00:00.000Z',
    },
    replies: [],
  };

  const sorted = sortCommentThreadsByStatus([resolvedThread, openThread]);
  assert.equal(sorted[0].root.id, 'open-1');
  assert.equal(sorted[1].root.id, 'resolved-1');
});

test('getCommentTargetLabel renders code line labels for editor comments', () => {
  assert.equal(
    getCommentTargetLabel('code_line', { lineNumber: 27 }, []),
    '코드 27줄'
  );
  assert.equal(
    getCommentTargetLabel('code_line', { lineNumber: 27 }, [], 'en'),
    'Code line 27'
  );
});

test('shouldUseInlineCommentComposer only enables inline drafting for new canvas-side comments', () => {
  assert.equal(
    shouldUseInlineCommentComposer({
      mode: 'new',
      targetType: 'node',
    }),
    true
  );

  assert.equal(
    shouldUseInlineCommentComposer({
      mode: 'new',
      targetType: 'code_line',
    }),
    false
  );

  assert.equal(
    shouldUseInlineCommentComposer({
      mode: 'reply',
      targetType: 'wire',
    }),
    false
  );
});

test('getCommentDraftPresentationMode separates canvas, code, and panel drafts', () => {
  assert.equal(
    getCommentDraftPresentationMode(null),
    'none'
  );
  assert.equal(
    getCommentDraftPresentationMode({
      mode: 'new',
      targetType: 'node',
    }),
    'canvas-inline'
  );
  assert.equal(
    getCommentDraftPresentationMode({
      mode: 'new',
      targetType: 'code_line',
    }),
    'code-inline'
  );
  assert.equal(
    getCommentDraftPresentationMode({
      mode: 'reply',
      targetType: 'code_line',
    }),
    'panel'
  );
});
