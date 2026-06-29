import type { ComponentTemplate, ArduinoLibraryCatalogEntry } from '@/types';
import type { PartMasterRecord } from '@/lib/part-master-catalog';

interface SeedSqlColumn<Row> {
  name: keyof Row & string;
  pgType: string;
}

export interface ComponentSeedRow {
  id: string;
  name: string;
  category: ComponentTemplate['category'];
  description: string;
  icon: string;
  compatible_voltage: ComponentTemplate['compatibleVoltage'];
  required_pins: ComponentTemplate['requiredPins'];
  library_includes: string[];
  simulation_model: ComponentTemplate['simulation'] | null;
  schematic_model: ComponentTemplate['schematic'] | null;
  pcb_model: ComponentTemplate['pcb'] | null;
  dependencies: ComponentTemplate['dependencies'] | null;
  ai_hints: ComponentTemplate['aiHints'] | null;
  design: ComponentTemplate['design'] | null;
  code: ComponentTemplate['code'] | null;
  library_source: string;
  default_value: string | null;
  datasheet_status: string | null;
  popularity_rank: number | null;
  package_version: string | null;
}

export interface ArduinoLibrarySeedRow {
  name: string;
  author: string;
  sentence: string;
  paragraph: string | null;
  category: string;
  includes: string[];
  latest_version: string | null;
  repository_url: string | null;
}

export interface PartMasterSeedRow {
  canonical_mpn: string;
  manufacturer_name: string;
  normalized_part_name: string;
  datasheet_url: string;
  lifecycle_status: string;
  source_quality: PartMasterRecord['sourceQuality'] | null;
  alias_names: string[];
  supporting_urls: string[];
  pin_schema_json: PartMasterRecord['pinSchemaJson'];
  specs_json: PartMasterRecord['specsJson'];
  last_synced_at: string | null;
}

export const COMPONENT_SEED_SQL_COLUMNS: SeedSqlColumn<ComponentSeedRow>[] = [
  { name: 'id', pgType: 'varchar(255)' },
  { name: 'name', pgType: 'varchar(255)' },
  { name: 'category', pgType: 'varchar(50)' },
  { name: 'description', pgType: 'text' },
  { name: 'icon', pgType: 'varchar(100)' },
  { name: 'compatible_voltage', pgType: 'varchar(20)' },
  { name: 'required_pins', pgType: 'jsonb' },
  { name: 'library_includes', pgType: 'text[]' },
  { name: 'simulation_model', pgType: 'jsonb' },
  { name: 'schematic_model', pgType: 'jsonb' },
  { name: 'pcb_model', pgType: 'jsonb' },
  { name: 'dependencies', pgType: 'jsonb' },
  { name: 'ai_hints', pgType: 'jsonb' },
  { name: 'design', pgType: 'jsonb' },
  { name: 'code', pgType: 'jsonb' },
  { name: 'library_source', pgType: 'varchar(50)' },
  { name: 'default_value', pgType: 'varchar(100)' },
  { name: 'datasheet_status', pgType: 'varchar(50)' },
  { name: 'popularity_rank', pgType: 'integer' },
  { name: 'package_version', pgType: 'varchar(50)' },
];

export const ARDUINO_LIBRARY_SEED_SQL_COLUMNS: SeedSqlColumn<ArduinoLibrarySeedRow>[] = [
  { name: 'name', pgType: 'varchar(255)' },
  { name: 'author', pgType: 'varchar(255)' },
  { name: 'sentence', pgType: 'text' },
  { name: 'paragraph', pgType: 'text' },
  { name: 'category', pgType: 'varchar(100)' },
  { name: 'includes', pgType: 'text[]' },
  { name: 'latest_version', pgType: 'varchar(50)' },
  { name: 'repository_url', pgType: 'text' },
];

export const PART_MASTER_SEED_SQL_COLUMNS: SeedSqlColumn<PartMasterSeedRow>[] = [
  { name: 'canonical_mpn', pgType: 'text' },
  { name: 'manufacturer_name', pgType: 'text' },
  { name: 'normalized_part_name', pgType: 'text' },
  { name: 'datasheet_url', pgType: 'text' },
  { name: 'lifecycle_status', pgType: 'text' },
  { name: 'source_quality', pgType: 'text' },
  { name: 'alias_names', pgType: 'text[]' },
  { name: 'supporting_urls', pgType: 'text[]' },
  { name: 'pin_schema_json', pgType: 'jsonb' },
  { name: 'specs_json', pgType: 'jsonb' },
  { name: 'last_synced_at', pgType: 'timestamptz' },
];

export function buildComponentSeedRow(template: ComponentTemplate): ComponentSeedRow {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    icon: template.icon,
    compatible_voltage: template.compatibleVoltage,
    required_pins: template.requiredPins,
    library_includes: template.libraryIncludes ?? [],
    simulation_model: template.simulation ?? null,
    schematic_model: template.schematic ?? null,
    pcb_model: template.pcb ?? null,
    dependencies: template.dependencies ?? null,
    ai_hints: template.aiHints ?? null,
    design: template.design ?? null,
    code: template.code ?? null,
    library_source: template.librarySource ?? 'core',
    default_value: template.defaultValue ?? null,
    datasheet_status: template.design?.datasheetStatus ?? null,
    popularity_rank: null,
    package_version: template.packageVersion ?? null,
  };
}

export function buildArduinoLibrarySeedRow(entry: ArduinoLibraryCatalogEntry): ArduinoLibrarySeedRow {
  return {
    name: entry.name,
    author: entry.author,
    sentence: entry.sentence,
    paragraph: entry.paragraph ?? null,
    category: entry.category,
    includes: entry.includes,
    latest_version: entry.version ?? null,
    repository_url: null,
  };
}

export function buildPartMasterSeedRow(record: PartMasterRecord): PartMasterSeedRow {
  return {
    canonical_mpn: record.canonicalMpn,
    manufacturer_name: record.manufacturerName,
    normalized_part_name: record.normalizedPartName,
    datasheet_url: record.datasheetUrl,
    lifecycle_status: record.lifecycleStatus,
    source_quality: record.sourceQuality ?? null,
    alias_names: record.aliasNames ?? [],
    supporting_urls: record.supportingUrls ?? [],
    pin_schema_json: record.pinSchemaJson,
    specs_json: record.specsJson,
    last_synced_at: null,
  };
}

function buildDollarQuotedJson(payload: unknown, preferredTag: string) {
  const json = JSON.stringify(payload, null, 2);
  let tag = preferredTag;
  while (json.includes(`$${tag}$`)) {
    tag = `${tag}_x`;
  }
  return `$${tag}$${json}$${tag}$`;
}

function buildUpsertSql<Row extends object>(options: {
  table: string;
  conflictColumn: keyof Row & string;
  columns: SeedSqlColumn<Row>[];
  rows: Row[];
}) {
  const { table, conflictColumn, columns, rows } = options;
  const insertColumns = columns.map(column => column.name).join(', ');
  const recordsetColumns = columns.map(column => `${column.name} ${column.pgType}`).join(',\n      ');
  const updateAssignments = columns
    .filter(column => column.name !== conflictColumn)
    .map(column => `${column.name} = excluded.${column.name}`)
    .join(',\n  ');

  return [
    `-- Generated by ModuMake seed pipeline`,
    `with seed_rows as (`,
    `  select *`,
    `  from jsonb_to_recordset(${buildDollarQuotedJson(rows, `${table}_seed`)}::jsonb) as rows(`,
    `      ${recordsetColumns}`,
    `  )`,
    `)`,
    `insert into public.${table} (${insertColumns})`,
    `select ${insertColumns}`,
    `from seed_rows`,
    `on conflict (${conflictColumn}) do update set`,
    `  ${updateAssignments};`,
    '',
  ].join('\n');
}

export function buildComponentsUpsertSql(rows: ComponentSeedRow[]) {
  return buildUpsertSql({
    table: 'components',
    conflictColumn: 'id',
    columns: COMPONENT_SEED_SQL_COLUMNS,
    rows,
  });
}

export function buildArduinoLibrariesUpsertSql(rows: ArduinoLibrarySeedRow[]) {
  return buildUpsertSql({
    table: 'arduino_libraries',
    conflictColumn: 'name',
    columns: ARDUINO_LIBRARY_SEED_SQL_COLUMNS,
    rows,
  });
}

export function buildPartMasterUpsertSql(rows: PartMasterSeedRow[]) {
  return buildUpsertSql({
    table: 'part_master',
    conflictColumn: 'canonical_mpn',
    columns: PART_MASTER_SEED_SQL_COLUMNS,
    rows,
  });
}

export function buildSupabaseBootstrapSql(options: {
  schemaSql: string;
  componentRows?: ComponentSeedRow[];
  arduinoLibraryRows?: ArduinoLibrarySeedRow[];
  partMasterRows?: PartMasterSeedRow[];
}) {
  const parts = [
    options.schemaSql.trim(),
  ];

  if (options.componentRows && options.componentRows.length > 0) {
    parts.push(
      '-- Seed bundled ModuMake component catalog',
      buildComponentsUpsertSql(options.componentRows).trim(),
    );
  }

  if (options.arduinoLibraryRows && options.arduinoLibraryRows.length > 0) {
    parts.push(
      '-- Seed bundled Arduino library catalog',
      buildArduinoLibrariesUpsertSql(options.arduinoLibraryRows).trim(),
    );
  }

  if (options.partMasterRows && options.partMasterRows.length > 0) {
    parts.push(
      '-- Seed bundled Part Master catalog',
      buildPartMasterUpsertSql(options.partMasterRows).trim(),
    );
  }

  return parts.join('\n\n') + '\n';
}
