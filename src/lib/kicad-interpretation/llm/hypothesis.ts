import type {
  CoarseRegion,
  FineRegionObservation,
  GeometryMatchResult,
  HierarchyResolutionResult,
  InterpretationBlock,
  InterpretationParsedSchematic,
  LlmHypothesis,
  LlmHypothesisInput,
  LlmHypothesisProvider,
  LlmHypothesisResult,
  PatternMatchResult,
} from '@/lib/kicad-interpretation/contracts';
import { generateGeminiContent, getGeminiApiKey, getGeminiModel } from '@/lib/server/gemini';
import { generateOpenAIResponse, getOpenAIApiKey, getOpenAIModel } from '@/lib/server/openai';

function extractJsonText(rawText: string) {
  const fenced = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (fenced.startsWith('{') || fenced.startsWith('[')) {
    return fenced;
  }

  const firstBrace = fenced.indexOf('{');
  const lastBrace = fenced.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return fenced.slice(firstBrace, lastBrace + 1).trim();
  }

  throw new Error('LLM hypothesis provider response did not contain JSON.');
}

function uniqueStrings(values: ReadonlyArray<string> | undefined) {
  return Array.from(new Set((values ?? []).map(value => value.trim()).filter(Boolean)));
}

function normalizeLikelihood(value: unknown): 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'low';
}

function normalizeBlockType(value: unknown): LlmHypothesis['block_type'] {
  switch (value) {
    case 'mcu_core':
    case 'connector_block':
    case 'power_block':
    case 'passive_cluster':
    case 'repeated_channel':
    case 'sheet_interface':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function normalizeHypothesis(value: Partial<LlmHypothesis>): LlmHypothesis {
  return {
    block_type: normalizeBlockType(value.block_type),
    role: typeof value.role === 'string' && value.role.trim().length > 0 ? value.role.trim() : 'unknown',
    freeform_description:
      typeof value.freeform_description === 'string' && value.freeform_description.trim().length > 0
        ? value.freeform_description.trim()
        : 'No reliable description returned.',
    evidence: uniqueStrings(value.evidence),
    self_estimated_likelihood: normalizeLikelihood(value.self_estimated_likelihood),
  };
}

function buildGeminiHypothesisPrompt(input: LlmHypothesisInput) {
  const topPattern = input.pattern_match?.pattern_candidates[0];
  const hierarchyRoles = input.hierarchy_sheet?.inferred_roles.join(', ') || 'none';
  const geometryEntity = input.geometry_match?.matched_entity_id ?? 'none';
  const fineTexts = input.fine_region?.visible_texts.join(', ') || 'none';
  const shapeTags = input.fine_region?.observed_shape_tags.join(', ') || input.region.observed_shape_tags.join(', ') || 'none';
  const ocrTexts = input.region.ocr_like_texts.join(', ') || 'none';

  return [
    'You are helping a deterministic KiCad interpretation engine only on ambiguous regions.',
    'Return exactly one JSON object and no markdown.',
    'JSON shape:',
    '{"region_id":"string","hypotheses":[{"block_type":"mcu_core|connector_block|power_block|passive_cluster|repeated_channel|sheet_interface|unknown","role":"string","freeform_description":"string","evidence":["string"],"self_estimated_likelihood":"low|medium|high"}]}',
    'Rules:',
    '- Provide 0 to 3 hypotheses.',
    '- Prefer concrete electrical intent, not visual prose alone.',
    '- Use unknown when evidence is weak.',
    '- Do not invent hidden nets or components that are not supported by the evidence.',
    '',
    `Region ID: ${input.region.region_id}`,
    `Coarse bbox_px: [${input.region.bbox_px.join(', ')}]`,
    `Coarse OCR-like texts: ${ocrTexts}`,
    `Observed shape tags: ${shapeTags}`,
    `Fine visible texts: ${fineTexts}`,
    `Geometry matched entity: ${geometryEntity}`,
    `Geometry nearby labels: ${input.geometry_match?.nearby_labels.join(', ') || 'none'}`,
    `Top pattern: ${topPattern ? `${topPattern.pattern_name} (${topPattern.score.toFixed(3)})` : 'none'}`,
    `Hierarchy inferred roles: ${hierarchyRoles}`,
    `Sheet file: ${input.hierarchy_sheet?.sheet_file ?? 'none'}`,
    `Parsed symbol count: ${input.parsed.symbols.length}`,
    `Parsed sheet count: ${input.parsed.sheets.length}`,
  ].join('\n');
}

function topPatternScore(patternMatch: PatternMatchResult | undefined) {
  return patternMatch?.pattern_candidates[0]?.score ?? 0;
}

function findHierarchySheet(
  hierarchy: HierarchyResolutionResult | undefined,
  geometryMatch: GeometryMatchResult | undefined
) {
  if (!hierarchy || geometryMatch?.matched_entity_type !== 'sheet' || !geometryMatch.matched_entity_id) {
    return undefined;
  }

  return hierarchy.sheets.find(sheet => sheet.sheet_id === geometryMatch.matched_entity_id);
}

export function shouldCallLlmHypothesis(params: {
  block: InterpretationBlock;
  geometryMatch?: GeometryMatchResult;
  patternMatch?: PatternMatchResult;
  hierarchy?: HierarchyResolutionResult;
  thresholds: {
    readonly high_confidence_score: number;
    readonly trigger_if_pattern_score_below: number;
  };
}): boolean {
  if (!params.block.needs_review) {
    return false;
  }

  if ((params.geometryMatch?.nearby_labels.length ?? 0) > 0 && params.block.confidence === 'high') {
    return false;
  }

  if (topPatternScore(params.patternMatch) >= params.thresholds.high_confidence_score) {
    return false;
  }

  const hierarchySheet = findHierarchySheet(params.hierarchy, params.geometryMatch);
  if (hierarchySheet?.inferred_roles.length) {
    return false;
  }

  return topPatternScore(params.patternMatch) < params.thresholds.trigger_if_pattern_score_below;
}

export async function generateGatedLlmHypotheses(params: {
  provider: LlmHypothesisProvider;
  parsed: InterpretationParsedSchematic;
  regions: ReadonlyArray<CoarseRegion>;
  blocks: ReadonlyArray<InterpretationBlock>;
  geometryMatches: ReadonlyArray<GeometryMatchResult>;
  patternMatches: ReadonlyArray<PatternMatchResult>;
  hierarchy?: HierarchyResolutionResult;
  fineRegions?: ReadonlyArray<FineRegionObservation>;
  thresholds: {
    readonly high_confidence_score: number;
    readonly trigger_if_pattern_score_below: number;
  };
}): Promise<LlmHypothesisResult[]> {
  const results: LlmHypothesisResult[] = [];

  for (const region of params.regions) {
    const block = params.blocks.find(candidate => candidate.block_id === `block_${region.region_id}`);
    const geometryMatch = params.geometryMatches.find(candidate => candidate.region_id === region.region_id);
    const patternMatch = params.patternMatches.find(candidate => candidate.region_id === region.region_id);

    if (!block) {
      continue;
    }

    if (!shouldCallLlmHypothesis({
      block,
      geometryMatch,
      patternMatch,
      hierarchy: params.hierarchy,
      thresholds: params.thresholds,
    })) {
      continue;
    }

    const hierarchySheet = findHierarchySheet(params.hierarchy, geometryMatch);
    const fineRegion = params.fineRegions?.find(candidate => candidate.region_id === region.region_id) as LlmHypothesisInput['fine_region'];

    try {
      results.push(await params.provider.generate({
        region,
        fine_region: fineRegion,
        geometry_match: geometryMatch,
        pattern_match: patternMatch,
        hierarchy_sheet: hierarchySheet,
        parsed: params.parsed,
      }));
    } catch {
      results.push({
        region_id: region.region_id,
        hypotheses: [],
      });
    }
  }

  return results;
}

export function createLlmHypothesisProviderFromEnv(): LlmHypothesisProvider | null {
  const provider = process.env.KICAD_LLM_HYPOTHESIS_PROVIDER?.trim().toLowerCase();
  if (provider === 'openai') {
    if (!getOpenAIApiKey()) {
      return null;
    }

    return createOpenAILlmHypothesisProvider({
      model: process.env.KICAD_LLM_HYPOTHESIS_MODEL?.trim() || process.env.OPENAI_LLM_MODEL?.trim() || getOpenAIModel(),
    });
  }

  if (provider && provider !== 'gemini') {
    return null;
  }

  if (!getGeminiApiKey()) {
    return null;
  }

  return createGeminiLlmHypothesisProvider({
    model: process.env.KICAD_LLM_HYPOTHESIS_MODEL?.trim() || getGeminiModel(),
  });
}

export function createGeminiLlmHypothesisProvider(params?: {
  model?: string;
}): LlmHypothesisProvider {
  const model = params?.model?.trim() || process.env.KICAD_LLM_HYPOTHESIS_MODEL?.trim() || getGeminiModel();

  return {
    async generate(input) {
      const rawText = await generateGeminiContent({
        model,
        systemInstruction: 'Return exactly one valid JSON object. No prose. No markdown. No code fences.',
        temperature: 0.1,
        maxOutputTokens: 1536,
        contents: [
          {
            role: 'user',
            parts: [{ text: buildGeminiHypothesisPrompt(input) }],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as {
        region_id?: string;
        hypotheses?: ReadonlyArray<Partial<LlmHypothesis>>;
      };

      return {
        region_id: parsed.region_id?.trim() || input.region.region_id,
        hypotheses: (parsed.hypotheses ?? []).slice(0, 3).map(normalizeHypothesis),
      };
    },
  };
}

export function createOpenAILlmHypothesisProvider(params?: {
  model?: string;
}): LlmHypothesisProvider {
  const model = params?.model?.trim() || process.env.KICAD_LLM_HYPOTHESIS_MODEL?.trim() || process.env.OPENAI_LLM_MODEL?.trim() || getOpenAIModel();

  return {
    async generate(input) {
      const rawText = await generateOpenAIResponse({
        model,
        input: [
          {
            role: 'user',
            content: [{ type: 'input_text', text: buildGeminiHypothesisPrompt(input) }],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as {
        region_id?: string;
        hypotheses?: ReadonlyArray<Partial<LlmHypothesis>>;
      };

      return {
        region_id: parsed.region_id?.trim() || input.region.region_id,
        hypotheses: (parsed.hypotheses ?? []).slice(0, 3).map(normalizeHypothesis),
      };
    },
  };
}

export function createStubLlmHypothesisProvider(): LlmHypothesisProvider {
  return {
    async generate(input) {
      return {
        region_id: input.region.region_id,
        hypotheses: [],
      };
    },
  };
}
