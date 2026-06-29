import { tool } from '@openai/agents'
import { z } from 'zod'

import {
  assessLaunchReadiness,
  draftChannelCopy,
  extractLaunchTasks,
  generateOwnerChecklists,
  identifyMissingDetails,
} from '@/lib/launch-desk/planning'
import { launchDeskInputSchema } from '@/lib/launch-desk/types'

const launchToolInputSchema = z.object({
  launchInput: launchDeskInputSchema,
})

export const extractLaunchTasksTool = tool({
  name: 'extract_launch_tasks',
  description: 'Extract and prioritize the workstreams that must happen for the launch to ship well.',
  parameters: launchToolInputSchema,
  execute: async ({ launchInput }) => {
    return {
      tasks: extractLaunchTasks(launchInput),
      missingDetails: identifyMissingDetails(launchInput),
    }
  },
})

export const assessLaunchReadinessTool = tool({
  name: 'assess_launch_readiness',
  description: 'Score the launch request against a readiness rubric and produce a risk register.',
  parameters: launchToolInputSchema,
  execute: async ({ launchInput }) => {
    return assessLaunchReadiness(launchInput)
  },
})

export const generateOwnerChecklistsTool = tool({
  name: 'generate_owner_checklists',
  description: 'Turn prioritized launch tasks into clear owner-by-owner checklists.',
  parameters: launchToolInputSchema,
  execute: async ({ launchInput }) => {
    const tasks = extractLaunchTasks(launchInput)
    return {
      checklists: generateOwnerChecklists(launchInput, tasks),
    }
  },
})

export const draftChannelCopyTool = tool({
  name: 'draft_channel_copy',
  description: 'Draft channel-specific launch copy suggestions matched to the launch brief and channels.',
  parameters: launchToolInputSchema,
  execute: async ({ launchInput }) => {
    return {
      copy: draftChannelCopy(launchInput),
    }
  },
})

export const launchDeskTools = [
  extractLaunchTasksTool,
  assessLaunchReadinessTool,
  generateOwnerChecklistsTool,
  draftChannelCopyTool,
]

