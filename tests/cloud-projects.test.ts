import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCloudProjectShareSummary,
  buildCloudProjectPath,
  getCloudProjectVisibilityDescription,
  getCloudProjectVisibilityLabel,
} from '@/lib/cloud-projects';

test('cloud project helpers expose stable share labels and paths', () => {
  assert.equal(buildCloudProjectPath('project-123'), '/p/project-123');
  assert.equal(getCloudProjectVisibilityLabel('private'), '비공개');
  assert.equal(getCloudProjectVisibilityLabel('unlisted'), '링크 공유');
  assert.equal(getCloudProjectVisibilityLabel('public'), '공개');
  assert.match(
    getCloudProjectVisibilityDescription('unlisted'),
    /링크를 아는 사람만/
  );
});

test('cloud project helpers build a copy-toast summary with title and visibility', () => {
  assert.equal(
    buildCloudProjectShareSummary({
      title: '신호등 프로젝트',
      visibility: 'unlisted',
      language: 'ko',
    }),
    '프로젝트: 신호등 프로젝트 · 공개 범위: 링크 공유'
  );

  assert.equal(
    buildCloudProjectShareSummary({
      title: '  ',
      visibility: 'public',
      language: 'en',
    }),
    'Project: Untitled project · Visibility: Public'
  );
});
