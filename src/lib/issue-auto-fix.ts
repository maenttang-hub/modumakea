import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { pickLanguage } from '@/lib/ui-language';
import type { AppLanguage, AutoFixInstruction, PlacedComponent, ProjectAuditIssue } from '@/types';

type BuildAutoFixInstructionArgs = {
  issue: ProjectAuditIssue;
  components: PlacedComponent[];
  activeBoardId: string;
  appLanguage: AppLanguage;
};

function getTargetComponents(issue: ProjectAuditIssue, components: PlacedComponent[]) {
  const targetIds = new Set(issue.visualTargets?.componentIds ?? []);
  return components.filter(component =>
    targetIds.has(component.instanceId) ||
    targetIds.has(component.name) ||
    (issue.componentName != null && component.name === issue.componentName)
  );
}

function getBounds(components: PlacedComponent[]) {
  if (components.length === 0) {
    return { x: 220, y: 140, maxX: 220, maxY: 140 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const component of components) {
    minX = Math.min(minX, component.position.x);
    minY = Math.min(minY, component.position.y);
    maxX = Math.max(maxX, component.position.x);
    maxY = Math.max(maxY, component.position.y);
  }

  return { x: minX, y: minY, maxX, maxY };
}

function choosePowerRail(activeBoardId: string) {
  const board = getBoardById(activeBoardId);
  return board.logicVoltage === '3.3V' ? '3.3V' : '5V';
}

function findAssignedBoardPin(components: PlacedComponent[], pinNames: string[]) {
  for (const component of components) {
    for (const pinName of pinNames) {
      const boardPin = component.assignedPins[pinName];
      if (boardPin) {
        return boardPin;
      }
    }
  }

  return null;
}

export function supportsIssueAutoFix(issue: ProjectAuditIssue) {
  const code = issue.code ?? issue.ruleId ?? '';
  return (
    code === 'bus.i2c-impedance-voltage.missing-pullup' ||
    code === 'formal.button-vcc-needs-pulldown' ||
    code === 'netlist.decoupling-capacitor-missing'
  );
}

export function buildIssueAutoFixInstruction({
  issue,
  components,
  activeBoardId,
  appLanguage,
}: BuildAutoFixInstructionArgs): AutoFixInstruction | null {
  const t = (ko: string, en: string) => pickLanguage(appLanguage, { ko, en });
  const code = issue.code ?? issue.ruleId ?? '';
  const targetComponents = getTargetComponents(issue, components);
  const bounds = getBounds(targetComponents);
  const railPin = choosePowerRail(activeBoardId);

  if (code === 'bus.i2c-impedance-voltage.missing-pullup') {
    const sdaPin = findAssignedBoardPin(targetComponents, ['SDA']);
    const sclPin = findAssignedBoardPin(targetComponents, ['SCL']);
    if (!sdaPin || !sclPin) {
      return null;
    }

    return {
      issueId: code,
      explanation: t(
        'I2C의 SDA와 SCL은 신호를 위로 당겨주는 풀업 저항이 꼭 필요합니다. 이 저항이 없으면 버스 전압이 떠서 통신이 불안정하거나 아예 시작되지 않습니다.',
        'I2C SDA and SCL need pull-up resistors to hold the bus high. Without them, the line can float and the bus may fail to start reliably.'
      ),
      recommendation: t(
        `${railPin} 레일에 4.7kΩ 풀업 저항 두 개를 추가해 SDA와 SCL을 각각 묶어 주세요.`,
        `Add two 4.7kΩ pull-up resistors to the ${railPin} rail, one for SDA and one for SCL.`
      ),
      actions: [
        {
          type: 'add_component',
          componentId: 'R_PULLUP_SDA',
          templateId: 'tpl_resistor',
          value: '4.7k',
          position: { x: bounds.maxX + 120, y: bounds.y - 20 },
          name: 'SDA Pull-up',
        },
        {
          type: 'add_component',
          componentId: 'R_PULLUP_SCL',
          templateId: 'tpl_resistor',
          value: '4.7k',
          position: { x: bounds.maxX + 120, y: bounds.y + 48 },
          name: 'SCL Pull-up',
        },
        { type: 'add_wire', from: 'R_PULLUP_SDA:1', to: railPin },
        { type: 'add_wire', from: 'R_PULLUP_SDA:2', to: sdaPin },
        { type: 'add_wire', from: 'R_PULLUP_SCL:1', to: railPin },
        { type: 'add_wire', from: 'R_PULLUP_SCL:2', to: sclPin },
      ],
    };
  }

  if (code === 'formal.button-vcc-needs-pulldown') {
    const signalPin = issue.boardPin;
    if (!signalPin) {
      return null;
    }

    return {
      issueId: code,
      explanation: t(
        '버튼 입력이 VCC 쪽으로 연결되어 있으면 눌리지 않은 상태를 안정적으로 잡아두기 위해 풀다운 저항이 필요합니다.',
        'When a button is wired toward VCC, a pulldown resistor keeps the idle state stable instead of letting the input float.'
      ),
      recommendation: t(
        `${signalPin}과 GND 사이에 10kΩ 풀다운 저항을 추가해 기본 상태를 LOW로 고정하세요.`,
        `Add a 10kΩ pulldown resistor between ${signalPin} and GND to hold the default state LOW.`
      ),
      actions: [
        {
          type: 'add_component',
          componentId: 'R_PULLDOWN_BTN',
          templateId: 'tpl_resistor',
          value: '10k',
          position: { x: bounds.maxX + 110, y: bounds.maxY + 30 },
          name: 'Button Pulldown',
        },
        { type: 'add_wire', from: 'R_PULLDOWN_BTN:1', to: signalPin },
        { type: 'add_wire', from: 'R_PULLDOWN_BTN:2', to: 'GND' },
      ],
    };
  }

  if (code === 'netlist.decoupling-capacitor-missing') {
    const targetComponent = targetComponents[0];
    if (!targetComponent) {
      return null;
    }

    const template = getTemplateById(targetComponent.templateId);
    const powerPinName =
      template?.requiredPins.find(pin => pin.allowedTypes.includes('POWER'))?.name ??
      'VCC';
    const powerBoardPin = targetComponent.assignedPins[powerPinName] ?? railPin;

    return {
      issueId: code,
      explanation: t(
        '전원 입력 바로 옆의 디커플링 콘덴서는 순간 전류 변동과 노이즈를 흡수해 센서나 IC가 더 안정적으로 동작하게 도와줍니다.',
        'A local decoupling capacitor absorbs fast current spikes and noise right next to the power pin, helping the IC stay stable.'
      ),
      recommendation: t(
        `${targetComponent.name} 근처에 0.1uF 콘덴서를 추가해 ${powerBoardPin}와 GND 사이에 붙여 주세요.`,
        `Place a 0.1uF capacitor near ${targetComponent.name} between ${powerBoardPin} and GND.`
      ),
      actions: [
        {
          type: 'add_component',
          componentId: 'C_DECOUPLE',
          templateId: 'tpl_capacitor',
          value: '0.1uF',
          position: { x: targetComponent.position.x + 90, y: targetComponent.position.y - 24 },
          name: 'Decoupling Cap',
        },
        { type: 'add_wire', from: 'C_DECOUPLE:1', to: powerBoardPin },
        { type: 'add_wire', from: 'C_DECOUPLE:2', to: 'GND' },
      ],
    };
  }

  return null;
}
