import type {
  ComponentDesignRules,
  ComponentTemplate,
  RequiredPin,
  VoltageCompatibility,
} from '@/types';

const POWER_PINS: RequiredPin[] = [
  { name: 'VCC', allowedTypes: ['POWER'] },
  { name: 'GND', allowedTypes: ['GND'] },
];

const SINGLE_BUS_SIGNAL: RequiredPin[] = [
  ...POWER_PINS,
  { name: 'Data', allowedTypes: ['DIGITAL'] },
];

const I2C_SIGNAL: RequiredPin[] = [
  ...POWER_PINS,
  { name: 'SDA', allowedTypes: ['ANALOG', 'DIGITAL'] },
  { name: 'SCL', allowedTypes: ['ANALOG', 'DIGITAL'] },
];

const ANALOG_SIGNAL: RequiredPin[] = [
  ...POWER_PINS,
  { name: 'AOut', allowedTypes: ['ANALOG'] },
];

function verifiedSensor(
  id: string,
  name: string,
  description: string,
  icon: string,
  compatibleVoltage: VoltageCompatibility,
  requiredPins: RequiredPin[],
  design: ComponentDesignRules,
  libraryIncludes?: string[]
): ComponentTemplate {
  return {
    id,
    name,
    category: 'SENSOR',
    description,
    icon,
    compatibleVoltage,
    requiredPins,
    libraryIncludes,
    design,
  };
}

export const POPULAR_SENSOR_TEMPLATES: ComponentTemplate[] = [
  verifiedSensor(
    'tpl_bmp280',
    '기압 센서 BMP280',
    'BMP280: 공식 데이터시트가 확인된 Bosch 디지털 기압 센서',
    'Thermometer',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Bosch BMP280 Datasheet',
          url: 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'info',
          titleKey: 'design.3v3-sensor',
          messageKey: 'design.3v3-sensor',
          title: '3.3V 센서',
          message: '원칩 기준 전압은 3.3V 계열로 보고 5V 보드에는 레벨과 전원 구성을 먼저 확인합니다.',
        },
      ],
      tags: ['pressure', 'temperature', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_bme280',
    '환경 센서 BME280',
    'BME280: 공식 데이터시트가 확인된 Bosch 온도/습도/기압 센서',
    'Thermometer',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Bosch BME280 Datasheet',
          url: 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      tags: ['pressure', 'temperature', 'humidity', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_bme680',
    '환경 센서 BME680',
    'BME680: 공식 데이터시트가 확인된 Bosch 공기질/환경 센서',
    'Wind',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Bosch BME680 Datasheet',
          url: 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'info',
          titleKey: 'design.compensation-needed',
          messageKey: 'design.compensation-needed',
          title: '보상 알고리즘 필요',
          message: '가스 값 해석은 원시값만으로 끝나지 않아서 상위 소프트웨어 보정 단계를 함께 설계하는 편이 좋습니다.',
        },
      ],
      tags: ['air-quality', 'pressure', 'temperature', 'humidity', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_ds18b20',
    '온도 센서 DS18B20',
    'DS18B20: 공식 데이터시트가 확인된 1-Wire 디지털 온도 센서',
    'Thermometer',
    'BOTH',
    SINGLE_BUS_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'SINGLE_BUS',
      datasheetSources: [
        {
          label: 'Analog Devices DS18B20 Datasheet',
          url: 'https://www.analog.com/media/en/technical-documentation/data-sheets/DS18B20.pdf',
        },
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
          titleKey: 'design.onewire-pullup',
          messageKey: 'design.onewire-pullup',
          title: '풀업 저항 필요',
          message: '1-Wire 버스 특성상 데이터 라인 풀업 저항 유무를 배선 단계에서 함께 확인해야 합니다.',
        },
      ],
      requiresExternalParts: ['1-Wire 데이터 라인 풀업 저항'],
      tags: ['temperature', 'single-bus'],
    },
    ['OneWire.h', 'DallasTemperature.h']
  ),
  verifiedSensor(
    'tpl_lm35',
    '온도 센서 LM35',
    'LM35: 공식 데이터시트가 확인된 TI 아날로그 온도 센서',
    'Thermometer',
    '5V',
    ANALOG_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'ANALOG',
      datasheetSources: [
        {
          label: 'TI LM35 Datasheet',
          url: 'https://www.ti.com/lit/gpn/lm35',
        },
      ],
      preferredBoardPins: {
        uno: { AOut: ['A0', 'A1'] },
        nano: { AOut: ['A0', 'A1'] },
        esp32: { AOut: ['G32', 'G33', 'G34'] },
      },
      tags: ['temperature', 'analog'],
    }
  ),
  verifiedSensor(
    'tpl_sht31',
    '온습도 센서 SHT31',
    'SHT31: 공식 데이터시트가 확인된 Sensirion 온습도 센서',
    'Droplets',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Sensirion SHT3x Datasheet',
          url: 'https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      tags: ['temperature', 'humidity', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_vl53l0x',
    'ToF 센서 VL53L0X',
    'VL53L0X: 공식 데이터시트가 확인된 ST 거리 측정 센서',
    'Radar',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'ST VL53L0X Datasheet',
          url: 'https://www.st.com/resource/en/datasheet/vl53l0x.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      requiresExternalParts: ['I2C 풀업 저항 검토'],
      tags: ['distance', 'tof', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_vl53l1x',
    'ToF 센서 VL53L1X',
    'VL53L1X: 공식 데이터시트가 확인된 ST 장거리 ToF 센서',
    'Radar',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'ST VL53L1X Datasheet',
          url: 'https://www.st.com/resource/en/datasheet/vl53l1x.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'info',
          titleKey: 'design.optional-xshut-gpio1',
          messageKey: 'design.optional-xshut-gpio1',
          title: 'XSHUT/GPIO1 옵션 핀',
          message: '기본 거리 읽기 외에 절전과 인터럽트를 쓰려면 추가 제어 핀까지 모델링하는 편이 좋습니다.',
        },
      ],
      tags: ['distance', 'tof', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_bno055',
    '자세 센서 BNO055',
    'BNO055: 공식 데이터시트가 확인된 Bosch 9축 자세 센서',
    'Radar',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Bosch BNO055 Datasheet',
          url: 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bno055-ds000.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'info',
          titleKey: 'design.sensor-fusion',
          messageKey: 'design.sensor-fusion',
          title: '센서 퓨전 내장',
          message: '원시 가속도/자이로/자기장과 융합 출력이 함께 존재하므로 코드 생성 단계에서 출력 모드 선택이 필요합니다.',
        },
      ],
      tags: ['imu', 'orientation', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_ina219',
    '전류 센서 INA219',
    'INA219: 공식 데이터시트가 확인된 TI 전류/전력 모니터 센서',
    'Zap',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'TI INA219 Datasheet',
          url: 'https://www.ti.com/lit/gpn/ina219',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'warning',
          titleKey: 'design.high-current-routing',
          messageKey: 'design.high-current-routing',
          title: '고전류 배선 분리',
          message: '센서와 MCU 핀만 보는 수준을 넘어서 션트와 부하 경로를 PCB 단계에서 따로 검토해야 합니다.',
        },
      ],
      tags: ['current', 'power', 'i2c'],
    }
  ),
  verifiedSensor(
    'tpl_max30102',
    '맥박 센서 MAX30102',
    'MAX30102: 공식 데이터시트가 확인된 심박/산소포화도 센서',
    'Mic',
    '3.3V',
    I2C_SIGNAL,
    {
      datasheetStatus: 'official-complete',
      preferredInterface: 'I2C',
      datasheetSources: [
        {
          label: 'Analog Devices MAX30102 Datasheet',
          url: 'https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf',
        },
      ],
      preferredBoardPins: {
        uno: { SDA: ['A4'], SCL: ['A5'] },
        nano: { SDA: ['A4'], SCL: ['A5'] },
        esp32: { SDA: ['G21'], SCL: ['G22'] },
        rpi4: { SDA: ['GPIO2'], SCL: ['GPIO3'] },
      },
      warnings: [
        {
          severity: 'info',
          titleKey: 'design.optical-placement',
          messageKey: 'design.optical-placement',
          title: '광학 센서 배치 중요',
          message: '센서 패키지 위치와 주변광 차단 조건이 정확도에 영향을 주므로 기구와 PCB를 같이 봐야 합니다.',
        },
      ],
      tags: ['bio', 'heartrate', 'spo2', 'i2c'],
    }
  ),
];
