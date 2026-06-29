import { getCatalogSearchStrings } from '@/lib/catalog-i18n';
import type { ArduinoLibraryCatalogEntry, ComponentTemplate } from '@/types';

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '');
}

export function tokenizeCatalogSearch(search: string) {
  return search
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/g)
    .map(token => token.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function scoreField(rawField: string, queryCompact: string, tokens: string[], weights: {
  exact: number;
  startsWith: number;
  contains: number;
  token: number;
}) {
  if (!rawField) {
    return 0;
  }

  const field = rawField.toLowerCase();
  const fieldCompact = compact(rawField);
  let score = 0;

  if (queryCompact && fieldCompact === queryCompact) {
    score += weights.exact;
  } else if (queryCompact && fieldCompact.startsWith(queryCompact)) {
    score += weights.startsWith;
  } else if (queryCompact && fieldCompact.includes(queryCompact)) {
    score += weights.contains;
  }

  for (const token of tokens) {
    if (field.includes(token)) {
      score += weights.token;
    }
  }

  return score;
}

export function scoreComponentCatalogItem(template: ComponentTemplate, search: string) {
  const queryCompact = compact(search);
  const tokens = tokenizeCatalogSearch(search);
  if (!queryCompact && tokens.length === 0) {
    return 0;
  }

  const searchStrings = getCatalogSearchStrings(template);
  const localizedNameScore = searchStrings
    .map(value => scoreField(value, queryCompact, tokens, { exact: 420, startsWith: 240, contains: 120, token: 80 }))
    .reduce((best, score) => Math.max(best, score), 0);
  const localizedDescriptionScore = searchStrings
    .map(value => scoreField(value, queryCompact, tokens, { exact: 160, startsWith: 90, contains: 55, token: 35 }))
    .reduce((best, score) => Math.max(best, score), 0);
  const pinNames = template.requiredPins.map(pin => pin.name).join(' ');
  const tags = template.design?.tags?.join(' ') ?? '';

  return [
    localizedNameScore,
    scoreField(template.id, queryCompact, tokens, { exact: 360, startsWith: 220, contains: 110, token: 70 }),
    scoreField(pinNames, queryCompact, tokens, { exact: 260, startsWith: 180, contains: 100, token: 75 }),
    scoreField(tags, queryCompact, tokens, { exact: 210, startsWith: 140, contains: 80, token: 60 }),
    localizedDescriptionScore,
    scoreField(template.category, queryCompact, tokens, { exact: 140, startsWith: 80, contains: 40, token: 25 }),
  ].reduce((total, value) => total + value, 0);
}

export function scoreArduinoLibraryCatalogItem(entry: ArduinoLibraryCatalogEntry, search: string) {
  const queryCompact = compact(search);
  const tokens = tokenizeCatalogSearch(search);
  if (!queryCompact && tokens.length === 0) {
    return 0;
  }

  const includes = entry.includes.join(' ');

  return [
    scoreField(entry.name, queryCompact, tokens, { exact: 420, startsWith: 240, contains: 120, token: 80 }),
    scoreField(includes, queryCompact, tokens, { exact: 320, startsWith: 220, contains: 140, token: 95 }),
    scoreField(entry.author, queryCompact, tokens, { exact: 180, startsWith: 110, contains: 70, token: 45 }),
    scoreField(entry.sentence, queryCompact, tokens, { exact: 120, startsWith: 80, contains: 55, token: 30 }),
    scoreField(entry.paragraph ?? '', queryCompact, tokens, { exact: 80, startsWith: 50, contains: 30, token: 20 }),
    scoreField(entry.category, queryCompact, tokens, { exact: 110, startsWith: 70, contains: 40, token: 25 }),
  ].reduce((total, value) => total + value, 0);
}
