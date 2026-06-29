import type { ArduinoLibraryCatalogEntry, SoftwareLibraryDependency } from '@/types';

export const STATIC_ARDUINO_LIBRARY_CATALOG: ArduinoLibraryCatalogEntry[] = [
  {
    name: 'DHT sensor library',
    author: 'Adafruit',
    sentence: 'DHT11/DHT22 온습도 센서를 읽는 대표 라이브러리입니다.',
    paragraph: '온도와 습도를 안정적으로 읽을 수 있는 입문용 센서 라이브러리입니다.',
    includes: ['DHT.h', 'DHT_U.h'],
    category: 'Sensor',
  },
  {
    name: 'IRremote',
    author: 'Arduino-IRremote',
    sentence: '적외선 송수신 리모컨 신호를 다루는 라이브러리입니다.',
    includes: ['IRremote.h'],
    category: 'Communication',
  },
  {
    name: 'Servo',
    author: 'Arduino',
    sentence: '서보 모터 제어용 기본 라이브러리입니다.',
    includes: ['Servo.h'],
    category: 'Device Control',
  },
  {
    name: 'Adafruit GFX Library',
    author: 'Adafruit',
    sentence: 'OLED, TFT 등 그래픽 디스플레이 공통 드로잉 엔진입니다.',
    includes: ['Adafruit_GFX.h'],
    category: 'Display',
  },
  {
    name: 'Adafruit SSD1306',
    author: 'Adafruit',
    sentence: 'SSD1306 OLED 화면을 제어하는 라이브러리입니다.',
    includes: ['Adafruit_SSD1306.h'],
    category: 'Display',
  },
  {
    name: 'LiquidCrystal I2C',
    author: 'Community',
    sentence: 'I2C 방식 1602 LCD를 쉽게 다루는 라이브러리입니다.',
    includes: ['LiquidCrystal_I2C.h'],
    category: 'Display',
  },
  {
    name: 'TM1637Display',
    author: 'Community',
    sentence: '4자리 7세그먼트(TM1637) 표시기를 제어합니다.',
    includes: ['TM1637Display.h'],
    category: 'Display',
  },
  {
    name: 'MFRC522',
    author: 'GithubCommunity',
    sentence: 'RC522 RFID/NFC 모듈 제어용 라이브러리입니다.',
    includes: ['MFRC522.h'],
    category: 'Communication',
  },
];

function normalize(input: string) {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findArduinoLibraryByHeader(header: string) {
  const normalizedHeader = normalize(header.replace(/\.h$/i, ''));
  return (
    STATIC_ARDUINO_LIBRARY_CATALOG.find(entry =>
      entry.includes.some(include => normalize(include.replace(/\.h$/i, '')) === normalizedHeader)
    ) ?? null
  );
}

export function findArduinoLibraryByName(name: string) {
  const normalizedName = normalize(name);
  return STATIC_ARDUINO_LIBRARY_CATALOG.find(entry => normalize(entry.name) === normalizedName) ?? null;
}

export function buildArduinoDependencyFromCatalogEntry(
  entry: Pick<ArduinoLibraryCatalogEntry, 'name' | 'version'>
): SoftwareLibraryDependency {
  return {
    name: entry.name,
    version: entry.version,
    registry: 'arduino',
  };
}

