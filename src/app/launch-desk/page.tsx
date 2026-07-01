import { notFound } from 'next/navigation'

import { LaunchDeskApp } from '@/components/launch-desk/launch-desk-app'
import { isLaunchDeskEnabled } from '@/lib/beta-feature-gates'

export default function LaunchDeskPage() {
  if (!isLaunchDeskEnabled()) {
    notFound()
  }

  return <LaunchDeskApp />
}
