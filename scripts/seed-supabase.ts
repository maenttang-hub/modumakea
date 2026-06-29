import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { STATIC_COMPONENT_TEMPLATES } from '@/constants/component-templates';
import { STATIC_ARDUINO_LIBRARY_CATALOG } from '@/lib/arduino-library-registry';
import { PART_MASTER_RECORDS } from '@/lib/part-master-catalog';
import {
  buildArduinoLibrariesUpsertSql,
  buildArduinoLibrarySeedRow,
  buildComponentSeedRow,
  buildComponentsUpsertSql,
  buildPartMasterSeedRow,
  buildPartMasterUpsertSql,
} from '@/lib/supabase-seed';

type SeedTarget = 'components' | 'arduino_libraries' | 'part_master' | 'all';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function parseTarget(): SeedTarget {
  const raw = (readArg('--target') ?? 'all').trim();
  if (raw === 'components' || raw === 'arduino_libraries' || raw === 'part_master' || raw === 'all') {
    return raw;
  }
  throw new Error(`Unsupported target "${raw}". Use components, arduino_libraries, part_master, or all.`);
}

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    '';

  if (!url || !key) {
    throw new Error(
      'Supabase env is missing. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.'
    );
  }

  return { url, key };
}

async function writeJsonArtifact(outputPath: string, payload: unknown) {
  const fullPath = resolve(process.cwd(), outputPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return fullPath;
}

async function writeTextArtifact(outputPath: string, payload: string) {
  const fullPath = resolve(process.cwd(), outputPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, payload, 'utf8');
  return fullPath;
}

async function upsertRows<Row extends object>(table: 'components' | 'arduino_libraries' | 'part_master', rows: Row[]) {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key);

  for (let offset = 0; offset < rows.length; offset += 100) {
    const chunk = rows.slice(offset, offset + 100);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: table === 'components' ? 'id' : table === 'arduino_libraries' ? 'name' : 'canonical_mpn',
    });

    if (error) {
      throw new Error(`${table} upsert failed at chunk ${offset / 100 + 1}: ${error.message}`);
    }
  }
}

async function main() {
  const target = parseTarget();
  const dryRun = hasFlag('--dry-run') || hasFlag('--write-json-only');

  const componentRows = STATIC_COMPONENT_TEMPLATES.map(buildComponentSeedRow);
  const libraryRows = STATIC_ARDUINO_LIBRARY_CATALOG.map(buildArduinoLibrarySeedRow);
  const partMasterRows = PART_MASTER_RECORDS.map(buildPartMasterSeedRow);

  if (target === 'components' || target === 'all') {
    const output = await writeJsonArtifact(
      'scripts/component-catalog/generated/components.seed.json',
      componentRows
    );
    const sqlOutput = await writeTextArtifact(
      'scripts/component-catalog/generated/components.import.sql',
      buildComponentsUpsertSql(componentRows)
    );
    console.log(`Prepared ${componentRows.length} component rows -> ${output}`);
    console.log(`Prepared components SQL import -> ${sqlOutput}`);
    if (!dryRun) {
      await upsertRows('components', componentRows);
      console.log(`Upserted ${componentRows.length} rows into public.components`);
    }
  }

  if (target === 'arduino_libraries' || target === 'all') {
    const output = await writeJsonArtifact(
      'scripts/component-catalog/generated/arduino-libraries.seed.json',
      libraryRows
    );
    const sqlOutput = await writeTextArtifact(
      'scripts/component-catalog/generated/arduino-libraries.import.sql',
      buildArduinoLibrariesUpsertSql(libraryRows)
    );
    console.log(`Prepared ${libraryRows.length} library rows -> ${output}`);
    console.log(`Prepared arduino_libraries SQL import -> ${sqlOutput}`);
    if (!dryRun) {
      await upsertRows('arduino_libraries', libraryRows);
      console.log(`Upserted ${libraryRows.length} rows into public.arduino_libraries`);
    }
  }

  if (target === 'part_master' || target === 'all') {
    const output = await writeJsonArtifact(
      'scripts/component-catalog/generated/part-master.seed.json',
      partMasterRows
    );
    const sqlOutput = await writeTextArtifact(
      'scripts/component-catalog/generated/part-master.import.sql',
      buildPartMasterUpsertSql(partMasterRows)
    );
    console.log(`Prepared ${partMasterRows.length} part master rows -> ${output}`);
    console.log(`Prepared part_master SQL import -> ${sqlOutput}`);
    if (!dryRun) {
      await upsertRows('part_master', partMasterRows);
      console.log(`Upserted ${partMasterRows.length} rows into public.part_master`);
    }
  }
}

await main();
