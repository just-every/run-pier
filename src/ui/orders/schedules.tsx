import { records, type PierState, type RunCommand } from "../api";
import { Field, Form, Select, Table, text, Amount } from "../controls";
const options = (values: string[]) =>
  values.map((id) => ({ id, version: 1, label: id }));
export function ScheduledSales({
  state,
  run,
  busy,
}: {
  state: PierState;
  run: RunCommand;
  busy: boolean;
}) {
  const customers = records(state, "parties").filter(
      (p) => p.kind === "customer",
    ),
    suppliers = records(state, "parties").filter((p) => p.kind === "supplier"),
    items = records(state, "items").filter((i) => !i.archived),
    warehouses = [
      ...new Set<string>(
        records(state, "locations")
          .filter((l) => l.kind === "bin")
          .map((l) => l.warehouse),
      ),
    ],
    owner = state.actor.role === "owner";
  return (
    <>
      <details className="panel">
        <summary>Recurring wholesale orders</summary>
        <Form
          title="Review customer credit clearance"
          submit="Save owner credit decision"
          busy={busy}
          disabled={!owner}
          note="This is an explicit owner-reviewed allowance, not a connected ledger balance. A hold or expired clearance stops recurring orders."
          onSubmit={(d) => {
            const customer = customers.find(
              (c) => c.id === text(d, "customerId"),
            );
            return run("customer.creditClearance", {
              customerId: customer?.id,
              version: customer?.version,
              status: text(d, "status"),
              allowance: text(d, "allowance"),
              validThrough: text(d, "validThrough"),
              reason: text(d, "reason"),
            });
          }}
        >
          <Select label="Credit customer" name="customerId" rows={customers} />
          <Select
            label="Credit decision"
            name="status"
            rows={options(["clear", "hold"])}
          />
          <Field
            label="Reviewed credit allowance USD"
            name="allowance"
            inputMode="decimal"
            defaultValue="0"
          />
          <Field
            label="Credit clearance valid through"
            name="validThrough"
            type="date"
          />
          <Field label="Credit clearance reason" name="reason" />
        </Form>
        <Form
          title="Authorize a recurring order"
          submit="Save recurring order policy"
          busy={busy}
          disabled={!owner}
          note="The daily cadence uses UTC days. An enabled policy may create one due order per scheduler pass within its price, credit and stock limits; it never sends customer mail or ships stock."
          onSubmit={(d) =>
            run("recurring.save", {
              name: text(d, "name"),
              customerId: text(d, "customerId"),
              warehouse: text(d, "warehouse"),
              cadenceDays: Number(text(d, "cadenceDays")),
              nextDue: text(d, "nextDue"),
              pricePolicy: text(d, "pricePolicy"),
              stockPolicy: text(d, "stockPolicy"),
              ceiling: text(d, "ceiling"),
              enabled: d.get("enabled") === "on",
              reason: text(d, "reason"),
              lines: [
                {
                  itemId: text(d, "itemId"),
                  quantity: text(d, "quantity"),
                  ...(text(d, "price") ? { price: text(d, "price") } : {}),
                },
              ],
            })
          }
        >
          <Field label="Recurring order name" name="name" />
          <Select
            label="Recurring customer"
            name="customerId"
            rows={customers}
          />
          <Select
            label="Recurring warehouse"
            name="warehouse"
            rows={options(warehouses)}
          />
          <Select label="Recurring item" name="itemId" rows={items} />
          <Field
            label="Recurring base quantity"
            name="quantity"
            inputMode="decimal"
          />
          <Field
            label="Recurring unit price USD (blank uses current tier)"
            name="price"
            required={false}
          />
          <Field
            label="Cadence in days"
            name="cadenceDays"
            type="number"
            defaultValue="7"
            min="1"
            max="366"
          />
          <Field label="Next recurrence day" name="nextDue" type="date" />
          <Select
            label="Recurring price policy"
            name="pricePolicy"
            rows={options(["hold-on-change", "current-with-ceiling"])}
            defaultValue="hold-on-change"
          />
          <Select
            label="Recurring stock policy"
            name="stockPolicy"
            rows={options(["full-stock", "backorder"])}
            defaultValue="full-stock"
          />
          <Field label="Maximum order total USD" name="ceiling" />
          <Field label="Recurring approval reason" name="reason" />
          <label className="field">
            <span>Enable approved recurrence</span>
            <input
              aria-label="Enable approved recurrence"
              name="enabled"
              type="checkbox"
            />
          </label>
        </Form>
        {records(state, "recurringOrders").map((schedule) => (
          <section className="panel" key={schedule.id}>
            <h2>Recurring · {schedule.name}</h2>
            <p>
              {schedule.cancelled
                ? "Cancelled"
                : schedule.enabled
                  ? "Enabled"
                  : "Paused"}{" "}
              · next due {schedule.nextDue} ·{" "}
              {schedule.lastOutcome?.reason ??
                schedule.lastOutcome?.status ??
                "Not yet run"}
            </p>
            <div className="actions">
              <button
                disabled={busy || !owner || !schedule.enabled}
                onClick={() =>
                  run("recurring.run", {
                    scheduleId: schedule.id,
                    version: schedule.version,
                  })
                }
              >
                Run due occurrence
              </button>
            </div>
            <Form
              title={`Pause or cancel ${schedule.name}`}
              submit="Apply recurring control"
              busy={busy}
              disabled={!owner}
              onSubmit={(d) =>
                run(
                  text(d, "action") === "cancel"
                    ? "recurring.cancel"
                    : "recurring.pause",
                  {
                    scheduleId: schedule.id,
                    version: schedule.version,
                    reason: text(d, "reason"),
                  },
                )
              }
            >
              <Select
                label="Recurring control"
                name="action"
                rows={options(["pause", "cancel"])}
                defaultValue="pause"
              />
              <Field label="Recurring control reason" name="reason" />
            </Form>
            <Table headings={["Due day", "Order", "Total USD"]}>
              {schedule.occurrences.map((o: any) => (
                <tr key={o.due}>
                  <td>{o.due}</td>
                  <td>
                    <a href={`#sales/${o.orderId}`}>Open generated order</a>
                  </td>
                  <td>
                    <Amount value={o.total} />
                  </td>
                </tr>
              ))}
            </Table>
          </section>
        ))}
      </details>
      <details className="panel">
        <summary>Direct supplier dropships</summary>
        <Form
          title="Link a direct supplier order"
          submit="Create linked sales demand and supplier PO"
          busy={busy}
          disabled={!owner}
          note="The supplier PO starts as a draft. Approve and commit it in Purchasing before confirmation. Direct shipments never enter Pier warehouse stock."
          onSubmit={(d) =>
            run("dropship.create", {
              customerId: text(d, "customerId"),
              supplierId: text(d, "supplierId"),
              shipTo: text(d, "shipTo"),
              promiseDate: text(d, "promiseDate"),
              reason: text(d, "reason"),
              lines: [
                {
                  itemId: text(d, "itemId"),
                  quantity: text(d, "quantity"),
                  price: text(d, "price"),
                  cost: text(d, "cost"),
                },
              ],
            })
          }
        >
          <Select
            label="Dropship customer"
            name="customerId"
            rows={customers}
          />
          <Select
            label="Dropship supplier"
            name="supplierId"
            rows={suppliers}
          />
          <Select label="Dropship item" name="itemId" rows={items} />
          <Field label="Dropship base quantity" name="quantity" />
          <Field label="Dropship customer unit price USD" name="price" />
          <Field label="Dropship supplier unit cost USD" name="cost" />
          <Field label="Direct customer shipping address" name="shipTo" />
          <Field
            label="Requested supplier date"
            name="promiseDate"
            type="date"
          />
          <Field label="Dropship reason" name="reason" />
        </Form>
        {records(state, "dropships").map((drop) => (
          <section className="panel" key={drop.id}>
            <h2>
              Dropship ·{" "}
              {
                records(state, "orders").find((o) => o.id === drop.orderId)
                  ?.reference
              }
            </h2>
            <p>
              {drop.status} · {drop.shipTo} · supplier PO{" "}
              {
                records(state, "purchaseOrders").find(
                  (po) => po.id === drop.poId,
                )?.reference
              }
            </p>
            {!drop.confirmation && (
              <Form
                title="Record supplier confirmation"
                submit="Confirm direct supplier commitment"
                busy={busy}
                disabled={!owner}
                onSubmit={(d) =>
                  run("dropship.confirm", {
                    dropshipId: drop.id,
                    version: drop.version,
                    supplierReference: text(d, "reference"),
                    shipDate: text(d, "shipDate"),
                  })
                }
              >
                <Field
                  label="Supplier confirmation reference"
                  name="reference"
                />
                <Field
                  label="Confirmed supplier ship date"
                  name="shipDate"
                  type="date"
                />
              </Form>
            )}
            {drop.confirmation && (
              <Form
                title="Record direct supplier tracking"
                submit="Record direct shipment"
                busy={busy}
                disabled={!owner}
                onSubmit={(d) =>
                  run("dropship.ship", {
                    dropshipId: drop.id,
                    version: drop.version,
                    supplierReference: text(d, "reference"),
                    carrier: text(d, "carrier"),
                    tracking: text(d, "tracking"),
                    shipDate: text(d, "shipDate"),
                    lines: drop.lines
                      .map((l: any) => ({
                        orderLineId: l.orderLineId,
                        quantity: text(d, l.orderLineId),
                      }))
                      .filter((l: any) => l.quantity && l.quantity !== "0"),
                  })
                }
              >
                <Field label="Supplier shipment reference" name="reference" />
                <Field label="Supplier carrier" name="carrier" />
                <Field label="Supplier tracking" name="tracking" />
                <Field
                  label="Actual supplier ship day"
                  name="shipDate"
                  type="date"
                />
                {drop.lines.map((l: any, i: number) => (
                  <Field
                    key={l.orderLineId}
                    label={`Direct shipped quantity ${i + 1}`}
                    name={l.orderLineId}
                    required={false}
                  />
                ))}
              </Form>
            )}
            <Table headings={["Supplier shipment", "Tracking", "Cost USD"]}>
              {drop.shipments.map((s: any) => (
                <tr key={s.id}>
                  <td>{s.reference}</td>
                  <td>
                    {s.carrier} · {s.tracking}
                  </td>
                  <td>
                    {s.lines.map((l: any) => (
                      <Amount key={l.orderLineId} value={l.costTotal} />
                    ))}
                  </td>
                </tr>
              ))}
            </Table>
            {drop.shipments.map((shipment: any) => (
              <Form
                key={shipment.id}
                title={`Authorize customer credit · ${shipment.reference}`}
                submit="Authorize retained customer credit"
                busy={busy}
                disabled={!owner}
                note="This immutable credit record has no warehouse stock effect and is explicitly not posted to the connected ledger."
                onSubmit={(d) =>
                  run("dropship.credit", {
                    dropshipId: drop.id,
                    version: drop.version,
                    shipmentId: shipment.id,
                    orderLineId: text(d, "lineId"),
                    quantity: text(d, "quantity"),
                    reference: text(d, "reference"),
                    reason: text(d, "reason"),
                  })
                }
              >
                <Select
                  label="Direct shipment credit line"
                  name="lineId"
                  rows={shipment.lines.map((l: any) => ({
                    id: l.orderLineId,
                    version: 1,
                    label:
                      items.find((i) => i.id === l.itemId)?.name ?? l.itemId,
                  }))}
                />
                <Field
                  label="Direct customer credit quantity"
                  name="quantity"
                />
                <Field
                  label="Direct customer credit reference"
                  name="reference"
                />
                <Field label="Direct customer credit reason" name="reason" />
              </Form>
            ))}
            {drop.credits.map((credit: any) => (
              <p key={credit.id}>
                {credit.reference} · authorized customer credit{" "}
                <Amount value={credit.amount} /> USD · {credit.postingAuthorizedAt ? `Books: ${credit.posting}` : 'not posted to books'}
                {!credit.postingAuthorizedAt && <button type="button" disabled={busy || !owner} onClick={() => run('dropship.postCredit', { dropshipId: drop.id, version: drop.version, creditId: credit.id })}>Post customer credit to Pantry</button>}
              </p>
            ))}
          </section>
        ))}
      </details>
    </>
  );
}
