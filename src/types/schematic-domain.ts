export interface SchematicPoint {
  readonly x: number; // Integer micrometers
  readonly y: number;
}

export type LabelKind = 'local' | 'global' | 'hierarchical';

export interface SchematicLabel {
  readonly text: string;
  readonly kind: LabelKind;
  readonly position: SchematicPoint;
  readonly angle: 0 | 90 | 180 | 270;
}

export interface NoConnectMarker {
  readonly position: SchematicPoint;
}

export interface SchematicPin {
  readonly number: string;
  readonly name: string;
  readonly electricalType: string;
  readonly localPosition: SchematicPoint;
  readonly absoluteAnchor: SchematicPoint;
  readonly angle: 0 | 90 | 180 | 270;
}

export interface SchematicSymbol {
  readonly uuid: string;
  readonly libId: string;
  readonly reference: string;
  readonly value: string;
  readonly footprint?: string;
  readonly position: SchematicPoint;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mirrorX: boolean;
  readonly mirrorY: boolean;
  readonly pins: SchematicPin[];
}

export interface SchematicWire {
  readonly start: SchematicPoint;
  readonly end: SchematicPoint;
}

export interface SchematicSheetPin {
  readonly name: string;
  readonly position: SchematicPoint;
}

export interface SchematicSheet {
  readonly name: string;
  readonly file: string;
  readonly start: SchematicPoint;
  readonly end: SchematicPoint;
  readonly pins: SchematicSheetPin[];
}

export interface SchematicDomainModel {
  readonly symbols: SchematicSymbol[];
  readonly wires: SchematicWire[];
  readonly junctions: SchematicPoint[];
  readonly labels: SchematicLabel[];
  readonly noConnects: NoConnectMarker[];
  readonly sheets: SchematicSheet[];
  readonly unresolvedSymbols: import('@/types').UnifiedCircuitUnresolvedSymbol[];
  readonly ignoredNonElectricalSymbols: import('@/types').UnifiedCircuitIgnoredSymbol[];
  readonly nonComponentMarkers: import('@/types').UnifiedCircuitIgnoredSymbol[];
}
