/** The page's actions and the licence line under them. */
export function Actions() {
  return (
    <>
      <div className="landing-actions">
        <a className="pill pill-primary" href="/run">Run Pier</a>
        <a className="pill" href="https://demo.run-pier.com/">Try the demo</a>
        <a className="pill" href="/docs">Read the docs</a>
      </div>
      <p className="landing-licence">Free and open source, MIT licensed.</p>
    </>
  )
}
