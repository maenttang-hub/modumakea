import type { CompanionPartSuggestion, ProjectPowerInputMode, WorkspaceMode } from '@/types';

export const DEFAULT_BOARD_ID = 'uno';
export const DEFAULT_PROJECT_NAME = 'untitled_project';
export const WORKSPACE_STORAGE_KEY = 'modumake-workspace-v1';
export const SAVED_PROJECT_STORAGE_KEY = 'modumake-saved-project-v1';
export const PROJECT_FILE_VERSION = 3;
export const HISTORY_LIMIT = 60;
export const SHARED_PINS = new Set(['5V', '3.3V', 'GND']);
export const WORKSPACE_MODES: WorkspaceMode[] = ['simulation', 'schematic', 'pcb', 'manufacturing'];
export const POWER_INPUT_MODES: ProjectPowerInputMode[] = ['usb-5v', 'vin-9v', 'vin-12v', 'ext-5v', 'ext-3v3'];
export const COMPANION_TEMPLATE_IDS: Record<CompanionPartSuggestion['kind'], string> = {
  resistor: 'tpl_resistor',
  capacitor: 'tpl_capacitor',
  inductor: 'tpl_inductor',
  diode: 'tpl_diode',
  transistor: 'tpl_transistor_npn',
  driver: 'tpl_driver_ic',
  adc: 'tpl_adc_module',
  level_shifter: 'tpl_level_shifter',
  power_supply: 'tpl_external_power',
};
