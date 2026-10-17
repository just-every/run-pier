/** The mark beside the "Pier" wordmark in the display face. */
export function Lockup({ size = 34 }: { size?: number }) {
  return <a className="site-brand" href="/"><img src="/brand/mark.svg" alt="" width={size} height={size} /><span>Pier</span></a>
}
