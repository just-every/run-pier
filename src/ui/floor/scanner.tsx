import { useEffect, useRef, useState, type FormEvent } from 'react'
import { pendingScan, readTask, settleScan, writeTask, withScan, type ScanIntent } from './task-storage'

// One scan box for every floor step. A USB or Bluetooth scanner (and a rugged
// handheld's built-in scanner) types the code and presses Enter into the
// focused box, exactly as a person typing does. On a phone, the camera reads
// the code with the browser's own barcode detection where the browser has it.

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code', 'data_matrix']
const detectorClass = () => (globalThis as any).BarcodeDetector as ((new (options: { formats: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> }) | undefined

export function ScanBox({ label, hint, onScan, busy, count = false, focus = true, taskKey }: { label: string; hint?: string; onScan: (code: string, count: string) => Promise<boolean>; busy: boolean; count?: boolean; focus?: boolean; taskKey?: string }) {
  const [code, setCode] = useState(''), [times, setTimes] = useState(''), [camera, setCamera] = useState<'off' | 'on' | 'unsupported' | 'denied'>('off')
  const input = useRef<HTMLInputElement>(null), video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null)
  useEffect(() => { if (focus && !busy) input.current?.focus() }, [focus, busy])
  useEffect(() => () => stop(), [])
  function stop() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  // Each queued scan retains its own count and task, including an in-flight
  // scan. Reload and refusal always pause; reconnect never starts a write.
  const stored = () => taskKey ? readTask<ScanIntent[]>('scans:' + taskKey, []) : []
  const queue = useRef<ScanIntent[]>(stored()), draining = useRef(false), busyNow = useRef(busy), live = useRef(true)
  const scanNow = useRef(onScan)
  const [waiting, setWaiting] = useState(queue.current.length), [paused, setPaused] = useState(queue.current.length > 0), [scanError, setScanError] = useState('')
  busyNow.current = busy; scanNow.current = onScan
  function save() {
    if (taskKey) writeTask('scans:' + taskKey, queue.current)
    setWaiting(queue.current.length)
  }
  useEffect(() => {
    live.current = true
    const update = (event: Event) => {
      if ((event as CustomEvent).detail !== taskKey) return
      queue.current = stored(); setWaiting(queue.current.length)
    }
    window.addEventListener('pier.floor.scans', update)
    return () => { live.current = false; window.removeEventListener('pier.floor.scans', update) }
  }, [taskKey])
  async function drain() {
    if (draining.current) return
    draining.current = true; setScanError(''); setPaused(false)
    try {
      while (queue.current.length && live.current) {
        while (busyNow.current && live.current) await new Promise(resolve => setTimeout(resolve, 50))
        if (!live.current) return
        const entry = queue.current[0]
        // A sent scan's exact command is recovered in the page banner. Sending
        // its code again here could create a different command and double it.
        if (entry.status === 'sending') { setPaused(true); return }
        entry.status = 'sending'; save()
        const ok = await withScan(taskKey ? { key: taskKey, id: entry.id } : undefined, () => scanNow.current(entry.code, entry.count))
        if (ok) { queue.current = queue.current.filter(scan => scan.id !== entry.id); setTimes('') }
        else {
          // The command layer marks definitive refusal. An uncertain send
          // remains sending and can only be resolved by its exact command ID.
          if (taskKey) {
            const scan = { key: taskKey, id: entry.id }
            // Local bin validation has a definite outcome without issuing a
            // command. Only a linked interrupted command is an uncertain send.
            if (!pendingScan(scan)) settleScan(scan, false)
            queue.current = stored()
          }
          else entry.status = 'refused'
          setPaused(true); save(); return
        }
        save()
      }
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : 'Scan intent could not be retained.'); setPaused(true)
    } finally { draining.current = false }
    input.current?.focus()
  }
  async function send(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return
    try {
      // A fresh scan explicitly corrects a sole refused code. Queued successors
      // and uncertain sends still require their separate recovery/review.
      const correction = queue.current.length === 1 && queue.current[0].status === 'refused'
      if (correction) { queue.current = []; setPaused(false) }
      queue.current.push({ id: crypto.randomUUID(), code: trimmed, count: times, status: 'waiting' }); save(); setCode('')
      if (!paused || correction) await drain()
    } catch { setScanError('This tab cannot retain the scan. Enable browser storage before recording warehouse work.'); setPaused(true) }
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
    {waiting > 0 && <div className="scan-note" role="status"><p>{waiting} retained {waiting === 1 ? 'scan' : 'scans'}{paused ? ' awaiting review.' : ' waiting to record…'}</p>{paused && <><p>{queue.current.map(entry => `${entry.code}${entry.count ? ` × ${entry.count}` : ''}`).join(', ')}</p>{queue.current.some(entry => entry.status === 'sending') ? <p>Recover the interrupted action above before continuing these scans.</p> : <button type="button" disabled={busy} onClick={() => void drain()}>Review current task and resume scans</button>}<button type="button" disabled={busy || queue.current.some(entry => entry.status === 'sending')} onClick={() => { queue.current = []; save(); setPaused(false) }}>Discard retained scans</button></>}</div>}
    {scanError && <p className="error scan-note" role="alert">{scanError}</p>}
    {camera === 'on' && <video ref={video} className="scan-video" muted playsInline aria-label="Camera view for barcode scanning" />}
    {camera === 'unsupported' && <p className="muted scan-note" role="status">This browser cannot read barcodes from the camera. Type the code, or use a USB or Bluetooth scanner.</p>}
    {camera === 'denied' && <p className="muted scan-note" role="status">The camera is not available. Allow camera access, or type the code.</p>}
  </form>
}

/** The last refusal of a floor command, shown where the scan was made. */
export function Refusal({ error }: { error: string }) {
  return error ? <p className="error scan-refusal" role="alert">{error}</p> : null
}
