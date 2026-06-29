import { createDrcIssue } from '@/lib/drc-issue-factory';
import {
  describeImportedSheetFrame,
  getImportedBoundsOverlapArea,
  getImportedSheetFrameBounds,
  getImportedSymbolBounds,
} from '@/lib/imported-schematic-structure';
import { deduplicateIssues } from '@/lib/issue-utils';
import type {
  ComponentTemplate,
  ImportedSchematicScene,
  ManualNetConnection,
  PlacedComponent,
  ProjectAuditIssue,
} from '@/types';

function isComponentPinConnected(component: PlacedComponent, pinName: string, manualConnections: ManualNetConnection[]) {
  if (component.assignedPins[pinName]) {
    return true;
  }

  return manualConnections.some(connection =>
    (connection.source.ownerType === 'component' &&
      connection.source.ownerId === component.instanceId &&
      connection.source.pinId === pinName) ||
    (connection.target.ownerType === 'component' &&
      connection.target.ownerId === component.instanceId &&
      connection.target.pinId === pinName)
  );
}

function isComponentConnected(component: PlacedComponent, manualConnections: ManualNetConnection[]) {
  if (Object.keys(component.assignedPins).length > 0) {
    return true;
  }

  return manualConnections.some(connection =>
    (connection.source.ownerType === 'component' && connection.source.ownerId === component.instanceId) ||
    (connection.target.ownerType === 'component' && connection.target.ownerId === component.instanceId)
  );
}

export function buildImportedSchematicAuditIssues(params: {
  components: PlacedComponent[];
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined;
  manualConnections: ManualNetConnection[];
  importedSchematicScene?: ImportedSchematicScene | null;
}): ProjectAuditIssue[] {
  const issues: ProjectAuditIssue[] = [];

  for (const component of params.components) {
    const template = params.resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const powerPins = template.requiredPins.filter(pin => pin.allowedTypes.includes('POWER'));
    const groundPins = template.requiredPins.filter(pin => pin.allowedTypes.includes('GND'));

    for (const powerPin of powerPins) {
      if (isComponentPinConnected(component, powerPin.name, params.manualConnections)) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: 'error',
        code: 'imported.power-pin-unconnected',
        title: '전원 핀 미연결',
        message: `${component.name}의 ${powerPin.name} 전원 핀이 아직 어떤 넷에도 연결되지 않았습니다.`,
        componentName: component.name,
        ruleId: 'imported.power-pin-unconnected',
        recommendation: '전원 심볼 또는 실제 전원 넷에 이 핀을 먼저 연결해 주세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          pinIds: [powerPin.name],
        },
        evidence: {
          confidence: 'strong-inference',
          evidenceSummary: `${component.name}의 ${powerPin.name} 전원 핀이 imported schematic 기준 연결 복원 결과에서도 떠 있는 상태입니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected power pin: ${powerPin.name}`,
            `Manual connection count: ${params.manualConnections.length}`,
          ],
          assumptions: [
            'imported schematic 복원 과정에서 오프시트 전원 연결이나 숨겨진 전원 핀이 완전히 재구성되지 않았을 수 있습니다.',
          ],
          sourceQuality: 'needs-vendor-pin',
          checkedBy: ['kicad-import'],
          affectedComponents: [component.instanceId],
          howToVerify: '원본 KiCad 회로도에서 이 핀이 실제 전원 심볼 또는 전원 net label에 연결되는지 확인하고, 누락이면 연결을 복원하세요.',
        },
      }));
    }

    for (const groundPin of groundPins) {
      if (isComponentPinConnected(component, groundPin.name, params.manualConnections)) {
        continue;
      }

      issues.push(createDrcIssue({
        severity: 'error',
        code: 'imported.ground-pin-unconnected',
        title: 'GND 핀 미연결',
        message: `${component.name}의 ${groundPin.name} 그라운드 핀이 아직 연결되지 않았습니다.`,
        componentName: component.name,
        ruleId: 'imported.ground-pin-unconnected',
        recommendation: 'GND 심볼 또는 공통 접지 넷에 이 핀을 연결해 기준점을 먼저 잡아 주세요.',
        visualTargets: {
          componentIds: [component.instanceId],
          pinIds: [groundPin.name],
        },
        evidence: {
          confidence: 'strong-inference',
          evidenceSummary: `${component.name}의 ${groundPin.name} GND 핀이 imported schematic 기준 연결 복원 결과에서도 떠 있는 상태입니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Affected ground pin: ${groundPin.name}`,
            `Manual connection count: ${params.manualConnections.length}`,
          ],
          assumptions: [
            'imported schematic 복원 과정에서 off-sheet GND 연결이나 숨겨진 그라운드 핀이 완전히 드러나지 않았을 수 있습니다.',
          ],
          sourceQuality: 'needs-vendor-pin',
          checkedBy: ['kicad-import'],
          affectedComponents: [component.instanceId],
          howToVerify: '원본 KiCad 회로도에서 이 핀이 GND 심볼 또는 공통 접지 라벨에 연결되는지 확인하고, 누락이면 연결을 복원하세요.',
        },
      }));
    }

    if (!isComponentConnected(component, params.manualConnections)) {
      issues.push(createDrcIssue({
        severity: 'warning',
        code: 'imported.symbol-isolated',
        title: '고립된 심볼',
        message: `${component.name} 심볼이 다른 부품이나 전원 넷과 전혀 연결되지 않은 상태입니다.`,
        componentName: component.name,
        ruleId: 'imported.symbol-isolated',
        recommendation: '실제 연결할 의도가 있는 심볼이면 전원 또는 신호선을 하나 이상 이어 주세요.',
        visualTargets: {
          componentIds: [component.instanceId],
        },
        evidence: {
          confidence: 'needs-review',
          evidenceSummary: `${component.name} 심볼이 imported schematic 복원 결과에서 독립된 섬처럼 남아 있습니다.`,
          observedFacts: [
            `Affected component: ${component.name}`,
            `Assigned pin count: ${Object.keys(component.assignedPins).length}`,
            `Manual connection count: ${params.manualConnections.length}`,
          ],
          assumptions: [
            '시트 경계, 숨겨진 전원 핀, 또는 아직 복원되지 않은 net label 때문에 실제 회로보다 더 고립되어 보일 수 있습니다.',
          ],
          sourceQuality: 'needs-vendor-pin',
          checkedBy: ['kicad-import'],
          affectedComponents: [component.instanceId],
          howToVerify: '의도적으로 독립된 심볼이 아니라면 원본 회로도에서 전원선이나 신호선이 누락되지 않았는지 확인하고 실제 연결을 복원하세요.',
        },
      }));
    }
  }

  const scene = params.importedSchematicScene;
  if (scene?.sheetFrames?.length && scene.symbols?.length) {
    for (const frame of scene.sheetFrames) {
      const frameDescriptor = describeImportedSheetFrame(frame);
      const frameBounds = getImportedSheetFrameBounds(frame);

      for (const symbol of scene.symbols) {
        const symbolBounds = getImportedSymbolBounds(symbol);
        if (!symbolBounds) {
          continue;
        }

        const overlapArea = getImportedBoundsOverlapArea(frameBounds, symbolBounds);
        if (overlapArea <= 0) {
          continue;
        }

        const symbolArea = symbolBounds.width * symbolBounds.height;
        const overlapRatio = symbolArea > 0 ? overlapArea / symbolArea : 0;
        if (overlapRatio < 0.06 && overlapArea < 1200) {
          continue;
        }

        issues.push(createDrcIssue({
          severity: 'warning',
          code: 'imported.sheet-frame-overlap',
          ruleId: 'imported.sheet-frame-overlap',
          componentName: symbol.reference || symbol.value,
          params: {
            sheetTitle: frameDescriptor.title,
            sheetFile: frameDescriptor.subtitle,
            symbolReference: symbol.reference,
          },
          title: '하위 시트 경계가 심볼 영역과 겹쳐 보입니다.',
          message: `${frameDescriptor.title} 시트 경계가 ${symbol.reference || symbol.value} 주변 심볼 영역과 겹쳐 보여 실제 커넥터나 본체처럼 읽힐 수 있습니다.`,
          recommendation: '이 박스는 실제 부품 몸체가 아니라 하위 시트 경계일 가능성이 큽니다. 문서/시트 구조로 보고 검토하고, 필요하면 이후 AI 정리 제안에서 제목/경계 표현만 다듬으세요.',
          visualTargets: {
            componentIds: [symbol.instanceId],
          },
          evidence: {
            confidence: 'needs-review',
            evidenceSummary: `${frameDescriptor.title} 시트 경계가 ${symbol.reference || symbol.value} 심볼 영역과 의미 있게 겹쳐 imported 구조 복원에서 실제 부품처럼 읽힐 수 있습니다.`,
            observedFacts: [
              `Affected symbol: ${symbol.reference || symbol.value}`,
              `Sheet title: ${frameDescriptor.title}`,
              `Overlap area: ${Math.round(overlapArea)}`,
              `Overlap ratio: ${overlapRatio.toFixed(2)}`,
            ],
            assumptions: [
              '현재 imported scene에서는 하위 시트 프레임과 심볼 외곽이 시각적으로 겹쳐 보여도, 실제 전기 연결 자체가 잘못된 것은 아닐 수 있습니다.',
            ],
            sourceQuality: 'needs-vendor-pin',
            checkedBy: ['kicad-import'],
            affectedComponents: [symbol.instanceId],
            howToVerify: '이 박스가 실제 부품 본체가 아니라 하위 시트 프레임인지 원본 KiCad 시트 구조에서 확인하고, 필요하면 imported 정리 단계에서 시각 표현만 분리하세요.',
          },
        }));
      }
    }
  }

  return deduplicateIssues(issues);
}
