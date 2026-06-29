import type { ArduinoLibrarySeedRow } from '@/lib/supabase-seed';

interface ArduinoLibraryIndexVersion {
  version?: string;
  author?: string;
  sentence?: string;
  paragraph?: string;
  category?: string;
  url?: string;
  headers?: string[];
  includes?: string[];
}

interface ArduinoLibraryIndexEntry {
  name?: string;
  author?: string;
  sentence?: string;
  paragraph?: string;
  category?: string;
  website?: string;
  headers?: string[];
  includes?: string[];
  versions?: ArduinoLibraryIndexVersion[];
}

interface ArduinoLibraryIndexDocument {
  libraries?: ArduinoLibraryIndexEntry[];
}

function semverParts(input: string) {
  return input
    .split('.')
    .map(part => Number.parseInt(part.replace(/[^0-9].*$/g, ''), 10))
    .map(value => (Number.isFinite(value) ? value : 0));
}

function compareSemver(a: string, b: string) {
  const aParts = semverParts(a);
  const bParts = semverParts(b);
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const diff = (bParts[index] ?? 0) - (aParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return b.localeCompare(a);
}

function pickLatestVersion(entry: ArduinoLibraryIndexEntry) {
  const versions = Array.isArray(entry.versions) ? entry.versions.filter(Boolean) : [];
  return versions
    .filter(version => typeof version.version === 'string' && version.version.trim().length > 0)
    .sort((a, b) => compareSemver(a.version ?? '0.0.0', b.version ?? '0.0.0'))[0]
    ?? versions[0]
    ?? null;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function deriveIncludeCandidates(name: string) {
  const base = name
    .replace(/\blibrary\b/gi, '')
    .replace(/\([^)]*\)/g, ' ')
    .trim();

  if (!base) {
    return [];
  }

  const compact = base.replace(/[^A-Za-z0-9]+/g, '');
  const underscored = base.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  return dedupeStrings([
    compact ? `${compact}.h` : '',
    underscored ? `${underscored}.h` : '',
    base.includes(' ') ? `${base.replace(/\s+/g, '')}.h` : '',
  ]);
}

function inferIncludes(entry: ArduinoLibraryIndexEntry, latest: ArduinoLibraryIndexVersion | null) {
  const explicit = [
    ...(Array.isArray(entry.includes) ? entry.includes : []),
    ...(Array.isArray(entry.headers) ? entry.headers : []),
    ...(Array.isArray(latest?.includes) ? latest?.includes : []),
    ...(Array.isArray(latest?.headers) ? latest?.headers : []),
  ]
    .map(value => value.trim())
    .filter(Boolean);

  if (explicit.length > 0) {
    return dedupeStrings(explicit);
  }

  return deriveIncludeCandidates(entry.name ?? '');
}

export function normalizeArduinoLibraryIndexDocument(document: unknown) {
  const source = document as ArduinoLibraryIndexDocument;
  const libraries = Array.isArray(source?.libraries) ? source.libraries : [];

  return libraries
    .map(entry => {
      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!name) {
        return null;
      }

      const latest = pickLatestVersion(entry);
      const includes = inferIncludes(entry, latest);

      const row: ArduinoLibrarySeedRow = {
        name,
        author:
          latest?.author?.trim() ||
          entry.author?.trim() ||
          'Unknown',
        sentence:
          latest?.sentence?.trim() ||
          entry.sentence?.trim() ||
          `${name} 라이브러리`,
        paragraph:
          latest?.paragraph?.trim() ||
          entry.paragraph?.trim() ||
          null,
        category:
          latest?.category?.trim() ||
          entry.category?.trim() ||
          'General',
        includes,
        latest_version: latest?.version?.trim() || null,
        repository_url:
          latest?.url?.trim() ||
          entry.website?.trim() ||
          null,
      };

      return row;
    })
    .filter((row): row is ArduinoLibrarySeedRow => Boolean(row));
}
