import type { AIConceptConnectionDraft, AIConceptDesignResult } from '@/types';

const SHARED_BOARD_PINS = new Set(['5V', '3.3V', 'GND']);

function isLedSignalPin(templateId: string, componentPin: string) {
  if (templateId === 'tpl_led') {
    return componentPin === 'Signal';
  }

  if (templateId === 'tpl_rgb_led') {
    return componentPin === 'R' || componentPin === 'G' || componentPin === 'B';
  }

  return false;
}

function isResistorPin(templateId: string, componentPin: string) {
  return templateId === 'tpl_resistor' && (componentPin === '1' || componentPin === '2');
}

function buildConnectionKey(connection: AIConceptConnectionDraft) {
  return `${connection.instanceId}:${connection.componentPin}:${connection.boardPin}`;
}

export function normalizeAiConceptCompanionTopology(
  result: AIConceptDesignResult
): AIConceptDesignResult {
  const templateByInstanceId = new Map(
    result.components.map(component => [component.instanceId, component.templateId] as const)
  );
  const groupedByBoardPin = new Map<string, AIConceptConnectionDraft[]>();

  for (const connection of result.connections) {
    if (SHARED_BOARD_PINS.has(connection.boardPin)) {
      continue;
    }

    const bucket = groupedByBoardPin.get(connection.boardPin) ?? [];
    bucket.push(connection);
    groupedByBoardPin.set(connection.boardPin, bucket);
  }

  const droppedConnections = new Set<string>();

  for (const group of groupedByBoardPin.values()) {
    if (group.length < 2) {
      continue;
    }

    const ledConnections = group.filter(connection => {
      const templateId = templateByInstanceId.get(connection.instanceId) ?? '';
      return isLedSignalPin(templateId, connection.componentPin);
    });

    const resistorConnections = group.filter(connection => {
      const templateId = templateByInstanceId.get(connection.instanceId) ?? '';
      return isResistorPin(templateId, connection.componentPin);
    });

    if (ledConnections.length === 0 || resistorConnections.length === 0) {
      continue;
    }

    for (const connection of resistorConnections) {
      droppedConnections.add(buildConnectionKey(connection));
    }
  }

  if (droppedConnections.size === 0) {
    return result;
  }

  return {
    ...result,
    connections: result.connections.filter(connection => !droppedConnections.has(buildConnectionKey(connection))),
  };
}
