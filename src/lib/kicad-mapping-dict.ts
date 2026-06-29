import type { KiCadMappingConfidence } from '@/types';

export interface KiCadRefDesMappingRule {
  prefixes: string[];
  templateId?: string;
  confidence: KiCadMappingConfidence;
  matchedBy: string;
}

export interface KiCadRegexMappingRule {
  regex: RegExp;
  templateId: string;
  confidence: KiCadMappingConfidence;
  matchedBy: string;
}

export const KICAD_REFDES_RULES: KiCadRefDesMappingRule[] = [
  { prefixes: ['LED'], templateId: 'tpl_led', confidence: 'high', matchedBy: 'reference prefix LED' },
  { prefixes: ['R'], templateId: 'tpl_resistor', confidence: 'high', matchedBy: 'reference prefix R' },
  { prefixes: ['C'], templateId: 'tpl_capacitor', confidence: 'high', matchedBy: 'reference prefix C' },
  { prefixes: ['L'], templateId: 'tpl_inductor', confidence: 'high', matchedBy: 'reference prefix L' },
  { prefixes: ['D'], templateId: 'tpl_diode', confidence: 'medium', matchedBy: 'reference prefix D' },
  { prefixes: ['Q'], templateId: 'tpl_transistor_npn', confidence: 'medium', matchedBy: 'reference prefix Q' },
  { prefixes: ['BZ'], templateId: 'tpl_buzzer', confidence: 'medium', matchedBy: 'reference prefix BZ' },
  { prefixes: ['K'], templateId: 'tpl_relay', confidence: 'medium', matchedBy: 'reference prefix K' },
  { prefixes: ['BT', 'BAT'], templateId: 'tpl_external_power', confidence: 'medium', matchedBy: 'reference prefix BT/BAT' },
  { prefixes: ['J', 'P'], confidence: 'low', matchedBy: 'reference prefix connector' },
];

export const KICAD_VALUE_REGEX_RULES: KiCadRegexMappingRule[] = [
  { regex: /(^|[^a-z0-9])(ao3400a)([^a-z0-9]|$)/i, templateId: 'tpl_transistor_npn', confidence: 'high', matchedBy: 'value regex AO3400A' },
  { regex: /(^|[^a-z0-9])(irfr7440)([^a-z0-9]|$)/i, templateId: 'tpl_transistor_npn', confidence: 'high', matchedBy: 'value regex IRFR7440' },
  { regex: /(^|[^a-z0-9])(1n5819(ws)?)([^a-z0-9]|$)/i, templateId: 'tpl_diode', confidence: 'high', matchedBy: 'value regex 1N5819WS' },
  { regex: /(^|[^a-z0-9])(schottky)([^a-z0-9]|$)/i, templateId: 'tpl_diode', confidence: 'high', matchedBy: 'value regex schottky diode' },
  { regex: /(^|[^a-z0-9])(mosfet|n-?mos|p-?mos|n-?channel mosfet|p-?channel mosfet)([^a-z0-9]|$)/i, templateId: 'tpl_transistor_npn', confidence: 'high', matchedBy: 'value regex MOSFET family' },
  { regex: /(^|[^a-z0-9])(dht11)([^a-z0-9]|$)/i, templateId: 'tpl_dht11', confidence: 'high', matchedBy: 'value regex DHT11' },
  { regex: /(^|[^a-z0-9])(dht22|am2302)([^a-z0-9]|$)/i, templateId: 'tpl_dht22', confidence: 'high', matchedBy: 'value regex DHT22' },
  { regex: /(^|[^a-z0-9])(mfrc522|rc522)([^a-z0-9]|$)/i, templateId: 'tpl_rfid_rc522', confidence: 'high', matchedBy: 'value regex RC522' },
  { regex: /(^|[^a-z0-9])(hc-?05|bluetooth)([^a-z0-9]|$)/i, templateId: 'tpl_bluetooth_hc05', confidence: 'high', matchedBy: 'value regex HC-05' },
  { regex: /(^|[^a-z0-9])(ssd1306|sh1106|oled)([^a-z0-9]|$)/i, templateId: 'tpl_oled', confidence: 'high', matchedBy: 'value regex OLED' },
  { regex: /(^|[^a-z0-9])(lcd.?1602|1602)([^a-z0-9]|$)/i, templateId: 'tpl_lcd1602', confidence: 'high', matchedBy: 'value regex LCD1602' },
  { regex: /(^|[^a-z0-9])(tm1637|7.?seg|7.?segment)([^a-z0-9]|$)/i, templateId: 'tpl_7segment', confidence: 'high', matchedBy: 'value regex TM1637' },
  { regex: /(^|[^a-z0-9])(mq-?2)([^a-z0-9]|$)/i, templateId: 'tpl_gas_mq2', confidence: 'high', matchedBy: 'value regex MQ-2' },
  { regex: /(^|[^a-z0-9])(servo|sg90|mg90)([^a-z0-9]|$)/i, templateId: 'tpl_servo', confidence: 'medium', matchedBy: 'value regex servo' },
  { regex: /(^|[^a-z0-9])(pir|hc-?sr501)([^a-z0-9]|$)/i, templateId: 'tpl_pir', confidence: 'medium', matchedBy: 'value regex PIR' },
  { regex: /(^|[^a-z0-9])(hc-?sr04|ultrasonic)([^a-z0-9]|$)/i, templateId: 'tpl_ultrasonic', confidence: 'medium', matchedBy: 'value regex HC-SR04' },
  { regex: /(^|[^a-z0-9])(button|switch|sw_?push)([^a-z0-9]|$)/i, templateId: 'tpl_button', confidence: 'medium', matchedBy: 'value regex button' },
  { regex: /(^|[^a-z0-9])(led_rgb|rgb.?led)([^a-z0-9]|$)/i, templateId: 'tpl_rgb_led', confidence: 'medium', matchedBy: 'value regex RGB LED' },
  { regex: /(^|[^a-z0-9])(led)([^a-z0-9]|$)/i, templateId: 'tpl_led', confidence: 'medium', matchedBy: 'value regex LED' },
  { regex: /(^|[^a-z0-9])(lm358)([^a-z0-9]|$)/i, templateId: 'tpl_op_amp_buffer', confidence: 'medium', matchedBy: 'value regex LM358' },
  { regex: /(^|[^a-z0-9])(ads1115)([^a-z0-9]|$)/i, templateId: 'tpl_adc_module', confidence: 'medium', matchedBy: 'value regex ADS1115' },
  { regex: /(^|[^a-z0-9])(uln2003)([^a-z0-9]|$)/i, templateId: 'tpl_driver_ic', confidence: 'medium', matchedBy: 'value regex ULN2003' },
  { regex: /(^|[^a-z0-9])(bss138|level.?shift)([^a-z0-9]|$)/i, templateId: 'tpl_level_shifter', confidence: 'medium', matchedBy: 'value regex level shifter' },
  { regex: /(^|[^a-z0-9])(barrel|jack|battery)([^a-z0-9]|$)/i, templateId: 'tpl_external_power', confidence: 'medium', matchedBy: 'value regex external power' },
];

export const KICAD_FOOTPRINT_REGEX_RULES: KiCadRegexMappingRule[] = [
  { regex: /(mfrc522|rc522)/i, templateId: 'tpl_rfid_rc522', confidence: 'high', matchedBy: 'footprint regex RC522' },
  { regex: /(ssd1306|oled)/i, templateId: 'tpl_oled', confidence: 'high', matchedBy: 'footprint regex OLED' },
  { regex: /(tm1637|7seg|7segment)/i, templateId: 'tpl_7segment', confidence: 'medium', matchedBy: 'footprint regex TM1637' },
  { regex: /(lcd.?1602|1602)/i, templateId: 'tpl_lcd1602', confidence: 'medium', matchedBy: 'footprint regex LCD1602' },
  { regex: /(hc-?05|bluetooth)/i, templateId: 'tpl_bluetooth_hc05', confidence: 'medium', matchedBy: 'footprint regex HC-05' },
  { regex: /(servo|sg90|mg90)/i, templateId: 'tpl_servo', confidence: 'medium', matchedBy: 'footprint regex servo' },
];
