// Where the run site's links go. The source repository is package.json's; the run
// site never links an instance-only route (/signin, /setup, /app).
import pkg from '../../package.json'

const repository: string = pkg.repository

export const links = {
  home: '/',
  run: '/run',
  docs: '/docs',
  contract: '/contract',
  source: repository,
  licence: `${repository}/blob/main/LICENSE`,
  // The hosted demo (DEMO.md): a throwaway Pier filled through its own commands.
  demo: 'https://demo.run-pier.com/',
}
export const docsPath = (slug: string) => `/docs/${slug}`
