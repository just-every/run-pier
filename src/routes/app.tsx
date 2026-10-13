import { createFileRoute } from '@tanstack/react-router'
import { HydrationUnit } from '../base/hydration/unit'
import { PierApp } from '../ui/app'

export const Route = createFileRoute('/app')({
  head: () => ({ meta: [{ title: 'Pier — stock and orders' }] }),
  component: () => <HydrationUnit><PierApp /></HydrationUnit>,
})
