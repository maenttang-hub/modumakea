import { getLocalizedTemplateDescription, getLocalizedTemplateName } from '@/lib/catalog-i18n';
import type { AppLanguage, ComponentTemplate, RequiredPin } from '@/types';

function formatAllowedTypes(pin: RequiredPin) {
  if (pin.allowedTypes.includes('POWER')) {
    return '전원 입력';
  }

  if (pin.allowedTypes.includes('GND')) {
    return '접지';
  }

  return pin.allowedTypes.join('/');
}

export function formatRequiredPinSummary(requiredPins: RequiredPin[]) {
  if (requiredPins.length === 0) {
    return '배선 핀 없음 (BOM/검토용 보조 부품)';
  }

  return requiredPins
    .map(pin => `${pin.name} (${formatAllowedTypes(pin)})`)
    .join(', ');
}

export function buildComponentTooltip(template: ComponentTemplate, language: AppLanguage = 'ko') {
  const lines = [
    `${getLocalizedTemplateName(template, language)}`,
    getLocalizedTemplateDescription(template, language),
  ];

  if (template.requiredPins.length > 0) {
    lines.push(`핀: ${formatRequiredPinSummary(template.requiredPins)}`);
  }

  if (template.compatibleVoltage !== 'BOTH') {
    lines.push(`전압: ${template.compatibleVoltage}`);
  } else {
    lines.push('전압: 3.3V / 5V 호환');
  }

  return lines.join('\n');
}
