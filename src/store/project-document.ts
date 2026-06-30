import { getInitialPins } from '@/constants/board-pins';
import { enrichComponentTemplate, getStaticTemplateById } from '@/constants/component-templates';
import { getBoardById } from '@/constants/boards';
import { buildPcbDocument } from '@/lib/pcb-document';
import { validateCustomComponentPackage } from '@/lib/custom-component-packages';
import { hasImportedSchematicSceneContent } from '@/lib/component-template-utils';
import { layoutImportedGeometry } from '@/lib/imported-schematic-geometry';
import { validateImportedPcbDocument } from '@/lib/imported-pcb-validation';
import { importKiCadSchematic } from '@/lib/kicad-sch-parser';
import { parseKiCadPcb } from '@/lib/kicad-pcb-parser';
import { normalizeValidationReviewDecision } from '@/lib/issue-feedback';
import { sanitizeMultilineText, sanitizePlainText } from '@/lib/security-input';
import { resolveAppLanguage } from '@/lib/ui-language';
import { resolvePlacedComponentValue } from '@/store/store-helpers';
import type {
  AICodeGenerationMeta,
  AppLanguage,
  BoardPin,
  ComponentTemplate,
  CustomComponentPackage,
  ImportedPcbDocument,
  ImportedPcbValidationReport,
  ImportedSchematicLabel,
  ImportedKiCadMapping,
  ImportedSchematicGeometry,
  ImportedSchematicPoint,
  ImportedSchematicPrimitive,
  ImportedSchematicPageFrame,
  ImportedSchematicScene,
  ImportedSchematicSceneSymbol,
  ImportedSchematicTheme,
  ImportedSchematicViewMode,
  ImportedSchematicSheetFrame,
  ImportedSchematicSheetPin,
  ImportedSchematicWireSegment,
  ImportedSchematicPinAnchor,
  InstalledProjectLibrary,
  ManualNetConnection,
  ManualPadEndpoint,
  ModuMakeProjectData,
  DatasheetReviewInputPayload,
  PlacedComponent,
  ProjectComponentPowerModes,
  ProjectComponentUnusedPinModes,
  ProjectPowerInputMode,
  SubCircuitPortMapping,
  ValidationReviewDecision,
  WorkspaceMode,
  WiringMode,
} from '@/types';

export interface SerializableProjectState {
  projectName: string;
  appLanguage: AppLanguage;
  activeBoardId: string;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicSource: string | null;
  importedPcbDocument: ImportedPcbDocument | null;
  importedPcbSource: string | null;
  importedPcbValidation: ImportedPcbValidationReport | null;
  integratedValidationJson: DatasheetReviewInputPayload | null;
  validationReviewDecisions: Record<string, ValidationReviewDecision>;
  templateCache: Record<string, ComponentTemplate>;
  installedLibraries: InstalledProjectLibrary[];
  generatedCode: string;
  codeError: string | null;
  lastCodeGenerationMeta: AICodeGenerationMeta | null;
  customComponentPackages: CustomComponentPackage[];
  isGuestStudentMode: boolean;
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes: ProjectComponentPowerModes;
  componentUnusedPinModes: ProjectComponentUnusedPinModes;
  workspaceMode: WorkspaceMode;
  wiringMode: WiringMode;
  showGrid: boolean;
  showMinimap: boolean;
  schematicTheme: ImportedSchematicTheme;
  importedSchematicViewMode: ImportedSchematicViewMode;
}

export interface AppliedProjectDocumentState {
  projectName: string;
  appLanguage: AppLanguage;
  activeBoardId: string;
  pins: Record<string, BoardPin>;
  components: PlacedComponent[];
  manualConnections: ManualNetConnection[];
  importedSchematicScene: ImportedSchematicScene | null;
  importedSchematicSource: string | null;
  importedPcbDocument: ImportedPcbDocument | null;
  importedPcbSource: string | null;
  importedPcbValidation: ImportedPcbValidationReport | null;
  integratedValidationJson: DatasheetReviewInputPayload | null;
  validationReviewDecisions: Record<string, ValidationReviewDecision>;
  templateCache: Record<string, ComponentTemplate>;
  installedLibraries: InstalledProjectLibrary[];
  generatedCode: string;
  codeError: string | null;
  lastCodeGenerationMeta: AICodeGenerationMeta | null;
  componentRuntimeStates: Record<string, never>;
  lastCompilerManifest: null;
  customComponentPackages: CustomComponentPackage[];
  isGuestStudentMode: boolean;
  powerInputMode: ProjectPowerInputMode;
  componentPowerModes: ProjectComponentPowerModes;
  componentUnusedPinModes: ProjectComponentUnusedPinModes;
  workspaceMode: WorkspaceMode;
  wiringMode: WiringMode;
  showGrid: boolean;
  showMinimap: boolean;
  schematicTheme: ImportedSchematicTheme;
  importedSchematicViewMode: ImportedSchematicViewMode;
  selectedComponentId: null;
  isGenerating: false;
}

export interface ProjectDocumentOptions {
  defaultBoardId: string;
  defaultProjectName: string;
  projectFileVersion: number;
  workspaceModes: readonly WorkspaceMode[];
  powerInputModes: readonly ProjectPowerInputMode[];
}

function hasRecoverableImportedSchematicState(document: ModuMakeProjectData) {
  return Boolean(
    document.importedSchematicSource?.trim() &&
    (
      document.activeBoardId === 'kicad_generic' ||
      document.components.some(component => Boolean(component.importedGeometry || component.importedReference))
    )
  );
}

function hasCanonicalImportedSchematicSource(source: string | null | undefined) {
  if (!source) {
    return false;
  }

  const normalized = source.trim();
  return (
    normalized.startsWith('(kicad_sch') &&
    normalized.includes('(lib_symbols') &&
    normalized.includes('(symbol')
  );
}

function hasRenderableImportedComponentSnapshot(document: ModuMakeProjectData) {
  const importedComponents = document.components.filter(component =>
    Boolean(component.importedGeometry || component.importedReference)
  );

  if (importedComponents.length === 0) {
    return false;
  }

  return importedComponents.every(component => {
    const geometry = component.importedGeometry;
    if (!geometry) {
      return false;
    }

    const hasVisibleShape = geometry.primitives.some(primitive => primitive.kind !== 'text');
    const hasReferenceOrValueText = geometry.primitives.some(
      primitive =>
        primitive.kind === 'text' &&
        (primitive.role === 'reference' || primitive.role === 'value')
    );
    const hasPinAnchors = geometry.pinAnchors.length > 0;

    return hasVisibleShape || hasPinAnchors || hasReferenceOrValueText;
  });
}

type ImportedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function includeImportedPoint(bounds: ImportedBounds | null, point: ImportedSchematicPoint): ImportedBounds {
  if (!bounds) {
    return {
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    };
  }

  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

function getImportedSceneGeometryBounds(scene: ImportedSchematicScene | null): ImportedBounds | null {
  if (!scene) {
    return null;
  }

  let bounds: ImportedBounds | null = null;

  for (const segment of scene.wireSegments) {
    bounds = includeImportedPoint(bounds, segment.start);
    bounds = includeImportedPoint(bounds, segment.end);
  }

  for (const junction of scene.junctions) {
    bounds = includeImportedPoint(bounds, junction);
  }

  for (const noConnect of scene.noConnects ?? []) {
    bounds = includeImportedPoint(bounds, noConnect);
  }

  for (const label of scene.labels) {
    bounds = includeImportedPoint(bounds, label.at);
  }

  for (const drawing of scene.drawings ?? []) {
    switch (drawing.kind) {
      case 'rect':
        bounds = includeImportedPoint(bounds, drawing.start);
        bounds = includeImportedPoint(bounds, drawing.end);
        bounds = includeImportedPoint(bounds, { x: drawing.start.x, y: drawing.end.y });
        bounds = includeImportedPoint(bounds, { x: drawing.end.x, y: drawing.start.y });
        break;
      case 'polyline':
        for (const point of drawing.points) {
          bounds = includeImportedPoint(bounds, point);
        }
        break;
      case 'circle':
        bounds = includeImportedPoint(bounds, {
          x: drawing.center.x - drawing.radius,
          y: drawing.center.y - drawing.radius,
        });
        bounds = includeImportedPoint(bounds, {
          x: drawing.center.x + drawing.radius,
          y: drawing.center.y + drawing.radius,
        });
        break;
      case 'arc':
        bounds = includeImportedPoint(bounds, drawing.start);
        bounds = includeImportedPoint(bounds, drawing.mid);
        bounds = includeImportedPoint(bounds, drawing.end);
        break;
      case 'text':
        bounds = includeImportedPoint(bounds, drawing.at);
        break;
    }
  }

  for (const frame of scene.sheetFrames ?? []) {
    bounds = includeImportedPoint(bounds, frame.start);
    bounds = includeImportedPoint(bounds, frame.end);
    for (const pin of frame.pins) {
      bounds = includeImportedPoint(bounds, pin.at);
    }
  }

  for (const symbol of scene.symbols ?? []) {
    for (const primitive of symbol.primitives) {
      switch (primitive.kind) {
        case 'rect':
          bounds = includeImportedPoint(bounds, primitive.start);
          bounds = includeImportedPoint(bounds, primitive.end);
          bounds = includeImportedPoint(bounds, { x: primitive.start.x, y: primitive.end.y });
          bounds = includeImportedPoint(bounds, { x: primitive.end.x, y: primitive.start.y });
          break;
        case 'polyline':
          for (const point of primitive.points) {
            bounds = includeImportedPoint(bounds, point);
          }
          break;
        case 'circle':
          bounds = includeImportedPoint(bounds, {
            x: primitive.center.x - primitive.radius,
            y: primitive.center.y - primitive.radius,
          });
          bounds = includeImportedPoint(bounds, {
            x: primitive.center.x + primitive.radius,
            y: primitive.center.y + primitive.radius,
          });
          break;
        case 'arc':
          bounds = includeImportedPoint(bounds, primitive.start);
          bounds = includeImportedPoint(bounds, primitive.mid);
          bounds = includeImportedPoint(bounds, primitive.end);
          break;
        case 'text':
          bounds = includeImportedPoint(bounds, primitive.at);
          break;
      }
    }

    for (const pinAnchor of symbol.pinAnchors) {
      bounds = includeImportedPoint(bounds, pinAnchor.at);
    }
  }

  return bounds;
}

function getImportedComponentBounds(document: ModuMakeProjectData): ImportedBounds | null {
  const importedComponents = document.components.filter(component => Boolean(component.importedGeometry));
  if (importedComponents.length === 0) {
    return null;
  }

  let bounds: ImportedBounds | null = null;

  for (const component of importedComponents) {
    if (!component.importedGeometry) {
      continue;
    }

    const layout = layoutImportedGeometry(component.importedGeometry, component.rotation, undefined, {
      preserveStoredBounds: true,
    });

    bounds = includeImportedPoint(bounds, { x: component.position.x, y: component.position.y });
    bounds = includeImportedPoint(bounds, {
      x: component.position.x + layout.width,
      y: component.position.y + layout.height,
    });
  }

  return bounds;
}

function hasDetachedImportedSceneGeometry(document: ModuMakeProjectData) {
  const sceneBounds = getImportedSceneGeometryBounds(document.importedSchematicScene ?? null);
  const componentBounds = getImportedComponentBounds(document);

  if (!sceneBounds || !componentBounds) {
    return false;
  }

  const horizontalGap =
    sceneBounds.maxX < componentBounds.minX
      ? componentBounds.minX - sceneBounds.maxX
      : componentBounds.maxX < sceneBounds.minX
        ? sceneBounds.minX - componentBounds.maxX
        : 0;
  const verticalGap =
    sceneBounds.maxY < componentBounds.minY
      ? componentBounds.minY - sceneBounds.maxY
      : componentBounds.maxY < sceneBounds.minY
        ? sceneBounds.minY - componentBounds.maxY
        : 0;

  return horizontalGap > 2000 || verticalGap > 2000;
}

function shouldRepairImportedSchematicSnapshot(document: ModuMakeProjectData) {
  if (!hasRecoverableImportedSchematicState(document)) {
    return false;
  }

  // Imported schematic review should prefer the original KiCad source over any
  // previously serialized scene snapshot so cloud/browser reloads keep the same
  // canonical geometry, pins, and wire anchors.
  if (hasCanonicalImportedSchematicSource(document.importedSchematicSource)) {
    return true;
  }

  if ((document.components?.length ?? 0) === 0) {
    return true;
  }

  if (!hasRenderableImportedComponentSnapshot(document)) {
    return true;
  }

  if (!hasImportedSchematicSceneContent(document.importedSchematicScene ?? null)) {
    return true;
  }

  if (hasDetachedImportedSceneGeometry(document)) {
    return true;
  }

  return false;
}

function repairImportedSchematicSnapshot(document: ModuMakeProjectData): ModuMakeProjectData {
  if (!shouldRepairImportedSchematicSnapshot(document)) {
    return document;
  }

  try {
    const repaired = importKiCadSchematic(document.importedSchematicSource!, {
      projectName: document.projectName,
    }).document;

    return {
      ...document,
      activeBoardId: repaired.activeBoardId,
      pins: repaired.pins,
      components: repaired.components,
      manualConnections: repaired.manualConnections,
      importedSchematicScene: repaired.importedSchematicScene,
      importedSchematicSource: repaired.importedSchematicSource,
      templateCache: {
        ...document.templateCache,
        ...repaired.templateCache,
      },
      installedLibraries: repaired.installedLibraries,
    };
  } catch {
    return document;
  }
}

export function sanitizeCodeGenerationMeta(meta: unknown): AICodeGenerationMeta | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }

  const candidate = meta as Partial<AICodeGenerationMeta>;
  const provider =
    candidate.provider === 'gemini' || candidate.provider === 'anthropic' || candidate.provider === 'local'
      ? candidate.provider
      : null;
  const model = typeof candidate.model === 'string'
    ? sanitizePlainText(candidate.model, { maxLength: 80 })
    : '';
  const label = typeof candidate.label === 'string'
    ? sanitizePlainText(candidate.label, { maxLength: 40 })
    : '';

  if (!provider || !model || !label) {
    return null;
  }

  return {
    provider,
    model,
    label,
    repaired: typeof candidate.repaired === 'boolean' ? candidate.repaired : undefined,
    fallback: typeof candidate.fallback === 'boolean' ? candidate.fallback : undefined,
    reviewIssueCount: typeof candidate.reviewIssueCount === 'number' ? candidate.reviewIssueCount : undefined,
    reviewErrorCount: typeof candidate.reviewErrorCount === 'number' ? candidate.reviewErrorCount : undefined,
  };
}

export function createProjectDocument(
  state: SerializableProjectState,
  options: Pick<ProjectDocumentOptions, 'projectFileVersion'> & { includePcbDocument?: boolean },
  savedAt = new Date().toISOString()
): ModuMakeProjectData {
  const referencedTemplateCache = state.components.reduce<Record<string, ComponentTemplate>>((acc, component) => {
    if (getStaticTemplateById(component.templateId)) {
      return acc;
    }

    const cachedTemplate = state.templateCache[component.templateId];
    if (cachedTemplate) {
      acc[component.templateId] = cachedTemplate;
    }

    return acc;
  }, {});
  const validComponentIds = new Set(state.components.map(component => component.instanceId));
  const componentPowerModes = Object.entries(state.componentPowerModes ?? {}).reduce<ProjectComponentPowerModes>((acc, [instanceId, mode]) => {
    if (!validComponentIds.has(instanceId)) {
      return acc;
    }

    const normalizedMode = sanitizePlainText(mode, { maxLength: 64 });
    if (!normalizedMode) {
      return acc;
    }

    acc[instanceId] = normalizedMode;
    return acc;
  }, {});
  const componentUnusedPinModes = sanitizeComponentUnusedPinModes(
    state.componentUnusedPinModes,
    state.components
  );

  return {
    version: options.projectFileVersion,
    savedAt,
    projectName: state.projectName,
    appLanguage: state.appLanguage,
    activeBoardId: state.activeBoardId,
    pins: state.pins,
    components: state.components,
    manualConnections: state.manualConnections,
    importedSchematicScene: state.importedSchematicScene,
    importedSchematicSource: state.importedSchematicSource,
    importedPcbDocument: state.importedPcbDocument,
    importedPcbSource: state.importedPcbSource,
    importedPcbValidation: state.importedPcbValidation,
    integratedValidationJson: state.integratedValidationJson,
    validationReviewDecisions: state.validationReviewDecisions,
    templateCache: referencedTemplateCache,
    installedLibraries: state.installedLibraries,
    generatedCode: state.generatedCode,
    codeError: state.codeError,
    lastCodeGenerationMeta: state.lastCodeGenerationMeta,
    customComponentPackages: state.customComponentPackages,
    powerInputMode: state.powerInputMode,
    componentPowerModes,
    componentUnusedPinModes,
    workspaceMode: state.workspaceMode,
    wiringMode: state.wiringMode,
    showGrid: state.showGrid,
    showMinimap: state.showMinimap,
    schematicTheme: state.schematicTheme,
    importedSchematicViewMode: state.importedSchematicViewMode,
    isGuestStudentMode: state.isGuestStudentMode,
    pcbDocument: options.includePcbDocument === false
      ? undefined
      : buildPcbDocument(state.components, state.activeBoardId, state.manualConnections, savedAt),
  };
}

function sanitizeRequiredPins(value: unknown): ComponentTemplate['requiredPins'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const pin = item as Partial<ComponentTemplate['requiredPins'][number]>;
    if (typeof pin.name !== 'string' || !Array.isArray(pin.allowedTypes) || pin.allowedTypes.length === 0) {
      return [];
    }

    const allowedTypes = pin.allowedTypes.filter(type =>
      type === 'DIGITAL' || type === 'ANALOG' || type === 'PWM' || type === 'POWER' || type === 'GND'
    );

    if (allowedTypes.length === 0) {
      return [];
    }

    return [{
      name: sanitizePlainText(pin.name, { maxLength: 48 }),
      allowedTypes,
      preferredSide: pin.preferredSide === 'left' || pin.preferredSide === 'right' ? pin.preferredSide : undefined,
      allowBoardRails: typeof pin.allowBoardRails === 'boolean' ? pin.allowBoardRails : undefined,
    }];
  });
}

function sanitizeValidationReviewDecisions(value: unknown): Record<string, ValidationReviewDecision> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ValidationReviewDecision>>((acc, [key, rawDecision]) => {
    const normalizedKey = sanitizePlainText(key, { maxLength: 240 });
    if (!normalizedKey) {
      return acc;
    }

    const normalizedDecision = normalizeValidationReviewDecision(rawDecision);
    if (!normalizedDecision) {
      return acc;
    }

    acc[normalizedKey] = normalizedDecision;
    return acc;
  }, {});
}

function sanitizeComponentPowerModes(
  value: unknown,
  components: PlacedComponent[]
): ProjectComponentPowerModes {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const validComponentIds = new Set(components.map(component => component.instanceId));
  const entries = Object.entries(value as Record<string, unknown>);

  return entries.reduce<ProjectComponentPowerModes>((acc, [instanceId, rawMode]) => {
    if (!validComponentIds.has(instanceId) || typeof rawMode !== 'string') {
      return acc;
    }

    const normalizedMode = sanitizePlainText(rawMode, { maxLength: 64 });
    if (!normalizedMode) {
      return acc;
    }

    acc[instanceId] = normalizedMode;
    return acc;
  }, {});
}

function sanitizeComponentUnusedPinModes(
  value: unknown,
  components: PlacedComponent[]
): ProjectComponentUnusedPinModes {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const validComponentIds = new Set(components.map(component => component.instanceId));
  const allowedModes = new Set<ProjectComponentUnusedPinModes[string][string]>([
    'internal-pullup',
    'internal-pulldown',
    'external-pullup',
    'external-pulldown',
    'floating-ok',
    'analog-hi-z',
  ]);

  return Object.entries(value as Record<string, unknown>).reduce<ProjectComponentUnusedPinModes>((acc, [instanceId, rawPinMap]) => {
    if (!validComponentIds.has(instanceId) || !rawPinMap || typeof rawPinMap !== 'object') {
      return acc;
    }

    const sanitizedPinMap = Object.entries(rawPinMap as Record<string, unknown>).reduce<Partial<Record<string, ProjectComponentUnusedPinModes[string][string]>>>((pinAcc, [pinId, rawMode]) => {
      if (typeof rawMode !== 'string') {
        return pinAcc;
      }

      const normalizedPinId = sanitizePlainText(pinId, { maxLength: 64 });
      const normalizedMode = sanitizePlainText(rawMode, { maxLength: 32 }) as ProjectComponentUnusedPinModes[string][string];
      if (!normalizedPinId || !allowedModes.has(normalizedMode)) {
        return pinAcc;
      }

      pinAcc[normalizedPinId] = normalizedMode;
      return pinAcc;
    }, {});

    if (Object.keys(sanitizedPinMap).length > 0) {
      acc[instanceId] = sanitizedPinMap;
    }

    return acc;
  }, {});
}

function sanitizeSubCircuitPortMappings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const raw = item as Partial<SubCircuitPortMapping>;
    if (
      typeof raw.externalPinId !== 'string' ||
      !raw.internalEndpoint ||
      typeof raw.internalEndpoint !== 'object' ||
      (raw.internalEndpoint.ownerType !== 'component' && raw.internalEndpoint.ownerType !== 'board') ||
      typeof raw.internalEndpoint.ownerId !== 'string' ||
      typeof raw.internalEndpoint.pinId !== 'string'
    ) {
      return [];
    }

    return [{
      externalPinId: sanitizePlainText(raw.externalPinId, { maxLength: 48 }).toUpperCase(),
      internalEndpoint: {
        ownerType: raw.internalEndpoint.ownerType,
        ownerId: sanitizePlainText(raw.internalEndpoint.ownerId, { maxLength: 80 }),
        pinId: sanitizePlainText(raw.internalEndpoint.pinId, { maxLength: 48 }),
      },
      internalComponentName:
        typeof raw.internalComponentName === 'string'
          ? sanitizePlainText(raw.internalComponentName, { maxLength: 80 })
          : undefined,
      internalPinLabel:
        typeof raw.internalPinLabel === 'string'
          ? sanitizePlainText(raw.internalPinLabel, { maxLength: 48 })
          : undefined,
    }];
  });
}

function sanitizeIntegratedValidationJson(value: unknown): DatasheetReviewInputPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<DatasheetReviewInputPayload>;
  if (
    typeof candidate.schemaVersion !== 'string' ||
    !candidate.project ||
    !candidate.board ||
    !Array.isArray(candidate.components) ||
    !Array.isArray(candidate.nets)
  ) {
    return null;
  }

  return candidate as DatasheetReviewInputPayload;
}

function normalizeImportedPcbState(
  sourceValue: unknown,
  documentValue: unknown
): {
  importedPcbDocument: ImportedPcbDocument | null;
  importedPcbSource: string | null;
  importedPcbValidation: ImportedPcbValidationReport | null;
} {
  const source = typeof sourceValue === 'string' && sourceValue.trim().startsWith('(kicad_pcb')
    ? sourceValue
    : null;

  if (source) {
    try {
      const document = parseKiCadPcb(source);
      return {
        importedPcbDocument: document,
        importedPcbSource: source,
        importedPcbValidation: validateImportedPcbDocument(document),
      };
    } catch {
      return {
        importedPcbDocument: null,
        importedPcbSource: null,
        importedPcbValidation: null,
      };
    }
  }

  if (!documentValue || typeof documentValue !== 'object') {
    return {
      importedPcbDocument: null,
      importedPcbSource: null,
      importedPcbValidation: null,
    };
  }

  const candidate = documentValue as Partial<ImportedPcbDocument>;
  if (
    candidate.schemaVersion !== 1 ||
    !Array.isArray(candidate.layers) ||
    !Array.isArray(candidate.nets) ||
    !Array.isArray(candidate.footprints) ||
    !Array.isArray(candidate.segments) ||
    !Array.isArray(candidate.vias) ||
    !Array.isArray(candidate.zones) ||
    !Array.isArray(candidate.drawings)
  ) {
    return {
      importedPcbDocument: null,
      importedPcbSource: null,
      importedPcbValidation: null,
    };
  }

  const importedPcbDocument = candidate as ImportedPcbDocument;
  return {
    importedPcbDocument,
    importedPcbSource: null,
    importedPcbValidation: validateImportedPcbDocument(importedPcbDocument),
  };
}

function sanitizeTemplateCache(value: unknown): Record<string, ComponentTemplate> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, ComponentTemplate>>((acc, [templateId, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return acc;
    }

    const raw = entry as Partial<ComponentTemplate>;
    const id = typeof raw.id === 'string' ? sanitizePlainText(raw.id, { maxLength: 80, fallback: templateId }) : templateId;
    const name = typeof raw.name === 'string' ? sanitizePlainText(raw.name, { maxLength: 80, fallback: id }) : id;
    const description = typeof raw.description === 'string'
      ? sanitizePlainText(raw.description, { maxLength: 240, fallback: `${name} component` })
      : `${name} component`;
    const icon = typeof raw.icon === 'string'
      ? sanitizePlainText(raw.icon, { maxLength: 48, fallback: 'Microchip' })
      : 'Microchip';
    const category =
      raw.category === 'SENSOR' ||
      raw.category === 'ACTUATOR' ||
      raw.category === 'DISPLAY' ||
      raw.category === 'COMMUNICATION' ||
      raw.category === 'PASSIVE'
        ? raw.category
        : null;
    const requiredPins = sanitizeRequiredPins(raw.requiredPins);
    const portMappings = sanitizeSubCircuitPortMappings(raw.portMappings);
    const internalState =
      raw.internalState && typeof raw.internalState === 'object'
        ? {
            components: sanitizeComponents(raw.internalState.components),
            manualConnections: sanitizeManualConnections(raw.internalState.manualConnections),
          }
        : undefined;

    if (!category || requiredPins.length === 0) {
      return acc;
    }

    acc[id] = enrichComponentTemplate({
      id,
      name,
      category,
      description,
      icon,
      compatibleVoltage:
        raw.compatibleVoltage === '3.3V' || raw.compatibleVoltage === '5V' || raw.compatibleVoltage === 'BOTH'
          ? raw.compatibleVoltage
          : 'BOTH',
      defaultValue:
        typeof raw.defaultValue === 'string'
          ? sanitizePlainText(raw.defaultValue, { maxLength: 64 })
          : undefined,
      requiredPins,
      libraryIncludes: Array.isArray(raw.libraryIncludes)
        ? raw.libraryIncludes.filter((item): item is string => typeof item === 'string').map(item =>
            sanitizePlainText(item, { maxLength: 80 })
          )
        : undefined,
      dependencies: raw.dependencies ?? undefined,
      aiHints: raw.aiHints ?? undefined,
      design: raw.design ?? undefined,
      schematic: raw.schematic ?? undefined,
      pcb: raw.pcb ?? undefined,
      code: raw.code ?? undefined,
      packageVersion:
        typeof raw.packageVersion === 'string'
          ? sanitizePlainText(raw.packageVersion, { maxLength: 24 })
          : undefined,
      librarySource: raw.librarySource === 'custom' ? 'custom' : 'core',
      isSubCircuit: raw.isSubCircuit === true,
      internalState,
      portMappings,
    });

    return acc;
  }, {});
}

function sanitizeImportedGeometry(value: unknown): ImportedSchematicGeometry | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Partial<ImportedSchematicGeometry>;
  const bounds = raw.bounds && typeof raw.bounds === 'object'
    ? {
        minX: Number.isFinite(raw.bounds.minX) ? raw.bounds.minX : 0,
        minY: Number.isFinite(raw.bounds.minY) ? raw.bounds.minY : 0,
        maxX: Number.isFinite(raw.bounds.maxX) ? raw.bounds.maxX : 0,
        maxY: Number.isFinite(raw.bounds.maxY) ? raw.bounds.maxY : 0,
      }
    : null;

  if (!bounds) {
    return undefined;
  }

  const sanitizePoint = (point: unknown): ImportedSchematicPoint | null => {
    if (!point || typeof point !== 'object') {
      return null;
    }

    const candidate = point as { x?: number; y?: number };
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
      return null;
    }

    return { x: Number(candidate.x), y: Number(candidate.y) };
  };

  const primitives: ImportedSchematicPrimitive[] = Array.isArray(raw.primitives)
    ? raw.primitives.flatMap<ImportedSchematicPrimitive>(primitive => {
        if (!primitive || typeof primitive !== 'object' || typeof (primitive as { kind?: unknown }).kind !== 'string') {
          return [];
        }

        const candidate = primitive as ImportedSchematicPrimitive;
        switch (candidate.kind) {
          case 'rect': {
            const start = sanitizePoint(candidate.start);
            const end = sanitizePoint(candidate.end);
            return start && end ? [{ kind: 'rect' as const, start, end }] : [];
          }
          case 'polyline': {
            const points = Array.isArray(candidate.points)
              ? candidate.points.map(sanitizePoint).filter(Boolean) as Array<{ x: number; y: number }>
              : [];
            return points.length >= 2 ? [{ kind: 'polyline' as const, points }] : [];
          }
          case 'circle': {
            const center = sanitizePoint(candidate.center);
            const radius = Number.isFinite(candidate.radius) ? candidate.radius : 0;
            return center && radius > 0 ? [{ kind: 'circle' as const, center, radius }] : [];
          }
          case 'arc': {
            const start = sanitizePoint(candidate.start);
            const mid = sanitizePoint(candidate.mid);
            const end = sanitizePoint(candidate.end);
            return start && mid && end ? [{ kind: 'arc' as const, start, mid, end }] : [];
          }
          case 'text': {
            const at = sanitizePoint(candidate.at);
            if (!at || typeof candidate.text !== 'string') {
              return [];
            }

            const angle = candidate.angle === 90 || candidate.angle === 180 || candidate.angle === 270
              ? candidate.angle
              : 0;
            const sizeMm = Number.isFinite(candidate.sizeMm) ? Math.max(candidate.sizeMm, 0.8) : 1.27;
            const role =
              candidate.role === 'reference' ||
              candidate.role === 'value' ||
              candidate.role === 'annotation' ||
              candidate.role === 'pin-name' ||
              candidate.role === 'pin-number'
                ? candidate.role
                : undefined;

            return [{
              kind: 'text' as const,
              at,
              text: sanitizePlainText(candidate.text, { maxLength: 120 }),
              angle,
              sizeMm,
              role,
            }];
          }
          default:
            return [];
        }
      })
    : [];

  const pinAnchors = Array.isArray(raw.pinAnchors)
    ? raw.pinAnchors.flatMap(anchor => {
        if (!anchor || typeof anchor !== 'object') {
          return [];
        }

        const candidate = anchor as ImportedSchematicGeometry['pinAnchors'][number];
        const at = sanitizePoint(candidate.at);
        if (!at || typeof candidate.pinId !== 'string' || typeof candidate.label !== 'string' || typeof candidate.number !== 'string') {
          return [];
        }

        const angle: ImportedSchematicGeometry['pinAnchors'][number]['angle'] =
          candidate.angle === 90 || candidate.angle === 180 || candidate.angle === 270
            ? candidate.angle
            : 0;
        const lengthMm = Number.isFinite(candidate.lengthMm) ? candidate.lengthMm : 2.54;

        return [{
          pinId: sanitizePlainText(candidate.pinId, { maxLength: 48 }),
          label: sanitizePlainText(candidate.label, { maxLength: 48 }),
          number: sanitizePlainText(candidate.number, { maxLength: 24 }),
          at,
          angle,
          lengthMm,
        }];
      })
    : [];

  return {
    bounds,
    renderSource: raw.renderSource === 'fallback' ? 'fallback' : raw.renderSource === 'primitive' ? 'primitive' : undefined,
    pinRenderMode: raw.pinRenderMode === 'primitive' ? 'primitive' : raw.pinRenderMode === 'overlay' ? 'overlay' : undefined,
    primitives,
    pinAnchors,
    referenceLabel:
      typeof raw.referenceLabel === 'string'
        ? sanitizePlainText(raw.referenceLabel, { maxLength: 32 })
        : undefined,
    valueLabel:
      typeof raw.valueLabel === 'string'
        ? sanitizePlainText(raw.valueLabel, { maxLength: 80 })
        : undefined,
  };
}

function sanitizeImportedMapping(value: unknown): ImportedKiCadMapping | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Partial<ImportedKiCadMapping>;
  const sourceCandidates = new Set(['kicad-library', 'refdes', 'value-regex', 'footprint-regex', 'pin-shape', 'custom-fallback'] as const);
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
    ? raw.confidence
    : 'low';
  const source = sourceCandidates.has(raw.source as ImportedKiCadMapping['source'])
    ? (raw.source as ImportedKiCadMapping['source'])
    : 'custom-fallback';

  return {
    templateId: typeof raw.templateId === 'string' ? sanitizePlainText(raw.templateId, { maxLength: 80 }) : undefined,
    confidence,
    source,
    matchedBy: typeof raw.matchedBy === 'string' ? sanitizePlainText(raw.matchedBy, { maxLength: 120 }) : undefined,
    reference: typeof raw.reference === 'string' ? sanitizePlainText(raw.reference, { maxLength: 32 }) : undefined,
    value: typeof raw.value === 'string' ? sanitizePlainText(raw.value, { maxLength: 64 }) : undefined,
    footprint: typeof raw.footprint === 'string' ? sanitizePlainText(raw.footprint, { maxLength: 120 }) : undefined,
    libraryId: typeof raw.libraryId === 'string' ? sanitizePlainText(raw.libraryId, { maxLength: 120 }) : undefined,
  };
}

function sanitizeImportedSchematicScene(value: unknown): ImportedSchematicScene | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ImportedSchematicScene>;

  const sanitizePoint = (point: unknown): ImportedSchematicPoint | null => {
    if (!point || typeof point !== 'object') {
      return null;
    }

    const candidate = point as Partial<ImportedSchematicPoint>;
    if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
      return null;
    }

    return {
      x: Number(candidate.x),
      y: Number(candidate.y),
    };
  };

  const wireSegments = Array.isArray(raw.wireSegments)
    ? raw.wireSegments.flatMap(segment => {
        if (!segment || typeof segment !== 'object') {
          return [];
        }

        const candidate = segment as Partial<ImportedSchematicWireSegment>;
        const start = sanitizePoint(candidate.start);
        const end = sanitizePoint(candidate.end);
        return start && end ? [{ start, end }] : [];
      })
    : [];

  const junctions = Array.isArray(raw.junctions)
    ? raw.junctions.map(sanitizePoint).filter(Boolean) as ImportedSchematicPoint[]
    : [];

  const noConnects = Array.isArray(raw.noConnects)
    ? raw.noConnects.map(sanitizePoint).filter(Boolean) as ImportedSchematicPoint[]
    : [];

  const labels = Array.isArray(raw.labels)
    ? raw.labels.flatMap(label => {
        if (!label || typeof label !== 'object') {
          return [];
        }

        const candidate = label as Partial<ImportedSchematicLabel>;
        const at = sanitizePoint(candidate.at);
        if (!at || typeof candidate.text !== 'string') {
          return [];
        }

        const angle: ImportedSchematicLabel['angle'] =
          candidate.angle === 90 || candidate.angle === 180 || candidate.angle === 270
            ? candidate.angle
            : 0;

        return [{
          text: sanitizeMultilineText(candidate.text, { maxLength: 240, fallback: '' }),
          at,
          angle,
          sizeMm: typeof candidate.sizeMm === 'number' && Number.isFinite(candidate.sizeMm) ? Number(candidate.sizeMm) : 1.27,
          textAnchor:
            candidate.textAnchor === 'start' || candidate.textAnchor === 'middle' || candidate.textAnchor === 'end'
              ? candidate.textAnchor
              : undefined,
          baseline:
            candidate.baseline === 'middle' ||
            candidate.baseline === 'hanging' ||
            candidate.baseline === 'ideographic' ||
            candidate.baseline === 'auto'
              ? candidate.baseline
              : undefined,
        }];
      }).filter(label => label.text.length > 0)
    : [];

  const sanitizeSheetPin = (pin: unknown): ImportedSchematicSheetPin | null => {
    if (!pin || typeof pin !== 'object') {
      return null;
    }

    const candidate = pin as Partial<ImportedSchematicSheetPin>;
    const at = sanitizePoint(candidate.at);
    if (!at || typeof candidate.text !== 'string') {
      return null;
    }

    const angle =
      candidate.angle === 90 || candidate.angle === 180 || candidate.angle === 270
        ? candidate.angle
        : 0;

    return {
      text: sanitizePlainText(candidate.text, { maxLength: 80, fallback: '' }),
      at,
      angle,
    };
  };

  const sheetFrames = Array.isArray((raw as Partial<ImportedSchematicScene>).sheetFrames)
    ? ((raw as Partial<ImportedSchematicScene>).sheetFrames ?? []).flatMap(frame => {
        if (!frame || typeof frame !== 'object') {
          return [];
        }

        const candidate = frame as Partial<ImportedSchematicSheetFrame>;
        const start = sanitizePoint(candidate.start);
        const end = sanitizePoint(candidate.end);
        if (!start || !end) {
          return [];
        }

        return [{
          start,
          end,
          name: typeof candidate.name === 'string'
            ? sanitizePlainText(candidate.name, { maxLength: 80, fallback: '' }) || undefined
            : undefined,
          file: typeof candidate.file === 'string'
            ? sanitizePlainText(candidate.file, { maxLength: 120, fallback: '' }) || undefined
            : undefined,
          pins: Array.isArray(candidate.pins)
            ? candidate.pins.map(sanitizeSheetPin).filter(Boolean) as ImportedSchematicSheetPin[]
            : [],
        }];
      })
    : [];

  const sanitizeTitleText = (value: unknown, maxLength: number) =>
    typeof value === 'string'
      ? sanitizePlainText(value, { maxLength, fallback: '' }) || undefined
      : undefined;

  const pageFrame = (() => {
    const candidate = (raw as Partial<ImportedSchematicScene>).pageFrame as Partial<ImportedSchematicPageFrame> | undefined;
    if (!candidate || typeof candidate !== 'object') {
      return undefined;
    }

    const start = sanitizePoint(candidate.start);
    const end = sanitizePoint(candidate.end);
    if (!start || !end) {
      return undefined;
    }

    const titleBlockCandidate = candidate.titleBlock;
    const titleBlock = titleBlockCandidate && typeof titleBlockCandidate === 'object'
      ? {
          title: sanitizeTitleText(titleBlockCandidate.title, 120),
          date: sanitizeTitleText(titleBlockCandidate.date, 40),
          rev: sanitizeTitleText(titleBlockCandidate.rev, 40),
          company: sanitizeTitleText(titleBlockCandidate.company, 120),
          comments: Array.isArray(titleBlockCandidate.comments)
            ? titleBlockCandidate.comments
                .flatMap(comment => typeof comment === 'string'
                  ? [sanitizePlainText(comment, { maxLength: 120, fallback: '' })]
                  : [])
                .filter(Boolean)
            : [],
        }
      : undefined;

    return {
      start,
      end,
      paper: typeof candidate.paper === 'string'
        ? sanitizePlainText(candidate.paper, { maxLength: 40, fallback: '' }) || undefined
        : undefined,
      titleBlock,
    };
  })();

  const sanitizePrimitive = (primitive: unknown): ImportedSchematicPrimitive | null => {
    if (!primitive || typeof primitive !== 'object') {
      return null;
    }
    const p = primitive as Record<string, unknown>;
    if (typeof p.kind !== 'string') {
      return null;
    }

    switch (p.kind) {
      case 'rect': {
        const start = sanitizePoint(p.start);
        const end = sanitizePoint(p.end);
        if (!start || !end) return null;
        return {
          kind: 'rect',
          start,
          end,
          fill: p.fill === 'outline' || p.fill === 'background' ? p.fill : 'none',
          strokeStyle: p.strokeStyle === 'dash' ? 'dash' : 'default',
        };
      }
      case 'polyline': {
        if (!Array.isArray(p.points)) return null;
        const points = p.points.map(sanitizePoint).filter(Boolean) as ImportedSchematicPoint[];
        if (points.length === 0) return null;
        return {
          kind: 'polyline',
          points,
          fill: p.fill === 'outline' || p.fill === 'background' ? p.fill : 'none',
          strokeStyle: p.strokeStyle === 'dash' ? 'dash' : 'default',
        };
      }
      case 'circle': {
        const center = sanitizePoint(p.center);
        if (!center || typeof p.radius !== 'number' || !Number.isFinite(p.radius)) return null;
        return {
          kind: 'circle',
          center,
          radius: Number(p.radius),
          fill: p.fill === 'outline' || p.fill === 'background' ? p.fill : 'none',
          strokeStyle: p.strokeStyle === 'dash' ? 'dash' : 'default',
        };
      }
      case 'arc': {
        const start = sanitizePoint(p.start);
        const mid = sanitizePoint(p.mid);
        const end = sanitizePoint(p.end);
        if (!start || !mid || !end) return null;
        return {
          kind: 'arc',
          start,
          mid,
          end,
          strokeStyle: p.strokeStyle === 'dash' ? 'dash' : 'default',
        };
      }
      case 'text': {
        const at = sanitizePoint(p.at);
        if (!at || typeof p.text !== 'string' || typeof p.sizeMm !== 'number' || !Number.isFinite(p.sizeMm)) return null;
        const angle = p.angle === 90 || p.angle === 180 || p.angle === 270 ? p.angle : 0;
        const role =
          p.role === 'reference' ||
          p.role === 'value' ||
          p.role === 'annotation' ||
          p.role === 'pin-name' ||
          p.role === 'pin-number'
            ? p.role
            : undefined;
        return {
          kind: 'text',
          at,
          text: sanitizeMultilineText(p.text, { maxLength: 240, fallback: '' }),
          angle,
          originalAngle: p.originalAngle === 90 || p.originalAngle === 180 || p.originalAngle === 270 ? p.originalAngle : 0,
          sizeMm: Number(p.sizeMm),
          role,
          textAnchor: p.textAnchor === 'start' || p.textAnchor === 'middle' || p.textAnchor === 'end' ? p.textAnchor : undefined,
          baseline:
            p.baseline === 'middle' || p.baseline === 'hanging' || p.baseline === 'ideographic' || p.baseline === 'auto'
              ? p.baseline
              : undefined,
        };
      }
      default:
        return null;
    }
  };

  const sanitizePinAnchor = (pin: unknown): ImportedSchematicPinAnchor | null => {
    if (!pin || typeof pin !== 'object') {
      return null;
    }
    const p = pin as Record<string, unknown>;
    const at = sanitizePoint(p.at);
    if (!at || typeof p.pinId !== 'string' || typeof p.label !== 'string' || typeof p.number !== 'string' || typeof p.lengthMm !== 'number' || !Number.isFinite(p.lengthMm)) {
      return null;
    }
    const angle = p.angle === 90 || p.angle === 180 || p.angle === 270 ? p.angle : 0;
    return {
      pinId: sanitizePlainText(p.pinId, { maxLength: 80, fallback: '' }),
      label: sanitizePlainText(p.label, { maxLength: 80, fallback: '' }),
      number: sanitizePlainText(p.number, { maxLength: 20, fallback: '' }),
      at,
      angle,
      lengthMm: Number(p.lengthMm),
    };
  };

  const symbols = Array.isArray(raw.symbols)
    ? raw.symbols.flatMap(sym => {
        if (!sym || typeof sym !== 'object') return [];
        const s = sym as unknown as Record<string, unknown>;
        if (typeof s.instanceId !== 'string') return [];
        const reference = typeof s.reference === 'string' ? sanitizePlainText(s.reference, { maxLength: 40 }) : '';
        const value = typeof s.value === 'string' ? sanitizePlainText(s.value, { maxLength: 80 }) : '';
        const primitives = Array.isArray(s.primitives)
          ? (s.primitives.map(sanitizePrimitive).filter(Boolean) as ImportedSchematicPrimitive[])
          : [];
        const pinAnchors = Array.isArray(s.pinAnchors)
          ? (s.pinAnchors.map(sanitizePinAnchor).filter(Boolean) as ImportedSchematicPinAnchor[])
          : [];
        const family: ImportedSchematicSceneSymbol['family'] =
          s.family === 'passive' ||
          s.family === 'power' ||
          s.family === 'connector' ||
          s.family === 'mcu' ||
          s.family === 'generic'
            ? s.family
            : undefined;
        return [{
          instanceId: sanitizePlainText(s.instanceId, { maxLength: 120 }),
          reference,
          value,
          family,
          primitives,
          pinAnchors,
        }];
      })
    : [];

  const drawings = Array.isArray((raw as Partial<ImportedSchematicScene>).drawings)
    ? (((raw as Partial<ImportedSchematicScene>).drawings ?? [])
        .map(sanitizePrimitive)
        .filter(Boolean) as ImportedSchematicPrimitive[])
    : [];

  if (
    wireSegments.length === 0 &&
    junctions.length === 0 &&
    noConnects.length === 0 &&
    labels.length === 0 &&
    drawings.length === 0 &&
    !pageFrame &&
    sheetFrames.length === 0 &&
    symbols.length === 0
  ) {
    return null;
  }

  return {
    wireSegments,
    junctions,
    noConnects,
    labels,
    drawings,
    pageFrame,
    sheetFrames,
    symbols,
  };
}

function sanitizeInstalledLibraries(value: unknown): InstalledProjectLibrary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const library = item as Partial<InstalledProjectLibrary>;
    if (typeof library.name !== 'string' || !Array.isArray(library.includes) || library.includes.length === 0) {
      return [];
    }

    return [{
      name: sanitizePlainText(library.name, { maxLength: 120 }),
      version:
        typeof library.version === 'string' && library.version.trim().length > 0
          ? sanitizePlainText(library.version, { maxLength: 40, fallback: 'latest' })
          : 'latest',
      includes: library.includes
        .filter((entry): entry is string => typeof entry === 'string')
        .map(entry => sanitizePlainText(entry, { maxLength: 80 }))
        .filter(Boolean),
      author: typeof library.author === 'string' ? sanitizePlainText(library.author, { maxLength: 120 }) : undefined,
      sentence: typeof library.sentence === 'string' ? sanitizePlainText(library.sentence, { maxLength: 220 }) : undefined,
      category: typeof library.category === 'string' ? sanitizePlainText(library.category, { maxLength: 80 }) : undefined,
    } satisfies InstalledProjectLibrary];
  }).filter(library => library.includes.length > 0);
}

function sanitizeComponents(value: unknown): PlacedComponent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const component = item as Partial<PlacedComponent>;
    if (typeof component.instanceId !== 'string' || typeof component.templateId !== 'string') {
      return [];
    }

    const x = Number.isFinite(component.position?.x) ? component.position!.x : 0;
    const y = Number.isFinite(component.position?.y) ? component.position!.y : 0;
    const rotationCandidates = new Set([0, 90, 180, 270] as const);
    const rotation = rotationCandidates.has(component.rotation as 0 | 90 | 180 | 270)
      ? (component.rotation as 0 | 90 | 180 | 270)
      : 0;

    return [{
      instanceId: component.instanceId,
      templateId: component.templateId,
      name: typeof component.name === 'string' && component.name.trim().length > 0
        ? sanitizePlainText(component.name, { maxLength: 80, fallback: component.templateId })
        : component.templateId,
      value: typeof component.value === 'string' && component.value.trim().length > 0
        ? sanitizePlainText(component.value, { maxLength: 64 })
        : undefined,
      position: { x, y },
      rotation,
      assignedPins:
        component.assignedPins && typeof component.assignedPins === 'object'
          ? Object.entries(component.assignedPins as Record<string, unknown>).reduce<Record<string, string>>((acc, [componentPin, boardPinId]) => {
              if (typeof componentPin !== 'string' || typeof boardPinId !== 'string') {
                return acc;
              }

              const safeComponentPin = sanitizePlainText(componentPin, { maxLength: 48 });
              const safeBoardPinId = sanitizePlainText(boardPinId, { maxLength: 24 });
              if (!safeComponentPin || !safeBoardPinId) {
                return acc;
              }

              acc[safeComponentPin] = safeBoardPinId;
              return acc;
            }, {})
          : {},
      isFullyRouted: Boolean(component.isFullyRouted),
      isSubCircuitInstance: component.isSubCircuitInstance === true,
      importedGeometry: sanitizeImportedGeometry(component.importedGeometry),
      importedReference:
        typeof component.importedReference === 'string'
          ? sanitizePlainText(component.importedReference, { maxLength: 32 })
          : undefined,
      importedMapping: sanitizeImportedMapping(component.importedMapping),
    }];
  });
}

function sanitizeAssignedPins(value: unknown, boardId: string) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const safeBoardPins = new Set(Object.keys(getInitialPins(boardId)));

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [componentPin, boardPinId]) => {
    const safeComponentPin = sanitizePlainText(componentPin, { maxLength: 48 });
    const safeBoardPinId = sanitizePlainText(boardPinId, { maxLength: 24 });

    if (!safeComponentPin || !safeBoardPins.has(safeBoardPinId)) {
      return acc;
    }

    acc[safeComponentPin] = safeBoardPinId;
    return acc;
  }, {});
}

function sanitizePins(value: unknown, boardId: string) {
  const initialPins = getInitialPins(boardId);
  if (!value || typeof value !== 'object') {
    return initialPins;
  }

  return Object.entries(initialPins).reduce<Record<string, BoardPin>>((acc, [pinId, basePin]) => {
    const rawPin = (value as Record<string, unknown>)[pinId];
    if (!rawPin || typeof rawPin !== 'object') {
      acc[pinId] = basePin;
      return acc;
    }

    const pin = rawPin as Partial<BoardPin>;
    const isUsed = typeof pin.isUsed === 'boolean' ? pin.isUsed : false;
    const connectedTo =
      typeof pin.connectedTo === 'string' && pin.connectedTo.trim().length > 0
        ? sanitizePlainText(pin.connectedTo, { maxLength: 80 })
        : undefined;
    const assignmentMode =
      pin.assignmentMode === 'auto' || pin.assignmentMode === 'manual'
        ? pin.assignmentMode
        : undefined;

    acc[pinId] = {
      ...basePin,
      isUsed,
      connectedTo: isUsed ? connectedTo : undefined,
      assignmentMode: isUsed ? assignmentMode : undefined,
    };
    return acc;
  }, {});
}

function sanitizeManualEndpoint(value: unknown): ManualPadEndpoint | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const endpoint = value as Partial<ManualPadEndpoint>;
  if (
    (endpoint.ownerType !== 'board' && endpoint.ownerType !== 'component') ||
    typeof endpoint.ownerId !== 'string' ||
    typeof endpoint.pinId !== 'string'
  ) {
    return null;
  }

  return {
    ownerType: endpoint.ownerType,
    ownerId: sanitizePlainText(endpoint.ownerId, { maxLength: 80 }),
    pinId: sanitizePlainText(endpoint.pinId, { maxLength: 48 }).replace(/__source$/, ''),
  };
}

function sanitizeManualConnections(value: unknown): ManualNetConnection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const connection = item as Partial<ManualNetConnection>;
    const source = sanitizeManualEndpoint(connection.source);
    const target = sanitizeManualEndpoint(connection.target);
    if (!source || !target || typeof connection.id !== 'string') {
      return [];
    }

    return [{
      id: connection.id,
      source,
      target,
      suggestedNetName:
        typeof connection.suggestedNetName === 'string' && connection.suggestedNetName.trim().length > 0
          ? sanitizePlainText(connection.suggestedNetName, { maxLength: 80 })
          : undefined,
    }];
  });
}

export function normalizeProjectDocument(
  payload: unknown,
  options: ProjectDocumentOptions
): ModuMakeProjectData | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const raw = payload as Partial<ModuMakeProjectData>;
  const activeBoardId = typeof raw.activeBoardId === 'string'
    ? getBoardById(raw.activeBoardId).id
    : options.defaultBoardId;
  const templateCache = sanitizeTemplateCache(raw.templateCache);
  const workspaceMode = options.workspaceModes.includes(raw.workspaceMode as WorkspaceMode)
    ? (raw.workspaceMode as WorkspaceMode)
    : 'simulation';
  const customComponentPackages = Array.isArray(raw.customComponentPackages)
    ? raw.customComponentPackages.flatMap(item => {
        const result = validateCustomComponentPackage(item);
        return result.valid ? [result.data] : [];
      })
    : [];
  const appLanguage = resolveAppLanguage(raw.appLanguage);
  const importedPcbState = normalizeImportedPcbState(raw.importedPcbSource, raw.importedPcbDocument);

  const normalizedDocument: ModuMakeProjectData = {
    version: typeof raw.version === 'number' ? raw.version : options.projectFileVersion,
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
    projectName: typeof raw.projectName === 'string' && raw.projectName.trim().length > 0
      ? sanitizePlainText(raw.projectName, { maxLength: 80, fallback: options.defaultProjectName })
      : options.defaultProjectName,
    appLanguage,
    activeBoardId,
    pins: sanitizePins(raw.pins, activeBoardId),
    components: sanitizeComponents(raw.components).map(component => {
      const template = templateCache[component.templateId] ?? getStaticTemplateById(component.templateId);

      return {
        ...component,
        value: template ? resolvePlacedComponentValue(template, component.value) : component.value,
        assignedPins: sanitizeAssignedPins(component.assignedPins, activeBoardId),
      };
    }),
    manualConnections: sanitizeManualConnections(raw.manualConnections),
    importedSchematicScene: sanitizeImportedSchematicScene(raw.importedSchematicScene),
    importedSchematicSource: typeof raw.importedSchematicSource === 'string' && raw.importedSchematicSource.trim().length > 0
      ? raw.importedSchematicSource
      : null,
    importedPcbDocument: importedPcbState.importedPcbDocument,
    importedPcbSource: importedPcbState.importedPcbSource,
    importedPcbValidation: importedPcbState.importedPcbValidation,
    integratedValidationJson: sanitizeIntegratedValidationJson(raw.integratedValidationJson),
    validationReviewDecisions: sanitizeValidationReviewDecisions(raw.validationReviewDecisions),
    templateCache,
    installedLibraries: sanitizeInstalledLibraries(raw.installedLibraries),
    generatedCode: typeof raw.generatedCode === 'string' ? raw.generatedCode : '',
    codeError: typeof raw.codeError === 'string' ? sanitizePlainText(raw.codeError, { maxLength: 240 }) : null,
    lastCodeGenerationMeta: sanitizeCodeGenerationMeta(raw.lastCodeGenerationMeta),
    customComponentPackages,
    isGuestStudentMode: typeof raw.isGuestStudentMode === 'boolean' ? raw.isGuestStudentMode : false,
    powerInputMode: options.powerInputModes.includes(raw.powerInputMode as ProjectPowerInputMode)
      ? (raw.powerInputMode as ProjectPowerInputMode)
      : 'usb-5v',
    componentPowerModes: {},
    componentUnusedPinModes: {},
    workspaceMode,
    wiringMode: raw.wiringMode === 'manual' ? 'manual' : 'auto',
    showGrid: typeof raw.showGrid === 'boolean' ? raw.showGrid : true,
    showMinimap: typeof raw.showMinimap === 'boolean' ? raw.showMinimap : true,
    schematicTheme: raw.schematicTheme === 'dark' ? 'dark' : 'light',
    importedSchematicViewMode: 'original',
  };

  normalizedDocument.componentPowerModes = sanitizeComponentPowerModes(
    raw.componentPowerModes,
    normalizedDocument.components
  );
  normalizedDocument.componentUnusedPinModes = sanitizeComponentUnusedPinModes(
    raw.componentUnusedPinModes,
    normalizedDocument.components
  );

  return repairImportedSchematicSnapshot(normalizedDocument);
}

export function applyProjectDocument(document: ModuMakeProjectData): AppliedProjectDocumentState {
  return {
    projectName: document.projectName,
    appLanguage: resolveAppLanguage(document.appLanguage),
    activeBoardId: document.activeBoardId,
    pins: document.pins,
    components: document.components,
    manualConnections: document.manualConnections ?? [],
    importedSchematicScene: document.importedSchematicScene ?? null,
    importedSchematicSource: document.importedSchematicSource ?? null,
    importedPcbDocument: document.importedPcbDocument ?? null,
    importedPcbSource: document.importedPcbSource ?? null,
    importedPcbValidation: document.importedPcbValidation ?? null,
    integratedValidationJson: document.integratedValidationJson ?? null,
    validationReviewDecisions: document.validationReviewDecisions ?? {},
    templateCache: document.templateCache ?? {},
    installedLibraries: document.installedLibraries ?? [],
    generatedCode: document.generatedCode,
    codeError: document.codeError,
    lastCodeGenerationMeta: document.lastCodeGenerationMeta ?? null,
    componentRuntimeStates: {},
    lastCompilerManifest: null,
    customComponentPackages: document.customComponentPackages ?? [],
    isGuestStudentMode: document.isGuestStudentMode ?? false,
    powerInputMode: document.powerInputMode,
    componentPowerModes: document.componentPowerModes ?? {},
    componentUnusedPinModes: document.componentUnusedPinModes ?? {},
    workspaceMode: document.workspaceMode,
    wiringMode: document.wiringMode,
    showGrid: document.showGrid,
    showMinimap: document.showMinimap,
    schematicTheme: document.schematicTheme === 'dark' ? 'dark' : 'light',
    importedSchematicViewMode: 'original',
    selectedComponentId: null,
    isGenerating: false,
  };
}
