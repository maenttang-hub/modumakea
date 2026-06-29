export interface ModuleAliasRecord {
  alias: string;
  normalizedAlias: string;
  moduleFamily: string;
  canonicalChip: string;
  manufacturerName: string;
  category:
    | 'motion'
    | 'temperature_humidity'
    | 'pressure'
    | 'gas'
    | 'sound'
    | 'proximity'
    | 'light'
    | 'sensor'
    | 'location'
    | 'biometric'
    | 'weight'
    | 'rf';
  interfaces: Array<'ADC' | 'I2C' | 'SPI' | 'UART' | 'ONEWIRE'>;
  supplyVoltage?: {
    min?: number;
    max?: number;
    nominal?: number[];
  };
  ioVoltage?: {
    nominal?: number[];
    note?: string;
  };
  commonPins: string[];
  referenceUrls?: string[];
  notes: string;
  tags?: string[];
}

export function normalizeModuleAlias(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');

  return normalized
    .replace(/^HC(\d{2})$/, 'HC-$1')
    .replace(/^GY(\d+)$/, 'GY-$1')
    .replace(/^CJ-MCU-(\d+)$/, 'CJMCU-$1')
    .replace(/^CJMCU(\d+)$/, 'CJMCU-$1');
}

export const COMMON_MODULE_ALIAS_RECORDS: ModuleAliasRecord[] = [
  {
    alias: 'GY-521',
    normalizedAlias: 'GY-521',
    moduleFamily: 'GY',
    canonicalChip: 'MPU-6050',
    manufacturerName: 'TDK InvenSense',
    category: 'motion',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '보드 리비전에 따라 레귤레이터/레벨시프터 유무가 다름',
    },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'XDA', 'XCL', 'AD0', 'INT'],
    referenceUrls: [
      'https://learn.adafruit.com/adafruit-mpu-6050-6-dof-accel-and-gyro-sensor-stemma-qt-qwiic',
    ],
    notes: 'MPU-6050 6축 IMU 브레이크아웃의 흔한 클론 모듈명. 전원/IO 레벨은 판매처별 편차가 큼.',
    tags: ['clone-module', 'imu', 'mpu6050', 'gy'],
  },
  {
    alias: 'GY-87',
    normalizedAlias: 'GY-87',
    moduleFamily: 'GY',
    canonicalChip: 'MPU-6050 + HMC5883L/QMC5883L + BMP180',
    manufacturerName: 'Mixed clone BOM',
    category: 'motion',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '콤보 보드 구성 칩이 HMC5883L 또는 QMC5883L로 바뀌는 경우가 흔함',
    },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'INT'],
    notes: '9축/10축처럼 판매되지만 실제 탑재 칩 조합이 클론별로 달라 강한 판정 전에는 실장 칩 식별이 필요.',
    tags: ['clone-module', 'imu', 'combo-board', 'gy'],
  },
  {
    alias: 'GY-271',
    normalizedAlias: 'GY-271',
    moduleFamily: 'GY',
    canonicalChip: 'HMC5883L/QMC5883L',
    manufacturerName: 'Honeywell / QST (clone-dependent)',
    category: 'motion',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '실장 칩이 HMC5883L인지 QMC5883L인지 확인이 필요',
    },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'DRDY'],
    notes: 'GY-271은 자력계 브레이크아웃의 흔한 판매명인데, HMC5883L 호환 또는 QMC5883L 클론이 뒤섞여 있다.',
    tags: ['clone-module', 'magnetometer', 'gy', 'hmc5883l', 'qmc5883l'],
  },
  {
    alias: 'GY-273',
    normalizedAlias: 'GY-273',
    moduleFamily: 'GY',
    canonicalChip: 'HMC5883L/QMC5883L',
    manufacturerName: 'Honeywell / QST (clone-dependent)',
    category: 'motion',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '보드 외형이 비슷해도 QMC5883L로 대체된 경우가 흔함',
    },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'DRDY'],
    notes: 'GY-273도 GY-271과 비슷하게 자력계 클론 보드명으로 쓰이며, 실장 칩이 혼재한다.',
    tags: ['clone-module', 'magnetometer', 'gy', 'hmc5883l', 'qmc5883l'],
  },
  {
    alias: 'GY-BME280',
    normalizedAlias: 'GY-BME280',
    moduleFamily: 'GY',
    canonicalChip: 'BME280',
    manufacturerName: 'Bosch Sensortec',
    category: 'temperature_humidity',
    interfaces: ['I2C', 'SPI'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '일부 보드는 5V 입력 가능하지만 센서 코어는 3.3V 계열',
    },
    commonPins: ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'SDO', 'CSB'],
    referenceUrls: [
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf',
    ],
    notes: 'BME280 환경 센서 브레이크아웃의 흔한 GY 계열 판매명. BMP280 오실장 클론과 혼동이 잦음.',
    tags: ['clone-module', 'bme280', 'environment', 'gy'],
  },
  {
    alias: 'GY-BMP280',
    normalizedAlias: 'GY-BMP280',
    moduleFamily: 'GY',
    canonicalChip: 'BMP280',
    manufacturerName: 'Bosch Sensortec',
    category: 'pressure',
    interfaces: ['I2C', 'SPI'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '보드 입력은 5V 호환일 수 있으나 칩 자체는 3.3V 계열',
    },
    commonPins: ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'SDO', 'CSB'],
    referenceUrls: [
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf',
    ],
    notes: 'BMP280 기압 센서 브레이크아웃의 흔한 GY 판매명. BME280와 핀은 비슷하지만 습도 측정은 불가.',
    tags: ['clone-module', 'bmp280', 'pressure', 'gy'],
  },
  {
    alias: 'GY-302',
    normalizedAlias: 'GY-302',
    moduleFamily: 'GY',
    canonicalChip: 'BH1750',
    manufacturerName: 'ROHM Semiconductor',
    category: 'light',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'ADDR'],
    referenceUrls: [
      'https://learn.adafruit.com/adafruit-bh1750-ambient-light-sensor',
    ],
    notes: 'GY-302는 BH1750 조도 센서 브레이크아웃의 매우 흔한 판매명이다.',
    tags: ['clone-module', 'bh1750', 'light', 'gy'],
  },
  {
    alias: 'GY-30',
    normalizedAlias: 'GY-30',
    moduleFamily: 'GY',
    canonicalChip: 'BH1750',
    manufacturerName: 'ROHM Semiconductor',
    category: 'light',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VCC', 'GND', 'SCL', 'SDA', 'ADDR'],
    referenceUrls: [
      'https://learn.adafruit.com/adafruit-bh1750-ambient-light-sensor',
    ],
    notes: 'GY-30은 BH1750 모듈의 또 다른 흔한 표기다.',
    tags: ['clone-module', 'bh1750', 'light', 'gy'],
  },
  {
    alias: 'GY-906',
    normalizedAlias: 'GY-906',
    moduleFamily: 'GY',
    canonicalChip: 'MLX90614',
    manufacturerName: 'Melexis',
    category: 'temperature_humidity',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VIN', 'GND', 'SCL', 'SDA'],
    referenceUrls: [
      'https://wiki.dfrobot.com/SEN0206/',
    ],
    notes: 'GY-906은 MLX90614 비접촉 적외선 온도 센서 브레이크아웃의 대표적인 판매명이다.',
    tags: ['clone-module', 'mlx90614', 'ir-temperature', 'gy'],
  },
  {
    alias: 'GY-68',
    normalizedAlias: 'GY-68',
    moduleFamily: 'GY',
    canonicalChip: 'BMP180',
    manufacturerName: 'Bosch Sensortec',
    category: 'pressure',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VIN', 'GND', 'SCL', 'SDA'],
    referenceUrls: [
      'https://wiki.keyestudio.com/Ks0054_keyestudio_BMP180_Digital_Barometric_Pressure_Sensor_Module_for_Arduino',
    ],
    notes: 'GY-68은 BMP180 기압/온도 센서 보드명으로 매우 흔하다.',
    tags: ['clone-module', 'bmp180', 'pressure', 'gy'],
  },
  {
    alias: 'GY-MAX30102',
    normalizedAlias: 'GY-MAX30102',
    moduleFamily: 'GY',
    canonicalChip: 'MAX30102',
    manufacturerName: 'Analog Devices / Maxim',
    category: 'biometric',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '일부 모듈은 보드에서 1.8V 레벨을 처리하지만 INT 핀 연결 확인 필요',
    },
    commonPins: ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'INT'],
    referenceUrls: [
      'https://www.analog.com/media/en/technical-documentation/data-sheets/MAX30102.pdf',
      'https://wiki.keyestudio.com/KS0462_Keyestudio_MAX30102_Heart_Rate_Sensor',
    ],
    notes: 'MAX30102 심박/SpO2 브레이크아웃의 흔한 GY 계열 판매명.',
    tags: ['clone-module', 'max30102', 'ppg', 'gy'],
  },
  {
    alias: 'GY-MAX4466',
    normalizedAlias: 'GY-MAX4466',
    moduleFamily: 'GY',
    canonicalChip: 'MAX4466',
    manufacturerName: 'Analog Devices / Maxim',
    category: 'sound',
    interfaces: ['ADC'],
    supplyVoltage: { min: 2.4, max: 5.5, nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3, 5],
      note: '출력은 아날로그 오디오 레벨이며 MCU ADC 기준전압과 정합 필요',
    },
    commonPins: ['VCC', 'GND', 'OUT'],
    referenceUrls: [
      'https://learn.adafruit.com/adafruit-agc-electret-microphone-amplifier-max9814',
      'https://learn.adafruit.com/adafruit-microphone-amplifier-breakout',
    ],
    notes: 'MAX4466 일렉트렛 마이크 앰프 브레이크아웃의 흔한 GY 계열 판매명. 디지털 인터페이스가 아니라 아날로그 출력이다.',
    tags: ['clone-module', 'microphone', 'max4466', 'gy'],
  },
  {
    alias: 'CJMCU-811',
    normalizedAlias: 'CJMCU-811',
    moduleFamily: 'CJMCU',
    canonicalChip: 'CCS811',
    manufacturerName: 'ScioSense',
    category: 'gas',
    interfaces: ['I2C'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3],
      note: '칩 코어는 3.3V 계열이며 일부 보드만 5V 입력 레귤레이션 제공',
    },
    commonPins: ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'WAK', 'INT', 'RST'],
    referenceUrls: [
      'https://learn.adafruit.com/adafruit-ccs811-air-quality-sensor',
      'https://wiki.keyestudio.com/KS2002_EASY_Plug_CCS811_CO2_Air_Quality_Sensor(Black_and_Eco-friendly)',
    ],
    notes: 'CJMCU-811은 CCS811 eCO2/TVOC 센서 브레이크아웃의 흔한 판매명이다.',
    tags: ['clone-module', 'ccs811', 'air-quality', 'cjmcu'],
  },
  {
    alias: 'CJMCU-680',
    normalizedAlias: 'CJMCU-680',
    moduleFamily: 'CJMCU',
    canonicalChip: 'BME680',
    manufacturerName: 'Bosch Sensortec',
    category: 'gas',
    interfaces: ['I2C', 'SPI'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VIN', '3V3', 'GND', 'SCL', 'SDA', 'SDO', 'CSB'],
    referenceUrls: [
      'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme680-ds001.pdf',
      'https://wiki.dfrobot.com/SEN0248/',
    ],
    notes: 'CJMCU-680은 BME680 기반 환경/가스 센서 보드명으로 자주 보인다.',
    tags: ['clone-module', 'bme680', 'air-quality', 'cjmcu'],
  },
  {
    alias: 'DHT11-MODULE',
    normalizedAlias: 'DHT11-MODULE',
    moduleFamily: 'GENERIC',
    canonicalChip: 'DHT11',
    manufacturerName: 'Aosong',
    category: 'temperature_humidity',
    interfaces: ['ONEWIRE'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VCC', 'GND', 'DATA'],
    referenceUrls: [
      'https://wiki.keyestudio.com/Ks0034_keyestudio_DHT11_Temperature_and_Humidity_Sensor',
      'https://wiki.dfrobot.com/DFR0067/',
    ],
    notes: 'DHT11 module, KY-015 같은 이름으로 판매되는 단일 버스 온습도 센서 모듈군.',
    tags: ['clone-module', 'dht11', 'temperature', 'humidity'],
  },
  {
    alias: 'DHT22-MODULE',
    normalizedAlias: 'DHT22-MODULE',
    moduleFamily: 'GENERIC',
    canonicalChip: 'DHT22/AM2302',
    manufacturerName: 'Aosong',
    category: 'temperature_humidity',
    interfaces: ['ONEWIRE'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VCC', 'GND', 'DATA'],
    referenceUrls: [
      'https://wiki.dfrobot.com/SEN0137/',
      'https://wiki.keyestudio.com/KS0430_Keyestudio_DHT22_Temperature_and_Humidity_Sensor',
    ],
    notes: 'DHT22 또는 AM2302 모듈은 온습도 측정에 매우 흔하게 쓰이며 데이터 라인 풀업 구성이 중요하다.',
    tags: ['clone-module', 'dht22', 'am2302', 'temperature', 'humidity'],
  },
  {
    alias: 'HC-SR04',
    normalizedAlias: 'HC-SR04',
    moduleFamily: 'HC',
    canonicalChip: 'HC-SR04 ultrasonic module',
    manufacturerName: 'Generic module vendor',
    category: 'proximity',
    interfaces: ['UART'],
    supplyVoltage: { nominal: [5] },
    ioVoltage: {
      nominal: [5],
      note: 'ECHO 출력은 5V 계열이라 3.3V MCU에 직접 연결 시 레벨 시프팅 권장',
    },
    commonPins: ['VCC', 'TRIG', 'ECHO', 'GND'],
    referenceUrls: [
      'https://wiki.keyestudio.com/KS0328_Keyestudio_HR-SR04_Blue_Ultrasonic_Module',
      'https://wiki.seeedstudio.com/Grove-Ultrasonic_Ranger/',
    ],
    notes: 'HC-SR04는 가장 흔한 초음파 거리 센서 모듈명 중 하나다.',
    tags: ['clone-module', 'ultrasonic', 'distance', 'hc'],
  },
  {
    alias: 'HC-05',
    normalizedAlias: 'HC-05',
    moduleFamily: 'HC',
    canonicalChip: 'HC-05 Bluetooth SPP module',
    manufacturerName: 'Generic module vendor',
    category: 'rf',
    interfaces: ['UART'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3],
      note: 'RX 입력은 3.3V 직결 기준으로 보는 편이 안전',
    },
    commonPins: ['VCC', 'GND', 'TXD', 'RXD', 'STATE', 'EN/KEY'],
    notes: 'HC-05는 블루투스 시리얼 브리지 모듈로 센서는 아니지만 임베디드 보드에서 매우 흔하다.',
    tags: ['clone-module', 'bluetooth', 'uart', 'hc'],
  },
  {
    alias: 'HC-06',
    normalizedAlias: 'HC-06',
    moduleFamily: 'HC',
    canonicalChip: 'HC-06 Bluetooth SPP module',
    manufacturerName: 'Generic module vendor',
    category: 'rf',
    interfaces: ['UART'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3],
      note: '대부분 슬레이브 전용이며 RX는 3.3V 기준으로 보는 것이 안전',
    },
    commonPins: ['VCC', 'GND', 'TXD', 'RXD', 'STATE'],
    notes: 'HC-06도 매우 흔한 블루투스 UART 모듈명이다. 센서는 아니지만 현장에서 자주 함께 쓰인다.',
    tags: ['clone-module', 'bluetooth', 'uart', 'hc'],
  },
  {
    alias: 'GY-NEO6MV2',
    normalizedAlias: 'GY-NEO6MV2',
    moduleFamily: 'GY',
    canonicalChip: 'NEO-6M',
    manufacturerName: 'u-blox',
    category: 'location',
    interfaces: ['UART'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: {
      nominal: [3.3],
      note: 'UART 로직과 PPS 출력 레벨은 보드 설계 확인 필요',
    },
    commonPins: ['VCC', 'GND', 'TXD', 'RXD', 'PPS'],
    referenceUrls: [
      'https://cdn-learn.adafruit.com/downloads/pdf/adafruit-ultimate-gps.pdf',
    ],
    notes: 'GY-NEO6MV2는 NEO-6M GPS 보드의 대표적인 클론명이다.',
    tags: ['clone-module', 'gps', 'neo-6m', 'gy'],
  },
  {
    alias: 'DS18B20-MODULE',
    normalizedAlias: 'DS18B20-MODULE',
    moduleFamily: 'GENERIC',
    canonicalChip: 'DS18B20',
    manufacturerName: 'Analog Devices / Maxim',
    category: 'temperature_humidity',
    interfaces: ['ONEWIRE'],
    supplyVoltage: { nominal: [3.3, 5] },
    ioVoltage: { nominal: [3.3, 5] },
    commonPins: ['VCC', 'GND', 'DQ'],
    referenceUrls: [
      'https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf',
    ],
    notes: '방수 프로브형 포함 DS18B20 모듈은 1-Wire 풀업 저항 필요성이 가장 흔한 검증 포인트다.',
    tags: ['clone-module', 'ds18b20', 'onewire', 'temperature'],
  },
];

export const GY_MODULE_ALIAS_RECORDS = COMMON_MODULE_ALIAS_RECORDS.filter(
  record => record.moduleFamily === 'GY',
);

export const GY_MODULE_ALIAS_BY_NORMALIZED = new Map(
  GY_MODULE_ALIAS_RECORDS.map(record => [record.normalizedAlias, record]),
);

export const COMMON_MODULE_ALIAS_BY_NORMALIZED = new Map(
  COMMON_MODULE_ALIAS_RECORDS.map(record => [record.normalizedAlias, record]),
);

export function resolveCommonModuleAlias(aliasLike: string) {
  return COMMON_MODULE_ALIAS_BY_NORMALIZED.get(normalizeModuleAlias(aliasLike)) ?? null;
}

export function resolveGyModuleAlias(aliasLike: string) {
  const record = resolveCommonModuleAlias(aliasLike);
  return record?.moduleFamily === 'GY' ? record : null;
}
