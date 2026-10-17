import type { PierState, RunCommand } from '../api'

export type ShippingProps = { state: PierState; run: RunCommand; busy: boolean }
export type Address = { name: string; street1: string; street2?: string; city: string; state: string; zip: string; country: string; phone?: string; residential?: boolean }
export type Settings = { id: string; version: number; mode: 'test' | 'production'; fromAddress: Address; connected: boolean; webhookConfigured: boolean }
export type Rate = { id: string; carrier: string; service: string; rate: string; currency: string; delivery_days: number | null; delivery_date: string | null; cheapest: boolean; fastest: boolean }
export type ShippingJob = {
  id: string; version: number; packId: string; orderId: string; carton: number; mode?: 'test' | 'production';
  originalAddress: Address; suggestedAddress: Address | null; addressChoice: 'suggested' | 'original' | null;
  verified: boolean; verificationErrors: string[]; email: string;
  status: 'draft' | 'verification_failed' | 'address_review' | 'verified' | 'rated' | 'buying' | 'labelled' | 'uncertain' | 'delivered';
  providerShipmentId: string | null; rates: Rate[]; selectedRateId: string | null; rateMessages?: string[]; problem?: string | null;
  trackingStatus?: string; lastTrackingAt?: string;
  trackingCode: string | null; trackingUrl: string | null; labelPdfUrl: string | null; labelZplUrl: string | null; shipmentId: string | null;
  events: { id: string; status: string; datetime: string; message: string }[];
  mail: { status: string; detail: string | null } | null;
}

export const canShip = (state: PierState) => ['owner', 'warehouse'].includes(state.actor.role)
export const editable = (job: ShippingJob) => ['draft', 'verification_failed', 'address_review', 'verified', 'rated'].includes(job.status)
