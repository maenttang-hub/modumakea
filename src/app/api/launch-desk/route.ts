import { run, withTrace } from '@openai/agents'

import { buildLaunchDeskAgentInput, launchDeskAgent } from '@/lib/launch-desk/agent'
import { launchDeskInputSchema } from '@/lib/launch-desk/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function getToolName(item: unknown) {
  if (!item || typeof item !== 'object') {
    return 'tool'
  }

  const candidate = item as {
    rawItem?: { name?: string; callId?: string; call_id?: string }
    type?: string
  }

  return candidate.rawItem?.name ?? candidate.type ?? 'tool'
}

function getToolCallId(item: unknown) {
  if (!item || typeof item !== 'object') {
    return undefined
  }

  const candidate = item as {
    rawItem?: { callId?: string; call_id?: string }
  }

  return candidate.rawItem?.callId ?? candidate.rawItem?.call_id
}

function getTextDelta(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null
  }

  const candidate = data as {
    type?: string
    delta?: string
  }

  if (
    (candidate.type === 'output_text_delta' || candidate.type === 'response.output_text.delta') &&
    typeof candidate.delta === 'string' &&
    candidate.delta.length > 0
  ) {
    return candidate.delta
  }

  return null
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json(
      {
        error:
          'OPENAI_API_KEY is not configured. Add it to .env.local or export it before starting the server.',
      },
      { status: 500 },
    )
  }

  const json = await request.json().catch(() => null)
  const parsed = launchDeskInputSchema.safeParse(json)

  if (!parsed.success) {
    return Response.json(
      {
        error: 'Invalid Launch Desk payload.',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    )
  }

  const launchInput = parsed.data
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          sseEvent('run_started', {
            model: launchDeskAgent.model,
            launchDate: launchInput.launchDate,
          }),
        ),
      )

      try {
        const result = await withTrace(
          'Launch Desk Planning Run',
          () =>
            run(launchDeskAgent, buildLaunchDeskAgentInput(launchInput), {
              stream: true,
              maxTurns: 8,
            }),
          {
            groupId: `launch-desk:${launchInput.launchDate}`,
            metadata: {
              app: 'launch-desk',
              launchDate: launchInput.launchDate,
              channels: launchInput.channels.join(','),
            },
          },
        )

        for await (const event of result) {
          if (event.type === 'run_item_stream_event') {
            if (event.name === 'tool_called') {
              controller.enqueue(
                encoder.encode(
                  sseEvent('tool_called', {
                    name: getToolName(event.item),
                    callId: getToolCallId(event.item),
                  }),
                ),
              )
            }

            if (event.name === 'tool_output') {
              controller.enqueue(
                encoder.encode(
                  sseEvent('tool_output', {
                    name: getToolName(event.item),
                    callId: getToolCallId(event.item),
                  }),
                ),
              )
            }
          }

          const delta = event.type === 'raw_model_stream_event' ? getTextDelta(event.data) : null

          if (delta) {
            controller.enqueue(
              encoder.encode(
                sseEvent('text_delta', {
                  delta,
                }),
              ),
            )
          }
        }

        await result.completed

        controller.enqueue(
          encoder.encode(
            sseEvent('run_completed', {
              finalOutput: result.finalOutput ?? '',
            }),
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        controller.enqueue(encoder.encode(sseEvent('error', { message })))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
