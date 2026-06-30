import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCompileBackendSharedToken,
  isPlaceholderSecretValue,
} from '@/lib/compile-policy';
import { issueCompileArtifactDownloadPath } from '@/lib/server/compile-artifact-blob-store';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function setEnv(name: string, value: string) {
  process.env[name] = value;
}

test('compile policy recognizes placeholder secret values', () => {
  assert.equal(isPlaceholderSecretValue('change_me_for_internal_compile'), true);
  assert.equal(isPlaceholderSecretValue('your_openai_api_key_here'), true);
  assert.equal(isPlaceholderSecretValue('placeholder-token'), true);
  assert.equal(isPlaceholderSecretValue('prod-token-7b8f01d4'), false);
});

test('compile backend shared token rejects placeholder values in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  setEnv('NODE_ENV', 'production');
  setEnv('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', 'change_me_for_internal_compile');

  try {
    assert.throws(
      () => getCompileBackendSharedToken(),
      /MODUMAKE_COMPILE_SERVER_SHARED_TOKEN must be changed/
    );
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', previousToken);
  }
});

test('compile backend shared token accepts real-looking values in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  setEnv('NODE_ENV', 'production');
  setEnv('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', 'prod-token-7b8f01d4');

  try {
    assert.equal(getCompileBackendSharedToken(), 'prod-token-7b8f01d4');
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', previousToken);
  }
});

test('artifact download secret rejects placeholder values in production', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecret = process.env.MODUMAKE_ARTIFACT_DOWNLOAD_SECRET;
  const previousToken = process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;
  setEnv('NODE_ENV', 'production');
  setEnv('MODUMAKE_ARTIFACT_DOWNLOAD_SECRET', 'change_me_for_artifact_downloads');
  delete process.env.MODUMAKE_COMPILE_SERVER_SHARED_TOKEN;

  try {
    assert.throws(
      () => issueCompileArtifactDownloadPath('artifact-1'),
      /MODUMAKE_ARTIFACT_DOWNLOAD_SECRET must be changed/
    );
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('MODUMAKE_ARTIFACT_DOWNLOAD_SECRET', previousSecret);
    restoreEnv('MODUMAKE_COMPILE_SERVER_SHARED_TOKEN', previousToken);
  }
});
