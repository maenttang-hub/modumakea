/**
 * constants/boards.ts
 * 지원 보드 레지스트리 — 모든 보드별 설정의 단일 진실 공급원(Single Source of Truth)
 * 새 보드 추가 시 이 파일만 수정하면 전체 앱에 자동 반영됩니다.
 */

export type TargetLanguage = 'C++' | 'Python';
export type LogicVoltage = '3.3V' | '5V';

/** 보드 핀 정의 */
export interface BoardPinDefinition {
  id: string;
  type: ('DIGITAL' | 'ANALOG' | 'PWM' | 'POWER' | 'GND')[];
}

/** 보드 전체 정의 */
export interface BoardDefinition {
  readonly id: string;            // BOARD_REGISTRY의 키 (예: 'uno')
  readonly name: string;          // 표시 이름 (예: 'Arduino UNO')
  readonly chipset: string;       // 칩셋 (예: 'ATmega328P')
  readonly targetLanguage: TargetLanguage;
  readonly logicVoltage: LogicVoltage;
  readonly color: string;         // 보드 노드 대표색 (HEX)
  readonly accentColor: string;   // 강조색
  readonly digitalPins: string[]; // 노드 우측에 표시할 핀
  readonly leftPins: string[];    // 노드 좌측에 표시할 핀 (아날로그 + 전원)
  readonly pinDefinitions: BoardPinDefinition[]; // 전체 핀 스펙
  readonly description: string;
  readonly icon: string;          // Lucide 아이콘 이름
}

// ─────────────────────────────────────────────────────
// 개별 보드 핀 스펙 정의
// ─────────────────────────────────────────────────────

const UNO_PIN_DEFS: BoardPinDefinition[] = [
  { id: 'D0',   type: ['DIGITAL'] },
  { id: 'D1',   type: ['DIGITAL'] },
  { id: 'D2',   type: ['DIGITAL'] },
  { id: 'D3',   type: ['DIGITAL', 'PWM'] },
  { id: 'D4',   type: ['DIGITAL'] },
  { id: 'D5',   type: ['DIGITAL', 'PWM'] },
  { id: 'D6',   type: ['DIGITAL', 'PWM'] },
  { id: 'D7',   type: ['DIGITAL'] },
  { id: 'D8',   type: ['DIGITAL'] },
  { id: 'D9',   type: ['DIGITAL', 'PWM'] },
  { id: 'D10',  type: ['DIGITAL', 'PWM'] },
  { id: 'D11',  type: ['DIGITAL', 'PWM'] },
  { id: 'D12',  type: ['DIGITAL'] },
  { id: 'D13',  type: ['DIGITAL'] },
  { id: 'A0',   type: ['ANALOG', 'DIGITAL'] },
  { id: 'A1',   type: ['ANALOG', 'DIGITAL'] },
  { id: 'A2',   type: ['ANALOG', 'DIGITAL'] },
  { id: 'A3',   type: ['ANALOG', 'DIGITAL'] },
  { id: 'A4',   type: ['ANALOG', 'DIGITAL'] },
  { id: 'A5',   type: ['ANALOG', 'DIGITAL'] },
  { id: '5V',   type: ['POWER'] },
  { id: '3.3V', type: ['POWER'] },
  { id: 'GND',  type: ['GND'] },
];

const ESP32_PIN_DEFS: BoardPinDefinition[] = [
  { id: 'G4',   type: ['DIGITAL', 'PWM'] },
  { id: 'G5',   type: ['DIGITAL', 'PWM'] },
  { id: 'G12',  type: ['DIGITAL', 'PWM'] },
  { id: 'G13',  type: ['DIGITAL', 'PWM'] },
  { id: 'G14',  type: ['DIGITAL', 'PWM'] },
  { id: 'G15',  type: ['DIGITAL', 'PWM'] },
  { id: 'G16',  type: ['DIGITAL'] },
  { id: 'G17',  type: ['DIGITAL'] },
  { id: 'G18',  type: ['DIGITAL', 'PWM'] },
  { id: 'G19',  type: ['DIGITAL'] },
  { id: 'G21',  type: ['DIGITAL'] },
  { id: 'G22',  type: ['DIGITAL'] },
  { id: 'G23',  type: ['DIGITAL', 'PWM'] },
  { id: 'G25',  type: ['DIGITAL', 'PWM', 'ANALOG'] },
  { id: 'G26',  type: ['DIGITAL', 'PWM', 'ANALOG'] },
  { id: 'G27',  type: ['DIGITAL', 'PWM'] },
  { id: 'G32',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'G33',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'G34',  type: ['ANALOG'] },
  { id: 'G35',  type: ['ANALOG'] },
  { id: '3.3V', type: ['POWER'] },
  { id: 'GND',  type: ['GND'] },
];

const RPI4_PIN_DEFS: BoardPinDefinition[] = [
  { id: 'GPIO2',  type: ['DIGITAL'] },
  { id: 'GPIO3',  type: ['DIGITAL'] },
  { id: 'GPIO4',  type: ['DIGITAL'] },
  { id: 'GPIO5',  type: ['DIGITAL'] },
  { id: 'GPIO6',  type: ['DIGITAL'] },
  { id: 'GPIO7',  type: ['DIGITAL'] },
  { id: 'GPIO8',  type: ['DIGITAL'] },
  { id: 'GPIO9',  type: ['DIGITAL'] },
  { id: 'GPIO10', type: ['DIGITAL'] },
  { id: 'GPIO11', type: ['DIGITAL'] },
  { id: 'GPIO12', type: ['DIGITAL', 'PWM'] },
  { id: 'GPIO13', type: ['DIGITAL', 'PWM'] },
  { id: 'GPIO14', type: ['DIGITAL'] },
  { id: 'GPIO15', type: ['DIGITAL'] },
  { id: 'GPIO16', type: ['DIGITAL'] },
  { id: 'GPIO17', type: ['DIGITAL'] },
  { id: 'GPIO18', type: ['DIGITAL', 'PWM'] },
  { id: 'GPIO19', type: ['DIGITAL', 'PWM'] },
  { id: 'GPIO20', type: ['DIGITAL'] },
  { id: 'GPIO21', type: ['DIGITAL'] },
  { id: 'GPIO22', type: ['DIGITAL'] },
  { id: 'GPIO23', type: ['DIGITAL'] },
  { id: 'GPIO24', type: ['DIGITAL'] },
  { id: 'GPIO25', type: ['DIGITAL'] },
  { id: 'GPIO26', type: ['DIGITAL'] },
  { id: 'GPIO27', type: ['DIGITAL'] },
  { id: '3.3V',  type: ['POWER'] },
  { id: '5V',    type: ['POWER'] },
  { id: 'GND',   type: ['GND'] },
];

const RPI_PICO_PIN_DEFS: BoardPinDefinition[] = [
  { id: 'GP0',  type: ['DIGITAL'] },
  { id: 'GP1',  type: ['DIGITAL'] },
  { id: 'GP2',  type: ['DIGITAL'] },
  { id: 'GP3',  type: ['DIGITAL'] },
  { id: 'GP4',  type: ['DIGITAL'] },
  { id: 'GP5',  type: ['DIGITAL'] },
  { id: 'GP6',  type: ['DIGITAL'] },
  { id: 'GP7',  type: ['DIGITAL'] },
  { id: 'GP8',  type: ['DIGITAL'] },
  { id: 'GP9',  type: ['DIGITAL'] },
  { id: 'GP10', type: ['DIGITAL'] },
  { id: 'GP11', type: ['DIGITAL'] },
  { id: 'GP12', type: ['DIGITAL'] },
  { id: 'GP13', type: ['DIGITAL'] },
  { id: 'GP14', type: ['DIGITAL'] },
  { id: 'GP15', type: ['DIGITAL'] },
  { id: 'GP16', type: ['DIGITAL'] },
  { id: 'GP17', type: ['DIGITAL'] },
  { id: 'GP18', type: ['DIGITAL'] },
  { id: 'GP19', type: ['DIGITAL'] },
  { id: 'GP20', type: ['DIGITAL'] },
  { id: 'GP21', type: ['DIGITAL'] },
  { id: 'GP22', type: ['DIGITAL'] },
  { id: 'GP26', type: ['DIGITAL', 'ANALOG'] },
  { id: 'GP27', type: ['DIGITAL', 'ANALOG'] },
  { id: 'GP28', type: ['DIGITAL', 'ANALOG'] },
  { id: '3.3V', type: ['POWER'] },
  { id: 'VBUS', type: ['POWER'] },
  { id: 'GND',  type: ['GND'] },
];

const STM32_BLUEPILL_PIN_DEFS: BoardPinDefinition[] = [
  { id: 'PA0',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA1',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA2',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA3',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA4',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA5',  type: ['DIGITAL', 'ANALOG'] },
  { id: 'PA6',  type: ['DIGITAL', 'ANALOG', 'PWM'] },
  { id: 'PA7',  type: ['DIGITAL', 'ANALOG', 'PWM'] },
  { id: 'PA8',  type: ['DIGITAL', 'PWM'] },
  { id: 'PA9',  type: ['DIGITAL'] },
  { id: 'PA10', type: ['DIGITAL'] },
  { id: 'PA11', type: ['DIGITAL'] },
  { id: 'PA12', type: ['DIGITAL'] },
  { id: 'PA15', type: ['DIGITAL'] },
  { id: 'PB0',  type: ['DIGITAL', 'ANALOG', 'PWM'] },
  { id: 'PB1',  type: ['DIGITAL', 'ANALOG', 'PWM'] },
  { id: 'PB3',  type: ['DIGITAL'] },
  { id: 'PB4',  type: ['DIGITAL'] },
  { id: 'PB5',  type: ['DIGITAL'] },
  { id: 'PB6',  type: ['DIGITAL'] },
  { id: 'PB7',  type: ['DIGITAL'] },
  { id: 'PB8',  type: ['DIGITAL'] },
  { id: 'PB9',  type: ['DIGITAL'] },
  { id: '3.3V', type: ['POWER'] },
  { id: '5V',   type: ['POWER'] },
  { id: 'GND',  type: ['GND'] },
];

// ─────────────────────────────────────────────────────
// BOARD REGISTRY (Single Source of Truth)
// ─────────────────────────────────────────────────────

export const BOARD_REGISTRY: Record<string, BoardDefinition> = {
  kicad_generic: {
    id: 'kicad_generic',
    name: 'Imported schematic',
    chipset: 'Custom / mixed',
    targetLanguage: 'C++',
    logicVoltage: '5V',
    color: '#1f2937',
    accentColor: '#94a3b8',
    description: 'KiCad에서 가져온 일반 회로도용 중립 보드 컨텍스트입니다.',
    icon: 'Cpu',
    digitalPins: [],
    leftPins: [],
    pinDefinitions: [],
  },

  uno: {
    id: 'uno',
    name: 'Arduino UNO',
    chipset: 'ATmega328P',
    targetLanguage: 'C++',
    logicVoltage: '5V',
    color: '#1e3a5f',
    accentColor: '#2563eb',
    description: '가장 기본적인 아두이노 보드. 5V 로직, 14 디지털 핀.',
    icon: 'Cpu',
    digitalPins: ['D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13'],
    leftPins: ['A0','A1','A2','A3','A4','A5','5V','3.3V','GND'],
    pinDefinitions: UNO_PIN_DEFS,
  },

  nano: {
    id: 'nano',
    name: 'Arduino NANO',
    chipset: 'ATmega328P',
    targetLanguage: 'C++',
    logicVoltage: '5V',
    color: '#1e3a5f',
    accentColor: '#0ea5e9',
    description: '소형 아두이노. UNO와 동일한 핀 구조, 더 작은 폼팩터.',
    icon: 'Cpu',
    digitalPins: ['D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12','D13'],
    leftPins: ['A0','A1','A2','A3','A4','A5','5V','3.3V','GND'],
    pinDefinitions: UNO_PIN_DEFS,
  },

  esp32: {
    id: 'esp32',
    name: 'ESP32',
    chipset: 'ESP32-WROOM',
    targetLanguage: 'C++',
    logicVoltage: '3.3V',
    color: '#1a2e1a',
    accentColor: '#22c55e',
    description: 'WiFi/Bluetooth 내장. 3.3V 로직, 34 GPIO, Arduino 호환.',
    icon: 'Wifi',
    digitalPins: ['G4','G5','G12','G13','G14','G15','G16','G17','G18','G19','G21','G22','G23'],
    leftPins: ['G25','G26','G27','G32','G33','G34','G35','3.3V','GND'],
    pinDefinitions: ESP32_PIN_DEFS,
  },

  rpi4: {
    id: 'rpi4',
    name: 'Raspberry Pi 4',
    chipset: 'BCM2711',
    targetLanguage: 'Python',
    logicVoltage: '3.3V',
    color: '#3b0a2e',
    accentColor: '#c026d3',
    description: 'Linux 기반 SBC. Python 코드, I2C/SPI/UART 포함 40-pin GPIO, 3.3V 로직.',
    icon: 'Terminal',
    digitalPins: ['GPIO2','GPIO3','GPIO4','GPIO5','GPIO6','GPIO7','GPIO8','GPIO9','GPIO10','GPIO11','GPIO12','GPIO13'],
    leftPins: ['GPIO14','GPIO15','GPIO16','GPIO17','GPIO18','GPIO19','GPIO20','GPIO21','GPIO22','GPIO23','GPIO24','GPIO25','GPIO26','GPIO27','3.3V','5V','GND'],
    pinDefinitions: RPI4_PIN_DEFS,
  },

  rpi_pico: {
    id: 'rpi_pico',
    name: 'Raspberry Pi Pico',
    chipset: 'RP2040',
    targetLanguage: 'C++',
    logicVoltage: '3.3V',
    color: '#15304d',
    accentColor: '#38bdf8',
    description: 'RP2040 기반 Pico 보드. 3.3V 로직, GP26~GP28 ADC 입력.',
    icon: 'Cpu',
    digitalPins: ['GP0','GP1','GP2','GP3','GP4','GP5','GP6','GP7','GP8','GP9','GP10','GP11','GP12','GP13','GP14','GP15'],
    leftPins: ['GP16','GP17','GP18','GP19','GP20','GP21','GP22','GP26','GP27','GP28','3.3V','VBUS','GND'],
    pinDefinitions: RPI_PICO_PIN_DEFS,
  },

  stm32_bluepill: {
    id: 'stm32_bluepill',
    name: 'STM32 Blue Pill',
    chipset: 'STM32F103C8T6',
    targetLanguage: 'C++',
    logicVoltage: '3.3V',
    color: '#1f2f6b',
    accentColor: '#60a5fa',
    description: 'STM32F103C8T6 기반 Blue Pill 보드. 3.3V 로직, 다수의 ADC 핀 포함.',
    icon: 'Cpu',
    digitalPins: ['PA8','PA9','PA10','PA11','PA12','PA15','PB3','PB4','PB5','PB6','PB7','PB8','PB9'],
    leftPins: ['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','3.3V','5V','GND'],
    pinDefinitions: STM32_BLUEPILL_PIN_DEFS,
  },
};

/** 보드 순환 순서 */
export const BOARD_ORDER = ['uno', 'nano', 'esp32', 'rpi_pico', 'stm32_bluepill', 'rpi4'] as const;

/** ID로 보드 정의 조회 */
export function getBoardById(id: string): BoardDefinition {
  return BOARD_REGISTRY[id] ?? BOARD_REGISTRY['uno'];
}

/** 다음 보드 ID 반환 (순환) */
export function getNextBoardId(currentId: string): string {
  const idx = BOARD_ORDER.indexOf(currentId as typeof BOARD_ORDER[number]);
  return BOARD_ORDER[(idx + 1) % BOARD_ORDER.length];
}
