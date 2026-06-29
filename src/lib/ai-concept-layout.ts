import { getBoardById } from '@/constants/boards';
import { getTemplateById } from '@/constants/component-templates';
import { getComponentPinLayout } from '@/lib/component-pin-layout';
import type {
  AIConceptComponentDraft,
  AIConceptConnectionDraft,
  AIConceptDesignContext,
  AIConceptDesignResult,
  ComponentTemplate,
} from '@/types';

const GRID = 15;
const BOARD_RIGHT_EDGE = 80 + 232;
const START_X = BOARD_RIGHT_EDGE + 165;
const START_Y = 120;
const COLUMN_WIDTH = 210;
const COLUMN_BOTTOM = 780;
const ROW_GAP = 28;
const RECT_PADDING = 18;
const MAX_COLUMNS = 8;
const PIN_LEG_LENGTH = 8;
const PIN_HANDLE_SIZE = 10;
const HEADER_HEIGHT = 20;
const ROW_HEIGHT = 16;
const CONNECTION_HEIGHT = 12;
const FOOTER_HEIGHT = 12;
const SENSOR_WIDTH = 104;

type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function snap(value: number) {
  return Math.round(value / GRID) * GRID;
}

function isRailPin(pinId: string) {
  return pinId === '5V' || pinId === '3.3V' || pinId === 'GND';
}

function estimateComponentRect(
  component: AIConceptComponentDraft,
  template: ComponentTemplate | undefined,
  hasConnections: boolean
): LayoutRect {
  const requiredPins = template?.requiredPins ?? [];
  const { leftPins, rightPins } = getComponentPinLayout(requiredPins, template?.category);
  const maxPins = Math.max(leftPins.length, rightPins.length);
  const connectionSummaryHeight = hasConnections ? CONNECTION_HEIGHT + 6 : 0;
  const contentHeight =
    HEADER_HEIGHT + maxPins * ROW_HEIGHT + connectionSummaryHeight + FOOTER_HEIGHT;
  const isVertical = component.rotation === 90 || component.rotation === 270;
  const pinExtent = PIN_LEG_LENGTH + PIN_HANDLE_SIZE / 2;
  const rotatedBodyWidth = isVertical ? contentHeight : SENSOR_WIDTH;
  const rotatedBodyHeight = isVertical ? SENSOR_WIDTH : contentHeight;

  return {
    x: component.position.x,
    y: component.position.y,
    width: rotatedBodyWidth + pinExtent * 2,
    height: rotatedBodyHeight + pinExtent * 2,
  };
}

function intersects(a: LayoutRect, b: LayoutRect) {
  return !(
    a.x + a.width + RECT_PADDING <= b.x ||
    b.x + b.width + RECT_PADDING <= a.x ||
    a.y + a.height + RECT_PADDING <= b.y ||
    b.y + b.height + RECT_PADDING <= a.y
  );
}

function buildSignalPinRank(result: AIConceptDesignResult) {
  const board = getBoardById(result.board.id);
  const ranks = new Map<string, number>();

  board.digitalPins.forEach((pinId, index) => {
    ranks.set(pinId, index);
  });

  board.leftPins
    .filter(pinId => !isRailPin(pinId))
    .forEach((pinId, index) => {
      if (!ranks.has(pinId)) {
        ranks.set(pinId, board.digitalPins.length + index);
      }
    });

  return ranks;
}

function getComponentSignalRank(
  component: AIConceptComponentDraft,
  connections: AIConceptConnectionDraft[],
  pinRanks: Map<string, number>
) {
  const signalPins = connections
    .filter(connection => connection.instanceId === component.instanceId && !isRailPin(connection.boardPin))
    .map(connection => pinRanks.get(connection.boardPin) ?? 999);

  if (signalPins.length === 0) {
    return 999;
  }

  return Math.min(...signalPins);
}

export function normalizeAiConceptLayout(
  result: AIConceptDesignResult,
  currentDesign?: AIConceptDesignContext
): AIConceptDesignResult {
  const currentPositions = new Map(
    (currentDesign?.components ?? []).map(component => [
      component.instanceId,
      {
        x: snap(component.position.x),
        y: snap(component.position.y),
      },
    ])
  );

  const pinRanks = buildSignalPinRank(result);
  const occupiedRects: LayoutRect[] = [];
  const normalizedComponents = result.components.map(component => {
    const preservedPosition = currentPositions.get(component.instanceId);
    const nextComponent: AIConceptComponentDraft = {
      ...component,
      position: preservedPosition
        ? preservedPosition
        : {
            x: snap(component.position.x),
            y: snap(component.position.y),
          },
    };

    if (preservedPosition) {
      occupiedRects.push(
        estimateComponentRect(
          nextComponent,
          getTemplateById(component.templateId),
          result.connections.some(connection => connection.instanceId === component.instanceId)
        )
      );
    }

    return nextComponent;
  });

  const newComponents = normalizedComponents
    .filter(component => !currentPositions.has(component.instanceId))
    .sort((left, right) => {
      const leftRank = getComponentSignalRank(left, result.connections, pinRanks);
      const rightRank = getComponentSignalRank(right, result.connections, pinRanks);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTemplate = getTemplateById(left.templateId);
      const rightTemplate = getTemplateById(right.templateId);
      const leftName = leftTemplate?.name ?? left.templateId;
      const rightName = rightTemplate?.name ?? right.templateId;
      return leftName.localeCompare(rightName, 'ko');
    });

  let column = 0;
  let cursorY = START_Y;

  for (const component of newComponents) {
    const template = getTemplateById(component.templateId);
    const hasConnections = result.connections.some(
      connection => connection.instanceId === component.instanceId
    );
    const prototypeRect = estimateComponentRect(component, template, hasConnections);

    let attempts = 0;
    while (column < MAX_COLUMNS) {
      const candidateX = snap(START_X + column * COLUMN_WIDTH);
      const candidateY = snap(cursorY);
      const candidateRect: LayoutRect = {
        ...prototypeRect,
        x: candidateX,
        y: candidateY,
      };

      if (candidateRect.y + candidateRect.height > COLUMN_BOTTOM && candidateY > START_Y) {
        column += 1;
        cursorY = START_Y;
        continue;
      }

      if (occupiedRects.some(rect => intersects(candidateRect, rect))) {
        cursorY = snap(candidateY + GRID * 2);
        attempts += 1;
        if (attempts > 20) {
          column += 1;
          cursorY = START_Y;
          attempts = 0;
        }
        continue;
      }

      component.position = { x: candidateX, y: candidateY };
      occupiedRects.push(candidateRect);
      cursorY = snap(candidateRect.y + candidateRect.height + ROW_GAP);
      break;
    }
  }

  return {
    ...result,
    components: normalizedComponents,
  };
}
