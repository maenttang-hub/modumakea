import { enrichComponentTemplate } from '@/constants/component-templates';
import { sanitizePlainText } from '@/lib/security-input';
import type { ArduinoLibraryCatalogEntry, ComponentTemplate } from '@/types';

type SupabaseComponentRow = {
  id: string;
  name: string;
  name_key?: string | null;
  category: ComponentTemplate['category'];
  description?: string | null;
  description_key?: string | null;
  icon?: string | null;
  compatible_voltage?: '3.3V' | '5V' | 'BOTH' | null;
  default_value?: string | null;
  required_pins?: ComponentTemplate['requiredPins'] | null;
  library_includes?: string[] | null;
  dependencies?: ComponentTemplate['dependencies'] | null;
  ai_hints?: ComponentTemplate['aiHints'] | null;
  design?: ComponentTemplate['design'] | null;
  simulation_model?: ComponentTemplate['simulation'] | null;
  schematic_model?: ComponentTemplate['schematic'] | null;
  pcb_model?: ComponentTemplate['pcb'] | null;
  schematic?: ComponentTemplate['schematic'] | null;
  pcb?: ComponentTemplate['pcb'] | null;
  code?: ComponentTemplate['code'] | null;
  package_version?: string | null;
  library_source?: 'core' | 'custom' | 'community' | null;
};

type SupabaseArduinoLibraryRow = {
  name: string;
  author?: string | null;
  sentence?: string | null;
  paragraph?: string | null;
  includes?: string[] | null;
  category?: string | null;
  version?: string | null;
  latest_version?: string | null;
  repository_url?: string | null;
};

export function mapSupabaseToTemplate(row: SupabaseComponentRow): ComponentTemplate | null {
  if (!row.id || !row.name || !row.category || !Array.isArray(row.required_pins) || row.required_pins.length === 0) {
    return null;
  }

  return enrichComponentTemplate({
    id: sanitizePlainText(row.id, { maxLength: 80 }),
    name: sanitizePlainText(row.name, { maxLength: 80, fallback: 'Unnamed Component' }),
    nameKey: row.name_key ? sanitizePlainText(row.name_key, { maxLength: 120 }) : undefined,
    category: row.category,
    description: sanitizePlainText(row.description ?? '', { maxLength: 240, fallback: `${row.name} component` }),
    descriptionKey: row.description_key ? sanitizePlainText(row.description_key, { maxLength: 120 }) : undefined,
    icon: sanitizePlainText(row.icon ?? '', { maxLength: 48, fallback: 'Microchip' }),
    compatibleVoltage:
      row.compatible_voltage === '3.3V' || row.compatible_voltage === '5V'
        ? row.compatible_voltage
        : 'BOTH',
    defaultValue: row.default_value ? sanitizePlainText(row.default_value, { maxLength: 64 }) : undefined,
    requiredPins: row.required_pins,
    libraryIncludes: Array.isArray(row.library_includes) ? row.library_includes : undefined,
    dependencies: row.dependencies ?? undefined,
    aiHints: row.ai_hints ?? undefined,
    design: row.design ?? undefined,
    simulation: row.simulation_model ?? undefined,
    schematic: row.schematic_model ?? row.schematic ?? undefined,
    pcb: row.pcb_model ?? row.pcb ?? undefined,
    code: row.code ?? undefined,
    packageVersion: row.package_version ?? undefined,
    librarySource: row.library_source === 'custom' || row.library_source === 'community' ? 'custom' : 'core',
  });
}

export function mapSupabaseToArduinoLibrary(row: SupabaseArduinoLibraryRow): ArduinoLibraryCatalogEntry | null {
  if (!row.name) {
    return null;
  }

  return {
    name: sanitizePlainText(row.name, { maxLength: 120 }),
    author: sanitizePlainText(row.author ?? '', { maxLength: 120, fallback: 'Unknown' }),
    sentence: sanitizePlainText(row.sentence ?? '', { maxLength: 220, fallback: '설명이 준비되지 않았습니다.' }),
    paragraph: row.paragraph ? sanitizePlainText(row.paragraph, { maxLength: 500 }) : undefined,
    includes: Array.isArray(row.includes)
      ? row.includes.map(include => sanitizePlainText(include, { maxLength: 80 })).filter(Boolean)
      : [],
    category: sanitizePlainText(row.category ?? '', { maxLength: 80, fallback: 'General' }),
    version: row.version
      ? sanitizePlainText(row.version, { maxLength: 40 })
      : row.latest_version
        ? sanitizePlainText(row.latest_version, { maxLength: 40 })
        : undefined,
  };
}
