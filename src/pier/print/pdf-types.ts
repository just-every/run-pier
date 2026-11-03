/** Render-ready values from the retained record and document template versions. */
export interface BusinessPDFInput {
  title: string;
  reference: string;
  recordVersion: number;
  templateVersion: number;
  company: { name: string; address: string; remitTo?: string };
  recipient?: string;
  terms: string;
  fields?: { label: string; value: string }[];
  lines: {
    description: string;
    itemCode?: string;
    quantity?: string;
    unit?: string;
    baseQuantity?: string;
    price?: string;
    total?: string;
    lotSerial?: string;
    customFields?: string;
    payNowUrl?: string;
    /** Present only on a statement invoice balance row, not its quantity detail. */
    invoiceId?: string;
  }[];
  totals?: { label: string; value: string }[];
  payNowUrl?: string;
  footer?: string;
  logo?: boolean;
  /** Owner-selected, validated PNG bytes, encoded as base64 (no data URL). */
  logoBase64?: string;
}
