import { CURATED_PART_MASTER_RECORDS } from '@/generated/curated-part-master-records';

export type PartMasterLifecycleStatus =
  | 'active'
  | 'nrnd'
  | 'obsolete'
  | 'unknown';

export type PartMasterSourceQuality =
  | 'official-complete'
  | 'official-partial'
  | 'module-verified'
  | 'generic-module';

export type PartMasterInterface =
  | 'GPIO'
  | 'ADC'
  | 'PWM'
  | 'I2C'
  | 'SPI'
  | 'UART'
  | 'ONEWIRE';

export type PartMasterCategory =
  | 'mcu'
  | 'sensor'
  | 'rf'
  | 'power'
  | 'power-monitor'
  | 'display'
  | 'timing'
  | 'interface'
  | 'analog-front-end'
  | 'module';

export interface PartMasterRecord {
  canonicalMpn: string;
  manufacturerName: string;
  normalizedPartName: string;
  datasheetUrl: string;
  lifecycleStatus: PartMasterLifecycleStatus;
  sourceQuality?: PartMasterSourceQuality;
  aliasNames?: string[];
  supportingUrls?: string[];
  pinSchemaJson: {
    package?: string;
    pinCount?: number;
    powerPins?: string[];
    groundPins?: string[];
    reservedPins?: string[];
    bootPins?: string[];
    signalPins?: string[];
    interfaces?: PartMasterInterface[];
  };
  specsJson: {
    category: PartMasterCategory;
    summary: string;
    supplyVoltage?: {
      min?: number;
      typ?: number;
      max?: number;
      recommended?: number[];
    };
    ioVoltage?: {
      min?: number;
      max?: number;
      nominal?: number[];
      tolerance?: string;
    };
    absoluteMax?: {
      supplyVoltageMax?: number;
      ioVoltageMax?: number;
      gpioCurrentMa?: number;
    };
    analogCharacteristics?: {
      gbwHz?: number;
      outputSwingHighHeadroomV?: number;
      outputSwingLowHeadroomV?: number;
      inputCommonModeHighHeadroomV?: number;
      inputCommonModeLowHeadroomV?: number;
      railToRailInput?: boolean;
      railToRailOutput?: boolean;
      outputImpedanceOhms?: number;
      needsBufferForAdc?: boolean;
      recommendedAdcSourceImpedanceOhms?: number;
      note?: string;
    };
    adcProfile?: {
      acquisitionTimeUs?: number;
      sampleCapacitancePf?: number;
      effectiveBits?: number;
      referenceVoltage?: number;
      note?: string;
    };
    currentConsumption?: {
      sleepUa?: number;
      idleUa?: number;
      measureUa?: number;
      peakMa?: number;
      typicalActiveUa?: number;
      maxActiveUa?: number;
      typicalPeakMa?: number;
      maxPeakMa?: number;
      moduleOverheadMa?: number;
      defaultMode?: string;
      modes?: Array<{
        name: string;
        currentUa?: number;
        peakMa?: number;
        note?: string;
      }>;
      notes?: string[];
    };
    validationHints?: {
      decoupling?: {
        minimumCapacitorCount?: number;
        recommendedValues?: string[];
        note?: string;
        severity?: 'info' | 'warning' | 'error';
      };
      signalLevelLimits?: Array<{
        pinNames: string[];
        maxVoltage?: number;
        minVoltage?: number;
        note?: string;
        severity?: 'info' | 'warning' | 'error';
      }>;
      strapPins?: Array<{
        pinNames: string[];
        allowedReferences: Array<'power' | 'ground'>;
        minimumCount?: number;
        resistanceRangeOhms?: [number, number];
        note?: string;
        severity?: 'info' | 'warning' | 'error';
      }>;
      biasResistors?: Array<{
        pinNames: string[];
        kind: 'pull-up' | 'pull-down';
        minimumCount?: number;
        resistanceRangeOhms?: [number, number];
        reason?: string;
        note?: string;
        severity?: 'info' | 'warning' | 'error';
      }>;
    };
    interfaces?: PartMasterInterface[];
    requiresExternalParts?: string[];
    recommendedCircuit?: string[];
    tags?: string[];
  };
}

export const STARTER_PART_MASTER_RECORDS: PartMasterRecord[] = [
  {
    canonicalMpn: 'AMS1117',
    manufacturerName: 'Advanced Monolithic Systems',
    normalizedPartName: 'AMS1117 family low dropout regulator',
    datasheetUrl: 'https://www.advanced-monolithic.com/pdf/ds1117.pdf',
    lifecycleStatus: 'active',
    sourceQuality: 'official-partial',
    aliasNames: ['AMS1117-3.3', 'AMS1117-5.0', 'AMS1117-ADJ', '1117'],
    pinSchemaJson: {
      package: 'SOT-223',
      pinCount: 3,
      powerPins: ['VIN', 'VOUT'],
      groundPins: ['GND'],
    },
    specsJson: {
      category: 'power',
      summary: '자주 쓰이는 저가형 LDO 레귤레이터 패밀리.',
      supplyVoltage: { max: 15 },
      absoluteMax: { supplyVoltageMax: 15 },
      recommendedCircuit: ['입출력 커패시터 확인', '발열과 dropout 조건 검토'],
      tags: ['regulator', 'ldo', 'ams1117'],
    },
  },
  {
    canonicalMpn: 'LM7805',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'LM7805 5V linear regulator family',
    datasheetUrl: 'https://www.ti.com/lit/ds/symlink/lm340.pdf',
    lifecycleStatus: 'active',
    sourceQuality: 'official-partial',
    aliasNames: ['7805', 'L7805', 'L7805CV', 'LM340-5.0', 'LM78M05', '78M05', 'LM78L05', '78L05'],
    pinSchemaJson: {
      package: 'TO-220',
      pinCount: 3,
      powerPins: ['VIN', 'VOUT'],
      groundPins: ['GND'],
    },
    specsJson: {
      category: 'power',
      summary: '고전적인 5V 선형 레귤레이터 계열.',
      supplyVoltage: { max: 35 },
      absoluteMax: { supplyVoltageMax: 35 },
      recommendedCircuit: ['입출력 바이패스 커패시터', '입력-출력 전압차에 따른 발열 검토'],
      tags: ['regulator', 'linear-regulator', '7805'],
    },
  },
  {
    canonicalMpn: 'LM317',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'LM317 adjustable linear regulator',
    datasheetUrl: 'https://www.ti.com/lit/ds/symlink/lm317.pdf',
    lifecycleStatus: 'active',
    sourceQuality: 'official-partial',
    aliasNames: ['LM317T', 'LM317L', 'LM317M'],
    pinSchemaJson: {
      package: 'TO-220',
      pinCount: 3,
      powerPins: ['VIN', 'VOUT'],
      groundPins: ['GND'],
      signalPins: ['ADJ'],
    },
    specsJson: {
      category: 'power',
      summary: '분압 저항으로 출력 전압을 설정하는 가변 선형 레귤레이터.',
      supplyVoltage: { max: 40 },
      absoluteMax: { supplyVoltageMax: 40 },
      recommendedCircuit: ['ADJ 분압 저항망 확인', '입출력 전압차와 발열 검토'],
      tags: ['regulator', 'linear-regulator', 'adjustable-regulator', 'lm317'],
    },
  },
  {
    canonicalMpn: 'ATMEGA328P-PU',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'ATmega328P 8-bit AVR MCU DIP-28',
    datasheetUrl:
      'https://ww1.microchip.com/downloads/en/DeviceDoc/Atmel-7810-Automotive-Microcontrollers-ATmega328P_Datasheet.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'DIP-28',
      pinCount: 28,
      powerPins: ['VCC', 'AVCC'],
      groundPins: ['GND'],
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    },
    specsJson: {
      category: 'mcu',
      summary: 'Arduino UNO/Nano 계열에서 널리 쓰이는 8-bit AVR MCU.',
      supplyVoltage: { min: 1.8, max: 5.5, recommended: [5, 3.3] },
      ioVoltage: { nominal: [5, 3.3] },
      absoluteMax: { supplyVoltageMax: 6, gpioCurrentMa: 40 },
      adcProfile: {
        acquisitionTimeUs: 12,
        sampleCapacitancePf: 14,
        effectiveBits: 10,
        referenceVoltage: 5,
        note: 'ATmega328P 내장 SAR ADC의 보수적 샘플링 가정값.',
      },
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
      requiresExternalParts: ['0.1uF 디커플링 커패시터', '리셋 풀업 저항'],
      recommendedCircuit: ['AVCC 전원 연결', 'AREF 바이패스', '전원 핀 근처 디커플링'],
      tags: ['arduino', 'avr', 'mcu'],
    },
  },
  {
    canonicalMpn: 'ESP32-WROOM-32E',
    manufacturerName: 'Espressif Systems',
    normalizedPartName: 'ESP32 WROOM module 2.4 GHz Wi-Fi Bluetooth',
    datasheetUrl:
      'https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32e_esp32-wroom-32ue_datasheet_en.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'Module',
      powerPins: ['3V3'],
      groundPins: ['GND'],
      reservedPins: ['GPIO6', 'GPIO7', 'GPIO8', 'GPIO9', 'GPIO10', 'GPIO11'],
      bootPins: ['GPIO0', 'GPIO2', 'GPIO5', 'GPIO12', 'GPIO15', 'EN'],
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    },
    specsJson: {
      category: 'mcu',
      summary: '3.3V 전용 Wi-Fi/Bluetooth MCU 모듈.',
      supplyVoltage: { min: 3.0, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { nominal: [3.3], tolerance: '5V tolerant 아님' },
      absoluteMax: { supplyVoltageMax: 3.6, ioVoltageMax: 3.6 },
      adcProfile: {
        acquisitionTimeUs: 2,
        sampleCapacitancePf: 8,
        effectiveBits: 12,
        referenceVoltage: 3.3,
        note: 'ESP32 계열 SAR ADC의 빠른 acquisition을 가정한 보수적 프로파일.',
      },
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
      validationHints: {
        biasResistors: [
          {
            pinNames: ['EN', 'CHIP_EN'],
            kind: 'pull-up',
            minimumCount: 1,
            resistanceRangeOhms: [5_000, 20_000],
            note: 'EN은 기본적으로 High로 유지되어야 안정적으로 부팅됩니다.',
          },
          {
            pinNames: ['GPIO0', 'IO0'],
            kind: 'pull-up',
            minimumCount: 1,
            resistanceRangeOhms: [5_000, 20_000],
            note: 'GPIO0은 기본 High 쪽 바이어스가 있어야 일반 부팅으로 들어가기 쉽습니다.',
          },
        ],
      },
      requiresExternalParts: ['EN 핀 풀업', '부트스트랩 핀 기본 바이어스', '0.1uF/10uF 전원 디커플링'],
      recommendedCircuit: ['안정적인 3.3V 레일', '부트 스트랩 핀 오배선 방지'],
      tags: ['esp32', 'wifi', 'bluetooth', 'mcu'],
    },
  },
  {
    canonicalMpn: 'RP2040',
    manufacturerName: 'Raspberry Pi',
    normalizedPartName: 'RP2040 dual-core Arm Cortex-M0+ MCU',
    datasheetUrl: 'https://datasheets.raspberrypi.com/rp2040/rp2040-datasheet.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'QFN-56',
      pinCount: 56,
      powerPins: ['IOVDD', 'DVDD', 'ADC_AVDD', 'USB_VDD', 'VREG_IN'],
      groundPins: ['GND', 'AGND'],
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    },
    specsJson: {
      category: 'mcu',
      summary: 'Raspberry Pi Pico 계열의 듀얼코어 MCU.',
      supplyVoltage: { min: 1.8, typ: 3.3, max: 3.63, recommended: [3.3] },
      ioVoltage: { nominal: [3.3], tolerance: '5V tolerant 아님' },
      absoluteMax: { supplyVoltageMax: 3.63, ioVoltageMax: 3.63 },
      adcProfile: {
        acquisitionTimeUs: 2,
        sampleCapacitancePf: 5,
        effectiveBits: 12,
        referenceVoltage: 3.3,
        note: 'RP2040 ADC의 근사 acquisition profile.',
      },
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
      requiresExternalParts: ['QSPI 플래시', '12MHz 크리스털 또는 대체 클럭', '전원 디커플링'],
      recommendedCircuit: ['ADC_AVDD 필터링', 'USB 전원/ESD 고려'],
      tags: ['rp2040', 'pico', 'mcu'],
    },
  },
  {
    canonicalMpn: 'TPS3839K33DBZR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'TPS3839 3.3V reset supervisor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tps3839',
    lifecycleStatus: 'active',
    aliasNames: ['TPS3839K33', 'TPS3839'],
    pinSchemaJson: {
      package: 'SOT-23',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '3.3V 전원 감시용 리셋 슈퍼바이저.',
      supplyVoltage: { min: 1, typ: 3.3, max: 6.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['MCU reset net에 직접 연결', '전원 램프업 시 POR 타이밍 확인'],
      tags: ['reset-supervisor', 'por', 'voltage-detector'],
    },
  },
  {
    canonicalMpn: 'MCP100-315DI/TO',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP100 3.08V reset supervisor',
    datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/11187f.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP100-315', 'MCP100'],
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: 'MCU 리셋용 전원 감시 슈퍼바이저.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['MCU reset net에 직접 연결', '임계 전압과 release delay 확인'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'TPS3808G33DBVR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'TPS3808 3.3V reset supervisor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tps3808',
    lifecycleStatus: 'active',
    aliasNames: ['TPS3808G33', 'TPS3808'],
    pinSchemaJson: {
      package: 'SOT-23-5',
      pinCount: 5,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['RESET', 'MR'],
    },
    specsJson: {
      category: 'interface',
      summary: '수동 리셋 입력이 있는 3.3V supervisor.',
      supplyVoltage: { min: 1.8, typ: 3.3, max: 6.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['RESET 직접 구동', 'MR 디바운스 또는 pull-up 검토'],
      tags: ['reset-supervisor', 'por', 'manual-reset'],
    },
  },
  {
    canonicalMpn: 'TPS3823-33DBVR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'TPS3823 3.3V reset supervisor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tps3823',
    lifecycleStatus: 'active',
    aliasNames: ['TPS3823-33', 'TPS3823'],
    pinSchemaJson: {
      package: 'SOT-23-5',
      pinCount: 5,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['RESET', 'MR'],
    },
    specsJson: {
      category: 'interface',
      summary: 'watchdog 옵션을 가진 supervisor 계열.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['RESET 직접 연결', 'watchdog 미사용 시 핀 처리 확인'],
      tags: ['reset-supervisor', 'por', 'watchdog'],
    },
  },
  {
    canonicalMpn: 'TPS3840PL33DBVR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'TPS3840 3.3V nano power reset supervisor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tps3840',
    lifecycleStatus: 'active',
    aliasNames: ['TPS3840PL33', 'TPS3840'],
    pinSchemaJson: {
      package: 'SOT-23-5',
      pinCount: 5,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['RESET', 'SENSE'],
    },
    specsJson: {
      category: 'interface',
      summary: '저전력 배터리 제품용 supervisor.',
      supplyVoltage: { min: 0.4, typ: 3.3, max: 10, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['SENSE threshold 확인', '저전력 rail brownout 감시'],
      tags: ['reset-supervisor', 'por', 'nano-power'],
    },
  },
  {
    canonicalMpn: 'MCP100-450DI/TO',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP100 4.63V reset supervisor',
    datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/11187f.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP100-450', 'MCP100'],
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '5V MCU rail에 맞춘 supervisor 변형.',
      supplyVoltage: { min: 1, typ: 5, max: 5.5, recommended: [5] },
      ioVoltage: { nominal: [5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['5V MCU reset에 직접 연결', 'release delay 확인'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'MCP101-315DI/TO',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP101 3.08V reset supervisor',
    datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/11187f.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP101-315', 'MCP101'],
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '활성 High/Low 옵션군 중 하나로 쓰이는 MCP101 계열 supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['출력 극성 확인', '리셋 입력 직접 감시'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'MCP120-315DI/TO',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP120 3.08V reset supervisor',
    datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/11184f.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP120-315', 'MCP120'],
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '지연 특성이 다른 Microchip POR supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['release delay 확인', 'MCU reset net에 직접 연결'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'MCP1316T-29LE/OT',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP1316 2.9V reset supervisor',
    datasheetUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/21984d.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP1316T-29LE', 'MCP1316'],
    pinSchemaJson: {
      package: 'SOT-23-3',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '소형 패키지의 저전압 supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3] },
      ioVoltage: { nominal: [3.3] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['3.3V rail brownout 감시', 'reset release 지연 확인'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'NCP301LSN30T1G',
    manufacturerName: 'onsemi',
    normalizedPartName: 'NCP301 3.0V reset supervisor',
    datasheetUrl: 'https://www.onsemi.com/pdf/datasheet/ncp300lsn-d.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['NCP301', 'NCP301LSN30'],
    pinSchemaJson: {
      package: 'SC-70-5',
      pinCount: 5,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '초소형 패키지의 voltage detector/reset IC.',
      supplyVoltage: { min: 0.8, typ: 3.3, max: 10, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['brownout rail 감시', 'reset polarity 확인'],
      tags: ['reset-supervisor', 'por', 'voltage-detector'],
    },
  },
  {
    canonicalMpn: 'NCP303LSN30T1G',
    manufacturerName: 'onsemi',
    normalizedPartName: 'NCP303 3.0V reset supervisor',
    datasheetUrl: 'https://www.onsemi.com/pdf/datasheet/ncp303lsn-d.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['NCP303', 'NCP303LSN30'],
    pinSchemaJson: {
      package: 'SC-70-5',
      pinCount: 5,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET', 'MR'],
    },
    specsJson: {
      category: 'interface',
      summary: '수동 리셋 입력이 있는 onsemi supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 10, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['MR 처리 확인', 'reset release 지연 확인'],
      tags: ['reset-supervisor', 'por', 'manual-reset'],
    },
  },
  {
    canonicalMpn: 'MAX809S',
    manufacturerName: 'Analog Devices / Maxim Integrated',
    normalizedPartName: 'MAX809 reset supervisor',
    datasheetUrl: 'https://www.analog.com/media/en/technical-documentation/data-sheets/MAX803-MAX810.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MAX809', 'MAX809S'],
    pinSchemaJson: {
      package: 'SOT-23-3',
      pinCount: 3,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: '가장 흔히 보이는 3핀 reset supervisor 계열.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['출력 극성 확인', 'MCU reset 직결'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'MAX810T',
    manufacturerName: 'Analog Devices / Maxim Integrated',
    normalizedPartName: 'MAX810 reset supervisor',
    datasheetUrl: 'https://www.analog.com/media/en/technical-documentation/data-sheets/MAX803-MAX810.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MAX810', 'MAX810T'],
    pinSchemaJson: {
      package: 'SOT-23-3',
      pinCount: 3,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: 'MAX809와 짝으로 많이 쓰이는 reset supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['출력 극성/threshold 확인', 'MCU reset 직결'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'STM809M5X6DDG6F',
    manufacturerName: 'STMicroelectronics',
    normalizedPartName: 'STM809 3.08V reset supervisor',
    datasheetUrl: 'https://www.st.com/resource/en/datasheet/stm809.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['STM809', 'STM809M5'],
    pinSchemaJson: {
      package: 'SOT-23-3',
      pinCount: 3,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET'],
    },
    specsJson: {
      category: 'interface',
      summary: 'STM32 주변에서 자주 보이는 ST supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['NRST 직결', 'threshold suffix 확인'],
      tags: ['reset-supervisor', 'por', 'brownout'],
    },
  },
  {
    canonicalMpn: 'STM811M5E',
    manufacturerName: 'STMicroelectronics',
    normalizedPartName: 'STM811 3.08V reset supervisor',
    datasheetUrl: 'https://www.st.com/resource/en/datasheet/stm811.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['STM811', 'STM811M5'],
    pinSchemaJson: {
      package: 'SOT-143',
      pinCount: 4,
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['RESET', 'MR'],
    },
    specsJson: {
      category: 'interface',
      summary: 'manual reset 입력이 포함된 ST supervisor.',
      supplyVoltage: { min: 1, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      requiresExternalParts: ['전원 디커플링 커패시터'],
      recommendedCircuit: ['MR 경로 처리', 'NRST release timing 확인'],
      tags: ['reset-supervisor', 'por', 'manual-reset'],
    },
  },
  {
    canonicalMpn: 'BMP280',
    manufacturerName: 'Bosch Sensortec',
    normalizedPartName: 'BMP280 digital pressure sensor',
    datasheetUrl:
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'LGA-8',
      pinCount: 8,
      powerPins: ['VDD', 'VDDIO'],
      groundPins: ['GND'],
      interfaces: ['I2C', 'SPI'],
    },
    specsJson: {
      category: 'sensor',
      summary: '저전력 디지털 기압 센서.',
      supplyVoltage: { min: 1.71, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { min: 1.2, max: 3.6, nominal: [3.3] },
      interfaces: ['I2C', 'SPI'],
      requiresExternalParts: ['0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['I2C 사용 시 주소 스트랩 확인', '전원 핀 근처 바이패스'],
      tags: ['pressure', 'bosch', 'i2c', 'spi'],
    },
  },
  {
    canonicalMpn: 'BME280',
    manufacturerName: 'Bosch Sensortec',
    normalizedPartName: 'BME280 humidity pressure temperature sensor',
    datasheetUrl:
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'LGA-8',
      pinCount: 8,
      powerPins: ['VDD', 'VDDIO'],
      groundPins: ['GND'],
      interfaces: ['I2C', 'SPI'],
    },
    specsJson: {
      category: 'sensor',
      summary: '온도/습도/기압 통합 환경 센서.',
      supplyVoltage: { min: 1.71, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { min: 1.2, max: 3.6, nominal: [3.3] },
      interfaces: ['I2C', 'SPI'],
      requiresExternalParts: ['0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['I2C 주소 및 CSB/SDO 스트랩 확인'],
      tags: ['humidity', 'pressure', 'temperature', 'bosch'],
    },
  },
  {
    canonicalMpn: 'BME680',
    manufacturerName: 'Bosch Sensortec',
    normalizedPartName: 'BME680 gas pressure humidity temperature sensor',
    datasheetUrl:
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'LGA-8',
      pinCount: 8,
      powerPins: ['VDD', 'VDDIO'],
      groundPins: ['GND'],
      interfaces: ['I2C', 'SPI'],
    },
    specsJson: {
      category: 'sensor',
      summary: '가스 센싱 히터가 포함된 환경 센서.',
      supplyVoltage: { min: 1.71, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { min: 1.2, max: 3.6, nominal: [3.3] },
      interfaces: ['I2C', 'SPI'],
      requiresExternalParts: ['0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['가스 히터 전력 예산 고려', '보정 알고리즘 전제'],
      tags: ['air-quality', 'gas', 'environment', 'bosch'],
    },
  },
  {
    canonicalMpn: 'DS18B20',
    manufacturerName: 'Analog Devices',
    normalizedPartName: 'DS18B20 1-Wire digital thermometer',
    datasheetUrl: 'https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      interfaces: ['ONEWIRE'],
    },
    specsJson: {
      category: 'sensor',
      summary: '1-Wire 디지털 온도 센서.',
      supplyVoltage: { min: 3.0, typ: 5, max: 5.5, recommended: [5, 3.3] },
      ioVoltage: { nominal: [5, 3.3] },
      interfaces: ['ONEWIRE'],
      requiresExternalParts: ['데이터 라인 풀업 저항'],
      recommendedCircuit: ['4.7kΩ 수준의 1-Wire 풀업', '긴 배선에서는 기생전원 사용 주의'],
      tags: ['temperature', 'onewire'],
    },
  },
  {
    canonicalMpn: 'LM35',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'LM35 analog temperature sensor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/lm35',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'TO-92',
      pinCount: 3,
      powerPins: ['VS'],
      groundPins: ['GND'],
      interfaces: ['ADC'],
    },
    specsJson: {
      category: 'sensor',
      summary: '출력이 섭씨 온도에 비례하는 아날로그 온도 센서.',
      supplyVoltage: { min: 4, typ: 5, max: 30, recommended: [5] },
      ioVoltage: { nominal: [5] },
      absoluteMax: { supplyVoltageMax: 35 },
      analogCharacteristics: {
        outputImpedanceOhms: 100,
        needsBufferForAdc: false,
        recommendedAdcSourceImpedanceOhms: 10_000,
        note: 'LM35는 일반적으로 직접 ADC 구동이 가능하지만 배선이 길면 RC 필터와 기준전압 정합 검토가 필요합니다.',
      },
      interfaces: ['ADC'],
      requiresExternalParts: ['ADC 입력 안정화를 위한 짧은 배선 또는 필터 고려'],
      recommendedCircuit: ['ADC 레퍼런스와 전압 범위 정합성 확인'],
      tags: ['temperature', 'analog', 'ti'],
    },
  },
  {
    canonicalMpn: 'LM358',
    manufacturerName: 'Texas Instruments / STMicroelectronics / onsemi',
    normalizedPartName: 'LM358 dual operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/lm358',
    lifecycleStatus: 'active',
    aliasNames: ['LM358N', 'LM358P', 'LM358D'],
    pinSchemaJson: {
      package: 'DIP-8 / SOIC-8',
      pinCount: 8,
      powerPins: ['VCC', 'V+'],
      groundPins: ['GND', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '범용 듀얼 OP-Amp. rail-to-rail 출력이 아니며 높은 폐루프 이득에서는 대역폭/출력 스윙 검토가 필요합니다.',
      supplyVoltage: { min: 3, typ: 5, max: 32, recommended: [5] },
      absoluteMax: { supplyVoltageMax: 32 },
      analogCharacteristics: {
        gbwHz: 1_000_000,
        outputSwingHighHeadroomV: 1.5,
        outputSwingLowHeadroomV: 0.02,
        inputCommonModeHighHeadroomV: 1.5,
        inputCommonModeLowHeadroomV: 0,
        railToRailInput: false,
        railToRailOutput: false,
        note: '단일 5V 구동에서 상단 레일 근처 입력/출력 동작은 여유를 따로 확인하는 편이 안전합니다.',
      },
      recommendedCircuit: ['전원 디커플링', '입출력 headroom 검토', '고이득에서는 GBW 확인'],
      tags: ['opamp', 'analog', 'lm358'],
    },
  },
  {
    canonicalMpn: 'LM324',
    manufacturerName: 'Texas Instruments / STMicroelectronics / onsemi',
    normalizedPartName: 'LM324 quad operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/lm324',
    lifecycleStatus: 'active',
    aliasNames: ['LM324N', 'LM324D'],
    pinSchemaJson: {
      package: 'DIP-14 / SOIC-14',
      pinCount: 14,
      powerPins: ['VCC', 'V+'],
      groundPins: ['GND', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '범용 쿼드 OP-Amp. LM358과 비슷한 단일 전원 특성을 갖습니다.',
      supplyVoltage: { min: 3, typ: 5, max: 32, recommended: [5] },
      absoluteMax: { supplyVoltageMax: 32 },
      analogCharacteristics: {
        gbwHz: 1_000_000,
        outputSwingHighHeadroomV: 1.5,
        outputSwingLowHeadroomV: 0.02,
        inputCommonModeHighHeadroomV: 1.5,
        inputCommonModeLowHeadroomV: 0,
        railToRailInput: false,
        railToRailOutput: false,
      },
      recommendedCircuit: ['전원 디커플링', '상단 common-mode/headroom 검토'],
      tags: ['opamp', 'analog', 'lm324'],
    },
  },
  {
    canonicalMpn: 'TL072',
    manufacturerName: 'Texas Instruments / STMicroelectronics',
    normalizedPartName: 'TL072 JFET input dual operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tl072',
    lifecycleStatus: 'active',
    aliasNames: ['TL072CP', 'TL072CN', 'TL072CD'],
    pinSchemaJson: {
      package: 'DIP-8 / SOIC-8',
      pinCount: 8,
      powerPins: ['VCC', 'V+'],
      groundPins: ['GND', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: 'JFET 입력 듀얼 OP-Amp. GBW는 LM358보다 높지만 rail-to-rail 입출력은 아닙니다.',
      supplyVoltage: { min: 7, typ: 15, max: 36, recommended: [12, 15] },
      absoluteMax: { supplyVoltageMax: 36 },
      analogCharacteristics: {
        gbwHz: 3_000_000,
        outputSwingHighHeadroomV: 1.5,
        outputSwingLowHeadroomV: 1.5,
        inputCommonModeHighHeadroomV: 4,
        inputCommonModeLowHeadroomV: 4,
        railToRailInput: false,
        railToRailOutput: false,
      },
      recommendedCircuit: ['단일 5V보다는 충분한 양전원/여유 전원 검토', 'GBW와 common-mode 범위 확인'],
      tags: ['opamp', 'analog', 'tl072'],
    },
  },
  {
    canonicalMpn: 'NE5532',
    manufacturerName: 'Texas Instruments / onsemi / Nexperia',
    normalizedPartName: 'NE5532 low-noise dual operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/ne5532',
    lifecycleStatus: 'active',
    aliasNames: ['NE5532P', 'NE5532D'],
    pinSchemaJson: {
      package: 'DIP-8 / SOIC-8',
      pinCount: 8,
      powerPins: ['VCC', 'V+'],
      groundPins: ['GND', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '저잡음 듀얼 OP-Amp. 오디오 계열에서 흔하지만 rail-to-rail 출력은 아닙니다.',
      supplyVoltage: { min: 6, typ: 15, max: 30, recommended: [12, 15] },
      absoluteMax: { supplyVoltageMax: 30 },
      analogCharacteristics: {
        gbwHz: 10_000_000,
        outputSwingHighHeadroomV: 1.5,
        outputSwingLowHeadroomV: 1.5,
        inputCommonModeHighHeadroomV: 3,
        inputCommonModeLowHeadroomV: 3,
        railToRailInput: false,
        railToRailOutput: false,
      },
      recommendedCircuit: ['오디오 대역/헤드룸 확인', '단일 저전압 동작은 별도 검토'],
      tags: ['opamp', 'analog', 'audio', 'ne5532'],
    },
  },
  {
    canonicalMpn: 'MCP6002T-I/SN',
    manufacturerName: 'Microchip Technology',
    normalizedPartName: 'MCP6002 rail-to-rail dual operational amplifier',
    datasheetUrl: 'https://ww1.microchip.com/downloads/aemDocuments/documents/MSLD/ProductDocuments/DataSheets/MCP6001-1R-1U-2-4-Data-Sheet-20001685E.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP6002', 'MCP6002-I/P', 'MCP6002T-I/OT'],
    pinSchemaJson: {
      package: 'SOIC-8 / DIP-8',
      pinCount: 8,
      powerPins: ['VDD', 'V+'],
      groundPins: ['VSS', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '저전력 rail-to-rail 입출력 듀얼 OP-Amp.',
      supplyVoltage: { min: 1.8, typ: 5, max: 6, recommended: [3.3, 5] },
      absoluteMax: { supplyVoltageMax: 7 },
      analogCharacteristics: {
        gbwHz: 1_000_000,
        outputSwingHighHeadroomV: 0.02,
        outputSwingLowHeadroomV: 0.02,
        inputCommonModeHighHeadroomV: 0,
        inputCommonModeLowHeadroomV: 0,
        railToRailInput: true,
        railToRailOutput: true,
      },
      recommendedCircuit: ['단일 3.3V/5V ADC 구동에 적합', '전원 근처 디커플링'],
      tags: ['opamp', 'analog', 'rail-to-rail', 'mcp6002'],
    },
  },
  {
    canonicalMpn: 'TLV2372IDR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'TLV2372 rail-to-rail dual operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/tlv2372',
    lifecycleStatus: 'active',
    aliasNames: ['TLV2372', 'TLV2372IP', 'TLV2372IN'],
    pinSchemaJson: {
      package: 'SOIC-8 / DIP-8',
      pinCount: 8,
      powerPins: ['VDD', 'V+'],
      groundPins: ['VSS', 'V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '범용 rail-to-rail 입출력 듀얼 OP-Amp.',
      supplyVoltage: { min: 2.7, typ: 5, max: 16, recommended: [3.3, 5] },
      absoluteMax: { supplyVoltageMax: 16.5 },
      analogCharacteristics: {
        gbwHz: 3_000_000,
        outputSwingHighHeadroomV: 0.05,
        outputSwingLowHeadroomV: 0.05,
        inputCommonModeHighHeadroomV: 0,
        inputCommonModeLowHeadroomV: 0,
        railToRailInput: true,
        railToRailOutput: true,
      },
      recommendedCircuit: ['저전압 단일 전원 신호조절에 적합'],
      tags: ['opamp', 'analog', 'rail-to-rail', 'tlv2372'],
    },
  },
  {
    canonicalMpn: 'OPA2333AIDR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'OPA2333 zero-drift rail-to-rail dual operational amplifier',
    datasheetUrl: 'https://www.ti.com/lit/gpn/opa2333',
    lifecycleStatus: 'active',
    aliasNames: ['OPA2333', 'OPA2333AID'],
    pinSchemaJson: {
      package: 'SOIC-8',
      pinCount: 8,
      powerPins: ['V+'],
      groundPins: ['V-'],
      signalPins: ['IN+', 'IN-', 'OUT'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '제로 드리프트 rail-to-rail 듀얼 OP-Amp. 정밀 저속 센서 증폭에 적합합니다.',
      supplyVoltage: { min: 1.8, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      absoluteMax: { supplyVoltageMax: 6 },
      analogCharacteristics: {
        gbwHz: 350_000,
        outputSwingHighHeadroomV: 0.02,
        outputSwingLowHeadroomV: 0.02,
        inputCommonModeHighHeadroomV: 0,
        inputCommonModeLowHeadroomV: 0,
        railToRailInput: true,
        railToRailOutput: true,
      },
      recommendedCircuit: ['정밀/저속 신호에 유리', '대역폭 요구치가 크면 GBW 재검토'],
      tags: ['opamp', 'analog', 'precision', 'rail-to-rail', 'opa2333'],
    },
  },
  {
    canonicalMpn: 'SEN0161',
    manufacturerName: 'DFRobot',
    normalizedPartName: 'Gravity analog pH sensor meter kit',
    datasheetUrl: 'https://wiki.dfrobot.com/gravity__analog_ph_sensor_meter_kit_v2_sku_sen0161-v2',
    lifecycleStatus: 'active',
    sourceQuality: 'module-verified',
    aliasNames: ['PH-4502C', 'PH4502C'],
    pinSchemaJson: {
      package: 'Module',
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['PO', 'AOUT'],
      interfaces: ['ADC'],
    },
    specsJson: {
      category: 'module',
      summary: '아날로그 pH 프런트엔드 모듈. 고임피던스 전극과 보정 조건 때문에 ADC 입력 안정성 검토가 중요합니다.',
      supplyVoltage: { min: 5, typ: 5, max: 5, recommended: [5] },
      ioVoltage: { nominal: [5] },
      interfaces: ['ADC'],
      analogCharacteristics: {
        outputImpedanceOhms: 50_000,
        needsBufferForAdc: true,
        recommendedAdcSourceImpedanceOhms: 10_000,
        note: '샘플링 ADC나 긴 배선에서는 버퍼/저역통과 필터가 있으면 더 안정적입니다.',
      },
      recommendedCircuit: ['ADC 앞단 버퍼 또는 RC 안정화 검토', '보정용 기준점과 레퍼런스 전압 분리 고려'],
      tags: ['ph', 'analog', 'sensor', 'module'],
    },
  },
  {
    canonicalMpn: 'SEN0244',
    manufacturerName: 'DFRobot',
    normalizedPartName: 'Gravity analog TDS sensor meter',
    datasheetUrl: 'https://wiki.dfrobot.com/gravity__analog_tds_sensor___meter_for_arduino_sku__sen0244',
    lifecycleStatus: 'active',
    sourceQuality: 'module-verified',
    aliasNames: ['TDS Sensor', 'Gravity TDS'],
    pinSchemaJson: {
      package: 'Module',
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['A', 'AOUT'],
      interfaces: ['ADC'],
    },
    specsJson: {
      category: 'module',
      summary: '수질 TDS 측정용 아날로그 모듈.',
      supplyVoltage: { min: 3.3, typ: 5, max: 5.5, recommended: [5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['ADC'],
      analogCharacteristics: {
        outputImpedanceOhms: 30_000,
        needsBufferForAdc: true,
        recommendedAdcSourceImpedanceOhms: 10_000,
        note: '샘플링 ADC 앞단에서 버퍼 또는 느린 RC 필터를 두면 더 안정적일 수 있습니다.',
      },
      recommendedCircuit: ['ADC 버퍼 또는 저역통과 필터 검토', '온도보정 경로 고려'],
      tags: ['tds', 'water-quality', 'analog', 'sensor'],
    },
  },
  {
    canonicalMpn: 'DFR0300',
    manufacturerName: 'DFRobot',
    normalizedPartName: 'Gravity analog EC meter',
    datasheetUrl: 'https://wiki.dfrobot.com/gravity__analog_ec_meter_sku_dfr0300',
    lifecycleStatus: 'active',
    sourceQuality: 'module-verified',
    aliasNames: ['EC Sensor', 'Gravity EC'],
    pinSchemaJson: {
      package: 'Module',
      powerPins: ['VCC'],
      groundPins: ['GND'],
      signalPins: ['AOUT'],
      interfaces: ['ADC'],
    },
    specsJson: {
      category: 'module',
      summary: '전기전도도(EC) 측정용 아날로그 프런트엔드 모듈.',
      supplyVoltage: { min: 5, typ: 5, max: 5, recommended: [5] },
      ioVoltage: { nominal: [5] },
      interfaces: ['ADC'],
      analogCharacteristics: {
        outputImpedanceOhms: 40_000,
        needsBufferForAdc: true,
        recommendedAdcSourceImpedanceOhms: 10_000,
        note: '고임피던스 프런트엔드라서 ADC 직결 시 샘플링 오차/노이즈를 점검하는 편이 좋습니다.',
      },
      recommendedCircuit: ['ADC 버퍼 또는 샘플링 여유 검토', '탐침/보정 구조 확인'],
      tags: ['ec', 'water-quality', 'analog', 'sensor'],
    },
  },
  {
    canonicalMpn: 'HX711',
    manufacturerName: 'Avia Semiconductor',
    normalizedPartName: 'HX711 load cell ADC',
    datasheetUrl: 'https://cdn.sparkfun.com/datasheets/Sensors/ForceFlex/hx711_english.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['HX711ADC', 'Load Cell Amplifier'],
    pinSchemaJson: {
      package: 'SOP-16',
      pinCount: 16,
      powerPins: ['VSUP', 'AVDD', 'DVDD'],
      groundPins: ['AGND', 'DGND'],
      signalPins: ['INA+', 'INA-', 'INB+', 'INB-', 'DOUT', 'PD_SCK'],
      interfaces: ['GPIO'],
    },
    specsJson: {
      category: 'analog-front-end',
      summary: '로드셀용 24-bit ADC/프로그래머블 게인 프런트엔드.',
      supplyVoltage: { min: 2.6, typ: 5, max: 5.5, recommended: [5, 3.3] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['GPIO'],
      analogCharacteristics: {
        needsBufferForAdc: false,
        note: '외부 MCU ADC 직결 대상이 아니라 자체 프런트엔드/ADC를 포함합니다.',
      },
      recommendedCircuit: ['브리지 센서 배선 균형', 'AVDD/레퍼런스 디커플링', '디지털 클럭 노이즈 분리'],
      tags: ['loadcell', 'adc', 'frontend', 'hx711'],
    },
  },
  {
    canonicalMpn: 'ADS1115',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'ADS1115 16-bit I2C ADC',
    datasheetUrl: 'https://www.ti.com/lit/gpn/ads1115',
    lifecycleStatus: 'active',
    aliasNames: ['ADS1115IDGSR', 'ADS1115 Breakout'],
    pinSchemaJson: {
      package: 'VSSOP-10 / Module',
      pinCount: 10,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['AIN0', 'AIN1', 'AIN2', 'AIN3', 'ADDR', 'ALERT/RDY'],
      interfaces: ['I2C', 'ADC'],
    },
    specsJson: {
      category: 'interface',
      summary: '16-bit delta-sigma ADC. 느린 고정밀 측정에 적합합니다.',
      supplyVoltage: { min: 2.0, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['I2C', 'ADC'],
      adcProfile: {
        acquisitionTimeUs: 8,
        sampleCapacitancePf: 5,
        effectiveBits: 16,
        referenceVoltage: 4.096,
        note: 'ADS1115는 delta-sigma 구조라 MCU SAR ADC보다 고임피던스 입력에 상대적으로 유리합니다.',
      },
      recommendedCircuit: ['ADDR 스트랩 확인', '입력 RC 필터 및 full-scale 범위 확인'],
      tags: ['adc', 'i2c', 'precision', 'ads1115'],
    },
  },
  {
    canonicalMpn: 'ADS1015',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'ADS1015 12-bit I2C ADC',
    datasheetUrl: 'https://www.ti.com/lit/gpn/ads1015',
    lifecycleStatus: 'active',
    aliasNames: ['ADS1015IDGS', 'ADS1015 Breakout'],
    pinSchemaJson: {
      package: 'VSSOP-10 / Module',
      pinCount: 10,
      powerPins: ['VDD'],
      groundPins: ['GND'],
      signalPins: ['AIN0', 'AIN1', 'AIN2', 'AIN3', 'ADDR', 'ALERT/RDY'],
      interfaces: ['I2C', 'ADC'],
    },
    specsJson: {
      category: 'interface',
      summary: '12-bit delta-sigma ADC. ADS1115보다 빠른 변환이 필요한 저속 정밀 측정에 적합합니다.',
      supplyVoltage: { min: 2.0, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['I2C', 'ADC'],
      adcProfile: {
        acquisitionTimeUs: 4,
        sampleCapacitancePf: 5,
        effectiveBits: 12,
        referenceVoltage: 4.096,
        note: 'ADS1015는 ADS1115 계열 중 더 빠른 12-bit 변환 프로파일로 취급합니다.',
      },
      recommendedCircuit: ['ADDR 스트랩 확인', '입력 RC 필터 및 full-scale 범위 확인'],
      tags: ['adc', 'i2c', 'precision', 'ads1015'],
    },
  },
  {
    canonicalMpn: 'MCP3208',
    manufacturerName: 'Microchip',
    normalizedPartName: 'MCP3208 12-bit SPI ADC',
    datasheetUrl: 'https://ww1.microchip.com/downloads/aemDocuments/documents/APID/ProductDocuments/DataSheets/21298e.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['MCP3208-CI/P', 'MCP3208 Breakout'],
    pinSchemaJson: {
      package: 'DIP-16 / SOIC-16 / Module',
      pinCount: 16,
      powerPins: ['VDD', 'VREF'],
      groundPins: ['VSS', 'AGND', 'DGND'],
      signalPins: ['CH0', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5', 'CH6', 'CH7', 'CLK', 'DOUT', 'DIN', 'CS/SHDN'],
      interfaces: ['SPI', 'ADC'],
    },
    specsJson: {
      category: 'interface',
      summary: '12-bit SPI SAR ADC. MCU 확장용 다채널 아날로그 입력으로 많이 사용됩니다.',
      supplyVoltage: { min: 2.7, typ: 5, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['SPI', 'ADC'],
      adcProfile: {
        acquisitionTimeUs: 1.5,
        sampleCapacitancePf: 20,
        effectiveBits: 12,
        referenceVoltage: 5,
        note: 'MCP3208은 외부 VREF에 의존하는 SAR ADC라 소스 임피던스와 샘플링 여유 검토가 중요합니다.',
      },
      recommendedCircuit: ['VREF 바이패스', 'CHx 입력 소스 임피던스 검토', 'AGND/DGND 리턴 경로 확인'],
      tags: ['adc', 'spi', 'mcp3208', 'analog-input'],
    },
  },
  {
    canonicalMpn: 'STM32F103C8T6',
    manufacturerName: 'STMicroelectronics',
    normalizedPartName: 'STM32F103C8T6 Arm Cortex-M3 MCU',
    datasheetUrl: 'https://www.st.com/resource/en/datasheet/stm32f103c8.pdf',
    lifecycleStatus: 'active',
    aliasNames: ['STM32F103C8', 'Blue Pill MCU'],
    pinSchemaJson: {
      package: 'LQFP-48',
      pinCount: 48,
      powerPins: ['VDD', 'VDDA'],
      groundPins: ['VSS', 'VSSA'],
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
    },
    specsJson: {
      category: 'mcu',
      summary: 'Blue Pill 계열에서 흔한 STM32 MCU.',
      supplyVoltage: { min: 2.0, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { nominal: [3.3], tolerance: '5V tolerant 아님' },
      absoluteMax: { supplyVoltageMax: 4.0, ioVoltageMax: 3.6 },
      interfaces: ['GPIO', 'ADC', 'PWM', 'I2C', 'SPI', 'UART'],
      adcProfile: {
        acquisitionTimeUs: 1.5,
        sampleCapacitancePf: 8,
        effectiveBits: 12,
        referenceVoltage: 3.3,
        note: 'STM32F1 SAR ADC의 짧은 샘플링 시간 가정값.',
      },
      recommendedCircuit: ['VDDA/ADC 레퍼런스 분리', 'ADC 입력 소스 임피던스/샘플링 시간 확인'],
      tags: ['stm32', 'mcu', 'adc', 'blue-pill'],
    },
  },
  {
    canonicalMpn: 'SHT31-DIS-B',
    manufacturerName: 'Sensirion',
    normalizedPartName: 'SHT31 digital humidity and temperature sensor',
    datasheetUrl:
      'https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'DFN-8',
      pinCount: 8,
      powerPins: ['VDD'],
      groundPins: ['VSS'],
      interfaces: ['I2C'],
    },
    specsJson: {
      category: 'sensor',
      summary: '고정밀 디지털 온습도 센서.',
      supplyVoltage: { min: 2.15, typ: 3.3, max: 5.5, recommended: [3.3] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['I2C'],
      requiresExternalParts: ['I2C 풀업 저항', '0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['ADDR 핀 스트랩 확인', '센서 주변 열원 회피'],
      tags: ['humidity', 'temperature', 'i2c', 'sensirion'],
    },
  },
  {
    canonicalMpn: 'VL53L0XV2',
    manufacturerName: 'STMicroelectronics',
    normalizedPartName: 'VL53L0X time-of-flight ranging sensor',
    datasheetUrl: 'https://www.st.com/resource/en/datasheet/vl53l0x.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'Module',
      interfaces: ['I2C'],
      powerPins: ['VIN', 'VDD'],
      groundPins: ['GND'],
    },
    specsJson: {
      category: 'sensor',
      summary: '근거리 ToF 거리 센서.',
      supplyVoltage: { min: 2.6, typ: 2.8, max: 3.5, recommended: [3.3] },
      ioVoltage: { nominal: [2.8, 3.3] },
      interfaces: ['I2C'],
      requiresExternalParts: ['I2C 풀업 저항', 'XSHUT 제어 시 선택적 풀업'],
      recommendedCircuit: ['모듈/브레이크아웃이면 레벨시프터 내장 여부 확인'],
      tags: ['tof', 'distance', 'i2c', 'st'],
    },
  },
  {
    canonicalMpn: 'VL53L1XV0FY/1',
    manufacturerName: 'STMicroelectronics',
    normalizedPartName: 'VL53L1X long distance time-of-flight sensor',
    datasheetUrl: 'https://www.st.com/resource/en/datasheet/vl53l1x.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'LGA-12',
      pinCount: 12,
      powerPins: ['AVDD', 'IOVDD'],
      groundPins: ['GND'],
      interfaces: ['I2C'],
    },
    specsJson: {
      category: 'sensor',
      summary: '장거리 ToF 거리 센서.',
      supplyVoltage: { min: 2.6, typ: 2.8, max: 3.5, recommended: [3.3] },
      ioVoltage: { nominal: [2.8, 3.3] },
      interfaces: ['I2C'],
      requiresExternalParts: ['I2C 풀업 저항', '0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['XSHUT/INT 사용 여부 명시', '광학 창 주변 keepout 고려'],
      tags: ['tof', 'distance', 'i2c', 'st'],
    },
  },
  {
    canonicalMpn: 'INA219AIDCNR',
    manufacturerName: 'Texas Instruments',
    normalizedPartName: 'INA219 current and power monitor',
    datasheetUrl: 'https://www.ti.com/lit/gpn/ina219',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'SOT-23-8',
      pinCount: 8,
      powerPins: ['VS'],
      groundPins: ['GND'],
      interfaces: ['I2C'],
    },
    specsJson: {
      category: 'power-monitor',
      summary: '고측 전류/전력 모니터 IC.',
      supplyVoltage: { min: 3, typ: 3.3, max: 5.5, recommended: [3.3, 5] },
      ioVoltage: { nominal: [3.3, 5] },
      interfaces: ['I2C'],
      requiresExternalParts: ['샌스 저항', 'I2C 풀업 저항', '0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['샌스 저항 전력 여유', '측정 버스 전압 범위 확인'],
      tags: ['current', 'power', 'monitor', 'i2c'],
    },
  },
  {
    canonicalMpn: 'BNO055',
    manufacturerName: 'Bosch Sensortec',
    normalizedPartName: 'BNO055 intelligent 9-axis absolute orientation sensor',
    datasheetUrl:
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bno055-ds000.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'LGA-28',
      pinCount: 28,
      powerPins: ['VDD', 'VDDIO'],
      groundPins: ['GND'],
      interfaces: ['I2C', 'UART'],
    },
    specsJson: {
      category: 'sensor',
      summary: '센서 퓨전 내장 9축 절대 자세 센서.',
      supplyVoltage: { min: 2.4, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { nominal: [3.3] },
      interfaces: ['I2C', 'UART'],
      requiresExternalParts: ['0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['부트/모드 핀 상태 명시', 'I2C 주소/모드 선택 명시'],
      tags: ['imu', 'orientation', 'bosch'],
    },
  },
  {
    canonicalMpn: 'MFRC522',
    manufacturerName: 'NXP Semiconductors',
    normalizedPartName: 'MFRC522 contactless reader IC',
    datasheetUrl: 'https://www.nxp.com/docs/en/data-sheet/MFRC522.pdf',
    lifecycleStatus: 'active',
    pinSchemaJson: {
      package: 'HVQFN-32',
      pinCount: 32,
      powerPins: ['PVDD', 'DVDD', 'TVDD', 'AVDD'],
      groundPins: ['GND'],
      interfaces: ['I2C', 'SPI', 'UART'],
    },
    specsJson: {
      category: 'rf',
      summary: '13.56 MHz RFID/NFC 리더 IC.',
      supplyVoltage: { min: 2.5, typ: 3.3, max: 3.6, recommended: [3.3] },
      ioVoltage: { nominal: [3.3] },
      interfaces: ['I2C', 'SPI', 'UART'],
      requiresExternalParts: ['안테나 매칭 네트워크', 'RF 수동소자', '0.1uF 디커플링 커패시터'],
      recommendedCircuit: ['모듈과 raw IC 규칙 분리', 'SDA 핀은 SPI CS 의미로도 사용 가능'],
      tags: ['rfid', 'nfc', 'rf'],
    },
  },
];

export const STARTER_PART_MASTER_BY_MPN = new Map(
  STARTER_PART_MASTER_RECORDS.map(record => [record.canonicalMpn, record])
);

function mergePartMasterRecords(records: PartMasterRecord[]) {
  const merged = new Map<string, PartMasterRecord>();
  for (const record of records) {
    merged.set(record.canonicalMpn, record);
  }
  return Array.from(merged.values());
}

export const PART_MASTER_RECORDS: PartMasterRecord[] = mergePartMasterRecords([
  ...STARTER_PART_MASTER_RECORDS,
  ...CURATED_PART_MASTER_RECORDS,
]);

export const PART_MASTER_BY_MPN = new Map(
  PART_MASTER_RECORDS.map(record => [record.canonicalMpn, record])
);

export function normalizePartMasterLookupToken(value?: string) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

const PART_MASTER_LOOKUP_BY_TOKEN = (() => {
  const lookup = new Map<string, PartMasterRecord>();
  for (const record of PART_MASTER_RECORDS) {
    const keys = [record.canonicalMpn, record.normalizedPartName, ...(record.aliasNames ?? [])];
    for (const key of keys) {
      const normalized = normalizePartMasterLookupToken(key);
      if (normalized) {
        lookup.set(normalized, record);
      }
    }
  }
  return lookup;
})();

export function findPartMasterRecordByLookupCandidates(candidates: Array<string | undefined | null>) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const direct = PART_MASTER_LOOKUP_BY_TOKEN.get(normalizePartMasterLookupToken(candidate));
    if (direct) {
      return direct;
    }

    const normalizedCandidate = normalizePartMasterLookupToken(candidate);
    for (const record of PART_MASTER_RECORDS) {
      if (normalizedCandidate.includes(normalizePartMasterLookupToken(record.canonicalMpn))) {
        return record;
      }
      if ((record.aliasNames ?? []).some(aliasName => normalizedCandidate.includes(normalizePartMasterLookupToken(aliasName)))) {
        return record;
      }
    }
  }

  return undefined;
}
