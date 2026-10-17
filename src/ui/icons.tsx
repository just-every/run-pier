// Line icons for the rail, the top bar and the order workbench: one 24px grid,
// drawn in currentColor. Actions carry words; an icon only marks a place or a state.
const paths = {
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  orders: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  stock: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  purchasing: <><path d="M6 3h9l4 4v14H6Z" /><path d="M15 3v4h4M9 11h7M9 15h7M9 19h4" /></>,
  floor: <><path d="M3 10 12 4l9 6v11H3Z" /><path d="M8 21v-7h8v7M8 17h8" /></>,
  transfers: <><path d="M4 8h14l-3-3M20 16H6l3 3" /></>,
  counts: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5" /></>,
  imports: <><path d="M12 15V3M7 8l5-5 5 5" /><path d="M4 14v6h16v-6" /></>,
  channels: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><circle cx="12" cy="5.5" r="2.5" /><path d="m10.7 7.7-3.4 8M13.3 7.7l3.4 8M8.5 18h7" /></>,
  books: <><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></>,
  reports: <><path d="M6 3h12v18H6Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  ai: <path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z" />,
  pin: <><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2" /></>,
  truck: <><path d="M3 6h11v10H3ZM14 9h4l3 3v4h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3.5 22 20H2Z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  person: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.8-4 3.5-6 7-6s6.2 2 7 6" /></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
}
export type IconName = keyof typeof paths
export function Icon({ name }: { name: IconName }) { return <svg viewBox="0 0 24 24" aria-hidden="true" data-icon={name}>{paths[name]}</svg> }
