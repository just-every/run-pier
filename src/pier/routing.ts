import { canonicalJson, sha256 } from "./import-kit";
import {
  fail,
  fresh,
  get,
  requireRole,
  row,
  text,
  type Context,
  type Row,
  type State,
} from "./model";
export const routingFrontier = (s: State) =>
  sha256(
    canonicalJson({
      orders: s.orders,
      locations: s.locations,
      parties: s.parties,
      movements: s.movements,
      reservations: s.reservations,
      kitDefinitions: s.kitDefinitions,
      traceIdentities: s.traceIdentities,
      traceQuarantines: s.traceQuarantines,
    }),
  );
export const activeRule = (s: State, source: string) =>
  s.routingRules
    .filter((r) => r.source === source && r.activeAt)
    .sort((a, b) => b.revision - a.revision)[0];
const warehouses = (s: State) =>
  new Set(s.locations.filter((l) => l.kind === "bin").map((l) => l.warehouse));
function eligible(s: State, value: any): string[] {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100 ||
    new Set(value).size !== value.length ||
    value.some((w) => !warehouses(s).has(w))
  )
    fail(
      "ROUTING_WAREHOUSE",
      "List distinct existing eligible warehouses in priority order.",
    );
  return value;
}
export function sourceKey(p: any) {
  return (
    p.routingSource ??
    (p.channelId
      ? `channel:${p.channelId}`
      : p.ediPartnerId
        ? `edi:${p.ediPartnerId}`
        : "manual")
  );
}
export function route(
  s: State,
  source: string,
  shipTo: any,
  channelLocation: unknown,
  fallback?: string | null,
  override?: Row,
) {
  const rule = override ?? activeRule(s, source);
  if (!rule)
    return {
      source,
      mode: "fixed",
      ruleId: null,
      revision: null,
      zone: null,
      shortage: "hold",
      eligible: fallback ? [fallback] : [],
      status: fallback ? "routed" : "waiting",
      reason: fallback
        ? "Explicit fixed warehouse"
        : "No routing rule or fixed warehouse is configured.",
    };
  let chosen: string[] = [],
    zone: string | null = null;
  if (rule.mode === "fixed") chosen = rule.eligible;
  if (rule.mode === "channel-location")
    chosen = rule.locations[String(channelLocation)] ?? [];
  if (rule.mode === "rules") {
    const address = shipTo ?? {},
      country = String(address.country ?? "US").toUpperCase(),
      state = String(address.state ?? "").toUpperCase(),
      zip = String(address.postalCode ?? "").replace(/[- ]/g, "");
    const matches = rule.zones
      .map((z: any) => ({
        z,
        level: Math.max(
          0,
          ...z.zipPrefixes
            .filter(
              (prefix: string) => country === "US" && zip.startsWith(prefix),
            )
            .map((p: string) => (p.length === 5 ? 5 : 4)),
          country === "US" && z.states.includes(state) ? 3 : 0,
          z.countries.includes(country) ? 2 : 0,
        ),
      }))
      .filter((r: any) => r.level)
      .sort((a: any, b: any) => b.level - a.level);
    const found = matches[0]?.z;
    chosen = found?.eligible ?? rule.defaultEligible ?? [];
    zone = found?.name ?? (chosen.length ? "Default" : null);
  }
  return {
    source,
    ruleId: rule.id,
    revision: rule.revision,
    mode: rule.mode,
    zone,
    shortage: rule.shortage,
    eligible: chosen,
    status: chosen.length ? "routed" : "waiting",
    reason: chosen.length
      ? "Owner routing rule"
      : rule.mode === "channel-location"
        ? "Channel location has no warehouse mapping."
        : "No matching destination zone or default.",
  };
}
export function publishedWarehouses(s: State, channel: Row, location?: string) {
  const rule = activeRule(s, `channel:${channel.id}`);
  if (!rule) return [channel.warehouse];
  if (rule.mode === "fixed") return rule.eligible;
  if (rule.mode === "channel-location")
    return location ? (rule.locations[location] ?? []) : [];
  return [
    ...new Set<string>([
      ...(rule.defaultEligible ?? []),
      ...rule.zones.flatMap((z: any) => z.eligible),
    ]),
  ];
}
export function routing(c: Context, type: string, p: any): Row | undefined {
  if (type === "customer.splitPolicy") {
    requireRole(c, []);
    const customer = get(c.s, "parties", p.customerId);
    fresh(customer, p.version);
    if (customer.kind !== "customer" || typeof p.allowSplit !== "boolean")
      fail(
        "CUSTOMER_POLICY",
        "Choose a customer and an explicit split-shipment decision.",
      );
    customer.allowSplit = p.allowSplit;
    customer.splitPolicy = {
      actorId: c.actor.id,
      at: c.now,
      reason: text(p.reason),
    };
    customer.version++;
    return customer;
  }
  if (type !== "routing.save" && type !== "routing.activate") return;
  requireRole(c, []);
  if (type === "routing.activate") {
    const rule = get(c.s, "routingRules", p.ruleId);
    fresh(rule, p.version);
    if (rule.activeAt) return rule;
    if (!rule.dryRun || rule.dryRun.frontier !== routingFrontier(c.s))
      fail(
        "ROUTING_REVIEW",
        "Dry-run the exact rule against current orders before activating it.",
      );
    rule.activeAt = c.now;
    rule.activatedBy = c.actor.id;
    rule.version++;
    return rule;
  }
  const source = text(p.source, "Order source");
  if (!["manual", "file", "document"].includes(source)) {
    const [kind, id, ...extra] = source.split(":");
    if (extra.length || !["channel", "edi", "recurring"].includes(kind))
      fail(
        "ROUTING_SOURCE",
        "Choose manual, file, document, channel, EDI partner or recurring source.",
      );
    get(
      c.s,
      kind === "channel"
        ? "channels"
        : kind === "edi"
          ? "ediPartners"
          : "recurringOrders",
      id,
    );
  }
  if (
    !["fixed", "channel-location", "rules"].includes(p.mode) ||
    !["hold", "next", "split"].includes(p.shortage)
  )
    fail(
      "ROUTING_MODE",
      "Choose fixed, channel-location or rules and hold, next or split shortage handling.",
    );
  if (
    p.mode === "fixed" &&
    (!Array.isArray(p.eligible) || p.eligible.length !== 1)
  )
    fail("ROUTING_WAREHOUSE", "Fixed routing names exactly one warehouse.");
  const locations: Record<string, string[]> = {};
  if (p.mode === "channel-location") {
    if (
      !p.locations ||
      Object.keys(p.locations).length > 100 ||
      !Object.keys(p.locations).length
    )
      fail("ROUTING_LOCATION", "Map at least one channel location.");
    for (const [key, value] of Object.entries(p.locations)) {
      const list = eligible(c.s, value);
      if (list.length !== 1)
        fail(
          "ROUTING_LOCATION",
          "Map each channel location to exactly one warehouse.",
        );
      locations[text(key, "Channel location")] = list;
    }
  }
  const seen = new Set<string>();
  const zones =
    p.mode === "rules"
      ? (p.zones ?? []).map((z: any) => {
          const value = {
            name: text(z.name, "Zone name"),
            zipPrefixes: (z.zipPrefixes ?? []).flatMap((value: unknown) => {
              if (typeof value !== "string")
                fail("ROUTING_ZONE", "Use ZIP prefix text.");
              const range = /^(\d{3}|\d{5})-(\d{3}|\d{5})$/.exec(
                value as string,
              );
              if (!range) return [value];
              const low = Number(range[1]),
                high = Number(range[2]);
              if (
                range[1].length !== range[2].length ||
                high < low ||
                high - low > 1000
              )
                fail(
                  "ROUTING_ZONE",
                  "Use an ascending ZIP prefix range of at most 1,001 prefixes.",
                );
              return Array.from({ length: high - low + 1 }, (_, i) =>
                String(low + i).padStart(range[1].length, "0"),
              );
            }),
            states: z.states ?? [],
            countries: z.countries ?? [],
            eligible: eligible(c.s, z.eligible),
          };
          if (
            ![value.zipPrefixes, value.states, value.countries].every(
              Array.isArray,
            ) ||
            (!value.zipPrefixes.length &&
              !value.states.length &&
              !value.countries.length)
          )
            fail(
              "ROUTING_ZONE",
              "Give each zone a ZIP prefix, state or country.",
            );
          for (const [kind, values] of [
            ["zip", value.zipPrefixes],
            ["state", value.states],
            ["country", value.countries],
          ] as const)
            for (const code of values) {
              if (
                typeof code !== "string" ||
                !(kind === "zip" ? /^(\d{3}|\d{5})$/ : /^[A-Z]{2}$/).test(code)
              )
                fail(
                  "ROUTING_ZONE",
                  "Use three/five-digit ZIP prefixes and uppercase two-letter states/countries.",
                );
              const key = `${kind}:${code}`;
              if (seen.has(key))
                fail(
                  "ROUTING_OVERLAP",
                  `Same-level destination ${code} overlaps another zone.`,
                );
              seen.add(key);
            }
          return value;
        })
      : [];
  if (
    zones.length > 100 ||
    new Set(zones.map((z: any) => z.name)).size !== zones.length
  )
    fail("ROUTING_ZONE", "Use up to 100 distinct named zones.");
  return row(c, "routingRules", {
    source,
    revision:
      Math.max(
        0,
        ...c.s.routingRules
          .filter((r) => r.source === source)
          .map((r) => r.revision),
      ) + 1,
    mode: p.mode,
    shortage: p.shortage,
    eligible: p.mode === "fixed" ? eligible(c.s, p.eligible) : [],
    locations,
    zones,
    defaultEligible: p.defaultEligible?.length
      ? eligible(c.s, p.defaultEligible)
      : [],
    activeAt: null,
    preparedBy: c.actor.id,
  });
}
