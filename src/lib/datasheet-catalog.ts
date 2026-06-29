import type {
  BoardDesignAnalysis,
  CompanionPartSuggestion,
  ComponentDesignRules,
  ProjectPowerInputMode,
  ProjectPowerRailSummary,
} from '@/types';

type PowerProfile = {
  typicalMa: number;
  peakMa?: number;
  preferredRail?: '5V' | '3.3V';
  inferred?: boolean;
  note: string;
};

type SupportedProtocol =
  | 'I2C_SDA'
  | 'I2C_SCL'
  | 'SPI_SCK'
  | 'SPI_MISO'
  | 'SPI_MOSI'
  | 'SPI_CS'
  | 'UART_TX'
  | 'UART_RX'
  | 'ADC'
  | 'PWM'
  | 'ONEWIRE';

type BusProfile = {
  protocol: 'I2C' | 'SPI' | 'UART' | 'SINGLE_BUS';
  addresses?: string[];
  addressConfigurable?: boolean;
  signalPins?: Record<string, SupportedProtocol>;
  chipSelectPinName?: string;
};

type SignalDriveProfile = {
  defaultCurrentMa: number;
  directDrive: boolean;
  pinNames?: string[];
  note: string;
};

type ElectricalSignalPinProfile = {
  direction: 'input' | 'output' | 'bidirectional';
  outputVoltage?: number;
  maxInputVoltage?: number;
  minHighVoltage?: number;
  analogMaxVoltageSource?: 'power-rail' | 'fixed';
  fixedAnalogMaxVoltage?: number;
};

type ComponentElectricalProfile = {
  signalPins?: Record<string, ElectricalSignalPinProfile>;
  inductiveLoad?: {
    label: string;
    moduleLikelyProtected?: boolean;
  };
};

type PowerInputProfile = {
  label: string;
  rails: Array<{
    rail: '5V' | '3.3V';
    budgetMa: number;
    inferred?: boolean;
    note: string;
  }>;
  regulators?: Array<{
    id: string;
    label: string;
    inputVoltage: number;
    outputVoltage: number;
    safeLimitW: number;
    rail: '5V' | '3.3V';
    packageLabel?: string;
    thermalResistanceCPerW?: number;
    ambientTempC?: number;
    note: string;
  }>;
};

export const COMPONENT_POWER_PROFILES: Record<string, PowerProfile> = {
  tpl_dht11: {
    typicalMa: 2.5,
    preferredRail: '5V',
    note: '공개 벤더 자료 기준 측정 시 전류가 낮은 편이지만 순간 피크를 감안해야 합니다.',
  },
  tpl_dht22: {
    typicalMa: 2.5,
    preferredRail: '5V',
    note: '공개 벤더 자료 기준으로 소비 전류는 낮지만 풀업과 배선 길이 영향이 큽니다.',
  },
  tpl_gas_mq2: {
    typicalMa: 150,
    peakMa: 180,
    preferredRail: '5V',
    note: 'Winsen MQ-2 데이터시트의 히터 전력(최대 900mW @ 5V)을 전류로 환산한 값입니다.',
  },
  tpl_bmp280: {
    typicalMa: 1,
    preferredRail: '3.3V',
    note: '저전력 디지털 센서로 소모 전류는 매우 낮은 편입니다.',
  },
  tpl_bme280: {
    typicalMa: 1,
    preferredRail: '3.3V',
    note: '저전력 환경 센서로 소모 전류는 매우 낮은 편입니다.',
  },
  tpl_bme680: {
    typicalMa: 12,
    preferredRail: '3.3V',
    inferred: true,
    note: '가스 센싱 히터 구동 때문에 저전력 센서보다 여유 있게 잡은 보수적 추정치입니다.',
  },
  tpl_sht31: {
    typicalMa: 2,
    preferredRail: '3.3V',
    note: '디지털 온습도 센서로 소모 전류는 낮은 편입니다.',
  },
  tpl_vl53l0x: {
    typicalMa: 20,
    preferredRail: '3.3V',
    inferred: true,
    note: 'ToF 모듈 브레이크아웃 기준으로 보수적으로 잡은 추정치입니다.',
  },
  tpl_vl53l1x: {
    typicalMa: 20,
    preferredRail: '3.3V',
    inferred: true,
    note: 'ToF 모듈 브레이크아웃 기준으로 보수적으로 잡은 추정치입니다.',
  },
  tpl_rc522: {
    typicalMa: 26,
    preferredRail: '3.3V',
    note: 'RFID 리더는 3.3V 구동과 레벨 관리가 중요합니다.',
  },
  tpl_rfid_rc522: {
    typicalMa: 26,
    preferredRail: '3.3V',
    note: 'RFID 리더는 3.3V 구동과 레벨 관리가 중요합니다.',
  },
};

export const BOARD_POWER_BUDGETS: Record<string, ProjectPowerRailSummary[]> = {
  uno: [
    {
      rail: '3.3V',
      usedMa: 0,
      budgetMa: 50,
      note: 'Arduino UNO R3 공식 자료 기준 3.3V 출력은 50mA 한계로 보는 편이 안전합니다.',
    },
    {
      rail: '5V',
      usedMa: 0,
      budgetMa: 400,
      inferred: true,
      note: '5V 레일은 전원 공급 방식에 따라 달라져서 USB 전원 기준 보수적 추정 예산으로 계산합니다.',
    },
  ],
  nano: [
    {
      rail: '3.3V',
      usedMa: 0,
      budgetMa: 50,
      note: 'ATmega328P 계열 소형 보드는 3.3V 레일을 넉넉하지 않게 보는 편이 안전합니다.',
    },
    {
      rail: '5V',
      usedMa: 0,
      budgetMa: 400,
      inferred: true,
      note: '5V 레일은 전원 공급 방식에 따라 달라져서 USB 전원 기준 보수적 추정 예산으로 계산합니다.',
    },
  ],
};

export const PASSIVE_TEMPLATE_KIND: Partial<Record<string, CompanionPartSuggestion['kind']>> = {
  tpl_resistor: 'resistor',
  tpl_capacitor: 'capacitor',
  tpl_inductor: 'inductor',
  tpl_diode: 'diode',
  tpl_transistor_npn: 'transistor',
  tpl_level_shifter: 'level_shifter',
  tpl_driver_ic: 'driver',
  tpl_adc_module: 'adc',
  tpl_external_power: 'power_supply',
};

export const POWER_INPUT_PROFILES: Record<string, Record<ProjectPowerInputMode, PowerInputProfile>> = {
  uno: {
    'usb-5v': {
      label: 'USB 5V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: 'UNO의 3.3V 출력은 작게 보는 편이 안전합니다.' },
        { rail: '5V', budgetMa: 400, inferred: true, note: 'USB 전원 기준 보수적으로 400mA 수준 예산을 잡았습니다.' },
      ],
    },
    'vin-9v': {
      label: 'VIN 9V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 보조 레일은 여유가 크지 않습니다.' },
        { rail: '5V', budgetMa: 250, inferred: true, note: '선형 레귤레이터 발열을 감안해 5V 부하는 더 보수적으로 봅니다.' },
      ],
      regulators: [{ id: 'uno-vin-9v', label: 'UNO VIN 9V linear regulator', inputVoltage: 9, outputVoltage: 5, safeLimitW: 1.2, rail: '5V', packageLabel: 'SOT-223', thermalResistanceCPerW: 80, ambientTempC: 25, note: '배럴잭/VIN으로 9V를 넣는 경우 온보드 레귤레이터 발열을 같이 검토해야 합니다.' }],
    },
    'vin-12v': {
      label: 'VIN 12V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 보조 레일은 여유가 크지 않습니다.' },
        { rail: '5V', budgetMa: 160, inferred: true, note: '12V 입력은 선형 레귤레이터 열손실이 커서 5V 부하를 크게 낮춰 보는 편이 안전합니다.' },
      ],
      regulators: [{ id: 'uno-vin-12v', label: 'UNO VIN 12V linear regulator', inputVoltage: 12, outputVoltage: 5, safeLimitW: 1.2, rail: '5V', packageLabel: 'SOT-223', thermalResistanceCPerW: 80, ambientTempC: 25, note: '12V 입력에서 센서/모듈을 보드 5V 레일로 많이 먹이면 과열 가능성이 빠르게 올라갑니다.' }],
    },
    'ext-5v': {
      label: '외부 5V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 레일은 여전히 작게 보는 편이 안전합니다.' },
        { rail: '5V', budgetMa: 900, inferred: true, note: '외부 5V가 충분하다고 가정한 보수적 상한입니다. 실제 전원 사양을 다시 확인하세요.' },
      ],
    },
    'ext-3v3': {
      label: '외부 3.3V',
      rails: [
        { rail: '3.3V', budgetMa: 500, inferred: true, note: '외부 3.3V 전원을 쓰는 경우 센서 전원은 넉넉해질 수 있습니다.' },
        { rail: '5V', budgetMa: 0, inferred: true, note: 'UNO 5V 로직 및 주변 모듈은 별도 5V 공급이 없다면 사용할 수 없습니다.' },
      ],
    },
  },
  nano: {
    'usb-5v': {
      label: 'USB 5V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: 'NANO 3.3V 출력은 작은 보조 레일로 보는 편이 안전합니다.' },
        { rail: '5V', budgetMa: 350, inferred: true, note: '소형 보드와 USB 전원을 감안한 보수적 예산입니다.' },
      ],
    },
    'vin-9v': {
      label: 'VIN 9V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 보조 레일은 여유가 크지 않습니다.' },
        { rail: '5V', budgetMa: 220, inferred: true, note: 'VIN 구동 시 5V 레일은 열 여유를 남기며 계산합니다.' },
      ],
      regulators: [{ id: 'nano-vin-9v', label: 'NANO VIN 9V linear regulator', inputVoltage: 9, outputVoltage: 5, safeLimitW: 1, rail: '5V', packageLabel: 'SOT-223', thermalResistanceCPerW: 80, ambientTempC: 25, note: '소형 보드 레귤레이터는 열 여유가 넉넉하지 않습니다.' }],
    },
    'vin-12v': {
      label: 'VIN 12V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 보조 레일은 여유가 크지 않습니다.' },
        { rail: '5V', budgetMa: 140, inferred: true, note: '12V VIN은 발열 리스크가 커서 5V 부하를 크게 낮춰 잡습니다.' },
      ],
      regulators: [{ id: 'nano-vin-12v', label: 'NANO VIN 12V linear regulator', inputVoltage: 12, outputVoltage: 5, safeLimitW: 1, rail: '5V', packageLabel: 'SOT-223', thermalResistanceCPerW: 80, ambientTempC: 25, note: '12V VIN에서 보드 5V 레일에 서보/센서를 몰아주면 과열 가능성이 큽니다.' }],
    },
    'ext-5v': {
      label: '외부 5V',
      rails: [
        { rail: '3.3V', budgetMa: 50, note: '3.3V 보조 레일은 보수적으로 유지합니다.' },
        { rail: '5V', budgetMa: 800, inferred: true, note: '외부 5V 공급이 충분하다고 가정한 보수적 상한입니다.' },
      ],
    },
    'ext-3v3': {
      label: '외부 3.3V',
      rails: [
        { rail: '3.3V', budgetMa: 500, inferred: true, note: '외부 3.3V 센서 전원 가정치입니다.' },
        { rail: '5V', budgetMa: 0, inferred: true, note: '5V 로직과 5V 모듈은 별도 공급이 없다면 사용할 수 없습니다.' },
      ],
    },
  },
  esp32: {
    'usb-5v': {
      label: 'USB 5V',
      rails: [{ rail: '3.3V', budgetMa: 300, inferred: true, note: 'ESP32 개발보드 레귤레이터 기준의 보수적 3.3V 예산입니다.' }],
    },
    'vin-9v': {
      label: 'VIN 9V',
      rails: [{ rail: '3.3V', budgetMa: 220, inferred: true, note: '선형 레귤레이터 발열을 감안해 3.3V 예산을 낮춰 계산합니다.' }],
    },
    'vin-12v': {
      label: 'VIN 12V',
      rails: [{ rail: '3.3V', budgetMa: 150, inferred: true, note: '12V 입력은 ESP32 보드 레귤레이터 열여유를 빠르게 깎습니다.' }],
    },
    'ext-5v': {
      label: '외부 5V',
      rails: [{ rail: '3.3V', budgetMa: 450, inferred: true, note: '외부 5V 전원과 보드 레귤레이터 여유를 감안한 보수적 상한입니다.' }],
    },
    'ext-3v3': {
      label: '외부 3.3V',
      rails: [{ rail: '3.3V', budgetMa: 700, inferred: true, note: '외부 3.3V 레일이 충분하다고 가정한 보수적 상한입니다.' }],
    },
  },
  rpi4: {
    'usb-5v': {
      label: 'USB-C 5V',
      rails: [
        { rail: '3.3V', budgetMa: 250, inferred: true, note: 'GPIO 보조 3.3V 센서 전원용 보수적 예산입니다.' },
        { rail: '5V', budgetMa: 800, inferred: true, note: '라즈베리파이 5V 핀에는 GPIO 부하와 별개로 여유를 남겨야 합니다.' },
      ],
    },
    'vin-9v': {
      label: '외부 5V로 변환 필요',
      rails: [
        { rail: '3.3V', budgetMa: 250, inferred: true, note: '라즈베리파이는 직접 9V 입력 대상이 아니라 5V 변환 후 공급해야 합니다.' },
        { rail: '5V', budgetMa: 0, inferred: true, note: '9V/12V 어댑터는 반드시 별도 DCDC를 거쳐 5V로 내려서 넣어야 합니다.' },
      ],
    },
    'vin-12v': {
      label: '외부 5V로 변환 필요',
      rails: [
        { rail: '3.3V', budgetMa: 250, inferred: true, note: '라즈베리파이는 직접 12V 입력 대상이 아닙니다.' },
        { rail: '5V', budgetMa: 0, inferred: true, note: '12V는 직접 연결하면 안 되고 반드시 DCDC로 5V 변환이 필요합니다.' },
      ],
    },
    'ext-5v': {
      label: '외부 5V',
      rails: [
        { rail: '3.3V', budgetMa: 250, inferred: true, note: 'GPIO 보조 3.3V 센서 전원용 보수적 예산입니다.' },
        { rail: '5V', budgetMa: 1200, inferred: true, note: '외부 5V 공급이 충분하다고 가정한 보수적 상한입니다.' },
      ],
    },
    'ext-3v3': {
      label: '외부 3.3V + 5V 분리',
      rails: [
        { rail: '3.3V', budgetMa: 700, inferred: true, note: '외부 3.3V 센서 전원 가정치입니다.' },
        { rail: '5V', budgetMa: 800, inferred: true, note: '라즈베리파이 본체/주변기기용 5V는 별도로 확보해야 합니다.' },
      ],
    },
  },
};

export const BOARD_PROTOCOL_HINTS: Record<string, Record<string, SupportedProtocol[]>> = {
  uno: {
    A4: ['I2C_SDA', 'ADC'],
    A5: ['I2C_SCL', 'ADC'],
    D2: ['UART_RX'],
    D3: ['PWM', 'UART_TX'],
    D5: ['PWM'],
    D6: ['PWM'],
    D9: ['PWM'],
    D10: ['PWM', 'SPI_CS'],
    D11: ['PWM', 'SPI_MOSI'],
    D12: ['SPI_MISO'],
    D13: ['SPI_SCK'],
  },
  nano: {
    A4: ['I2C_SDA', 'ADC'],
    A5: ['I2C_SCL', 'ADC'],
    D2: ['UART_RX'],
    D3: ['PWM', 'UART_TX'],
    D5: ['PWM'],
    D6: ['PWM'],
    D9: ['PWM'],
    D10: ['PWM', 'SPI_CS'],
    D11: ['PWM', 'SPI_MOSI'],
    D12: ['SPI_MISO'],
    D13: ['SPI_SCK'],
  },
  esp32: {
    G5: ['PWM', 'SPI_CS'],
    G16: ['UART_RX'],
    G17: ['UART_TX'],
    G18: ['PWM', 'SPI_SCK'],
    G19: ['SPI_MISO'],
    G21: ['I2C_SDA'],
    G22: ['I2C_SCL'],
    G23: ['PWM', 'SPI_MOSI'],
    G25: ['PWM', 'ADC'],
    G26: ['PWM', 'ADC'],
    G32: ['ADC'],
    G33: ['ADC'],
    G34: ['ADC'],
    G35: ['ADC'],
  },
  rpi4: {
    GPIO2: ['I2C_SDA'],
    GPIO3: ['I2C_SCL'],
    GPIO14: ['UART_TX'],
    GPIO15: ['UART_RX'],
    GPIO8: ['SPI_CS'],
    GPIO9: ['SPI_MISO'],
    GPIO10: ['SPI_MOSI'],
    GPIO11: ['SPI_SCK'],
    GPIO12: ['PWM'],
    GPIO13: ['PWM'],
    GPIO18: ['PWM'],
    GPIO19: ['PWM'],
  },
};

export const BOARD_SIGNAL_CURRENT_LIMITS: Record<string, { source: number; sink: number }> = {
  uno: { source: 20, sink: 20 },
  nano: { source: 20, sink: 20 },
  esp32: { source: 12, sink: 12 },
  rpi4: { source: 8, sink: 8 },
};

export const COMPONENT_BUS_PROFILES: Record<string, BusProfile> = {
  tpl_oled: {
    protocol: 'I2C',
    addresses: ['0x3C', '0x3D'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_lcd1602: {
    protocol: 'I2C',
    addresses: ['0x27', '0x3F'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_bmp280: {
    protocol: 'I2C',
    addresses: ['0x76', '0x77'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_bme280: {
    protocol: 'I2C',
    addresses: ['0x76', '0x77'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_bme680: {
    protocol: 'I2C',
    addresses: ['0x76', '0x77'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_sht31: {
    protocol: 'I2C',
    addresses: ['0x44', '0x45'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_vl53l0x: {
    protocol: 'I2C',
    addresses: ['0x29'],
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_vl53l1x: {
    protocol: 'I2C',
    addresses: ['0x29'],
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_bno055: {
    protocol: 'I2C',
    addresses: ['0x28', '0x29'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_ina219: {
    protocol: 'I2C',
    addresses: ['0x40', '0x41', '0x44', '0x45'],
    addressConfigurable: true,
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_max30102: {
    protocol: 'I2C',
    addresses: ['0x57'],
    signalPins: { SDA: 'I2C_SDA', SCL: 'I2C_SCL' },
  },
  tpl_rfid_rc522: {
    protocol: 'SPI',
    signalPins: {
      SCK: 'SPI_SCK',
      MISO: 'SPI_MISO',
      MOSI: 'SPI_MOSI',
      SDA: 'SPI_CS',
    },
    chipSelectPinName: 'SDA',
  },
  tpl_bluetooth_hc05: {
    protocol: 'UART',
    signalPins: {
      TX: 'UART_RX',
      RX: 'UART_TX',
    },
  },
  tpl_ds18b20: {
    protocol: 'SINGLE_BUS',
    signalPins: { Data: 'ONEWIRE' },
  },
  tpl_dht11: {
    protocol: 'SINGLE_BUS',
    signalPins: { Data: 'ONEWIRE' },
  },
  tpl_dht22: {
    protocol: 'SINGLE_BUS',
    signalPins: { Data: 'ONEWIRE' },
  },
};

export const COMPONENT_SIGNAL_LOADS: Record<string, SignalDriveProfile> = {
  tpl_led: {
    defaultCurrentMa: 10,
    directDrive: true,
    pinNames: ['Signal'],
    note: '직결 LED는 전류 제한 저항이 없으면 GPIO 정격을 쉽게 넘길 수 있습니다.',
  },
  tpl_rgb_led: {
    defaultCurrentMa: 10,
    directDrive: true,
    pinNames: ['R', 'G', 'B'],
    note: 'RGB LED 채널마다 개별 전류 제한과 핀당 전류 검토가 필요합니다.',
  },
  tpl_buzzer: {
    defaultCurrentMa: 18,
    directDrive: true,
    pinNames: ['Signal'],
    note: '피에조/능동 부저 모듈 종류에 따라 GPIO 직접 구동이 빡빡할 수 있습니다.',
  },
};

export const COMPONENT_ELECTRICAL_PROFILES: Record<string, ComponentElectricalProfile> = {
  tpl_ultrasonic: {
    signalPins: {
      Trig: { direction: 'input', minHighVoltage: 3.5 },
      Echo: { direction: 'output', outputVoltage: 5, maxInputVoltage: 5 },
    },
  },
  tpl_gas_mq2: {
    signalPins: {
      AOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
      DOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
    },
  },
  tpl_light: {
    signalPins: {
      AOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
      DOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
    },
  },
  tpl_soil: {
    signalPins: {
      AOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
      DOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
    },
  },
  tpl_sound: {
    signalPins: {
      AOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
      DOut: { direction: 'output', analogMaxVoltageSource: 'power-rail' },
    },
  },
  tpl_lm35: {
    signalPins: {
      AOut: { direction: 'output', analogMaxVoltageSource: 'fixed', fixedAnalogMaxVoltage: 1.5 },
    },
  },
  tpl_bluetooth_hc05: {
    signalPins: {
      TX: { direction: 'output', outputVoltage: 3.3 },
      RX: { direction: 'input', maxInputVoltage: 3.6 },
    },
  },
  tpl_rfid_rc522: {
    signalPins: {
      SCK: { direction: 'input', maxInputVoltage: 3.6 },
      MOSI: { direction: 'input', maxInputVoltage: 3.6 },
      SDA: { direction: 'input', maxInputVoltage: 3.6 },
      RST: { direction: 'input', maxInputVoltage: 3.6 },
      MISO: { direction: 'output', outputVoltage: 3.3 },
    },
  },
  tpl_relay: {
    inductiveLoad: {
      label: '릴레이 코일',
      moduleLikelyProtected: true,
    },
  },
  tpl_dc_motor: {
    inductiveLoad: {
      label: '모터 구동부',
      moduleLikelyProtected: true,
    },
  },
};

export const COMPONENT_RULES: Record<string, ComponentDesignRules> = {
  tpl_dht11: {
    datasheetStatus: 'official-partial',
    preferredInterface: 'SINGLE_BUS',
    datasheetSources: [
      { label: 'Aosong DHT11 Product Page', url: 'https://www.aosong.com/en/Products/info.aspx?itemid=2257&lcid=139' },
      { label: 'Aosong Download Center', url: 'https://www.aosong.com/en/DownloadCenter/index.aspx?page=2' },
    ],
    preferredBoardPins: {
      uno: { Data: ['D2', 'D4', 'D7'] },
      nano: { Data: ['D2', 'D4', 'D7'] },
      esp32: { Data: ['G16', 'G17', 'G21'] },
      rpi4: { Data: ['GPIO4', 'GPIO17', 'GPIO18'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: '타이밍 민감 센서',
        message: '단일 버스 방식이라 긴 배선과 과도한 폴링 주기를 피하는 편이 좋습니다.',
      },
    ],
    requiresExternalParts: ['데이터 라인 풀업 저항 확인'],
    tags: ['single-bus', 'temperature', 'humidity'],
  },
  tpl_dht22: {
    datasheetStatus: 'official-partial',
    preferredInterface: 'SINGLE_BUS',
    datasheetSources: [
      { label: 'Aosong AM2302 Product Page', url: 'https://www.aosong.com/en/Products/info.aspx?itemid=2294&lcid=139' },
      { label: 'Aosong Download Center', url: 'https://www.aosong.com/en/DownloadCenter/index.aspx?page=2' },
    ],
    preferredBoardPins: {
      uno: { Data: ['D2', 'D4', 'D7'] },
      nano: { Data: ['D2', 'D4', 'D7'] },
      esp32: { Data: ['G16', 'G17', 'G21'] },
      rpi4: { Data: ['GPIO4', 'GPIO17', 'GPIO18'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: '공개 스펙 일부만 확인',
        message: '공식 공개 자료가 제한적이라 정밀 타이밍 규칙은 추후 보강이 필요합니다.',
      },
    ],
    requiresExternalParts: ['데이터 라인 풀업 저항 확인'],
    tags: ['single-bus', 'temperature', 'humidity'],
  },
  tpl_gas_mq2: {
    datasheetStatus: 'official-complete',
    preferredInterface: 'ANALOG',
    datasheetSources: [
      { label: 'Winsen MQ-2 Product Page', url: 'https://www.winsen-sensor.com/product/mq-2.html' },
      { label: 'Winsen MQ-2 Datasheet', url: 'https://www.winsen-sensor.com/d/files/manual/mq-2.pdf' },
    ],
    preferredBoardPins: {
      uno: { AOut: ['A0', 'A1'], DOut: ['D2', 'D4'] },
      nano: { AOut: ['A0', 'A1'], DOut: ['D2', 'D4'] },
      esp32: { AOut: ['G32', 'G33', 'G34'], DOut: ['G16', 'G17'] },
      rpi4: { DOut: ['GPIO17', 'GPIO27', 'GPIO22'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: '워밍업 필요',
        message: '공식 문서 기준으로 초기 예열 시간이 길어서 즉시 안정 측정용으로 보기 어렵습니다.',
      },
      {
        severity: 'warning',
        title: '히터 부하 존재',
        message: '센서 내부 히터 전력 소모가 커서 3.3V GPIO 보드와 직접 구동 설계는 주의가 필요합니다.',
      },
    ],
    requiresExternalParts: ['안정적인 5V 전원', '아날로그 기준 회로 확인'],
    tags: ['heater', 'analog', 'gas'],
  },
  tpl_oled: {
    datasheetStatus: 'generic-module',
    preferredInterface: 'I2C',
    preferredBoardPins: {
      uno: { SDA: ['A4'], SCL: ['A5'] },
      nano: { SDA: ['A4'], SCL: ['A5'] },
      esp32: { SDA: ['G21'], SCL: ['G22'] },
      rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
    },
    warnings: [
      {
        severity: 'info',
        title: '모듈 편차 있음',
        message: 'SSD1306 계열은 전압 레귤레이터와 주소 점퍼 구성이 모듈마다 다를 수 있습니다.',
      },
    ],
    tags: ['i2c', 'display'],
  },
  tpl_lcd1602: {
    datasheetStatus: 'generic-module',
    preferredInterface: 'I2C',
    preferredBoardPins: {
      uno: { SDA: ['A4'], SCL: ['A5'] },
      nano: { SDA: ['A4'], SCL: ['A5'] },
      esp32: { SDA: ['G21'], SCL: ['G22'] },
      rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: '백팩 보드 확인 필요',
        message: 'LCD1602는 I2C 백팩 칩셋과 주소가 모듈마다 달라서 정확한 SKU를 고정하는 편이 좋습니다.',
      },
    ],
    tags: ['i2c', 'display'],
  },
  tpl_bluetooth_hc05: {
    datasheetStatus: 'generic-module',
    preferredInterface: 'UART',
    preferredBoardPins: {
      uno: { TX: ['D2'], RX: ['D3'] },
      nano: { TX: ['D2'], RX: ['D3'] },
      esp32: { TX: ['G17'], RX: ['G16'] },
      rpi4: { TX: ['GPIO14'], RX: ['GPIO15'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: 'UART 라인 주의',
        message: 'UNO 계열 기본 시리얼 핀 D0/D1 대신 분리된 소프트웨어 시리얼용 핀을 우선 쓰는 편이 안정적입니다.',
      },
    ],
    tags: ['uart', 'wireless'],
  },
  tpl_rfid_rc522: {
    datasheetStatus: 'official-complete',
    preferredInterface: 'SPI',
    datasheetSources: [
      { label: 'NXP MFRC522 Datasheet', url: 'https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf' },
    ],
    preferredBoardPins: {
      uno: {
        SCK: ['D13'],
        MISO: ['D12'],
        MOSI: ['D11'],
        SDA: ['D10'],
        RST: ['D9'],
      },
      nano: {
        SCK: ['D13'],
        MISO: ['D12'],
        MOSI: ['D11'],
        SDA: ['D10'],
        RST: ['D9'],
      },
      esp32: {
        SCK: ['G18'],
        MISO: ['G19'],
        MOSI: ['G23'],
        SDA: ['G5'],
        RST: ['G4'],
      },
      rpi4: {
        SCK: ['GPIO11'],
        MISO: ['GPIO9'],
        MOSI: ['GPIO10'],
        SDA: ['GPIO8'],
        RST: ['GPIO25'],
      },
    },
    warnings: [
      {
        severity: 'error',
        title: '3.3V 전용 모델',
        message: 'RFID 모듈은 3.3V 기준으로 다루고 5V 보드에서는 레벨 변환 여부를 먼저 점검해야 합니다.',
      },
    ],
    tags: ['spi', 'rfid', '3.3v-only'],
  },
  tpl_ultrasonic: {
    datasheetStatus: 'needs-vendor-pin',
    preferredInterface: 'GPIO',
    preferredBoardPins: {
      uno: { Trig: ['D6', 'D7'], Echo: ['D8', 'D9'] },
      nano: { Trig: ['D6', 'D7'], Echo: ['D8', 'D9'] },
      esp32: { Trig: ['G16', 'G17'], Echo: ['G18', 'G19'] },
      rpi4: { Trig: ['GPIO23', 'GPIO24'], Echo: ['GPIO17', 'GPIO18'] },
    },
    warnings: [
      {
        severity: 'warning',
        title: '모듈 SKU 고정 권장',
        message: 'HC-SR04 계열은 호환 모듈이 많아서 정확한 제조사 문서를 고정해야 PCB 규칙을 엄격하게 만들 수 있습니다.',
      },
    ],
    tags: ['distance', 'echo'],
  },
};

export const BOARD_AVOID_PINS: Record<string, string[]> = {
  uno: ['D0', 'D1'],
  nano: ['D0', 'D1'],
  esp32: ['G12', 'G15'],
  rpi4: [],
};

export const COMMON_PIN_PREFERENCES: Record<string, Record<string, string[]>> = {
  uno: {
    SDA: ['A4'],
    SCL: ['A5'],
    TX: ['D2'],
    RX: ['D3'],
    SCK: ['D13'],
    MISO: ['D12'],
    MOSI: ['D11'],
    CS: ['D10'],
  },
  nano: {
    SDA: ['A4'],
    SCL: ['A5'],
    TX: ['D2'],
    RX: ['D3'],
    SCK: ['D13'],
    MISO: ['D12'],
    MOSI: ['D11'],
    CS: ['D10'],
  },
  esp32: {
    SDA: ['G21'],
    SCL: ['G22'],
    TX: ['G17'],
    RX: ['G16'],
    SCK: ['G18'],
    MISO: ['G19'],
    MOSI: ['G23'],
    CS: ['G5'],
  },
  rpi4: {
    SDA: ['GPIO2'],
    SCL: ['GPIO3'],
    TX: ['GPIO14'],
    RX: ['GPIO15'],
    SCK: ['GPIO11'],
    MISO: ['GPIO9'],
    MOSI: ['GPIO10'],
    CS: ['GPIO8'],
  },
};

export const BOARD_ANALYSIS: Record<string, BoardDesignAnalysis> = {
  uno: {
    datasheetStatus: 'official-complete',
    sources: [
      { label: 'Arduino UNO R3 Overview', url: 'https://docs.arduino.cc/hardware/uno-rev3' },
      { label: 'Arduino UNO R3 Datasheet', url: 'https://docs.arduino.cc/resources/datasheets/A000066-datasheet.pdf' },
      { label: 'ATmega328P Datasheet', url: 'https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf' },
    ],
    warnings: [
      {
        severity: 'warning',
        title: 'D0/D1은 저우선 배선',
        message: 'USB 시리얼과 겹치는 UART 핀이라 일반 센서 자동 배선에서는 뒤로 미루는 편이 안전합니다.',
      },
    ],
    notes: ['5V 로직', 'I2C 기본 핀 A4/A5', 'I/O 전류는 절대최대치보다 여유 있게 설계 권장'],
  },
  nano: {
    datasheetStatus: 'official-complete',
    sources: [
      { label: 'ATmega328P Datasheet', url: 'https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf' },
    ],
    warnings: [
      {
        severity: 'warning',
        title: 'D0/D1은 저우선 배선',
        message: 'UNO와 비슷하게 기본 UART 라인이므로 일반 센서 자동 배선 우선순위에서 뒤로 둡니다.',
      },
    ],
    notes: ['5V 로직', 'UNO 계열과 유사한 배선 규칙'],
  },
  esp32: {
    datasheetStatus: 'official-complete',
    sources: [
      { label: 'ESP32-WROOM-32 Datasheet', url: 'https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf' },
      { label: 'ESP32 Chip Datasheet', url: 'https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf' },
    ],
    warnings: [
      {
        severity: 'warning',
        title: '스트래핑 핀 주의',
        message: '부트 모드에 영향을 주는 GPIO는 기본 자동 배선 우선순위를 낮추는 편이 좋습니다.',
      },
    ],
    notes: ['3.3V 전용 GPIO', 'I2C/SPI/UART 다중 인터페이스', '기본 자동 배선에서 G12/G15 회피'],
  },
  rpi4: {
    datasheetStatus: 'official-complete',
    sources: [
      { label: 'Raspberry Pi 4 Datasheet', url: 'https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf' },
    ],
    warnings: [
      {
        severity: 'warning',
        title: 'GPIO 직접 부하 구동 주의',
        message: 'Raspberry Pi GPIO는 MCU 보드처럼 직접 구동하는 전류 여유가 크지 않아 드라이버 회로를 우선 고려해야 합니다.',
      },
    ],
    notes: ['3.3V GPIO', 'I2C 기본 핀 GPIO2/GPIO3', 'SPI 핀 GPIO8-11 모델 포함'],
  },
};
