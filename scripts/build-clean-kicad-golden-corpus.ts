import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inputPath = process.env.KICAD_DIFF_JSONL ?? './tmp/clean-kicad-render-report-diff-full-pass3.jsonl';
const outputJsonPath =
  process.env.KICAD_GOLDEN_CORPUS_JSON ?? './config/golden-corpus/clean-kicad-golden-corpus-v1.json';
const outputDocPath =
  process.env.KICAD_GOLDEN_CORPUS_DOC ?? './docs/clean-kicad-golden-corpus-v1.md';

type FindingLabel =
  | 'true-bug'
  | 'source-as-authored'
  | 'conservative-warning'
  | 'mapping-improvement';

interface DiffAnomaly {
  reason: string;
  category: string;
  severity: string;
  message: string;
  reference?: string;
  componentId?: string;
  detail?: Record<string, unknown>;
}

interface DiffResult {
  file: string;
  stats: Record<string, number | undefined>;
  anomalyCount: number;
  anomalyReasonCounts: Record<string, number>;
  anomalies: DiffAnomaly[];
}

interface GoldenCorpusEntry {
  id: string;
  bucket:
    | 'text-placement'
    | 'power-label-anchor'
    | 'passive-value'
    | 'low-confidence-mapping'
    | 'report-count-divergence';
  file: string;
  sourceReason: string;
  sourceCount: number;
  autoProposedLabel: FindingLabel;
  humanLabel: FindingLabel | null;
  reviewStatus: 'pending-human-review';
  reviewQuestion: string;
  actionIfConfirmed: string;
  stats: Record<string, number | undefined>;
  sampleAnomalies: DiffAnomaly[];
}

const buckets = [
  {
    bucket: 'text-placement' as const,
    reasons: ['render.property-text-far-from-symbol'],
    limit: 15,
    autoProposedLabel: 'source-as-authored' as const,
    reviewQuestion: '원본 KiCad에서도 reference/value 텍스트가 심볼에서 멀리 떨어져 있는가?',
    actionIfConfirmed: '원본과 다르면 property transform/anchor를 수정하고, 원본 그대로면 quality info로 유지한다.',
  },
  {
    bucket: 'power-label-anchor' as const,
    reasons: ['render.power-label-off-connection'],
    limit: 10,
    autoProposedLabel: 'conservative-warning' as const,
    reviewQuestion: 'VCC/GND/전원 라벨이 실제 전기 net label인가, 아니면 주석처럼 배치된 legacy 텍스트인가?',
    actionIfConfirmed: '실제 net label이면 label anchor/geometry 파싱을 수정하고, 주석이면 annotation-quality info로 내린다.',
  },
  {
    bucket: 'passive-value' as const,
    reasons: ['netlist.passive-value-missing'],
    limit: 10,
    autoProposedLabel: 'conservative-warning' as const,
    reviewQuestion: 'R/C/L 값이 원본에서 정말 비어 있는가, 아니면 다른 property/field에 저장되어 있는가?',
    actionIfConfirmed: '다른 field에 값이 있으면 parser value extraction을 확장하고, 없으면 fallback warning으로 유지한다.',
  },
  {
    bucket: 'low-confidence-mapping' as const,
    reasons: ['mapping.low-confidence-heavy'],
    limit: 10,
    autoProposedLabel: 'mapping-improvement' as const,
    reviewQuestion: '대부분이 custom/legacy/connector 계열인가, 아니면 흔한 IC/모듈인데 매핑이 약한가?',
    actionIfConfirmed: 'custom/connector면 family rule을 보강하고, 흔한 IC/모듈이면 template/part-master mapping을 추가한다.',
  },
  {
    bucket: 'report-count-divergence' as const,
    reasons: [
      'report.integrated-component-count-divergence',
      'report.lightweight-component-count-divergence',
    ],
    limit: 5,
    autoProposedLabel: 'true-bug' as const,
    reviewQuestion: 'legacy importer, integrated report, lightweight parser 중 어느 쪽 component counting 기준이 틀렸는가?',
    actionIfConfirmed: '같은 KiCad source에서 세 파이프라인의 reportable component 정의를 맞춘다.',
  },
];

function basenameWithoutExtension(file: string) {
  return path.basename(file).replace(/\.kicad_sch$/i, '');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function reasonCount(result: DiffResult, reasons: string[]) {
  return reasons.reduce((sum, reason) => sum + (result.anomalyReasonCounts[reason] ?? 0), 0);
}

function sampleAnomalies(result: DiffResult, reasons: string[]) {
  return result.anomalies
    .filter(anomaly => reasons.includes(anomaly.reason))
    .slice(0, 5);
}

function sortCandidates(bucket: (typeof buckets)[number], left: DiffResult, right: DiffResult) {
  const countDelta = reasonCount(right, bucket.reasons) - reasonCount(left, bucket.reasons);
  if (countDelta !== 0) {
    return countDelta;
  }

  const componentDelta = (right.stats.components ?? 0) - (left.stats.components ?? 0);
  if (componentDelta !== 0) {
    return componentDelta;
  }

  return left.file.localeCompare(right.file);
}

function buildEntry(
  bucket: (typeof buckets)[number],
  result: DiffResult,
  index: number
): GoldenCorpusEntry {
  const sourceReason = bucket.reasons.find(reason => (result.anomalyReasonCounts[reason] ?? 0) > 0) ?? bucket.reasons[0]!;
  return {
    id: `${bucket.bucket}-${String(index + 1).padStart(2, '0')}-${slugify(basenameWithoutExtension(result.file))}`,
    bucket: bucket.bucket,
    file: result.file,
    sourceReason,
    sourceCount: reasonCount(result, bucket.reasons),
    autoProposedLabel: bucket.autoProposedLabel,
    humanLabel: null,
    reviewStatus: 'pending-human-review',
    reviewQuestion: bucket.reviewQuestion,
    actionIfConfirmed: bucket.actionIfConfirmed,
    stats: result.stats,
    sampleAnomalies: sampleAnomalies(result, bucket.reasons),
  };
}

function buildMarkdown(entries: GoldenCorpusEntry[]) {
  const lines = [
    '# Clean KiCad Golden Corpus v1',
    '',
    'Generated from `tmp/clean-kicad-render-report-diff-full-pass3.jsonl`.',
    '',
    'Purpose: manually classify the remaining non-fatal parser/render/report findings before changing behavior again.',
    '',
    'Labels:',
    '',
    '- `true-bug`: ModuMake parsing/render/report behavior is wrong.',
    '- `source-as-authored`: ModuMake is preserving the source schematic, even if the schematic is visually odd.',
    '- `conservative-warning`: The engine is warning because source data is incomplete or ambiguous.',
    '- `mapping-improvement`: The parser worked, but component/template/part mapping should improve.',
    '',
    '| ID | Bucket | Auto Label | Human Label | Count | File | Review Question |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
  ];

  for (const entry of entries) {
    lines.push(`| ${[
      entry.id,
      entry.bucket,
      entry.autoProposedLabel,
      entry.humanLabel ?? 'pending',
      String(entry.sourceCount),
      `\`${path.basename(entry.file)}\``,
      entry.reviewQuestion.replace(/\|/g, '/'),
    ].join(' | ')} |`);
  }

  lines.push('', '## Next Use', '');
  lines.push('1. Open each source KiCad file and compare it with the ModuMake render/report.');
  lines.push('2. Fill `humanLabel` in the JSON manifest.');
  lines.push('3. Only change parser/render/report behavior for entries labeled `true-bug`.');
  lines.push('4. Use `mapping-improvement` entries for mapper/catalog backlog, not parser rewrites.');

  return `${lines.join('\n')}\n`;
}

const raw = await readFile(inputPath, 'utf8');
const results = raw
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => JSON.parse(line) as DiffResult);

const selected = new Set<string>();
const entries: GoldenCorpusEntry[] = [];

for (const bucket of buckets) {
  const candidates = results
    .filter(result => reasonCount(result, bucket.reasons) > 0)
    .filter(result => !selected.has(result.file))
    .sort((left, right) => sortCandidates(bucket, left, right))
    .slice(0, bucket.limit);

  candidates.forEach((result, index) => {
    selected.add(result.file);
    entries.push(buildEntry(bucket, result, index));
  });
}

await mkdir(path.dirname(outputJsonPath), { recursive: true });
await mkdir(path.dirname(outputDocPath), { recursive: true });
await writeFile(outputJsonPath, `${JSON.stringify({
  version: 1,
  generatedAt: '2026-06-30',
  source: inputPath,
  expectedHumanLabels: ['true-bug', 'source-as-authored', 'conservative-warning', 'mapping-improvement'],
  entries,
}, null, 2)}\n`, 'utf8');
await writeFile(outputDocPath, buildMarkdown(entries), 'utf8');

console.log(JSON.stringify({
  entries: entries.length,
  buckets: Object.fromEntries(buckets.map(bucket => [
    bucket.bucket,
    entries.filter(entry => entry.bucket === bucket.bucket).length,
  ])),
  outputJsonPath,
  outputDocPath,
}, null, 2));
