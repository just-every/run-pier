// Display calculations use the same declared six-place precision as commands.
// Inputs travel to the server unchanged; this only combines existing records.
const scale = 1_000_000n
function exact(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Invalid exact quantity in saved records')
  const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  const number = BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'))
  return negative ? -number : number
}
function display(value: bigint) {
  const negative = value < 0n, absolute = negative ? -value : value
  const fraction = (absolute % scale).toString().padStart(6, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${absolute / scale}${fraction ? `.${fraction}` : ''}`
}
export const sum = (values: string[]) => display(values.reduce((total, value) => total + exact(value), 0n))
export const difference = (left: string, right: string) => display(exact(left) - exact(right))
export const fromMillionths = (value: string) => {
  if (!/^-?\d+$/.test(value)) throw new Error('Invalid saved ledger quantity')
  return display(BigInt(value))
}
/** A quantity times a unit price, for display totals: product('600', '6.24') is '3744'. */
export const product = (left: string, right: string) => display(exact(left) * exact(right) / scale)
