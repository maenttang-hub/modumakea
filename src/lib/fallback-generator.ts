/**
 * lib/fallback-generator.ts
 * 로컬 룰 기반 코드 생성기 (Anthropic API Key 누락 또는 Placeholder 상태일 때 작동)
 * 배치된 부품과 핀 맵 상태를 파싱하여 컴파일 및 시뮬레이터 실행이 가능한 수준의 C++/Python 펌웨어 완성 코드를 조합해 제공합니다.
 */

import type { AICodeGenerationPayload } from '@/types';

// 부품별 고유 식별 코드 추출용
function getBaseTemplateId(compName: string): string {
  // 예: "초음파 센서 1" -> "tpl_ultrasonic" 형태나 한글 이름 등을 판별
  const name = compName.toLowerCase();
  if (name.includes('초음파') || name.includes('ultrasonic')) return 'tpl_ultrasonic';
  if (name.includes('pir') || name.includes('동작')) return 'tpl_pir';
  if (name.includes('dht11') || (name.includes('온습도') && !name.includes('pro'))) return 'tpl_dht11';
  if (name.includes('dht22') || name.includes('pro')) return 'tpl_dht22';
  if (name.includes('조도') || name.includes('photoresistor') || name.includes('light')) return 'tpl_photoresistor';
  if (name.includes('토양') || name.includes('moisture') || name.includes('soil')) return 'tpl_soil_moisture';
  if (name.includes('가스') || name.includes('gas') || name.includes('mq2')) return 'tpl_gas_mq2';
  if (name.includes('사운드') || name.includes('sound') || name.includes('sound')) return 'tpl_sound';
  if (name.includes('적외선') || name.includes('ir_receiver') || name.includes('ir')) return 'tpl_ir_receiver';
  if (name.includes('버튼') || name.includes('button')) return 'tpl_button';
  if (name.includes('rgb')) return 'tpl_rgb_led';
  if (name.includes('led')) return 'tpl_led';
  if (name.includes('서보') || name.includes('servo')) return 'tpl_servo';
  if (name.includes('dc') || name.includes('motor') || name.includes('모터')) return 'tpl_dc_motor';
  if (name.includes('부저') || name.includes('buzzer')) return 'tpl_buzzer';
  if (name.includes('릴레이') || name.includes('relay')) return 'tpl_relay';
  if (name.includes('oled') || name.includes('디스플레이')) return 'tpl_oled';
  if (name.includes('lcd') || name.includes('1602')) return 'tpl_lcd1602';
  if (name.includes('7segment') || name.includes('세그먼트')) return 'tpl_7segment';
  if (name.includes('블루투스') || name.includes('bluetooth') || name.includes('hc05')) return 'tpl_bluetooth_hc05';
  if (name.includes('rfid') || name.includes('rc522')) return 'tpl_rfid_rc522';
  return 'unknown';
}

export function generateLocalFallbackCode(payload: AICodeGenerationPayload): string {
  const { boardName, chipset, targetLanguage, connectedComponents, userIntent } = payload;
  const isPython = targetLanguage === 'Python';

  // 1. 파일 헤더 주석 작성
  let code = '';
  if (isPython) {
    code += `# ======================================================================\n`;
    code += `#  ModuMake Firmware (Local Fallback Mode - No API Key)\n`;
    code += `#  Board: ${boardName} (${chipset})\n`;
    code += `#  Language: Python 3\n`;
    code += `# ======================================================================\n\n`;
  } else {
    code += `/**\n`;
    code += ` * ======================================================================\n`;
    code += ` *  ModuMake Firmware (Local Fallback Mode - No API Key)\n`;
    code += ` *  Board: ${boardName} (${chipset})\n`;
    code += ` *  Language: C++ (Arduino Framework)\n`;
    code += ` * ======================================================================\n`;
    code += ` */\n\n`;
  }

  // 사용자 요구사항 주석 추가
  if (userIntent) {
    if (isPython) {
      code += `# [User custom requirements]:\n`;
      userIntent.split('\n').forEach(line => {
        code += `#   ${line}\n`;
      });
      code += `\n`;
    } else {
      code += `// [User custom requirements]:\n`;
      userIntent.split('\n').forEach(line => {
        code += `//   ${line}\n`;
      });
      code += `\n`;
    }
  }

  if (isPython) {
    return generatePythonCode(code, connectedComponents);
  } else {
    return generateCppCode(code, connectedComponents);
  }
}

/**
 * C++ (Arduino) fallback 소스코드 빌드
 */
function generateCppCode(prefix: string, components: AICodeGenerationPayload['connectedComponents']): string {
  const includes = new Set<string>();
  let definitions = '';
  let setupPins = '';
  let setupLogic = '';
  let loopLogic = '';

  includes.add('#include <Arduino.h>');

  // 컴포넌트들을 순회하며 라이브러리 include 수집
  components.forEach(comp => {
    if (comp.libraryIncludes) {
      comp.libraryIncludes.forEach(inc => includes.add(`#include <${inc}>`));
    }
  });

  // 부품 간 단순 상호작용 시나리오를 위한 감지기 및 제어기 핀 정보 기록용 변수들
  let ledPinVar = '';
  let buttonPinVar = '';

  components.forEach((comp, idx) => {
    const type = getBaseTemplateId(comp.componentName);
    const pinMap = comp.pinConnections;
    const commentName = comp.componentName;
    const isCustomComponent = comp.librarySource === 'custom';
    const aiHints = comp.aiHints ?? {};

    definitions += `// --- 부품 정의: ${commentName} ---\n`;

    switch (type) {
      case 'tpl_ultrasonic': {
        const trig = pinMap['Trig'] || 'D3';
        const echo = pinMap['Echo'] || 'D4';
        definitions += `const int PIN_TRIG_${idx} = ${trig.replace('D', '')}; // 초음파 발신 핀\n`;
        definitions += `const int PIN_ECHO_${idx} = ${echo.replace('D', '')}; // 초음파 수신 핀\n\n`;

        setupPins += `  pinMode(PIN_TRIG_${idx}, OUTPUT);\n`;
        setupPins += `  pinMode(PIN_ECHO_${idx}, INPUT);\n`;

        loopLogic += `  // ${commentName} 거리 측정\n`;
        loopLogic += `  digitalWrite(PIN_TRIG_${idx}, LOW);\n`;
        loopLogic += `  delayMicroseconds(2);\n`;
        loopLogic += `  digitalWrite(PIN_TRIG_${idx}, HIGH);\n`;
        loopLogic += `  delayMicroseconds(10);\n`;
        loopLogic += `  digitalWrite(PIN_TRIG_${idx}, LOW);\n`;
        loopLogic += `  long duration_${idx} = pulseIn(PIN_ECHO_${idx}, HIGH);\n`;
        loopLogic += `  float distance_${idx} = duration_${idx} * 0.034 / 2;\n`;
        loopLogic += `  Serial.print("[${commentName}] Distance: ");\n`;
        loopLogic += `  Serial.print(distance_${idx});\n`;
        loopLogic += `  Serial.println(" cm");\n\n`;
        break;
      }
      case 'tpl_pir': {
        const sig = pinMap['Signal'] || 'D2';
        definitions += `const int PIN_PIR_${idx} = ${sig.replace('D', '')}; // 모션 감지 핀\n\n`;

        setupPins += `  pinMode(PIN_PIR_${idx}, INPUT);\n`;

        loopLogic += `  // ${commentName} 적외선 모션 감지\n`;
        loopLogic += `  int pirVal_${idx} = digitalRead(PIN_PIR_${idx});\n`;
        loopLogic += `  if (pirVal_${idx} == HIGH) {\n`;
        loopLogic += `    Serial.println("[${commentName}] Motion Detected!");\n`;
        loopLogic += `  }\n\n`;
        break;
      }
      case 'tpl_dht11':
      case 'tpl_dht22': {
        const data = pinMap['Data'] || 'D2';
        const isDHT22 = type === 'tpl_dht22';
        definitions += `// ${isDHT22 ? 'DHT22' : 'DHT11'} 온습도 센서 핀 설정\n`;
        definitions += `#define DHTPIN_${idx} ${data.replace('D', '')}\n`;
        definitions += `#define DHTTYPE_${idx} ${isDHT22 ? 'DHT22' : 'DHT11'}\n`;
        definitions += `DHT dht_${idx}(DHTPIN_${idx}, DHTTYPE_${idx});\n\n`;

        setupLogic += `  dht_${idx}.begin();\n`;

        loopLogic += `  // ${commentName} 온습도 측정\n`;
        loopLogic += `  float temp_${idx} = dht_${idx}.readTemperature();\n`;
        loopLogic += `  float hum_${idx} = dht_${idx}.readHumidity();\n`;
        loopLogic += `  if (!isnan(temp_${idx}) && !isnan(hum_${idx})) {\n`;
        loopLogic += `    Serial.print("[${commentName}] Temp: ");\n`;
        loopLogic += `    Serial.print(temp_${idx});\n`;
        loopLogic += `    Serial.print(" *C, Humid: ");\n`;
        loopLogic += `    Serial.print(hum_${idx});\n`;
        loopLogic += `    Serial.println(" %");\n`;
        loopLogic += `  }\n\n`;
        break;
      }
      case 'tpl_photoresistor':
      case 'tpl_soil_moisture': {
        const aout = pinMap['AOut'] || 'A0';
        definitions += `const int PIN_ANA_${idx} = ${aout}; // 아날로그 센서 핀\n\n`;

        loopLogic += `  // ${commentName} 아날로그 조도/토양 감지\n`;
        loopLogic += `  int analogVal_${idx} = analogRead(PIN_ANA_${idx});\n`;
        loopLogic += `  Serial.print("[${commentName}] Sensor Val: ");\n`;
        loopLogic += `  Serial.println(analogVal_${idx});\n\n`;
        break;
      }
      case 'tpl_gas_mq2':
      case 'tpl_sound': {
        const aout = pinMap['AOut'] || 'A0';
        const dout = pinMap['DOut'] || 'D5';
        definitions += `const int PIN_ANA_${idx} = ${aout}; // 아날로그 신호\n`;
        definitions += `const int PIN_DIG_${idx} = ${dout.replace('D', '')}; // 디지털 스위치\n\n`;

        setupPins += `  pinMode(PIN_DIG_${idx}, INPUT);\n`;

        loopLogic += `  // ${commentName} 가스/사운드 센서 측정\n`;
        loopLogic += `  int aVal_${idx} = analogRead(PIN_ANA_${idx});\n`;
        loopLogic += `  int dVal_${idx} = digitalRead(PIN_DIG_${idx});\n`;
        loopLogic += `  Serial.print("[${commentName}] A-Val: ");\n`;
        loopLogic += `  Serial.print(aVal_${idx});\n`;
        loopLogic += `  Serial.print(" | Threshold trigger: ");\n`;
        loopLogic += `  Serial.println(dVal_${idx} == HIGH ? "ACTIVE" : "NORMAL");\n\n`;
        break;
      }
      case 'tpl_button': {
        const sig = pinMap['Signal'] || 'D2';
        buttonPinVar = `PIN_BTN_${idx}`;
        definitions += `const int PIN_BTN_${idx} = ${sig.replace('D', '')}; // 푸시버튼 핀\n\n`;

        setupPins += `  pinMode(PIN_BTN_${idx}, INPUT_PULLUP);\n`;

        loopLogic += `  // ${commentName} 버튼 상태 입력\n`;
        loopLogic += `  int btnState_${idx} = digitalRead(PIN_BTN_${idx});\n`;
        loopLogic += `  Serial.print("[${commentName}] Status: ");\n`;
        loopLogic += `  Serial.println(btnState_${idx} == LOW ? "PRESSED" : "RELEASED");\n\n`;
        break;
      }
      case 'tpl_led': {
        const sig = pinMap['Signal'] || 'D3';
        ledPinVar = `PIN_LED_${idx}`;
        definitions += `const int PIN_LED_${idx} = ${sig.replace('D', '')}; // LED 출력 핀\n\n`;

        setupPins += `  pinMode(PIN_LED_${idx}, OUTPUT);\n`;

        loopLogic += `  // ${commentName} Blink (가상 출력 변경)\n`;
        loopLogic += `  digitalWrite(PIN_LED_${idx}, HIGH);\n`;
        loopLogic += `  Serial.println("[${commentName}] LED State -> HIGH");\n`;
        loopLogic += `  delay(500);\n`;
        loopLogic += `  digitalWrite(PIN_LED_${idx}, LOW);\n`;
        loopLogic += `  Serial.println("[${commentName}] LED State -> LOW");\n`;
        loopLogic += `  delay(500);\n\n`;
        break;
      }
      case 'tpl_rgb_led': {
        const r = pinMap['R'] || 'D3';
        const g = pinMap['G'] || 'D5';
        const b = pinMap['B'] || 'D6';
        definitions += `const int PIN_RGB_R_${idx} = ${r.replace('D', '')};\n`;
        definitions += `const int PIN_RGB_G_${idx} = ${g.replace('D', '')};\n`;
        definitions += `const int PIN_RGB_B_${idx} = ${b.replace('D', '')};\n\n`;

        setupPins += `  pinMode(PIN_RGB_R_${idx}, OUTPUT);\n`;
        setupPins += `  pinMode(PIN_RGB_G_${idx}, OUTPUT);\n`;
        setupPins += `  pinMode(PIN_RGB_B_${idx}, OUTPUT);\n`;

        loopLogic += `  // ${commentName} RGB 색상 순환\n`;
        loopLogic += `  analogWrite(PIN_RGB_R_${idx}, 255); analogWrite(PIN_RGB_G_${idx}, 0); analogWrite(PIN_RGB_B_${idx}, 0);\n`;
        loopLogic += `  Serial.println("[${commentName}] RGB Color: RED");\n`;
        loopLogic += `  delay(600);\n`;
        loopLogic += `  analogWrite(PIN_RGB_R_${idx}, 0); analogWrite(PIN_RGB_G_${idx}, 255); analogWrite(PIN_RGB_B_${idx}, 0);\n`;
        loopLogic += `  Serial.println("[${commentName}] RGB Color: GREEN");\n`;
        loopLogic += `  delay(600);\n`;
        break;
      }
      case 'tpl_servo': {
        const sig = pinMap['Signal'] || 'D9';
        definitions += `Servo servo_${idx};\n`;
        definitions += `const int PIN_SERVO_${idx} = ${sig.replace('D', '')}; // 서보 모터 PWM 핀\n\n`;

        setupLogic += `  servo_${idx}.attach(PIN_SERVO_${idx});\n`;

        loopLogic += `  // ${commentName} 각도 제어\n`;
        loopLogic += `  servo_${idx}.write(0);\n`;
        loopLogic += `  Serial.println("[${commentName}] Servo Position -> 0 deg");\n`;
        loopLogic += `  delay(1000);\n`;
        loopLogic += `  servo_${idx}.write(90);\n`;
        loopLogic += `  Serial.println("[${commentName}] Servo Position -> 90 deg");\n`;
        loopLogic += `  delay(1000);\n\n`;
        break;
      }
      case 'tpl_dc_motor': {
        const in1 = pinMap['IN1'] || 'D7';
        const in2 = pinMap['IN2'] || 'D8';
        const ena = pinMap['ENA'] || 'D9';
        definitions += `const int PIN_IN1_${idx} = ${in1.replace('D', '')};\n`;
        definitions += `const int PIN_IN2_${idx} = ${in2.replace('D', '')};\n`;
        definitions += `const int PIN_ENA_${idx} = ${ena.replace('D', '')};\n\n`;

        setupPins += `  pinMode(PIN_IN1_${idx}, OUTPUT);\n`;
        setupPins += `  pinMode(PIN_IN2_${idx}, OUTPUT);\n`;
        setupPins += `  pinMode(PIN_ENA_${idx}, OUTPUT);\n`;

        loopLogic += `  // ${commentName} L298N DC 모터 속도 제어\n`;
        loopLogic += `  digitalWrite(PIN_IN1_${idx}, HIGH);\n`;
        loopLogic += `  digitalWrite(PIN_IN2_${idx}, LOW);\n`;
        loopLogic += `  analogWrite(PIN_ENA_${idx}, 180); // 속도 (0 ~ 255)\n`;
        loopLogic += `  Serial.println("[${commentName}] Motor Running Forward (Speed: 180)");\n`;
        loopLogic += `  delay(1000);\n\n`;
        break;
      }
      case 'tpl_buzzer': {
        const sig = pinMap['Signal'] || 'D3';
        definitions += `const int PIN_BUZ_${idx} = ${sig.replace('D', '')}; // 부저 제어 핀\n\n`;

        setupPins += `  pinMode(PIN_BUZ_${idx}, OUTPUT);\n`;

        loopLogic += `  // ${commentName} Beep 멜로디 출력\n`;
        loopLogic += `  tone(PIN_BUZ_${idx}, 262, 200); // 4옥타브 도(C4) 소리\n`;
        loopLogic += `  Serial.println("[${commentName}] Tone Active: C4");\n`;
        loopLogic += `  delay(1000);\n\n`;
        break;
      }
      case 'tpl_relay': {
        const sig = pinMap['Signal'] || 'D4';
        definitions += `const int PIN_RELAY_${idx} = ${sig.replace('D', '')}; // 릴레이 제어 핀\n\n`;

        setupPins += `  pinMode(PIN_RELAY_${idx}, OUTPUT);\n`;

        loopLogic += `  // ${commentName} 릴레이 켜기/끄기\n`;
        loopLogic += `  digitalWrite(PIN_RELAY_${idx}, HIGH);\n`;
        loopLogic += `  Serial.println("[${commentName}] Relay Contact -> ON");\n`;
        loopLogic += `  delay(1000);\n`;
        loopLogic += `  digitalWrite(PIN_RELAY_${idx}, LOW);\n`;
        loopLogic += `  Serial.println("[${commentName}] Relay Contact -> OFF");\n`;
        loopLogic += `  delay(1000);\n\n`;
        break;
      }
      case 'tpl_oled': {
        definitions += `// OLED SSD1306 설정\n`;
        definitions += `#define SCREEN_WIDTH 128\n`;
        definitions += `#define SCREEN_HEIGHT 64\n`;
        definitions += `#define OLED_RESET -1\n`;
        definitions += `Adafruit_SSD1306 display_${idx}(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);\n\n`;

        setupLogic += `  if(!display_${idx}.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n`;
        setupLogic += `    Serial.println("[OLED] SSD1306 allocation failed");\n`;
        setupLogic += `  } else {\n`;
        setupLogic += `    display_${idx}.clearDisplay();\n`;
        setupLogic += `    display_${idx}.setTextSize(1);\n`;
        setupLogic += `    display_${idx}.setTextColor(SSD1306_WHITE);\n`;
        setupLogic += `    display_${idx}.setCursor(0,0);\n`;
        setupLogic += `    display_${idx}.println("ModuMake OS");\n`;
        setupLogic += `    display_${idx}.display();\n`;
        setupLogic += `  }\n`;

        loopLogic += `  // ${commentName} 텍스트 업데이트\n`;
        loopLogic += `  display_${idx}.clearDisplay();\n`;
        loopLogic += `  display_${idx}.setCursor(0,10);\n`;
        loopLogic += `  display_${idx}.print("Tick: ");\n`;
        loopLogic += `  display_${idx}.println(millis() / 1000);\n`;
        loopLogic += `  display_${idx}.display();\n\n`;
        break;
      }
      case 'tpl_lcd1602': {
        definitions += `// I2C 1602 LCD 설정\n`;
        definitions += `LiquidCrystal_I2C lcd_${idx}(0x27, 16, 2);\n\n`;

        setupLogic += `  lcd_${idx}.init();\n`;
        setupLogic += `  lcd_${idx}.backlight();\n`;
        setupLogic += `  lcd_${idx}.setCursor(0, 0);\n`;
        setupLogic += `  lcd_${idx}.print("ModuMake LCD");\n`;

        loopLogic += `  // ${commentName} 실시간 텍스트 출력\n`;
        loopLogic += `  lcd_${idx}.setCursor(0, 1);\n`;
        loopLogic += `  lcd_${idx}.print("Uptime: ");\n`;
        loopLogic += `  lcd_${idx}.print(millis() / 1000);\n`;
        loopLogic += `  lcd_${idx}.print("s");\n\n`;
        break;
      }
      case 'tpl_7segment': {
        const clk = pinMap['CLK'] || 'D2';
        const dio = pinMap['DIO'] || 'D3';
        definitions += `const int PIN_7SEG_CLK_${idx} = ${clk.replace('D', '')};\n`;
        definitions += `const int PIN_7SEG_DIO_${idx} = ${dio.replace('D', '')};\n`;
        definitions += `TM1637Display seg_${idx}(PIN_7SEG_CLK_${idx}, PIN_7SEG_DIO_${idx});\n\n`;

        setupLogic += `  seg_${idx}.setBrightness(0x0f);\n`;

        loopLogic += `  // ${commentName} 카운트 렌더링\n`;
        loopLogic += `  int seconds_${idx} = (millis() / 1000) % 9999;\n`;
        loopLogic += `  seg_${idx}.showNumberDec(seconds_${idx}, true);\n\n`;
        break;
      }
      case 'tpl_bluetooth_hc05': {
        const tx = pinMap['TX'] || 'D10';
        const rx = pinMap['RX'] || 'D11';
        definitions += `SoftwareSerial btSerial_${idx}(${tx.replace('D', '')}, ${rx.replace('D', '')}); // RX, TX\n\n`;

        setupLogic += `  btSerial_${idx}.begin(9600);\n`;
        setupLogic += `  Serial.println("[Bluetooth] HC-05 Ready.");\n`;

        loopLogic += `  // ${commentName} 블루투스 패킷 수신 체크\n`;
        loopLogic += `  if (btSerial_${idx}.available()) {\n`;
        loopLogic += `    char c = btSerial_${idx}.read();\n`;
        loopLogic += `    Serial.print("[Bluetooth Recv]: ");\n`;
        loopLogic += `    Serial.println(c);\n`;
        loopLogic += `  }\n\n`;
        break;
      }
      case 'tpl_rfid_rc522': {
        const rst = pinMap['RST'] || 'D9';
        const sda = pinMap['SDA'] || 'D10';
        definitions += `#define SS_PIN_${idx} ${sda.replace('D', '')}\n`;
        definitions += `#define RST_PIN_${idx} ${rst.replace('D', '')}\n`;
        definitions += `MFRC522 mfrc522_${idx}(SS_PIN_${idx}, RST_PIN_${idx});\n\n`;

        setupLogic += `  SPI.begin();\n`;
        setupLogic += `  mfrc522_${idx}.PCD_Init();\n`;

        loopLogic += `  // ${commentName} 카드 태그 체크\n`;
        loopLogic += `  if (mfrc522_${idx}.PICC_IsNewCardPresent() && mfrc522_${idx}.PICC_ReadCardSerial()) {\n`;
        loopLogic += `    Serial.print("[RFID Tag Detected] UID Size: ");\n`;
        loopLogic += `    Serial.println(mfrc522_${idx}.uid.size);\n`;
        loopLogic += `    mfrc522_${idx}.PICC_HaltA();\n`;
        loopLogic += `    mfrc522_${idx}.PCD_StopCrypto1();\n`;
        loopLogic += `  }\n\n`;
        break;
      }
      default:
        definitions += `// 핀 설정:\n`;
        Object.entries(pinMap).forEach(([k, v]) => {
          definitions += `// - ${k}: Pin ${v}\n`;
        });
        if (isCustomComponent && comp.dependencies?.arduino?.length) {
          definitions += `// 외부 의존성: ${comp.dependencies.arduino.map(dep => dep.version ? `${dep.name}@${dep.version}` : dep.name).join(', ')}\n`;
        }
        if (aiHints.initialize) {
          setupLogic += `  // ${commentName} 커스텀 초기화 힌트\n`;
          setupLogic += `  ${aiHints.initialize.split('\n').join('\n  ')}\n`;
        }
        const customReadKeys = Object.keys(aiHints).filter(key => key !== 'initialize');
        if (customReadKeys.length > 0) {
          loopLogic += `  // ${commentName} 커스텀 동작 힌트\n`;
          customReadKeys.forEach(key => {
            const snippet = aiHints[key];
            if (snippet) {
              loopLogic += `  ${snippet.split('\n').join('\n  ')}\n`;
            }
          });
          loopLogic += `\n`;
        }
        definitions += `\n`;
        break;
    }
  });

  // 버튼 - LED 단순 제어 연동 코드 추가 (동시 존재 시)
  if (ledPinVar && buttonPinVar) {
    loopLogic += `  // 연동 시나리오: 버튼을 누르면 LED를 켭니다.\n`;
    loopLogic += `  if (digitalRead(${buttonPinVar}) == LOW) {\n`;
    loopLogic += `    digitalWrite(${ledPinVar}, HIGH);\n`;
    loopLogic += `    Serial.println("[System] Button pressed -> Turn LED ON");\n`;
    loopLogic += `  } else {\n`;
    loopLogic += `    digitalWrite(${ledPinVar}, LOW);\n`;
    loopLogic += `  }\n\n`;
  }

  // 1. Include들 합치기
  let fullCode = prefix;
  Array.from(includes).forEach(inc => {
    fullCode += `${inc}\n`;
  });
  fullCode += `\n`;

  // 2. 부품 정의 추가
  fullCode += definitions;

  // 3. setup 함수 빌드
  fullCode += `void setup() {\n`;
  fullCode += `  // 시리얼 디버깅 활성화\n`;
  fullCode += `  Serial.begin(9600);\n`;
  fullCode += `  Serial.println("=========================================");\n`;
  fullCode += `  Serial.println(" ModuMake Embedded App Initialized.     ");\n`;
  fullCode += `  Serial.println("=========================================");\n`;
  fullCode += `\n`;
  if (setupPins) {
    fullCode += `  // 핀 모드 입출력 설정\n`;
    fullCode += setupPins;
    fullCode += `\n`;
  }
  if (setupLogic) {
    fullCode += `  // 개별 센서 라이브러리 초기화\n`;
    fullCode += setupLogic;
  }
  fullCode += `}\n\n`;

  // 4. loop 함수 빌드
  fullCode += `void loop() {\n`;
  if (loopLogic) {
    fullCode += loopLogic;
  } else {
    fullCode += `  Serial.println("[System] Idle loop... No components configured.");\n`;
    fullCode += `  delay(1500);\n`;
  }
  fullCode += `  delay(1000); // 1초 간격 반복\n`;
  fullCode += `}\n`;

  return fullCode;
}

/**
 * Python (RPi) fallback 소스코드 빌드
 */
function generatePythonCode(prefix: string, components: AICodeGenerationPayload['connectedComponents']): string {
  const imports = new Set<string>();
  let definitions = '';
  let loopLogic = '';

  imports.add('import time');

  let ledVar = '';
  let btnVar = '';

  components.forEach((comp, idx) => {
    const type = getBaseTemplateId(comp.componentName);
    const pinMap = comp.pinConnections;
    const commentName = comp.componentName;
    const isCustomComponent = comp.librarySource === 'custom';
    const aiHints = comp.aiHints ?? {};

    definitions += `# --- ${commentName} 설정 ---\n`;

    switch (type) {
      case 'tpl_led': {
        imports.add('from gpiozero import LED');
        const sig = (pinMap['Signal'] || 'GPIO17').replace('GPIO', '');
        ledVar = `led_${idx}`;
        definitions += `led_${idx} = LED(${sig})  # LED 출력 핀 초기화\n\n`;

        loopLogic += `        # ${commentName} Blink\n`;
        loopLogic += `        print("[${commentName}] LED State -> ON")\n`;
        loopLogic += `        ${ledVar}.on()\n`;
        loopLogic += `        time.sleep(0.5)\n`;
        loopLogic += `        print("[${commentName}] LED State -> OFF")\n`;
        loopLogic += `        ${ledVar}.off()\n`;
        loopLogic += `        time.sleep(0.5)\n\n`;
        break;
      }
      case 'tpl_button': {
        imports.add('from gpiozero import Button');
        const sig = (pinMap['Signal'] || 'GPIO2').replace('GPIO', '');
        btnVar = `button_${idx}`;
        definitions += `button_${idx} = Button(${sig})  # 풀업 버튼 핀 초기화\n\n`;

        loopLogic += `        # ${commentName} 감지\n`;
        loopLogic += `        if ${btnVar}.is_pressed:\n`;
        loopLogic += `            print("[${commentName}] Button is Pressed!")\n`;
        loopLogic += `        else:\n`;
        loopLogic += `            print("[${commentName}] Button is Released")\n\n`;
        break;
      }
      case 'tpl_ultrasonic': {
        imports.add('from gpiozero import DistanceSensor');
        const trig = (pinMap['Trig'] || 'GPIO3').replace('GPIO', '');
        const echo = (pinMap['Echo'] || 'GPIO4').replace('GPIO', '');
        definitions += `sensor_${idx} = DistanceSensor(echo=${echo}, trigger=${trig})  # 초음파 거리 센서\n\n`;

        loopLogic += `        # ${commentName} 거리 측정\n`;
        loopLogic += `        dist_cm = sensor_${idx}.distance * 100\n`;
        loopLogic += `        print(f"[${commentName}] Distance: {dist_cm:.1f} cm")\n\n`;
        break;
      }
      case 'tpl_pir': {
        imports.add('from gpiozero import MotionSensor');
        const sig = (pinMap['Signal'] || 'GPIO18').replace('GPIO', '');
        definitions += `pir_${idx} = MotionSensor(${sig})  # 모션 적외선 센서\n\n`;

        loopLogic += `        # ${commentName} 움직임 확인\n`;
        loopLogic += `        if pir_${idx}.motion_detected:\n`;
        loopLogic += `            print("[${commentName}] MOTION DETECTED!")\n\n`;
        break;
      }
      case 'tpl_buzzer': {
        imports.add('from gpiozero import Buzzer');
        const sig = (pinMap['Signal'] || 'GPIO27').replace('GPIO', '');
        definitions += `buzzer_${idx} = Buzzer(${sig})  # 부저 모듈\n\n`;

        loopLogic += `        # ${commentName} 비프음 제어\n`;
        loopLogic += `        print("[${commentName}] Beep sound...")\n`;
        loopLogic += `        buzzer_${idx}.on()\n`;
        loopLogic += `        time.sleep(0.2)\n`;
        loopLogic += `        buzzer_${idx}.off()\n\n`;
        break;
      }
      case 'tpl_relay': {
        imports.add('from gpiozero import OutputDevice');
        const sig = (pinMap['Signal'] || 'GPIO22').replace('GPIO', '');
        definitions += `relay_${idx} = OutputDevice(${sig}, active_high=True, initial_value=False)  # 릴레이 디바이스\n\n`;

        loopLogic += `        # ${commentName} 릴레이 동작 제어\n`;
        loopLogic += `        print("[${commentName}] Relay Contact -> ACTIVE (ON)")\n`;
        loopLogic += `        relay_${idx}.on()\n`;
        loopLogic += `        time.sleep(1.0)\n`;
        loopLogic += `        print("[${commentName}] Relay Contact -> DEACTIVE (OFF)")\n`;
        loopLogic += `        relay_${idx}.off()\n\n`;
        break;
      }
      case 'tpl_servo': {
        imports.add('from gpiozero import AngularServo');
        const sig = (pinMap['Signal'] || 'GPIO12').replace('GPIO', '');
        definitions += `servo_${idx} = AngularServo(${sig}, min_angle=-90, max_angle=90)  # 서보모터 객체\n\n`;

        loopLogic += `        # ${commentName} 서보 스윙\n`;
        loopLogic += `        print("[${commentName}] Servo moving to -90 deg")\n`;
        loopLogic += `        servo_${idx}.angle = -90\n`;
        loopLogic += `        time.sleep(1.0)\n`;
        loopLogic += `        print("[${commentName}] Servo moving to 90 deg")\n`;
        loopLogic += `        servo_${idx}.angle = 90\n`;
        timeSleep(1.0);
        break;
      }
      case 'tpl_photoresistor':
      case 'tpl_soil_moisture': {
        // RPi는 자체 ADC가 없어 MCP3008 SPI 컨버터를 표준으로 삼음
        imports.add('from gpiozero import MCP3008');
        definitions += `adc_${idx} = MCP3008(channel=0)  # SPI 아날로그-디지털 컨버터 MCP3008\n\n`;

        loopLogic += `        # ${commentName} 아날로그 조도/토양 감지 (MCP3008 Ch0)\n`;
        loopLogic += `        raw_val = adc_${idx}.value\n`;
        loopLogic += `        print(f"[${commentName}] ADC Raw Voltage ratio: {raw_val:.3f}")\n\n`;
        break;
      }
      default:
        definitions += `# 핀 설정:\n`;
        Object.entries(pinMap).forEach(([k, v]) => {
          definitions += `# - ${k}: ${v}\n`;
        });
        if (isCustomComponent && comp.dependencies?.python?.length) {
          definitions += `# Python 의존성: ${comp.dependencies.python.map(dep => dep.version ? `${dep.name}@${dep.version}` : dep.name).join(', ')}\n`;
        }
        if (aiHints.initialize) {
          definitions += `${aiHints.initialize}\n`;
        }
        const customReadKeys = Object.keys(aiHints).filter(key => key !== 'initialize');
        if (customReadKeys.length > 0) {
          loopLogic += `        # ${commentName} 커스텀 동작 힌트\n`;
          customReadKeys.forEach(key => {
            const snippet = aiHints[key];
            if (snippet) {
              loopLogic += `        ${snippet.split('\n').join('\n        ')}\n`;
            }
          });
          loopLogic += `\n`;
        }
        definitions += `\n`;
        break;
    }
  });

  // 버튼 - LED 단순 연동 구현 (동시 존재 시)
  if (ledVar && btnVar) {
    loopLogic += `        # 연동 시나리오: 버튼을 누르면 LED를 켭니다.\n`;
    loopLogic += `        if ${btnVar}.is_pressed:\n`;
    loopLogic += `            print("[System] Button pressed -> Turning LED ON")\n`;
    loopLogic += `            ${ledVar}.on()\n`;
    loopLogic += `        else:\n`;
    loopLogic += `            ${ledVar}.off()\n\n`;
  }

  function timeSleep(sec: number) {
    loopLogic += `        time.sleep(${sec})\n`;
  }

  // 1. Imports 합치기
  let fullCode = prefix;
  Array.from(imports).forEach(imp => {
    fullCode += `${imp}\n`;
  });
  fullCode += `\n`;

  // 2. 부품 인스턴스 초기화 추가
  fullCode += definitions;

  // 3. 메인 구동 루프 작성
  fullCode += `def main():\n`;
  fullCode += `    print("=========================================")\n`;
  fullCode += `    print(" ModuMake Python App Started.            ")\n`;
  fullCode += `    print(" Press Ctrl+C to stop.                   ")\n`;
  fullCode += `    print("=========================================")\n`;
  fullCode += `    \n`;
  fullCode += `    try:\n`;
  if (loopLogic) {
    fullCode += `        while True:\n`;
    fullCode += loopLogic;
    fullCode += `            time.sleep(1.0)  # 루프 주기 제어\n`;
  } else {
    fullCode += `        while True:\n`;
    fullCode += `            print("[System] Idle loop... No components configured.")\n`;
    fullCode += `            time.sleep(1.5)\n`;
  }
  fullCode += `    except KeyboardInterrupt:\n`;
  fullCode += `        print("\\n[System] Program stopped by user.")\n`;
  fullCode += `    finally:\n`;
  fullCode += `        print("[System] Cleaning up hardware configurations.")\n`;
  fullCode += `\n`;
  fullCode += `if __name__ == '__main__':\n`;
  fullCode += `    main()\n`;

  return fullCode;
}
