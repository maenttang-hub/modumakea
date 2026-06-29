'use client';

import { getTemplateById } from '@/constants/component-templates';
import { getEngineIssueCode, translateEngineIssue } from '@/lib/engine-i18n';
import { pickLanguage } from '@/lib/ui-language';
import type { PlacedComponent, ProjectAuditIssue, WarningSeverity } from '@/types';

export const ISSUE_TONES = {
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#fca5a5', labelKey: { ko: '차단', en: 'Error' } },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.32)', text: '#fcd34d', labelKey: { ko: '경고', en: 'Warning' } },
  info: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd', labelKey: { ko: '정보', en: 'Info' } },
} as const;

export const LIGHT_ISSUE_TONES = {
  error: { bg: '#fff1f2', border: '#fca5a5', text: '#991b1b', labelKey: ISSUE_TONES.error.labelKey },
  warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', labelKey: ISSUE_TONES.warning.labelKey },
  info: { bg: '#eff6ff', border: '#93c5fd', text: '#075985', labelKey: ISSUE_TONES.info.labelKey },
} as const;

export const PANEL_SECTION = 'rounded-[18px] border border-[#e4dbcf] bg-[#fffdfa] p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]';
export const PANEL_SECTION_NEUTRAL = `${PANEL_SECTION} border-[#e4dbcf] bg-[#fffdfa]`;
export const PANEL_SECTION_SUBTLE = `${PANEL_SECTION} border-[#ebe3d8] bg-[#f7f2eb]`;
export const PANEL_CARD = 'rounded-[14px] border border-[#e8dfd3] bg-[#fcf8f2] px-3 py-3';

export type IssueFocusChip = {
  key: string;
  label: string;
};

export type IssueChecklistSection = {
  key: string;
  title: string;
  items: string[];
};

export type IssueGroupSummary = {
  key: string;
  title: string;
  description: string;
  nextFocus: string;
  targetItems: string[];
  datasheetItems: string[];
  severity: WarningSeverity;
  count: number;
  componentNames: string[];
  spotlightComponent?: string;
  spotlightHeadline?: string;
  spotlightCue?: string;
  spotlightWhyShort?: string;
  spotlightReason?: string;
};

export type BomSortMode = 'count-desc' | 'name-asc' | 'category-asc';
export type BomFilterMode = 'all' | 'sensor' | 'power' | 'passive';

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function getIssueFixSuggestion(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const code = getEngineIssueCode(issue);
  const text = `${issue.title} ${issue.message}`;
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });

  if (/inductive-flyback/.test(code)) return t('코일 양단 보호 경로부터 다시 확인하세요.', 'Check the coil protection path first.');
  if (/resistor-(overwatt|low-headroom)/.test(code)) return t('저항 정격과 발열 여유를 다시 잡으세요.', 'Recheck resistor rating and thermal margin.');
  if (/capacitor-(overvoltage|voltage-headroom)/.test(code)) return t('커패시터 내압과 전압 여유를 다시 보세요.', 'Recheck capacitor rating and voltage headroom.');
  if (/power\.regulator-(thermal|headroom)/.test(code)) return t('레귤레이터 입력, 출력, 발열을 같이 보세요.', 'Review regulator input, output, and heat together.');
  if (/electrical\.pinout-mismatch/.test(code)) return t('핀 순서와 패드 번호부터 대조하세요.', 'Compare pin order and pad numbering first.');
  if (/power-short|rail-conflict/.test(code)) return t('충돌하는 전원 경로부터 먼저 끊으세요.', 'Break the conflicting power path first.');
  if (/pullup|i2c/i.test(code) && /bus|pull/i.test(text)) return t('라인 기준 전압과 풀업부터 맞추세요.', 'Align bus voltage and pull-ups first.');

  if (
    code === 'formal.button-grounded-needs-input-pullup' ||
    code === 'formal.button-vcc-incompatible-pullup' ||
    code === 'formal.button-vcc-needs-pulldown' ||
    code === 'formal.floating-input-risk'
  ) {
    return t('버튼 기준과 풀업/풀다운 방향을 같이 맞추세요.', 'Align the button logic with the pull-up or pull-down choice.');
  }

  if (code.includes('voltage') || code.includes('overvoltage') || code.includes('adc-over-range') || /전압|레벨/i.test(text)) {
    return t('3.3V/5V 전압 기준부터 다시 맞추세요.', 'Recheck the 3.3V or 5V voltage match first.');
  }
  if (text.includes('아날로그')) return t('ADC 보드나 외부 ADC를 쓰세요.', 'Use a board with ADC or add an external ADC.');
  if (text.includes('미배선')) return t('핀과 배선 위치를 다시 맞추세요.', 'Realign the pin and wire positions.');
  if (text.includes('SKU') || text.includes('generic-module')) return t('제조사 문서가 있는 모듈로 바꾸세요.', 'Switch to a module with clear vendor docs.');
  if (text.includes('D0/D1') || text.includes('UART')) return t('기본 시리얼 핀 대신 다른 GPIO로 옮기세요.', 'Move it off the default serial pins.');
  if (text.includes('예열') || text.includes('히터')) return t('워밍업 시간과 전원 예산을 같이 보세요.', 'Check warm-up time and power budget together.');
  if (text.includes('풀업')) return t('필요한 풀업 저항을 먼저 넣으세요.', 'Add the required pull-up resistor first.');
  if (text.includes('저항') || text.includes('콘덴서') || text.includes('캐패시터')) return t('필요한 수동소자를 BOM에 같이 넣으세요.', 'Add the needed passive parts to the BOM.');

  return t('배선, 전압, 핀 선택을 먼저 다시 확인하세요.', 'Recheck wiring, voltage, and pin choice first.');
}

export function isKiCadPowerSymbolComponent(component: PlacedComponent) {
  const importedRef = component.importedReference?.toUpperCase() ?? '';
  const importedLibId = component.importedMapping?.libraryId?.toLowerCase() ?? '';
  return importedLibId.startsWith('power:') || importedRef.startsWith('#PWR') || importedRef.startsWith('#FLG');
}

export function getBomBucket(component: PlacedComponent) {
  const template = getTemplateById(component.templateId);
  if (isKiCadPowerSymbolComponent(component)) return 'excluded' as const;
  if (template?.category === 'SENSOR') return 'sensor' as const;

  const powerishText = [
    template?.id,
    template?.name,
    component.name,
    component.value,
    component.importedMapping?.libraryId,
    component.importedMapping?.footprint,
  ].filter(Boolean).join(' ').toLowerCase();

  if (
    template?.id === 'tpl_external_power' ||
    /\b(power|battery|batt|barrel|jack|regulator|ldo|buck|boost|charger|usb[-_ ]?(micro|c)|terminal)\b/.test(powerishText) ||
    /\b(lm78|lm79|lm317|lm337|ams1117|7805|7812)\b/.test(powerishText)
  ) {
    return 'power' as const;
  }

  if (template?.category === 'PASSIVE') return 'passive' as const;
  return 'other' as const;
}

export function getIssueFriendlyLead(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const componentName = issue.componentName?.trim();
  const subject = componentName ? `${componentName} ` : '';
  const ruleId = issue.ruleId ?? '';

  if (/inductive-flyback-missing/.test(ruleId)) return t(`${subject}보호 다이오드가 없습니다.`, `${subject}is missing a protection diode.`);
  if (/inductive-flyback-reversed/.test(ruleId)) return t(`${subject}보호 다이오드 방향이 반대입니다.`, `${subject}has a reversed protection diode.`);
  if (/inductive-flyback-diode-headroom/.test(ruleId)) return t(`${subject}보호 다이오드 여유가 작습니다.`, `${subject}has thin protection-diode margin.`);
  if (/power-inductor-rating-review/.test(ruleId)) return t(`${subject}전원 인덕터 정격을 다시 봐야 합니다.`, `${subject}needs a recheck on the power inductor rating.`);
  if (/resistor-overwatt/.test(ruleId)) return t(`${subject}저항 발열이 큽니다.`, `${subject}has a resistor running too hot.`);
  if (/resistor-low-headroom/.test(ruleId)) return t(`${subject}저항 장기 여유가 얇습니다.`, `${subject}has thin long-term resistor margin.`);
  if (/capacitor-overvoltage/.test(ruleId)) return t(`${subject}커패시터 내압이 부족합니다.`, `${subject}has a capacitor with too little voltage rating.`);
  if (/capacitor-voltage-headroom/.test(ruleId)) return t(`${subject}커패시터 전압 여유가 빠듯합니다.`, `${subject}has tight capacitor voltage headroom.`);
  if (/power\.regulator-thermal/.test(ruleId)) return t(`${subject}레귤레이터 발열이 큽니다.`, `${subject}has a regulator thermal problem.`);
  if (/power\.regulator-headroom/.test(ruleId)) return t(`${subject}레귤레이터 전압 여유가 얇습니다.`, `${subject}has thin regulator headroom.`);
  if (/electrical\.pinout-mismatch/.test(ruleId)) return t(`${subject}핀 순서가 데이터시트와 다릅니다.`, `${subject}does not match the datasheet pin order.`);
  if (/i2c/i.test(ruleId) && /pullup/i.test(ruleId)) return t(`${subject}I2C 풀업이 부족합니다.`, `${subject}is missing proper I2C pull-ups.`);
  if (/power-short|rail-conflict/.test(ruleId)) return t(`${subject}전원끼리 충돌하고 있습니다.`, `${subject}has a power rail conflict.`);
  if (/imported\.sheet-frame-overlap/.test(ruleId)) return t(`${subject}시트 경계와 겹쳐 보입니다.`, `${subject}visually overlaps a sheet boundary.`);
  if (/unrouted|floating/i.test(ruleId)) return t(`${subject}연결이 아직 덜 끝났습니다.`, `${subject}still has unfinished connections.`);

  const translated = translateEngineIssue(issue, language);
  const message = translated.message.split(/[\n.!?]\s/)[0]?.trim() ?? translated.message.trim();
  return message || translated.title;
}

export function getIssueSpotlightHeadline(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''}`;

  if (/electrical\.pinout-mismatch/.test(ruleId)) {
    if (/DRV88|DRV887|TB6612|L298|bridge/i.test(text)) return t('VM/OUT 단자부터', 'Start with VM/OUT pins');
    if (/A4988|DRV8825|TB66|TB67|STEPPER/i.test(text)) return t('VMOT/VDD/GND부터', 'Start with VMOT/VDD/GND');
    if (/ULN2003|ULN2004|ULN2803|ULN2804/i.test(text)) return t('COM-OUT 순서부터', 'Start with COM-to-OUT order');
    return t('기준 핀부터 재정렬', 'Realign the anchor pins');
  }

  if (/inductive-flyback-missing|inductive-flyback-reversed/.test(ruleId)) return t('보호 루프 방향부터', 'Start with protection direction');
  if (/inductive-flyback-review|inductive-flyback-diode-headroom/.test(ruleId)) return t('다이오드 여유부터', 'Start with diode margin');
  if (/power-inductor-rating-review/.test(ruleId)) return t('Isat/Irms/DCR부터', 'Start with Isat/Irms/DCR');
  if (/resistor-overwatt|resistor-low-headroom/.test(ruleId)) return t('저항 정격 W부터', 'Start with resistor wattage');
  if (/capacitor-overvoltage|capacitor-voltage-headroom/.test(ruleId)) return t('커패시터 내압부터', 'Start with capacitor voltage');
  if (/power\.regulator-thermal|power\.regulator-headroom/.test(ruleId)) return t('VIN-VOUT·RθJA부터', 'Start with VIN-VOUT and RθJA');

  return t('가장 큰 위험지점부터', 'Start at the top risk point');
}

export function getIssueFocusChips(issue: ProjectAuditIssue, language: 'ko' | 'en'): IssueFocusChip[] {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''}`;
  const chips: IssueFocusChip[] = [];

  const pushChip = (key: string, ko: string, en: string) => {
    if (!chips.some(chip => chip.key === key)) chips.push({ key, label: t(ko, en) });
  };

  if (/inductive-flyback|motor|relay|solenoid|injector|coil|load/i.test(ruleId) || /모터|릴레이|솔레노이드|인젝터|코일|부하/i.test(text)) {
    pushChip('load-terminal', '부하 단자', 'Load terminal');
  }
  if (/power-inductor|regulator|rail|vin|vbatt|vmot|vcc|gnd|power/i.test(ruleId) || /VIN|VBAT|VMOT|VCC|GND|전원|로우사이드|하이사이드/i.test(text)) {
    pushChip('power-terminal', '전원 단자', 'Power terminal');
  }
  if (/headroom|overwatt|overvoltage|thermal|rating|pinout-mismatch/i.test(ruleId) || /RθJA|Tj max|Pd|Isat|Irms|DCR|서지 전류|반복 피크|정격|내압|권장 사용률/i.test(text)) {
    pushChip('datasheet-item', '데이터시트 항목', 'Datasheet item');
  }
  if (/i2c|pullup|impedance/i.test(ruleId) || /SDA|SCL|풀업|합성 임피던스/i.test(text)) {
    pushChip('bus-health', '버스 건전성', 'Bus integrity');
  }

  return chips;
}

export function buildIssuePriorityCue(targetItem: string | undefined, datasheetItem: string | undefined, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  if (targetItem && datasheetItem) return t(`1순위: ${targetItem} -> ${datasheetItem} 표`, `Priority: ${targetItem} -> ${datasheetItem} table`);
  if (targetItem) return t(`1순위: ${targetItem} 단자`, `Priority: ${targetItem} pin`);
  if (datasheetItem) return t(`1순위: ${datasheetItem} 표`, `Priority: ${datasheetItem} table`);
  return null;
}

export function getIssueReferenceHint(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''} ${issue.componentName ?? ''}`;

  if (/electrical\.pinout-mismatch/.test(ruleId)) {
    if (/DRV88|DRV887|TB6612|L298|bridge/i.test(text)) {
      return t(
        '브리지 드라이버라면 데이터시트의 Pin Configuration 또는 Terminal Functions 표를 열고, VM/VBAT 전원 단자, AIN/BIN 또는 IN1~IN4 입력 단자, AO/BO 또는 OUT 부하 단자 순서로 대조하세요.',
        'For bridge drivers, open the datasheet Pin Configuration or Terminal Functions table and compare VM/VBAT power pins, AIN/BIN or IN1~IN4 inputs, then AO/BO or OUT load terminals.',
      );
    }
    if (/A4988|DRV8825|TB66|TB67|STEPPER/i.test(text)) {
      return t(
        '스테퍼 드라이버라면 데이터시트의 Pin Assignment 표와 모듈 핀헤더 순서를 같이 보고, EN/STEP/DIR/RESET 제어 단자와 VMOT/VDD/GND 전원 단자를 먼저 대조하세요.',
        'For stepper drivers, compare the datasheet Pin Assignment table together with the module header order, checking EN/STEP/DIR/RESET control pins first, then VMOT/VDD/GND power pins.',
      );
    }
    if (/ULN2003|ULN2004|ULN2803|ULN2804/i.test(text)) {
      return t(
        '드라이버 어레이라면 데이터시트의 Pin Connection 표를 열고, IN 채널, OUT 채널, COM 플라이백 공통단, GND 단자를 순서대로 대조하세요.',
        'For driver arrays, open the datasheet Pin Connection table and compare IN channels, OUT channels, the COM flyback pin, and GND in order.',
      );
    }
    if (/IR210|IR211|IR218|gate driver/i.test(text)) {
      return t(
        '게이트 드라이버라면 데이터시트의 Functional Pin Description 표를 기준으로 HIN/LIN 입력, HO/LO 출력, VB/VS 부트스트랩 단자, VCC/GND 전원 단자를 같이 대조하세요.',
        'For gate drivers, use the datasheet Functional Pin Description table to compare HIN/LIN inputs, HO/LO outputs, VB/VS bootstrap pins, and the VCC/GND supply pins together.',
      );
    }
  }

  if (/inductive-flyback-review|inductive-flyback-missing|inductive-flyback-reversed|inductive-flyback-diode-headroom/.test(ruleId)) {
    return t(
      '부하 양단, 전원측 단자, 다이오드 애노드/캐소드 방향을 먼저 보고, 데이터시트에서는 Average Forward Current와 Surge Forward Current 항목을 같이 보세요.',
      'Check the load terminals, power-side node, and diode anode/cathode direction first, then review the datasheet Average Forward Current and Surge Forward Current specs.',
    );
  }
  if (/power-inductor-rating-review/.test(ruleId)) {
    return t(
      '인덕터가 걸린 전원 경로를 먼저 보고, 데이터시트에서는 Electrical Characteristics 표의 Isat, Irms, DCR 항목을 같이 확인하세요.',
      'Review the powered path around the inductor first, then check the Electrical Characteristics table for Isat, Irms, and DCR.',
    );
  }
  if (/resistor-overwatt|resistor-low-headroom/.test(ruleId)) {
    return t(
      '저항 양단 전압과 실제 소모 전력을 먼저 보고, 데이터시트나 패키지 정격표에서는 Power Rating과 Derating Curve를 같이 비교하세요.',
      'Check the voltage across the resistor and actual dissipation first, then compare the Power Rating and Derating Curve from the datasheet or package spec.',
    );
  }
  if (/capacitor-overvoltage|capacitor-voltage-headroom/.test(ruleId)) {
    return t(
      '커패시터 양단 전압과 극성을 먼저 보고, 데이터시트에서는 Rated Voltage와 DC Bias/Temperature 특성 또는 권장 여유를 같이 확인하세요.',
      'Check capacitor terminal voltage and polarity first, then review the Rated Voltage and DC Bias/Temperature characteristics or recommended margin in the datasheet.',
    );
  }
  if (/power\.regulator-thermal|power\.regulator-headroom/.test(ruleId)) {
    return t(
      '레귤레이터 입력/출력 단자와 부하 전류를 먼저 보고, 데이터시트에서는 Absolute Maximum Ratings와 Thermal Information 표의 Pd·RθJA·Tj max 항목을 같이 보세요.',
      'Review regulator input/output nodes and load current first, then check the Absolute Maximum Ratings and Thermal Information tables for Pd, RθJA, and Tj max.',
    );
  }

  return null;
}

export function getIssueChecklistSections(issue: ProjectAuditIssue, language: 'ko' | 'en'): IssueChecklistSection[] {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''} ${issue.componentName ?? ''}`;

  if (/electrical\.pinout-mismatch/.test(ruleId)) {
    if (/DRV88|DRV887|TB6612|L298|bridge/i.test(text)) {
      return [
        { key: 'pins', title: t('확인 단자', 'Check terminals'), items: ['VM/VBAT', 'AIN/BIN or IN1~IN4', 'AO/BO or OUT'] },
        { key: 'table', title: t('데이터시트 표', 'Datasheet table'), items: ['Pin Configuration', 'Terminal Functions'] },
      ];
    }
    if (/A4988|DRV8825|TB66|TB67|STEPPER/i.test(text)) {
      return [
        { key: 'pins', title: t('확인 단자', 'Check terminals'), items: ['EN / STEP / DIR / RESET', 'VMOT / VDD / GND', 'A+ / A- / B+ / B-'] },
        { key: 'table', title: t('데이터시트 표', 'Datasheet table'), items: ['Pin Assignment', 'Module header order'] },
      ];
    }
    if (/ULN2003|ULN2004|ULN2803|ULN2804/i.test(text)) {
      return [
        { key: 'pins', title: t('확인 단자', 'Check terminals'), items: ['IN channels', 'OUT channels', 'COM', 'GND'] },
        { key: 'table', title: t('데이터시트 표', 'Datasheet table'), items: ['Pin Connection', 'Truth Table'] },
      ];
    }
  }

  if (/inductive-flyback-review|inductive-flyback-missing|inductive-flyback-reversed|inductive-flyback-diode-headroom/.test(ruleId)) {
    return [
      { key: 'path', title: t('확인 경로', 'Check path'), items: [t('부하 양단', 'Load terminals'), t('전원측 단자', 'Power-side node'), t('애노드/캐소드 방향', 'Anode/cathode direction')] },
      { key: 'table', title: t('데이터시트 항목', 'Datasheet items'), items: ['Average Forward Current', 'Surge Forward Current'] },
    ];
  }
  if (/power-inductor-rating-review/.test(ruleId)) {
    return [
      { key: 'path', title: t('확인 경로', 'Check path'), items: ['VIN / VMOT / output path', t('실제 부하 전류 경로', 'Real load current path')] },
      { key: 'table', title: t('데이터시트 항목', 'Datasheet items'), items: ['Isat', 'Irms', 'DCR'] },
    ];
  }
  if (/resistor-overwatt|resistor-low-headroom/.test(ruleId)) {
    return [
      { key: 'path', title: t('확인 값', 'Check values'), items: [t('저항 양단 전압', 'Voltage across resistor'), t('실제 소모 전력', 'Real dissipation')] },
      { key: 'table', title: t('정격 근거', 'Rating basis'), items: ['Power Rating', 'Derating Curve'] },
    ];
  }
  if (/capacitor-overvoltage|capacitor-voltage-headroom/.test(ruleId)) {
    return [
      { key: 'path', title: t('확인 값', 'Check values'), items: [t('양단 전압', 'Terminal voltage'), t('극성 방향', 'Polarity direction')] },
      { key: 'table', title: t('정격 근거', 'Rating basis'), items: ['Rated Voltage', 'DC Bias / Temperature'] },
    ];
  }
  if (/power\.regulator-thermal|power\.regulator-headroom/.test(ruleId)) {
    return [
      { key: 'path', title: t('확인 단자', 'Check nodes'), items: ['VIN', 'VOUT', t('부하 전류', 'Load current')] },
      { key: 'table', title: t('데이터시트 표', 'Datasheet table'), items: ['Absolute Maximum Ratings', 'Thermal Information'] },
    ];
  }

  return [];
}

export function getIssueGroupMeta(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  if (ruleId === 'electrical.pinout-mismatch') {
    return {
      key: 'pinout',
      title: t('핀아웃 검토 묶음', 'Pinout review cluster'),
      description: t('심볼 핀과 풋프린트 기대 핀번호가 어긋난 항목들입니다.', 'These items show a mismatch between symbol pins and expected footprint pin numbers.'),
      nextFocus: t('1순위: 전원 단자 -> 제어 입력 순서로 대조', 'Priority: compare power pins, then control inputs'),
    };
  }
  if (/^netlist\.inductive-flyback/.test(ruleId)) {
    return {
      key: 'flyback',
      title: t('유도성 부하 보호 묶음', 'Inductive protection cluster'),
      description: t('모터·릴레이·코일 보호 경로를 다시 봐야 하는 항목들입니다.', 'These items need another look at motor, relay, or coil protection paths.'),
      nextFocus: t('1순위: 부하 양단 -> 다이오드 방향 확인', 'Priority: check load terminals, then diode direction'),
    };
  }
  if (
    ruleId === 'netlist.power-inductor-rating-review' ||
    ruleId === 'netlist.resistor-overwatt' ||
    ruleId === 'netlist.resistor-low-headroom' ||
    ruleId === 'netlist.capacitor-overvoltage' ||
    ruleId === 'netlist.capacitor-voltage-headroom' ||
    ruleId.startsWith('power.regulator-thermal') ||
    ruleId.startsWith('power.regulator-headroom')
  ) {
    return {
      key: 'derating',
      title: t('디레이팅 / 발열 묶음', 'Derating / thermal cluster'),
      description: t('정격 초과나 장기 신뢰성 여유 부족을 다시 봐야 하는 항목들입니다.', 'These items need another look at rating overruns or long-term reliability margin.'),
      nextFocus: t('1순위: 실제 전압·전류 -> 정격표 대조', 'Priority: compare real voltage/current against the rating table'),
    };
  }
  return null;
}

export function dedupeSummaryItems(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(item);
  }
  return result;
}

export function getIssueSpotlightReason(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''}`;

  if (/electrical\.pinout-mismatch/.test(ruleId)) {
    if (/IR210|IR211|IRS21|gate\s*driver/i.test(text)) {
      return t(
        '이 게이트 드라이버는 VB/VS/HO/LO가 부동 하이사이드 루프를 이루기 때문에, 먼저 VB·VS·COM·VCC 위치와 HO/LO 출력 방향을 데이터시트 핀 표에서 같이 확인하는 편이 가장 빠릅니다.',
        'This gate driver builds a floating high-side loop around VB, VS, HO, and LO, so the fastest start is to verify VB, VS, COM, and VCC together with the HO and LO output directions in the datasheet pin table.',
      );
    }
    if (/DRV88|DRV887|TB6612|L298|bridge/i.test(text)) {
      return t(
        '이 브리지 계열은 VM/VBAT 전원과 OUT1/OUT2 부하 단자가 전류 루프의 기준이라, 여기만 먼저 맞춰도 IN/EN 핀 정리가 한 번에 따라오는 경우가 많습니다.',
        'For this bridge family, the VM/VBAT rail and the OUT1/OUT2 load pins anchor the current loop, so once those are corrected the IN/EN pins often fall back into place immediately.',
      );
    }
    if (/A4988|DRV8825|TB66|TB67|STEPPER/i.test(text)) {
      return t(
        '이 스테퍼 계열은 VMOT/VDD/GND와 A+/A-/B+/B- 출력 순서가 기준이라, 전원과 코일 출력 순서만 바로잡아도 STEP/DIR/ENA 경고가 같이 풀리는 경우가 많습니다.',
        'For this stepper family, VMOT, VDD, GND, and the A+/A-/B+/B- output order are the anchors, so correcting the power and coil-output order usually clears the STEP/DIR/ENA warnings as well.',
      );
    }
    if (/ULN2003|ULN2004|ULN2803|ULN2804/i.test(text)) {
      return t(
        '이 어레이는 COM 플라이백 공통단이 출력 채널 보호의 기준이라, 데이터시트 Pin Connection 표에서 COM 단자와 OUT 채널 순서를 먼저 보는 편이 가장 빠릅니다.',
        'For this array, the COM flyback pin is the anchor for output protection, so the fastest start is to verify the COM pin and OUT-channel order in the datasheet Pin Connection table.',
      );
    }
    return t(
      '전원 단자나 제어 입력이 한 번 어긋나면 나머지 핀 비교도 연쇄적으로 틀어지기 쉬워, 핀표의 기준 단자부터 다시 맞추는 게 가장 빠릅니다.',
      'Once the power pins or control inputs drift, the rest of the pin comparison usually follows, so the quickest recovery is to realign the anchor pins from the pin table first.',
    );
  }

  if (/inductive-flyback-missing|inductive-flyback-reversed/.test(ruleId)) return t('이 부품이 바로 보호 경로의 기준점이라, 여기서 방향이나 연결이 틀리면 보호가 사실상 무효가 됩니다.', 'This part is the anchor of the protection loop, so if its direction or connection is wrong, the protection is effectively lost.');
  if (/inductive-flyback-review|inductive-flyback-diode-headroom/.test(ruleId)) return t('부분 보호나 작은 다이오드처럼 애매한 경우는 이 부품부터 보는 편이 가장 빨리 위험도를 좁힙니다.', 'For partial protection or small diodes, starting with this part is the fastest way to narrow the actual risk.');
  if (/power-inductor-rating-review/.test(ruleId)) return t('이 인덕터는 전부하 전류가 지나는 목이라, Isat·Irms·DCR 세 값만 먼저 봐도 위험도를 거의 바로 가를 수 있습니다.', 'This inductor carries the full load path, so checking Isat, Irms, and DCR first usually separates the real risk almost immediately.');
  if (/resistor-overwatt|resistor-low-headroom/.test(ruleId)) return t('이 저항은 가장 먼저 열 여유를 잃는 지점이라, 전압이 걸리는 양단과 데이터시트/규격의 정격 W 수치를 먼저 맞춰 보는 편이 가장 빠릅니다.', 'This resistor is the first place to lose thermal margin, so the fastest path is to check the two voltage-bearing terminals here against the part or package wattage rating first.');
  if (/capacitor-overvoltage|capacitor-voltage-headroom/.test(ruleId)) return t('이 커패시터는 내압 여유가 직접 보이는 부품이라, 연결된 전원 단자 전압과 데이터시트 Working Voltage 항목을 먼저 대조하면 스트레스를 가장 빨리 판단할 수 있습니다.', 'This capacitor exposes voltage margin directly, so comparing its connected rail voltage with the datasheet Working Voltage entry is the quickest way to judge stress.');
  if (/power\.regulator-thermal|power\.regulator-headroom/.test(ruleId)) return t('이 레귤레이터는 VIN-VOUT 차이와 열저항만 봐도 장기 신뢰성 위험이 바로 드러나는 경우가 많습니다.', 'For this regulator, the VIN-VOUT drop and thermal resistance often reveal the long-term reliability risk immediately.');
  if (/DRV|TB|ULN|IR21|A4988|DRV8825/i.test(text)) return t('이 묶음은 부하 단자와 로직 전원 단자만 먼저 구분해도 경고 절반 이상이 같이 풀리는 경우가 많습니다.', 'In this cluster, simply separating the load-side pins from the logic-supply pins often resolves most of the confusion immediately.');

  return t('이 부품이 현재 묶음에서 가장 먼저 눈에 띄는 위험 지점이라 여기부터 보는 편이 효율적입니다.', 'This part is the clearest early risk point in the cluster, so it is the most efficient place to start.');
}

export function getIssueSpotlightWhyShort(issue: ProjectAuditIssue, language: 'ko' | 'en') {
  const t = (ko: string, en: string) => pickLanguage(language, { ko, en });
  const ruleId = issue.ruleId ?? '';
  const text = `${issue.title} ${issue.message} ${issue.recommendation ?? ''}`;
  if (/electrical\.pinout-mismatch/.test(ruleId)) {
    if (/IR210|IR211|IRS21|gate\s*driver/i.test(text)) return t('이 계열은 VB/VS/HO/LO와 COM/VCC가 기준입니다.', 'For this family, VB/VS/HO/LO and COM/VCC are the anchors.');
    if (/DRV88|DRV887|TB6612|L298|bridge/i.test(text)) return t('이 계열은 VM/VBAT와 OUT 단자가 기준입니다.', 'For this family, VM/VBAT and the OUT pins are the anchors.');
    if (/A4988|DRV8825|TB66|TB67|STEPPER/i.test(text)) return t('이 계열은 VMOT/VDD/GND와 코일 출력 순서가 기준입니다.', 'For this family, VMOT/VDD/GND and the coil-output order are the anchors.');
    if (/ULN2003|ULN2004|ULN2803|ULN2804/i.test(text)) return t('이 계열은 COM과 OUT 채널 순서가 기준입니다.', 'For this family, COM and the OUT-channel order are the anchors.');
    return t('기준 핀 하나가 틀리면 나머지도 같이 어긋납니다.', 'Once one anchor pin is wrong, the rest usually drifts with it.');
  }
  if (/inductive-flyback-missing|inductive-flyback-reversed/.test(ruleId)) return t('여기 방향이 틀리면 보호가 사실상 사라집니다.', 'If this direction is wrong, the protection is effectively gone.');
  if (/inductive-flyback-review|inductive-flyback-diode-headroom/.test(ruleId)) return t('여기서 보호가 진짜 버티는지 갈립니다.', 'This is where you find out whether the protection is actually strong enough.');
  if (/power-inductor-rating-review/.test(ruleId)) return t('여긴 전부하 목이라 Isat·Irms·DCR이 바로 수명입니다.', 'This is the full-load choke point, so Isat, Irms, and DCR directly set lifetime.');
  if (/resistor-overwatt|resistor-low-headroom/.test(ruleId)) return t('전력 소모가 직접 걸려 가장 먼저 뜨거워지기 쉽습니다.', 'Direct power loss makes this one of the first parts to heat up.');
  if (/capacitor-overvoltage|capacitor-voltage-headroom/.test(ruleId)) return t('레일 전압이 그대로 걸려 내압 여유가 바로 드러납니다.', 'Rail voltage lands here directly, so voltage headroom shows up fast.');
  if (/power\.regulator-thermal|power\.regulator-headroom/.test(ruleId)) return t('VIN-VOUT와 Pd 여기가 수명을 가장 빨리 깎습니다.', 'VIN-VOUT and Pd are the fastest lifetime killers here.');
  return t('이 부품이 지금 묶음의 가장 빠른 시작점입니다.', 'This part is the fastest entry point into the cluster.');
}

export function applyButtonCodeRecommendation(generatedCode: string, signalPin: string, ruleId?: string) {
  if (!generatedCode.trim()) return { success: false, code: generatedCode, reason: '생성된 코드가 없습니다.' };
  const escapedPin = signalPin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (ruleId === 'formal.button-grounded-needs-input-pullup') {
    const inputRegex = new RegExp(`pinMode\\s*\\(\\s*${escapedPin}\\s*,\\s*INPUT\\s*\\)`, 'g');
    if (!inputRegex.test(generatedCode)) {
      return { success: false, code: generatedCode, reason: `${signalPin}의 INPUT 설정 줄을 찾지 못했습니다.` };
    }
    return { success: true, code: generatedCode.replace(inputRegex, `pinMode(${signalPin}, INPUT_PULLUP)`) };
  }

  if (ruleId === 'formal.button-vcc-incompatible-pullup') {
    const pullupRegex = new RegExp(`pinMode\\s*\\(\\s*${escapedPin}\\s*,\\s*INPUT_PULLUP\\s*\\)`, 'g');
    if (!pullupRegex.test(generatedCode)) {
      return { success: false, code: generatedCode, reason: `${signalPin}의 INPUT_PULLUP 설정 줄을 찾지 못했습니다.` };
    }
    return { success: true, code: generatedCode.replace(pullupRegex, `pinMode(${signalPin}, INPUT)`) };
  }

  return { success: false, code: generatedCode, reason: '지원하지 않는 버튼 코드 보정 규칙입니다.' };
}
