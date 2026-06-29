import type { Metadata } from 'next'
import { IBM_Plex_Mono, Space_Grotesk } from 'next/font/google'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--launch-desk-heading',
})

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--launch-desk-mono',
})

export const metadata: Metadata = {
  title: 'Launch Desk',
  description: 'A launch-planning agent app for turning product briefs into actionable release plans.',
}

export default function LaunchDeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
      style={
        {
          '--launch-desk-heading': spaceGrotesk.style.fontFamily,
          '--launch-desk-mono': ibmPlexMono.style.fontFamily,
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  )
}
