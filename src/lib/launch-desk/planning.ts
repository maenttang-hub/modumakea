import type {
  ChannelCopy,
  LaunchDeskInput,
  LaunchTask,
  OwnerChecklist,
  ReadinessCheck,
  RiskEntry,
} from '@/lib/launch-desk/types'

const readinessRubric = [
  {
    area: 'Scope clarity',
    keywords: ['goal', 'launch', 'brief', 'value', 'problem', 'metric'],
    successSignal: 'The launch goal and user value are explicit.',
  },
  {
    area: 'Audience alignment',
    keywords: ['user', 'audience', 'persona', 'team', 'segment'],
    successSignal: 'The team knows who the launch is for and why they will care.',
  },
  {
    area: 'Operational readiness',
    keywords: ['owner', 'support', 'on-call', 'rollback', 'release', 'monitor'],
    successSignal: 'Owners, support motions, and release safeguards are clear.',
  },
  {
    area: 'Asset coverage',
    keywords: ['copy', 'faq', 'demo', 'landing', 'email', 'asset', 'screenshot'],
    successSignal: 'The assets needed to ship are already named or in progress.',
  },
]

const ownerFallbacks = ['PM', 'Engineering', 'Design', 'Marketing', 'Support', 'Data']

function summarizeText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}

function splitIdeas(value: string) {
  return value
    .split(/\n|,|•|;|\/+/)
    .map(item => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function chooseOwner(team: string[], index: number) {
  return team[index % team.length] ?? ownerFallbacks[index % ownerFallbacks.length] ?? 'Owner'
}

export function identifyMissingDetails(input: LaunchDeskInput) {
  const brief = input.productBrief.toLowerCase()
  const assets = input.availableAssets.toLowerCase()
  const constraints = input.constraints.toLowerCase()
  const missing: string[] = []

  if (!/\b(metric|success|kpi|goal|target)\b/.test(brief)) {
    missing.push('What metric will define a successful launch week?')
  }

  if (!/\b(risk|depend|approval|legal|security|review|rollback)\b/.test(constraints)) {
    missing.push('Which approval, dependency, or rollback constraints could delay the release?')
  }

  if (!/\b(email|landing|demo|faq|sales|social|blog|docs|screenshot)\b/.test(assets)) {
    missing.push('Which launch assets already exist versus still need to be created?')
  }

  if (!/\b(region|segment|customer|developer|admin|buyer|user)\b/.test(input.audience.toLowerCase())) {
    missing.push('Which exact customer segment is the primary audience for day one?')
  }

  return missing
}

export function extractLaunchTasks(input: LaunchDeskInput): LaunchTask[] {
  const briefIdeas = splitIdeas(input.productBrief)
  const assetIdeas = splitIdeas(input.availableAssets)
  const constraintIdeas = splitIdeas(input.constraints)
  const ideas = [...briefIdeas, ...assetIdeas, ...constraintIdeas].slice(0, 10)

  const seedTasks = ideas.length > 0 ? ideas : ['Clarify release scope', 'Prepare assets', 'Confirm launch approvals']

  return seedTasks.slice(0, 7).map((idea, index) => ({
    id: `task-${index + 1}`,
    title:
      idea.length > 52
        ? summarizeText(idea, 52)
        : idea.charAt(0).toUpperCase() + idea.slice(1),
    priority: index < 2 ? 'P0' : index < 5 ? 'P1' : 'P2',
    owner: chooseOwner(input.team, index),
    dueWindow:
      index < 2
        ? 'This week'
        : index < 5
          ? 'Before launch freeze'
          : 'Before post-launch review',
    rationale:
      index < 2
        ? 'This item directly affects launch readiness or customer-facing quality.'
        : 'This item reduces risk or makes launch execution smoother.',
    dependencies: constraintIdeas.slice(0, 2).map(item => summarizeText(item, 60)),
  }))
}

export function assessLaunchReadiness(input: LaunchDeskInput) {
  const searchable = `${input.productBrief} ${input.audience} ${input.constraints} ${input.availableAssets}`.toLowerCase()

  const rubric: ReadinessCheck[] = readinessRubric.map(item => {
    const hits = item.keywords.filter(keyword => searchable.includes(keyword)).length
    const score = Math.min(100, 35 + hits * 13)
    return {
      area: item.area,
      score,
      status: score >= 74 ? 'ready' : score >= 56 ? 'watch' : 'blocked',
      notes: hits > 0 ? item.successSignal : `More detail needed. ${item.successSignal}`,
    }
  })

  const risks: RiskEntry[] = [
    {
      id: 'risk-1',
      risk: 'Critical scope or success criteria are still fuzzy.',
      severity: rubric[0]?.score && rubric[0].score >= 70 ? 'medium' : 'high',
      owner: chooseOwner(input.team, 0),
      mitigation: 'Lock a one-sentence launch goal and success metric before launch freeze.',
      trigger: 'Conflicting priorities or last-minute feature additions.',
    },
    {
      id: 'risk-2',
      risk: 'Launch dependencies or approvals could slip the date.',
      severity: /\b(legal|security|approval|dependency|vendor)\b/i.test(input.constraints) ? 'high' : 'medium',
      owner: chooseOwner(input.team, 1),
      mitigation: 'Track approvals and external dependencies in a daily checkpoint.',
      trigger: 'Any unresolved blocker within five business days of launch.',
    },
    {
      id: 'risk-3',
      risk: 'Audience-facing assets may not fully support the rollout.',
      severity: /\b(docs|faq|landing|email|demo)\b/i.test(input.availableAssets) ? 'medium' : 'high',
      owner: chooseOwner(input.team, 2),
      mitigation: 'Confirm copy, FAQ, demo flow, and support notes are reviewed together.',
      trigger: 'Asset review misses or channel owners cannot publish on time.',
    },
  ]

  return {
    rubric,
    readinessScore: Math.round(rubric.reduce((sum, item) => sum + item.score, 0) / rubric.length),
    risks,
  }
}

export function generateOwnerChecklists(input: LaunchDeskInput, tasks: LaunchTask[]): OwnerChecklist[] {
  const byOwner = new Map<string, string[]>()

  for (const task of tasks) {
    const items = byOwner.get(task.owner) ?? []
    items.push(`${task.title} (${task.priority}, ${task.dueWindow})`)
    byOwner.set(task.owner, items)
  }

  return [...byOwner.entries()].map(([owner, checklist]) => ({
    owner,
    checklist: [
      'Confirm scope, timing, and dependencies with the launch lead.',
      ...checklist,
      'Review launch-day comms, monitoring, and rollback contacts.',
    ].slice(0, 6),
  }))
}

export function draftChannelCopy(input: LaunchDeskInput) {
  const summary = summarizeText(input.productBrief, 120)

  return input.channels.map<ChannelCopy>((channel, index) => {
    const goal =
      /email/i.test(channel)
        ? 'Drive clicks from the existing audience'
        : /social/i.test(channel)
          ? 'Create awareness and urgency'
          : /slack|internal/i.test(channel)
            ? 'Align internal launch owners'
            : 'Give the audience a clear launch update'

    return {
      channel,
      goal,
      copy:
        index === 0
          ? `${summary} Launch target: ${input.launchDate}. Best for ${input.audience}. Next step: point people to the primary CTA and support path.`
          : `${channel}: announce the launch in a direct, benefit-led way, note the date (${input.launchDate}), and highlight the strongest available asset or proof point.`,
    }
  })
}

export function buildLaunchPlanningPrompt(input: LaunchDeskInput) {
  return [
    'Build a launch plan for this request.',
    '',
    `Product brief: ${input.productBrief}`,
    `Audience: ${input.audience}`,
    `Launch date: ${input.launchDate}`,
    `Constraints: ${input.constraints}`,
    `Available assets: ${input.availableAssets}`,
    `Channels: ${input.channels.join(', ')}`,
    `Team: ${input.team.join(', ')}`,
  ].join('\n')
}

