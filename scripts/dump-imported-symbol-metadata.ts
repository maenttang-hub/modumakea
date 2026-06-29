import { readFile } from 'node:fs/promises';

import { importKiCadSchematic } from '@/lib/kicad-sch-parser';

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error('usage: dump-imported-symbol-metadata.ts <path-to-kicad_sch>');
  }

  const source = await readFile(filePath, 'utf8');
  const result = importKiCadSchematic(source, {
    projectName: filePath.split('/').pop() ?? 'kicad-project',
  });

  const sceneSymbols = result.document.importedSchematicScene?.symbols ?? [];
  const componentsByReference = new Map(
    result.document.components
      .filter(component => component.importedReference)
      .map(component => [component.importedReference!, component])
  );

  const payload = sceneSymbols.map(symbol => {
    const component = componentsByReference.get(symbol.reference);
    const primitiveKindCounts = symbol.primitives.reduce<Record<string, number>>((acc, primitive) => {
      const key =
        primitive.kind === 'text'
          ? `text:${primitive.role ?? 'unknown'}`
          : primitive.kind;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      instanceId: symbol.instanceId,
      reference: symbol.reference,
      value: symbol.value,
      pinAnchorCount: symbol.pinAnchors.length,
      primitiveCount: symbol.primitives.length,
      primitiveKindCounts,
      renderSource: component?.importedGeometry?.renderSource ?? null,
      importedLibraryId: component?.importedMapping?.libraryId ?? null,
      importedTemplateId: component?.templateId ?? null,
    };
  });

  process.stdout.write(JSON.stringify(payload, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
