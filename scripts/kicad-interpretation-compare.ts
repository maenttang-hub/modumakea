import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { runInterpretationDeterministicPipeline } from '@/lib/kicad-interpretation/pipeline';

interface ScenarioSummary {
  name: 'fallback' | 'gemini' | 'openai';
  enabled: boolean;
  success: boolean;
  outputDirectory: string;
  blocks: number;
  reviewNeeded: number;
  coarseRegions: number;
  fineRegions: number;
  llmHypotheses: number;
  errorMessage?: string;
}

interface ComparisonSummary {
  sourceSchematic: string;
  generatedAt: string;
  geminiConfigured: boolean;
  openaiConfigured: boolean;
  scenarios: ScenarioSummary[];
}

const DEFAULT_SCHEMATIC = './tests/kicad_samples/rusefi/frequency-divider/frequency-divider.kicad_sch';
const DEFAULT_OUTPUT_ROOT = './.codex-artifacts';

function hasGeminiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && !apiKey.includes('your_'));
}

function hasOpenAIKey() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(apiKey && !apiKey.includes('your_'));
}

async function writeComparisonSummary(outputRoot: string, summary: ComparisonSummary) {
  const summaryPath = join(outputRoot, 'comparison-summary.json');
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summaryPath;
}

function scenarioOutputDirectory(outputRoot: string, schematicPath: string, name: ScenarioSummary['name']) {
  const baseName = basename(schematicPath).replace(/\.kicad_sch$/i, '');
  return join(outputRoot, `interpretation-${baseName}-${name}`);
}

async function runScenario(params: {
  name: ScenarioSummary['name'];
  schematicPath: string;
  outputRoot: string;
  provider: 'fallback' | 'gemini' | 'openai';
}): Promise<ScenarioSummary> {
  const outputDirectory = scenarioOutputDirectory(params.outputRoot, params.schematicPath, params.name);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const previousVisionProvider = process.env.KICAD_VISION_PROVIDER;
  const previousLlmProvider = process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;

  if (params.provider === 'gemini') {
    process.env.KICAD_VISION_PROVIDER = 'gemini';
    process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = 'gemini';
  } else if (params.provider === 'openai') {
    process.env.KICAD_VISION_PROVIDER = 'openai';
    process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = 'openai';
  } else {
    delete process.env.KICAD_VISION_PROVIDER;
    delete process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
  }

  try {
    const result = await runInterpretationDeterministicPipeline({
      schematicPath: params.schematicPath,
      outputDirectory,
    });

    return {
      name: params.name,
      enabled: true,
      success: true,
      outputDirectory,
      blocks: result.report.blocks.length,
      reviewNeeded: result.report.review_needed.length,
      coarseRegions: result.coarseRegions.length,
      fineRegions: result.fineRegions.length,
      llmHypotheses: result.llmHypotheses.length,
    };
  } catch (error) {
    return {
      name: params.name,
      enabled: params.provider !== 'fallback',
      success: false,
      outputDirectory,
      blocks: 0,
      reviewNeeded: 0,
      coarseRegions: 0,
      fineRegions: 0,
      llmHypotheses: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (previousVisionProvider === undefined) {
      delete process.env.KICAD_VISION_PROVIDER;
    } else {
      process.env.KICAD_VISION_PROVIDER = previousVisionProvider;
    }

    if (previousLlmProvider === undefined) {
      delete process.env.KICAD_LLM_HYPOTHESIS_PROVIDER;
    } else {
      process.env.KICAD_LLM_HYPOTHESIS_PROVIDER = previousLlmProvider;
    }
  }
}

async function main() {
  const schematicPath = resolve(process.argv[2] || DEFAULT_SCHEMATIC);
  const outputRoot = resolve(process.argv[3] || DEFAULT_OUTPUT_ROOT);
  await mkdir(outputRoot, { recursive: true });

  const fallbackSummary = await runScenario({
    name: 'fallback',
    schematicPath,
    outputRoot,
    provider: 'fallback',
  });

  const scenarios: ScenarioSummary[] = [fallbackSummary];
  if (hasGeminiKey()) {
    scenarios.push(await runScenario({
      name: 'gemini',
      schematicPath,
      outputRoot,
      provider: 'gemini',
    }));
  } else {
    scenarios.push({
      name: 'gemini',
      enabled: false,
      success: false,
      outputDirectory: scenarioOutputDirectory(outputRoot, schematicPath, 'gemini'),
      blocks: 0,
      reviewNeeded: 0,
      coarseRegions: 0,
      fineRegions: 0,
      llmHypotheses: 0,
      errorMessage: 'GEMINI_API_KEY not configured',
    });
  }

  if (hasOpenAIKey()) {
    scenarios.push(await runScenario({
      name: 'openai',
      schematicPath,
      outputRoot,
      provider: 'openai',
    }));
  } else {
    scenarios.push({
      name: 'openai',
      enabled: false,
      success: false,
      outputDirectory: scenarioOutputDirectory(outputRoot, schematicPath, 'openai'),
      blocks: 0,
      reviewNeeded: 0,
      coarseRegions: 0,
      fineRegions: 0,
      llmHypotheses: 0,
      errorMessage: 'OPENAI_API_KEY not configured',
    });
  }

  const comparisonSummary: ComparisonSummary = {
    sourceSchematic: schematicPath,
    generatedAt: new Date().toISOString(),
    geminiConfigured: hasGeminiKey(),
    openaiConfigured: hasOpenAIKey(),
    scenarios,
  };

  const summaryPath = await writeComparisonSummary(outputRoot, comparisonSummary);
  const lines = [
    `Source: ${schematicPath}`,
    `Fallback output: ${fallbackSummary.outputDirectory}`,
  ];

  const geminiScenario = scenarios.find(scenario => scenario.name === 'gemini');
  if (geminiScenario?.enabled) {
    lines.push(`Gemini output: ${geminiScenario.outputDirectory}`);
  } else {
    lines.push('Gemini output: skipped (GEMINI_API_KEY not configured)');
  }
  const openaiScenario = scenarios.find(scenario => scenario.name === 'openai');
  if (openaiScenario?.enabled) {
    lines.push(`OpenAI output: ${openaiScenario.outputDirectory}`);
  } else {
    lines.push('OpenAI output: skipped (OPENAI_API_KEY not configured)');
  }
  lines.push(`Comparison summary: ${summaryPath}`);

  for (const scenario of scenarios) {
    lines.push(
      `${scenario.name}: enabled=${scenario.enabled} success=${scenario.success} coarse=${scenario.coarseRegions} fine=${scenario.fineRegions} blocks=${scenario.blocks} review=${scenario.reviewNeeded} llm=${scenario.llmHypotheses}${scenario.errorMessage ? ` error=${scenario.errorMessage}` : ''}`
    );
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch(error => {
  console.error('[kicad-interpretation-compare] failed');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
