import { getCatalogSearchStrings } from '@/lib/catalog-i18n';
import type { ComponentCategory, ComponentTemplate, ImportedSchematicScene, PlacedComponent } from '@/types';

export function isImportedSchematicBoard(boardId: string): boolean {
  return boardId === 'kicad_generic';
}

export function isImportedSchematicProject(
  boardId: string,
  components: PlacedComponent[],
  importedSchematicScene: ImportedSchematicScene | null
): boolean {
  return (
    isImportedSchematicBoard(boardId) ||
    Boolean(importedSchematicScene) ||
    components.some(component => Boolean(component.importedGeometry))
  );
}

export function hasImportedSchematicSceneContent(
  importedSchematicScene: ImportedSchematicScene | null
): boolean {
  return Boolean(
    importedSchematicScene &&
    (
      importedSchematicScene.wireSegments.length > 0 ||
      importedSchematicScene.junctions.length > 0 ||
      importedSchematicScene.labels.length > 0 ||
      (importedSchematicScene.drawings?.length ?? 0) > 0 ||
      Boolean(importedSchematicScene.pageFrame) ||
      (importedSchematicScene.sheetFrames?.length ?? 0) > 0 ||
      (importedSchematicScene.symbols?.length ?? 0) > 0
    )
  );
}

export function hasLegacyImportedSchematicState(
  boardId: string,
  components: PlacedComponent[],
  importedSchematicScene: ImportedSchematicScene | null
): boolean {
  return (
    isImportedSchematicProject(boardId, components, importedSchematicScene) &&
    components.some(component => Boolean(component.importedGeometry)) &&
    !hasImportedSchematicSceneContent(importedSchematicScene)
  );
}

export function isVoltageCompatible(componentVoltage: string, boardVoltage: string): boolean {
  if (componentVoltage === 'BOTH') return true;
  return componentVoltage === boardVoltage;
}

export function matchesComponentSearch(template: ComponentTemplate, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  return [template.id, ...getCatalogSearchStrings(template)].some(value => value.toLowerCase().includes(query));
}

export function matchesComponentCategory(
  template: ComponentTemplate,
  category: ComponentCategory | 'ALL',
): boolean {
  if (category === 'ALL') return true;
  return template.category === category;
}
