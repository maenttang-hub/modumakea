'use client'

import { FormEvent, useState } from 'react'
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, LoaderCircle, Megaphone, ShieldAlert, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LaunchDeskInput } from '@/lib/launch-desk/types'

type StreamEvent =
  | { id: string; type: 'tool_called'; label: string }
  | { id: string; type: 'tool_output'; label: string }
  | { id: string; type: 'status'; label: string }
  | { id: string; type: 'error'; label: string }

const defaultValue: LaunchDeskInput = {
  productBrief:
    'We are launching a self-serve incident timeline feature that helps platform teams show customers what happened during outages and what was fixed.',
  audience: 'Platform engineering leaders at mid-market SaaS companies',
  launchDate: '2026-07-30',
  constraints: 'Engineering has one sprint left, legal review is required for customer-facing wording, and support needs a rollback note before launch day.',
  availableAssets: 'Working product demo, draft FAQ, 3 screenshots, changelog draft, internal launch deck',
  channels: ['Email', 'Release notes', 'LinkedIn', 'Internal Slack'],
  team: ['Avery (PM)', 'Sam (Eng)', 'Nina (Design)', 'Marco (Marketing)', 'Tess (Support)'],
}

function FieldLabel({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Sparkles
  title: string
  hint: string
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="inline-flex size-8 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.08)] text-[#ffd166]">
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-[#9eb1c7]">{hint}</p>
      </div>
    </div>
  )
}

function splitCsv(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export function LaunchDeskApp() {
  const [form, setForm] = useState({
    ...defaultValue,
    channelsText: defaultValue.channels.join(', '),
    teamText: defaultValue.team.join(', '),
  })
  const [streamLog, setStreamLog] = useState<StreamEvent[]>([])
  const [draft, setDraft] = useState('')
  const [finalOutput, setFinalOutput] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')
    setDraft('')
    setFinalOutput('')
    setStreamLog([{ id: crypto.randomUUID(), type: 'status', label: 'Starting Launch Desk run…' }])

    const payload: LaunchDeskInput = {
      productBrief: form.productBrief,
      audience: form.audience,
      launchDate: form.launchDate,
      constraints: form.constraints,
      availableAssets: form.availableAssets,
      channels: splitCsv(form.channelsText),
      team: splitCsv(form.teamText),
    }

    try {
      const response = await fetch('/api/launch-desk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok || !response.body) {
        const body = await response.text()
        throw new Error(body || `Launch Desk request failed with ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''

        for (const message of messages) {
          const eventLine = message.split('\n').find(line => line.startsWith('event: '))
          const dataLine = message.split('\n').find(line => line.startsWith('data: '))
          if (!eventLine || !dataLine) {
            continue
          }

          const eventType = eventLine.slice(7).trim()
          const data = JSON.parse(dataLine.slice(6))

          if (eventType === 'tool_called') {
            setStreamLog(current => [
              ...current,
              { id: crypto.randomUUID(), type: 'tool_called', label: `Running ${data.name}` },
            ])
          }

          if (eventType === 'tool_output') {
            setStreamLog(current => [
              ...current,
              { id: crypto.randomUUID(), type: 'tool_output', label: `${data.name} finished` },
            ])
          }

          if (eventType === 'text_delta') {
            setDraft(current => current + data.delta)
          }

          if (eventType === 'run_completed') {
            setFinalOutput(typeof data.finalOutput === 'string' ? data.finalOutput : draft)
            setStreamLog(current => [
              ...current,
              { id: crypto.randomUUID(), type: 'status', label: 'Plan ready' },
            ])
          }

          if (eventType === 'error') {
            throw new Error(data.message || 'Launch Desk failed.')
          }
        }
      }
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : String(submissionError)
      setError(message)
      setStreamLog(current => [
        ...current,
        { id: crypto.randomUUID(), type: 'error', label: message },
      ])
    } finally {
      setIsSubmitting(false)
    }
  }

  const displayedOutput = finalOutput || draft

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d3252_0%,#09111d_38%,#05070d_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur xl:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-96 bg-[radial-gradient(circle_at_center,rgba(255,209,102,0.18),transparent_60%)] lg:block" />
          <div className="relative grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-[#ffd166]">
                Launch planning agent
              </div>
              <h1
                className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-5xl"
                style={{ fontFamily: 'var(--launch-desk-heading)' }}
              >
                Launch Desk turns a rough release idea into a plan your team can run this week.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c5d2df] sm:text-lg">
                Drop in the brief, audience, launch date, constraints, and assets. The agent will produce a prioritized rollout plan, a risk register, owner checklists, launch copy suggestions, and the questions that still need answers.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <ClipboardList className="mb-3 size-5 text-[#9ad1ff]" />
                  <p className="text-sm font-semibold">Prioritized action plan</p>
                  <p className="mt-1 text-sm text-[#9eb1c7]">P0 to P2 work, sequenced for real launch pressure.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <ShieldAlert className="mb-3 size-5 text-[#ff9e7a]" />
                  <p className="text-sm font-semibold">Risk register</p>
                  <p className="mt-1 text-sm text-[#9eb1c7]">Severity, trigger, mitigation, and owner in one place.</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                  <Megaphone className="mb-3 size-5 text-[#b3ffb8]" />
                  <p className="text-sm font-semibold">Channel-ready copy</p>
                  <p className="mt-1 text-sm text-[#9eb1c7]">Suggestions tailored to your channels and assets.</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[rgba(7,10,16,0.72)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="text-sm font-semibold text-white">Live agent stream</p>
                  <p className="text-xs text-[#8da0b8]">Tool progress and text deltas appear here while the plan is forming.</p>
                </div>
                {isSubmitting ? <LoaderCircle className="size-5 animate-spin text-[#ffd166]" /> : <CheckCircle2 className="size-5 text-[#7ef0a3]" />}
              </div>
              <div className="mt-4 space-y-3">
                {streamLog.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/12 bg-black/20 p-4 text-sm text-[#8da0b8]">
                    Start a run to watch Launch Desk use tools and draft the answer progressively.
                  </p>
                ) : (
                  streamLog.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm"
                    >
                      <span
                        className={`size-2 rounded-full ${
                          item.type === 'error'
                            ? 'bg-[#ff8c7a]'
                            : item.type === 'tool_output'
                              ? 'bg-[#7ef0a3]'
                              : item.type === 'tool_called'
                                ? 'bg-[#ffd166]'
                                : 'bg-[#9ad1ff]'
                        }`}
                      />
                      <span className="text-[#d9e2ec]">{item.label}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-8 xl:grid-cols-[0.96fr_1.04fr]">
          <form onSubmit={handleSubmit} className="rounded-[32px] border border-white/8 bg-[rgba(5,8,13,0.82)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.25)] backdrop-blur sm:p-6">
            <div className="grid gap-6">
              <div>
                <FieldLabel icon={Sparkles} title="Product brief" hint="What is shipping, why it matters, and what makes this launch meaningful?" />
                <textarea
                  value={form.productBrief}
                  onChange={event => setForm(current => ({ ...current, productBrief: event.target.value }))}
                  className="min-h-36 w-full rounded-[24px] border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none transition focus:border-[#9ad1ff] focus:ring-2 focus:ring-[#9ad1ff]/30"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <FieldLabel icon={ArrowRight} title="Audience" hint="Who should care first?" />
                  <Input
                    value={form.audience}
                    onChange={event => setForm(current => ({ ...current, audience: event.target.value }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/4 text-white"
                  />
                </div>
                <div>
                  <FieldLabel icon={CalendarDays} title="Launch date" hint="Use the target release date or milestone." />
                  <Input
                    value={form.launchDate}
                    onChange={event => setForm(current => ({ ...current, launchDate: event.target.value }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/4 text-white"
                  />
                </div>
              </div>

              <div>
                <FieldLabel icon={ShieldAlert} title="Constraints" hint="Legal, engineering, staffing, dependencies, launch freeze, rollout limits." />
                <textarea
                  value={form.constraints}
                  onChange={event => setForm(current => ({ ...current, constraints: event.target.value }))}
                  className="min-h-28 w-full rounded-[24px] border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none transition focus:border-[#ffb27a] focus:ring-2 focus:ring-[#ffb27a]/20"
                />
              </div>

              <div>
                <FieldLabel icon={ClipboardList} title="Available assets" hint="List demos, docs, screenshots, decks, drafts, or proof points." />
                <textarea
                  value={form.availableAssets}
                  onChange={event => setForm(current => ({ ...current, availableAssets: event.target.value }))}
                  className="min-h-28 w-full rounded-[24px] border border-white/10 bg-white/4 px-4 py-3 text-sm text-white outline-none transition focus:border-[#7ef0a3] focus:ring-2 focus:ring-[#7ef0a3]/20"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <FieldLabel icon={Megaphone} title="Channels" hint="Comma-separated, for example Email, Release notes, LinkedIn." />
                  <Input
                    value={form.channelsText}
                    onChange={event => setForm(current => ({ ...current, channelsText: event.target.value }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/4 text-white"
                  />
                </div>
                <div>
                  <FieldLabel icon={CheckCircle2} title="Team" hint="Comma-separated owners or launch roles." />
                  <Input
                    value={form.teamText}
                    onChange={event => setForm(current => ({ ...current, teamText: event.target.value }))}
                    className="h-11 rounded-2xl border-white/10 bg-white/4 text-white"
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="mt-2 h-12 rounded-2xl bg-[#ffd166] text-[#1f2835] hover:bg-[#ffe08e]"
              >
                {isSubmitting ? 'Planning launch…' : 'Generate launch plan'}
              </Button>

              {error ? (
                <div className="rounded-2xl border border-[#ff8c7a]/30 bg-[#ff8c7a]/10 px-4 py-3 text-sm text-[#ffd0c7]">
                  {error}
                </div>
              ) : null}
            </div>
          </form>

          <section className="rounded-[32px] border border-white/8 bg-[rgba(7,9,15,0.92)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.3)] sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Planning output</p>
                <p className="text-xs text-[#8da0b8]">Progressively streamed from the agent route.</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-[#9ad1ff]">
                SSE
              </span>
            </div>
            <div className="min-h-[32rem] rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
              {displayedOutput ? (
                <pre
                  className="whitespace-pre-wrap text-sm leading-7 text-[#dce7f3]"
                  style={{ fontFamily: 'var(--launch-desk-mono)' }}
                >
                  {displayedOutput}
                </pre>
              ) : (
                <div className="flex h-full min-h-[28rem] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-black/15 px-6 text-center text-sm leading-7 text-[#8da0b8]">
                  Launch Desk will stream the plan here as soon as the run begins.
                </div>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  )
}
