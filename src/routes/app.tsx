import { createFileRoute } from '@tanstack/react-router'
import { HydrationUnit } from '../base/hydration/unit'
import { PierApp } from '../ui/app'

export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Pier' }] }),
  component: () => <HydrationUnit><PierApp /></HydrationUnit>,
})
