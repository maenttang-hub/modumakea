import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = process.cwd();
const srcRoot = path.join(projectRoot, 'src');
const nextRoot = path.join(projectRoot, 'node_modules', 'next');

function resolveAliasTarget(specifier) {
  const relativePath = specifier.slice(2);
  const candidates = [
    path.join(srcRoot, `${relativePath}.ts`),
    path.join(srcRoot, `${relativePath}.tsx`),
    path.join(srcRoot, `${relativePath}.json`),
    path.join(srcRoot, relativePath, 'index.ts'),
    path.join(srcRoot, relativePath, 'index.tsx'),
    path.join(srcRoot, relativePath, 'index.json'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function resolveRelativeTarget(specifier, parentURL) {
  if (!parentURL?.startsWith('file:')) {
    return null;
  }

  const parentPath = path.dirname(fileURLToPath(parentURL));
  const basePath = path.resolve(parentPath, specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.json`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.json'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate));
}

function resolveNextModuleTarget(specifier) {
  if (!specifier.startsWith('next/') || specifier.endsWith('.js')) {
    return null;
  }

  const candidate = path.join(nextRoot, `${specifier.slice('next/'.length)}.js`);
  return fs.existsSync(candidate) ? candidate : null;
}

export async function resolve(specifier, context, nextResolve) {
  const nextTarget = resolveNextModuleTarget(specifier);
  if (nextTarget) {
    return nextResolve(pathToFileURL(nextTarget).href, context);
  }

  if (specifier.startsWith('@/')) {
    const targetPath = resolveAliasTarget(specifier);
    if (targetPath) {
      return nextResolve(pathToFileURL(targetPath).href, context);
    }
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const targetPath = resolveRelativeTarget(specifier, context.parentURL);
    if (targetPath) {
      return nextResolve(pathToFileURL(targetPath).href, context);
    }
  }

  return nextResolve(specifier, context);
}
