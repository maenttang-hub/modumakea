import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizeArduinoLibraryIndexDocument } from '@/lib/arduino-library-index';
import { buildArduinoLibrariesUpsertSql } from '@/lib/supabase-seed';

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

async function writeTextArtifact(outputPath: string, payload: string) {
  const fullPath = resolve(process.cwd(), outputPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, payload, 'utf8');
  return fullPath;
}

async function writeJsonArtifact(outputPath: string, payload: unknown) {
  const fullPath = resolve(process.cwd(), outputPath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return fullPath;
}

async function upsertLibraries(rows: object[]) {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key);

  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200);
    const { error } = await supabase.from('arduino_libraries').upsert(chunk, {
      onConflict: 'name',
    });

    if (error) {
      throw new Error(`arduino_libraries upsert failed at chunk ${offset / 200 + 1}: ${error.message}`);
    }
  }
}

async function main() {
  const inputPath = readArg('--input');
  if (!inputPath) {
    throw new Error('Missing --input path to library_index.json');
  }

  const dryRun = hasFlag('--dry-run');
  const limitArg = readArg('--limit');
  const limit = limitArg ? Math.max(1, Number.parseInt(limitArg, 10)) : null;

  const document = JSON.parse(await readFile(resolve(process.cwd(), inputPath), 'utf8'));
  const rows = normalizeArduinoLibraryIndexDocument(document);
  const limitedRows = limit ? rows.slice(0, limit) : rows;

  const jsonOutput = await writeJsonArtifact(
    'scripts/library-catalog/generated/arduino-library-index.seed.json',
    limitedRows
  );
  const sqlOutput = await writeTextArtifact(
    'scripts/library-catalog/generated/arduino-library-index.import.sql',
    buildArduinoLibrariesUpsertSql(limitedRows)
  );

  console.log(`Prepared ${limitedRows.length} arduino library rows -> ${jsonOutput}`);
  console.log(`Prepared arduino library SQL import -> ${sqlOutput}`);

  if (!dryRun) {
    await upsertLibraries(limitedRows);
    console.log(`Upserted ${limitedRows.length} rows into public.arduino_libraries`);
  }
}

await main();
