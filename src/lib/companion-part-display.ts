import { getTemplateById } from '@/constants/component-templates';
import { resolvePlacedComponentValue } from '@/store/store-helpers';
import type { CompanionPartSuggestion } from '@/types';

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function getCompanionDisplayValue(
  item: Pick<CompanionPartSuggestion, 'kind' | 'value'>
) {
  if (!item.value) {
    return undefined;
  }

  if (item.kind !== 'resistor') {
    return item.value;
  }

  const resistorTemplate = getTemplateById('tpl_resistor');
  if (!resistorTemplate) {
    return item.value;
  }

  return resolvePlacedComponentValue(resistorTemplate, item.value);
}

export function getCompanionOriginalValueRange(
  item: Pick<CompanionPartSuggestion, 'value'>,
  displayValue?: string
) {
  if (!item.value || !displayValue) {
    return undefined;
  }

  return item.value.trim() === displayValue.trim() ? undefined : item.value;
}

export function getCompanionValueSelectionHint(
  item: Pick<CompanionPartSuggestion, 'kind' | 'label' | 'value'>
) {
  if (item.kind !== 'resistor') {
    return undefined;
  }

  const displayValue = getCompanionDisplayValue(item);
  if (!displayValue) {
    return undefined;
  }

  const label = normalizeText(item.label);

  if (label.includes('led') || label.includes('rgb')) {
    return `${displayValue}를 기본 시작값으로 잡았습니다. GPIO와 LED를 무리 없이 보호하기 쉬운 가장 무난한 전류 제한값입니다.`;
  }

  if (label.includes('버튼') || label.includes('pullup') || label.includes('pulldown')) {
    return `${displayValue}를 기본값으로 잡았습니다. 입력을 안정적으로 고정하면서 버튼이 눌릴 때 불필요한 전류도 거의 늘리지 않는 보편적인 값입니다.`;
  }

  if (label.includes('i2c')) {
    return `${displayValue}를 버스 기본 시작값으로 골랐습니다. 짧은 배선과 소수 장치 구성에서 가장 무난하게 동작하는 대표 풀업값입니다.`;
  }

  if (label.includes('1-wire') || label.includes('싱글버스') || label.includes('data')) {
    return `${displayValue}를 기본 풀업값으로 잡았습니다. 단일 버스 센서 라인을 안정적으로 끌어올릴 때 가장 흔히 쓰는 시작값입니다.`;
  }

  return item.value && item.value.trim() !== displayValue.trim()
    ? `${item.value} 범위 중 기본 시작값으로 ${displayValue}를 선택했습니다.`
    : `${displayValue}를 기본 시작값으로 사용합니다.`;
}

export function getCompanionAutocorrectLabel(
  item: Pick<CompanionPartSuggestion, 'label' | 'value' | 'quantity' | 'kind'>
) {
  const displayValue = getCompanionDisplayValue(item);
  const quantityLabel = item.quantity > 1 ? ` ${item.quantity}개` : '';
  return `${item.label}${displayValue ? ` ${displayValue}` : ''}${quantityLabel}`.trim();
}

export function getCompanionAutocorrectMessage(
  item: Pick<CompanionPartSuggestion, 'kind' | 'label' | 'value' | 'quantity'>
) {
  const summaryLabel = getCompanionAutocorrectLabel(item);
  const selectionHint = getCompanionValueSelectionHint(item);
  return selectionHint
    ? `자동으로 ${summaryLabel}를 추가했습니다. ${selectionHint}`
    : `자동으로 ${summaryLabel}를 추가했습니다.`;
}

export function buildCompanionAutocorrectSummary(
  items: Array<Pick<CompanionPartSuggestion, 'kind' | 'label' | 'value' | 'quantity'>>,
  options?: { prefixComponentName?: string }
) {
  if (items.length === 0) {
    return '';
  }

  const body = items.map(item => getCompanionAutocorrectMessage(item)).join(' / ');
  if (!options?.prefixComponentName) {
    return body;
  }

  return `${options.prefixComponentName}: ${body}`;
}
