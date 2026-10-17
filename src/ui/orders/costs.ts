import { useEffect, useState } from 'react'

// Each item's current unit cost, from the valuation Pier reports (/api/pier/reports):
// value over quantity of the valued cost layers across its sellable positions (a
// layer from an AUD opening import stays unvalued and is left out). Margins on open
// order lines read against it; an item with no valued stock has no margin.
type Layer = { quantity: string; value: string | null }
type Valuation = { valuation?: { rows: { itemId: string; status: string; layers?: Layer[] }[] } }
export function useUnitCosts(version: number) {
  const [costs, setCosts] = useState<Record<string, number>>({})
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/pier/reports', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<Valuation> : null)
      .then(report => {
        if (!report?.valuation?.rows) return
        const totals: Record<string, { value: number; quantity: number }> = {}
        for (const row of report.valuation.rows) {
          if (row.status !== 'sellable') continue
          for (const layer of row.layers ?? []) {
            if (layer.value === null || !(Number(layer.quantity) > 0)) continue
            const total = totals[row.itemId] ??= { value: 0, quantity: 0 }
            total.value += Number(layer.value); total.quantity += Number(layer.quantity)
          }
        }
        setCosts(Object.fromEntries(Object.entries(totals).map(([id, total]) => [id, total.value / total.quantity])))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [version])
  return costs
}

/** Gross margin of a unit price over a unit cost, as a whole percentage: "38%". */
export const margin = (price: unknown, cost: number | undefined) => {
  const value = Number(price)
  return price === null || price === undefined || cost === undefined || !(value > 0) ? null : Math.round((value - cost) / value * 100)
}
