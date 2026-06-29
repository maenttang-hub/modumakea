/**
 * constants/custom-component-library.ts
 *
 * 사용자가 직접 추가하는 부품 라이브러리 영역입니다.
 * 새 부품은 ComponentTemplate 형식으로 CUSTOM_COMPONENT_TEMPLATES 배열에 추가하면
 * 사이드바, 시뮬레이션 모델, 회로도 심볼, PCB 풋프린트 흐름에 함께 등록됩니다.
 */

import type { ComponentTemplate } from '@/types';

export const CUSTOM_COMPONENT_TEMPLATES: ComponentTemplate[] = [
  // 예시:
  // {
  //   id: 'custom_led_bar_10',
  //   name: '10칸 LED 바',
  //   category: 'ACTUATOR',
  //   description: '10 segment LED bar graph module',
  //   icon: 'BarChart3',
  //   compatibleVoltage: 'BOTH',
  //   librarySource: 'custom',
  //   requiredPins: [
  //     { name: 'GND', allowedTypes: ['GND'] },
  //     { name: 'D1', allowedTypes: ['DIGITAL', 'PWM'] },
  //     { name: 'D2', allowedTypes: ['DIGITAL', 'PWM'] },
  //   ],
  //   simulation: { type: 'actuator', controllable: true },
  //   schematic: { symbol: 'led_bar_10', referencePrefix: 'D' },
  //   pcb: {
  //     footprint: 'Display:LED_Bar_10Segment',
  //     packageType: 'THT',
  //     manufacturable: true,
  //   },
  //   design: {
  //     datasheetStatus: 'official-complete',
  //     preferredInterface: 'GPIO',
  //     datasheetSources: [
  //       { label: 'Vendor Datasheet', url: 'https://example.com/datasheet.pdf' },
  //     ],
  //     warnings: [
  //       {
  //         severity: 'info',
  //         title: '전류 제한 확인',
  //         message: 'LED 바 그래프는 직결 대신 저항 배열 사용 여부를 먼저 확인하세요.',
  //       },
  //     ],
  //   },
  // },
];
