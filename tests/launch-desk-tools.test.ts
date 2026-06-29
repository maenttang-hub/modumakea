import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assessLaunchReadiness,
  draftChannelCopy,
  extractLaunchTasks,
  generateOwnerChecklists,
  identifyMissingDetails,
} from '@/lib/launch-desk/planning'
import type { LaunchDeskInput } from '@/lib/launch-desk/types'

const input: LaunchDeskInput = {
  productBrief:
    'Launch a new self-serve incident timeline so platform teams can share outage updates and resolutions with customers.',
  audience: 'Platform engineering leaders at mid-market SaaS companies',
  launchDate: '2026-07-30',
  constraints:
    'One sprint remains, legal review is required, and support needs rollback notes before launch.',
  availableAssets: 'Demo, FAQ draft, screenshots, release notes draft, launch deck',
  channels: ['Email', 'Release notes', 'LinkedIn'],
  team: ['Avery (PM)', 'Sam (Eng)', 'Marco (Marketing)'],
}

test('extractLaunchTasks returns prioritized launch work', () => {
  const tasks = extractLaunchTasks(input)

  assert.ok(tasks.length >= 3)
  assert.equal(tasks[0]?.priority, 'P0')
  assert.ok(tasks.every(task => task.owner.length > 0))
})

test('assessLaunchReadiness returns rubric and risks', () => {
  const result = assessLaunchReadiness(input)

  assert.equal(result.rubric.length, 4)
  assert.ok(result.readinessScore > 0)
  assert.ok(result.risks.length >= 3)
})

test('generateOwnerChecklists groups by owner', () => {
  const tasks = extractLaunchTasks(input)
  const checklists = generateOwnerChecklists(input, tasks)

  assert.ok(checklists.length >= 2)
  assert.ok(checklists[0]?.checklist.some(item => item.includes('Confirm scope')))
})

test('draftChannelCopy aligns suggestions to channels', () => {
  const copy = draftChannelCopy(input)

  assert.equal(copy.length, input.channels.length)
  assert.ok(copy[0]?.copy.includes(input.launchDate))
})

test('identifyMissingDetails asks follow-up questions for sparse inputs', () => {
  const sparse: LaunchDeskInput = {
    ...input,
    audience: 'Users',
    availableAssets: 'Notes',
    constraints: 'Need to ship quickly',
    productBrief: 'Launch a feature fast for customers.',
  }

  const questions = identifyMissingDetails(sparse)
  assert.ok(questions.length >= 2)
})

