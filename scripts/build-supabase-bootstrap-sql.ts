import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { STATIC_COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { STATIC_ARDUINO_LIBRARY_CATALOG } from '@/lib/arduino-library-registry';
import { PART_MASTER_RECORDS } from '@/lib/part-master-catalog';
import {
  buildArduinoLibrarySeedRow,
  buildComponentSeedRow,
  buildPartMasterSeedRow,
  buildSupabaseBootstrapSql,
} from '@/lib/supabase-seed';

async function writeOutput(path: string, contents: string) {
  const fullPath = resolve(process.cwd(), path);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contents, 'utf8');
  return fullPath;
}

async function main() {
  const schemaPath = resolve(process.cwd(), 'docs/supabase_schema.sql');
  const schemaSql = await readFile(schemaPath, 'utf8');

  const componentRows = STATIC_COMPONENT_TEMPLATES.map(buildComponentSeedRow);
  const libraryRows = STATIC_ARDUINO_LIBRARY_CATALOG.map(buildArduinoLibrarySeedRow);
  const partMasterRows = PART_MASTER_RECORDS.map(buildPartMasterSeedRow);

  const componentsBootstrapSql = buildSupabaseBootstrapSql({
    schemaSql,
    componentRows,
  });
  const fullBootstrapSql = buildSupabaseBootstrapSql({
    schemaSql,
    componentRows,
    arduinoLibraryRows: libraryRows,
    partMasterRows,
  });

  const componentsOutput = await writeOutput(
    'scripts/component-catalog/generated/components.bootstrap.sql',
    componentsBootstrapSql
  );
  const fullOutput = await writeOutput(
    'scripts/component-catalog/generated/full.bootstrap.sql',
    fullBootstrapSql
  );

  console.log(`Prepared components bootstrap SQL -> ${componentsOutput}`);
  console.log(`Prepared full bootstrap SQL -> ${fullOutput}`);
  console.log(`Bundled components: ${componentRows.length}`);
  console.log(`Bundled libraries: ${libraryRows.length}`);
  console.log(`Bundled part master records: ${partMasterRows.length}`);
}

await main();
