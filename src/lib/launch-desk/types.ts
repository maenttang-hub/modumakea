import { z } from 'zod'

export const launchDeskInputSchema = z.object({
  productBrief: z.string().trim().min(20, 'Add a more detailed product brief.').max(5000),
  audience: z.string().trim().min(3, 'Describe the intended audience.').max(400),
  launchDate: z.string().trim().min(4, 'Provide a target launch date.').max(80),
  constraints: z.string().trim().min(3, 'List at least one constraint.').max(2000),
  availableAssets: z.string().trim().min(3, 'List the assets the team already has.').max(2000),
  channels: z.array(z.string().trim().min(2)).min(1).max(6),
  team: z.array(z.string().trim().min(2)).min(1).max(8),
})

export type LaunchDeskInput = z.infer<typeof launchDeskInputSchema>

export const prioritySchema = z.enum(['P0', 'P1', 'P2'])
export type LaunchPriority = z.infer<typeof prioritySchema>

export type LaunchTask = {
  id: string
  title: string
  priority: LaunchPriority
  owner: string
  dueWindow: string
  rationale: string
  dependencies: string[]
}

export type ReadinessCheck = {
  area: string
  score: number
  status: 'ready' | 'watch' | 'blocked'
  notes: string
}

export type RiskEntry = {
  id: string
  risk: string
  severity: 'high' | 'medium' | 'low'
  owner: string
  mitigation: string
  trigger: string
}

export type OwnerChecklist = {
  owner: string
  checklist: string[]
}

export type ChannelCopy = {
  channel: string
  copy: string
  goal: string
}

