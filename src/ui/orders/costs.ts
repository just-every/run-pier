import { useEffect, useState } from 'react'

// Each order line's own cost, from Pier's report (/api/pier/reports `orderCosts`):
// the cost layers its dispatches consumed plus the layers its reservations hold
// in their bins. It survives dispatch and a later receipt at another cost; a
// line with an unvalued layer (an AUD opening import) or no stock has no cost.
export type LineCost = { quantity: string; cost: string | null }
type Report = { orderCosts?: Record<string, LineCost> }
export type LineCosts = { lines: Record<string, LineCost>; failed: boolean }

export function useLineCosts(version: number): LineCosts {
  const [costs, setCosts] = useState<LineCosts>({ lines: {}, failed: false })
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/pier/reports', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); const report = await response.json() as Report; if (!report.orderCosts) throw new Error(); setCosts({ lines: report.orderCosts, failed: false }) })
      .catch(() => { if (!controller.signal.aborted) setCosts(current => ({ ...current, failed: true })) })
    return () => controller.abort()
  }, [version])
  return costs
}

/** Gross margin of a unit price over the line's own unit cost, as a whole percentage: "38%". */
export const margin = (price: unknown, cost: LineCost | undefined) => {
  const value = Number(price), quantity = Number(cost?.quantity)
  if (price === null || price === undefined || !(value > 0) || !cost || cost.cost === null || !(quantity > 0)) return null
  return Math.round((value - Number(cost.cost) / quantity) / value * 100)
}
