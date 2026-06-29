import type {
  ComponentTemplate,
  ComponentDesignRules,
  ManualNetConnection,
  PlacedComponent,
  RequiredPin,
  VoltageCompatibility,
} from '@/types';

export function makeTemplate(params: {
  id: string;
  name: string;
  pins: RequiredPin[];
  compatibleVoltage?: VoltageCompatibility;
  category?: ComponentTemplate['category'];
  design?: ComponentDesignRules;
}): ComponentTemplate {
  return {
    id: params.id,
    name: params.name,
    category: params.category ?? 'SENSOR',
    description: `${params.name} test template`,
    icon: 'TestTube2',
    compatibleVoltage: params.compatibleVoltage ?? 'BOTH',
    requiredPins: params.pins,
    design: params.design,
  };
}

export function makeComponent(params: {
  instanceId: string;
  templateId: string;
  name: string;
  assignedPins?: Record<string, string>;
  value?: string;
}): PlacedComponent {
  return {
    instanceId: params.instanceId,
    templateId: params.templateId,
    name: params.name,
    value: params.value,
    position: { x: 0, y: 0 },
    rotation: 0,
    assignedPins: params.assignedPins ?? {},
    isFullyRouted: true,
  };
}

export function makeManualConnection(
  id: string,
  source: ManualNetConnection['source'],
  target: ManualNetConnection['target']
): ManualNetConnection {
  return { id, source, target };
}
