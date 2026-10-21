import { useEffect, useRef, useState, type FormEvent } from 'react'

// One scan box for every floor step. A USB or Bluetooth scanner (and a rugged
// handheld's built-in scanner) types the code and presses Enter into the
// focused box, exactly as a person typing does. On a phone, the camera reads
// the code with the browser's own barcode detection where the browser has it.

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix']
const detectorClass = () => (globalThis as any).BarcodeDetector as ((new (options: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> }) | undefined

export function ScanBox({ label, hint, onScan, busy, count = false, focus = true }: { label: string; hint?: string; onScan: (code: string, count: string) => Promise<boolean>; busy: boolean; count?: boolean; focus?: boolean }) {
  const [code, setCode] = useState(''), [times, setTimes] = useState(''), [camera, setCamera] = useState<'off' | 'on' | 'unsupported' | 'denied'>('off')
  const input = useRef<HTMLInputElement>(null), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null)
  useEffect(() => { if (focus && !busy) input.current?.focus() }, [focus, busy])
  useEffect(() => () => stop(), [])
  function stop() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  // A scanner can send codes faster than Pier answers. Every scan joins a queue
  // and is sent in order once the previous command (and any other action, such
  // as starting a carton) has finished, so none is dropped while Pier is busy.
  // A refused scan stops the queue and says how many waiting scans were not sent.
  const queue = useRef<string[]>([]), draining = useRef(false), busyNow = useRef(busy)
  const [waiting, setWaiting] = useState(0), [dropped, setDropped] = useState(0)
  busyNow.current = busy
  async function send(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    setCode(''); setDropped(0)
    queue.current.push(trimmed); setWaiting(queue.current.length)
    if (draining.current) return
    draining.current = true
    try {
      while (queue.current.length) {
        while (busyNow.current) await new Promise(resolve => setTimeout(resolve, 50))
        const ok = await onScan(queue.current[0], times)
        queue.current.shift()
        if (ok) setTimes('')
        else if (queue.current.length) { setDropped(queue.current.length); queue.current = [] }
        setWaiting(queue.current.length)
      }
    } finally { draining.current = false }
    input.current?.focus()
  }
  async function start() {
    if (!detectorClass() || !navigator.mediaDevices?.getUserMedia) { setCamera('unsupported'); return }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setCamera('on')
    } catch { stop(); setCamera('denied') }
  }
  // Once the camera view is on screen, show the stream and look for a code a few times a second.
  useEffect(() => {
    const element = video.current, Detector = detectorClass()
    if (camera !== 'on' || !element || !stream.current || !Detector) return
    let live = true
    element.srcObject = stream.current
    void element.play().catch(() => {})
    void (async () => {
      // Ask only for the symbologies this browser reads; a UPC-A reads as EAN-13 where UPC-A is not listed.
      const supported = await Detector.getSupportedFormats?.().catch(() => FORMATS) ?? FORMATS
      const detector = new Detector({ formats: FORMATS.filter(format => supported.includes(format)) })
      while (live && stream.current) {
        const found = element.readyState >= 2 ? await detector.detect(element).catch(() => []) : []
        if (found[0]?.rawValue && live) { stop(); setCamera('off'); await send(found[0].rawValue); return }
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    })()
    return () => { live = false }
  }, [camera])
  function submit(event: FormEvent) { event.preventDefault(); void send(code) }
  return <form className="scan-box" onSubmit={submit}>
    <label className="field scan-field"><span>{label}</span><input ref={input} aria-label={label} value={code} onChange={event => setCode(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void send(event.currentTarget.value) } }} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" placeholder="Scan or type" />{hint && <small>{hint}</small>}</label>
    {count && <label className="field scan-count"><span>Times</span><input aria-label="Times scanned" value={times} onChange={event => setTimes(event.target.value)} inputMode="numeric" placeholder="1" /></label>}
    <div className="scan-actions"><button className="primary" type="submit" disabled={busy || !code.trim()}>Enter code</button>{camera === 'on' ? <button type="button" onClick={() => { stop(); setCamera('off') }}>Stop camera</button> : <button type="button" onClick={() => void start()}>Scan with camera</button>}</div>
    {waiting > 1 && <p className="muted scan-note" role="status">{waiting - 1} more {waiting === 2 ? 'scan' : 'scans'} waiting to record…</p>}
    {dropped > 0 && <p className="error scan-note" role="alert">{dropped} {dropped === 1 ? 'scan was' : 'scans were'} not recorded after the refusal above. Scan {dropped === 1 ? 'it' : 'them'} again.</p>}
    {camera === 'on' && <video ref={video} className="scan-video" muted playsInline aria-label="Camera view for barcode scanning" />}
    {camera === 'unsupported' && <p className="muted scan-note" role="status">This browser cannot read barcodes from the camera. Type the code, or use a USB or Bluetooth scanner.</p>}
    {camera === 'denied' && <p className="muted scan-note" role="status">The camera is not available. Allow camera access, or type the code.</p>}
  </form>
}

/** The last refusal of a floor command, shown where the scan was made. */
export function Refusal({ error }: { error: string }) {
  return error ? <p className="error scan-refusal" role="alert">{error}</p> : null
}
