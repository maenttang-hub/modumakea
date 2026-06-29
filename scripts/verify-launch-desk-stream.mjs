const payload = {
  productBrief:
    'We are launching a lightweight launch calendar view that helps engineering teams coordinate release tasks, approvals, and launch-day updates without switching tools.',
  audience: 'Engineering managers and product managers at B2B software teams',
  launchDate: '2026-08-14',
  constraints:
    'The feature must launch before an industry event, docs have limited bandwidth, and support wants a rollback note.',
  availableAssets: 'Feature demo, changelog draft, screenshots, FAQ outline, internal pitch deck',
  channels: ['Email', 'Release notes', 'LinkedIn'],
  team: ['Avery (PM)', 'Sam (Eng)', 'Nina (Design)', 'Marco (Marketing)'],
}

function parseSseChunk(chunk) {
  const messages = chunk.split('\n\n').filter(Boolean)
  return messages
    .map(message => {
      const event = message
        .split('\n')
        .find(line => line.startsWith('event: '))
        ?.slice(7)
        .trim()
      const data = message
        .split('\n')
        .find(line => line.startsWith('data: '))
        ?.slice(6)
      if (!event || !data) {
        return null
      }
      return { event, data: JSON.parse(data) }
    })
    .filter(Boolean)
}

const response = await fetch('http://127.0.0.1:3000/api/launch-desk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  body: JSON.stringify(payload),
})

if (!response.ok || !response.body) {
  const body = await response.text()
  throw new Error(`Launch Desk verification failed: ${response.status} ${body}`)
}

const decoder = new TextDecoder()
const reader = response.body.getReader()
let buffer = ''
let sawToolEvent = false
let sawTextDelta = false

while (true) {
  const { value, done } = await reader.read()
  if (done) {
    break
  }

  buffer += decoder.decode(value, { stream: true })
  const parts = buffer.split('\n\n')
  buffer = parts.pop() ?? ''

  for (const event of parseSseChunk(parts.join('\n\n'))) {
    if (event.event === 'tool_called' || event.event === 'tool_output') {
      sawToolEvent = true
      console.log(`tool-event:${event.event}:${event.data.name}`)
    }

    if (event.event === 'text_delta' && typeof event.data.delta === 'string' && event.data.delta.length > 0) {
      sawTextDelta = true
      console.log(`text-delta:${event.data.delta.slice(0, 40)}`)
    }

    if (event.event === 'error') {
      throw new Error(`Launch Desk stream error: ${event.data.message}`)
    }
  }

  if (sawToolEvent && sawTextDelta) {
    break
  }
}

if (!sawToolEvent || !sawTextDelta) {
  throw new Error(
    `Launch Desk verification incomplete. sawToolEvent=${sawToolEvent} sawTextDelta=${sawTextDelta}`,
  )
}

console.log('launch-desk-stream:ok')

