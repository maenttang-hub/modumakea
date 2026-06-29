import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import type { PlacedComponent } from '@/types';

function formatConnections(assignedPins: Record<string, string>) {
  const entries = Object.entries(assignedPins);
  if (entries.length === 0) {
    return '아직 핀이 연결되지 않았습니다.';
  }

  return entries
    .map(([componentPin, boardPin]) => `${componentPin} -> ${boardPin}`)
    .join(', ');
}

function getConnectedComponentLines(components: PlacedComponent[]) {
  const routedComponents = components.filter(
    component => component.isFullyRouted && Object.keys(component.assignedPins).length > 0
  );

  if (routedComponents.length === 0) {
    return ['아직 연결된 부품이 없습니다.'];
  }

  return routedComponents.map(component => {
    const template = getTemplateById(component.templateId);
    return `${component.name} (${template?.name ?? component.templateId}): ${formatConnections(component.assignedPins)}`;
  });
}

export function buildStarterCode(boardId: string, components: PlacedComponent[]) {
  const board = getBoardById(boardId);
  const connectedLines = getConnectedComponentLines(components);

  if (board.targetLanguage === 'Python') {
    return [
      '# ModuMake Starter Sketch',
      `# Board: ${board.name} (${board.chipset})`,
      '',
      'import time',
      '',
      '# Connected parts',
      ...connectedLines.map(line => `# - ${line}`),
      '',
      'def setup():',
      '    print("ModuMake setup complete")',
      '',
      'def loop():',
      '    # TODO: sensor read / actuator control',
      '    time.sleep(1.0)',
      '',
      'if __name__ == "__main__":',
      '    setup()',
      '    while True:',
      '        loop()',
      '',
    ].join('\n');
  }

  return [
    '/**',
    ' * ModuMake Starter Sketch',
    ` * Board: ${board.name} (${board.chipset})`,
    ' */',
    '',
    '#include <Arduino.h>',
    '',
    '// Connected parts',
    ...connectedLines.map(line => `// - ${line}`),
    '',
    'void setup() {',
    '  Serial.begin(9600);',
    '  Serial.println("ModuMake setup complete");',
    '}',
    '',
    'void loop() {',
    '  // TODO: sensor read / actuator control',
    '  delay(1000);',
    '}',
    '',
  ].join('\n');
}
