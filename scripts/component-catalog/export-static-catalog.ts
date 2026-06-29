import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { STATIC_COMPONENT_TEMPLATES } from '@/constants/component-templates';

const DEFAULT_OUTPUT = resolve(process.cwd(), 'scripts/component-catalog/generated/static-component-catalog.json');

async function main() {
  const outputPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_OUTPUT;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(STATIC_COMPONENT_TEMPLATES, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${STATIC_COMPONENT_TEMPLATES.length} static templates to ${outputPath}`);
}

await main();
