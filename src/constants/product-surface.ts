import type { WorkspaceMode } from '@/types';

export type ProductSurface = 'review-mvp' | 'full';

const REVIEW_MVP_WORKSPACE_MODES: readonly WorkspaceMode[] = ['schematic', 'simulation'];
const FULL_WORKSPACE_MODES: readonly WorkspaceMode[] = ['simulation', 'schematic', 'pcb', 'manufacturing'];

export const FULL_PRODUCT_SURFACE_ENABLED = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_FULL_SURFACE === 'true';
export const FULL_SURFACE_QUERY_OVERRIDE_ALLOWED =
  FULL_PRODUCT_SURFACE_ENABLED && process.env.NEXT_PUBLIC_MODUMAKE_ALLOW_FULL_SURFACE_OVERRIDE === 'true';

export const PRODUCT_SURFACE: ProductSurface =
  FULL_PRODUCT_SURFACE_ENABLED && process.env.NEXT_PUBLIC_MODUMAKE_SURFACE === 'full' ? 'full' : 'review-mvp';
export const WEB_SERIAL_ENABLED = process.env.NEXT_PUBLIC_MODUMAKE_ENABLE_WEB_SERIAL === 'true';

function hasFullSurfaceOverride(search: string) {
  try {
    return new URLSearchParams(search).get('surface') === 'full';
  } catch {
    return false;
  }
}

export function getProductSurface(search?: string): ProductSurface {
  if (PRODUCT_SURFACE === 'full') {
    return 'full';
  }

  const nextSearch =
    typeof search === 'string'
      ? search
      : typeof window !== 'undefined' && typeof window.location?.search === 'string'
        ? window.location.search
        : '';

  return FULL_SURFACE_QUERY_OVERRIDE_ALLOWED && hasFullSurfaceOverride(nextSearch) ? 'full' : PRODUCT_SURFACE;
}

export function getSurfaceFlags(surface = getProductSurface()) {
  return {
    showPartsLibrary: surface === 'full',
    showPcbWorkspace: surface === 'full',
    showManufacturingGate: surface === 'full',
    showCompileActions: surface === 'full',
    showKiCadExport: surface === 'full',
    showConceptWizard: surface === 'full',
    showSerialActions: surface === 'full' && WEB_SERIAL_ENABLED,
    showTerminalPanel: true,
    showSimulationPanel: true,
  } as const;
}

export const SURFACE_FLAGS = getSurfaceFlags(PRODUCT_SURFACE);

export function getAllowedWorkspaceModes(surface = getProductSurface()): readonly WorkspaceMode[] {
  return surface === 'full' ? FULL_WORKSPACE_MODES : REVIEW_MVP_WORKSPACE_MODES;
}

export function getDefaultWorkspaceMode(surface = getProductSurface()): WorkspaceMode {
  return surface === 'full' ? 'simulation' : 'schematic';
}

export function isAdvancedWorkspaceMode(mode: unknown): mode is Extract<WorkspaceMode, 'pcb' | 'manufacturing'> {
  return mode === 'pcb' || mode === 'manufacturing';
}
