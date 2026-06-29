# Launch Desk Validation Checklist

## Agent behavior

- `extract_launch_tasks` runs before the final answer is produced.
- `assess_launch_readiness` returns rubric scores plus at least three risks.
- `generate_owner_checklists` groups work by owner.
- `draft_channel_copy` produces one suggestion per requested channel.
- When important details are vague, the final answer includes follow-up questions instead of pretending certainty.

## Frontend flow

- The `/launch-desk` page loads without depending on the existing ModuMake dashboard.
- The form accepts a brief, audience, launch date, constraints, assets, channels, and team.
- Submitting the form shows live tool progress.
- The streamed text appears progressively before the run completes.
- Errors such as a missing `OPENAI_API_KEY` are shown in the UI.

## Tool outputs

- Prioritized tasks include priority, owner, and due window.
- The risk register includes severity, mitigation, owner, and trigger.
- Owner checklist items are actionable and not generic placeholders.
- Launch copy suggestions mention the target date and channel intent.

## End-to-end verification

- Start the dev server with a real `OPENAI_API_KEY` available to the server process.
- Run `npm run verify:launch-desk-stream`.
- Confirm the script logs at least one `tool-event:*` line and one `text-delta:*` line.
- Confirm the script ends with `launch-desk-stream:ok`.
