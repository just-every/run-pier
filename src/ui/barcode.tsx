// Scannable barcode strips: an item's UPC-A or EAN-13 as EAN-13 bars, and a
// document reference (PO-0004) as Code 39. Values that neither encodes draw nothing.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = L.map(code => [...code].map(bit => bit === '1' ? '0' : '1').join(''))
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

function ean13(value: string) {
  const digits = value.length === 12 ? `0${value}` : value
  if (!/^\d{13}$/.test(digits)) return null
  const sum = [...digits.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  if ((10 - sum % 10) % 10 !== Number(digits[12])) return null
  const first = Number(digits[0]), left = [...digits.slice(1, 7)].map((digit, index) => (parity[first][index] === 'L' ? L : G)[Number(digit)]).join('')
  return `101${left}01010${[...digits.slice(7)].map(digit => R[Number(digit)]).join('')}101`
}

// Code 39: nine elements per character (bar, space, …), three of them wide; '*' starts and stops.
const c39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw', '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '*': 'nwnnwnwnn',
}
function code39(value: string) {
  const text = `*${value.toUpperCase()}*`
  if (![...text].every(char => c39[char])) return null
  return [...text].map(char => [...c39[char]].map((width, index) => (index % 2 ? '0' : '1').repeat(width === 'w' ? 3 : 1)).join('') + '0').join('')
}

export function Barcode({ value, kind = 'item', className = 'barcode' }: { value?: string | null; kind?: 'item' | 'document'; className?: string }) {
  const bits = value ? (kind === 'item' ? ean13(value) : code39(value)) : null
  if (!bits) return null
  const bars: [number, number][] = []
  for (let index = 0; index < bits.length; index++) if (bits[index] === '1') { const start = index; while (bits[index + 1] === '1') index++; bars.push([start, index - start + 1]) }
  return <svg className={className} viewBox={`0 0 ${bits.length} 10`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`}>{bars.map(([x, width]) => <rect key={x} x={x} y="0" width={width} height="10" />)}</svg>
}
