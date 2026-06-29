import type { ImportedSchematicTheme } from '@/types';

export type ImportedSchematicPalette = {
  canvasBackground: string;
  shellBackground: string;
  shellForeground: string;
  shellBorder: string;
  shellPanelBackground: string;
  shellPanelAltBackground: string;
  shellElevatedBackground: string;
  shellCardBackground: string;
  shellSubtleBackground: string;
  shellInputBackground: string;
  shellOverlayBackground: string;
  shellMutedText: string;
  shellHandleBackground: string;
  shellHandleAccent: string;
  canvasPanelBackground: string;
  canvasPanelBorder: string;
  canvasPanelText: string;
  canvasHintBackground: string;
  canvasHintBorder: string;
  canvasHintText: string;
  symbolStroke: string;
  symbolBodyFill: string;
  pinStroke: string;
  pinLabel: string;
  referenceText: string;
  valueText: string;
  annotationText: string;
  hoverOutline: string;
  wire: string;
  junction: string;
  netLabel: string;
  pageFrameStroke: string;
  pageTitleText: string;
  pageTitleFill: string;
  sheetStroke: string;
  sheetText: string;
  reactFlowGrid: string;
  controlsBackground: string;
  controlsBorder: string;
  controlsButtonBackground: string;
  controlsButtonHoverBackground: string;
  controlsButtonColor: string;
  controlsButtonHoverColor: string;
  minimapBackground: string;
  minimapMask: string;
  selectionBackground: string;
  selectionBorder: string;
};

const IMPORTED_SCHEMATIC_THEMES: Record<ImportedSchematicTheme, ImportedSchematicPalette> = {
  dark: {
    canvasBackground: '#0b1220',
    shellBackground: '#0d1117',
    shellForeground: '#cbd5e1',
    shellBorder: '#21262d',
    shellPanelBackground: '#161a22',
    shellPanelAltBackground: '#0d1117',
    shellElevatedBackground: '#0b1020',
    shellCardBackground: '#101726',
    shellSubtleBackground: '#0f1623',
    shellInputBackground: '#0d1117',
    shellOverlayBackground: 'rgba(2, 6, 23, 0.78)',
    shellMutedText: '#8aa0b8',
    shellHandleBackground: '#21262d',
    shellHandleAccent: '#30363d',
    canvasPanelBackground: 'rgba(13, 17, 23, 0.92)',
    canvasPanelBorder: 'rgba(100,116,139,0.35)',
    canvasPanelText: '#b7c5d6',
    canvasHintBackground: 'rgba(56, 18, 18, 0.94)',
    canvasHintBorder: 'rgba(248,113,113,0.42)',
    canvasHintText: '#fecaca',
    symbolStroke: '#e53935',
    symbolBodyFill: '#fff9b8',
    pinStroke: '#81d4fa',
    pinLabel: '#67b7d1',
    referenceText: '#78c4dc',
    valueText: '#d7c36a',
    annotationText: '#dc6b6b',
    hoverOutline: 'rgba(129,212,250,0.34)',
    wire: '#4caf50',
    junction: '#4caf50',
    netLabel: '#73c2d8',
    pageFrameStroke: '#b71c1c',
    pageTitleText: '#7dc9de',
    pageTitleFill: 'rgba(2, 6, 23, 0.18)',
    sheetStroke: '#8fb4ff',
    sheetText: '#b3ecff',
    reactFlowGrid: '#475569',
    controlsBackground: '#0d1117',
    controlsBorder: '#334155',
    controlsButtonBackground: '#0d1117',
    controlsButtonHoverBackground: '#1e293b',
    controlsButtonColor: '#64748b',
    controlsButtonHoverColor: '#e2e8f0',
    minimapBackground: '#0a0f1a',
    minimapMask: 'rgba(15,23,42,0.72)',
    selectionBackground: 'rgba(234, 179, 8, 0.05)',
    selectionBorder: '#eab308',
  },
  light: {
    canvasBackground: '#fffdfa',
    shellBackground: '#f6f1e9',
    shellForeground: '#3f342c',
    shellBorder: '#ddd0bf',
    shellPanelBackground: '#fbf8f3',
    shellPanelAltBackground: '#f4ede3',
    shellElevatedBackground: '#fffdf9',
    shellCardBackground: '#fffdf9',
    shellSubtleBackground: '#f4eee4',
    shellInputBackground: '#ffffff',
    shellOverlayBackground: 'rgba(250, 246, 239, 0.82)',
    shellMutedText: '#8f7f71',
    shellHandleBackground: '#e7dccd',
    shellHandleAccent: '#c7b6a4',
    canvasPanelBackground: 'rgba(255, 253, 249, 0.99)',
    canvasPanelBorder: 'rgba(179, 161, 141, 0.52)',
    canvasPanelText: '#594d41',
    canvasHintBackground: 'rgba(255, 247, 246, 0.98)',
    canvasHintBorder: 'rgba(216, 112, 112, 0.32)',
    canvasHintText: '#8e4545',
    symbolStroke: '#b07a66',
    symbolBodyFill: '#fff8d6',
    pinStroke: '#7b7268',
    pinLabel: '#7c746c',
    referenceText: '#8d8379',
    valueText: '#6a5f55',
    annotationText: '#8b7f73',
    hoverOutline: 'rgba(90, 132, 184, 0.26)',
    wire: '#4b433d',
    junction: '#4b433d',
    netLabel: '#5f5a55',
    pageFrameStroke: '#d8c8b5',
    pageTitleText: '#678eaa',
    pageTitleFill: 'rgba(255, 249, 239, 0.68)',
    sheetStroke: '#789cc2',
    sheetText: '#4c7d78',
    reactFlowGrid: '#ddd4c8',
    controlsBackground: '#fbf8f3',
    controlsBorder: '#ded1c1',
    controlsButtonBackground: '#fbf8f3',
    controlsButtonHoverBackground: '#f3ebdf',
    controlsButtonColor: '#8c7c6d',
    controlsButtonHoverColor: '#4d433b',
    minimapBackground: '#f7f1e8',
    minimapMask: 'rgba(233,225,214,0.78)',
    selectionBackground: 'rgba(111, 153, 204, 0.08)',
    selectionBorder: '#6f99cc',
  },
};

export function getImportedSchematicPalette(theme: ImportedSchematicTheme) {
  return IMPORTED_SCHEMATIC_THEMES[theme] ?? IMPORTED_SCHEMATIC_THEMES.dark;
}
