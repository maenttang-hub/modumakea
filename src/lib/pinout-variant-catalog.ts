import type { PlacedComponent } from '@/types';

export type PinoutVariantDetail = {
  family: string;
  recommendation: string;
};

const COMMON_MODULE_BRANDS = [
  'adafruit',
  'sparkfun',
  'waveshare',
  'dfrobot',
  'seeed',
  'makerbase',
  'mks',
  'bigtreetech',
  'btt',
  'fysetc',
  'keyestudio',
  'robotdyn',
  'elecrow',
  'sunfounder',
  'cytron',
  'pimoroni',
  'azdelivery',
  'hiletgo',
  'diymore',
  'geekcreit',
  'dollatek',
  'youmile',
  'onyehn',
  'makerhawk',
  'aitrip',
  'devmo',
  'eiechip',
  'aokin',
];

const STEPPER_MODULE_BRANDS = [
  ...COMMON_MODULE_BRANDS,
  'geeetech',
  'creality',
  'biqu',
  'mellow',
  'openbuilds',
  'sainsmart',
  'stepperonline',
  'wantai',
  'longs',
  'omc',
  'hy-div',
];

function buildIdentityText(component: PlacedComponent) {
  return [
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasAny(text: string, tokens: string[]) {
  return tokens.some(token => text.includes(token));
}

function hasChip(text: string, chips: string[]) {
  return chips.some(chip => text.includes(chip));
}

function hasChipAndMarker(text: string, chips: string[], markers: string[]) {
  return hasChip(text, chips) && hasAny(text, markers);
}

function hasChipAndBrand(text: string, chips: string[], brands: string[]) {
  return hasChip(text, chips) && hasAny(text, brands);
}

function hasChipAndBrandOrKeyword(text: string, chips: string[], brands: string[], keywords: string[] = ['breakout', 'carrier', 'module']) {
  return hasChip(text, chips) && hasAny(text, [...brands, ...keywords]);
}

export function inferPinoutVariantDetail(
  component: PlacedComponent,
  rule: Pick<{ id: string }, 'id'>
): PinoutVariantDetail | null {
  const text = buildIdentityText(component);

  if (rule.id === 'bridge_driver') {
    if (hasChipAndBrand(text, ['tb6612'], COMMON_MODULE_BRANDS)) {
      return {
        family: 'TB6612 breakout',
        recommendation:
          'TB6612 브레이크아웃/캐리어 보드는 모듈 실크와 원칩 데이터시트가 서로 다른 순서를 쓰는 경우가 많습니다. VM/VCC/PGND 전원 단자, PWMA/PWMB 또는 STBY enable 단자, AIN/BIN 입력 단자, AO/BO 출력 단자 순서로 먼저 대조해 주세요.',
      };
    }
    if (hasChip(text, ['tb6612'])) {
      return {
        family: 'TB6612',
        recommendation:
          'TB6612 계열은 데이터시트의 Pin Assignment / Terminal Functions 표를 기준으로 VM/VCC/PGND 전원 단자, PWMA/PWMB enable 단자, AIN/BIN 입력 단자, AO/BO 출력 단자 순서로 다시 대조해 주세요.',
      };
    }
    if (hasChipAndBrandOrKeyword(text, ['drv8833'], COMMON_MODULE_BRANDS, ['breakout', 'carrier'])) {
      return {
        family: 'Bridge driver breakout',
        recommendation:
          '브리지 드라이버 브레이크아웃/캐리어 보드는 모듈 실크 핀명과 원칩 데이터시트 핀표를 같이 대조해야 합니다. VM/VBAT, IN 계열, OUT 계열, ENABLE/nSLEEP 순서로 먼저 확인해 주세요.',
      };
    }
    if (hasChip(text, ['drv8833'])) {
      return {
        family: 'DRV8833',
        recommendation:
          'DRV8833 계열은 데이터시트의 Pin Configuration / Functional Description 표를 기준으로 VM 전원 단자, AIN1/AIN2/BIN1/BIN2 입력 단자, AOUT/BOUT 부하 단자, nSLEEP 단자 순서로 다시 대조해 주세요.',
      };
    }
    if (hasChip(text, ['drv8871'])) {
      return {
        family: 'DRV8871',
        recommendation:
          'DRV8871 계열은 데이터시트의 Pin Configuration 표를 기준으로 VM 전원 단자, OUT1/OUT2 부하 단자, IN1/IN2 제어 단자, nSLEEP 단자 순서로 다시 대조해 주세요.',
      };
    }
    if (hasChipAndBrandOrKeyword(text, ['drv8880'], ['pololu', 'waveshare', 'makerbase', 'mks', 'fysetc', 'pimoroni', 'cytron'], ['carrier', 'breakout'])) {
      return {
        family: 'DRV8880 carrier',
        recommendation:
          'DRV8880 캐리어는 모듈 헤더 실크와 데이터시트의 Pin Functions 표를 같이 보고, nSLEEP/STEP/DIR 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조한 뒤 A+/A-/B+/B- 모터 출력을 확인해 주세요.',
      };
    }
    if (hasChipAndBrand(text, ['drv8834'], ['pololu', 'adafruit', 'waveshare', 'sparkfun', 'makerbase', 'mks', 'bigtreetech', 'fysetc', 'pimoroni', 'cytron', 'azdelivery'])) {
      return {
        family: 'DRV8834 breakout',
        recommendation:
          'DRV8834 브레이크아웃/캐리어는 모듈 핀헤더 라벨과 데이터시트의 Pin Functions 표를 같이 보고, EN/STEP/DIR/RESET/SLEEP 제어 단자와 VM/VINT/GND 전원 단자를 먼저 대조한 뒤 A+/A-/B+/B- 출력을 확인해 주세요.',
      };
    }
    if (hasChipAndBrandOrKeyword(text, ['drv8871', 'drv8876'], [...COMMON_MODULE_BRANDS, 'geeetech', 'biqu'], ['breakout', 'carrier'])) {
      return {
        family: 'DRV887x module',
        recommendation:
          'DRV8871/DRV8876 브레이크아웃/캐리어 보드는 모듈 실크와 원칩 데이터시트의 OUT1/OUT2, VM, IN1/IN2, nSLEEP/ENABLE 순서가 섞여 보일 수 있습니다. 부하 단자와 전원 단자를 먼저 대조한 뒤 제어 단자를 확인해 주세요.',
      };
    }
    if (hasChip(text, ['drv8871', 'drv8876'])) {
      return {
        family: 'DRV887x',
        recommendation:
          'DRV8871/DRV8876 계열은 데이터시트의 Pin Configuration / Functional Description 표를 기준으로 VM 전원 단자, OUT1/OUT2 부하 단자, IN1/IN2 제어 단자, nSLEEP/ENABLE 단자 순서로 다시 대조해 주세요.',
      };
    }
    if (hasChipAndMarker(text, ['drv8833', 'drv8834', 'drv8871', 'drv8876', 'drv8880'], ['drv88'])) {
      return {
        family: 'DRV88xx',
        recommendation:
          'DRV88xx 브리지 드라이버는 데이터시트의 Pin Configuration / Recommended Operating Conditions 표를 기준으로 VM, xIN, xOUT, nSLEEP/ENABLE, GND 단자를 같이 대조해 주세요.',
      };
    }
    if (hasChip(text, ['l298'])) {
      return {
        family: 'L298',
        recommendation:
          'L298 계열은 데이터시트의 Pin Functions 표를 기준으로 VS/VSS 전원 단자, ENA/ENB enable 단자, IN1~IN4 입력 단자, OUT1~OUT4 출력 단자, SENSE 단자를 순서대로 확인해 주세요.',
      };
    }
  }

  if (rule.id === 'stepper_driver_carrier') {
    if (hasChipAndBrand(text, ['tb67s109'], ['stepstick', 'silentstepstick', 'bigtreetech', 'btt'])) {
      return {
        family: 'TB67S109 StepStick',
        recommendation:
          'TB67S109 StepStick 변형은 헤더 실크와 데이터시트 Pin Assignment가 어긋나기 쉬우니, STEP/DIR/ENA 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조하고 그다음 A+/A-/B+/B- 출력을 확인해 주세요.',
      };
    }
    if (hasChipAndBrandOrKeyword(text, ['drv8880'], ['pololu', 'waveshare', 'makerbase', 'mks', 'fysetc', 'pimoroni', 'cytron'], ['carrier', 'breakout'])) {
      return {
        family: 'DRV8880 carrier',
        recommendation:
          'DRV8880 캐리어는 모듈 헤더 실크와 데이터시트의 Pin Functions 표를 같이 보고, nSLEEP/STEP/DIR 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조한 뒤 A+/A-/B+/B- 모터 출력을 확인해 주세요.',
      };
    }
    if (hasChipAndBrand(text, ['drv8825'], ['adafruit', 'waveshare', 'sparkfun', 'bigtreetech', 'fysetc', 'makerbase', 'mks', 'geeetech', 'keyestudio', 'robotdyn', 'elecrow', 'creality', 'biqu', 'azdelivery', 'hiletgo', 'silentstepstick', 'stepstick'])) {
      return {
        family: 'DRV8825 breakout',
        recommendation:
          'DRV8825 브레이크아웃/캐리어는 모듈 핀헤더 라벨과 데이터시트의 Pin Functions 표를 같이 보고, EN/STEP/DIR/RESET/SLEEP/FAULT 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasChipAndBrand(text, ['a4988'], ['bigtreetech', 'btt', 'fysetc', 'makerbase', 'mks', 'geeetech', 'keyestudio', 'robotdyn', 'elecrow', 'creality', 'biqu', 'azdelivery', 'hiletgo', 'silentstepstick', 'stepstick'])) {
      return {
        family: 'A4988 breakout',
        recommendation:
          'A4988 브레이크아웃/캐리어는 모듈 핀헤더 라벨과 데이터시트의 Pin Configuration 표를 같이 보고, EN/STEP/DIR/RESET/SLEEP/MSx 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasAny(text, ['silentstepstick', 'stepstick'])) {
      return {
        family: 'StepStick carrier',
        recommendation:
          'StepStick / SilentStepStick 계열은 헤더 실크와 원칩 데이터시트 핀표를 같이 대조해야 합니다. EN/STEP/DIR, VMOT/VDD/GND, 모터 A/B 출력 순서로 먼저 확인해 주세요.',
      };
    }
    if (hasAny(text, ['big easy driver'])) {
      return {
        family: 'Big Easy Driver',
        recommendation:
          'Big Easy Driver 계열은 보드 핀헤더 라벨과 A4988계 핀 기능을 같이 보고, STEP/DIR/ENABLE 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasAny(text, ['pololu']) && hasChip(text, ['a4988', 'drv8825', 'drv8834'])) {
      return {
        family: 'Pololu carrier',
        recommendation:
          'Pololu 캐리어는 모듈 헤더 순서와 원칩 데이터시트 핀 기능이 어긋나기 쉬우니, EN/STEP/DIR/RESET/SLEEP 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조하고 그다음 A+/A-/B+/B- 모터 출력을 확인해 주세요.',
      };
    }
    if (hasChip(text, ['a4988'])) {
      return {
        family: 'A4988 carrier',
        recommendation:
          'A4988 캐리어는 보드 핀헤더 순서와 데이터시트의 Pin Configuration 표를 같이 보고, EN/STEP/DIR/RESET/SLEEP/MSx 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasChip(text, ['drv8825'])) {
      return {
        family: 'DRV8825 carrier',
        recommendation:
          'DRV8825 캐리어(Pololu/StepStick 계열 포함)는 모듈 핀헤더 배열과 데이터시트의 Pin Functions 표를 같이 보고, EN/STEP/DIR/RESET/SLEEP/FAULT 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasChip(text, ['drv8834'])) {
      return {
        family: 'DRV8834 carrier',
        recommendation:
          'DRV8834 캐리어는 저전압 스테퍼용 변형이 많아 모듈 실크와 데이터시트 핀 기능을 같이 봐야 합니다. EN/STEP/DIR/RESET/SLEEP 제어 단자, VM/VINT/GND 전원 단자, A+/A-/B+/B- 출력 단자를 순서대로 대조해 주세요.',
      };
    }
    if (hasChip(text, ['tb6600']) && hasAny(text, [...STEPPER_MODULE_BRANDS, 'module'])) {
      return {
        family: 'TB6600 module',
        recommendation:
          'TB6600 단자대형 모듈(HY-DIV 계열 포함)은 단자대 실크와 데이터시트의 Terminal Functions 표를 같이 보고, PUL/DIR/ENA 입력, VCC/GND 로직 전원, A+/A-/B+/B- 모터 단자, VM 전원 단자를 순서대로 대조해 주세요.',
      };
    }
    if (hasChipAndBrand(text, ['tb67s109'], STEPPER_MODULE_BRANDS)) {
      return {
        family: 'TB67S109 module',
        recommendation:
          'TB67S109 모듈/캐리어는 제조사 보드 실크와 데이터시트의 Terminal Functions 표를 같이 보고, STEP/DIR/ENA 제어 단자와 VMOT/VDD/GND 전원 단자, A+/A-/B+/B- 출력 단자를 순서대로 대조해 주세요.',
      };
    }
    if (hasChip(text, ['tb6600'])) {
      return {
        family: 'TB6600 module',
        recommendation:
          'TB6600 모듈(단자대형 드라이버 보드 포함)은 단자대/헤더 순서와 데이터시트의 Terminal Functions 표를 같이 보고, PUL/DIR/ENA 입력 단자와 A+/A-/B+/B- 모터 단자, VCC/GND 전원 단자를 먼저 대조해 주세요.',
      };
    }
    if (hasChip(text, ['tb67s109'])) {
      return {
        family: 'TB67S109 carrier',
        recommendation:
          'TB67S109 캐리어(브레이크아웃/StepStick 변형 포함)는 보드 핀헤더와 데이터시트의 Terminal Functions 표를 같이 보고, STEP/DIR/ENA 제어 단자와 VMOT/VDD/GND, A+/A-/B+/B- 출력 단자를 순서대로 대조해 주세요.',
      };
    }
    if (hasChip(text, ['tb6600', 'tb67'])) {
      return {
        family: 'TB66xx/TB67xx stepper',
        recommendation:
          'TB6600/TB67S109 계열은 데이터시트의 Terminal Functions 표를 기준으로 PUL/STEP, DIR/CWCCW, ENA, VMOT/VDD/GND, A+/A-/B+/B- 출력 단자를 순서대로 대조해 주세요.',
      };
    }
  }

  if (rule.id === 'driver_array_7' || rule.id === 'driver_array_8') {
    return {
      family: 'ULN driver array',
      recommendation:
        'ULN2003/2004/2803/2804 계열은 데이터시트의 Pin Connection / Truth Table을 기준으로 IN 채널, OUT 채널, COM 플라이백 공통단, GND 단자를 다시 맞춰 주세요.',
    };
  }

  if (rule.id === 'gate_driver') {
    return {
      family: 'IR21xx gate driver',
      recommendation:
        'IR210x/IR211x/IR218x 계열은 데이터시트의 Pin Configuration 표를 기준으로 HIN/LIN 입력, HO/LO 출력, VB/VS 부트스트랩 단자, VCC/GND 전원 단자를 같이 대조해 주세요.',
    };
  }

  return null;
}
