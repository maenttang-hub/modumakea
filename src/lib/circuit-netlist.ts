import { getBoardById } from '@/constants/boards';
import spiceMapper from '@/constants/spice-mapper';
import kicadMapper from '../constants/kicad-mapper.json' with { type: 'json' };
import { getBoardSignalLimits } from '@/lib/board-signal-limits';
import { solveDcNetwork } from '@/lib/engine-kernel';
import { createDrcIssue } from '@/lib/drc-issue-factory';
import { createProjectAuditIssue } from '@/lib/engine-i18n';
import { findPartMasterRecordByLookupCandidates, type PartMasterRecord } from '@/lib/part-master-catalog';
import { inferPinoutVariantDetail } from '@/lib/pinout-variant-catalog';
import { flattenSubCircuitProject } from '@/lib/subcircuits';
import type {
  Ads1x15DifferentialPairKey,
  BoardPinDriveState,
  ComponentTemplate,
  ManualNetConnection,
  Mcp3208ChannelMode,
  PinType,
  PlacedComponent,
  ProjectAdcComponentConfig,
  ProjectAdcConfigurations,
  ProjectAuditIssue,
  ProjectMcp3208AdcConfig,
} from '@/types';

type CircuitNodeOwnerType = 'board' | 'component';
type CircuitNodeElectricalType = 'power' | 'ground' | 'signal' | 'analog';

export interface CircuitNodeRef {
  key: string;
  ownerType: CircuitNodeOwnerType;
  ownerId: string;
  pinId: string;
  label: string;
  electricalType: CircuitNodeElectricalType;
  boardPinTypes?: PinType[];
  componentName?: string;
}

export interface CircuitNet {
  id: string;
  nodes: CircuitNodeRef[];
  knownVoltage: number | null;
  solvedVoltage: number | null;
  sourceLabels: string[];
}

export interface CircuitResistorElement {
  id: string;
  componentId: string;
  componentName: string;
  value?: string;
  packageHint?: string;
  resistanceOhms: number;
  powerRatingW?: number;
  netA: string;
  netB: string;
}

type CircuitLowImpedanceLink = {
  id: string;
  componentId: string;
  componentName: string;
  kind: 'resistor' | 'inductor';
  netA: string;
  netB: string;
  impedanceOhms: number;
};

type InductiveLoadKind = 'relay' | 'motor' | 'solenoid' | 'injector' | 'coil';
type InductiveProtectionLevel = 'none' | 'partial' | 'full';

type InductiveProfile = {
  family: 'inductive';
  kind: InductiveLoadKind;
  protectionLevel?: InductiveProtectionLevel;
};

function getPartMasterRecordForCircuitComponent(
  component: PlacedComponent,
  template?: ComponentTemplate
): PartMasterRecord | undefined {
  const rawCandidates = [
    component.name,
    component.value,
    template?.name,
    template?.id,
    component.importedMapping?.value,
    component.importedMapping?.reference,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ];

  return findPartMasterRecordByLookupCandidates(rawCandidates);
}

function getComponentAnalysisValue(component: PlacedComponent) {
  return (
    component.value?.trim() ||
    component.importedMapping?.value?.trim() ||
    component.importedGeometry?.valueLabel?.trim() ||
    undefined
  );
}

export interface CircuitAnalysisReport {
  nets: CircuitNet[];
  resistors: CircuitResistorElement[];
  capacitors?: CircuitCapacitorElement[];
  diodes?: CircuitDiodeElement[];
  issues: ProjectAuditIssue[];
}

export type CircuitCapacitorElement = {
  id: string;
  componentId: string;
  componentName: string;
  value?: string;
  packageHint?: string;
  capacitanceFarads: number;
  voltageRatingV?: number;
  netA: string;
  netB: string;
};

export type CircuitDiodeElement = {
  id: string;
  componentId: string;
  componentName: string;
  netA: string;
  netK: string;
  value?: string;
  forwardVoltageDrop?: number;
  kind?: 'diode' | 'led';
};

export interface SpiceNetlistBuildOptions {
  title?: string;
  analysisDirective?: string;
}

export interface CircuitAnalysisOptions {
  boardPinDriveStates?: BoardPinDriveState[];
  adcConfigurations?: ProjectAdcConfigurations;
}

const INTERNAL_PULLUP_RESISTANCE_OHMS = 30_000;

type ParsedResistanceResult = {
  resistanceOhms: number;
  usedFallback: boolean;
  reason?: 'missing' | 'invalid';
};

type ParsedCapacitanceResult = {
  capacitanceFarads: number;
  usedFallback: boolean;
  reason?: 'missing' | 'invalid';
};

type ParsedVoltageRatingResult = {
  voltageV: number | null;
};

type ParsedPowerRatingResult = {
  powerW: number | null;
};

class UnionFind {
  private parent = new Map<string, string>();

  add(node: string) {
    if (!this.parent.has(node)) {
      this.parent.set(node, node);
    }
  }

  find(node: string): string {
    const existing = this.parent.get(node);
    if (!existing) {
      this.parent.set(node, node);
      return node;
    }

    if (existing === node) {
      return node;
    }

    const root = this.find(existing);
    this.parent.set(node, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent.set(rootB, rootA);
    }
  }
}

function isGroundCircuitNet(net: CircuitNet) {
  return net.knownVoltage === 0 || net.sourceLabels.some(label => label.toUpperCase().includes('GND'));
}

function isPowerCircuitNet(net: CircuitNet) {
  return (
    (typeof net.knownVoltage === 'number' && net.knownVoltage > 0) ||
    net.sourceLabels.some(label => {
      const normalized = label.toUpperCase();
      return normalized.includes('5V') || normalized.includes('3.3V') || normalized.includes('VCC') || normalized.includes('VIN');
    })
  );
}

function parseResistanceOhms(value?: string): ParsedResistanceResult {
  if (!value) {
    return {
      resistanceOhms: 220,
      usedFallback: true,
      reason: 'missing',
    };
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/ohms?/g, '')
    .replace(/ω|Ω/g, '')
    .replace(/\s+/g, '');

  if (/^0+(?:\.0+)?[r]?$/.test(normalized)) {
    return {
      resistanceOhms: 0.01,
      usedFallback: false,
    };
  }

  const embeddedMatch = normalized.match(/^(\d+)([rkm])(\d+)$/);
  if (embeddedMatch) {
    const [, whole, marker, fractional] = embeddedMatch;
    const base =
      marker === 'r'
        ? Number.parseFloat(`${whole}.${fractional}`)
        : Number.parseFloat(`${whole}.${fractional}`);
    const multiplier = marker === 'k' ? 1_000 : marker === 'm' ? 1_000_000 : 1;
    return {
      resistanceOhms: base * multiplier,
      usedFallback: false,
    };
  }

  const match = normalized.match(/^([0-9]*\.?[0-9]+)([rkmu]?)(?:f|h)?$/);
  if (!match) {
    return {
      resistanceOhms: 220,
      usedFallback: true,
      reason: 'invalid',
    };
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base) || base < 0) {
    return {
      resistanceOhms: 220,
      usedFallback: true,
      reason: 'invalid',
    };
  }

  if (base === 0) {
    return {
      resistanceOhms: 0.01,
      usedFallback: false,
    };
  }

  const suffix = match[2];
  const multiplier =
    suffix === 'k' ? 1_000 :
    suffix === 'm' ? 1_000_000 :
    suffix === 'u' ? 0.000001 :
    1;

  return {
    resistanceOhms: base * multiplier,
    usedFallback: false,
  };
}

function parseCurrentAmpsFromText(value?: string) {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(ma|a|amp|amps|ampere|amperes)\b/);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return match[2] === 'ma' ? amount / 1000 : amount;
}

function parseResistanceOhmsFromFreeText(value?: string) {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  const embeddedMatch = normalized.match(/\b(\d+)\s*r\s*(\d+)\b/);
  if (embeddedMatch) {
    const amount = Number.parseFloat(`${embeddedMatch[1]}.${embeddedMatch[2]}`);
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(ohm|ohms|ω|Ω|r)\b/);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parsePowerWattsFromFreeText(value?: string) {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(w|watt|watts)\b/);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseCapacitanceFarads(value?: string): ParsedCapacitanceResult {
  if (!value) {
    return {
      capacitanceFarads: 0.1e-6,
      usedFallback: true,
      reason: 'missing',
    };
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/farads?/g, '')
    .replace(/\s+/g, '');

  const embeddedMatch = normalized.match(/^(\d+)([munp])(\d+)(?:f)?$/);
  if (embeddedMatch) {
    const [, whole, marker, fractional] = embeddedMatch;
    const base = Number.parseFloat(`${whole}.${fractional}`);
    const multiplier =
      marker === 'm' ? 1e-3 :
      marker === 'u' ? 1e-6 :
      marker === 'n' ? 1e-9 :
      1e-12;
    return {
      capacitanceFarads: base * multiplier,
      usedFallback: false,
    };
  }

  const match = normalized.match(/^([0-9]*\.?[0-9]+)([munp]?)(?:f)?$/);
  if (!match) {
    return {
      capacitanceFarads: 0.1e-6,
      usedFallback: true,
      reason: 'invalid',
    };
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base) || base <= 0) {
    return {
      capacitanceFarads: 0.1e-6,
      usedFallback: true,
      reason: 'invalid',
    };
  }

  const suffix = match[2];
  const multiplier =
    suffix === 'm' ? 1e-3 :
    suffix === 'u' ? 1e-6 :
    suffix === 'n' ? 1e-9 :
    suffix === 'p' ? 1e-12 :
    1;

  return {
    capacitanceFarads: base * multiplier,
    usedFallback: false,
  };
}

function parseVoltageRating(value?: string): ParsedVoltageRatingResult {
  if (!value) {
    return { voltageV: null };
  }

  const normalized = value.trim().toLowerCase();
  const slashMatch = normalized.match(/(?:\/|^|\b)(\d+(?:\.\d+)?)\s*v\b/);
  const inlineMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*v\b/);
  const match = slashMatch ?? inlineMatch;
  if (!match) {
    return { voltageV: null };
  }

  const voltageV = Number.parseFloat(match[1]);
  return {
    voltageV: Number.isFinite(voltageV) && voltageV > 0 ? voltageV : null,
  };
}

function parsePowerRating(value?: string): ParsedPowerRatingResult {
  if (!value) {
    return { powerW: null };
  }

  const normalized = value.trim().toLowerCase();
  const fractionalMatch = normalized.match(/\b(\d+)\s*\/\s*(\d+)\s*w\b/);
  if (fractionalMatch) {
    const numerator = Number.parseFloat(fractionalMatch[1]);
    const denominator = Number.parseFloat(fractionalMatch[2]);
    const powerW = numerator / denominator;
    return {
      powerW: Number.isFinite(powerW) && powerW > 0 ? powerW : null,
    };
  }

  const decimalMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*w\b/);
  if (!decimalMatch) {
    return { powerW: null };
  }

  const powerW = Number.parseFloat(decimalMatch[1]);
  return {
    powerW: Number.isFinite(powerW) && powerW > 0 ? powerW : null,
  };
}

function inferLedForwardVoltage(component: PlacedComponent, channel?: 'R' | 'G' | 'B') {
  const raw = `${getComponentAnalysisValue(component) ?? ''} ${component.name}`.toLowerCase();
  if (channel === 'B') {
    return 3.0;
  }

  if (channel === 'G') {
    return raw.includes('lime') ? 2.2 : 3.0;
  }

  if (raw.includes('blue') || raw.includes('white')) {
    return 3.0;
  }

  if (raw.includes('green')) {
    return 2.2;
  }

  if (raw.includes('yellow') || raw.includes('amber')) {
    return 2.1;
  }

  return 2.0;
}

function inferDiodeForwardVoltage(component: PlacedComponent) {
  const raw = `${getComponentAnalysisValue(component) ?? ''} ${component.name}`.toLowerCase();

  if (raw.includes('schottky') || raw.includes('1n581')) {
    return 0.35;
  }

  if (raw.includes('germanium')) {
    return 0.3;
  }

  if (raw.includes('zener')) {
    return 0.7;
  }

  return 0.7;
}

function formatSpiceNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Math.abs(value) >= 1_000_000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
    return value.toExponential(6);
  }

  return Number(value.toFixed(6)).toString();
}

function getSpiceNodeName(net: CircuitNet, index: number) {
  if (net.sourceLabels.includes('GND') || net.knownVoltage === 0) {
    return '0';
  }

  const boardPin = net.nodes.find(node => node.ownerType === 'board' && node.pinId !== 'GND')?.pinId;
  if (boardPin) {
    return `N_${boardPin.replace(/[^A-Za-z0-9_]/g, '_')}`;
  }

  return `N_${index + 1}`;
}

function getComponentDebugComment(componentName: string, details: string) {
  return `* ${componentName} :: ${details}`;
}

function makeBoardNodeKey(pinId: string) {
  return `board:${pinId}`;
}

function makeComponentNodeKey(componentId: string, pinId: string) {
  return `component:${componentId}:${pinId}`;
}

function getComponentPinNodeKey(component: PlacedComponent, pinId: string) {
  return makeComponentNodeKey(component.instanceId, pinId);
}

function getManualEndpointKey(endpoint: ManualNetConnection['source']) {
  return endpoint.ownerType === 'board'
    ? makeBoardNodeKey(endpoint.pinId)
    : makeComponentNodeKey(endpoint.ownerId, endpoint.pinId);
}

function inferElectricalTypeFromRequirement(template: ComponentTemplate, pinId: string): CircuitNodeElectricalType {
  const requirement = template.requiredPins.find(pin => pin.name === pinId);
  if (!requirement) {
    return 'signal';
  }

  if (requirement.allowedTypes.includes('GND')) {
    return 'ground';
  }

  if (requirement.allowedTypes.includes('POWER')) {
    return 'power';
  }

  if (requirement.allowedTypes.includes('ANALOG')) {
    return 'analog';
  }

  return 'signal';
}

function buildCircuitNodes(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  manualConnections: ManualNetConnection[] = []
) {
  const nodes = new Map<string, CircuitNodeRef>();

  const ensureBoardNode = (pinId: string) => {
    if (nodes.has(makeBoardNodeKey(pinId))) {
      return;
    }

    const limits = getBoardSignalLimits(boardId, pinId);
    if (!limits) {
      return;
    }

    nodes.set(makeBoardNodeKey(pinId), {
      key: makeBoardNodeKey(pinId),
      ownerType: 'board',
      ownerId: 'board-node',
      pinId,
      label: `${getBoardById(boardId).name} ${pinId}`,
      electricalType: limits.isGround ? 'ground' : limits.isPower ? 'power' : limits.supportsAdc ? 'analog' : 'signal',
      boardPinTypes: limits.types,
    });
  };

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    for (const pin of template.requiredPins) {
      const key = getComponentPinNodeKey(component, pin.name);
      if (!nodes.has(key)) {
        nodes.set(key, {
          key,
          ownerType: 'component',
          ownerId: component.instanceId,
          pinId: pin.name,
          label: `${component.name} ${pin.name}`,
          componentName: component.name,
          electricalType: inferElectricalTypeFromRequirement(template, pin.name),
        });
      }
    }

    for (const boardPinId of Object.values(component.assignedPins)) {
      ensureBoardNode(boardPinId);
    }
  }

  for (const connection of manualConnections) {
    if (connection.source.ownerType === 'board') {
      ensureBoardNode(connection.source.pinId);
    }
    if (connection.target.ownerType === 'board') {
      ensureBoardNode(connection.target.pinId);
    }
  }

  return { nodes, ensureBoardNode };
}

function buildWireConnections(
  components: PlacedComponent[],
  manualConnections: ManualNetConnection[]
) {
  const connections: Array<{ a: string; b: string }> = [];

  for (const component of components) {
    for (const [componentPin, boardPinId] of Object.entries(component.assignedPins)) {
      connections.push({
        a: getComponentPinNodeKey(component, componentPin),
        b: makeBoardNodeKey(boardPinId),
      });
    }
  }

  for (const connection of manualConnections) {
    connections.push({
      a: getManualEndpointKey(connection.source),
      b: getManualEndpointKey(connection.target),
    });
  }

  return connections;
}

function solveNetworkVoltages(
  nets: CircuitNet[],
  resistors: CircuitResistorElement[],
  diodes: CircuitDiodeElement[]
) {
  const result = solveDcNetwork({
    nets: nets.map(net => ({
      id: net.id,
      knownVoltage: net.knownVoltage,
    })),
    resistors: resistors.map(resistor => ({
      netA: resistor.netA,
      netB: resistor.netB,
      resistanceOhms: resistor.resistanceOhms,
    })),
    diodes: diodes.map(diode => ({
      netA: diode.netA,
      netK: diode.netK,
      forwardVoltageDrop: diode.forwardVoltageDrop,
    })),
  });

  if (!result) {
    return {
      converged: false,
      mode: diodes.length > 0 ? 'nonlinear' : 'linear',
      iterations: 0,
    };
  }

  for (const net of nets) {
    const solvedVoltage = result.voltages.get(net.id);
    if (typeof solvedVoltage === 'number') {
      net.solvedVoltage = solvedVoltage;
    }
  }

  return result;
}

function applyBoardPinDriveStates(
  nets: CircuitNet[],
  boardId: string,
  boardPinDriveStates: BoardPinDriveState[]
) {
  if (boardPinDriveStates.length === 0) {
    return;
  }

  const board = getBoardById(boardId);
  const logicHighVoltage = board.logicVoltage === '3.3V' ? 3.3 : 5;

  for (const driveState of boardPinDriveStates) {
    const net = nets.find(item =>
      item.nodes.some(node => node.ownerType === 'board' && node.pinId === driveState.boardPin)
    );
    if (!net) {
      continue;
    }

    if (driveState.mode === 'output_high') {
      net.knownVoltage = logicHighVoltage;
      net.solvedVoltage = logicHighVoltage;
      if (!net.sourceLabels.includes(driveState.boardPin)) {
        net.sourceLabels.push(driveState.boardPin);
      }
      continue;
    }

    if (driveState.mode === 'output_low') {
      net.knownVoltage = 0;
      net.solvedVoltage = 0;
      if (!net.sourceLabels.includes(driveState.boardPin)) {
        net.sourceLabels.push(driveState.boardPin);
      }
    }
  }
}

function buildVirtualDriveResistors(
  nets: CircuitNet[],
  boardId: string,
  boardPinDriveStates: BoardPinDriveState[]
) {
  const virtualResistors: CircuitResistorElement[] = [];
  if (boardPinDriveStates.length === 0) {
    return virtualResistors;
  }

  const board = getBoardById(boardId);
  const logicHighVoltage = board.logicVoltage === '3.3V' ? 3.3 : 5;

  for (const driveState of boardPinDriveStates) {
    if (driveState.mode !== 'input_pullup' && driveState.mode !== 'output_pwm') {
      continue;
    }

    const targetNet = nets.find(item =>
      item.nodes.some(node => node.ownerType === 'board' && node.pinId === driveState.boardPin)
    );
    if (!targetNet) {
      continue;
    }

    const sourceNetId = `NET_DRIVE_${driveState.boardPin}_${driveState.mode.toUpperCase()}`;
    if (!nets.some(net => net.id === sourceNetId)) {
      const previewVoltage =
        driveState.mode === 'output_pwm'
          ? logicHighVoltage * (driveState.pwmDutyCycle ?? 0.5)
          : logicHighVoltage;

      nets.push({
        id: sourceNetId,
        nodes: [],
        knownVoltage: previewVoltage,
        solvedVoltage: previewVoltage,
        sourceLabels: [`${driveState.boardPin}_${driveState.mode}`],
      });
    }

    virtualResistors.push({
      id: `virtual-${driveState.boardPin}-${driveState.mode}`,
      componentId: `virtual-${driveState.boardPin}-${driveState.mode}`,
      componentName:
        driveState.mode === 'input_pullup'
          ? `${driveState.boardPin} internal pull-up`
          : `${driveState.boardPin} PWM preview source`,
      resistanceOhms:
        driveState.mode === 'input_pullup'
          ? INTERNAL_PULLUP_RESISTANCE_OHMS
          : 1,
      netA: sourceNetId,
      netB: targetNet.id,
      value:
        driveState.mode === 'input_pullup'
          ? `${Math.round(INTERNAL_PULLUP_RESISTANCE_OHMS / 1000)}k`
          : '1',
    });
  }

  return virtualResistors;
}

function buildPowerConflictIssues(nets: CircuitNet[]) {
  const issues: ProjectAuditIssue[] = [];

  for (const net of nets) {
    const boardPins = net.nodes.filter(node => node.ownerType === 'board');
    const groundPins = boardPins.filter(node => node.electricalType === 'ground');
    const powerPins = boardPins.filter(node => node.electricalType === 'power');
    const actualPositiveVoltages = Array.from(
      new Set(
        powerPins
          .map(pin => pin.pinId === '3.3V' ? 3.3 : 5)
      )
    );

    if (groundPins.length > 0 && actualPositiveVoltages.length > 0) {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'netlist.power-short.direct',
        params: {
          netId: net.id,
          voltages: actualPositiveVoltages.map(value => `${value}V`),
        },
        ruleId: 'netlist.power-short.direct',
        visualTargets: {
          netIds: [net.id],
        },
        confidence: 'confirmed',
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: `넷 ${net.id}에서 GND와 ${actualPositiveVoltages.map(value => `${value}V`).join(', ')} 전원 레일이 직접 같은 저임피던스 묶음으로 연결된 것으로 보입니다.`,
          observedFacts: [
            `Affected net: ${net.id}`,
            `Ground nodes found: ${groundPins.map(pin => pin.pinId).join(', ')}`,
            `Power nodes found: ${powerPins.map(pin => pin.pinId).join(', ')}`,
          ],
          assumptions: [],
          checkedBy: ['netlist'],
          affectedNets: [net.id],
          howToVerify: '의도된 보호소자나 센스 저항 없이 전원과 GND가 같은 넷으로 묶였는지 회로도와 net 연결을 다시 확인하세요.',
        },
      }));
      continue;
    }

    if (actualPositiveVoltages.length > 1) {
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.power-rail-conflict',
        params: {
          netId: net.id,
          voltages: actualPositiveVoltages.map(value => `${value}V`),
        },
        ruleId: 'netlist.power-rail-conflict',
      }));
    }
  }

  return issues;
}

function describeNetForPath(net: CircuitNet) {
  const preferredBoardNode = net.nodes.find(node => node.ownerType === 'board');
  if (preferredBoardNode) {
    return preferredBoardNode.pinId;
  }

  const preferredComponentNode = net.nodes.find(node => node.ownerType === 'component');
  if (preferredComponentNode) {
    return preferredComponentNode.pinId;
  }

  return net.id;
}

function getRailVoltagesOnNet(net: CircuitNet) {
  const voltages = new Set<number>();
  let hasGround = false;

  for (const node of net.nodes) {
    if (node.ownerType !== 'board') {
      continue;
    }

    if (node.electricalType === 'ground') {
      hasGround = true;
      continue;
    }

    if (node.electricalType === 'power') {
      voltages.add(node.pinId === '3.3V' ? 3.3 : 5);
    }
  }

  return {
    hasGround,
    positiveVoltages: Array.from(voltages.values()).sort((left, right) => left - right),
  };
}

function buildLowImpedanceAdjacency(links: CircuitLowImpedanceLink[]) {
  const adjacency = new Map<string, Array<{ otherNetId: string; link: CircuitLowImpedanceLink }>>();

  for (const link of links) {
    const left = adjacency.get(link.netA) ?? [];
    left.push({ otherNetId: link.netB, link });
    adjacency.set(link.netA, left);

    const right = adjacency.get(link.netB) ?? [];
    right.push({ otherNetId: link.netA, link });
    adjacency.set(link.netB, right);
  }

  return adjacency;
}

function buildLowImpedanceNetResolver(nets: CircuitNet[], links: CircuitLowImpedanceLink[]) {
  const unionFind = new UnionFind();

  for (const net of nets) {
    unionFind.add(net.id);
  }

  for (const link of links) {
    unionFind.union(link.netA, link.netB);
  }

  return {
    getVirtualNetId(netId: string) {
      return unionFind.find(netId);
    },
  };
}

function findLowestImpedancePath(
  startNetId: string,
  targetNetId: string,
  links: CircuitLowImpedanceLink[]
) {
  if (startNetId === targetNetId) {
    return [];
  }

  const adjacency = buildLowImpedanceAdjacency(links);
  const queue: string[] = [startNetId];
  const visited = new Set([startNetId]);
  const previous = new Map<string, { netId: string; link: CircuitLowImpedanceLink }>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.otherNetId)) {
        continue;
      }

      visited.add(edge.otherNetId);
      previous.set(edge.otherNetId, { netId: current, link: edge.link });
      if (edge.otherNetId === targetNetId) {
        const path: CircuitLowImpedanceLink[] = [];
        let cursor = targetNetId;
        while (cursor !== startNetId) {
          const step = previous.get(cursor);
          if (!step) {
            break;
          }
          path.unshift(step.link);
          cursor = step.netId;
        }
        return path;
      }
      queue.push(edge.otherNetId);
    }
  }

  return null;
}

function formatShortTrace(params: {
  path: CircuitLowImpedanceLink[];
  startNet: CircuitNet;
  endNet: CircuitNet;
  netById: Map<string, CircuitNet>;
}) {
  const { path, startNet, endNet, netById } = params;
  if (path.length === 0) {
    return `${describeNetForPath(startNet)} -> ${describeNetForPath(endNet)}`;
  }

  const parts = [describeNetForPath(startNet)];
  let currentNetId = startNet.id;

  for (const link of path) {
    parts.push(`${link.componentName} (${link.kind === 'resistor' ? `${link.impedanceOhms.toFixed(link.impedanceOhms < 1 ? 2 : 0)}Ω` : 'inductor'})`);
    currentNetId = link.netA === currentNetId ? link.netB : link.netA;
    const nextNet = netById.get(currentNetId);
    if (nextNet && currentNetId !== endNet.id) {
      parts.push(describeNetForPath(nextNet));
    }
  }

  parts.push(describeNetForPath(endNet));
  return parts.join(' -> ');
}

function buildLowImpedancePowerIssues(
  nets: CircuitNet[],
  links: CircuitLowImpedanceLink[]
) {
  const issues: ProjectAuditIssue[] = [];
  if (links.length === 0) {
    return issues;
  }

  const resolver = buildLowImpedanceNetResolver(nets, links);
  const netById = new Map(nets.map(net => [net.id, net]));

  const groups = new Map<string, CircuitNet[]>();
  for (const net of nets) {
    const root = resolver.getVirtualNetId(net.id);
    const current = groups.get(root) ?? [];
    current.push(net);
    groups.set(root, current);
  }

  for (const group of groups.values()) {
    const grounded = group.filter(net => getRailVoltagesOnNet(net).hasGround);
    const powered = group.flatMap(net => {
      const rail = getRailVoltagesOnNet(net);
      return rail.positiveVoltages.map(voltage => ({ net, voltage }));
    });

    if (grounded.length > 0 && powered.length > 0) {
      const groundNet = grounded[0];
      const powerRef = powered[0];
      const path = findLowestImpedancePath(powerRef.net.id, groundNet.id, links);
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.power-short.trace',
        ruleId: 'netlist.power-short.trace',
        title: '전원과 GND 사이의 저임피던스 합선 경로',
        message:
          path && path.length > 0
            ? `${powerRef.voltage}V 전원과 GND가 저임피던스 경로로 사실상 합선되어 있습니다. 경로: ${formatShortTrace({ path, startNet: powerRef.net, endNet: groundNet, netById })}`
            : `${powerRef.voltage}V 전원과 GND가 같은 저임피던스 묶음 안에 있어 사실상 합선입니다.`,
        recommendation: '0옴 저항, 인덕터, 페라이트 비드, 잘못 닫힌 링크 중 어떤 부품이 전원과 GND를 이어 주는지 확인하고 해당 경로를 끊어 주세요.',
        visualTargets: {
          componentIds: Array.from(new Set((path ?? []).map(link => link.componentId).filter(Boolean))),
          netIds: [powerRef.net.id, groundNet.id],
        },
      }));
      continue;
    }

    const distinctVoltages = Array.from(
      new Set(powered.map(item => item.voltage))
    ).sort((left, right) => left - right);

    if (distinctVoltages.length > 1) {
      const start = powered.find(item => item.voltage === distinctVoltages[0]);
      const end = powered.find(item => item.voltage === distinctVoltages[distinctVoltages.length - 1]);
      const path =
        start && end
          ? findLowestImpedancePath(start.net.id, end.net.id, links)
          : null;

      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.power-rail-conflict.trace',
        ruleId: 'netlist.power-rail-conflict.trace',
        title: '서로 다른 전원 레일이 저임피던스 경로로 충돌합니다',
        message:
          start && end && path && path.length > 0
            ? `${distinctVoltages.map(value => `${value}V`).join('와 ')} 레일이 사실상 같은 전기적 묶음입니다. 경로: ${formatShortTrace({ path, startNet: start.net, endNet: end.net, netById })}`
            : `${distinctVoltages.map(value => `${value}V`).join('와 ')} 레일이 저임피던스 링크 때문에 같은 묶음으로 합쳐져 있습니다.`,
        recommendation: '전압이 다른 레일 사이에는 0옴 링크나 인덕터가 그대로 이어지지 않도록 경로를 분리하거나 전원 분기 의도를 다시 확인해 주세요.',
        visualTargets: {
          componentIds: Array.from(new Set((path ?? []).map(link => link.componentId).filter(Boolean))),
          netIds: [start?.net.id, end?.net.id].filter((value): value is string => Boolean(value)),
        },
      }));
    }
  }

  return issues;
}

function getNetPullupResistors(
  targetNetId: string,
  nets: CircuitNet[],
  resistors: CircuitResistorElement[]
) {
  const netById = new Map(nets.map(net => [net.id, net]));
  const pullups: Array<{ resistor: CircuitResistorElement; voltage: number }> = [];

  for (const resistor of resistors) {
    const peerNetId =
      resistor.netA === targetNetId ? resistor.netB :
      resistor.netB === targetNetId ? resistor.netA :
      null;
    if (!peerNetId) {
      continue;
    }

    const peerNet = netById.get(peerNetId);
    if (!peerNet) {
      continue;
    }

    const railInfo = getRailVoltagesOnNet(peerNet);
    if (railInfo.positiveVoltages.length === 0) {
      continue;
    }

    for (const voltage of railInfo.positiveVoltages) {
      pullups.push({ resistor, voltage });
    }
  }

  return pullups;
}

function getEquivalentResistanceOhms(resistors: CircuitResistorElement[]) {
  if (resistors.length === 0) {
    return null;
  }

  const inverseSum = resistors.reduce((sum, resistor) => {
    if (!Number.isFinite(resistor.resistanceOhms) || resistor.resistanceOhms <= 0) {
      return sum;
    }
    return sum + 1 / resistor.resistanceOhms;
  }, 0);

  if (!Number.isFinite(inverseSum) || inverseSum <= 0) {
    return null;
  }

  return 1 / inverseSum;
}

function getI2cBusPairs(
  nets: CircuitNet[],
  components: PlacedComponent[],
  netIdByNodeKey: Map<string, string>,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const pairs = new Map<string, { sdaNetId: string; sclNetId: string; deviceNames: string[]; devices: Array<{ component: PlacedComponent; template: ComponentTemplate }> }>();

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const sdaPin = template.requiredPins.find(pin => pin.name.toUpperCase() === 'SDA');
    const sclPin = template.requiredPins.find(pin => pin.name.toUpperCase() === 'SCL');
    if (!sdaPin || !sclPin) {
      continue;
    }

    const sdaNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, sdaPin.name));
    const sclNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, sclPin.name));
    if (!sdaNetId || !sclNetId) {
      continue;
    }

    const key = `${sdaNetId}::${sclNetId}`;
    const current = pairs.get(key) ?? { sdaNetId, sclNetId, deviceNames: [], devices: [] };
    current.deviceNames.push(component.name);
    current.devices.push({ component, template });
    pairs.set(key, current);
  }

  return Array.from(pairs.values()).filter(pair => pair.devices.length > 0);
}

function buildI2cBusIntegrityIssues(
  nets: CircuitNet[],
  resistors: CircuitResistorElement[],
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>
) {
  const issues: ProjectAuditIssue[] = [];
  const busPairs = getI2cBusPairs(nets, components, netIdByNodeKey, resolveTemplate);
  const netById = new Map(nets.map(net => [net.id, net]));
  const board = getBoardById(boardId);

  for (const pair of busPairs) {
    const sdaPullups = getNetPullupResistors(pair.sdaNetId, nets, resistors);
    const sclPullups = getNetPullupResistors(pair.sclNetId, nets, resistors);
    const sdaEq = getEquivalentResistanceOhms(sdaPullups.map(item => item.resistor));
    const sclEq = getEquivalentResistanceOhms(sclPullups.map(item => item.resistor));
    const names = Array.from(new Set(pair.deviceNames));
    const sdaNet = netById.get(pair.sdaNetId);
    const sclNet = netById.get(pair.sclNetId);

    if (!sdaNet || !sclNet) {
      continue;
    }

    if (sdaPullups.length === 0 || sclPullups.length === 0) {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'bus.i2c-impedance-voltage.missing-pullup',
        ruleId: 'bus.i2c-impedance-voltage',
        title: 'I2C 버스 풀업 저항 누락',
        message: `${names.join(', ')} I2C 버스에서 ${sdaPullups.length === 0 ? 'SDA' : ''}${sdaPullups.length === 0 && sclPullups.length === 0 ? ' / ' : ''}${sclPullups.length === 0 ? 'SCL' : ''} 라인에 외부 풀업 저항이 보이지 않습니다.`,
        recommendation: 'SDA와 SCL 각각이 전원 레일로 4.7kΩ~10kΩ 수준의 풀업을 가지도록 배치해 주세요.',
        visualTargets: {
          componentIds: pair.devices.map(item => item.component.instanceId),
          netIds: [pair.sdaNetId, pair.sclNetId],
        },
        confidence: 'strong-inference',
        evidence: {
          confidence: 'strong-inference',
          evidenceSummary: `${names.join(', ')}가 연결된 I2C 버스에서 ${sdaPullups.length === 0 ? 'SDA' : ''}${sdaPullups.length === 0 && sclPullups.length === 0 ? '와 ' : ''}${sclPullups.length === 0 ? 'SCL' : ''} 라인의 외부 풀업이 확인되지 않았습니다.`,
          observedFacts: [
            `Detected I2C device set: ${names.join(', ')}`,
            `SDA pull-up count: ${sdaPullups.length}`,
            `SCL pull-up count: ${sclPullups.length}`,
            `Reviewed nets: ${pair.sdaNetId}, ${pair.sclNetId}`,
          ],
          assumptions: [
            '모듈 내부에 이미 풀업 저항이 포함된 SKU는 현재 netlist만으로 완전히 판별되지 않을 수 있습니다.',
          ],
          checkedBy: ['netlist'],
          affectedComponents: pair.devices.map(item => item.component.instanceId),
          affectedNets: [pair.sdaNetId, pair.sclNetId],
          howToVerify: '센서/보드 모듈에 온보드 풀업이 있는지 SKU 기준으로 먼저 확인하고, 없으면 SDA/SCL을 전원 레일로 4.7kΩ~10kΩ 수준으로 당겨 주세요.',
        },
      }));
    }

    const eqCandidates = [
      { line: 'SDA', eq: sdaEq, pullups: sdaPullups },
      { line: 'SCL', eq: sclEq, pullups: sclPullups },
    ];

    for (const candidate of eqCandidates) {
      if (candidate.eq == null) {
        continue;
      }

      if (candidate.eq > 10_000) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'bus.i2c-impedance-voltage.pullup-too-weak',
          ruleId: 'bus.i2c-impedance-voltage',
          title: 'I2C 풀업 임피던스가 너무 큽니다',
          message: `${candidate.line} 라인의 합성 풀업 저항이 약 ${Math.round(candidate.eq)}Ω로 계산됩니다. 상승 시간이 느려져 고속 통신이 불안정할 수 있습니다.`,
          recommendation: '병렬 풀업을 정리해 4.7kΩ~10kΩ 범위에 가깝게 맞추는 편이 안전합니다.',
          visualTargets: {
            componentIds: Array.from(new Set([
              ...pair.devices.map(item => item.component.instanceId),
              ...candidate.pullups.map(item => item.resistor.componentId),
            ])),
            netIds: [candidate.line === 'SDA' ? pair.sdaNetId : pair.sclNetId],
          },
        }));
      } else if (candidate.eq < 1_000) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'bus.i2c-impedance-voltage.pullup-too-strong',
          ruleId: 'bus.i2c-impedance-voltage',
          title: 'I2C 풀업 임피던스가 너무 낮습니다',
          message: `${candidate.line} 라인의 합성 풀업 저항이 약 ${Math.round(candidate.eq)}Ω로 계산됩니다. 버스 Low 구간에서 전류 소모가 과도할 수 있습니다.`,
          recommendation: '중복 풀업을 줄여 합성 저항이 1kΩ 아래로 내려가지 않도록 정리해 주세요.',
          visualTargets: {
            componentIds: Array.from(new Set([
              ...pair.devices.map(item => item.component.instanceId),
              ...candidate.pullups.map(item => item.resistor.componentId),
            ])),
            netIds: [candidate.line === 'SDA' ? pair.sdaNetId : pair.sclNetId],
          },
        }));
      }
    }

    const pullupVoltages = Array.from(
      new Set([...sdaPullups, ...sclPullups].map(item => item.voltage))
    ).sort((left, right) => left - right);

    if (pullupVoltages.length > 0) {
      const maxPullupVoltage = pullupVoltages[pullupVoltages.length - 1];
      const boardNetNodes = [...sdaNet.nodes, ...sclNet.nodes].filter(node => node.ownerType === 'board');
      const boardMaxSafe = boardNetNodes.reduce((min, node) => {
        const spec = getBoardSignalLimits(board.id, node.pinId);
        if (!spec || spec.isGround || spec.isPower) {
          return min;
        }
        return Math.min(min, spec.maxSafe);
      }, Number.POSITIVE_INFINITY);
      const deviceMaxSafe = pair.devices.reduce((min, item) => {
        if (item.template.compatibleVoltage === '3.3V') {
          return Math.min(min, 3.6);
        }
        return Math.min(min, 5.5);
      }, Number.POSITIVE_INFINITY);
      const safeLimit = Math.min(boardMaxSafe, deviceMaxSafe);

      if (Number.isFinite(safeLimit) && maxPullupVoltage > safeLimit + 1e-6) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'bus.i2c-impedance-voltage.level-mismatch',
          ruleId: 'bus.i2c-impedance-voltage',
          title: 'I2C 풀업 전압이 버스 전압 도메인과 맞지 않습니다',
          message: `I2C 풀업이 ${pullupVoltages.map(value => `${value}V`).join(', ')} 레일에 묶여 있는데, 연결된 보드/소자 중 일부는 ${safeLimit.toFixed(1)}V 이하를 기대합니다.`,
          recommendation: '3.3V 장치가 포함된 버스라면 풀업 전압을 낮추거나 레벨 시프터로 전압 도메인을 분리해 주세요.',
          visualTargets: {
            componentIds: Array.from(new Set([
              ...pair.devices.map(item => item.component.instanceId),
              ...sdaPullups.map(item => item.resistor.componentId),
              ...sclPullups.map(item => item.resistor.componentId),
            ])),
            netIds: [pair.sdaNetId, pair.sclNetId],
          },
        }));
      }
    }
  }

  return issues;
}

function buildImportedPinNumberMap(component: PlacedComponent) {
  const map = new Map<string, string>();
  for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
    const resolvedPadNumber = component.footprintPinPadOverrides?.[anchor.pinId] ?? anchor.number;
    const keys = [
      anchor.pinId,
      anchor.label,
      anchor.label.replace(/^~\{?/, '').replace(/\}?$/, ''),
    ]
      .map(value => value.trim())
      .filter(Boolean);

    for (const key of keys) {
      if (!map.has(key)) {
        map.set(key, resolvedPadNumber);
      }
      const normalized = normalizeImportedPinRole(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, resolvedPadNumber);
      }
    }
  }
  return map;
}

function buildImportedPinRoleTargetMap(component: PlacedComponent) {
  const map = new Map<string, string>();
  for (const anchor of component.importedGeometry?.pinAnchors ?? []) {
    const actualPinId = anchor.pinId.trim();
    if (!actualPinId) {
      continue;
    }

    const keys = [
      anchor.pinId,
      anchor.label,
      anchor.label.replace(/^~\{?/, '').replace(/\}?$/, ''),
    ]
      .map(value => value.trim())
      .filter(Boolean);

    for (const key of keys) {
      const normalized = normalizeImportedPinRole(key);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, actualPinId);
      }
    }
  }
  return map;
}

type PinoutRule = {
  id:
    | 'diode'
    | 'bjt'
    | 'mosfet'
    | 'regulator'
    | 'adjustable_regulator'
    | 'driver'
    | 'driver_array_7'
    | 'driver_array_8'
    | 'gate_driver'
    | 'bridge_driver'
    | 'stepper_driver_carrier'
    | 'opamp'
    | 'audio_amp';
  title: string;
  expectedPinMap: Record<string, string>;
  templateIds: string[];
  hintPatterns: RegExp[];
  requiredRoles: string[];
  priority?: number;
};

const PINOUT_RULES: PinoutRule[] = [
  {
    id: 'diode',
    title: '다이오드',
    expectedPinMap: { A: '2', K: '1' },
    templateIds: ['tpl_diode'],
    hintPatterns: [/\bdiode\b/i, /\bled\b/i, /\b1n\d+/i],
    requiredRoles: ['A', 'K'],
  },
  {
    id: 'bjt',
    title: 'BJT',
    expectedPinMap: { B: '1', C: '2', E: '3' },
    templateIds: ['tpl_transistor_npn'],
    hintPatterns: [/\btransistor\b/i, /\bbjt\b/i, /\b2n\d+/i, /\bbc\d+/i],
    requiredRoles: ['B', 'C', 'E'],
  },
  {
    id: 'mosfet',
    title: 'MOSFET',
    expectedPinMap: { G: '1', D: '2', S: '3' },
    templateIds: ['tpl_mosfet', 'tpl_mosfet_n', 'tpl_mosfet_p'],
    hintPatterns: [/\bmosfet\b/i, /\bfet\b/i, /\bnmos\b/i, /\bpmos\b/i, /\birlz/i, /\birf/i],
    requiredRoles: ['G', 'D', 'S'],
  },
  {
    id: 'regulator',
    title: 'LDO/레귤레이터',
    expectedPinMap: { VIN: '1', GND: '2', VOUT: '3' },
    templateIds: ['tpl_ldo', 'tpl_ldo_regulator', 'tpl_regulator', 'tpl_linear_regulator'],
    hintPatterns: [/\bldo\b/i, /\bregulator\b/i, /\bams1117\b/i, /\b1117\b/i, /\b7805\b/i, /\b78m\d+/i, /\b78l\d+/i, /\blm78/i],
    requiredRoles: ['VIN', 'GND', 'VOUT'],
  },
  {
    id: 'adjustable_regulator',
    title: '가변 레귤레이터',
    expectedPinMap: { ADJ: '1', VOUT: '2', VIN: '3' },
    templateIds: ['tpl_ldo', 'tpl_ldo_regulator', 'tpl_regulator', 'tpl_linear_regulator'],
    hintPatterns: [/\blm317\b/i, /\blm337\b/i, /\blt1085\b/i],
    requiredRoles: ['ADJ', 'VOUT', 'VIN'],
    priority: 20,
  },
  {
    id: 'driver_array_7',
    title: '7채널 드라이버 어레이',
    expectedPinMap: { IN: '1', GND: '8', COM: '9', OUT: '16' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [/\buln200[34]a?\b/i],
    requiredRoles: ['IN', 'OUT'],
    priority: 28,
  },
  {
    id: 'driver_array_8',
    title: '8채널 드라이버 어레이',
    expectedPinMap: { IN: '1', GND: '9', COM: '10', OUT: '18' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [/\buln28(?:03|04)a?\b/i],
    requiredRoles: ['IN', 'OUT'],
    priority: 30,
  },
  {
    id: 'gate_driver',
    title: '게이트 드라이버 IC',
    expectedPinMap: { VCC: '3', IN: '2', OUT: '7', GND: '5' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [/\bir210\d+\b/i, /\bir211\d+\b/i, /\bir218\d+\b/i, /\bgate\s*driver\b/i],
    requiredRoles: ['IN', 'OUT', 'GND', 'VCC'],
    priority: 25,
  },
  {
    id: 'bridge_driver',
    title: '브리지 모터 드라이버',
    expectedPinMap: { OUT: '2', VIN: '4', IN: '5', EN: '6', GND: '8', VCC: '9' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [
      /\bl298n?\b/i,
      /\bh[-\s]?bridge\b/i,
      /\bbridge\s*driver\b/i,
      /\btb6612\w*\b/i,
      /\bdrv8833\b/i,
      /\bdrv8871\b/i,
      /\bdrv8876\b/i,
      /\bdrv88\d+\b/i,
    ],
    requiredRoles: ['IN', 'OUT', 'GND'],
    priority: 24,
  },
  {
    id: 'stepper_driver_carrier',
    title: '스테퍼 드라이버 캐리어',
    expectedPinMap: { EN: '1', RESET: '5', STEP: '7', DIR: '8', GND: '9', VCC: '10', OUT: '11', VIN: '16' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [
      /\ba4988\b/i,
      /\bdrv8825\b/i,
      /\btb6600\b/i,
      /\btb66\d+\b/i,
      /\btb67s109\b/i,
      /\btb67\w*\b/i,
      /\bstepper\s*driver\b/i,
    ],
    requiredRoles: ['STEP', 'DIR', 'GND'],
    priority: 26,
  },
  {
    id: 'driver',
    title: '드라이버 IC',
    expectedPinMap: { IN: '1', GND: '8', VCC: '9', OUT: '16' },
    templateIds: ['tpl_driver_ic'],
    hintPatterns: [/\bdriver\b/i],
    requiredRoles: ['IN', 'GND', 'VCC', 'OUT'],
  },
  {
    id: 'opamp',
    title: 'OP-Amp 버퍼',
    expectedPinMap: { OUT: '1', IN: '3', GND: '4', VCC: '8' },
    templateIds: ['tpl_op_amp_buffer'],
    hintPatterns: [/\blm358\b/i, /\bopamp\b/i, /\bop-amp\b/i, /\bbuffer\b/i],
    requiredRoles: ['IN', 'OUT', 'GND', 'VCC'],
  },
  {
    id: 'audio_amp',
    title: '오디오 앰프',
    expectedPinMap: { IN: '3', GND: '4', OUT: '5', VCC: '6' },
    templateIds: ['tpl_audio_amp'],
    hintPatterns: [/\blm386\b/i, /\baudio\b/i, /\bamplifier\b/i, /\btpa\d+\b/i, /\bpam\d+\b/i, /\btda\d+\b/i],
    requiredRoles: ['IN', 'GND', 'OUT', 'VCC'],
    priority: 20,
  },
];

function normalizeImportedPinRole(value: string) {
  const normalized = value
    .trim()
    .replace(/^~\{?/, '')
    .replace(/\}?$/, '')
    .replace(/[\s_\-\/()+]/g, '')
    .toUpperCase();

  if (!normalized) {
    return '';
  }

  switch (normalized) {
    case 'ANODE':
      return 'A';
    case 'CATHODE':
    case 'KATHODE':
      return 'K';
    case 'BASE':
      return 'B';
    case 'COLLECTOR':
      return 'C';
    case 'EMITTER':
      return 'E';
    case 'GATE':
      return 'G';
    case 'DRAIN':
      return 'D';
    case 'SOURCE':
      return 'S';
    case 'VI':
    case 'VIN':
      return 'VIN';
    case 'ADJ':
    case 'ADJUST':
      return 'ADJ';
    case 'FB':
    case 'FEEDBACK':
      return 'FB';
    case 'VO':
    case 'VOUT':
      return 'VOUT';
    case 'INPUT':
    case 'INPUTPIN':
    case 'HIN':
    case 'LIN':
    case 'AIN1':
    case 'AIN2':
    case 'BIN1':
    case 'BIN2':
    case 'IN1':
    case 'IN2':
    case 'IN3':
    case 'IN4':
      return 'IN';
    case 'OUTPUT':
    case 'OUTPUTPIN':
    case 'HO':
    case 'LO':
    case 'AO1':
    case 'AO2':
    case 'BO1':
    case 'BO2':
    case 'AO':
    case 'BO':
      return 'OUT';
    case 'STEP':
    case 'STP':
    case 'PUL':
    case 'PULSE':
      return 'STEP';
    case 'DIR':
    case 'CWCCW':
      return 'DIR';
    case 'RST':
    case 'RESET':
      return 'RESET';
    case 'SLEEP':
    case 'SLP':
    case 'NSLEEP':
    case 'ENA':
    case 'ENA1':
    case 'ENA2':
    case 'ENB':
    case 'PWMA':
    case 'PWMB':
    case 'STBY':
    case 'ENABLEINPUT':
      return 'EN';
    case 'GROUND':
    case 'PGND':
    case 'DGND':
    case 'AGND':
    case 'VSS':
    case 'VSSA':
    case 'VSSD':
      return 'GND';
    case 'ENABLE':
    case 'EN':
    case 'SHDN':
    case 'SHUTDOWN':
      return 'EN';
    case 'VDD':
    case 'VB':
      return 'VCC';
    case 'V+':
    case 'VPLUS':
      return 'VCC';
    case 'V-':
    case 'VMINUS':
      return 'GND';
    case 'VM':
    case 'VMOT':
    case 'VS':
      return 'VIN';
    default:
      if (/^(?:1A|1B|2A|2B|AOUT\d*|BOUT\d*|OUT\d+)$/.test(normalized)) {
        return 'OUT';
      }
      return normalized;
  }
}

function inferResistorPowerRatingW(component: PlacedComponent) {
  const analysisValue = getComponentAnalysisValue(component);
  const explicit = parsePowerRating(analysisValue ?? component.name).powerW;
  if (typeof explicit === 'number') {
    return explicit;
  }

  const footprintText = [
    component.importedMapping?.footprint,
    component.importedMapping?.libraryId,
    analysisValue,
    component.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/2512/.test(footprintText)) return 1;
  if (/2010/.test(footprintText)) return 0.75;
  if (/1210/.test(footprintText)) return 0.5;
  if (/1206|wide|axial/.test(footprintText)) return 0.25;
  if (/0805|2012metric/.test(footprintText)) return 0.125;
  if (/0603|1608metric/.test(footprintText)) return 0.1;
  if (/0402|1005metric/.test(footprintText)) return 0.063;
  if (/0201|0603metric/.test(footprintText)) return 0.05;

  return 0.125;
}

function getRecommendedResistorUsageRatio(resistor: CircuitResistorElement) {
  const text = `${resistor.componentName} ${resistor.id} ${resistor.value ?? ''} ${resistor.packageHint ?? ''}`.toLowerCase();
  if (/shunt|sense|current\s*sense|currentsense/.test(text)) {
    return 0.5;
  }
  if (/gate/.test(text)) {
    return 0.6;
  }
  if (/gate|snubber|bleeder|zobel/.test(text)) {
    return 0.7;
  }
  if (/pullup|pulldown|bias/.test(text)) {
    return 0.85;
  }
  if (/2512|2010|1210/.test(text)) {
    return 0.9;
  }
  if (/1206|axial|wide/.test(text)) {
    return 0.8;
  }
  if (/0603|0402|0201/.test(text)) {
    return 0.6;
  }
  return 0.75;
}

function getCapacitorHeadroomWarningRatio(capacitor: CircuitCapacitorElement) {
  const text = `${capacitor.componentName} ${capacitor.value ?? ''} ${capacitor.packageHint ?? ''}`.toLowerCase();
  if (/bootstrap|chargepump|snubber/.test(text)) {
    return 0.45;
  }
  if (/bulk|reservoir|input\s*cap|output\s*cap/.test(text)) {
    return 0.6;
  }
  if (/film|polypropylene|pp|polyester|pet/.test(text)) {
    return 0.7;
  }
  if (/electrolytic|aluminum|polar|탄탈|tantal|elco/.test(text)) {
    return 0.5;
  }
  if (/ceramic|mlcc|x7r|x5r|c0g|np0/.test(text)) {
    return 0.8;
  }
  return 0.75;
}

function getFlybackDiodeMarginGuidance(diode: CircuitDiodeElement) {
  const text = `${diode.componentName} ${diode.value ?? ''}`.toLowerCase();
  if (/\bss54\b|\bss56\b|\bsr54\b|\bsr56\b|\bmbrs340\b|\bmbrs360\b|\bsk54\b|\bsk56\b/.test(text)) {
    return {
      family: '중전류 쇼트키 다이오드',
      averageCurrentHint: '정격 평균 전류는 코일 정상전류의 2배 이상',
      surgeHint: 'IFSM과 VRRM을 함께 보고 반복 차단 서지와 역전압에 2배 이상 여유 확보',
    };
  }
  if (/\buf400[1-7]\b|\bfr10[1-7]\b|\bfr30[1-7]\b|\bher10[1-8]\b|\bmur1[1-6]0\b/.test(text)) {
    return {
      family: '고속 정류 다이오드',
      averageCurrentHint: '정격 평균 전류는 코일 정상전류의 1.5~2배 이상',
      surgeHint: 'IFSM, trr, VRRM을 함께 보고 반복 클램프 스트레스에 2배 이상 여유 확보',
    };
  }
  if (/\b1n58(17|18|19)\b|\bss14\b|\bss16\b|\bss24\b|\bss26\b|\bbat4[68]\b/.test(text)) {
    return {
      family: '소형 쇼트키 다이오드',
      averageCurrentHint: '정격 평균 전류는 코일 정상전류의 1.5배 이상',
      surgeHint: '서지 전류와 VRRM을 함께 보고 온도 상승 조건까지 확인',
    };
  }
  if (/\bmur\d+\b|\bmbr\d+\b|\bstth\d+\b|\bvs-.*\b/.test(text)) {
    return {
      family: '전력용 고속/쇼트키 다이오드',
      averageCurrentHint: '평균 전류 정격은 코일 정상전류의 2배 이상',
      surgeHint: 'IFSM/IFRM과 열저항을 함께 보고 반복 차단 서지에 2배 이상 여유 확보',
    };
  }
  if (/\b1n400[1-7]\b/.test(text)) {
    return {
      family: '범용 정류 다이오드',
      averageCurrentHint: '정격 평균 전류 1A급, 부하 정상전류의 1.5배 이상',
      surgeHint: 'IFSM과 VRRM을 함께 보고 코일 차단 서지에 2배 이상 여유 확보',
    };
  }
  if (/\b1n4148\b|\bll4148\b|\bbav\d+\b|\b1ss\d+\b/.test(text)) {
    return {
      family: '소신호 스위칭 다이오드',
      averageCurrentHint: '정격 평균 전류 0.15A~0.3A급, 코일 정상전류의 1/3 이하 용도',
      surgeHint: '반복 서지 여유 3배 이상, IFSM/IFRM 표 확인',
    };
  }
  if (/\bbat54\b|\bbs\d+\b|\bss1[24]\b|\b1n581[789]\b/.test(text)) {
    return {
      family: '쇼트키 다이오드',
      averageCurrentHint: '정격 평균 전류 1A 이상, 코일 정상전류의 1.5배 이상',
      surgeHint: '서지 전류 여유 2배 이상, 역전압 VRRM 표 확인',
    };
  }
  if (/\bsb\d+\b|\bsr\d+\b|\bsk\d+\b|\bss3[46]\b|\bmbrs\d+\b/.test(text)) {
    return {
      family: '전력용 쇼트키/배리어 다이오드',
      averageCurrentHint: '정격 평균 전류는 부하 정상전류의 2배 이상',
      surgeHint: 'VRRM, IFSM, 패키지 열저항을 함께 보고 반복 차단 서지에 2배 이상 여유 확보',
    };
  }
  if (/\bfr\d+\b|\buf\d+\b|\bfast\b|\bultrafast\b/.test(text)) {
    return {
      family: '고속 정류 다이오드',
      averageCurrentHint: '정격 평균 전류 1A 이상, 부하 정상전류의 1.5배 이상',
      surgeHint: '반복 피크 전류 여유 2배 이상, trr/IFRM 표 확인',
    };
  }
  if (/\btvs\b|\btransorb\b|\bsmbj?\d+\b|\bp6ke\d+\b/.test(text)) {
    return {
      family: 'TVS/서지 보호 다이오드',
      averageCurrentHint: '지속 전류용이 아니라면 코일 플라이백 전용 다이오드와 역할을 분리',
      surgeHint: 'PPP/IPP 서지 정격과 반복 클램프 에너지 항목을 확인하고, 연속 차단 전류 경로에는 일반 정류 다이오드를 추가 검토',
    };
  }
  return {
    family: '정류 다이오드',
    averageCurrentHint: '정격 평균 전류 1A 이상, 부하 정상전류의 1.5배 이상',
    surgeHint: '비반복 서지 전류 여유 2배 이상, IFSM/VRRM 표 확인',
  };
}

function getPowerInductorMarginGuidance(component: PlacedComponent) {
  const text = `${component.name} ${component.value ?? ''} ${component.importedMapping?.footprint ?? ''}`.toLowerCase();
  if (/automotive|aec-q|we-hci|xal\d+|ser2915|ser1360|ihlp-5050|ihlp-4040/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.8배 이상',
      rmsHint: 'Irms는 연속 전류의 1.4배 이상, DCR·온도상승 곡선·AEC-Q 조건을 함께 확인',
    };
  }
  if (/drum core|cd54|cd75|cd104|rh\d+|rch\d+|sdr\d+/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.45배 이상',
      rmsHint: 'Irms는 연속 전류의 1.2배 이상, 권선 온도상승과 DCR 허용치를 함께 확인',
    };
  }
  if (/shielded drum|semi[- ]shielded|wirewound power/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.5배 이상',
      rmsHint: 'Irms는 연속 전류의 1.25배 이상, 코어 온도 상승과 DCR 발열 곡선을 함께 확인',
    };
  }
  if (/toroid|toroidal|powdered iron|sendust/.test(text)) {
    return {
      currentHint: '포화 전류는 예상 피크 전류의 1.6배 이상',
      rmsHint: '연속 전류는 권장 정격의 75% 안쪽, 코어 손실 곡선 확인',
    };
  }
  if (/metal|alloy|composite|xal|ihlp|ser\d+/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.6배 이상',
      rmsHint: 'Irms는 연속 전류의 1.3배 이상, DCR과 온도 상승 곡선을 함께 확인',
    };
  }
  if (/flat wire|flatwire|planar|molded shielded|nr\d+|nrs\d+|xfl\d+/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.7배 이상',
      rmsHint: 'Irms는 연속 전류의 1.35배 이상, 온도상승 곡선과 코어 손실 표를 함께 확인',
    };
  }
  if (/shielded|molded|drum|cd\d+|power choke/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.5배 이상',
      rmsHint: 'Irms는 연속 전류의 1.25배 이상, DCR 발열 곡선 확인',
    };
  }
  if (/bead|ferrite/.test(text)) {
    return {
      currentHint: '정격 전류는 실제 부하 전류의 1.3~1.5배 이상',
      rmsHint: 'DC Bias와 임피던스 저하 구간, 온도 상승 곡선 확인',
    };
  }
  if (/radial|axial|through[- ]hole|tht/.test(text)) {
    return {
      currentHint: 'Isat는 예상 피크 전류의 1.4배 이상',
      rmsHint: 'Irms는 연속 전류의 1.2배 이상, 권선 온도 상승과 DCR 허용치를 함께 확인',
    };
  }
  return {
    currentHint: 'Isat는 예상 피크 전류의 1.5배 이상',
    rmsHint: 'Irms는 연속 전류의 1.3배 이상, 허용 온도 상승 곡선 확인',
  };
}

function inferPinoutRule(
  component: PlacedComponent,
  template: ComponentTemplate | undefined,
  templateMappings: Record<string, { pinMap?: Record<string, string>; footprint?: string }>
) {
  const resolveExpectedPinMap = (rule: PinoutRule, matchedTemplateId?: string) => {
    if (!matchedTemplateId) {
      return rule.expectedPinMap;
    }

    if (['driver_array_7', 'driver_array_8', 'gate_driver', 'bridge_driver', 'stepper_driver_carrier', 'audio_amp', 'adjustable_regulator'].includes(rule.id)) {
      return rule.expectedPinMap;
    }

    return templateMappings[matchedTemplateId]?.pinMap ?? rule.expectedPinMap;
  };

  const effectiveTemplateIds = new Set(
    [component.templateId, component.importedMapping?.templateId]
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value))
  );

  const hintText = [
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
    component.importedMapping?.matchedBy,
  ]
    .filter(Boolean)
    .join(' ');

  if (component.importedGeometry) {
    const normalizedRoles = new Set(
      component.importedGeometry.pinAnchors.flatMap(anchor => {
        const rawPin = anchor.pinId.trim().replace(/[\s_\-\/()+]/g, '').toUpperCase();
        const rawLabel = anchor.label.trim().replace(/[\s_\-\/()+]/g, '').toUpperCase();
        return [
          rawPin,
          rawLabel,
          normalizeImportedPinRole(anchor.pinId),
          normalizeImportedPinRole(anchor.label),
        ];
      }).filter(Boolean)
    );

    const matchedTemplateRules = PINOUT_RULES
      .map(rule => ({
        rule,
        matchedTemplateId: rule.templateIds.find(templateId => effectiveTemplateIds.has(templateId)),
      }))
      .filter(
        (candidate): candidate is { rule: PinoutRule; matchedTemplateId: string } =>
          Boolean(candidate.matchedTemplateId)
      );

    const stronglyHintedTemplateCandidates = matchedTemplateRules
      .map(({ rule, matchedTemplateId }) => {
        const matchedRoles = rule.requiredRoles.filter(role => normalizedRoles.has(role));
        const hasStrongHint = rule.hintPatterns.some(pattern => pattern.test(hintText));
        return {
          rule,
          matchedTemplateId,
          matchedRoleCount: matchedRoles.length,
          hasStrongHint,
        };
      })
      .filter(candidate => candidate.hasStrongHint && candidate.matchedRoleCount >= 2)
      .sort((a, b) => {
        if ((b.rule.priority ?? 0) !== (a.rule.priority ?? 0)) {
          return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
        }
        if (b.matchedRoleCount !== a.matchedRoleCount) {
          return b.matchedRoleCount - a.matchedRoleCount;
        }
        return b.rule.requiredRoles.length - a.rule.requiredRoles.length;
      });

    const stronglyHintedTemplateRule = stronglyHintedTemplateCandidates[0];

    if (stronglyHintedTemplateRule) {
      const { rule, matchedTemplateId } = stronglyHintedTemplateRule;
      const expectedPinMap = resolveExpectedPinMap(rule, matchedTemplateId);
      return {
        ...rule,
        expectedPinMap,
        rolesToCheck: Object.keys(expectedPinMap),
      };
    }

    for (const { rule, matchedTemplateId } of matchedTemplateRules) {
      const expectedPinMap = resolveExpectedPinMap(rule, matchedTemplateId);
      return {
        ...rule,
        expectedPinMap,
        rolesToCheck: (template?.requiredPins ?? [])
          .map(pin => normalizeImportedPinRole(pin.name))
          .filter(role => role && expectedPinMap[role]),
      };
    }

    for (const rule of PINOUT_RULES) {
      const hasRequiredRoles = rule.requiredRoles.every(role => normalizedRoles.has(role));
      if (!hasRequiredRoles) {
        continue;
      }

      const hasStrongHint = rule.hintPatterns.some(pattern => pattern.test(hintText));
      if (!hasStrongHint) {
        continue;
      }

      return {
        ...rule,
        rolesToCheck: rule.requiredRoles,
      };
    }
  }

  return null;
}

function buildPinoutMismatchIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined
) {
  const issues: ProjectAuditIssue[] = [];
  const templateMappings = (kicadMapper as {
    templates?: Record<string, { pinMap?: Record<string, string>; footprint?: string }>;
  }).templates ?? {};

  for (const component of components) {
    if (!component.importedGeometry) {
      continue;
    }

    const template = resolveTemplate(component.templateId);
    const rule = inferPinoutRule(component, template, templateMappings);
    if (!rule) {
      continue;
    }

    const expectedPinMap = rule.expectedPinMap;
    const actualPinMap = buildImportedPinNumberMap(component);
    const actualPinTargetMap = buildImportedPinRoleTargetMap(component);
    const rolesToCheck = Array.from(new Set(rule.rolesToCheck.length > 0 ? rule.rolesToCheck : Object.keys(expectedPinMap)));
    const mismatches = rolesToCheck.flatMap(role => {
      const actual = actualPinMap.get(role);
      const expected = expectedPinMap[role];
      if (!actual || !expected || actual === expected) {
        return [];
      }
      return [`${role}: 심볼 ${actual}번 / 기대 ${expected}번`];
    });

    if (mismatches.length === 0) {
      continue;
    }

    const footprint =
      component.importedMapping?.footprint ??
      templateMappings[component.templateId]?.footprint ??
      (component.importedMapping?.templateId ? templateMappings[component.importedMapping.templateId]?.footprint : undefined) ??
      template?.pcb?.footprint ??
      '알 수 없는 풋프린트';
    const variantDetail = inferPinoutVariantDetail(component, rule);

    issues.push(createProjectAuditIssue({
      severity: 'error',
      code: 'electrical.pinout-mismatch',
      ruleId: 'electrical.pinout-mismatch',
      title: '심볼 핀아웃과 풋프린트 기대 핀번호가 어긋납니다',
      message: `${component.name}의 ${rule.title} 핀 배치가 ${footprint} 기준 기대 핀아웃과 다릅니다. ${mismatches.join(', ')}.`,
      componentName: component.name,
      recommendation:
        variantDetail?.recommendation ??
        '풋프린트 핀 번호와 심볼 핀 번호를 다시 맞추거나, 같은 부품이라도 핀 순서가 다른 심볼/패키지 변형인지 먼저 확인해 주세요.',
      visualTargets: {
        componentIds: [component.instanceId],
        pinIds: rolesToCheck
          .map(role => actualPinTargetMap.get(role))
          .filter((pinId): pinId is string => Boolean(pinId))
          .map(pinId => `${component.instanceId}:${pinId}`),
      },
    }));
  }

  return issues;
}

function buildSolvedVoltageIssues(nets: CircuitNet[], boardId: string) {
  const issues: ProjectAuditIssue[] = [];

  for (const net of nets) {
    const voltage = net.knownVoltage ?? net.solvedVoltage;
    if (typeof voltage !== 'number') {
      continue;
    }

    for (const node of net.nodes) {
      if (node.ownerType !== 'board') {
        continue;
      }

      const spec = getBoardSignalLimits(boardId, node.pinId);
      if (!spec || spec.isGround || spec.isPower) {
        continue;
      }

      if (voltage > spec.maxSafe + 1e-6) {
        issues.push(createProjectAuditIssue({
          severity: 'error',
          code: 'netlist.gpio-overvoltage.solved',
          params: {
            boardPin: node.pinId,
            voltage: voltage.toFixed(2),
            boardName: getBoardById(boardId).name,
            maxSafe: spec.maxSafe,
          },
          ruleId: 'netlist.gpio-overvoltage.solved',
        }));
        continue;
      }

      if (spec.supportsAdc && voltage > spec.nominal + 1e-6) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'netlist.adc-over-range.solved',
          params: {
            boardPin: node.pinId,
            voltage: voltage.toFixed(2),
            boardName: getBoardById(boardId).name,
            nominalVoltage: spec.nominal,
          },
          ruleId: 'netlist.adc-over-range.solved',
        }));
      }
    }
  }

  return issues;
}

function buildDiodeIssues(
  diodes: CircuitDiodeElement[],
  nets: CircuitNet[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netMap = new Map(nets.map(net => [net.id, net]));

  for (const diode of diodes) {
    const netA = netMap.get(diode.netA);
    const netK = netMap.get(diode.netK);
    if (!netA || !netK) {
      continue;
    }

    const voltageA = netA.knownVoltage ?? netA.solvedVoltage;
    const voltageK = netK.knownVoltage ?? netK.solvedVoltage;

    if (typeof voltageA !== 'number' || typeof voltageK !== 'number') {
      continue;
    }

    const delta = voltageA - voltageK;

    if (delta <= -0.2) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.diode-reverse-bias',
        params: {
          componentName: diode.componentName,
        },
        componentName: diode.componentName,
        ruleId: 'netlist.diode-reverse-bias',
      }));
      continue;
    }

    if (delta >= 0.5) {
      issues.push(createProjectAuditIssue({
        severity: 'info',
        code: 'netlist.diode-forward-approximation',
        params: {
          componentName: diode.componentName,
        },
        componentName: diode.componentName,
        ruleId: 'netlist.diode-forward-approximation',
      }));
    }
  }

  return issues;
}

function getNetVoltageMap(nets: CircuitNet[]) {
  return new Map(nets.map(net => [net.id, net.knownVoltage ?? net.solvedVoltage]));
}

function getBoardPinsOnNet(nodes: CircuitNet['nodes']) {
  return nodes.filter(node => node.ownerType === 'board').map(node => node.pinId);
}

function findAdjacentResistors(netId: string, resistors: CircuitResistorElement[]) {
  return resistors.filter(resistor => resistor.netA === netId || resistor.netB === netId);
}

function buildLedIssues(
  leds: CircuitDiodeElement[],
  nets: CircuitNet[],
  resistors: CircuitResistorElement[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netMap = new Map(nets.map(net => [net.id, net]));
  const netVoltages = getNetVoltageMap(nets);

  for (const led of leds) {
    const signalNet = netMap.get(led.netA);
    const groundNet = netMap.get(led.netK);
    if (!signalNet || !groundNet) {
      continue;
    }

    const adjacentResistors = findAdjacentResistors(led.netA, resistors).filter(
      resistor => resistor.netA !== led.netK && resistor.netB !== led.netK
    );
    const signalBoardPins = getBoardPinsOnNet(signalNet.nodes);
    const signalVoltage = netVoltages.get(led.netA);
    const groundVoltage = netVoltages.get(led.netK);
    const voltageDelta =
      typeof signalVoltage === 'number' && typeof groundVoltage === 'number'
        ? signalVoltage - groundVoltage
        : null;

    if (adjacentResistors.length === 0 && (signalBoardPins.length > 0 || (voltageDelta != null && voltageDelta > 1))) {
      issues.push(createDrcIssue({
        severity: 'error',
        code: 'netlist.led-current-limit-missing',
        params: {
          componentName: led.componentName,
        },
        componentName: led.componentName,
        ruleId: 'netlist.led-current-limit-missing',
        visualTargets: {
          componentIds: [led.componentId],
          netIds: [led.netA, led.netK],
        },
        confidence: 'strong-inference',
        evidence: {
          confidence: 'strong-inference',
          evidenceSummary: `${led.componentName}가 직렬 전류 제한 저항 없이 전원 또는 GPIO 경로에 직접 연결된 것으로 보입니다.`,
          observedFacts: [
            `Affected component: ${led.componentName}`,
            `Adjacent series resistor count: ${adjacentResistors.length}`,
            `Connected board pins on signal net: ${signalBoardPins.join(', ') || 'none'}`,
            voltageDelta != null ? `Estimated LED forward path delta: ${voltageDelta.toFixed(2)}V` : 'Estimated LED forward path delta: unavailable',
          ],
          assumptions: [
            '현재 부품이 온보드 저항 포함 LED 모듈이 아니라 일반 LED로 분류된다는 가정을 사용합니다.',
          ],
          checkedBy: ['netlist'],
          affectedComponents: [led.componentId],
          affectedNets: [led.netA, led.netK],
          howToVerify: 'LED가 모듈형 보드라면 부품 타입을 모듈로 고정하고, 일반 LED라면 220Ω~330Ω 직렬 저항을 추가하세요.',
        },
      }));
      continue;
    }

    if (adjacentResistors.length === 0 || voltageDelta == null || voltageDelta <= 0) {
      continue;
    }

    const seriesResistance = adjacentResistors.reduce((min, resistor) => Math.min(min, resistor.resistanceOhms), Number.POSITIVE_INFINITY);
    if (!Number.isFinite(seriesResistance) || seriesResistance <= 0) {
      continue;
    }

    const forwardVoltage = led.forwardVoltageDrop ?? 2.0;
    const estimatedCurrentMa = adjacentResistors.reduce((bestCurrentMa, resistor) => {
      const otherNetId = resistor.netA === led.netA ? resistor.netB : resistor.netA;
      const otherVoltage = netVoltages.get(otherNetId);

      if (typeof otherVoltage !== 'number' || typeof groundVoltage !== 'number') {
        return bestCurrentMa;
      }

      const candidateCurrentMa =
        Math.max((otherVoltage - groundVoltage - forwardVoltage) / resistor.resistanceOhms, 0) * 1000;

      return Math.max(bestCurrentMa, candidateCurrentMa);
    }, Math.max((voltageDelta - forwardVoltage) / seriesResistance, 0) * 1000);

    if (estimatedCurrentMa < 5) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.led-current-too-low',
        params: {
          componentName: led.componentName,
          currentMa: estimatedCurrentMa.toFixed(2),
        },
        componentName: led.componentName,
        ruleId: 'netlist.led-current-too-low',
      }));
    }
  }

  return issues;
}

function getInductiveKindLabel(kind: InductiveLoadKind) {
  switch (kind) {
    case 'relay':
      return '릴레이 코일';
    case 'motor':
      return '모터';
    case 'solenoid':
      return '솔레노이드';
    case 'injector':
      return '인젝터';
    case 'coil':
    default:
      return '코일성 부하';
  }
}

function isSmallSignalDiodePart(diode: CircuitDiodeElement) {
  const text = `${diode.componentName} ${diode.value ?? ''}`.toLowerCase();
  return /\b1n4148\b|\bll4148\b|\bbav\d+\b|\b1ss\d+\b|\bswitching diode\b/.test(text);
}

function hasExplicitCurrentRatingText(value?: string) {
  if (!value) {
    return false;
  }
  return /\b\d+(?:\.\d+)?\s*a\b/i.test(value);
}

function describeEstimatedNetSpan(
  highNet: CircuitNet | undefined,
  lowNet: CircuitNet | undefined
) {
  if (!highNet || !lowNet) {
    return null;
  }
  const highVoltage = highNet.knownVoltage ?? highNet.solvedVoltage;
  const lowVoltage = lowNet.knownVoltage ?? lowNet.solvedVoltage;
  if (typeof highVoltage !== 'number' || typeof lowVoltage !== 'number') {
    return null;
  }
  const span = Math.abs(highVoltage - lowVoltage);
  return `추정 경로 전압은 약 ${span.toFixed(2)}V입니다.`;
}

function describeEstimatedCurrentFromText(
  valueText: string | undefined,
  highNet: CircuitNet | undefined,
  lowNet: CircuitNet | undefined
) {
  const explicitCurrentA = parseCurrentAmpsFromText(valueText);
  if (typeof explicitCurrentA === 'number') {
    return `예상 전류는 약 ${explicitCurrentA.toFixed(explicitCurrentA < 1 ? 2 : 1)}A급으로 읽힙니다.`;
  }

  const resistanceOhms = parseResistanceOhmsFromFreeText(valueText);
  const powerWatts = parsePowerWattsFromFreeText(valueText);
  const highVoltage = highNet?.knownVoltage ?? highNet?.solvedVoltage;
  const lowVoltage = lowNet?.knownVoltage ?? lowNet?.solvedVoltage;
  if (
    typeof resistanceOhms === 'number' &&
    typeof highVoltage === 'number' &&
    typeof lowVoltage === 'number' &&
    resistanceOhms > 0
  ) {
    const estimatedCurrentA = Math.abs(highVoltage - lowVoltage) / resistanceOhms;
    return `전압/저항 기준 예상 전류는 약 ${estimatedCurrentA.toFixed(estimatedCurrentA < 1 ? 2 : 1)}A급입니다.`;
  }

  if (
    typeof powerWatts === 'number' &&
    typeof highVoltage === 'number' &&
    typeof lowVoltage === 'number'
  ) {
    const voltageSpan = Math.abs(highVoltage - lowVoltage);
    if (voltageSpan > 0.05) {
      const estimatedCurrentA = powerWatts / voltageSpan;
      return `전력/전압 기준 예상 전류는 약 ${estimatedCurrentA.toFixed(estimatedCurrentA < 1 ? 2 : 1)}A급입니다.`;
    }
  }

  return null;
}

function buildInductiveFlybackIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>,
  diodes: CircuitDiodeElement[],
  nets: CircuitNet[],
  lowImpedanceLinks: CircuitLowImpedanceLink[]
) {
  const issues: ProjectAuditIssue[] = [];
  const lowImpedanceResolver = buildLowImpedanceNetResolver(nets, lowImpedanceLinks);
  const netById = new Map(nets.map(net => [net.id, net]));

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const inductiveProfile = getComponentKindByTemplate(component, template);
    if (!inductiveProfile) {
      continue;
    }

    if (inductiveProfile.protectionLevel === 'full') {
      continue;
    }

    if (inductiveProfile.protectionLevel === 'partial') {
      const partialProtectionHint =
        inductiveProfile.kind === 'motor'
          ? '드라이버 보드 내부 다이오드가 칩 내부 스위칭 소자만 보호하고, 외부 모터 단자/배선 루프까지는 완전히 덮지 못하는 경우가 많습니다.'
          : '부분 보호 회로가 있더라도 외부 부하 단자까지 동일한 보호 경로가 이어지는지 확인이 필요합니다.';
      issues.push(createProjectAuditIssue({
        severity: 'info',
        code: 'netlist.inductive-flyback-review',
        params: {
          componentName: component.name,
        },
        componentName: component.name,
        ruleId: 'netlist.inductive-flyback-review',
        title: '유도성 부하 보호 경로 수동 확인 권장',
        message: `${component.name} ${getInductiveKindLabel(inductiveProfile.kind)}은(는) 드라이버/모듈 형태라 일부 보호 회로가 있을 수 있지만, 외부 부하까지 포함한 플라이백 경로는 수동 확인이 필요합니다. ${partialProtectionHint}`,
        recommendation: '데이터시트나 모듈 회로도에서 OUTA/OUTB 또는 MOTOR+/MOTOR- 같은 실제 부하 단자, VM/VBAT 전원 입력, 그리고 스위칭 로우사이드 경로가 같은 보호 루프 안에 들어가는지 확인해 주세요.',
      }));
      continue;
    }

    const powerPin = template.requiredPins.find(pin =>
      pin.allowedTypes.includes('POWER') || /^(vcc|vin|v\+|coil\+|com)$/i.test(pin.name)
    )?.name;
    const lowPin = template.requiredPins.find(pin =>
      pin.allowedTypes.includes('GND') || /^(gnd|v-|coil-|return|drain)$/i.test(pin.name)
    )?.name;

    if (!powerPin || !lowPin) {
      continue;
    }

    const highNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, powerPin));
    const lowNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, lowPin));
    if (!highNetId || !lowNetId || highNetId === lowNetId) {
      continue;
    }
    const highNet = netById.get(highNetId);
    const lowNet = netById.get(lowNetId);
    const estimatedSpanText = describeEstimatedNetSpan(highNet, lowNet);
    const estimatedCurrentText = describeEstimatedCurrentFromText(`${component.value ?? ''} ${component.name}`, highNet, lowNet);

    const virtualHighNetId = lowImpedanceResolver.getVirtualNetId(highNetId);
    const virtualLowNetId = lowImpedanceResolver.getVirtualNetId(lowNetId);

    const correctFlyback = diodes.find(diode =>
      lowImpedanceResolver.getVirtualNetId(diode.netA) === virtualLowNetId &&
      lowImpedanceResolver.getVirtualNetId(diode.netK) === virtualHighNetId
    );
    if (correctFlyback) {
      if (isSmallSignalDiodePart(correctFlyback)) {
        const marginGuidance = getFlybackDiodeMarginGuidance(correctFlyback);
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'netlist.inductive-flyback-diode-headroom',
          params: {
            componentName: component.name,
            diodeName: correctFlyback.componentName,
          },
          componentName: component.name,
          ruleId: 'netlist.inductive-flyback-diode-headroom',
          title: '플라이백 다이오드 용량 여유 검토 권장',
          message: `${component.name} ${getInductiveKindLabel(inductiveProfile.kind)} 보호 경로에는 ${correctFlyback.componentName}가 연결되어 있지만, ${marginGuidance.family}로 보여 서지 전류 여유가 부족할 수 있습니다.${estimatedSpanText ? ` ${estimatedSpanText}` : ''}${estimatedCurrentText ? ` ${estimatedCurrentText}` : ''}`,
          recommendation: `데이터시트에서 ${marginGuidance.averageCurrentHint}, ${marginGuidance.surgeHint} 수준이 되는지 확인해 주세요. 릴레이/모터/솔레노이드라면 1N400x, SS14 같은 정류/쇼트키 계열로 올리는 편이 더 안전할 수 있습니다.`,
          visualTargets: {
            componentIds: [component.instanceId, correctFlyback.componentId],
            netIds: [highNetId, lowNetId],
          },
        }));
      }
      continue;
    }

    const reversedFlyback = diodes.find(diode =>
      lowImpedanceResolver.getVirtualNetId(diode.netA) === virtualHighNetId &&
      lowImpedanceResolver.getVirtualNetId(diode.netK) === virtualLowNetId
    );
    if (reversedFlyback) {
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.inductive-flyback-reversed',
        params: {
          componentName: component.name,
          diodeName: reversedFlyback.componentName,
        },
        componentName: component.name,
        ruleId: 'netlist.inductive-flyback-reversed',
        title: '유도성 부하 플라이백 다이오드 방향 반대',
        message: `${component.name} ${getInductiveKindLabel(inductiveProfile.kind)} 보호용으로 보이는 ${reversedFlyback.componentName}의 방향이 반대로 연결되어 역기전력 보호가 되지 않을 수 있습니다.${estimatedSpanText ? ` ${estimatedSpanText}` : ''}${estimatedCurrentText ? ` ${estimatedCurrentText}` : ''}`,
        recommendation: `${getInductiveKindLabel(inductiveProfile.kind)} 플라이백 다이오드는 애노드가 저전위 쪽, 캐소드가 고전위 쪽을 향하도록 역병렬로 배치하세요.`,
        visualTargets: {
          componentIds: [component.instanceId, reversedFlyback.componentId],
          netIds: [highNetId, lowNetId],
        },
      }));
      continue;
    }

    issues.push(createProjectAuditIssue({
      severity: 'warning',
      code: 'netlist.inductive-flyback-missing',
      params: {
        componentName: component.name,
      },
      componentName: component.name,
      ruleId: 'netlist.inductive-flyback-missing',
      title: '유도성 부하 플라이백 다이오드 미확인',
      message: `${component.name} ${getInductiveKindLabel(inductiveProfile.kind)} 양단에 역병렬 플라이백 다이오드를 아직 확인하지 못했습니다.${estimatedSpanText ? ` ${estimatedSpanText}` : ''}${estimatedCurrentText ? ` ${estimatedCurrentText}` : ''}`,
      recommendation: `${getInductiveKindLabel(inductiveProfile.kind)} 에는 역기전력 보호용 다이오드를 부하 양단에 추가하세요.`,
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: [highNetId, lowNetId],
      },
    }));
  }

  return issues;
}

function getComponentKindByTemplate(component: PlacedComponent, template: ComponentTemplate): InductiveProfile | null {
  const identity = `${component.name} ${component.value ?? ''} ${template.id} ${template.name} ${template.description}`.toLowerCase();
  if (template.id === 'tpl_relay' || /relay/.test(identity)) {
    return {
      family: 'inductive',
      kind: 'relay',
      protectionLevel: template.id === 'tpl_relay' || /module|board/.test(identity) ? 'full' : 'none',
    };
  }
  if (template.id === 'tpl_dc_motor' || /motor/.test(identity)) {
    return {
      family: 'inductive',
      kind: 'motor',
      protectionLevel: template.id === 'tpl_dc_motor' || /l298|tb6612|drv88|drv87|driver|module/.test(identity) ? 'partial' : 'none',
    };
  }
  if (/solenoid/.test(identity)) {
    return { family: 'inductive', kind: 'solenoid' };
  }
  if (/injector/.test(identity)) {
    return { family: 'inductive', kind: 'injector' };
  }
  if (/coil/.test(identity)) {
    return { family: 'inductive', kind: 'coil' };
  }

  return null;
}

function buildPowerInductorReviewIssues(
  components: PlacedComponent[],
  netIdByNodeKey: Map<string, string>,
  nets: CircuitNet[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netById = new Map(nets.map(net => [net.id, net]));

  for (const component of components) {
    if (component.templateId !== 'tpl_inductor') {
      continue;
    }

    const netAId = netIdByNodeKey.get(getComponentPinNodeKey(component, '1'));
    const netBId = netIdByNodeKey.get(getComponentPinNodeKey(component, '2'));
    if (!netAId || !netBId || netAId === netBId) {
      continue;
    }

    const netA = netById.get(netAId);
    const netB = netById.get(netBId);
    if (!netA || !netB) {
      continue;
    }
    const estimatedSpanText = describeEstimatedNetSpan(netA, netB);
    const estimatedCurrentText = describeEstimatedCurrentFromText(`${component.value ?? ''} ${component.name}`, netA, netB);

    const touchesPoweredNet = [netA, netB].some(net => {
      const rail = getRailVoltagesOnNet(net);
      return rail.positiveVoltages.length > 0 || net.sourceLabels.some(label => /vin|vbatt|batt|vmot|5v|3v3/i.test(label));
    });

    if (!touchesPoweredNet || hasExplicitCurrentRatingText(component.value)) {
      continue;
    }

    const marginGuidance = getPowerInductorMarginGuidance(component);

    issues.push(createProjectAuditIssue({
      severity: 'info',
      code: 'netlist.power-inductor-rating-review',
      params: {
        componentName: component.name,
      },
      componentName: component.name,
      ruleId: 'netlist.power-inductor-rating-review',
      title: '전원 경로 인덕터 정격 전류 확인 권장',
      message: `${component.name} 인덕터가 전원 경로에 들어가 있지만, 값 표기만으로는 포화 전류나 RMS 전류 정격을 확인하기 어렵습니다. 특히 실제 부하가 걸리는 VIN/VMOT/출력 단자 경로라면 장기 여유를 따로 확인해야 합니다.${estimatedSpanText ? ` ${estimatedSpanText}` : ''}${estimatedCurrentText ? ` ${estimatedCurrentText}` : ''}`,
      recommendation: `데이터시트에서 Isat(포화 전류), Irms(허용 RMS 전류), DCR 항목을 보고 ${marginGuidance.currentHint}, ${marginGuidance.rmsHint} 기준으로 충분한 여유가 있는지 확인해 주세요.`,
      visualTargets: {
        componentIds: [component.instanceId],
        netIds: [netAId, netBId],
      },
    }));
  }

  return issues;
}

function buildResistorPowerIssues(
  nets: CircuitNet[],
  resistors: CircuitResistorElement[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netMap = new Map(nets.map(net => [net.id, net]));

  for (const resistor of resistors) {
    const netA = netMap.get(resistor.netA);
    const netB = netMap.get(resistor.netB);
    if (!netA || !netB) {
      continue;
    }

    const voltageA = netA.knownVoltage ?? netA.solvedVoltage;
    const voltageB = netB.knownVoltage ?? netB.solvedVoltage;
    if (typeof voltageA !== 'number' || typeof voltageB !== 'number' || resistor.resistanceOhms <= 0) {
      continue;
    }

    const deltaV = Math.abs(voltageA - voltageB);
    const dissipationW = (deltaV * deltaV) / resistor.resistanceOhms;
    const ratedPowerW = resistor.powerRatingW ?? 0.125;
    const usageRatio = dissipationW / ratedPowerW;
    const recommendedUsageRatio = getRecommendedResistorUsageRatio(resistor);

    if (usageRatio > 1) {
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.resistor-overwatt',
        params: {
          componentName: resistor.componentName,
          powerW: dissipationW.toFixed(2),
          ratedPowerW: ratedPowerW.toFixed(3),
        },
        componentName: resistor.componentName,
        ruleId: 'netlist.resistor-overwatt',
        title: '저항 정격 전력 초과 위험',
        message: `${resistor.componentName}에 약 ${dissipationW.toFixed(2)}W가 걸리는 것으로 계산되는데, 현재 해석 기준 정격은 약 ${ratedPowerW.toFixed(3)}W입니다.`,
        recommendation: '이 경로는 이미 정격 초과로 보입니다. 저항 양단 전압과 실제 소모 전력을 다시 확인하고, 더 높은 와트 정격·더 큰 패키지·병렬 분산 중 하나로 바로 수정하세요.',
      }));
      continue;
    }

    if (usageRatio >= recommendedUsageRatio) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.resistor-low-headroom',
        params: {
          componentName: resistor.componentName,
          powerW: dissipationW.toFixed(2),
          ratedPowerW: ratedPowerW.toFixed(3),
        },
        componentName: resistor.componentName,
        ruleId: 'netlist.resistor-low-headroom',
        title: '저항 발열 여유 부족',
        message: `${resistor.componentName} 전력 소모가 약 ${dissipationW.toFixed(2)}W로 계산되어 절대 정격 ${ratedPowerW.toFixed(3)}W는 아직 넘지 않았지만, 권장 사용률 기준으로 보면 장기 발열 여유가 빠듯합니다.`,
        recommendation: '당장 정격 초과는 아니지만 장기 신뢰성이 부족할 수 있습니다. 실장 패키지, 환기/방열 조건, 권장 사용률을 보고 한 단계 높은 와트 정격으로 올릴지 검토하세요.',
      }));
    }
  }

  return issues;
}

function buildCapacitorVoltageIssues(
  nets: CircuitNet[],
  capacitors: CircuitCapacitorElement[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netMap = new Map(nets.map(net => [net.id, net]));

  for (const capacitor of capacitors) {
    if (typeof capacitor.voltageRatingV !== 'number') {
      continue;
    }

    const netA = netMap.get(capacitor.netA);
    const netB = netMap.get(capacitor.netB);
    if (!netA || !netB) {
      continue;
    }

    const voltageA = netA.knownVoltage ?? netA.solvedVoltage;
    const voltageB = netB.knownVoltage ?? netB.solvedVoltage;
    if (typeof voltageA !== 'number' || typeof voltageB !== 'number') {
      continue;
    }

    const deltaV = Math.abs(voltageA - voltageB);
    if (deltaV > capacitor.voltageRatingV) {
      issues.push(createProjectAuditIssue({
        severity: 'error',
        code: 'netlist.capacitor-overvoltage',
        params: {
          componentName: capacitor.componentName,
          appliedVoltage: deltaV.toFixed(2),
          ratedVoltage: capacitor.voltageRatingV,
        },
        componentName: capacitor.componentName,
        ruleId: 'netlist.capacitor-overvoltage',
        title: '커패시터 내압 초과 위험',
        message: `${capacitor.componentName} 양단 전압이 약 ${deltaV.toFixed(2)}V인데, 표기 내압은 ${capacitor.voltageRatingV}V입니다.`,
        recommendation: '이 부품은 이미 내압 초과로 보입니다. 양단 전압과 극성을 다시 확인하고, 더 높은 내압 등급이나 다른 부품 종류로 바로 교체하세요.',
      }));
      continue;
    }

    if (deltaV >= capacitor.voltageRatingV * getCapacitorHeadroomWarningRatio(capacitor)) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.capacitor-voltage-headroom',
        params: {
          componentName: capacitor.componentName,
          appliedVoltage: deltaV.toFixed(2),
          ratedVoltage: capacitor.voltageRatingV,
        },
        componentName: capacitor.componentName,
        ruleId: 'netlist.capacitor-voltage-headroom',
        title: '커패시터 내압 여유 부족',
        message: `${capacitor.componentName} 사용 전압이 약 ${deltaV.toFixed(2)}V로, 표기 내압 ${capacitor.voltageRatingV}V는 아직 넘지 않았지만 부품 종류별 권장 여유 기준으로 보면 마진이 크지 않습니다.`,
        recommendation: '당장 내압 초과는 아니지만 장기 신뢰성이 부족할 수 있습니다. 세라믹/전해/부트스트랩 용도에 맞는 권장 여유를 보고 한 단계 높은 전압 등급으로 올릴지 검토하세요.',
      }));
    }
  }

  return issues;
}

function buildRcFilterIssues(
  nets: CircuitNet[],
  resistors: CircuitResistorElement[],
  capacitors: CircuitCapacitorElement[]
) {
  const issues: ProjectAuditIssue[] = [];
  const netMap = new Map(nets.map(net => [net.id, net]));
  const PWM_FREQUENCY_HZ = 490;

  for (const resistor of resistors) {
    const netA = netMap.get(resistor.netA);
    const netB = netMap.get(resistor.netB);
    if (!netA || !netB) {
      continue;
    }

    const aHasPwmBoardPin = netA.nodes.some(node => node.ownerType === 'board' && node.boardPinTypes?.includes('PWM'));
    const bHasPwmBoardPin = netB.nodes.some(node => node.ownerType === 'board' && node.boardPinTypes?.includes('PWM'));
    if (aHasPwmBoardPin === bHasPwmBoardPin) {
      continue;
    }

    const outputNetId = aHasPwmBoardPin ? resistor.netB : resistor.netA;
    const outputNet = netMap.get(outputNetId);
    if (!outputNet) {
      continue;
    }

    const shuntCapacitor = capacitors.find(capacitor =>
      (capacitor.netA === outputNetId && netMap.get(capacitor.netB)?.nodes.some(node => node.ownerType === 'board' && node.pinId === 'GND')) ||
      (capacitor.netB === outputNetId && netMap.get(capacitor.netA)?.nodes.some(node => node.ownerType === 'board' && node.pinId === 'GND'))
    );

    if (!shuntCapacitor) {
      continue;
    }

    const cutoffHz = 1 / (2 * Math.PI * resistor.resistanceOhms * shuntCapacitor.capacitanceFarads);
    const severity = cutoffHz <= PWM_FREQUENCY_HZ / 10 ? 'info' : 'warning';
    const title = severity === 'info' ? 'PWM RC 필터 감쇄 양호' : 'PWM RC 필터 감쇄 부족';
    const recommendation =
      severity === 'info'
        ? '현재 조합은 PWM 리플을 꽤 잘 눌러주는 편입니다. 응답 속도와 리플 사이에서 필요한 수준인지 계속 확인하세요.'
        : '아날로그처럼 더 부드럽게 만들려면 R 또는 C 값을 키워 차단 주파수를 PWM 기본 주파수보다 충분히 낮추세요.';

    issues.push(createProjectAuditIssue({
      severity,
      code: severity === 'info' ? 'netlist.rc-filter-smoothing-ok' : 'netlist.rc-filter-smoothing-low',
      params: {
        resistorName: resistor.componentName,
        capacitorName: shuntCapacitor.componentName,
        cutoffHz: cutoffHz.toFixed(1),
        pwmFrequencyHz: PWM_FREQUENCY_HZ,
      },
      title,
      message: `${resistor.componentName} + ${shuntCapacitor.componentName} 조합의 RC 차단 주파수는 약 ${cutoffHz.toFixed(1)}Hz입니다. 기본 PWM ${PWM_FREQUENCY_HZ}Hz 대비 ${
        severity === 'info' ? '충분히 낮아' : '아직 높아'
      } 평활 성능을 점검해야 합니다.`,
      componentName: resistor.componentName,
      ruleId: severity === 'info' ? 'netlist.rc-filter-smoothing-ok' : 'netlist.rc-filter-smoothing-low',
      recommendation,
    }));
  }

  return issues;
}

type ResistorAdjacencyEdge = {
  otherNetId: string;
  resistanceOhms: number;
};

function buildResistorAdjacencyMap(resistors: CircuitResistorElement[]) {
  const adjacency = new Map<string, ResistorAdjacencyEdge[]>();

  for (const resistor of resistors) {
    const left = adjacency.get(resistor.netA) ?? [];
    left.push({ otherNetId: resistor.netB, resistanceOhms: resistor.resistanceOhms });
    adjacency.set(resistor.netA, left);

    const right = adjacency.get(resistor.netB) ?? [];
    right.push({ otherNetId: resistor.netA, resistanceOhms: resistor.resistanceOhms });
    adjacency.set(resistor.netB, right);
  }

  return adjacency;
}

function isLikelyAnalogBufferTemplate(template: ComponentTemplate) {
  const text = `${template.id} ${template.name} ${template.description}`.toLowerCase();
  return /(op[\s-]?amp|operational amplifier|buffer)/.test(text);
}

function isLikelyAnalogAmplifierTemplate(template: ComponentTemplate) {
  const text = `${template.id} ${template.name} ${template.description}`.toLowerCase();
  return /(op[\s-]?amp|operational amplifier|buffer|amplifier|audio amp|audio amplifier|preamp)/.test(text);
}

function isLikelyBufferOutputPin(pinName: string) {
  return /^(out|vout|aout|output|buffer[_-]?out)$/i.test(pinName);
}

function isLikelyBufferInputPin(pinName: string) {
  return /^(in|vin|ain|input|signal_in|buffer[_-]?in|\+in|-in)$/i.test(pinName);
}

function collectLowImpedanceSourceNetIds(
  nets: CircuitNet[],
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>
) {
  const sourceNetIds = new Set<string>();

  for (const net of nets) {
    if (typeof net.knownVoltage === 'number') {
      sourceNetIds.add(net.id);
    }
  }

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template || !isLikelyAnalogBufferTemplate(template)) {
      continue;
    }

    const hasInputPin = template.requiredPins.some(pin => isLikelyBufferInputPin(pin.name));
    if (!hasInputPin) {
      continue;
    }

    for (const pin of template.requiredPins) {
      if (!isLikelyBufferOutputPin(pin.name)) {
        continue;
      }

      const netId = netIdByNodeKey.get(getComponentPinNodeKey(component, pin.name));
      if (netId) {
        sourceNetIds.add(netId);
      }
    }
  }

  return sourceNetIds;
}

function estimateTheveninResistanceFromGraph(
  targetNetId: string,
  resistors: CircuitResistorElement[],
  sourceNetIds: Set<string>
) {
  if (sourceNetIds.has(targetNetId)) {
    return { equivalentOhms: 0, pathCount: 1 };
  }

  const adjacency = buildResistorAdjacencyMap(resistors);
  const pathResistances: number[] = [];
  const seenPathKeys = new Set<string>();

  function dfs(currentNetId: string, resistanceSoFar: number, visited: Set<string>, depth: number) {
    if (depth > 8 || pathResistances.length >= 32) {
      return;
    }

    for (const edge of adjacency.get(currentNetId) ?? []) {
      if (visited.has(edge.otherNetId)) {
        continue;
      }

      const nextResistance = resistanceSoFar + edge.resistanceOhms;
      if (!Number.isFinite(nextResistance) || nextResistance <= 0) {
        continue;
      }

      if (sourceNetIds.has(edge.otherNetId)) {
        const pathKey = `${edge.otherNetId}:${Math.round(nextResistance * 1000)}`;
        if (!seenPathKeys.has(pathKey)) {
          seenPathKeys.add(pathKey);
          pathResistances.push(nextResistance);
        }
        continue;
      }

      visited.add(edge.otherNetId);
      dfs(edge.otherNetId, nextResistance, visited, depth + 1);
      visited.delete(edge.otherNetId);
    }
  }

  dfs(targetNetId, 0, new Set([targetNetId]), 0);

  if (pathResistances.length === 0) {
    return { equivalentOhms: null, pathCount: 0 };
  }

  const inverseSum = pathResistances.reduce((sum, resistance) => sum + 1 / resistance, 0);
  if (!Number.isFinite(inverseSum) || inverseSum <= 0) {
    return { equivalentOhms: null, pathCount: pathResistances.length };
  }

  return {
    equivalentOhms: 1 / inverseSum,
    pathCount: pathResistances.length,
  };
}

function buildAdcSourceImpedanceIssues(
  nets: CircuitNet[],
  resistors: CircuitResistorElement[],
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>,
  adcConfigurations?: ProjectAdcConfigurations
) {
  const issues: ProjectAuditIssue[] = [];
  const netsById = new Map(nets.map(net => [net.id, net]));

  const lowImpedanceSourceNetIds = collectLowImpedanceSourceNetIds(
    nets,
    components,
    resolveTemplate,
    netIdByNodeKey
  );

  for (const net of nets) {
    const adcEndpoints = getAdcSinkEndpointsForNet(
      net,
      components,
      boardId,
      resolveTemplate,
      netIdByNodeKey,
      netsById,
      adcConfigurations
    );
    if (adcEndpoints.length === 0) {
      continue;
    }

    const estimated = estimateTheveninResistanceFromGraph(net.id, resistors, lowImpedanceSourceNetIds);
    if (estimated.equivalentOhms == null || estimated.pathCount === 0) {
      continue;
    }

    const theveninOhms = estimated.equivalentOhms;
    const boardAdcPins = adcEndpoints.filter(endpoint => endpoint.kind === 'board');
    if (boardAdcPins.length > 0 && ['uno', 'nano'].includes(boardId) && theveninOhms > 10_000) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.adc-source-impedance-high',
        params: {
          analogPins: boardAdcPins.map(pin => pin.pinId),
          pathCount: estimated.pathCount,
          theveninOhms: Math.round(theveninOhms),
        },
        ruleId: 'netlist.adc-source-impedance-high',
      }));
    }

    const adcSamplingProfile = adcEndpoints.find(endpoint => endpoint.samplingProfile)?.samplingProfile ?? null;
    if (adcSamplingProfile) {
      const sampleCapacitanceF = adcSamplingProfile.sampleCapacitancePf * 1e-12;
      const settlingTimeRequiredUs =
        theveninOhms * sampleCapacitanceF * Math.log(Math.pow(2, adcSamplingProfile.effectiveBits + 1)) * 1e6;

      if (settlingTimeRequiredUs > adcSamplingProfile.acquisitionTimeUs * 1.25) {
        issues.push(createProjectAuditIssue({
          severity: settlingTimeRequiredUs > adcSamplingProfile.acquisitionTimeUs * 2 ? 'warning' : 'info',
          code: 'netlist.adc-sampling-settling-review',
          title: 'ADC 샘플링 settling 여유 검토',
          message: `${adcEndpoints.map(endpoint => endpoint.label).join(', ')} ADC 입력의 소스 임피던스가 약 ${Math.round(theveninOhms)}Ω로 보여, ${adcSamplingProfile.label} 기준 샘플링 settling 시간이 약 ${settlingTimeRequiredUs.toFixed(2)}us 필요할 수 있습니다. 현재 가정 acquisition ${adcSamplingProfile.acquisitionTimeUs.toFixed(2)}us 대비 여유가 작습니다.`,
          ruleId: 'netlist.adc-sampling-settling-review',
          recommendation: '분압 저항을 낮추거나, 버퍼 OP-Amp를 추가하거나, ADC 샘플 시간을 늘릴 수 있는 구조인지 검토해 주세요.',
        }));
      }
    }
  }

  return issues;
}

function buildDecouplingIssues(
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  capacitors: CircuitCapacitorElement[],
  netIdByNodeKey: Map<string, string>
) {
  const issues: ProjectAuditIssue[] = [];
  const candidateTemplateIds = new Set([
    'tpl_dc_motor',
    'tpl_oled',
    'tpl_lcd1602',
    'tpl_rfid_rc522',
    'tpl_bluetooth_hc05',
    'tpl_op_amp_buffer',
    'tpl_audio_amp',
  ]);

  const isBypassCap = (capacitanceFarads: number) => capacitanceFarads >= 10e-9 && capacitanceFarads <= 1e-6;

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template) {
      continue;
    }

    const needsDecoupling =
      candidateTemplateIds.has(component.templateId) ||
      template.category === 'DISPLAY' ||
      template.category === 'COMMUNICATION' ||
      (template.requiredPins.some(pin => pin.allowedTypes.includes('ANALOG')) &&
        template.requiredPins.some(pin => pin.allowedTypes.includes('POWER')) &&
        isLikelyAnalogAmplifierTemplate(template));
    if (!needsDecoupling) {
      continue;
    }

    const vccPin = template.requiredPins.find(pin => pin.allowedTypes.includes('POWER'));
    const gndPin = template.requiredPins.find(pin => pin.allowedTypes.includes('GND'));
    if (!vccPin || !gndPin) {
      continue;
    }

    const vccNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, vccPin.name));
    const gndNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, gndPin.name));
    if (!vccNetId || !gndNetId || vccNetId === gndNetId) {
      continue;
    }

    const hasBypassCap = capacitors.some(capacitor => {
      const samePair =
        (capacitor.netA === vccNetId && capacitor.netB === gndNetId) ||
        (capacitor.netA === gndNetId && capacitor.netB === vccNetId);
      return samePair && isBypassCap(capacitor.capacitanceFarads);
    });

    if (!hasBypassCap) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.decoupling-capacitor-missing',
        params: {
          componentName: component.name,
        },
        componentName: component.name,
        ruleId: 'netlist.decoupling-capacitor-missing',
      }));
    }
  }

  return issues;
}

function findResistorsTouchingNet(netId: string, resistors: CircuitResistorElement[]) {
  return resistors.filter(resistor => resistor.netA === netId || resistor.netB === netId);
}

function hasResistorBetweenNets(netA: string, netB: string, resistors: CircuitResistorElement[]) {
  return resistors.some(
    resistor =>
      (resistor.netA === netA && resistor.netB === netB) ||
      (resistor.netA === netB && resistor.netB === netA)
  );
}

function getPeerNetIdForResistor(netId: string, resistor: CircuitResistorElement) {
  if (resistor.netA === netId) {
    return resistor.netB;
  }
  if (resistor.netB === netId) {
    return resistor.netA;
  }
  return null;
}

function normalizeOpAmpPinRole(pinName: string) {
  const normalized = pinName.trim().toUpperCase().replace(/\s+/g, '');
  if (/^(OUT|VOUT|OUTPUT)$/.test(normalized)) {
    return 'out';
  }
  if (/^(IN\+|\+IN|NONINV|NONINVERTING|VIN\+|INP)$/.test(normalized)) {
    return 'non-inverting';
  }
  if (/^(IN\-|\-IN|INV|INVERTING|VIN\-|INN)$/.test(normalized)) {
    return 'inverting';
  }
  if (/^(VCC|VDD|VS\+|V\+)$/.test(normalized)) {
    return 'power';
  }
  if (/^(GND|VSS|VS\-|V\-)$/.test(normalized)) {
    return 'ground';
  }
  return null;
}

function isLikelyNonRailToRailOpAmp(component: PlacedComponent) {
  const text = [component.name, component.value, component.importedMapping?.libraryId].filter(Boolean).join(' ').toLowerCase();
  return /\blm358\b|\blm324\b|\bne5532\b|\btl072\b|\btl082\b|\blm741\b/.test(text);
}

type LikelyOpAmpProfile = {
  gbwHz: number;
  outputHighHeadroomV: number;
  outputLowHeadroomV: number;
  railToRailInput: boolean;
  railToRailOutput: boolean;
  family: string;
};

function getLikelyOpAmpProfile(component: PlacedComponent): LikelyOpAmpProfile | null {
  const partMasterRecord = getPartMasterRecordForCircuitComponent(component);
  const analogCharacteristics = partMasterRecord?.specsJson.analogCharacteristics;
  if (
    analogCharacteristics &&
    (
      typeof analogCharacteristics.gbwHz === 'number' ||
      typeof analogCharacteristics.outputSwingHighHeadroomV === 'number' ||
      typeof analogCharacteristics.outputSwingLowHeadroomV === 'number'
    )
  ) {
    return {
      gbwHz: analogCharacteristics.gbwHz ?? 1_000_000,
      outputHighHeadroomV: analogCharacteristics.outputSwingHighHeadroomV ?? 1.5,
      outputLowHeadroomV: analogCharacteristics.outputSwingLowHeadroomV ?? 0.1,
      railToRailInput: analogCharacteristics.railToRailInput ?? false,
      railToRailOutput: analogCharacteristics.railToRailOutput ?? false,
      family: partMasterRecord?.canonicalMpn ?? component.value ?? component.name,
    };
  }

  const text = [component.name, component.value, component.importedMapping?.libraryId]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\blm358\b/.test(text) || /\blm324\b/.test(text)) {
    return {
      gbwHz: 1_000_000,
      outputHighHeadroomV: 1.5,
      outputLowHeadroomV: 0.02,
      railToRailInput: false,
      railToRailOutput: false,
      family: /\blm324\b/.test(text) ? 'LM324' : 'LM358',
    };
  }

  if (/\blm741\b/.test(text)) {
    return {
      gbwHz: 1_000_000,
      outputHighHeadroomV: 2,
      outputLowHeadroomV: 2,
      railToRailInput: false,
      railToRailOutput: false,
      family: 'LM741',
    };
  }

  if (/\btl072\b/.test(text) || /\btl082\b/.test(text)) {
    return {
      gbwHz: 3_000_000,
      outputHighHeadroomV: 1.5,
      outputLowHeadroomV: 1.5,
      railToRailInput: false,
      railToRailOutput: false,
      family: /\btl082\b/.test(text) ? 'TL082' : 'TL072',
    };
  }

  if (/\bne5532\b/.test(text)) {
    return {
      gbwHz: 10_000_000,
      outputHighHeadroomV: 1.5,
      outputLowHeadroomV: 1.5,
      railToRailInput: false,
      railToRailOutput: false,
      family: 'NE5532',
    };
  }

  return null;
}

type AdcSamplingProfile = {
  acquisitionTimeUs: number;
  sampleCapacitancePf: number;
  effectiveBits: number;
  label: string;
};

type AdcSinkEndpoint = {
  kind: 'board' | 'component';
  label: string;
  pinId: string;
  nominalVoltage: number | null;
  samplingProfile: AdcSamplingProfile | null;
  component?: PlacedComponent;
  record?: PartMasterRecord;
};

function getCircuitAdcConfig(
  component: PlacedComponent,
  adcConfigurations?: ProjectAdcConfigurations
): ProjectAdcComponentConfig | undefined {
  return adcConfigurations?.[component.instanceId];
}

function getAds1x15PairKey(plusPin: string, minusPin: string): Ads1x15DifferentialPairKey | null {
  const normalized = `${plusPin.trim().toUpperCase()}_${minusPin.trim().toUpperCase()}`;
  if (
    normalized === 'AIN0_AIN1' ||
    normalized === 'AIN0_AIN3' ||
    normalized === 'AIN1_AIN3' ||
    normalized === 'AIN2_AIN3'
  ) {
    return normalized;
  }
  return null;
}

function getMcp3208ChannelModeConfig(
  component: PlacedComponent,
  pinId: string,
  adcConfigurations?: ProjectAdcConfigurations
): Mcp3208ChannelMode | undefined {
  const config = getCircuitAdcConfig(component, adcConfigurations)?.mcp3208;
  const normalizedPin = pinId.trim().toUpperCase() as keyof NonNullable<ProjectMcp3208AdcConfig['channelModes']>;
  return config?.channelModes?.[normalizedPin];
}

function getAdcSamplingProfile(boardId: string): AdcSamplingProfile | null {
  const boardToPartMasterMpn: Record<string, string> = {
    uno: 'ATMEGA328P-PU',
    nano: 'ATMEGA328P-PU',
    esp32: 'ESP32-WROOM-32E',
    rpi_pico: 'RP2040',
    stm32_bluepill: 'STM32F103C8T6',
  };
  const boardRecord = boardToPartMasterMpn[boardId]
    ? findPartMasterRecordByLookupCandidates([boardToPartMasterMpn[boardId]])
    : undefined;
  const adcProfile = boardRecord?.specsJson.adcProfile;
  if (
    adcProfile &&
    typeof adcProfile.acquisitionTimeUs === 'number' &&
    typeof adcProfile.sampleCapacitancePf === 'number' &&
    typeof adcProfile.effectiveBits === 'number'
  ) {
    return {
      acquisitionTimeUs: adcProfile.acquisitionTimeUs,
      sampleCapacitancePf: adcProfile.sampleCapacitancePf,
      effectiveBits: adcProfile.effectiveBits,
      label: boardRecord?.canonicalMpn ?? boardId,
    };
  }

  if (boardId === 'esp32') {
    return {
      acquisitionTimeUs: 2,
      sampleCapacitancePf: 8,
      effectiveBits: 12,
      label: 'ESP32 SAR ADC',
    };
  }

  if (boardId === 'uno' || boardId === 'nano') {
    return {
      acquisitionTimeUs: 12,
      sampleCapacitancePf: 14,
      effectiveBits: 10,
      label: 'ATmega ADC',
    };
  }

  return null;
}

function getAdcSamplingProfileFromPartMasterRecord(record?: PartMasterRecord): AdcSamplingProfile | null {
  const adcProfile = record?.specsJson.adcProfile;
  if (
    !adcProfile ||
    typeof adcProfile.acquisitionTimeUs !== 'number' ||
    typeof adcProfile.sampleCapacitancePf !== 'number' ||
    typeof adcProfile.effectiveBits !== 'number'
  ) {
    return null;
  }

  return {
    acquisitionTimeUs: adcProfile.acquisitionTimeUs,
    sampleCapacitancePf: adcProfile.sampleCapacitancePf,
    effectiveBits: adcProfile.effectiveBits,
    label: record?.canonicalMpn ?? 'external ADC',
  };
}

function getConfiguredAdcSamplingProfileForComponent(
  component: PlacedComponent,
  record: PartMasterRecord | undefined,
  adcConfigurations?: ProjectAdcConfigurations
): AdcSamplingProfile | null {
  const baseProfile = getAdcSamplingProfileFromPartMasterRecord(record);
  if (!record || !baseProfile) {
    return baseProfile;
  }

  if (record.canonicalMpn === 'ADS1115' || record.canonicalMpn === 'ADS1015') {
    const configuredDataRateSps = getCircuitAdcConfig(component, adcConfigurations)?.ads1x15?.dataRateSps;
    if (typeof configuredDataRateSps === 'number' && configuredDataRateSps > 0) {
      const conversionWindowUs = 1_000_000 / configuredDataRateSps;
      return {
        ...baseProfile,
        acquisitionTimeUs: Math.max(baseProfile.acquisitionTimeUs, conversionWindowUs),
        label: `${baseProfile.label} @ ${configuredDataRateSps} SPS`,
      };
    }
  }

  return baseProfile;
}

function buildAds1x15NoiseBandwidthIssue(
  component: PlacedComponent,
  fullScaleV: number | null,
  dataRateSps: number | null
) {
  if (typeof fullScaleV !== 'number' || typeof dataRateSps !== 'number' || fullScaleV <= 0 || dataRateSps <= 0) {
    return null;
  }

  const highGain = fullScaleV <= 0.512;
  const mediumHighGain = fullScaleV <= 1.024;
  const slowRate = dataRateSps <= 16;
  const fastRate = dataRateSps >= 860;
  const veryFastRate = dataRateSps >= 1600;

  if (highGain && (fastRate || veryFastRate)) {
    return createProjectAuditIssue({
      severity: 'info',
      code: 'netlist.ads1x15-noise-bandwidth-review',
      title: 'ADS1x15 PGA/data rate 조합 검토',
      message: `${component.name}은 full-scale ${fullScaleV.toFixed(3)}V와 ${Math.round(dataRateSps)} SPS 조합으로 설정되어 있어, 작은 입력 범위를 빠르게 읽는 대신 노이즈 여유가 줄 수 있습니다.`,
      componentName: component.name,
      ruleId: 'netlist.ads1x15-noise-bandwidth-review',
      recommendation: '미세 신호 정확도가 더 중요하면 data rate를 낮추고, 응답 속도가 더 중요하면 현재 설정에서 평균화/필터링 여유를 같이 검토해 주세요.',
    });
  }

  if ((highGain || mediumHighGain) && slowRate) {
    return createProjectAuditIssue({
      severity: 'info',
      code: 'netlist.ads1x15-noise-bandwidth-review',
      title: 'ADS1x15 PGA/data rate 조합 검토',
      message: `${component.name}은 full-scale ${fullScaleV.toFixed(3)}V와 ${Math.round(dataRateSps)} SPS 조합으로 설정되어 있어 저노이즈 쪽에는 유리하지만, 빠른 변화 신호는 둔하게 보일 수 있습니다.`,
      componentName: component.name,
      ruleId: 'netlist.ads1x15-noise-bandwidth-review',
      recommendation: '천천히 변하는 센서면 적절하지만, 응답 속도가 필요하면 data rate를 높이거나 PGA 범위를 다시 검토해 주세요.',
    });
  }

  if (fullScaleV >= 4.096 && slowRate) {
    return createProjectAuditIssue({
      severity: 'info',
      code: 'netlist.ads1x15-noise-bandwidth-review',
      title: 'ADS1x15 PGA/data rate 조합 검토',
      message: `${component.name}은 큰 full-scale ${fullScaleV.toFixed(3)}V에 낮은 ${Math.round(dataRateSps)} SPS를 쓰고 있어, 넓은 입력 범위를 보되 대역폭은 제한될 수 있습니다.`,
      componentName: component.name,
      ruleId: 'netlist.ads1x15-noise-bandwidth-review',
      recommendation: '천천히 변하는 전압 모니터링에는 괜찮지만, 빠른 신호 추적이 필요하면 data rate를 다시 높여 주세요.',
    });
  }

  return null;
}

function findMcp3208VrefFilterNetwork(
  vrefNetId: string | undefined,
  agndNetId: string | undefined,
  resistors: CircuitResistorElement[],
  capacitors: CircuitCapacitorElement[],
  netsById: Map<string, CircuitNet>
) {
  if (!vrefNetId || !agndNetId) {
    return null;
  }

  const bypassCap = capacitors.find(capacitor => {
    const isBypassCap = capacitor.capacitanceFarads >= 10e-9 && capacitor.capacitanceFarads <= 10e-6;
    if (!isBypassCap) {
      return false;
    }
    return (
      (capacitor.netA === vrefNetId && capacitor.netB === agndNetId) ||
      (capacitor.netB === vrefNetId && capacitor.netA === agndNetId)
    );
  });

  const seriesResistor = resistors.find(resistor => {
    const otherNetId = resistor.netA === vrefNetId ? resistor.netB : resistor.netB === vrefNetId ? resistor.netA : null;
    if (!otherNetId || otherNetId === agndNetId) {
      return false;
    }
    if (resistor.resistanceOhms < 1) {
      return false;
    }
    const otherNet = netsById.get(otherNetId);
    return Boolean(otherNet && (isPowerCircuitNet(otherNet) || typeof getNetResolvedVoltage(otherNet) === 'number'));
  });

  if (!bypassCap && !seriesResistor) {
    return null;
  }

  return {
    bypassCap,
    seriesResistor,
    timeConstantUs:
      bypassCap && seriesResistor
        ? seriesResistor.resistanceOhms * bypassCap.capacitanceFarads * 1e6
        : null,
  };
}

function getComponentPinVoltageEstimate(
  component: PlacedComponent,
  pinNames: string[],
  netsById: Map<string, CircuitNet>,
  netIdByNodeKey: Map<string, string>
) {
  for (const pinName of pinNames) {
    const netId = netIdByNodeKey.get(getComponentPinNodeKey(component, pinName));
    if (!netId) {
      continue;
    }
    const voltage = getNetResolvedVoltage(netsById.get(netId));
    if (typeof voltage === 'number') {
      return voltage;
    }
  }
  return null;
}

function isLikelyExternalAdcInputPin(pinId: string) {
  const normalized = pinId.trim().toUpperCase().replace(/\s+/g, '');
  return (
    /^AIN\d+$/.test(normalized) ||
    /^CH\d+$/.test(normalized) ||
    /^IN[AB][+-]$/.test(normalized) ||
    /^[AB][+-]$/.test(normalized)
  );
}

function getExternalAdcInputLimitVoltage(
  component: PlacedComponent,
  record: PartMasterRecord,
  netsById: Map<string, CircuitNet>,
  netIdByNodeKey: Map<string, string>,
  adcConfigurations?: ProjectAdcConfigurations
) {
  const componentAdcConfig = getCircuitAdcConfig(component, adcConfigurations);
  if (record.canonicalMpn === 'ADS1115' || record.canonicalMpn === 'ADS1015') {
    const configuredFullScale = componentAdcConfig?.ads1x15?.pgaFullScaleV;
    if (typeof configuredFullScale === 'number' && configuredFullScale > 0) {
      return configuredFullScale;
    }
  }

  if (record.canonicalMpn === 'MCP3208') {
    const configuredVref = componentAdcConfig?.mcp3208?.vrefVoltage;
    if (typeof configuredVref === 'number' && configuredVref > 0) {
      return configuredVref;
    }
  }

  const referenceVoltage = record.specsJson.adcProfile?.referenceVoltage;
  if (typeof referenceVoltage === 'number') {
    return referenceVoltage;
  }

  const pinVoltage = getComponentPinVoltageEstimate(
    component,
    record.pinSchemaJson.powerPins ?? [],
    netsById,
    netIdByNodeKey
  );
  if (typeof pinVoltage === 'number') {
    return pinVoltage;
  }

  const supply = record.specsJson.supplyVoltage;
  return supply?.recommended?.[0] ?? supply?.typ ?? supply?.max ?? null;
}

function getAdcSinkEndpointsForNet(
  net: CircuitNet,
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>,
  netsById: Map<string, CircuitNet>,
  adcConfigurations?: ProjectAdcConfigurations
) {
  const endpoints: AdcSinkEndpoint[] = [];

  for (const node of net.nodes) {
    if (node.ownerType === 'board') {
      const boardLimits = getBoardSignalLimits(boardId, node.pinId);
      if (!boardLimits?.supportsAdc) {
        continue;
      }

      endpoints.push({
        kind: 'board',
        label: node.pinId,
        pinId: node.pinId,
        nominalVoltage: boardLimits.nominal,
        samplingProfile: getAdcSamplingProfile(boardId),
      });
      continue;
    }

    const component = components.find(candidate => candidate.instanceId === node.ownerId);
    const template = component ? resolveTemplate(component.templateId) : undefined;
    const record = component ? getPartMasterRecordForCircuitComponent(component, template) : undefined;
    if (!component || !record) {
      continue;
    }

    const isHx711 = record.canonicalMpn === 'HX711';
    const hasDedicatedAdcProfile = Boolean(record.specsJson.adcProfile);
    if ((!hasDedicatedAdcProfile && !isHx711) || !isLikelyExternalAdcInputPin(node.pinId)) {
      continue;
    }

    endpoints.push({
      kind: 'component',
      label: `${component.name}:${node.pinId}`,
      pinId: node.pinId,
      nominalVoltage: getExternalAdcInputLimitVoltage(component, record, netsById, netIdByNodeKey, adcConfigurations),
      samplingProfile: getConfiguredAdcSamplingProfileForComponent(component, record, adcConfigurations),
      component,
      record,
    });
  }

  return endpoints;
}

function getNetIdForComponentPinAliases(
  component: PlacedComponent,
  aliases: string[],
  netIdByNodeKey: Map<string, string>
) {
  for (const alias of aliases) {
    const netId = netIdByNodeKey.get(getComponentPinNodeKey(component, alias));
    if (netId) {
      return netId;
    }
  }
  return undefined;
}

function getPreferentiallyConnectedNetIdForAliases(
  component: PlacedComponent,
  aliases: string[],
  netIdByNodeKey: Map<string, string>,
  netsById: Map<string, CircuitNet>
) {
  let fallbackNetId: string | undefined;

  for (const alias of aliases) {
    const netId = netIdByNodeKey.get(getComponentPinNodeKey(component, alias));
    if (!netId) {
      continue;
    }
    fallbackNetId ??= netId;
    if (hasExternalConnectionOnNet(netId, component.instanceId, netsById)) {
      return netId;
    }
  }

  return fallbackNetId;
}

function hasPeerConnectionOnNet(
  netId: string | undefined,
  ownerId: string,
  pinId: string,
  netsById: Map<string, CircuitNet>
) {
  if (!netId) {
    return false;
  }
  const net = netsById.get(netId);
  if (!net) {
    return false;
  }
  return net.nodes.some(
    node => !(node.ownerType === 'component' && node.ownerId === ownerId && node.pinId === pinId)
  );
}

function hasExternalConnectionOnNet(
  netId: string | undefined,
  ownerId: string,
  netsById: Map<string, CircuitNet>
) {
  if (!netId) {
    return false;
  }
  const net = netsById.get(netId);
  if (!net) {
    return false;
  }
  return net.nodes.some(
    node => !(node.ownerType === 'component' && node.ownerId === ownerId)
  );
}

function getConnectedPeerComponentIds(
  netId: string | undefined,
  ownerId: string,
  netsById: Map<string, CircuitNet>
) {
  return new Set(
    (netId ? netsById.get(netId)?.nodes ?? [] : [])
      .filter(node => node.ownerType === 'component' && node.ownerId !== ownerId)
      .map(node => node.ownerId)
  );
}

function buildAnalogSensorBufferIssues(
  nets: CircuitNet[],
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  netIdByNodeKey: Map<string, string>
) {
  const issues: ProjectAuditIssue[] = [];
  const netsById = new Map(nets.map(net => [net.id, net]));

  for (const net of nets) {
    const adcEndpoints = getAdcSinkEndpointsForNet(
      net,
      components,
      boardId,
      resolveTemplate,
      netIdByNodeKey,
      netsById
    );
    if (adcEndpoints.length === 0) {
      continue;
    }
    if (adcEndpoints.some(endpoint => endpoint.record?.canonicalMpn === 'HX711')) {
      continue;
    }

    const opAmpDriversOnNet = net.nodes.some(node => {
      if (node.ownerType !== 'component') {
        return false;
      }
      const component = components.find(candidate => candidate.instanceId === node.ownerId);
      const template = component ? resolveTemplate(component.templateId) : undefined;
      return Boolean(component && template && isLikelyAnalogAmplifierTemplate(template));
    });
    if (opAmpDriversOnNet) {
      continue;
    }

    const warnedMpn = new Set<string>();
    for (const node of net.nodes) {
      if (node.ownerType !== 'component') {
        continue;
      }

      const component = components.find(candidate => candidate.instanceId === node.ownerId);
      const template = component ? resolveTemplate(component.templateId) : undefined;
      const record = component ? getPartMasterRecordForCircuitComponent(component, template) : undefined;
      const analog = record?.specsJson.analogCharacteristics;
      if (!component || !record || !analog) {
        continue;
      }

      const needsBuffer =
        analog.needsBufferForAdc === true ||
        (
          typeof analog.outputImpedanceOhms === 'number' &&
          typeof analog.recommendedAdcSourceImpedanceOhms === 'number' &&
          analog.outputImpedanceOhms > analog.recommendedAdcSourceImpedanceOhms
        );
      if (!needsBuffer || warnedMpn.has(record.canonicalMpn)) {
        continue;
      }

      warnedMpn.add(record.canonicalMpn);
      issues.push(createProjectAuditIssue({
        severity: 'info',
        code: 'netlist.sensor-output-buffer-review',
        title: '센서 출력 버퍼 검토',
        message: `${component.name} (${record.canonicalMpn}) 출력이 ADC에 직접 연결된 것으로 보입니다. 이 부품은 버퍼나 RC 안정화가 있으면 샘플링 오차와 노이즈에 더 안전할 수 있습니다.`,
        componentName: component.name,
        ruleId: 'netlist.sensor-output-buffer-review',
        recommendation: analog.note
          ? `${analog.note} 필요하면 voltage follower 버퍼나 저임피던스 구동단을 검토해 주세요.`
          : '필요하면 voltage follower 버퍼, 저역통과 필터, 더 낮은 소스 임피던스 구성을 검토해 주세요.',
      }));
    }
  }

  return issues;
}

function buildHx711FrontEndIssues(
  nets: CircuitNet[],
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  capacitors: CircuitCapacitorElement[],
  netIdByNodeKey: Map<string, string>
) {
  const issues: ProjectAuditIssue[] = [];
  const netsById = new Map(nets.map(net => [net.id, net]));
  const isBypassCap = (capacitanceFarads: number) => capacitanceFarads >= 10e-9 && capacitanceFarads <= 1e-6;

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    const record = getPartMasterRecordForCircuitComponent(component, template);
    if (record?.canonicalMpn !== 'HX711') {
      continue;
    }

    const powerPinNames = record.pinSchemaJson.powerPins ?? ['AVDD', 'DVDD', 'VSUP'];
    const groundPinNames = record.pinSchemaJson.groundPins ?? ['AGND', 'DGND'];
    const powerNetIds = powerPinNames
      .map(pinName => netIdByNodeKey.get(getComponentPinNodeKey(component, pinName)))
      .filter((netId): netId is string => Boolean(netId));
    const groundNetIds = groundPinNames
      .map(pinName => netIdByNodeKey.get(getComponentPinNodeKey(component, pinName)))
      .filter((netId): netId is string => Boolean(netId));

    const hasBypassCap = capacitors.some(capacitor => {
      if (!isBypassCap(capacitor.capacitanceFarads)) {
        return false;
      }
      return (
        (powerNetIds.includes(capacitor.netA) && groundNetIds.includes(capacitor.netB)) ||
        (powerNetIds.includes(capacitor.netB) && groundNetIds.includes(capacitor.netA))
      );
    });

    if (!hasBypassCap && powerNetIds.length > 0 && groundNetIds.length > 0) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.hx711-decoupling-review',
        title: 'HX711 전원/레퍼런스 디커플링 검토',
        message: `${component.name} 전원 핀 주변에서 HX711용 바이패스 커패시터를 찾지 못했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.hx711-decoupling-review',
        recommendation: 'AVDD/VSUP와 AGND/DGND 사이에 0.1uF급 로컬 디커플링을 두고, 레퍼런스/아날로그 리턴 경로를 짧게 유지해 주세요.',
      }));
    }

    const hxExcitationPlusNetId = getNetIdForComponentPinAliases(component, ['E+', 'EXC+', 'EXCITATION+', 'AVDD', 'VSUP', 'VCC'], netIdByNodeKey);
    const hxExcitationMinusNetId = getNetIdForComponentPinAliases(component, ['E-', 'EXC-', 'EXCITATION-', 'AGND', 'DGND', 'GND'], netIdByNodeKey);

    for (const [plusPin, minusPin, channel] of [['INA+', 'INA-', 'A'], ['INB+', 'INB-', 'B']] as const) {
      const plusNetId = getNetIdForComponentPinAliases(component, [plusPin, plusPin.replace('IN', ''), plusPin === 'INA+' ? 'SIG+' : 'B+'], netIdByNodeKey);
      const minusNetId = getNetIdForComponentPinAliases(component, [minusPin, minusPin.replace('IN', ''), minusPin === 'INA-' ? 'SIG-' : 'B-'], netIdByNodeKey);
      const plusConnected = hasPeerConnectionOnNet(plusNetId, component.instanceId, plusPin, netsById);
      const minusConnected = hasPeerConnectionOnNet(minusNetId, component.instanceId, minusPin, netsById);

      if (!plusConnected && !minusConnected) {
        continue;
      }

      if (!plusConnected || !minusConnected || !plusNetId || !minusNetId) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'netlist.hx711-differential-input-incomplete',
          title: 'HX711 차동 입력 쌍 미완성',
          message: `${component.name}의 ${channel} 채널은 ${plusPin}/${minusPin} 차동 입력 중 한쪽만 연결된 것으로 보입니다.`,
          componentName: component.name,
          ruleId: 'netlist.hx711-differential-input-incomplete',
          recommendation: '로드셀/브리지 센서는 보통 차동 쌍을 함께 사용합니다. +/− 라인이 모두 연결되었는지 확인해 주세요.',
        }));
        continue;
      }

      if (plusNetId === minusNetId) {
        issues.push(createProjectAuditIssue({
          severity: 'warning',
          code: 'netlist.hx711-differential-input-shorted',
          title: 'HX711 차동 입력 단락 검토',
          message: `${component.name}의 ${channel} 채널 ${plusPin}/${minusPin}가 같은 net에 묶여 있습니다.`,
          componentName: component.name,
          ruleId: 'netlist.hx711-differential-input-shorted',
          recommendation: '차동 측정 경로가 살아 있는지, 브리지의 +/− 출력이 서로 분리되어 있는지 다시 확인해 주세요.',
        }));
        continue;
      }

      const plusComponentIds = getConnectedPeerComponentIds(plusNetId, component.instanceId, netsById);
      const minusComponentIds = getConnectedPeerComponentIds(minusNetId, component.instanceId, netsById);
      const sharedSourceIds = Array.from(plusComponentIds).filter(componentId => minusComponentIds.has(componentId));
      if (channel === 'B' && sharedSourceIds.length > 0) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.hx711-inb-channel-review',
          title: 'HX711 INB 채널 사용 검토',
          message: `${component.name}에서 INB 채널 사용이 감지되었습니다.`,
          componentName: component.name,
          ruleId: 'netlist.hx711-inb-channel-review',
          recommendation: 'INB 채널은 A 채널과 이득/활용 패턴이 다를 수 있으니, 의도한 센서 감도와 배선 채널이 맞는지 다시 확인해 주세요.',
        }));
      }
      if (sharedSourceIds.length === 0) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.hx711-bridge-balance-review',
          title: 'HX711 브리지 입력 균형 검토',
          message: `${component.name}의 ${channel} 채널 양 입력에 공통 소스 소자를 찾지 못했습니다.`,
          componentName: component.name,
          ruleId: 'netlist.hx711-bridge-balance-review',
          recommendation: '로드셀/브리지 센서의 +/− 출력이 같은 센서에서 함께 들어오는지, 배선 길이와 리턴 경로가 균형적인지 검토해 주세요.',
        }));
        continue;
      }

      for (const sharedSourceId of sharedSourceIds) {
        const sourceComponent = components.find(candidate => candidate.instanceId === sharedSourceId);
        if (!sourceComponent) {
          continue;
        }

        const sourceExcitationPlusNetId = getPreferentiallyConnectedNetIdForAliases(sourceComponent, ['E+', 'EXC+', 'EXCITATION+', 'VCC+', 'V+', 'SEN+', 'S+', 'SIGS+', 'E_SENSE+'], netIdByNodeKey, netsById);
        const sourceExcitationMinusNetId = getPreferentiallyConnectedNetIdForAliases(sourceComponent, ['E-', 'EXC-', 'EXCITATION-', 'VCC-', 'V-', 'SEN-', 'S-', 'SIGS-', 'E_SENSE-'], netIdByNodeKey, netsById);
        const sourceExcitationPlusConnected = sourceExcitationPlusNetId
          ? hasExternalConnectionOnNet(sourceExcitationPlusNetId, sourceComponent.instanceId, netsById)
          : false;
        const sourceExcitationMinusConnected = sourceExcitationMinusNetId
          ? hasExternalConnectionOnNet(sourceExcitationMinusNetId, sourceComponent.instanceId, netsById)
          : false;

        if (!sourceExcitationPlusNetId && !sourceExcitationMinusNetId) {
          continue;
        }

        if (
          !sourceExcitationPlusConnected ||
          !sourceExcitationMinusConnected ||
          !sourceExcitationPlusNetId ||
          !sourceExcitationMinusNetId
        ) {
          issues.push(createProjectAuditIssue({
            severity: 'warning',
            code: 'netlist.hx711-excitation-incomplete',
            title: 'HX711 로드셀 여기선 미완성',
            message: `${component.name}에 연결된 ${sourceComponent.name}의 E+/E- 여기선 중 한쪽이 빠져 있는 것으로 보입니다.`,
            componentName: component.name,
            ruleId: 'netlist.hx711-excitation-incomplete',
            recommendation: '로드셀은 보통 신호선뿐 아니라 E+/E- 여기선도 함께 연결되어야 합니다. 브리지 전원 배선을 다시 확인해 주세요.',
          }));
          continue;
        }

        if (sourceExcitationPlusNetId === sourceExcitationMinusNetId) {
          issues.push(createProjectAuditIssue({
            severity: 'warning',
            code: 'netlist.hx711-excitation-shorted',
            title: 'HX711 로드셀 여기선 단락 검토',
            message: `${component.name}에 연결된 ${sourceComponent.name}의 E+와 E-가 같은 net에 묶여 있습니다.`,
            componentName: component.name,
            ruleId: 'netlist.hx711-excitation-shorted',
            recommendation: '로드셀 브리지 여기 전원이 서로 분리되어 있는지, 모듈 실크와 배선이 바뀌지 않았는지 확인해 주세요.',
          }));
          continue;
        }

        const plusNet = netsById.get(sourceExcitationPlusNetId);
        const minusNet = netsById.get(sourceExcitationMinusNetId);
        const anchoredToHx711ModuleExcitation =
          Boolean(hxExcitationPlusNetId && sourceExcitationPlusNetId === hxExcitationPlusNetId) &&
          Boolean(hxExcitationMinusNetId && sourceExcitationMinusNetId === hxExcitationMinusNetId);
        const anchoredToPowerRails = Boolean(
          plusNet &&
          minusNet &&
          isPowerCircuitNet(plusNet) &&
          isGroundCircuitNet(minusNet)
        );

        if (!anchoredToHx711ModuleExcitation && !anchoredToPowerRails) {
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.hx711-excitation-review',
            title: 'HX711 로드셀 여기선 경로 검토',
            message: `${component.name}에 연결된 ${sourceComponent.name}의 E+/E- 여기선이 HX711 쪽 여기 출력이나 명확한 전원/GND 기준으로 보이지 않습니다.`,
            componentName: component.name,
            ruleId: 'netlist.hx711-excitation-review',
            recommendation: '로드셀 브리지의 E+/E-가 모듈의 여기 출력 또는 의도한 전원/GND 레일에 실제로 연결되어 있는지 확인해 주세요.',
          }));
        }

        const sourceSensePlusNetId = getPreferentiallyConnectedNetIdForAliases(
          sourceComponent,
          ['SEN+', 'S+', 'SIGS+', 'E_SENSE+'],
          netIdByNodeKey,
          netsById
        );
        const sourceSenseMinusNetId = getPreferentiallyConnectedNetIdForAliases(
          sourceComponent,
          ['SEN-', 'S-', 'SIGS-', 'E_SENSE-'],
          netIdByNodeKey,
          netsById
        );
        const sourceSensePlusConnected = sourceSensePlusNetId
          ? hasExternalConnectionOnNet(sourceSensePlusNetId, sourceComponent.instanceId, netsById)
          : false;
        const sourceSenseMinusConnected = sourceSenseMinusNetId
          ? hasExternalConnectionOnNet(sourceSenseMinusNetId, sourceComponent.instanceId, netsById)
          : false;

        if (sourceSensePlusConnected && sourceSenseMinusConnected) {
          if (
            sourceExcitationPlusNetId &&
            sourceExcitationMinusNetId &&
            (sourceSensePlusNetId !== sourceExcitationPlusNetId || sourceSenseMinusNetId !== sourceExcitationMinusNetId)
          ) {
            issues.push(createProjectAuditIssue({
              severity: 'info',
              code: 'netlist.hx711-sense-net-review',
              title: '로드셀 sense/excitation 경로 검토',
              message: `${component.name}에 연결된 ${sourceComponent.name}의 sense선이 excitation선과 다른 net을 보고 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.hx711-sense-net-review',
              recommendation: '6선 로드셀이라면 S+/S-가 실제 E+/E- 여기 경로를 감시하도록 배선되었는지 확인해 주세요.',
            }));
          }
        }
      }
    }
  }

  return issues;
}

function buildExternalAdcFrontEndIssues(
  nets: CircuitNet[],
  components: PlacedComponent[],
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  resistors: CircuitResistorElement[],
  capacitors: CircuitCapacitorElement[],
  netIdByNodeKey: Map<string, string>,
  adcConfigurations?: ProjectAdcConfigurations
) {
  const issues: ProjectAuditIssue[] = [];
  const netsById = new Map(nets.map(net => [net.id, net]));
  const isBypassCap = (capacitanceFarads: number) => capacitanceFarads >= 10e-9 && capacitanceFarads <= 1e-6;
  const adsDifferentialPairs = [
    ['AIN0', 'AIN1'],
    ['AIN0', 'AIN3'],
    ['AIN1', 'AIN3'],
    ['AIN2', 'AIN3'],
  ] as const;
  const mcpPseudoDiffPairs = [
    ['CH0', 'CH1'],
    ['CH2', 'CH3'],
    ['CH4', 'CH5'],
    ['CH6', 'CH7'],
  ] as const;

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    const record = getPartMasterRecordForCircuitComponent(component, template);
    if (!record) {
      continue;
    }

    if (record.canonicalMpn === 'ADS1115' || record.canonicalMpn === 'ADS1015') {
      const adsConfig = getCircuitAdcConfig(component, adcConfigurations)?.ads1x15;
      const adcFullScaleV =
        (typeof adsConfig?.pgaFullScaleV === 'number' && adsConfig.pgaFullScaleV > 0
          ? adsConfig.pgaFullScaleV
          : null) ??
        record.specsJson.adcProfile?.referenceVoltage ??
        null;
      const adsNoiseBandwidthIssue = buildAds1x15NoiseBandwidthIssue(
        component,
        adcFullScaleV,
        typeof adsConfig?.dataRateSps === 'number' ? adsConfig.dataRateSps : null
      );
      if (adsNoiseBandwidthIssue) {
        issues.push(adsNoiseBandwidthIssue);
      }
      const supplyVoltage =
        getNetResolvedVoltage(
          netsById.get(getNetIdForComponentPinAliases(component, ['VDD'], netIdByNodeKey) ?? '')
        ) ??
        record.specsJson.supplyVoltage?.recommended?.[0] ??
        record.specsJson.supplyVoltage?.typ ??
        null;
      for (const [plusPin, minusPin] of adsDifferentialPairs) {
        const pairKey = getAds1x15PairKey(plusPin, minusPin);
        const configuredPairMode = pairKey ? adsConfig?.pairModes?.[pairKey] : undefined;
        const plusNetId = getNetIdForComponentPinAliases(component, [plusPin], netIdByNodeKey);
        const minusNetId = getNetIdForComponentPinAliases(component, [minusPin], netIdByNodeKey);
        const plusConnected = hasPeerConnectionOnNet(plusNetId, component.instanceId, plusPin, netsById);
        const minusConnected = hasPeerConnectionOnNet(minusNetId, component.instanceId, minusPin, netsById);
        if (!plusConnected && !minusConnected) {
          continue;
        }

        if (plusConnected && minusConnected) {
          const plusPeers = getConnectedPeerComponentIds(plusNetId, component.instanceId, netsById);
          const minusPeers = getConnectedPeerComponentIds(minusNetId, component.instanceId, netsById);
          const sharedSource = Array.from(plusPeers).some(peerId => minusPeers.has(peerId));
          const pairModeLabel =
            configuredPairMode === 'differential'
              ? '프로젝트 설정상 차동 입력'
              : configuredPairMode === 'single-ended'
                ? '프로젝트 설정상 단일종단 입력'
                : sharedSource
                  ? '차동 입력'
                  : '차동 입력 또는 상호 참조 입력';
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.ads1x15-differential-pair-review',
            title: 'ADS1x15 차동 입력 사용 검토',
            message: `${component.name}에서 ${plusPin}/${minusPin}가 동시에 연결되어 있어 ${pairModeLabel} 구성이 사용 중일 수 있습니다.`,
            componentName: component.name,
            ruleId: 'netlist.ads1x15-differential-pair-review',
            recommendation: 'PGA/full-scale 범위와 공통모드 전압이 의도한 센서 출력 범위에 맞는지 확인해 주세요.',
          }));

          const plusVoltage = plusNetId ? getNetResolvedVoltage(netsById.get(plusNetId)) : null;
          const minusVoltage = minusNetId ? getNetResolvedVoltage(netsById.get(minusNetId)) : null;
          if (typeof plusVoltage === 'number' && typeof minusVoltage === 'number') {
            const differentialVoltage = Math.abs(plusVoltage - minusVoltage);
            const commonModeVoltage = (plusVoltage + minusVoltage) / 2;
            if (typeof adcFullScaleV === 'number' && differentialVoltage > adcFullScaleV + 1e-6) {
              issues.push(createProjectAuditIssue({
                severity: 'warning',
                code: 'netlist.ads1x15-fullscale-review',
                title: 'ADS1x15 full-scale 범위 검토',
                message: `${component.name}의 ${plusPin}/${minusPin} 차동 입력 전압차가 약 ${differentialVoltage.toFixed(2)}V로 보여, 현재 가정 full-scale ${adcFullScaleV.toFixed(2)}V를 넘길 수 있습니다.`,
                componentName: component.name,
                ruleId: 'netlist.ads1x15-fullscale-review',
                recommendation: 'PGA 설정과 입력 감쇠를 다시 확인해 주세요. 필요한 경우 더 작은 이득이나 분압/증폭 재조정이 필요할 수 있습니다.',
              }));
            }

            if (
              typeof supplyVoltage === 'number' &&
              (commonModeVoltage < -1e-6 || commonModeVoltage > supplyVoltage + 1e-6)
            ) {
              issues.push(createProjectAuditIssue({
                severity: 'warning',
                code: 'netlist.ads1x15-common-mode-review',
                title: 'ADS1x15 입력 common-mode 검토',
                message: `${component.name}의 ${plusPin}/${minusPin} 차동쌍 공통모드 전압이 약 ${commonModeVoltage.toFixed(2)}V로 보여, 전원 범위 0V~${supplyVoltage.toFixed(2)}V를 벗어날 수 있습니다.`,
                componentName: component.name,
                ruleId: 'netlist.ads1x15-common-mode-review',
                recommendation: '센서 바이어스 기준점과 ADS1x15 전원 범위가 맞는지 확인하고, 필요하면 레벨 시프팅이나 바이어스 재설계를 검토해 주세요.',
              }));
            }
          }
          continue;
        }

        issues.push(createProjectAuditIssue({
          severity: configuredPairMode === 'differential' ? 'warning' : 'info',
          code: 'netlist.ads1x15-input-mode-review',
          title: 'ADS1x15 입력 모드 검토',
          message:
            configuredPairMode === 'differential'
              ? `${component.name}의 프로젝트 설정은 ${plusPin}/${minusPin} 차동 입력인데 현재 한쪽만 연결되어 있습니다.`
              : `${component.name}에서 ${plusPin}/${minusPin} 조합 중 한쪽만 연결되어 있습니다.`,
          componentName: component.name,
          ruleId: 'netlist.ads1x15-input-mode-review',
          recommendation: '단일종단 입력인지 차동 입력 의도인지 다시 확인하고, 차동이라면 대응 핀도 함께 연결해 주세요.',
        }));
      }
    }

    if (record.canonicalMpn !== 'MCP3208') {
      continue;
    }

    const vrefNetId = getNetIdForComponentPinAliases(component, ['VREF'], netIdByNodeKey);
    const vddNetId = getNetIdForComponentPinAliases(component, ['VDD'], netIdByNodeKey);
    const agndNetId = getNetIdForComponentPinAliases(component, ['AGND', 'VSS', 'DGND', 'GND'], netIdByNodeKey);
    const vrefNet = vrefNetId ? netsById.get(vrefNetId) : undefined;
    const vddNet = vddNetId ? netsById.get(vddNetId) : undefined;
    const mcpConfig = getCircuitAdcConfig(component, adcConfigurations)?.mcp3208;
    const vrefFilterNetwork = findMcp3208VrefFilterNetwork(vrefNetId, agndNetId, resistors, capacitors, netsById);
    const vrefVoltage =
      (typeof mcpConfig?.vrefVoltage === 'number' && mcpConfig.vrefVoltage > 0
        ? mcpConfig.vrefVoltage
        : null) ??
      getNetResolvedVoltage(vrefNet);
    const vddVoltage = getNetResolvedVoltage(vddNet);

    if (!vrefNetId || !hasExternalConnectionOnNet(vrefNetId, component.instanceId, netsById)) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.mcp3208-vref-missing',
        title: 'MCP3208 VREF 경로 미확인',
        message: `${component.name}의 VREF 기준전압 경로를 확인하지 못했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-vref-missing',
        recommendation: 'VREF를 의도한 기준전압 레일에 연결하고, ADC 측정 범위가 그 기준에 맞는지 확인해 주세요.',
      }));
    } else if (!vrefNet || (!isPowerCircuitNet(vrefNet) && (typeof vrefVoltage !== 'number' || vrefVoltage <= 0.1))) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.mcp3208-vref-invalid',
        title: 'MCP3208 VREF 전압 검토',
        message: `${component.name}의 VREF가 유효한 양의 기준전압으로 보이지 않습니다.`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-vref-invalid',
        recommendation: 'VREF가 GND로 떨어지지 않았는지, 실제 기준전압 레일에 연결되어 있는지 확인해 주세요.',
      }));
    }

    if (
      typeof vrefVoltage === 'number' &&
      typeof vddVoltage === 'number' &&
      vrefVoltage > vddVoltage + 1e-6
    ) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.mcp3208-vref-over-vdd',
        title: 'MCP3208 VREF/VDD 관계 검토',
        message: `${component.name}에서 VREF(${vrefVoltage.toFixed(2)}V)가 VDD(${vddVoltage.toFixed(2)}V)보다 높게 보입니다.`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-vref-over-vdd',
        recommendation: 'MCP3208의 기준전압은 보통 VDD 범위 안에 있어야 합니다. 전원/레퍼런스 경로를 다시 확인해 주세요.',
      }));
    }

    if (vrefNetId && agndNetId && vrefNetId !== agndNetId) {
      const hasVrefBypassCap = capacitors.some(capacitor => {
        if (!isBypassCap(capacitor.capacitanceFarads)) {
          return false;
        }
        return (
          (capacitor.netA === vrefNetId && capacitor.netB === agndNetId) ||
          (capacitor.netB === vrefNetId && capacitor.netA === agndNetId)
        );
      });
      if (!hasVrefBypassCap) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.mcp3208-vref-bypass-review',
          title: 'MCP3208 VREF 바이패스 검토',
          message: `${component.name}의 VREF와 AGND 사이에서 로컬 바이패스 커패시터를 찾지 못했습니다.`,
          componentName: component.name,
          ruleId: 'netlist.mcp3208-vref-bypass-review',
          recommendation: '기준전압 노이즈를 줄이기 위해 VREF-AGND 사이에 로컬 커패시터를 두는 구성을 검토해 주세요.',
        }));
      }
    }

    const effectiveVrefSourceImpedanceOhms =
      typeof mcpConfig?.vrefSourceImpedanceOhms === 'number' && mcpConfig.vrefSourceImpedanceOhms > 0
        ? mcpConfig.vrefSourceImpedanceOhms
        : vrefFilterNetwork?.seriesResistor?.resistanceOhms ?? null;

    if (typeof effectiveVrefSourceImpedanceOhms === 'number' && effectiveVrefSourceImpedanceOhms > 100) {
      issues.push(createProjectAuditIssue({
        severity: effectiveVrefSourceImpedanceOhms > 1_000 ? 'warning' : 'info',
        code: 'netlist.mcp3208-vref-source-impedance-review',
        title: 'MCP3208 VREF 소스 임피던스 검토',
        message:
          typeof mcpConfig?.vrefSourceImpedanceOhms === 'number' && mcpConfig.vrefSourceImpedanceOhms > 0
            ? `${component.name}의 프로젝트 설정상 VREF 소스 임피던스가 약 ${Math.round(effectiveVrefSourceImpedanceOhms)}Ω로 표시되어 있습니다.`
            : `${component.name}의 VREF 경로에서 약 ${Math.round(effectiveVrefSourceImpedanceOhms)}Ω 직렬 저항이 보여 기준전압 소스 임피던스가 커질 수 있습니다.`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-vref-source-impedance-review',
        recommendation: 'SAR ADC 기준전압은 저임피던스가 유리합니다. 필요하면 버퍼 레퍼런스나 더 강한 기준전압 소스를 검토해 주세요.',
      }));
    }

    if (mcpConfig?.vrefQuality === 'shared-digital-rail' || mcpConfig?.vrefQuality === 'noisy') {
      const hasSeriesFilter = Boolean(vrefFilterNetwork?.seriesResistor && vrefFilterNetwork?.bypassCap);
      issues.push(createProjectAuditIssue({
        severity: mcpConfig.vrefQuality === 'noisy' && !hasSeriesFilter ? 'warning' : 'info',
        code: 'netlist.mcp3208-vref-quality-review',
        title: 'MCP3208 VREF 품질 검토',
        message:
          mcpConfig.vrefQuality === 'noisy'
            ? `${component.name}의 프로젝트 설정상 VREF가 노이즈가 큰 기준전압으로 분류되어${hasSeriesFilter ? ' 있지만, 현재 RC 필터망도 함께 보입니다.' : ' 있습니다.'}`
            : `${component.name}의 프로젝트 설정상 VREF가 디지털 부하와 공유된 레일로 분류되어${hasSeriesFilter ? ' 있고, 현재 RC 필터망도 함께 보입니다.' : ' 있습니다.'}`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-vref-quality-review',
        recommendation: '정밀도가 중요하면 더 깨끗한 기준전압, 별도 필터링, 레퍼런스 버퍼 구성을 검토해 주세요.',
      }));
    }

    if (mcpConfig?.vrefQuality === 'shared-digital-rail' || mcpConfig?.vrefQuality === 'noisy') {
      if (!vrefFilterNetwork?.seriesResistor || !vrefFilterNetwork?.bypassCap) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.mcp3208-vref-filter-review',
          title: 'MCP3208 VREF 필터망 검토',
          message: `${component.name}의 VREF에서 직렬 저항 + AGND 바이패스 형태의 RC 필터망을 확인하지 못했습니다.`,
          componentName: component.name,
          ruleId: 'netlist.mcp3208-vref-filter-review',
          recommendation: '공유 레일이나 noisy reference를 쓴다면 VREF에 직렬 저항과 로컬 커패시터를 둔 저역통과 필터를 검토해 주세요.',
        }));
      } else if (typeof vrefFilterNetwork.timeConstantUs === 'number' && vrefFilterNetwork.timeConstantUs < 1) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.mcp3208-vref-filter-review',
          title: 'MCP3208 VREF 필터망 검토',
          message: `${component.name}의 VREF RC 필터 시정수가 약 ${vrefFilterNetwork.timeConstantUs.toFixed(2)}us로 보여 reference ripple 완화 여유가 작을 수 있습니다.`,
          componentName: component.name,
          ruleId: 'netlist.mcp3208-vref-filter-review',
          recommendation: 'VREF 필터용 직렬 저항이나 커패시터 값을 다시 검토해 reference ripple 감쇠 여유를 늘려 주세요.',
        }));
      }
    }

    if (
      typeof mcpConfig?.scanRateSps === 'number' &&
      mcpConfig.scanRateSps > 0 &&
      typeof vrefFilterNetwork?.timeConstantUs === 'number'
    ) {
      const conversionPeriodUs = 1_000_000 / mcpConfig.scanRateSps;
      if (vrefFilterNetwork.timeConstantUs > conversionPeriodUs * 0.25) {
        issues.push(createProjectAuditIssue({
          severity: vrefFilterNetwork.timeConstantUs > conversionPeriodUs ? 'warning' : 'info',
          code: 'netlist.mcp3208-vref-scan-rate-review',
          title: 'MCP3208 VREF 필터/스캔 속도 검토',
          message: `${component.name}의 VREF RC 시정수는 약 ${vrefFilterNetwork.timeConstantUs.toFixed(2)}us인데, 프로젝트 설정상 스캔 속도 ${Math.round(mcpConfig.scanRateSps)} SPS는 변환 주기 약 ${conversionPeriodUs.toFixed(2)}us 수준입니다.`,
          componentName: component.name,
          ruleId: 'netlist.mcp3208-vref-scan-rate-review',
          recommendation: '스캔 속도를 낮추거나 VREF 필터 시정수를 다시 조정해 기준전압이 충분히 안정될 시간을 확보해 주세요.',
        }));
      }
    }

    for (const [plusPin, minusPin] of mcpPseudoDiffPairs) {
      const plusNetId = getNetIdForComponentPinAliases(component, [plusPin], netIdByNodeKey);
      const minusNetId = getNetIdForComponentPinAliases(component, [minusPin], netIdByNodeKey);
      const plusConnected = hasPeerConnectionOnNet(plusNetId, component.instanceId, plusPin, netsById);
      const minusConnected = hasPeerConnectionOnNet(minusNetId, component.instanceId, minusPin, netsById);
      const plusConfiguredMode = getMcp3208ChannelModeConfig(component, plusPin, adcConfigurations);
      const minusConfiguredMode = getMcp3208ChannelModeConfig(component, minusPin, adcConfigurations);
      const configuredPseudoDifferential =
        plusConfiguredMode === 'pseudo-differential-positive' ||
        minusConfiguredMode === 'pseudo-differential-negative';
      const configuredSingleEnded =
        plusConfiguredMode === 'single-ended' &&
        (minusConfiguredMode === 'unused' || typeof minusConfiguredMode === 'undefined');

      if (!plusConnected && !minusConnected) {
        continue;
      }

      if (plusConnected && minusConnected) {
        const plusPeers = getConnectedPeerComponentIds(plusNetId, component.instanceId, netsById);
        const minusPeers = getConnectedPeerComponentIds(minusNetId, component.instanceId, netsById);
        const sharedSource = Array.from(plusPeers).some(peerId => minusPeers.has(peerId));
        if (configuredSingleEnded) {
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.mcp3208-channel-mode-review',
            title: 'MCP3208 채널 모드 설정 검토',
            message: `${component.name}의 프로젝트 설정상 ${plusPin}은 single-ended인데, ${minusPin}도 함께 연결되어 있습니다.`,
            componentName: component.name,
            ruleId: 'netlist.mcp3208-channel-mode-review',
            recommendation: '설정이 single-ended인지 pseudo-differential인지 다시 확인해 주세요.',
          }));
        }
        if (sharedSource) {
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.mcp3208-pseudodiff-review',
            title: 'MCP3208 pseudo-differential 입력 검토',
            message: `${component.name}에서 ${plusPin}/${minusPin} 채널쌍의 pseudo-differential 사용이 감지되었습니다.`,
            componentName: component.name,
            ruleId: 'netlist.mcp3208-pseudodiff-review',
            recommendation: '선택한 채널쌍이 의도한 극성과 맞는지, 기준 채널과 신호 채널이 뒤바뀌지 않았는지 확인해 주세요.',
          }));
        }
        continue;
      }

      if (configuredSingleEnded && plusConnected && !minusConnected) {
        continue;
      }

      issues.push(createProjectAuditIssue({
        severity: configuredPseudoDifferential ? 'warning' : 'info',
          code: 'netlist.mcp3208-input-mode-review',
          title: 'MCP3208 입력 모드 검토',
        message:
          configuredPseudoDifferential
            ? `${component.name}의 프로젝트 설정은 ${plusPin}/${minusPin} pseudo-differential인데 현재 한쪽만 연결되어 있습니다.`
            : `${component.name}에서 ${plusPin}/${minusPin} 채널쌍 중 한쪽만 연결되어 있습니다.`,
        componentName: component.name,
        ruleId: 'netlist.mcp3208-input-mode-review',
        recommendation: 'single-ended 입력 의도인지, pseudo-differential로 쓰려던 채널쌍인지 다시 확인해 주세요.',
      }));
    }
  }

  return issues;
}

function getNetResolvedVoltage(net?: CircuitNet) {
  if (!net) {
    return null;
  }
  return net.solvedVoltage ?? net.knownVoltage ?? null;
}

function buildOpAmpFrontEndIssues(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  nets: CircuitNet[],
  resistors: CircuitResistorElement[],
  capacitors: CircuitCapacitorElement[],
  netIdByNodeKey: Map<string, string>,
  adcConfigurations?: ProjectAdcConfigurations
) {
  const issues: ProjectAuditIssue[] = [];
  const netById = new Map(nets.map(net => [net.id, net]));

  for (const component of components) {
    const template = resolveTemplate(component.templateId);
    if (!template || !isLikelyAnalogAmplifierTemplate(template)) {
      continue;
    }

    const rolePins = new Map<string, string>();
    for (const pin of template.requiredPins) {
      const role = normalizeOpAmpPinRole(pin.name);
      if (role && !rolePins.has(role)) {
        rolePins.set(role, pin.name);
      }
    }

    const outPin = rolePins.get('out');
    const invertingPin = rolePins.get('inverting');
    const nonInvertingPin = rolePins.get('non-inverting');
    const groundPin = rolePins.get('ground');

    if (!outPin || !invertingPin || !nonInvertingPin || !groundPin) {
      continue;
    }

    const outNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, outPin));
    const invertingNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, invertingPin));
    const nonInvertingNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, nonInvertingPin));
    const groundNetId = netIdByNodeKey.get(getComponentPinNodeKey(component, groundPin));
    const powerPin = rolePins.get('power');
    const powerNetId = powerPin ? netIdByNodeKey.get(getComponentPinNodeKey(component, powerPin)) : undefined;
    const opAmpProfile = getLikelyOpAmpProfile(component);

    if (!outNetId || !invertingNetId || !nonInvertingNetId || !groundNetId) {
      continue;
    }

    if (outNetId !== invertingNetId && !hasResistorBetweenNets(outNetId, invertingNetId, resistors)) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.opamp-feedback-missing',
        title: 'OP-Amp 피드백 저항망 미확인',
        message: `${component.name}의 출력(${outPin})과 반전 입력(${invertingPin}) 사이에서 피드백 저항 경로를 찾지 못했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.opamp-feedback-missing',
        recommendation: '비반전/반전 증폭기 모두 출력에서 반전 입력으로 돌아가는 피드백 경로가 있어야 동작점이 안정됩니다. 의도한 이득에 맞는 저항망을 확인해 주세요.',
      }));
    }

    const couplingCaps = capacitors.filter(capacitor => {
      const touchesBiasNet = capacitor.netA === nonInvertingNetId || capacitor.netB === nonInvertingNetId;
      if (!touchesBiasNet) {
        return false;
      }
      const peerNetId = capacitor.netA === nonInvertingNetId ? capacitor.netB : capacitor.netA;
      if (peerNetId === groundNetId || peerNetId === outNetId || peerNetId === invertingNetId) {
        return false;
      }
      return true;
    });

    const nonInvResistors = findResistorsTouchingNet(nonInvertingNetId, resistors);
    const hasBiasToGround = nonInvResistors.some(resistor => {
      const peerNet = netById.get(getPeerNetIdForResistor(nonInvertingNetId, resistor) ?? '');
      return Boolean(peerNet && isGroundCircuitNet(peerNet));
    });
    const hasBiasToPower = nonInvResistors.some(resistor => {
      const peerNet = netById.get(getPeerNetIdForResistor(nonInvertingNetId, resistor) ?? '');
      return Boolean(peerNet && isPowerCircuitNet(peerNet));
    });

    if (couplingCaps.length > 0 && (!hasBiasToGround || !hasBiasToPower)) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.analog-bias-midpoint-missing',
        title: 'AC 결합 입력 바이어스 기준점 미확인',
        message: `${component.name}의 비반전 입력(${nonInvertingPin})에 AC coupling 경로가 보이지만, 입력 기준 전위를 잡아줄 midpoint 바이어스 저항망을 찾지 못했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.analog-bias-midpoint-missing',
        recommendation: '단일 전원 OP-Amp 입력이라면 보통 비반전 입력에 전원/GND 기준의 바이어스 분압을 두어 중간 기준점을 만들어 줍니다.',
      }));
    }

    if (couplingCaps.length > 0 && hasBiasToGround && hasBiasToPower) {
      const hasMidpointBypassCap = capacitors.some(capacitor => {
        return (
          (capacitor.netA === nonInvertingNetId && capacitor.netB === groundNetId) ||
          (capacitor.netB === nonInvertingNetId && capacitor.netA === groundNetId)
        );
      });

      if (!hasMidpointBypassCap) {
        issues.push(createProjectAuditIssue({
          severity: 'info',
          code: 'netlist.virtual-ground-bypass-missing',
          title: '가상접지 바이패스 커패시터 권장',
          message: `${component.name}의 비반전 입력 기준점(${nonInvertingPin})에는 분압 midpoint가 보이지만, 이를 안정화하는 GND 기준 바이패스 커패시터를 찾지 못했습니다.`,
          componentName: component.name,
          ruleId: 'netlist.virtual-ground-bypass-missing',
          recommendation: '가상접지나 bias midpoint에는 보통 수십 nF~수 uF 범위의 커패시터를 추가해 노이즈와 입력 흔들림을 줄이는 편이 안전합니다.',
        }));
      }
    }

    const invertingResistors = findResistorsTouchingNet(invertingNetId, resistors);
    const feedbackResistors = invertingResistors.filter(resistor => {
      const peerNetId = getPeerNetIdForResistor(invertingNetId, resistor);
      return peerNetId === outNetId;
    });
    const groundLegResistors = invertingResistors.filter(resistor => {
      const peerNet = netById.get(getPeerNetIdForResistor(invertingNetId, resistor) ?? '');
      return Boolean(peerNet && isGroundCircuitNet(peerNet));
    });
    const inputResistors = invertingResistors.filter(resistor => {
      const peerNet = netById.get(getPeerNetIdForResistor(invertingNetId, resistor) ?? '');
      if (!peerNet) {
        return false;
      }
      return peerNet.id !== outNetId && !isGroundCircuitNet(peerNet) && !isPowerCircuitNet(peerNet);
    });
    const invertingNet = netById.get(invertingNetId);
    const hasDirectExternalDriveOnInvertingNet =
      invertingNet?.nodes.some(node => {
        if (node.ownerType === 'board') {
          return true;
        }
        if (node.ownerId === component.instanceId) {
          return false;
        }
        const peerComponent = components.find(candidate => candidate.instanceId === node.ownerId);
        const peerTemplate = peerComponent ? resolveTemplate(peerComponent.templateId) : undefined;
        return peerTemplate?.category !== 'PASSIVE';
      }) ?? false;

    if (
      feedbackResistors.length > 0 &&
      inputResistors.length === 0 &&
      hasDirectExternalDriveOnInvertingNet &&
      (hasBiasToGround || hasBiasToPower || invertingNetId !== nonInvertingNetId)
    ) {
      issues.push(createProjectAuditIssue({
        severity: 'warning',
        code: 'netlist.opamp-inverting-input-resistor-missing',
        title: '반전 입력 저항망 미확인',
        message: `${component.name}의 반전 입력(${invertingPin})에는 피드백 경로가 보이지만, 외부 소스에서 들어오는 입력 저항을 찾지 못했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.opamp-inverting-input-resistor-missing',
        recommendation: '반전 증폭기라면 소스에서 반전 입력으로 들어가는 입력 저항과 출력에서 되돌아오는 피드백 저항이 함께 있어야 이득이 정의됩니다.',
      }));
    }

    if (feedbackResistors.length > 0 && inputResistors.length > 0) {
      const feedbackOhms = Math.min(...feedbackResistors.map(resistor => resistor.resistanceOhms));
      const inputOhms = Math.min(...inputResistors.map(resistor => resistor.resistanceOhms));
      if (inputOhms > 0) {
        const gainRatio = feedbackOhms / inputOhms;
        if (gainRatio > 100 || gainRatio < 0.1) {
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.opamp-gain-sanity-review',
            title: 'OP-Amp 이득비 검토 권장',
            message: `${component.name}의 반전 입력 저항망에서 추정 이득비 |Rf/Rin|가 약 ${gainRatio.toFixed(1)}배로 보입니다.`,
            componentName: component.name,
            ruleId: 'netlist.opamp-gain-sanity-review',
            recommendation: '의도한 증폭도인지, 대역폭/노이즈/포화 여유를 감안한 값인지 다시 확인해 주세요. 너무 큰 이득은 안정성과 노이즈에 민감할 수 있습니다.',
          }));
        }
      }
    }

    if (feedbackResistors.length > 0 && groundLegResistors.length > 0) {
      const feedbackOhms = Math.min(...feedbackResistors.map(resistor => resistor.resistanceOhms));
      const groundLegOhms = Math.min(...groundLegResistors.map(resistor => resistor.resistanceOhms));
      if (groundLegOhms > 0) {
        const nonInvertingGain = 1 + feedbackOhms / groundLegOhms;
        if (nonInvertingGain > 100 || nonInvertingGain < 1.1) {
          issues.push(createProjectAuditIssue({
            severity: 'info',
            code: 'netlist.opamp-noninverting-gain-sanity-review',
            title: '비반전 OP-Amp 이득 검토 권장',
            message: `${component.name}의 비반전 저항망에서 추정 이득 (1 + Rf/Rg)이 약 ${nonInvertingGain.toFixed(1)}배로 보입니다.`,
            componentName: component.name,
            ruleId: 'netlist.opamp-noninverting-gain-sanity-review',
            recommendation: '의도한 증폭도인지 다시 확인해 주세요. 너무 큰 이득은 포화와 노이즈, 너무 작은 이득은 굳이 증폭단을 둘 이유가 약해질 수 있습니다.',
          }));
        }

        const nonInvInputNet = netById.get(nonInvertingNetId);
        const nonInvInputVoltage = getNetResolvedVoltage(nonInvInputNet);
        const outNet = netById.get(outNetId);
        const outputVoltage = getNetResolvedVoltage(outNet);
        const positiveRailVoltage = getNetResolvedVoltage(powerNetId ? netById.get(powerNetId) : undefined);
        const groundVoltage = getNetResolvedVoltage(netById.get(groundNetId)) ?? 0;
        const outputAdcEndpoints = outNet
          ? getAdcSinkEndpointsForNet(outNet, components, boardId, resolveTemplate, netIdByNodeKey, netById, adcConfigurations)
          : [];
        const gainEstimatedOutputVoltage =
          typeof nonInvInputVoltage === 'number'
            ? nonInvInputVoltage * nonInvertingGain
            : null;
        const estimatedOutputVoltage =
          typeof outputVoltage === 'number' && typeof gainEstimatedOutputVoltage === 'number'
            ? Math.max(outputVoltage, gainEstimatedOutputVoltage)
            : typeof outputVoltage === 'number'
              ? outputVoltage
              : gainEstimatedOutputVoltage;

        if (opAmpProfile) {
          const estimatedClosedLoopBandwidthHz = opAmpProfile.gbwHz / nonInvertingGain;
          if (estimatedClosedLoopBandwidthHz < 20_000) {
            issues.push(createProjectAuditIssue({
              severity: 'info',
              code: 'netlist.opamp-gbw-review',
              title: 'OP-Amp GBW 대비 폐루프 대역폭 검토',
              message: `${component.name}(${opAmpProfile.family})의 추정 폐루프 이득이 약 ${nonInvertingGain.toFixed(1)}배라면, GBW 기준 대역폭이 약 ${(estimatedClosedLoopBandwidthHz / 1_000).toFixed(1)}kHz 수준으로 내려갈 수 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.opamp-gbw-review',
              recommendation: '필요한 신호 대역폭보다 충분히 큰지 확인하고, 필요하면 더 높은 GBW OP-Amp나 낮은 폐루프 이득 분배를 검토해 주세요.',
            }));
          }
        }

        if (
          opAmpProfile &&
          !opAmpProfile.railToRailOutput &&
          typeof positiveRailVoltage === 'number' &&
          typeof estimatedOutputVoltage === 'number'
        ) {
          const maxLikelyOutputVoltage = positiveRailVoltage - opAmpProfile.outputHighHeadroomV;
          if (estimatedOutputVoltage > maxLikelyOutputVoltage + 1e-6) {
            issues.push(createProjectAuditIssue({
              severity: 'info',
              code: 'netlist.opamp-output-headroom-review',
              title: 'OP-Amp 출력 스윙 여유 검토',
              message: `${component.name}(${opAmpProfile.family}) 출력은 약 ${estimatedOutputVoltage.toFixed(2)}V까지 요구될 수 있어 보이지만, 전원 ${positiveRailVoltage.toFixed(2)}V 기준 비 rail-to-rail 출력 여유를 감안하면 상단 스윙 한계가 약 ${maxLikelyOutputVoltage.toFixed(2)}V 수준일 수 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.opamp-output-headroom-review',
              recommendation: '출력 스윙이 ADC/reference 범위 안에 실제로 들어오는지 데이터시트를 확인하고, 필요하면 rail-to-rail 출력 소자나 더 높은 전원을 검토해 주세요.',
            }));
          }

          const minLikelyOutputVoltage = groundVoltage + opAmpProfile.outputLowHeadroomV;
          if (estimatedOutputVoltage < minLikelyOutputVoltage - 1e-6) {
            issues.push(createProjectAuditIssue({
              severity: 'info',
              code: 'netlist.opamp-output-headroom-review',
              title: 'OP-Amp 출력 스윙 여유 검토',
              message: `${component.name}(${opAmpProfile.family}) 출력은 약 ${estimatedOutputVoltage.toFixed(2)}V까지 내려가야 할 수 있어 보이지만, 하단 출력 스윙 여유를 감안하면 약 ${minLikelyOutputVoltage.toFixed(2)}V 아래로 충분히 내려가지 못할 수 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.opamp-output-headroom-review',
              recommendation: '단일 전원에서 하단 스윙이 필요한 경우 rail-to-rail 출력 소자나 바이어스 재설계를 검토해 주세요.',
            }));
          }
        }

        if (outputAdcEndpoints.length > 0) {
          const limitingEndpoint = outputAdcEndpoints
            .filter(endpoint => typeof endpoint.nominalVoltage === 'number')
            .sort((left, right) => (left.nominalVoltage ?? Number.POSITIVE_INFINITY) - (right.nominalVoltage ?? Number.POSITIVE_INFINITY))[0];
          if (
            limitingEndpoint &&
            typeof limitingEndpoint.nominalVoltage === 'number' &&
            typeof estimatedOutputVoltage === 'number' &&
            estimatedOutputVoltage > limitingEndpoint.nominalVoltage + 1e-6
          ) {
            issues.push(createProjectAuditIssue({
              severity: 'warning',
              code: 'netlist.opamp-output-adc-range-review',
              title: 'OP-Amp 출력의 ADC 범위 초과 가능성',
              message: `${component.name} 출력이 연결된 ADC 라인에서 약 ${estimatedOutputVoltage.toFixed(2)}V 수준이 예상되어, ${limitingEndpoint.label} 기준 ADC 범위 ${limitingEndpoint.nominalVoltage.toFixed(2)}V를 넘길 수 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.opamp-output-adc-range-review',
              recommendation: '이득을 낮추거나, 바이어스/입력 범위를 재조정하거나, ADC 기준전압 안으로 들어오도록 감쇠를 추가해 주세요.',
            }));
          }
        }
      }
    }

    const veryHighInputResistanceReviewThreshold = isLikelyNonRailToRailOpAmp(component) ? 500_000 : 1_000_000;
    const candidateInputResistors = [
      ...inputResistors,
      ...groundLegResistors,
      ...nonInvResistors,
    ].filter((resistor, index, array) => array.findIndex(item => item.id === resistor.id) === index);
    if (
      candidateInputResistors.length > 0 &&
      candidateInputResistors.some(resistor => resistor.resistanceOhms >= veryHighInputResistanceReviewThreshold)
    ) {
      const maxOhms = Math.max(...candidateInputResistors.map(resistor => resistor.resistanceOhms));
      issues.push(createProjectAuditIssue({
        severity: 'info',
        code: 'netlist.opamp-input-bias-current-review',
        title: 'OP-Amp 입력 바이어스 전류 민감도 검토',
        message: `${component.name} 입력 주변 저항 중 일부가 최대 약 ${Math.round(maxOhms)}Ω로 커 보여, 입력 바이어스 전류와 누설에 따른 오프셋 영향이 커질 수 있습니다.`,
        componentName: component.name,
        ruleId: 'netlist.opamp-input-bias-current-review',
        recommendation: '특히 LM358/LM324 같은 범용 OP-Amp에서는 입력 저항을 너무 크게 잡으면 오프셋과 잡음 영향이 커질 수 있습니다. 수십 kΩ~수백 kΩ 범위가 더 나은지 검토해 주세요.',
      }));
    }

    if (isLikelyNonRailToRailOpAmp(component) && powerNetId) {
      const powerNet = netById.get(powerNetId);
      const positiveRailVoltage = powerNet?.solvedVoltage ?? powerNet?.knownVoltage ?? null;
      if (typeof positiveRailVoltage === 'number') {
        const inputNetIds = [invertingNetId, nonInvertingNetId];
        for (const inputNetId of inputNetIds) {
          const inputNet = netById.get(inputNetId);
          const inputVoltage = inputNet?.solvedVoltage ?? inputNet?.knownVoltage ?? null;
          if (typeof inputVoltage !== 'number') {
            continue;
          }
          if (inputVoltage >= positiveRailVoltage - 1.2) {
            issues.push(createProjectAuditIssue({
              severity: 'info',
              code: 'netlist.opamp-common-mode-headroom-review',
              title: 'OP-Amp 입력 common-mode 여유 검토',
              message: `${component.name} 입력 중 하나가 약 ${inputVoltage.toFixed(2)}V로 보이며, 전원 상단 ${positiveRailVoltage.toFixed(2)}V에 가까워 non rail-to-rail OP-Amp의 입력 범위를 벗어날 수 있습니다.`,
              componentName: component.name,
              ruleId: 'netlist.opamp-common-mode-headroom-review',
              recommendation: '해당 OP-Amp의 input common-mode range를 확인하고, 필요하면 rail-to-rail 입력 소자나 더 낮은 바이어스 전위를 검토해 주세요.',
            }));
            break;
          }
        }
      }
    }
  }

  return issues;
}

export function analyzeCircuitNetlist(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  manualConnections: ManualNetConnection[] = [],
  options: CircuitAnalysisOptions = {}
): CircuitAnalysisReport {
  const flattened = flattenSubCircuitProject(components, manualConnections, resolveTemplate);
  const flatComponents = flattened.components;
  const flatConnections = flattened.manualConnections;
  const unionFind = new UnionFind();
  const { nodes } = buildCircuitNodes(flatComponents, boardId, resolveTemplate, flatConnections);
  const connections = buildWireConnections(flatComponents, flatConnections);

  for (const connection of connections) {
    unionFind.add(connection.a);
    unionFind.add(connection.b);
    unionFind.union(connection.a, connection.b);
  }

  for (const nodeKey of nodes.keys()) {
    unionFind.add(nodeKey);
  }

  const groupedNodes = new Map<string, CircuitNodeRef[]>();
  for (const [nodeKey, node] of nodes.entries()) {
    const root = unionFind.find(nodeKey);
    const current = groupedNodes.get(root) ?? [];
    current.push(node);
    groupedNodes.set(root, current);
  }

  const nets: CircuitNet[] = Array.from(groupedNodes.values()).map((grouped, index) => {
    const boardNodes = grouped.filter(node => node.ownerType === 'board');
    const knownVoltages = boardNodes
      .map(node => getBoardSignalLimits(boardId, node.pinId))
      .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
      .map(spec => spec.isGround ? 0 : spec.isPower ? spec.nominal : null)
      .filter((voltage): voltage is number => typeof voltage === 'number');

    const uniqueVoltages = Array.from(new Set(knownVoltages));

    return {
      id: `NET_${index + 1}`,
      nodes: grouped.sort((a, b) => a.label.localeCompare(b.label)),
      knownVoltage: uniqueVoltages.length === 1 ? uniqueVoltages[0] : null,
      solvedVoltage: uniqueVoltages.length === 1 ? uniqueVoltages[0] : null,
      sourceLabels: boardNodes
        .filter(node => node.electricalType === 'power' || node.electricalType === 'ground')
        .map(node => node.pinId),
    };
  });

  const netIdByNodeKey = new Map<string, string>();
  for (const net of nets) {
    for (const node of net.nodes) {
      netIdByNodeKey.set(node.key, net.id);
    }
  }

  applyBoardPinDriveStates(nets, boardId, options.boardPinDriveStates ?? []);

  const resistors: CircuitResistorElement[] = [];
  const lowImpedanceLinks: CircuitLowImpedanceLink[] = [];
  const capacitors: CircuitCapacitorElement[] = [];
  const diodes: CircuitDiodeElement[] = [];
  const issues: ProjectAuditIssue[] = [];
  for (const component of flatComponents) {
    if (component.templateId === 'tpl_inductor') {
      const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, '1'));
      const netB = netIdByNodeKey.get(getComponentPinNodeKey(component, '2'));
      if (netA && netB && netA !== netB) {
        lowImpedanceLinks.push({
          id: component.instanceId,
          componentId: component.instanceId,
          componentName: component.name,
          kind: 'inductor',
          netA,
          netB,
          impedanceOhms: 0.01,
        });
      }
    }

    if (component.templateId !== 'tpl_resistor') {
      if (component.templateId === 'tpl_capacitor') {
        const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, '1'));
        const netB = netIdByNodeKey.get(getComponentPinNodeKey(component, '2'));
        if (netA && netB && netA !== netB) {
          const componentValue = getComponentAnalysisValue(component);
          const parsedCapacitance = parseCapacitanceFarads(componentValue);
          const parsedVoltageRating = parseVoltageRating(componentValue);
          capacitors.push({
            id: component.instanceId,
            componentId: component.instanceId,
            componentName: component.name,
            value: componentValue,
            packageHint: `${component.importedMapping?.footprint ?? ''} ${component.importedMapping?.libraryId ?? ''}`.trim() || undefined,
            capacitanceFarads: parsedCapacitance.capacitanceFarads,
            voltageRatingV: parsedVoltageRating.voltageV ?? undefined,
            netA,
            netB,
          });
        }
      }

      if (component.templateId === 'tpl_diode') {
        const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, 'A'));
        const netK = netIdByNodeKey.get(getComponentPinNodeKey(component, 'K'));
        if (netA && netK && netA !== netK) {
          diodes.push({
            id: component.instanceId,
            componentId: component.instanceId,
            componentName: component.name,
            netA,
            netK,
            value: component.value,
            forwardVoltageDrop: inferDiodeForwardVoltage(component),
            kind: 'diode',
          });
        }
      }

      if (component.templateId === 'tpl_led') {
        const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, 'Signal'));
        const netK = netIdByNodeKey.get(getComponentPinNodeKey(component, 'GND'));
        if (netA && netK && netA !== netK) {
          diodes.push({
            id: component.instanceId,
            componentId: component.instanceId,
            componentName: component.name,
            netA,
            netK,
            value: component.value,
            forwardVoltageDrop: inferLedForwardVoltage(component),
            kind: 'led',
          });
        }
      }

      if (component.templateId === 'tpl_rgb_led') {
        const netK = netIdByNodeKey.get(getComponentPinNodeKey(component, 'GND'));
        if (netK) {
          for (const channel of ['R', 'G', 'B'] as const) {
            const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, channel));
            if (!netA || netA === netK) {
              continue;
            }

            diodes.push({
              id: `${component.instanceId}-${channel}`,
              componentId: component.instanceId,
              componentName: `${component.name} ${channel}`,
              netA,
              netK,
              value: component.value,
              forwardVoltageDrop: inferLedForwardVoltage(component, channel),
              kind: 'led',
            });
          }
        }
      }

      continue;
    }

    const netA = netIdByNodeKey.get(getComponentPinNodeKey(component, '1'));
    const netB = netIdByNodeKey.get(getComponentPinNodeKey(component, '2'));
    if (!netA || !netB || netA === netB) {
      continue;
    }

    const componentValue = getComponentAnalysisValue(component);
    const parsedResistance = parseResistanceOhms(componentValue);
    resistors.push({
      id: component.instanceId,
      componentId: component.instanceId,
      componentName: component.name,
      value: componentValue,
      packageHint: `${component.importedMapping?.footprint ?? ''} ${component.importedMapping?.libraryId ?? ''}`.trim() || undefined,
      resistanceOhms: parsedResistance.resistanceOhms,
      powerRatingW: inferResistorPowerRatingW(component),
      netA,
      netB,
    });

    if (parsedResistance.resistanceOhms <= 0.1) {
      lowImpedanceLinks.push({
        id: component.instanceId,
        componentId: component.instanceId,
        componentName: component.name,
        kind: 'resistor',
        netA,
        netB,
        impedanceOhms: parsedResistance.resistanceOhms,
      });
    }

    if (parsedResistance.usedFallback) {
      issues.push(createProjectAuditIssue({
        severity: 'info',
        code: 'netlist.resistor-value-fallback',
        params: {
          componentName: component.name,
          rawValue: parsedResistance.reason === 'missing' ? '' : (componentValue ?? ''),
        },
        title: '저항값 파싱 확인 필요',
        message:
          parsedResistance.reason === 'missing'
            ? `${component.name} 값이 비어 있어 회로 해석에서는 기본 220옴으로 계산했습니다.`
            : `${component.name} 값 "${componentValue ?? ''}"을(를) 저항값으로 해석하지 못해 회로 해석에서는 기본 220옴으로 계산했습니다.`,
        componentName: component.name,
        ruleId: 'netlist.resistor-value-fallback',
        recommendation: '저항 값을 220, 1k, 10k, 1M 같은 형식으로 명확히 입력해 해석 결과가 왜곡되지 않도록 맞춰 주세요.',
      }));
    }
  }

  resistors.push(...buildVirtualDriveResistors(nets, boardId, options.boardPinDriveStates ?? []));

  const solveResult = solveNetworkVoltages(nets, resistors, diodes);

  if (!solveResult.converged && (resistors.length > 0 || diodes.length > 0)) {
    issues.push(createProjectAuditIssue({
      severity: 'warning',
      code: 'netlist.solver-convergence',
      params: {
        solverMode: solveResult.mode === 'nonlinear' ? '비선형 DC' : '선형 DC',
      },
      title: '회로 해석 수렴 검토 필요',
      message:
        solveResult.mode === 'nonlinear'
          ? `비선형 DC 해석이 ${solveResult.iterations}회 반복 후에도 안정적으로 수렴하지 않았습니다.`
          : '선형 DC 해석 중 수치적으로 안정적인 해를 찾지 못했습니다.',
      ruleId: 'netlist.solver-convergence',
      recommendation: '다이오드/전원 방향, 떠 있는 노드, 비현실적인 부품값을 다시 확인한 뒤 회로를 단순화해 재검증하세요.',
    }));
  }

  issues.push(
    ...buildPowerConflictIssues(nets),
    ...buildLowImpedancePowerIssues(nets, lowImpedanceLinks),
    ...buildSolvedVoltageIssues(nets, boardId),
    ...buildDiodeIssues(diodes, nets),
    ...buildInductiveFlybackIssues(flatComponents, resolveTemplate, netIdByNodeKey, diodes, nets, lowImpedanceLinks),
    ...buildPowerInductorReviewIssues(flatComponents, netIdByNodeKey, nets),
    ...buildLedIssues(diodes.filter(diode => diode.kind === 'led'), nets, resistors),
    ...buildResistorPowerIssues(nets, resistors),
    ...buildCapacitorVoltageIssues(nets, capacitors),
    ...buildI2cBusIntegrityIssues(nets, resistors, flatComponents, boardId, resolveTemplate, netIdByNodeKey),
    ...buildPinoutMismatchIssues(flatComponents, resolveTemplate),
    ...buildRcFilterIssues(nets, resistors, capacitors),
    ...buildAdcSourceImpedanceIssues(nets, resistors, flatComponents, boardId, resolveTemplate, netIdByNodeKey, options.adcConfigurations),
    ...buildAnalogSensorBufferIssues(nets, flatComponents, boardId, resolveTemplate, netIdByNodeKey),
    ...buildHx711FrontEndIssues(nets, flatComponents, resolveTemplate, capacitors, netIdByNodeKey),
    ...buildExternalAdcFrontEndIssues(nets, flatComponents, resolveTemplate, resistors, capacitors, netIdByNodeKey, options.adcConfigurations),
    ...buildDecouplingIssues(flatComponents, resolveTemplate, capacitors, netIdByNodeKey),
    ...buildOpAmpFrontEndIssues(flatComponents, boardId, resolveTemplate, nets, resistors, capacitors, netIdByNodeKey, options.adcConfigurations),
  );

  return {
    nets,
    resistors,
    capacitors,
    diodes,
    issues,
  };
}

export function toSpiceNetlistFromAnalysis(
  report: CircuitAnalysisReport,
  options: SpiceNetlistBuildOptions = {}
) {
  const title = options.title ?? 'ModuMake generated SPICE netlist';
  const analysisDirective = options.analysisDirective ?? '.op';
  const lines: string[] = [`* ${title}`];
  const nodeNames = new Map<string, string>();

  report.nets.forEach((net, index) => {
    nodeNames.set(net.id, getSpiceNodeName(net, index));
  });

  let sourceIndex = 1;
  let hasGroundNode = false;
  for (const net of report.nets) {
    const nodeName = nodeNames.get(net.id);
    if (!nodeName || nodeName === '0') {
      if (nodeName === '0') {
        hasGroundNode = true;
      }
      continue;
    }

    if (typeof net.knownVoltage === 'number') {
      lines.push(getComponentDebugComment(net.sourceLabels.join(', ') || net.id, `known rail -> ${nodeName}`));
      lines.push(`${spiceMapper.voltageSource.prefix}${sourceIndex} ${nodeName} 0 DC ${formatSpiceNumber(net.knownVoltage)}`);
      sourceIndex += 1;
    }
  }

  report.resistors.forEach((resistor, index) => {
    lines.push(getComponentDebugComment(resistor.componentName, `${resistor.netA} <-> ${resistor.netB}`));
    lines.push(
      `${spiceMapper.resistor.prefix}${index + 1} ${nodeNames.get(resistor.netA) ?? resistor.netA} ${nodeNames.get(resistor.netB) ?? resistor.netB} ${formatSpiceNumber(resistor.resistanceOhms)}`
    );
  });

  (report.capacitors ?? []).forEach((capacitor, index) => {
    lines.push(getComponentDebugComment(capacitor.componentName, `${capacitor.netA} <-> ${capacitor.netB}`));
    lines.push(
      `${spiceMapper.capacitor.prefix}${index + 1} ${nodeNames.get(capacitor.netA) ?? capacitor.netA} ${nodeNames.get(capacitor.netB) ?? capacitor.netB} ${formatSpiceNumber(capacitor.capacitanceFarads)}`
    );
  });

  const diodeModelStatements = new Set<string>();
  (report.diodes ?? []).forEach((diode, index) => {
    const mapped = diode.kind === 'led' ? spiceMapper.led : spiceMapper.diode;
    if (mapped.modelStatement) {
      diodeModelStatements.add(mapped.modelStatement);
    }
    lines.push(getComponentDebugComment(diode.componentName, `${diode.netA} -> ${diode.netK}`));
    lines.push(
      `${mapped.prefix}${index + 1} ${nodeNames.get(diode.netA) ?? diode.netA} ${nodeNames.get(diode.netK) ?? diode.netK} ${mapped.model}`
    );
  });

  if (!hasGroundNode) {
    lines.push('* warning: no explicit GND net detected in exported circuit');
  }

  lines.push(...Array.from(diodeModelStatements.values()));

  lines.push(analysisDirective, '.end');
  return `${lines.join('\n')}\n`;
}

export function toSpiceNetlist(
  components: PlacedComponent[],
  boardId: string,
  resolveTemplate: (templateId: string) => ComponentTemplate | undefined,
  manualConnections: ManualNetConnection[] = [],
  options: SpiceNetlistBuildOptions = {},
  analysisOptions: CircuitAnalysisOptions = {}
) {
  const report = analyzeCircuitNetlist(components, boardId, resolveTemplate, manualConnections, analysisOptions);
  return toSpiceNetlistFromAnalysis(report, options);
}
