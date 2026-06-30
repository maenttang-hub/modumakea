export type KiCadFileKind = 'schematic' | 'pcb';

export function detectKiCadFileKind(filename: string, source?: string): KiCadFileKind | null {
  const normalized = filename.trim().toLowerCase();

  if (normalized.endsWith('.kicad_sch')) {
    return 'schematic';
  }

  if (normalized.endsWith('.kicad_pcb') || normalized.endsWith('.pcb')) {
    return 'pcb';
  }

  const head = source?.trimStart().slice(0, 48);
  if (head?.startsWith('(kicad_sch')) {
    return 'schematic';
  }
  if (head?.startsWith('(kicad_pcb')) {
    return 'pcb';
  }

  return null;
}
