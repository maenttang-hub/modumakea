import { getTemplateById } from '@/constants/component-templates';
import { analyzeCircuitNetlist } from '@/lib/circuit-netlist';
import { verifyCircuitCodeConsistencyAsync } from '@/lib/formal-verifier';
import type {
  AICodeGenerationPayload,
  FormalVerificationIssue,
  PlacedComponent,
} from '@/types';

export interface GeneratedCodeQualityReview {
  acceptable: boolean;
  issueCount: number;
  errorCount: number;
  issues: FormalVerificationIssue[];
}

function buildVirtualPlacedComponents(payload: AICodeGenerationPayload): PlacedComponent[] {
  return payload.connectedComponents.map((component, index) => ({
    instanceId: `cg-${index + 1}`,
    templateId: component.templateId,
    name: component.componentName,
    position: { x: 120 + index * 180, y: 180 },
    rotation: 0,
    assignedPins: component.pinConnections,
    isFullyRouted: Object.keys(component.pinConnections).length > 0,
  }));
}

function collectStructuralIssues(payload: AICodeGenerationPayload, code: string): FormalVerificationIssue[] {
  const issues: FormalVerificationIssue[] = [];
  const trimmed = code.trim();

  if (!trimmed) {
    issues.push({
      severity: 'error',
      title: '코드가 비어 있습니다',
      message: 'AI 응답에 실제 펌웨어 코드가 포함되어 있지 않습니다.',
      ruleId: 'code.empty-output',
      recommendation: 'setup()/loop() 또는 실행 가능한 스크립트 본문이 포함되도록 다시 생성하세요.',
    });
    return issues;
  }

  if (payload.targetLanguage === 'C++') {
    if (!/\bvoid\s+setup\s*\(/.test(code) || !/\bvoid\s+loop\s*\(/.test(code)) {
      issues.push({
        severity: 'error',
        title: '아두이노 엔트리 함수 누락',
        message: '생성된 코드에 setup() 또는 loop() 함수가 없습니다.',
        ruleId: 'code.missing-arduino-entrypoints',
        recommendation: 'Arduino 스케치 기본 구조(setup/loop)를 포함하도록 다시 생성하세요.',
      });
    }
  } else if (!/\b(import|from)\b/.test(code)) {
    issues.push({
      severity: 'warning',
      title: '파이썬 초기 import가 없습니다',
      message: 'GPIO 제어에 필요한 import 구문이 보이지 않습니다.',
      ruleId: 'code.missing-python-imports',
      recommendation: 'gpiozero 또는 RPi.GPIO import를 포함하도록 다시 생성하세요.',
    });
  }

  return issues;
}

export async function reviewGeneratedCodeQuality(
  payload: AICodeGenerationPayload,
  code: string
): Promise<GeneratedCodeQualityReview> {
  const components = buildVirtualPlacedComponents(payload);
  const circuitAnalysis = analyzeCircuitNetlist(
    components,
    payload.boardId,
    getTemplateById,
    []
  );
  const formal = await verifyCircuitCodeConsistencyAsync({
    boardId: payload.boardId,
    code,
    components,
    resolveTemplate: getTemplateById,
    circuitAnalysis,
  });
  const issues = [...collectStructuralIssues(payload, code), ...formal.issues];
  const errorCount = issues.filter(issue => issue.severity === 'error').length;

  return {
    acceptable: errorCount === 0,
    issueCount: issues.length,
    errorCount,
    issues,
  };
}
