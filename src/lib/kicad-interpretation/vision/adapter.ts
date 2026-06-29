import type {
  CoarseRegion,
  FineRegionObservation,
  VisionAdapter,
  VisionAdapterInput,
} from '@/lib/kicad-interpretation/contracts';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { generateGeminiContent, getGeminiApiKey, getGeminiModel } from '@/lib/server/gemini';
import { generateOpenAIResponse, getOpenAIApiKey, getOpenAIModel } from '@/lib/server/openai';

function uniqueStrings(values: ReadonlyArray<string> | undefined) {
  return Array.from(new Set((values ?? []).map(value => value.trim()).filter(Boolean)));
}

function normalizeBBoxPx(value: readonly number[] | readonly [number, number, number, number]) {
  if (value.length !== 4) {
    throw new Error('Vision region bbox_px must contain exactly 4 numbers.');
  }
  const next = value.map(item => Math.round(Number(item)));
  if (!next.every(Number.isFinite)) {
    throw new Error('Vision region bbox_px contains non-finite values.');
  }
  return [next[0]!, next[1]!, next[2]!, next[3]!] as const;
}

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

  throw new Error('Vision provider response did not contain JSON.');
}

function inferMimeType(imagePath: string) {
  const extension = extname(imagePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  throw new Error(`Unsupported image format for vision provider: ${extension || imagePath}`);
}

async function readImageInlineData(imagePath: string) {
  const bytes = await readFile(imagePath);
  return {
    mime_type: inferMimeType(imagePath),
    data: bytes.toString('base64'),
  };
}

async function readImageDataUrl(imagePath: string) {
  const image = await readImageInlineData(imagePath);
  return `data:${image.mime_type};base64,${image.data}`;
}

function buildCoarsePrompt(input: VisionAdapterInput) {
  return [
    'Analyze this KiCad schematic image and find human-meaningful block regions.',
    'Return exactly one JSON object with shape {"regions":[...]} and no markdown.',
    'Each region must follow:',
    '{"region_id":"region_1","bbox_px":[x1,y1,x2,y2],"observed_shape_tags":["..."],"ocr_like_texts":["..."],"visual_density":"low|medium|high","sub_candidates":["optional"],"freeform_observation":"optional"}',
    'Rules:',
    '- bbox_px coordinates are integer pixel coordinates in the provided image.',
    '- Regions should be large enough to represent blocks such as MCU core, power area, connectors, interface headers, repeated channels, or grouped passive clusters.',
    '- Do not return tiny single-symbol regions unless they clearly represent a named block.',
    '- Prefer 0 to 12 regions total.',
    `- Source image path hint: ${input.imagePath}`,
  ].join('\n');
}

function buildFinePrompt(input: VisionAdapterInput) {
  const focus = input.focusBBoxPx ? `Focus bbox in the full image: [${input.focusBBoxPx.join(', ')}].` : 'No focus bbox was provided.';
  const cropHint = input.cropImagePath
    ? `The attached image is the cropped focus region saved from ${input.cropImagePath}.`
    : 'The attached image is the full schematic image.';

  return [
    'Analyze this KiCad schematic region and summarize visible evidence for one candidate block.',
    'Return exactly one JSON object and no markdown.',
    'JSON shape:',
    '{"region_id":"string","visible_texts":["..."],"observed_shape_tags":["..."],"structural_observation":"optional","confidence_hint":"low|medium|high"}',
    `Use region_id exactly as provided: ${input.regionId ?? 'unknown-region'}`,
    focus,
    cropHint,
    'visible_texts should contain likely readable labels, net names, references, connector names, or interface names.',
    'observed_shape_tags should describe shapes like sheet_box, boxed_region, connector_row, pin_header, power_symbol_cluster, repeated_channel, passive_group, mcu_symbol.',
  ].join('\n');
}

export function createVisionAdapterFromEnv(): VisionAdapter | null {
  const provider = process.env.KICAD_VISION_PROVIDER?.trim().toLowerCase();
  if (provider === 'openai') {
    if (!getOpenAIApiKey()) {
      return null;
    }

    return createOpenAIVisionAdapter({
      model: process.env.KICAD_VISION_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || getOpenAIModel(),
    });
  }

  if (provider && provider !== 'gemini') {
    return null;
  }

  if (!getGeminiApiKey()) {
    return null;
  }

  return createGeminiVisionAdapter({
    model: process.env.KICAD_VISION_MODEL?.trim() || getGeminiModel(),
  });
}

export function normalizeCoarseRegions(rawRegions: ReadonlyArray<Partial<CoarseRegion>>): CoarseRegion[] {
  return rawRegions.map((region, index) => {
    if (!region.region_id) {
      throw new Error(`Coarse region at index ${index} is missing region_id.`);
    }
    if (!region.bbox_px) {
      throw new Error(`Coarse region ${region.region_id} is missing bbox_px.`);
    }

    return {
      region_id: region.region_id,
      bbox_px: normalizeBBoxPx(region.bbox_px),
      observed_shape_tags: uniqueStrings(region.observed_shape_tags),
      ocr_like_texts: uniqueStrings(region.ocr_like_texts),
      visual_density: region.visual_density ?? 'medium',
      sub_candidates: region.sub_candidates ? uniqueStrings(region.sub_candidates) : undefined,
      freeform_observation: region.freeform_observation?.trim() || undefined,
    };
  });
}

export function normalizeFineRegion(rawRegion: Partial<FineRegionObservation>): FineRegionObservation {
  if (!rawRegion.region_id) {
    throw new Error('Fine region observation is missing region_id.');
  }

  return {
    region_id: rawRegion.region_id,
    visible_texts: uniqueStrings(rawRegion.visible_texts),
    observed_shape_tags: uniqueStrings(rawRegion.observed_shape_tags),
    structural_observation: rawRegion.structural_observation?.trim() || undefined,
    confidence_hint: rawRegion.confidence_hint ?? 'medium',
  };
}

export function createGeminiVisionAdapter(params?: {
  model?: string;
}): VisionAdapter {
  const model = params?.model?.trim() || process.env.KICAD_VISION_MODEL?.trim() || getGeminiModel();

  return {
    async analyzeCoarse(input: VisionAdapterInput) {
      const image = await readImageInlineData(input.imagePath);
      const rawText = await generateGeminiContent({
        model,
        systemInstruction: 'Return exactly one valid JSON object. No prose. No markdown. No code fences.',
        temperature: 0.1,
        maxOutputTokens: 4096,
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildCoarsePrompt(input) },
              { inline_data: image },
            ],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as { regions?: ReadonlyArray<Partial<CoarseRegion>> };
      return normalizeCoarseRegions(parsed.regions ?? []);
    },
    async analyzeFine(input: VisionAdapterInput) {
      const imagePath = input.cropImagePath ?? input.imagePath;
      const image = await readImageInlineData(imagePath);
      const rawText = await generateGeminiContent({
        model,
        systemInstruction: 'Return exactly one valid JSON object. No prose. No markdown. No code fences.',
        temperature: 0.1,
        maxOutputTokens: 1024,
        contents: [
          {
            role: 'user',
            parts: [
              { text: buildFinePrompt(input) },
              { inline_data: image },
            ],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as Partial<FineRegionObservation>;
      return normalizeFineRegion({
        ...parsed,
        region_id: parsed.region_id ?? input.regionId ?? 'unknown-region',
      });
    },
  };
}

export function createOpenAIVisionAdapter(params?: {
  model?: string;
}): VisionAdapter {
  const model = params?.model?.trim() || process.env.KICAD_VISION_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || getOpenAIModel();

  return {
    async analyzeCoarse(input: VisionAdapterInput) {
      const imageUrl = await readImageDataUrl(input.imagePath);
      const rawText = await generateOpenAIResponse({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildCoarsePrompt(input) },
              { type: 'input_image', image_url: imageUrl, detail: 'high' },
            ],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as { regions?: ReadonlyArray<Partial<CoarseRegion>> };
      return normalizeCoarseRegions(parsed.regions ?? []);
    },
    async analyzeFine(input: VisionAdapterInput) {
      const imagePath = input.cropImagePath ?? input.imagePath;
      const imageUrl = await readImageDataUrl(imagePath);
      const rawText = await generateOpenAIResponse({
        model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: buildFinePrompt(input) },
              { type: 'input_image', image_url: imageUrl, detail: 'high' },
            ],
          },
        ],
      });

      const parsed = JSON.parse(extractJsonText(rawText)) as Partial<FineRegionObservation>;
      return normalizeFineRegion({
        ...parsed,
        region_id: parsed.region_id ?? input.regionId ?? 'unknown-region',
      });
    },
  };
}

export function createStubVisionAdapter(): VisionAdapter {
  return {
    async analyzeCoarse() {
      return [];
    },
    async analyzeFine(input: VisionAdapterInput) {
      return {
        region_id: input.regionId ?? 'unknown-region',
        visible_texts: [],
        observed_shape_tags: [],
        confidence_hint: 'low',
      };
    },
  };
}
