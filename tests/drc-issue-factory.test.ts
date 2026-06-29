import test from 'node:test';
import assert from 'node:assert/strict';

import { createDrcIssue } from '@/lib/drc-issue-factory';
import { getRuleConfidencePolicy, RULE_CONFIDENCE_POLICIES } from '@/lib/drc-issue-policy';
import type { ProjectAuditIssueEvidenceChecker, RuleConfidencePolicy } from '@/types';

function buildPolicyCompliantIssue(policy: RuleConfidencePolicy) {
  const observedFactsCount = Math.max(policy.evidenceRequirements.observedFactsMin ?? 0, 1);
  const checkedBy: ProjectAuditIssueEvidenceChecker[] = ['netlist'];

  return {
    code: policy.ruleId,
    ruleId: policy.ruleId,
    severity: policy.defaultSeverity,
    confidence: policy.defaultConfidence,
    componentName: 'Fixture Component',
    title: `Fixture ${policy.ruleId}`,
    message: `Fixture message for ${policy.ruleId}`,
    recommendation: `Fixture recommendation for ${policy.ruleId}`,
    visualTargets: policy.evidenceRequirements.requireVisualTargets
      ? {
          componentIds: ['fixture-component'],
          netIds: ['fixture-net'],
        }
      : undefined,
    evidence: {
      confidence: policy.defaultConfidence,
      evidenceSummary: `Fixture evidence for ${policy.ruleId}`,
      observedFacts: Array.from({ length: observedFactsCount }, (_, index) => `Observed fact ${index + 1}`),
      assumptions: policy.evidenceRequirements.requireAssumptions ? ['Fixture assumption'] : [],
      checkedBy,
      affectedComponents: ['fixture-component'],
      affectedNets: ['fixture-net'],
      howToVerify: policy.evidenceRequirements.requireHowToVerify ? 'Fixture verification step' : undefined,
    },
  };
}

test('rule confidence policy registry exposes critical rule defaults', () => {
  const policy = getRuleConfidencePolicy('electrical.logic-level.overvoltage');

  assert.ok(policy);
  assert.equal(policy?.defaultConfidence, 'confirmed');
  assert.equal(policy?.falsePositiveRisk, 'low');
  assert.equal(policy?.evidenceRequirements.requireVisualTargets, true);
});

test('createDrcIssue applies policy defaults and enforces confirmed visual targets', () => {
  assert.throws(
    () =>
      createDrcIssue({
        code: 'netlist.power-short.direct',
        ruleId: 'netlist.power-short.direct',
        params: {
          netId: 'NET_SHORT',
          voltages: ['5V'],
        },
        evidence: {
          confidence: 'confirmed',
          evidenceSummary: 'GND와 5V가 직접 연결된 것으로 보입니다.',
          observedFacts: ['Affected net: NET_SHORT', 'Power nodes found: 5V'],
          assumptions: [],
          checkedBy: ['netlist'],
          affectedNets: ['NET_SHORT'],
          howToVerify: '회로 연결을 다시 확인하세요.',
        },
      }),
    /requires visualTargets/
  );
});

test('createDrcIssue preserves migrated critical rule semantics', () => {
  const issue = createDrcIssue({
    code: 'electrical.logic-level.overvoltage',
    ruleId: 'electrical.logic-level.overvoltage',
    componentName: 'HC-06',
    sourceLabel: 'official datasheet',
    sourceUrl: 'https://example.com/hc06.pdf',
    params: {
      componentName: 'HC-06',
      pinName: 'RX',
      inputTolerance: 3.6,
      boardPin: 'D1',
      boardVoltage: 5,
      mitigationRecommendation: '레벨 시프터를 추가하세요.',
      mitigationRecommendationEn: 'Add a level shifter.',
    },
    visualTargets: {
      componentIds: ['bt-1'],
    },
    evidence: {
      confidence: 'confirmed',
      evidenceSummary: 'HC-06의 RX 입력 허용치보다 보드 신호 전압이 높습니다.',
      observedFacts: [
        'Affected component: HC-06',
        'Affected pin: RX',
        'Board pin: D1',
        'Board nominal voltage: 5V',
        'Input tolerance: 3.6V',
      ],
      assumptions: [],
      checkedBy: ['datasheet-rule'],
      affectedComponents: ['bt-1'],
      howToVerify: '레벨 시프터를 추가하세요.',
    },
  });

  assert.equal(issue.confidence, 'confirmed');
  assert.equal(issue.evidence?.confidence, 'confirmed');
  assert.deepEqual(issue.visualTargets?.componentIds, ['bt-1']);
});

test('all registered rule confidence policies stay internally consistent', () => {
  for (const [ruleId, policy] of Object.entries(RULE_CONFIDENCE_POLICIES)) {
    assert.equal(policy.ruleId, ruleId);

    if (policy.defaultConfidence === 'confirmed') {
      assert.equal(
        policy.evidenceRequirements.requireVisualTargets,
        true,
        `${ruleId} confirmed policy must require visualTargets`
      );
      assert.ok(
        (policy.evidenceRequirements.observedFactsMin ?? 0) >= 1,
        `${ruleId} confirmed policy must require observedFacts`
      );
    }

    if (policy.defaultConfidence === 'needs-review') {
      assert.equal(
        policy.evidenceRequirements.requireAssumptions,
        true,
        `${ruleId} needs-review policy must require assumptions`
      );
      assert.equal(
        policy.evidenceRequirements.requireHowToVerify,
        true,
        `${ruleId} needs-review policy must require howToVerify`
      );
    }
  }
});

test('all registered policies can produce a contract-compliant issue through createDrcIssue', () => {
  for (const policy of Object.values(RULE_CONFIDENCE_POLICIES)) {
    const issue = createDrcIssue(buildPolicyCompliantIssue(policy));
    assert.equal(issue.ruleId, policy.ruleId);
    assert.equal(issue.confidence, policy.defaultConfidence);
    assert.equal(issue.evidence?.confidence, policy.defaultConfidence);
  }
});

test('needs-review policies reject missing assumptions and verification steps', () => {
  for (const policy of Object.values(RULE_CONFIDENCE_POLICIES).filter(
    candidate => candidate.defaultConfidence === 'needs-review'
  )) {
    const compliant = buildPolicyCompliantIssue(policy);
    assert.throws(
      () =>
        createDrcIssue({
          ...compliant,
          evidence: {
            ...compliant.evidence,
            assumptions: [],
            howToVerify: undefined,
          },
        }),
      /requires assumptions|requires howToVerify/,
      `expected ${policy.ruleId} to reject missing needs-review contract fields`
    );
  }
});
