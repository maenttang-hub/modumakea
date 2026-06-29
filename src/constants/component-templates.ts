/**
 * constants/component-templates.ts
 * 플랫폼이 지원하는 전체 센서/액추에이터 부품 마스터 데이터 (Phase 2: compatibleVoltage 추가)
 *
 * compatibleVoltage 기준:
 * - 'BOTH': 3.3V / 5V 모두 사용 가능 (레벨 시프터 내장 또는 전압 무관)
 * - '5V'  : 5V 전용 (ESP32, RPi에서 직접 연결 위험)
 * - '3.3V': 3.3V 전용
 */

import type {
  CodeTemplateModel,
  ComponentTemplate,
  PcbModel,
  SchematicModel,
  SimulationModel,
} from '@/types';
import { CUSTOM_COMPONENT_TEMPLATES } from './custom-component-library';
import { POPULAR_SENSOR_TEMPLATES } from './popular-sensor-pack';
import { getDesignRules } from '@/lib/datasheet-rules';
import { getRuntimeCustomComponentTemplates } from '@/lib/custom-component-registry';
import { getRuntimeTemplateCache } from '@/lib/template-cache-registry';

function getSimulationModel(template: ComponentTemplate): SimulationModel {
  if (template.simulation) return template.simulation;
  if (template.category === 'PASSIVE') return { type: 'passive' };
  const pinNames = template.requiredPins.map(pin => pin.name.toLowerCase());

  if (template.category === 'DISPLAY') return { type: 'display' };
  if (template.category === 'COMMUNICATION') return { type: 'communication' };
  if (template.category === 'ACTUATOR') return { type: 'actuator', controllable: true };
  if (pinNames.some(name => name.includes('aout') || name.includes('analog'))) {
    return { type: 'analog_input', controllable: true, valueRange: { min: 0, max: 1023 } };
  }
  if (pinNames.some(name => name.includes('signal') || name.includes('data') || name.includes('echo'))) {
    return { type: 'digital_input', controllable: true };
  }
  return { type: 'custom' };
}

function getReferencePrefix(template: ComponentTemplate): string {
  if (template.schematic?.referencePrefix) return template.schematic.referencePrefix;
  if (template.id.includes('led')) return 'D';
  if (template.id.includes('resistor')) return 'R';
  if (template.id.includes('capacitor')) return 'C';
  if (template.id.includes('inductor')) return 'L';
  if (template.id.includes('diode')) return 'D';
  if (template.id.includes('transistor')) return 'Q';
  if (template.id.includes('button')) return 'SW';
  if (template.id.includes('relay')) return 'K';
  if (template.category === 'SENSOR') return 'U';
  if (template.category === 'DISPLAY') return 'DS';
  if (template.category === 'COMMUNICATION') return 'U';
  return 'U';
}

function getSchematicModel(template: ComponentTemplate): SchematicModel {
  return {
    symbol: template.schematic?.symbol ?? template.id.replace(/^tpl_/, ''),
    referencePrefix: getReferencePrefix(template),
  };
}

function getPcbModel(template: ComponentTemplate): PcbModel {
  if (template.pcb) return template.pcb;
  const footprintMap: Record<string, string> = {
    tpl_resistor: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal',
    tpl_capacitor: 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm',
    tpl_inductor: 'Inductor_THT:L_Axial_L9.0mm_D3.5mm_P12.00mm_Horizontal',
    tpl_diode: 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal',
    tpl_transistor_npn: 'Package_TO_SOT_THT:TO-92_Inline',
    tpl_level_shifter: 'Module:Logic_Level_Shifter_4CH',
    tpl_external_power: 'Connector_BarrelJack:BarrelJack_Horizontal',
    tpl_driver_ic: 'Package_DIP:DIP-16_W7.62mm',
    tpl_adc_module: 'Module:ADS1115_Breakout',
    tpl_led: 'LED_THT:LED_D5.0mm',
    tpl_rgb_led: 'LED_THT:LED_RGB_D5.0mm',
    tpl_button: 'Button_Switch_THT:SW_PUSH_6mm',
    tpl_buzzer: 'Buzzer_Beeper:Buzzer_12x9.5RM7.6',
    tpl_relay: 'Relay_THT:Relay_SPDT_Songle_SRD',
    tpl_servo: 'Connector_PinHeader_2.54mm:PinHeader_1x03',
    tpl_ultrasonic: 'Module:HC-SR04',
    tpl_dht11: 'Sensor:DHT11',
    tpl_dht22: 'Sensor:DHT22',
    tpl_photoresistor: 'Sensor:LDR_5mm',
    tpl_oled: 'Display:OLED_0.96_I2C',
    tpl_lcd1602: 'Display:LCD1602_I2C',
    tpl_bluetooth_hc05: 'Module:HC-05',
    tpl_rfid_rc522: 'Module:MFRC522',
  };

  return {
    footprint: footprintMap[template.id] ?? `Module:${template.id.replace(/^tpl_/, '')}`,
    packageType: template.category === 'COMMUNICATION' || template.category === 'DISPLAY'
      ? 'MODULE'
      : ['tpl_level_shifter', 'tpl_external_power', 'tpl_driver_ic', 'tpl_adc_module'].includes(template.id)
        ? 'MODULE'
        : 'THT',
    manufacturable: true,
  };
}

function getCodeTemplateModel(template: ComponentTemplate): CodeTemplateModel {
  return {
    arduino: {
      includes: template.libraryIncludes,
    },
  };
}

export function enrichComponentTemplate(template: ComponentTemplate): ComponentTemplate {
  return {
    ...template,
    librarySource: template.librarySource ?? 'core',
    simulation: getSimulationModel(template),
    schematic: getSchematicModel(template),
    pcb: getPcbModel(template),
    code: template.code ?? getCodeTemplateModel(template),
    design: template.design ?? getDesignRules(template.id),
  };
}

const CORE_COMPONENT_TEMPLATES: ComponentTemplate[] = [
  // ─────────────────────────────────────────
  // SENSOR 카테고리
  // ─────────────────────────────────────────
  {
    id: 'tpl_ultrasonic',
    name: '초음파 센서',
    category: 'SENSOR',
    description: 'HC-SR04: 거리 측정용 초음파 센서 (2cm ~ 400cm)',
    icon: 'Radar',
    compatibleVoltage: '5V',   // HC-SR04는 5V 전용
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'Trig', allowedTypes: ['DIGITAL'] },
      { name: 'Echo', allowedTypes: ['DIGITAL'] },
    ],
  },
  {
    id: 'tpl_pir',
    name: 'PIR 동작 감지',
    category: 'SENSOR',
    description: 'PIR 모션 감지 센서: 사람의 적외선 움직임을 감지',
    icon: 'Eye',
    compatibleVoltage: '5V',   // 대부분의 PIR 모듈은 5V
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL'] },
    ],
  },
  {
    id: 'tpl_dht11',
    name: '온습도 센서',
    category: 'SENSOR',
    description: 'DHT11: 온도 및 습도 측정 센서',
    icon: 'Thermometer',
    compatibleVoltage: 'BOTH', // 3~5.5V 동작
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Data',   allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['DHT.h'],
  },
  {
    id: 'tpl_dht22',
    name: '온습도 센서 Pro',
    category: 'SENSOR',
    description: 'DHT22: DHT11보다 정밀한 온도/습도 센서 (3.3V~6V)',
    icon: 'Thermometer',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Data',   allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['DHT.h'],
  },
  {
    id: 'tpl_photoresistor',
    name: '조도 센서',
    category: 'SENSOR',
    description: '포토레지스터: 빛의 밝기를 아날로그 값으로 측정',
    icon: 'Sun',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'AOut', allowedTypes: ['ANALOG'] },
    ],
  },
  {
    id: 'tpl_soil_moisture',
    name: '토양 수분 센서',
    category: 'SENSOR',
    description: '토양의 수분 함량을 측정하는 센서',
    icon: 'Droplets',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'AOut', allowedTypes: ['ANALOG'] },
    ],
  },
  {
    id: 'tpl_gas_mq2',
    name: '가스 감지 센서',
    category: 'SENSOR',
    description: 'MQ-2: 연기, LPG, 부탄, 수소 가스 감지',
    icon: 'Wind',
    compatibleVoltage: '5V',  // MQ 시리즈는 히터 때문에 5V 필요
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'AOut', allowedTypes: ['ANALOG'] },
      { name: 'DOut', allowedTypes: ['DIGITAL'] },
    ],
  },
  {
    id: 'tpl_sound',
    name: '사운드 센서',
    category: 'SENSOR',
    description: '마이크 모듈: 주변 소음 레벨 감지',
    icon: 'Mic',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'AOut', allowedTypes: ['ANALOG'] },
      { name: 'DOut', allowedTypes: ['DIGITAL'] },
    ],
  },
  {
    id: 'tpl_ir_receiver',
    name: '적외선 수신 모듈',
    category: 'SENSOR',
    description: 'IR 수신기: 리모컨 신호 수신',
    icon: 'Radio',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['IRremote.h'],
  },
  {
    id: 'tpl_button',
    name: '버튼 (푸시)',
    category: 'SENSOR',
    description: '푸시 버튼: 디지털 입력 제어',
    icon: 'Square',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL'] },
    ],
  },

  // ─────────────────────────────────────────
  // ACTUATOR 카테고리
  // ─────────────────────────────────────────
  {
    id: 'tpl_led',
    name: 'LED',
    category: 'ACTUATOR',
    description: '단색 LED: 디지털 또는 PWM으로 밝기 조절 가능',
    icon: 'Lightbulb',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL', 'PWM'] },
    ],
  },
  {
    id: 'tpl_rgb_led',
    name: 'RGB LED',
    category: 'ACTUATOR',
    description: '3색 LED: PWM으로 다양한 색상 표현',
    icon: 'Palette',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'R',   allowedTypes: ['PWM'] },
      { name: 'G',   allowedTypes: ['PWM'] },
      { name: 'B',   allowedTypes: ['PWM'] },
    ],
  },
  {
    id: 'tpl_servo',
    name: '서보 모터',
    category: 'ACTUATOR',
    description: 'SG90: 0~180도 각도 제어 서보 모터',
    icon: 'RotateCcw',
    compatibleVoltage: '5V',   // SG90 동작 전압 4.8~6V
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['PWM'] },
    ],
    libraryIncludes: ['Servo.h'],
  },
  {
    id: 'tpl_dc_motor',
    name: 'DC 모터',
    category: 'ACTUATOR',
    description: 'L298N 드라이버: DC 모터 속도/방향 제어',
    icon: 'Cog',
    compatibleVoltage: '5V',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'IN1', allowedTypes: ['DIGITAL'] },
      { name: 'IN2', allowedTypes: ['DIGITAL'] },
      { name: 'ENA', allowedTypes: ['PWM'] },
    ],
  },
  {
    id: 'tpl_buzzer',
    name: '부저 (Buzzer)',
    category: 'ACTUATOR',
    description: '피에조 부저: 비프음 및 멜로디 출력',
    icon: 'Volume2',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL', 'PWM'] },
    ],
  },
  {
    id: 'tpl_relay',
    name: '릴레이 모듈',
    category: 'ACTUATOR',
    description: '5V 릴레이: 고전압/고전류 부하 제어',
    icon: 'Zap',
    compatibleVoltage: '5V',   // 릴레이 코일은 5V 필요
    requiredPins: [
      { name: 'VCC',    allowedTypes: ['POWER'] },
      { name: 'GND',    allowedTypes: ['GND'] },
      { name: 'Signal', allowedTypes: ['DIGITAL'] },
    ],
  },

  // ─────────────────────────────────────────
  // DISPLAY 카테고리
  // ─────────────────────────────────────────
  {
    id: 'tpl_oled',
    name: 'OLED 디스플레이',
    category: 'DISPLAY',
    description: 'SSD1306 0.96인치 128x64 OLED (I2C)',
    icon: 'Monitor',
    compatibleVoltage: 'BOTH', // 3.3V~5V 동작
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SDA', allowedTypes: ['ANALOG'] },
      { name: 'SCL', allowedTypes: ['ANALOG'] },
    ],
    libraryIncludes: ['Wire.h', 'Adafruit_GFX.h', 'Adafruit_SSD1306.h'],
  },
  {
    id: 'tpl_lcd1602',
    name: 'LCD 1602',
    category: 'DISPLAY',
    description: '16x2 문자 LCD 디스플레이 (I2C 모듈)',
    icon: 'AlignLeft',
    compatibleVoltage: '5V',   // 백라이트 5V 필요
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'SDA', allowedTypes: ['ANALOG'] },
      { name: 'SCL', allowedTypes: ['ANALOG'] },
    ],
    libraryIncludes: ['Wire.h', 'LiquidCrystal_I2C.h'],
  },
  {
    id: 'tpl_7segment',
    name: '7-세그먼트 (4자리)',
    category: 'DISPLAY',
    description: 'TM1637: 4자리 숫자 표시 디스플레이',
    icon: 'Hash',
    compatibleVoltage: 'BOTH',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'CLK', allowedTypes: ['DIGITAL'] },
      { name: 'DIO', allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['TM1637Display.h'],
  },

  // ─────────────────────────────────────────
  // COMMUNICATION 카테고리
  // ─────────────────────────────────────────
  {
    id: 'tpl_bluetooth_hc05',
    name: '블루투스 모듈',
    category: 'COMMUNICATION',
    description: 'HC-05: 블루투스 2.0 무선 시리얼 통신',
    icon: 'Bluetooth',
    compatibleVoltage: '5V',   // HC-05 전원 3.3V이나 신호 레벨은 주의
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'] },
      { name: 'GND', allowedTypes: ['GND'] },
      { name: 'TX',  allowedTypes: ['DIGITAL'] },
      { name: 'RX',  allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['SoftwareSerial.h'],
  },
  {
    id: 'tpl_rfid_rc522',
    name: 'RFID 모듈',
    category: 'COMMUNICATION',
    description: 'MFRC522: RFID 카드/태그 인식 모듈',
    icon: 'CreditCard',
    compatibleVoltage: '3.3V', // MFRC522는 3.3V 전용
    requiredPins: [
      { name: 'VCC',  allowedTypes: ['POWER'] },
      { name: 'GND',  allowedTypes: ['GND'] },
      { name: 'SCK',  allowedTypes: ['DIGITAL'] },
      { name: 'MOSI', allowedTypes: ['DIGITAL'] },
      { name: 'MISO', allowedTypes: ['DIGITAL'] },
      { name: 'SDA',  allowedTypes: ['DIGITAL'] },
      { name: 'RST',  allowedTypes: ['DIGITAL'] },
    ],
    libraryIncludes: ['SPI.h', 'MFRC522.h'],
  },

  // ─────────────────────────────────────────
  // PASSIVE / COMPANION 카테고리
  // ─────────────────────────────────────────
  {
    id: 'tpl_resistor',
    name: '저항',
    category: 'PASSIVE',
    description: '범용 저항: LED 전류 제한, 풀업/풀다운, 분압용',
    icon: 'Minus',
    compatibleVoltage: 'BOTH',
    defaultValue: '220 Ohm',
    requiredPins: [
      { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
      { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_capacitor',
    name: '콘덴서',
    category: 'PASSIVE',
    description: '범용 콘덴서: 디커플링, 벌크, RC 필터용',
    icon: 'Cylinder',
    compatibleVoltage: 'BOTH',
    defaultValue: '0.1uF',
    requiredPins: [
      { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
      { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_inductor',
    name: '인덕터',
    category: 'PASSIVE',
    description: '전원 필터링과 스위칭 레귤레이터 설계용 인덕터',
    icon: 'Orbit',
    compatibleVoltage: 'BOTH',
    defaultValue: '10uH',
    requiredPins: [
      { name: '1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
      { name: '2', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_diode',
    name: '다이오드',
    category: 'PASSIVE',
    description: '역극성 보호, 플라이백, 일반 정류용 다이오드',
    icon: 'ArrowRightLeft',
    compatibleVoltage: 'BOTH',
    defaultValue: '1N4148',
    requiredPins: [
      { name: 'A', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
      { name: 'K', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_transistor_npn',
    name: '트랜지스터',
    category: 'PASSIVE',
    description: 'GPIO 직접 구동이 어려운 부하용 NPN/MOSFET 드라이버',
    icon: 'Workflow',
    compatibleVoltage: 'BOTH',
    defaultValue: '2N2222',
    requiredPins: [
      { name: 'B', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
      { name: 'C', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
      { name: 'E', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'left', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_level_shifter',
    name: '레벨 시프터',
    category: 'PASSIVE',
    description: '3.3V/5V 신호 레벨 변환용 4채널 모듈',
    icon: 'ArrowLeftRight',
    compatibleVoltage: 'BOTH',
    defaultValue: 'BSS138 4ch',
    requiredPins: [
      { name: 'HV', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'LV', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'HV1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
      { name: 'LV1', allowedTypes: ['DIGITAL', 'ANALOG', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_driver_ic',
    name: '드라이버 IC',
    category: 'PASSIVE',
    description: '모터/릴레이/대전류 부하용 드라이버 IC',
    icon: 'Microchip',
    compatibleVoltage: 'BOTH',
    defaultValue: 'ULN2003',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'IN', allowedTypes: ['DIGITAL', 'PWM'], preferredSide: 'right' },
      { name: 'OUT', allowedTypes: ['DIGITAL', 'PWM'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_adc_module',
    name: '외부 ADC',
    category: 'PASSIVE',
    description: '라즈베리파이 등 아날로그 입력 부족 보드용 ADC 모듈',
    icon: 'Combine',
    compatibleVoltage: 'BOTH',
    defaultValue: 'ADS1115',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'SDA', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
      { name: 'SCL', allowedTypes: ['DIGITAL'], preferredSide: 'right' },
      { name: 'A0', allowedTypes: ['ANALOG', 'DIGITAL'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_op_amp_buffer',
    name: 'OP-Amp 버퍼',
    category: 'PASSIVE',
    description: '아날로그 입력 임피던스 완화를 위한 단일 채널 버퍼/연산증폭기 단계',
    icon: 'Activity',
    compatibleVoltage: 'BOTH',
    defaultValue: 'LM358 Buffer',
    requiredPins: [
      { name: 'VCC', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'left' },
      { name: 'IN', allowedTypes: ['ANALOG', 'DIGITAL'], preferredSide: 'left' },
      { name: 'OUT', allowedTypes: ['ANALOG', 'DIGITAL'], preferredSide: 'right', allowBoardRails: true },
    ],
  },
  {
    id: 'tpl_external_power',
    name: '외부 전원',
    category: 'PASSIVE',
    description: '센서/서보/모터 분리 전원 구성용 외부 전원',
    icon: 'PlugZap',
    compatibleVoltage: 'BOTH',
    defaultValue: '5V 2A',
    requiredPins: [
      { name: 'V+', allowedTypes: ['POWER'], preferredSide: 'left' },
      { name: 'GND', allowedTypes: ['GND'], preferredSide: 'right' },
    ],
  },
];

export const STATIC_COMPONENT_TEMPLATES: ComponentTemplate[] = [
  ...CORE_COMPONENT_TEMPLATES,
  ...POPULAR_SENSOR_TEMPLATES,
  ...CUSTOM_COMPONENT_TEMPLATES,
].map(enrichComponentTemplate);

export const COMPONENT_TEMPLATES: ComponentTemplate[] = STATIC_COMPONENT_TEMPLATES;

export function getStaticTemplateById(id: string): ComponentTemplate | undefined {
  return STATIC_COMPONENT_TEMPLATES.find(t => t.id === id);
}

export function getComponentTemplates(): ComponentTemplate[] {
  const merged = new Map<string, ComponentTemplate>();

  for (const template of STATIC_COMPONENT_TEMPLATES) {
    merged.set(template.id, template);
  }

  for (const template of getRuntimeCustomComponentTemplates().map(enrichComponentTemplate)) {
    merged.set(template.id, template);
  }

  for (const template of Object.values(getRuntimeTemplateCache()).map(enrichComponentTemplate)) {
    merged.set(template.id, template);
  }

  return Array.from(merged.values());
}

/** 카테고리별 부품 필터 */
export function getTemplatesByCategory(category: string): ComponentTemplate[] {
  const templates = getComponentTemplates();
  if (category === 'ALL') return templates;
  return templates.filter(t => t.category === category);
}

/** ID로 부품 템플릿 조회 */
export function getTemplateById(id: string): ComponentTemplate | undefined {
  const runtimeTemplate = getRuntimeTemplateCache()[id];
  if (runtimeTemplate) {
    return enrichComponentTemplate(runtimeTemplate);
  }

  const runtimeCustom = getRuntimeCustomComponentTemplates().find(template => template.id === id);
  if (runtimeCustom) {
    return enrichComponentTemplate(runtimeCustom);
  }

  return getStaticTemplateById(id);
}

/**
 * 전압 호환성 확인
 * @param componentVoltage - 부품의 compatibleVoltage
 * @param boardVoltage     - 현재 보드의 logicVoltage
 */
export function isVoltageCompatible(
  componentVoltage: string,
  boardVoltage: string
): boolean {
  if (componentVoltage === 'BOTH') return true;
  return componentVoltage === boardVoltage;
}
