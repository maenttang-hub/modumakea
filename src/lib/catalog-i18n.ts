import { pickLanguage } from '@/lib/ui-language';
import type { AppLanguage, ComponentTemplate, DatasheetStatus, DesignWarning } from '@/types';

type LocalizedText = {
  ko: string;
  en: string;
};

const DATASHEET_STATUS_LABELS: Record<DatasheetStatus, LocalizedText> = {
  'official-complete': { ko: '공식 검증', en: 'Official' },
  'official-partial': { ko: '부분 검증', en: 'Partial' },
  'needs-vendor-pin': { ko: 'SKU 확인 필요', en: 'SKU Needed' },
  'generic-module': { ko: '범용 모듈', en: 'Generic' },
};

const COMPONENT_TEXT_CATALOG: Record<string, { name: LocalizedText; description: LocalizedText }> = {
  tpl_ultrasonic: {
    name: { ko: '초음파 센서', en: 'Ultrasonic Sensor' },
    description: { ko: 'HC-SR04: 거리 측정용 초음파 센서 (2cm ~ 400cm)', en: 'HC-SR04 ultrasonic distance sensor (2cm to 400cm).' },
  },
  tpl_pir: {
    name: { ko: 'PIR 동작 감지', en: 'PIR Motion Sensor' },
    description: { ko: 'PIR 모션 감지 센서: 사람의 적외선 움직임을 감지', en: 'PIR motion sensor that detects infrared movement from people.' },
  },
  tpl_dht11: {
    name: { ko: '온습도 센서', en: 'Temp/Humidity Sensor' },
    description: { ko: 'DHT11: 온도 및 습도 측정 센서', en: 'DHT11 temperature and humidity sensor.' },
  },
  tpl_dht22: {
    name: { ko: '온습도 센서 Pro', en: 'Temp/Humidity Sensor Pro' },
    description: { ko: 'DHT22: DHT11보다 정밀한 온도/습도 센서 (3.3V~6V)', en: 'DHT22 higher-precision temperature and humidity sensor (3.3V to 6V).' },
  },
  tpl_photoresistor: {
    name: { ko: '조도 센서', en: 'Light Sensor' },
    description: { ko: '포토레지스터: 빛의 밝기를 아날로그 값으로 측정', en: 'Photoresistor that measures brightness as an analog value.' },
  },
  tpl_soil_moisture: {
    name: { ko: '토양 수분 센서', en: 'Soil Moisture Sensor' },
    description: { ko: '토양의 수분 함량을 측정하는 센서', en: 'Sensor that measures soil moisture content.' },
  },
  tpl_gas_mq2: {
    name: { ko: '가스 감지 센서', en: 'Gas Sensor' },
    description: { ko: 'MQ-2: 연기, LPG, 부탄, 수소 가스 감지', en: 'MQ-2 sensor for smoke, LPG, butane, and hydrogen detection.' },
  },
  tpl_sound: {
    name: { ko: '사운드 센서', en: 'Sound Sensor' },
    description: { ko: '마이크 모듈: 주변 소음 레벨 감지', en: 'Microphone module that senses ambient sound level.' },
  },
  tpl_ir_receiver: {
    name: { ko: '적외선 수신 모듈', en: 'IR Receiver' },
    description: { ko: 'IR 수신기: 리모컨 신호 수신', en: 'IR receiver for remote-control signals.' },
  },
  tpl_button: {
    name: { ko: '버튼 (푸시)', en: 'Push Button' },
    description: { ko: '푸시 버튼: 디지털 입력 제어', en: 'Push button for digital input control.' },
  },
  tpl_led: {
    name: { ko: 'LED', en: 'LED' },
    description: { ko: '단색 LED: 디지털 또는 PWM으로 밝기 조절 가능', en: 'Single-color LED with digital or PWM brightness control.' },
  },
  tpl_rgb_led: {
    name: { ko: 'RGB LED', en: 'RGB LED' },
    description: { ko: '3색 LED: PWM으로 다양한 색상 표현', en: 'Three-color LED for mixed colors via PWM.' },
  },
  tpl_servo: {
    name: { ko: '서보 모터', en: 'Servo Motor' },
    description: { ko: 'SG90: 0~180도 각도 제어 서보 모터', en: 'SG90 servo motor with 0 to 180 degree control.' },
  },
  tpl_dc_motor: {
    name: { ko: 'DC 모터 드라이버', en: 'DC Motor Driver' },
    description: { ko: 'L298N 드라이버: DC 모터 속도/방향 제어', en: 'L298N driver for DC motor speed and direction control.' },
  },
  tpl_buzzer: {
    name: { ko: '부저', en: 'Buzzer' },
    description: { ko: '피에조 부저: 비프음 및 멜로디 출력', en: 'Piezo buzzer for beeps and simple melodies.' },
  },
  tpl_relay: {
    name: { ko: '릴레이', en: 'Relay' },
    description: { ko: '5V 릴레이: 고전압/고전류 부하 제어', en: '5V relay for higher-voltage or higher-current loads.' },
  },
  tpl_oled: {
    name: { ko: 'OLED 디스플레이', en: 'OLED Display' },
    description: { ko: 'SSD1306 0.96인치 128x64 OLED (I2C)', en: 'SSD1306 0.96-inch 128x64 OLED over I2C.' },
  },
  tpl_lcd1602: {
    name: { ko: 'LCD 1602', en: 'LCD 1602' },
    description: { ko: '16x2 문자 LCD 디스플레이 (I2C 모듈)', en: '16x2 character LCD with I2C backpack module.' },
  },
  tpl_7segment: {
    name: { ko: '7세그먼트', en: '7-Segment Display' },
    description: { ko: 'TM1637: 4자리 숫자 표시 디스플레이', en: 'TM1637 four-digit numeric display.' },
  },
  tpl_bluetooth_hc05: {
    name: { ko: '블루투스 모듈', en: 'Bluetooth Module' },
    description: { ko: 'HC-05: 블루투스 2.0 무선 시리얼 통신', en: 'HC-05 Bluetooth 2.0 serial communication module.' },
  },
  tpl_rfid_rc522: {
    name: { ko: 'RFID 모듈', en: 'RFID Module' },
    description: { ko: 'MFRC522: RFID 카드/태그 인식 모듈', en: 'MFRC522 module for RFID cards and tags.' },
  },
  tpl_resistor: {
    name: { ko: '저항', en: 'Resistor' },
    description: { ko: '범용 저항: LED 전류 제한, 풀업/풀다운, 분압용', en: 'General-purpose resistor for LED current limiting, pull-up/down, and dividers.' },
  },
  tpl_capacitor: {
    name: { ko: '콘덴서', en: 'Capacitor' },
    description: { ko: '범용 콘덴서: 디커플링, 벌크, RC 필터용', en: 'General-purpose capacitor for decoupling, bulk storage, and RC filters.' },
  },
  tpl_inductor: {
    name: { ko: '인덕터', en: 'Inductor' },
    description: { ko: '전원 필터링과 스위칭 레귤레이터 설계용 인덕터', en: 'Inductor for power filtering and switching regulator design.' },
  },
  tpl_diode: {
    name: { ko: '다이오드', en: 'Diode' },
    description: { ko: '역극성 보호, 플라이백, 일반 정류용 다이오드', en: 'Diode for reverse-polarity protection, flyback, and general rectification.' },
  },
  tpl_transistor_npn: {
    name: { ko: '트랜지스터', en: 'Transistor' },
    description: { ko: 'GPIO 직접 구동이 어려운 부하용 NPN/MOSFET 드라이버', en: 'NPN or MOSFET driver stage for loads that GPIO cannot drive directly.' },
  },
  tpl_level_shifter: {
    name: { ko: '레벨 시프터', en: 'Level Shifter' },
    description: { ko: '3.3V/5V 신호 레벨 변환용 4채널 모듈', en: 'Four-channel module for 3.3V/5V logic level translation.' },
  },
  tpl_driver_ic: {
    name: { ko: '드라이버 IC', en: 'Driver IC' },
    description: { ko: '모터/릴레이/대전류 부하용 드라이버 IC', en: 'Driver IC for motors, relays, and higher-current loads.' },
  },
  tpl_adc_module: {
    name: { ko: 'ADC 모듈', en: 'ADC Module' },
    description: { ko: '라즈베리파이 등 아날로그 입력 부족 보드용 ADC 모듈', en: 'ADC module for boards like Raspberry Pi that lack native analog input.' },
  },
  tpl_op_amp_buffer: {
    name: { ko: '버퍼 앰프', en: 'Buffer Amp' },
    description: { ko: '아날로그 입력 임피던스 완화를 위한 단일 채널 버퍼/연산증폭기 단계', en: 'Single-channel buffer or op-amp stage for easing analog input impedance limits.' },
  },
  tpl_external_power: {
    name: { ko: '외부 전원', en: 'External Power' },
    description: { ko: '센서/서보/모터 분리 전원 구성용 외부 전원', en: 'External power source for split sensor, servo, or motor supplies.' },
  },
  tpl_bmp280: {
    name: { ko: '기압 센서 BMP280', en: 'BMP280 Pressure Sensor' },
    description: { ko: 'BMP280: 공식 데이터시트가 확인된 Bosch 디지털 기압 센서', en: 'BMP280 Bosch digital pressure sensor with verified datasheet coverage.' },
  },
  tpl_bme280: {
    name: { ko: '환경 센서 BME280', en: 'BME280 Environmental Sensor' },
    description: { ko: 'BME280: 공식 데이터시트가 확인된 Bosch 온도/습도/기압 센서', en: 'BME280 Bosch temperature, humidity, and pressure sensor with verified datasheet coverage.' },
  },
  tpl_bme680: {
    name: { ko: '환경 센서 BME680', en: 'BME680 Environmental Sensor' },
    description: { ko: 'BME680: 공식 데이터시트가 확인된 Bosch 공기질/환경 센서', en: 'BME680 Bosch air-quality and environmental sensor with verified datasheet coverage.' },
  },
  tpl_ds18b20: {
    name: { ko: '온도 센서 DS18B20', en: 'DS18B20 Temperature Sensor' },
    description: { ko: 'DS18B20: 공식 데이터시트가 확인된 1-Wire 디지털 온도 센서', en: 'DS18B20 1-Wire digital temperature sensor with verified datasheet coverage.' },
  },
  tpl_lm35: {
    name: { ko: '온도 센서 LM35', en: 'LM35 Temperature Sensor' },
    description: { ko: 'LM35: 공식 데이터시트가 확인된 TI 아날로그 온도 센서', en: 'LM35 TI analog temperature sensor with verified datasheet coverage.' },
  },
  tpl_sht31: {
    name: { ko: '온습도 센서 SHT31', en: 'SHT31 Temp/Humidity Sensor' },
    description: { ko: 'SHT31: 공식 데이터시트가 확인된 Sensirion 온습도 센서', en: 'SHT31 Sensirion temperature and humidity sensor with verified datasheet coverage.' },
  },
  tpl_vl53l0x: {
    name: { ko: 'ToF 센서 VL53L0X', en: 'VL53L0X ToF Sensor' },
    description: { ko: 'VL53L0X: 공식 데이터시트가 확인된 ST 거리 측정 센서', en: 'VL53L0X ST time-of-flight distance sensor with verified datasheet coverage.' },
  },
  tpl_vl53l1x: {
    name: { ko: 'ToF 센서 VL53L1X', en: 'VL53L1X ToF Sensor' },
    description: { ko: 'VL53L1X: 공식 데이터시트가 확인된 ST 장거리 ToF 센서', en: 'VL53L1X ST long-range time-of-flight sensor with verified datasheet coverage.' },
  },
  tpl_bno055: {
    name: { ko: '자세 센서 BNO055', en: 'BNO055 Orientation Sensor' },
    description: { ko: 'BNO055: 공식 데이터시트가 확인된 Bosch 9축 자세 센서', en: 'BNO055 Bosch 9-axis orientation sensor with verified datasheet coverage.' },
  },
  tpl_ina219: {
    name: { ko: '전류 센서 INA219', en: 'INA219 Current Sensor' },
    description: { ko: 'INA219: 공식 데이터시트가 확인된 TI 전류/전력 모니터 센서', en: 'INA219 TI current and power monitor with verified datasheet coverage.' },
  },
  tpl_max30102: {
    name: { ko: '맥박 센서 MAX30102', en: 'MAX30102 Pulse Sensor' },
    description: { ko: 'MAX30102: 공식 데이터시트가 확인된 심박/산소포화도 센서', en: 'MAX30102 heart-rate and SpO2 sensor with verified datasheet coverage.' },
  },
};

const DESIGN_WARNING_CATALOG: Record<string, { title: LocalizedText; message: LocalizedText }> = {
  'design.3v3-sensor': {
    title: { ko: '3.3V 센서', en: '3.3V Sensor' },
    message: { ko: '원칩 기준 전압은 3.3V 계열로 보고 5V 보드에는 레벨과 전원 구성을 먼저 확인합니다.', en: 'Treat the chip as a 3.3V part first, and verify level shifting plus power setup before wiring it to a 5V board.' },
  },
  'design.compensation-needed': {
    title: { ko: '보상 알고리즘 필요', en: 'Compensation Needed' },
    message: { ko: '가스 값 해석은 원시값만으로 끝나지 않아서 상위 소프트웨어 보정 단계를 함께 설계하는 편이 좋습니다.', en: 'Gas readings usually need a higher-level compensation step, not just the raw sensor value.' },
  },
  'design.onewire-pullup': {
    title: { ko: '풀업 저항 필요', en: 'Pull-up Required' },
    message: { ko: '1-Wire 버스 특성상 데이터 라인 풀업 저항 유무를 배선 단계에서 함께 확인해야 합니다.', en: 'Because this is a 1-Wire bus, confirm the data-line pull-up resistor during wiring review.' },
  },
  'design.optional-xshut-gpio1': {
    title: { ko: 'XSHUT/GPIO1 옵션 핀', en: 'XSHUT/GPIO1 Optional Pins' },
    message: { ko: '기본 거리 읽기 외에 절전과 인터럽트를 쓰려면 추가 제어 핀까지 모델링하는 편이 좋습니다.', en: 'If you plan to use power saving or interrupts beyond basic ranging, model the extra control pins too.' },
  },
  'design.sensor-fusion': {
    title: { ko: '센서 퓨전 내장', en: 'Built-in Sensor Fusion' },
    message: { ko: '원시 가속도/자이로/자기장과 융합 출력이 함께 존재하므로 코드 생성 단계에서 출력 모드 선택이 필요합니다.', en: 'Raw accel/gyro/magnetometer data and fused outputs both exist here, so the code path should choose the intended output mode.' },
  },
  'design.high-current-routing': {
    title: { ko: '고전류 배선 분리', en: 'Separate High-current Routing' },
    message: { ko: '센서와 MCU 핀만 보는 수준을 넘어서 션트와 부하 경로를 PCB 단계에서 따로 검토해야 합니다.', en: 'Do not review only the MCU pins here. The shunt and load path should be checked separately at the PCB stage.' },
  },
  'design.optical-placement': {
    title: { ko: '광학 센서 배치 중요', en: 'Optical Placement Matters' },
    message: { ko: '센서 패키지 위치와 주변광 차단 조건이 정확도에 영향을 주므로 기구와 PCB를 같이 봐야 합니다.', en: 'Sensor placement and ambient-light shielding affect accuracy, so mechanical layout and PCB layout should be reviewed together.' },
  },
};

export function getLocalizedDatasheetStatusLabel(status: DatasheetStatus, language: AppLanguage) {
  return pickLanguage(language, DATASHEET_STATUS_LABELS[status] ?? DATASHEET_STATUS_LABELS['generic-module']);
}

export function getLocalizedTemplateName(template: Pick<ComponentTemplate, 'id' | 'name' | 'nameKey'>, language: AppLanguage) {
  const localized = COMPONENT_TEXT_CATALOG[template.id]?.name;
  return localized ? pickLanguage(language, localized) : template.name;
}

export function getLocalizedTemplateDescription(
  template: Pick<ComponentTemplate, 'id' | 'description' | 'descriptionKey'>,
  language: AppLanguage
) {
  const localized = COMPONENT_TEXT_CATALOG[template.id]?.description;
  return localized ? pickLanguage(language, localized) : template.description;
}

export function getLocalizedDesignWarning(warning: DesignWarning, language: AppLanguage): DesignWarning {
  return {
    ...warning,
    title: warning.titleKey && DESIGN_WARNING_CATALOG[warning.titleKey]
      ? pickLanguage(language, DESIGN_WARNING_CATALOG[warning.titleKey].title)
      : warning.title,
    message: warning.messageKey && DESIGN_WARNING_CATALOG[warning.messageKey]
      ? pickLanguage(language, DESIGN_WARNING_CATALOG[warning.messageKey].message)
      : warning.message,
  };
}

export function getCatalogSearchStrings(
  template: Pick<ComponentTemplate, 'id' | 'name' | 'description' | 'nameKey' | 'descriptionKey'>
) {
  const values = [
    template.name,
    template.description,
    COMPONENT_TEXT_CATALOG[template.id]?.name.ko,
    COMPONENT_TEXT_CATALOG[template.id]?.name.en,
    COMPONENT_TEXT_CATALOG[template.id]?.description.ko,
    COMPONENT_TEXT_CATALOG[template.id]?.description.en,
  ].filter((value): value is string => Boolean(value?.trim()));

  return Array.from(new Set(values));
}
