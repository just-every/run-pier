import { useState } from "react";
import {
  records,
  type PierState,
  type RecordData,
  type RunCommand,
} from "../api";
import { Field, Form, Select, Table, text, Amount } from "../controls";
import { approvalPolicy, QuoteApprovalSettings } from './quote-approval';
export function Commercial({
  state,
  order,
  run,
  busy,
}: {
  state: PierState;
  order: RecordData;
  run: RunCommand;
  busy: boolean;
}) {
  const documents = records(state, "salesDocuments").filter(
    (d) => d.recordId === order.id,
  );
  const quote = order.documentType === "quote" && !order.acceptedAt;
  const approverRole = approvalPolicy(state)?.role ?? 'owner';
  return (
    <>
      {quote && (
        <>
          <Form
            key={`review-${order.id}-${order.version}`}
            title="Review quote prices and margin"
            submit="Approve exact quote"
            busy={busy}
            disabled={!['owner', approverRole].includes(state.actor.role)}
            note={`Version ${order.version} · discount ${order.discountPercent}% · tax ${order.tax?.source ?? "Pending"} · valid through ${order.validUntil}. Approver role: ${approverRole}. Approval binds these prices and the observed costs.`}
            onSubmit={(d) =>
              run("quote.approve", {
                orderId: order.id,
                version: order.version,
                reason: text(d, "reason"),
              })
            }
          >
            <Field
              label="Price, discount and margin review reason"
              name="reason"
            />
          </Form>
          <Form
            key={`revise-${order.id}-${order.version}`}
            title="Revise quote"
            submit="Save new quote version"
            busy={busy}
            note="Changing quantities, prices or terms clears approval. Previously generated PDFs remain unchanged."
            onSubmit={(d) =>
              run("quote.revise", {
                orderId: order.id,
                version: order.version,
                customerId: order.customerId,
                reason: text(d, "reason"),
                shipTo: {
                  ...order.shipTo,
                  state: text(d, "state").toUpperCase(),
                  postalCode: text(d, "postalCode"),
                },
                validUntil: text(d, "validUntil"),
                discountPercent: text(d, "discountPercent"),
                lines: order.lines.map((l: any) => ({
                  itemId: l.itemId,
                  quantity: text(d, `q-${l.id}`),
                  price: text(d, `p-${l.id}`),
                })),
              })
            }
          >
            <Field label="Quote revision reason" name="reason" />
            <Field
              label="Revised destination state"
              name="state"
              defaultValue={order.shipTo?.state ?? ""}
            />
            <Field
              label="Revised destination ZIP"
              name="postalCode"
              defaultValue={order.shipTo?.postalCode ?? ""}
            />
            <Field
              label="Revised valid through"
              name="validUntil"
              type="date"
              defaultValue={order.validUntil}
            />
            <Field
              label="Revised discount percent"
              name="discountPercent"
              defaultValue={order.discountPercent}
            />
            {order.lines.map((l: any, i: number) => (
              <div key={l.id}>
                <Field
                  label={`Revised base quantity ${i + 1}`}
                  name={`q-${l.id}`}
                  defaultValue={l.quantity}
                />
                <Field
                  label={`Revised base unit price ${i + 1}`}
                  name={`p-${l.id}`}
                  defaultValue={l.listPrice ?? l.price}
                />
              </div>
            ))}
          </Form>
        </>
      )}
      <Form
        key={`send-${order.id}-${order.version}`}
        title={quote ? "Email approved quote" : "Email order confirmation"}
        submit="Approve recipient and submit PDF"
        busy={busy}
        disabled={state.actor.role !== "owner"}
        note="The exact generated PDF and recipient are retained. Sent means provider acceptance; unavailable, failed and uncertain submissions stay visible."
        onSubmit={(d) =>
          run(quote ? "quote.send" : "order.confirm", {
            orderId: order.id,
            version: order.version,
            recipient: text(d, "recipient"),
          })
        }
      >
        <Field
          label="Approved document recipient"
          name="recipient"
          type="email"
        />
      </Form>
      {documents.length > 0 && (
        <section className="panel">
          <h2>Retained sales documents</h2>
          <Table headings={["Document", "Recipient", "Outcome", "PDF"]}>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.kind} · version {d.recordVersion}
                </td>
                <td>{d.recipient}</td>
                <td>
                  {records(state, "deliveries").find(
                    (r) => r.correspondenceId === d.id,
                  )?.phase ?? "Awaiting submission"}
                </td>
                <td>
                  <a
                    href={`/api/pier/sales-documents/${d.id}.pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open retained PDF
                  </a>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </>
  );
}
export function SalesIntake({
  state,
  run,
  busy,
}: {
  state: PierState;
  run: RunCommand;
  busy: boolean;
}) {
  const [csv, setCSV] = useState(""),
    [name, setName] = useState("customer-orders.csv"),
    [xlsx, setXLSX] = useState(""),
    [fileError, setFileError] = useState("");
  return (
    <>
      <QuoteApprovalSettings state={state} run={run} busy={busy} />
      <Form
        title="Owner tax estimate table"
        submit="Save jurisdiction estimate"
        busy={busy}
        disabled={state.actor.role !== "owner"}
        note="US state rates are owner-maintained estimates. Provider tax, final invoices and filing remain separate."
        onSubmit={(d) => {
          const stateCode = text(d, "state").toUpperCase(),
            old = records(state, "salesPolicies").find(
              (r) => r.kind === "tax-table" && r.state === stateCode,
            );
          return run("sales.taxTable", {
            state: stateCode,
            rate: text(d, "rate"),
            reason: text(d, "reason"),
            ...(old ? { version: old.version } : {}),
          });
        }}
      >
        <Field label="Tax state (two letters)" name="state" />
        <Field label="Estimated tax percent" name="rate" inputMode="decimal" />
        <Field label="Tax table review reason" name="reason" />
      </Form>
      <Form
        title="Review a customer order file"
        submit="Preview customer orders"
        busy={busy}
        note="Choose CSV or a single-sheet, macro-free XLSX workbook up to 1 MiB. Use explicit values and ISO date text. Preview reports every row error and its routed warehouse; no order exists until approval."
        disabled={!!fileError || state.actor.role !== "owner"}
        onSubmit={() =>
          run("salesImport.stage", {
            name,
            ...(xlsx ? { xlsxBase64: xlsx } : { csv }),
          })
        }
      >
        <label className="field">
          <span>Customer order file</span>
          <input
            aria-label="Customer order file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setFileError("");
              if (file) {
                if (file.size > 1024 * 1024) {
                  setFileError("Choose a file up to 1 MiB.");
                  return;
                }
                setName(file.name);
                if (file.name.toLowerCase().endsWith(".xlsx")) {
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  let raw = "";
                  for (let i = 0; i < bytes.length; i += 8192)
                    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
                  setXLSX(btoa(raw));
                  setCSV("");
                } else {
                  setCSV(await file.text());
                  setXLSX("");
                }
              }
            }}
          />
        </label>
        <label className="field">
          <span>Customer order CSV</span>
          <textarea
            aria-label="Customer order CSV"
            disabled={!!xlsx}
            value={csv}
            onChange={(e) => setCSV(e.target.value)}
            rows={6}
          />
        </label>
        {xlsx && (
          <>
            <p>Workbook selected: {name}</p>
            <button
              type="button"
              onClick={() => {
                setXLSX("");
                setName("customer-orders.csv");
              }}
            >
              Use CSV text instead
            </button>
          </>
        )}
        {fileError && <p role="alert">{fileError}</p>}
      </Form>
      {records(state, "salesImports").map((batch) => (
        <section className="panel" key={batch.id}>
          <h2>Customer file · {batch.name}</h2>
          <p>
            {batch.status} · {batch.groups.length} customer orders
          </p>
          <Table headings={["Row", "Item", "Price", "Warehouse", "Errors"]}>
            {batch.preview.map((r: any) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.source?.item}</td>
                <td>
                  <Amount value={r.line?.price} />
                </td>
                <td>{r.warehouse ?? r.source?.warehouse}</td>
                <td>
                  {r.errors.map((e: any) => e.message).join("; ") || "Ready"}
                </td>
              </tr>
            ))}
          </Table>
          {batch.status === "review" && (
            <button
              disabled={busy || batch.preview.some((r: any) => r.errors.length)}
              onClick={() =>
                run("salesImport.apply", {
                  importId: batch.id,
                  version: batch.version,
                })
              }
            >
              Approve exact customer orders
            </button>
          )}
          {batch.orderIds?.map((id: string) => (
            <p key={id}>
              <a href={`#sales/${id}`}>Open created order</a>
            </p>
          ))}
        </section>
      ))}
    </>
  );
}
