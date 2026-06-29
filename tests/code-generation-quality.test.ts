import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewGeneratedCodeQuality } from '@/lib/code-generation-quality';
import type { AICodeGenerationPayload } from '@/types';

const basePayload: AICodeGenerationPayload = {
  boardId: 'uno',
  boardName: 'Arduino UNO',
  chipset: 'ATmega328P',
  targetLanguage: 'C++',
  connectedComponents: [
    {
      templateId: 'tpl_dht11',
      componentName: '온습도 센서',
      pinConnections: {
        DATA: 'D2',
        VCC: '5V',
        GND: 'GND',
      },
      libraryIncludes: ['DHT.h'],
    },
  ],
};

test('code generation quality flags missing setup/loop for Arduino sketches', async () => {
  const review = await reviewGeneratedCodeQuality(basePayload, 'int main() { return 0; }');

  assert.equal(review.acceptable, false);
  assert.ok(review.issues.some(issue => issue.ruleId === 'code.missing-arduino-entrypoints'));
});

test('code generation quality accepts a simple routed DHT sketch', async () => {
  const review = await reviewGeneratedCodeQuality(
    basePayload,
    `#include <DHT.h>
#define DHTPIN 2
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  Serial.println(dht.readTemperature());
}`
  );

  assert.equal(review.errorCount, 0);
  assert.equal(review.acceptable, true);
});
