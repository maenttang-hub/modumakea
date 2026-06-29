import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCatalogSearchStrings,
  getLocalizedDatasheetStatusLabel,
  getLocalizedDesignWarning,
  getLocalizedTemplateDescription,
  getLocalizedTemplateName,
} from '@/lib/catalog-i18n';

test('catalog i18n localizes template name and description for english UI', () => {
  const template = {
    id: 'tpl_dht11',
    name: '온습도 센서',
    description: 'DHT11: 온도 및 습도 측정 센서',
  };

  assert.equal(getLocalizedTemplateName(template, 'en'), 'Temp/Humidity Sensor');
  assert.equal(getLocalizedTemplateDescription(template, 'en'), 'DHT11 temperature and humidity sensor.');
});

test('catalog i18n localizes datasheet status and design warnings', () => {
  assert.equal(getLocalizedDatasheetStatusLabel('official-partial', 'en'), 'Partial');

  const warning = getLocalizedDesignWarning(
    {
      severity: 'warning',
      title: '풀업 저항 필요',
      message: '1-Wire 버스 특성상 데이터 라인 풀업 저항 유무를 배선 단계에서 함께 확인해야 합니다.',
      titleKey: 'design.onewire-pullup',
      messageKey: 'design.onewire-pullup',
    },
    'en'
  );

  assert.equal(warning.title, 'Pull-up Required');
  assert.match(warning.message, /1-Wire bus/i);
});

test('catalog search strings include both original and localized values', () => {
  const values = getCatalogSearchStrings({
    id: 'tpl_resistor',
    name: '저항',
    description: '범용 저항: LED 전류 제한, 풀업/풀다운, 분압용',
  });

  assert.ok(values.includes('저항'));
  assert.ok(values.includes('Resistor'));
  assert.ok(values.some(value => value.includes('LED current limiting')));
});
