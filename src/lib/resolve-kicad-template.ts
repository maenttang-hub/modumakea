import { getStaticTemplateById } from '@/constants/component-templates';
import {
  KICAD_FOOTPRINT_REGEX_RULES,
  KICAD_REFDES_RULES,
  KICAD_VALUE_REGEX_RULES,
} from '@/lib/kicad-mapping-dict';
import type { ImportedKiCadMapping } from '@/types';

export interface ResolveKiCadTemplateParams {
  reference?: string;
  value?: string;
  footprint?: string;
  libraryId?: string;
}

function normalizeRefDesPrefix(reference?: string) {
  const trimmed = (reference ?? '').trim().toUpperCase();
  const match = trimmed.match(/^[A-Z]+/);
  return match?.[0] ?? '';
}

function buildResult(
  params: ResolveKiCadTemplateParams,
  mapping: Omit<ImportedKiCadMapping, 'reference' | 'value' | 'footprint' | 'libraryId'>
): ImportedKiCadMapping {
  return {
    ...mapping,
    reference: params.reference,
    value: params.value,
    footprint: params.footprint,
    libraryId: params.libraryId,
  };
}

function tryLibraryRule(params: ResolveKiCadTemplateParams): ImportedKiCadMapping | null {
  const libraryId = (params.libraryId ?? '').trim();
  if (!libraryId) {
    return null;
  }

  if (/^device:led$/i.test(libraryId)) {
    return buildResult(params, {
      templateId: 'tpl_led',
      confidence: 'high',
      source: 'kicad-library',
      matchedBy: 'library id Device:LED',
    });
  }

  if (/^diode:/i.test(libraryId)) {
    return buildResult(params, {
      templateId: 'tpl_diode',
      confidence: 'high',
      source: 'kicad-library',
      matchedBy: `library id ${libraryId}`,
    });
  }

  if (/^transistor_fet:/i.test(libraryId)) {
    return buildResult(params, {
      templateId: 'tpl_transistor_npn',
      confidence: 'high',
      source: 'kicad-library',
      matchedBy: `library id ${libraryId}`,
    });
  }

  return null;
}

function tryRefDesRule(params: ResolveKiCadTemplateParams): ImportedKiCadMapping | null {
  const prefix = normalizeRefDesPrefix(params.reference);
  if (!prefix) {
    return null;
  }

  const value = (params.value ?? '').toLowerCase();
  if (prefix === 'D' && value.includes('led')) {
    return buildResult(params, {
      templateId: 'tpl_led',
      confidence: 'medium',
      source: 'refdes',
      matchedBy: 'reference prefix D + value contains LED',
    });
  }

  const matchedRule = KICAD_REFDES_RULES.find(rule => rule.prefixes.includes(prefix));
  if (!matchedRule?.templateId) {
    return null;
  }

  if (!getStaticTemplateById(matchedRule.templateId)) {
    return null;
  }

  return buildResult(params, {
    templateId: matchedRule.templateId,
    confidence: matchedRule.confidence,
    source: 'refdes',
    matchedBy: matchedRule.matchedBy,
  });
}

function tryRegexRules(
  params: ResolveKiCadTemplateParams,
  source: 'value-regex' | 'footprint-regex'
): ImportedKiCadMapping | null {
  const candidate = source === 'value-regex' ? (params.value ?? '') : (params.footprint ?? '');
  const rules = source === 'value-regex' ? KICAD_VALUE_REGEX_RULES : KICAD_FOOTPRINT_REGEX_RULES;
  if (!candidate) {
    return null;
  }

  const matchedRule = rules.find(rule => rule.regex.test(candidate));
  if (!matchedRule || !getStaticTemplateById(matchedRule.templateId)) {
    return null;
  }

  return buildResult(params, {
    templateId: matchedRule.templateId,
    confidence: matchedRule.confidence,
    source,
    matchedBy: matchedRule.matchedBy,
  });
}

export function resolveKiCadTemplate(params: ResolveKiCadTemplateParams): ImportedKiCadMapping | null {
  return (
    tryLibraryRule(params) ??
    tryRefDesRule(params) ??
    tryRegexRules(params, 'value-regex') ??
    tryRegexRules(params, 'footprint-regex')
  );
}
