import { pickLanguage } from '@/lib/ui-language';
import type {
  AppLanguage,
  FormalVerificationIssue,
  I18nMessageParams,
  ProjectAuditIssue,
  ProjectAuditIssueConfidence,
  ProjectAuditIssueEvidence,
  ProjectAuditIssueEvidenceChecker,
  ProjectAuditIssueSourceQuality,
} from '@/types';

type EngineIssueLike = Pick<
  ProjectAuditIssue,
  'title' | 'message' | 'recommendation' | 'ruleId' | 'code' | 'params'
> &
  Partial<Pick<ProjectAuditIssue, 'componentName' | 'boardPin' | 'operation' | 'line'>>;

type LocalizedText = {
  ko: string;
  en: string;
};

type EngineIssueCatalogEntry = {
  title: (params: I18nMessageParams) => LocalizedText;
  message: (params: I18nMessageParams) => LocalizedText;
  recommendation?: (params: I18nMessageParams) => LocalizedText;
};

function formatParamValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).join(', ');
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

function interpolate(template: string, params: I18nMessageParams = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => formatParamValue(params[key]));
}

function fixed(ko: string, en: string): (params: I18nMessageParams) => LocalizedText {
  return params => ({
    ko: interpolate(ko, params),
    en: interpolate(en, params),
  });
}

export function getEngineIssueCode(issue: EngineIssueLike) {
  return issue.code ?? issue.ruleId ?? 'engine.unknown';
}

const ENGINE_ISSUE_CATALOG: Record<string, EngineIssueCatalogEntry> = {
  'formal.analog-read-on-non-adc': {
    title: fixed('코드-회로 정합성 오류', 'Code-to-circuit mismatch'),
    message: fixed(
      '{boardPin}은(는) 아날로그 입력 핀이 아닌데 코드에서 analogRead 대상으로 사용되고 있습니다.',
      '{boardPin} is not an analog-capable input, but the code uses it with analogRead.'
    ),
    recommendation: fixed(
      'ADC 가능한 핀으로 옮기거나 보드 핀 배선을 다시 맞추세요.',
      'Move the signal to an ADC-capable pin or realign the board wiring.'
    ),
  },
  'formal.pin-mode-state-conflict': {
    title: fixed('핀 모드 모순', 'Pin mode conflict'),
    message: fixed(
      '{boardPin} 핀이 이전 코드에서 {knownMode}으로 설정되었는데, 이후 코드에서 {operationType}를 시도하고 있습니다.',
      '{boardPin} was configured as {knownMode} earlier, but the later code tries to use {operationType}.'
    ),
    recommendation: fixed(
      '해당 핀을 출력으로 바꾸거나, 입력 핀이라면 digitalWrite/analogWrite 호출을 제거하세요.',
      'Switch the pin to an output, or remove digitalWrite/analogWrite if it should stay an input.'
    ),
  },
  'formal.output-drive-grounded-net': {
    title: fixed('코드가 접지 넷을 구동하고 있습니다', 'Code is driving a grounded net'),
    message: fixed(
      '{boardPin}에 {operationType}({value}) 호출이 있지만, 이 핀은 물리적으로 GND와 같은 넷에 연결되어 있습니다.',
      '{operationType}({value}) is called on {boardPin}, but that pin is physically tied to the same net as GND.'
    ),
    recommendation: fixed(
      '코드에서 해당 핀 출력을 제거하거나, 물리 배선을 수정해 GND 직결 상태를 해소하세요.',
      'Remove that output drive from the code or fix the wiring so the pin is no longer tied directly to GND.'
    ),
  },
  'formal.unwired-pin-reference': {
    title: fixed('코드가 미배선 핀을 사용합니다', 'Code uses an unwired pin'),
    message: fixed(
      '{boardPin}을(를) 코드에서 사용하지만 현재 캔버스 기준 연결된 부품이 없습니다.',
      'The code uses {boardPin}, but nothing is connected to that pin on the current canvas.'
    ),
    recommendation: fixed(
      '실제 배선 대상 핀인지 다시 확인하거나, 코드와 회로 핀 번호를 맞춰 주세요.',
      'Check whether this is the intended pin, then align the code and circuit pin numbers.'
    ),
  },
  'formal.output-collision-sensor-line': {
    title: fixed('코드가 센서 출력 라인을 역구동할 수 있습니다', 'Code may back-drive a sensor output line'),
    message: fixed(
      '{boardPin}은(는) {conflictingPins} 같은 센서 출력 라인에 연결되어 있는데, 코드에서 출력으로 구동될 수 있습니다.',
      '{boardPin} is connected to sensor output lines such as {conflictingPins}, but the code may drive it as an output.'
    ),
    recommendation: fixed(
      '해당 핀은 INPUT으로만 읽도록 바꾸거나, 센서 출력을 다른 보드 입력 핀으로 옮기세요.',
      'Treat that pin as an INPUT only, or move the sensor output to a different board input pin.'
    ),
  },
  'formal.bus-drive-review': {
    title: fixed('코드가 공유 버스/단선 신호를 직접 구동합니다', 'Code directly drives a shared bus line'),
    message: fixed(
      '{boardPin}은(는) {busPins} 같은 공유 신호선에 연결되어 있습니다. 코드에서 직접 HIGH/LOW를 출력하면 충돌이 생길 수 있습니다.',
      '{boardPin} is tied to shared signal lines such as {busPins}. Driving it HIGH/LOW directly may cause bus contention.'
    ),
    recommendation: fixed(
      'I2C/SPI/단선 버스는 해당 라이브러리 API와 입력 모드 기준으로 다루고, 직접 강제 출력은 최소화하세요.',
      'Handle I2C, SPI, and single-bus signals through the appropriate library APIs and avoid forcing them directly.'
    ),
  },
  'formal.i2c-address-mismatch': {
    title: fixed('I2C 주소 불일치', 'I2C address mismatch'),
    message: fixed(
      '{source}에서 {address} 주소로 통신을 시도하지만, 현재 배치된 {deviceNames} 장치의 하드웨어 주소 후보는 {candidateAddresses}입니다.',
      '{source} tries to talk to address {address}, but the placed device set {deviceNames} exposes hardware address candidates {candidateAddresses}.'
    ),
    recommendation: fixed(
      '코드의 I2C 주소와 실제 모듈의 기본 주소/점퍼 설정을 맞추세요.',
      'Match the code’s I2C address to the module’s actual default address or jumper setting.'
    ),
  },
  'formal.timer-servo-pwm-conflict': {
    title: fixed('타이머 충돌 경고', 'Timer conflict warning'),
    message: fixed(
      'Servo 라이브러리가 활성화된 상태에서 {boardPin}에 analogWrite(PWM)를 사용하고 있습니다. {boardName}에서는 PWM 출력이 차단될 수 있습니다.',
      'analogWrite(PWM) is used on {boardPin} while the Servo library is active. On {boardName}, that PWM output may be blocked.'
    ),
    recommendation: fixed(
      'PWM 제어 핀을 다른 PWM 핀으로 옮기거나, 서보/타이머 사용 구성을 분리하세요.',
      'Move the PWM control to another PWM pin or separate the servo and timer usage.'
    ),
  },
  'formal.interrupt-pin-unsupported': {
    title: fixed('인터럽트 핀 오류', 'Interrupt pin error'),
    message: fixed(
      '코드에서 {boardPin}을 외부 인터럽트 핀으로 지정했지만, {boardName}에서는 {interruptPins}만 지원합니다.',
      'The code uses {boardPin} as an external interrupt pin, but {boardName} supports only {interruptPins}.'
    ),
    recommendation: fixed(
      '회로와 코드를 지원되는 인터럽트 핀으로 옮기거나, 인터럽트 대신 폴링 방식으로 변경하세요.',
      'Move the circuit and code to a supported interrupt pin, or switch to polling instead.'
    ),
  },
  'formal.button-grounded-needs-input-pullup': {
    title: fixed('버튼 극성과 입력 모드가 맞지 않습니다', 'Button polarity and input mode do not match'),
    message: fixed(
      '{componentName}은(는) {boardPin}을 GND 쪽으로 당기는 버튼인데, 코드에서는 내부 풀업이 켜지지 않아 입력이 뜰 수 있습니다.',
      '{componentName} pulls {boardPin} toward GND, but the code does not enable an internal pull-up, so the input may float.'
    ),
    recommendation: fixed(
      '권장 수정안: pinMode({boardPin}, INPUT_PULLUP); 로 바꾸고, 버튼 눌림 조건은 digitalRead({boardPin}) == LOW 기준으로 처리하세요.',
      'Suggested fix: switch to pinMode({boardPin}, INPUT_PULLUP); and treat digitalRead({boardPin}) == LOW as pressed.'
    ),
  },
  'formal.button-vcc-incompatible-pullup': {
    title: fixed('버튼 극성과 INPUT_PULLUP이 충돌합니다', 'Button polarity conflicts with INPUT_PULLUP'),
    message: fixed(
      '{componentName}은(는) {boardPin}을 VCC 쪽으로 올리는 버튼인데, 코드에서 INPUT_PULLUP을 사용하고 있습니다.',
      '{componentName} drives {boardPin} toward VCC, but the code uses INPUT_PULLUP.'
    ),
    recommendation: fixed(
      '권장 수정안: pinMode({boardPin}, INPUT); 으로 바꾸고 {boardPin}-GND 사이에 10kΩ 풀다운 저항을 추가하세요.',
      'Suggested fix: change to pinMode({boardPin}, INPUT); and add a 10kΩ pulldown resistor between {boardPin} and GND.'
    ),
  },
  'formal.button-vcc-needs-pulldown': {
    title: fixed('VCC 버튼에 풀다운 저항이 필요합니다', 'A VCC-side button needs a pulldown resistor'),
    message: fixed(
      '{componentName}은(는) {boardPin}을 VCC 쪽으로 올리는 버튼인데, 현재 회로에는 입력 기준을 잡아줄 풀다운 저항이 보이지 않습니다.',
      '{componentName} drives {boardPin} toward VCC, but the circuit does not show a pulldown resistor to define the input level.'
    ),
    recommendation: fixed(
      '권장 수정안: {boardPin}-GND 사이에 10kΩ 풀다운 저항을 추가하고, 코드는 pinMode({boardPin}, INPUT); 와 digitalRead({boardPin}) == HIGH 기준으로 유지하세요.',
      'Suggested fix: add a 10kΩ pulldown resistor between {boardPin} and GND, then keep pinMode({boardPin}, INPUT); with HIGH meaning pressed.'
    ),
  },
  'formal.floating-input-risk': {
    title: fixed('플로팅 입력 위험', 'Floating input risk'),
    message: fixed(
      '{boardPin}이 버튼 입력으로 연결되어 있지만 기준 극성과 풀업/풀다운 구성이 명확하지 않습니다.',
      '{boardPin} is wired as a button input, but its reference polarity and pull-up/pulldown setup are not clear.'
    ),
    recommendation: fixed(
      '버튼 한쪽은 GND 또는 VCC 한 방향으로만 명확히 연결하고, GND 버튼이면 INPUT_PULLUP, VCC 버튼이면 10kΩ 풀다운 + INPUT 조합으로 정리하세요.',
      'Wire the button clearly toward either GND or VCC. Use INPUT_PULLUP for GND-side buttons, or INPUT plus a 10kΩ pulldown for VCC-side buttons.'
    ),
  },
  'formal.library-api-forbidden-call': {
    title: fixed('라이브러리 API 형식 오류', 'Library API shape error'),
    message: fixed(
      '{include} 기준으로 {subject}.{symbol}() 호출은 지원되는 공개 API 형태가 아닐 수 있습니다.',
      'Against {include}, the call {subject}.{symbol}() may not be part of the supported public API.'
    ),
    recommendation: fixed(
      '라이브러리 헤더의 공식 예제 메서드명을 다시 확인하세요.',
      'Check the official header examples and confirm the correct public method name.'
    ),
  },
  'formal.library-api-arity-mismatch': {
    title: fixed('라이브러리 API 인자 불일치', 'Library API argument mismatch'),
    message: fixed(
      '{callLabel} 호출의 인자 개수({argCount})가 지원 범위({allowedArgCounts})와 맞지 않습니다.',
      'The call {callLabel} uses {argCount} arguments, but the supported range is {allowedArgCounts}.'
    ),
    recommendation: fixed(
      '라이브러리 공식 예제의 생성자/메서드 시그니처를 맞춰 인자 개수를 수정하세요.',
      'Match the constructor or method signature from the library’s official examples.'
    ),
  },
  'formal.syntax-error': {
    title: fixed('코드 구문 오류', 'Code syntax error'),
    message: fixed(
      '{languageLabel} 스케치 구문이 완전하지 않아 검증을 진행할 수 없습니다.',
      'The {languageLabel} sketch syntax is incomplete, so verification cannot continue.'
    ),
    recommendation: fixed(
      '괄호, 중괄호, 따옴표, 컬렉션 닫힘 여부를 먼저 확인한 뒤 다시 검증하세요.',
      'Check brackets, braces, quotes, and collection closures first, then run verification again.'
    ),
  },
  'netlist.power-short.direct': {
    title: fixed('전원 단락 위험', 'Power short risk'),
    message: fixed(
      '{netId} 넷에 GND와 {voltages} 전원 레일이 저항 없이 직접 묶여 있습니다.',
      'Net {netId} directly ties GND and the {voltages} power rails together without resistance.'
    ),
    recommendation: fixed(
      '전원선과 접지선은 직접 같은 넷에 두지 말고, 반드시 부하나 보호 회로를 사이에 두세요.',
      'Do not place power and ground on the same net directly. Insert a real load or protection stage between them.'
    ),
  },
  'netlist.power-rail-conflict': {
    title: fixed('전원 레일 충돌', 'Power rail conflict'),
    message: fixed(
      '{netId} 넷에 {voltages} 레일이 동시에 연결되어 있습니다.',
      'Net {netId} carries {voltages} rails at the same time.'
    ),
    recommendation: fixed(
      '5V와 3.3V 레일을 같은 신호선에 직접 묶지 말고, 레벨 시프터나 별도 전원 경로로 분리하세요.',
      'Do not tie 5V and 3.3V directly together. Separate them with a level shifter or another power path.'
    ),
  },
  'power.high-5v-load': {
    title: fixed('보드 5V 레일 고부하', 'Heavy load on the board 5V rail'),
    message: fixed(
      '{componentName}은(는) 약 {peakMa}mA 급 부하로 간주되어 보드 5V 레일만으로 구동하기 전에 외부 전원 분리를 검토하는 편이 좋습니다.',
      '{componentName} is treated as roughly a {peakMa}mA-class load, so review external power separation before driving it from the board 5V rail alone.'
    ),
    recommendation: fixed(
      '센서/액추에이터 전원을 외부 5V 전원으로 분리하고 GND만 공통으로 묶는 구성을 먼저 검토하세요.',
      'Split the sensor or actuator onto an external 5V supply first, and share only GND with the board.'
    ),
  },
  'power.rail-over-budget': {
    title: fixed('{rail} 전원 예산 초과', '{rail} power budget exceeded'),
    message: fixed(
      '{rail} 레일 추정 부하가 {usedMa}mA로 예산 {budgetMa}mA를 넘습니다. {note}',
      'The estimated load on the {rail} rail is {usedMa}mA, exceeding the {budgetMa}mA budget. {note}'
    ),
    recommendation: fixed(
      '고부하 부품 전원을 분리하거나 더 큰 전원원을 사용하고, 보드 핀에서 직접 전력을 공급하는 연결은 줄이세요.',
      'Move heavy loads to a separate supply or use a larger power source, and reduce power paths driven directly from board pins.'
    ),
  },
  'power.rail-low-headroom': {
    title: fixed('{rail} 전원 여유 부족', '{rail} power headroom is low'),
    message: fixed(
      '{rail} 레일 추정 부하가 {usedMa}mA로 예산 {budgetMa}mA에 가깝습니다. {note}',
      'The estimated load on the {rail} rail is {usedMa}mA, which is close to the {budgetMa}mA budget. {note}'
    ),
    recommendation: fixed(
      '제작 전 전류 피크와 스타트업 부하를 포함해 전원 여유를 20% 이상 확보하는 쪽이 안전합니다.',
      'Before building hardware, leave at least about 20% power headroom including startup and peak current.'
    ),
  },
  'power.regulator-thermal': {
    title: fixed('레귤레이터 과열 위험', 'Regulator overheating risk'),
    message: fixed(
      '{regulatorLabel} 시나리오에서 추정 손실이 {dissipationW}W로 안전 한계 {safeLimitW}W를 넘습니다.',
      'In the {regulatorLabel} scenario, estimated dissipation reaches {dissipationW}W, exceeding the safe limit of {safeLimitW}W.'
    ),
    recommendation: fixed(
      '입력 전압을 낮추거나 DCDC 벅 컨버터/외부 5V 전원으로 부하 전원을 분리하세요.',
      'Lower the input voltage or move the load to a buck converter or external 5V supply.'
    ),
  },
  'power.regulator-headroom': {
    title: fixed('레귤레이터 열 여유 부족', 'Regulator thermal headroom is low'),
    message: fixed(
      '{regulatorLabel} 시나리오에서 추정 손실이 {dissipationW}W로 안전 한계에 가깝습니다.',
      'In the {regulatorLabel} scenario, estimated dissipation of {dissipationW}W is approaching the safe limit.'
    ),
    recommendation: fixed(
      'VIN 전압과 5V 레일 부하를 줄이고, 제작 전에는 외부 전원 분리를 우선 검토하세요.',
      'Reduce VIN or 5V rail load, and consider external power separation before building hardware.'
    ),
  },
  'netlist.gpio-overvoltage.solved': {
    title: fixed('실제 넷 기준 GPIO 과전압', 'Solved GPIO overvoltage'),
    message: fixed(
      '{boardPin}가 연결된 넷 전압이 약 {voltage}V로 계산되어, {boardName} 허용 입력 상한 {maxSafe}V를 넘습니다.',
      'The net attached to {boardPin} is estimated at about {voltage}V, which exceeds the {boardName} safe input limit of {maxSafe}V.'
    ),
    recommendation: fixed(
      '레벨 시프터나 저항 분압 회로를 실제 신호 라인에 넣어 보드 입력 전압을 낮추세요.',
      'Add a level shifter or resistor divider on the real signal path to lower the board input voltage.'
    ),
  },
  'netlist.adc-over-range.solved': {
    title: fixed('실제 넷 기준 ADC 입력 초과', 'Solved ADC over-range'),
    message: fixed(
      '{boardPin}가 연결된 넷 전압이 약 {voltage}V로 계산되어, {boardName}의 기준 ADC 범위 {nominalVoltage}V를 넘습니다.',
      'The net attached to {boardPin} is estimated at about {voltage}V, which exceeds the {boardName} ADC reference range of {nominalVoltage}V.'
    ),
    recommendation: fixed(
      '분압비를 다시 조정하거나 외부 ADC/버퍼를 사용해 아날로그 입력 기준 전압 안으로 낮추세요.',
      'Retune the divider ratio or use an external ADC or buffer to bring the analog input into range.'
    ),
  },
  'netlist.diode-reverse-bias': {
    title: fixed('다이오드 역바이어스 상태', 'Diode reverse-bias state'),
    message: fixed(
      '{componentName}의 K 쪽 전압이 A 쪽보다 높아 현재 상태에서는 전류가 흐르지 않을 가능성이 큽니다.',
      'On {componentName}, the cathode sits above the anode, so current is unlikely to flow in the present state.'
    ),
    recommendation: fixed(
      '다이오드 방향(A/K)과 전원 극성을 다시 확인하세요. 역방향 배치라면 downstream 회로가 켜지지 않을 수 있습니다.',
      'Check the diode orientation (A/K) and supply polarity. If it is reversed, the downstream circuit may never turn on.'
    ),
  },
  'netlist.diode-forward-approximation': {
    title: fixed('다이오드 도통 경로 검토 필요', 'Diode conduction path needs review'),
    message: fixed(
      '{componentName}는 A가 K보다 높아 도통 가능한 상태입니다. 현재 해석은 piecewise-linear 다이오드 근사로 전압 강하를 추정합니다.',
      '{componentName} is in a forward-conducting condition with the anode above the cathode. The current solver estimates its drop with a piecewise-linear diode model.'
    ),
    recommendation: fixed(
      '정확한 전류 파형이나 역회복 특성이 중요하면 실제 부품 데이터시트와 SPICE 상세 모델을 함께 검토하세요.',
      'If exact current waveforms or reverse-recovery behavior matter, validate them with the real datasheet and a detailed SPICE model.'
    ),
  },
  'netlist.led-current-limit-missing': {
    title: fixed('LED 보호 저항 누락', 'LED current-limiting resistor missing'),
    message: fixed(
      '{componentName}가 저항 없이 직접 구동되고 있습니다. 현재 연결 상태에서는 과전류로 LED나 보드 핀이 손상될 수 있습니다.',
      '{componentName} is being driven without a series resistor. In the current wiring, excess current may damage the LED or the board pin.'
    ),
    recommendation: fixed(
      'LED 직렬 경로에 220Ω~330Ω 정도의 한류 저항을 추가해 전류를 제한하세요.',
      'Add a 220Ω to 330Ω series resistor in the LED path to limit the current.'
    ),
  },
  'netlist.led-current-too-low': {
    title: fixed('LED 전류 부족 가능성', 'LED current may be too low'),
    message: fixed(
      '{componentName} 직렬 저항이 커서 예상 LED 전류가 약 {currentMa}mA 수준입니다.',
      '{componentName} uses a large series resistor, so the estimated LED current is only about {currentMa}mA.'
    ),
    recommendation: fixed(
      'LED가 충분히 켜지지 않으면 저항값을 낮추거나 공급 전압/색상별 순방향 전압을 다시 확인하세요.',
      'If the LED is too dim, lower the resistor or re-check the supply voltage and the LED forward voltage for that color.'
    ),
  },
  'netlist.rc-filter-smoothing-ok': {
    title: fixed('PWM RC 필터 감쇄 양호', 'PWM RC filter smoothing looks good'),
    message: fixed(
      '{resistorName} + {capacitorName} 조합의 RC 차단 주파수는 약 {cutoffHz}Hz입니다. 기본 PWM {pwmFrequencyHz}Hz 대비 충분히 낮습니다.',
      'The RC cutoff frequency of {resistorName} + {capacitorName} is about {cutoffHz}Hz, which is comfortably below the default PWM frequency of {pwmFrequencyHz}Hz.'
    ),
    recommendation: fixed(
      '현재 조합은 PWM 리플을 꽤 잘 눌러주는 편입니다. 응답 속도와 리플 사이에서 필요한 수준인지 계속 확인하세요.',
      'This combination should suppress PWM ripple fairly well. Keep checking whether it balances ripple and response time for your use case.'
    ),
  },
  'netlist.rc-filter-smoothing-low': {
    title: fixed('PWM RC 필터 감쇄 부족', 'PWM RC filter smoothing may be weak'),
    message: fixed(
      '{resistorName} + {capacitorName} 조합의 RC 차단 주파수는 약 {cutoffHz}Hz입니다. 기본 PWM {pwmFrequencyHz}Hz 대비 아직 높습니다.',
      'The RC cutoff frequency of {resistorName} + {capacitorName} is about {cutoffHz}Hz, which is still high relative to the default PWM frequency of {pwmFrequencyHz}Hz.'
    ),
    recommendation: fixed(
      '아날로그처럼 더 부드럽게 만들려면 R 또는 C 값을 키워 차단 주파수를 PWM 기본 주파수보다 충분히 낮추세요.',
      'If you want a smoother analog-like result, increase R or C so the cutoff falls much lower than the PWM base frequency.'
    ),
  },
  'netlist.adc-source-impedance-high': {
    title: fixed('ADC 소스 임피던스 과다', 'ADC source impedance too high'),
    message: fixed(
      '{analogPins} 핀에 연결된 아날로그 소스의 테브난 등가 저항이 저항망 경로 {pathCount}개 기준 약 {theveninOhms}Ω으로 추정됩니다.',
      'The analog source feeding {analogPins} is estimated at about {theveninOhms}Ω of Thevenin resistance across {pathCount} resistor-path branches.'
    ),
    recommendation: fixed(
      'ADC 권장 입력 임피던스 10kΩ 이하에 맞추도록 저항값을 낮추거나, 버퍼(OP-Amp)를 추가하세요.',
      'Lower the resistor values or add a buffer op-amp so the source impedance stays near or below the 10kΩ ADC guideline.'
    ),
  },
  'electrical.logic-level.overvoltage': {
    title: fixed('전압 도메인 불일치', 'Voltage-domain mismatch'),
    message: fixed(
      '{componentName} {pinName} 입력 허용치 {inputTolerance}V보다 {boardPin} 기본 로직 {boardVoltage}V가 높습니다.',
      '{boardPin} uses a default logic level of {boardVoltage}V, which is higher than the {inputTolerance}V input tolerance of {componentName} {pinName}.'
    ),
    recommendation: fixed(
      '{mitigationRecommendation}',
      '{mitigationRecommendationEn}'
    ),
  },
  'electrical.logic-level.low-high-threshold': {
    title: fixed('로직 HIGH 임계값 미달 가능성', 'Logic HIGH threshold may not be met'),
    message: fixed(
      '{componentName} {pinName}은(는) 보통 {minHighVoltage}V 이상 HIGH 입력을 기대하는데 {boardPin} 기본 로직은 {boardVoltage}V입니다.',
      '{componentName} {pinName} typically expects at least {minHighVoltage}V for a HIGH input, but {boardPin} defaults to {boardVoltage}V logic.'
    ),
    recommendation: fixed(
      '3.3V 보드에서 5V 입력 임계값이 높은 센서를 쓸 때는 레벨 시프터나 트랜지스터 버퍼를 추가하는 편이 안전합니다.',
      'When a 3.3V board talks to a sensor with a higher HIGH threshold, adding a level shifter or transistor buffer is safer.'
    ),
  },
  'electrical.logic-level.overvoltage-output': {
    title: fixed('전압 도메인 불일치', 'Voltage-domain mismatch'),
    message: fixed(
      '{componentName} {pinName} 출력은 최대 {outputVoltage}V로 가정되는데 {boardPin} 허용 입력 상한은 {maxSafeVoltage}V 수준입니다.',
      '{componentName} {pinName} may output up to {outputVoltage}V, while the safe input ceiling on {boardPin} is about {maxSafeVoltage}V.'
    ),
    recommendation: fixed(
      '{mitigationRecommendation}',
      '{mitigationRecommendationEn}'
    ),
  },
  'electrical.adc-over-range': {
    title: fixed('ADC 입력 초과 위험', 'ADC input over-range risk'),
    message: fixed(
      '{componentName} {pinName}은(는) 최대 {maxAnalogVoltage}V 출력으로 가정되지만 {boardPin} 아날로그 입력 기준 전압은 {nominalVoltage}V입니다.',
      '{componentName} {pinName} may output up to {maxAnalogVoltage}V, but the analog reference range on {boardPin} is {nominalVoltage}V.'
    ),
    recommendation: fixed(
      '{mitigationRecommendation}',
      '{mitigationRecommendationEn}'
    ),
  },
  'electrical.voltage-mismatch': {
    title: fixed('I/O 정격 전압 초과', 'I/O voltage rating exceeded'),
    message: fixed(
      '{boardPin}의 기본 출력 {boardVoltage}V가 {componentName} 신호 허용치 {signalMaxVoltage}V를 넘을 수 있습니다.',
      '{boardPin} defaults to {boardVoltage}V output, which may exceed the {signalMaxVoltage}V signal tolerance of {componentName}.'
    ),
    recommendation: fixed(
      '레벨 시프터를 추가하거나 3.3V/5V 로직이 일치하는 조합으로 바꾸세요.',
      'Add a level shifter or switch to a 3.3V/5V-compatible pairing.'
    ),
  },
  'netlist.decoupling-capacitor-missing': {
    title: fixed('디커플링 커패시터 권장', 'Decoupling capacitor recommended'),
    message: fixed(
      '{componentName} 전원 입력선 근처에 0.1uF급 바이패스 커패시터가 감지되지 않았습니다.',
      'No 0.1uF-class bypass capacitor was detected close to the power input of {componentName}.'
    ),
    recommendation: fixed(
      '실물 동작 안정성을 위해 VCC-GND 사이에 0.1uF 세라믹 커패시터를 가깝게 추가하세요.',
      'Add a nearby 0.1uF ceramic capacitor between VCC and GND for better real-world stability.'
    ),
  },
  'netlist.resistor-value-fallback': {
    title: fixed('저항값 파싱 확인 필요', 'Resistor value parsing needs confirmation'),
    message: fixed(
      '{componentName} 값 "{rawValue}"을(를) 저항값으로 해석하지 못해 회로 해석에서는 기본 220옴으로 계산했습니다.',
      'The value "{rawValue}" on {componentName} could not be parsed as a resistor, so the solver fell back to 220 ohms.'
    ),
    recommendation: fixed(
      '저항 값을 220, 1k, 10k, 1M 같은 형식으로 명확히 입력해 해석 결과가 왜곡되지 않도록 맞춰 주세요.',
      'Enter the resistor value clearly in formats like 220, 1k, 10k, or 1M so the analysis does not get distorted.'
    ),
  },
  'netlist.solver-convergence': {
    title: fixed('회로 해석 수렴 검토 필요', 'Circuit solver convergence needs review'),
    message: fixed(
      '{solverMode} 해석이 안정적으로 수렴하지 않았습니다.',
      'The {solverMode} analysis did not converge stably.'
    ),
    recommendation: fixed(
      '다이오드/전원 방향, 떠 있는 노드, 비현실적인 부품값을 다시 확인한 뒤 회로를 단순화해 재검증하세요.',
      'Check diode and power orientation, floating nodes, and unrealistic component values, then simplify and retry the circuit.'
    ),
  },
  'routing.unrouted-component': {
    title: fixed('미배선 부품', 'Unrouted part'),
    message: fixed(
      'PCB 단계로 가기 전에 핀 연결을 먼저 완료하는 편이 좋습니다.',
      'It is best to finish the pin routing before moving on to the PCB stage.'
    ),
    recommendation: fixed(
      '자동 배선을 다시 실행하거나 핀 충돌이 있는 부품을 정리한 뒤 다시 배치하세요.',
      'Run auto-wiring again, or simplify any pin conflicts before placing the part again.'
    ),
  },
  'companion.external-part-check': {
    title: fixed('외부 부품 확인', 'External part check'),
    message: fixed('{requirement}', '{requirement}'),
  },
  'audit.template-missing': {
    title: fixed('템플릿 누락', 'Missing template'),
    message: fixed(
      '라이브러리 정의를 찾을 수 없는 부품이 포함되어 있습니다.',
      'The project contains a part whose library definition could not be found.'
    ),
  },
  'audit.generic-sku-unfixed': {
    title: fixed('제조사 SKU 미고정', 'Vendor SKU not locked'),
    message: fixed(
      '현재 부품은 generic-module 상태라 정확한 브레이크아웃 보드나 제조사 문서가 더 필요합니다.',
      'This part is still treated as a generic module, so the exact breakout board or vendor document still needs to be pinned down.'
    ),
  },
  'audit.generic-sku-summary': {
    title: fixed('generic 부품 신뢰도 제한', 'Generic part confidence limit'),
    message: fixed(
      '정확한 SKU/MPN이 없는 부품 {count}개({componentNames})가 있어 일부 판정은 보수적으로 처리됩니다.',
      '{count} parts ({componentNames}) do not have exact SKU/MPN data, so some checks are intentionally conservative.'
    ),
    recommendation: fixed(
      '회로 오류가 아니라 검증 신뢰도 제한입니다. 정확한 모듈명, 제조사 링크, 데이터시트가 있으면 해당 부품부터 고정하세요.',
      'This is a confidence limitation, not a circuit fault. Pin exact module names, vendor links, or datasheets for these parts first.'
    ),
  },
  'audit.vendor-pin-needed': {
    title: fixed('정확한 핀 문서 필요', 'Exact pin documentation needed'),
    message: fixed(
      '핀 배열과 지원 회로가 제조사별로 달라질 수 있어 공식 핀 문서를 먼저 고정해야 합니다.',
      'Pin order and support circuitry may vary by vendor, so the official pin document should be fixed first.'
    ),
  },
  'audit.partial-datasheet': {
    title: fixed('부분 공개 데이터시트', 'Partial datasheet only'),
    message: fixed(
      '벤더 자료는 확인됐지만 전체 전기 특성표가 아직 고정되지 않았습니다.',
      'Vendor information is present, but the full electrical characteristics table is not locked yet.'
    ),
  },
  'bus.i2c-address-collision': {
    title: fixed('I2C 주소 충돌', 'I2C address collision'),
    message: fixed(
      '{componentNames} 이(가) 동일한 고정 주소 {address}를 사용합니다.',
      '{componentNames} share the same fixed I2C address {address}.'
    ),
    recommendation: fixed(
      '주소가 다른 센서로 바꾸거나, 멀티플렉서/별도 버스를 사용하세요.',
      'Use parts with different addresses, or split them with a multiplexer or a separate bus.'
    ),
  },
  'bus.i2c-address-planning': {
    title: fixed('I2C 주소 계획 필요', 'I2C address planning required'),
    message: fixed(
      '{componentNames} 이(가) 기본 주소 {address} 후보를 공유합니다. 주소 점퍼/스트랩 설정을 먼저 고정하세요.',
      '{componentNames} share the same default candidate address {address}. Lock the address jumper or strap plan first.'
    ),
    recommendation: fixed(
      'ADDR 핀 스트랩 또는 SKU 옵션으로 주소를 나눠 배치하고, 프로젝트 문서에 최종 주소를 기록하세요.',
      'Split addresses with ADDR straps or SKU options, then record the final address plan in the project notes.'
    ),
  },
  'bus.i2c-pullup-missing': {
    title: fixed('I2C 풀업 저항 확인 필요', 'I2C pull-up resistors need review'),
    message: fixed(
      'I2C 장치({componentNames})가 배치되어 있지만 SDA/SCL용 외부 풀업 저항 2개를 회로에서 아직 확인하지 못했습니다.',
      'I2C devices ({componentNames}) are present, but the circuit still does not show the two external pull-up resistors for SDA and SCL.'
    ),
    recommendation: fixed(
      '4.7kΩ~10kΩ 풀업 저항 2개를 추가하거나, 사용 중인 모듈/보드에 이미 포함된 풀업 회로가 있는지 SKU 기준으로 다시 확인하세요.',
      'Add two 4.7kΩ to 10kΩ pull-ups, or confirm by exact SKU that the active board or modules already include them.'
    ),
  },
};

export function translateEngineIssue(issue: EngineIssueLike, language: AppLanguage) {
  const code = getEngineIssueCode(issue);
  const entry = ENGINE_ISSUE_CATALOG[code];

  if (!entry) {
    return {
      title: issue.title,
      message: issue.message,
      recommendation: issue.recommendation,
      code,
    };
  }

  const params = issue.params ?? {};
  return {
    title: pickLanguage(language, entry.title(params)),
    message: pickLanguage(language, entry.message(params)),
    recommendation: entry.recommendation ? pickLanguage(language, entry.recommendation(params)) : issue.recommendation,
    code,
  };
}

function inferIssueCheckedBy(code: string): ProjectAuditIssueEvidenceChecker[] {
  if (code.startsWith('formal.')) {
    return ['formal-code'];
  }

  if (code.startsWith('imported.')) {
    return ['kicad-import'];
  }

  if (code.startsWith('netlist.') || code.startsWith('routing.') || code.startsWith('electrical.')) {
    return ['netlist'];
  }

  if (code.startsWith('power.') || code.startsWith('analog.') || code.startsWith('bus.')) {
    return ['netlist', 'datasheet-rule'];
  }

  return ['datasheet-rule'];
}

function inferIssueConfidence(code: string, severity: ProjectAuditIssue['severity']): ProjectAuditIssueConfidence {
  if (severity === 'info') {
    return 'informational';
  }

  if (
    code.startsWith('formal.') ||
    code.startsWith('netlist.power-short.') ||
    code.includes('.solved') ||
    code.includes('overvoltage') ||
    code.includes('reverse') ||
    code.includes('short')
  ) {
    return 'confirmed';
  }

  if (severity === 'error') {
    return 'strong-inference';
  }

  return 'needs-review';
}

function inferIssueSourceQuality(input: {
  sourceLabel?: string;
  sourceUrl?: string;
  evidence?: ProjectAuditIssueEvidence;
}): ProjectAuditIssueSourceQuality | undefined {
  if (input.evidence?.sourceQuality) {
    return input.evidence.sourceQuality;
  }

  const text = `${input.sourceLabel ?? ''} ${input.sourceUrl ?? ''}`.toLowerCase();
  if (!text) {
    return undefined;
  }

  if (text.includes('generic')) {
    return 'generic-module';
  }

  if (text.includes('official')) {
    return 'official-complete';
  }

  return undefined;
}

function buildDefaultEvidence(
  input: Omit<ProjectAuditIssue, 'title' | 'message' | 'recommendation'> & {
    code: string;
    params?: I18nMessageParams;
    title?: string;
    message?: string;
    recommendation?: string;
  },
  resolvedMessage: string,
  resolvedRecommendation?: string
): ProjectAuditIssueEvidence {
  const confidence = input.confidence ?? inferIssueConfidence(input.code, input.severity);

  return {
    confidence,
    evidenceSummary: input.evidence?.evidenceSummary ?? resolvedMessage,
    observedFacts: [
      input.componentName ? `Affected component: ${input.componentName}` : null,
      input.boardPin ? `Affected board pin: ${input.boardPin}` : null,
      input.ruleId ? `Rule id: ${input.ruleId}` : null,
      ...(input.evidence?.observedFacts ?? []),
    ].filter(Boolean) as string[],
    assumptions: input.evidence?.assumptions ?? (
      confidence === 'needs-review'
        ? ['This finding may depend on module SKU, datasheet completeness, or board-level context not present in the netlist.']
        : []
    ),
    sourceQuality: inferIssueSourceQuality(input),
    checkedBy: input.evidence?.checkedBy?.length ? input.evidence.checkedBy : inferIssueCheckedBy(input.code),
    affectedComponents: input.evidence?.affectedComponents ?? input.visualTargets?.componentIds,
    affectedNets: input.evidence?.affectedNets ?? input.visualTargets?.netIds,
    howToVerify: input.evidence?.howToVerify ?? resolvedRecommendation,
  };
}

export function createFormalIssue(
  input: Omit<FormalVerificationIssue, 'title' | 'message' | 'recommendation'> & {
    code: string;
    params?: I18nMessageParams;
    title?: string;
    message?: string;
    recommendation?: string;
  }
): FormalVerificationIssue {
  const copy = translateEngineIssue(
    {
      title: input.title ?? input.code,
      message: input.message ?? input.code,
      recommendation: input.recommendation,
      code: input.code,
      params: input.params,
      ruleId: input.ruleId,
    },
    'ko'
  );

  return {
    ...input,
    code: input.code,
    params: input.params,
    title: input.title ?? copy.title,
    message: input.message ?? copy.message,
    recommendation: input.recommendation ?? copy.recommendation,
  };
}

export function createProjectAuditIssue(
  input: Omit<ProjectAuditIssue, 'title' | 'message' | 'recommendation'> & {
    code: string;
    params?: I18nMessageParams;
    title?: string;
    message?: string;
    recommendation?: string;
  }
): ProjectAuditIssue {
  const copy = translateEngineIssue(
    {
      title: input.title ?? input.code,
      message: input.message ?? input.code,
      recommendation: input.recommendation,
      code: input.code,
      params: input.params,
      ruleId: input.ruleId,
    },
    'ko'
  );

  return {
    ...input,
    code: input.code,
    params: input.params,
    title: input.title ?? copy.title,
    message: input.message ?? copy.message,
    recommendation: input.recommendation ?? copy.recommendation,
    confidence: input.confidence ?? inferIssueConfidence(input.code, input.severity),
    evidence: buildDefaultEvidence(
      input,
      input.message ?? copy.message,
      input.recommendation ?? copy.recommendation
    ),
  };
}
