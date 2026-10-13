// The search field's glass and the detail panel's close chevron; actions carry no icons.
const paths = {
  search: <><circle cx="10.5" cy="10.5" r="7.5" /><path d="m16 16 6 6" /></>,
  chevron: <path d="m5 9 7 7 7-7" />,
}
export function Icon({ name }: { name: keyof typeof paths }) { return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg> }
