import { Field, text } from '../controls'
import type { Address } from './model'

export function readAddress(data: FormData): Address {
  return { ...Object.fromEntries(['name', 'street1', 'street2', 'city', 'state', 'zip', 'phone'].map(key => [key, text(data, key).trim()])), country: 'US', residential: data.has('residential') } as Address
}

export function AddressFields({ address, disabled, nameLabel = 'Recipient or business name' }: { address?: Address; disabled: boolean; nameLabel?: string }) {
  return <>
    <Field label={nameLabel} name="name" defaultValue={address?.name ?? ''} autoComplete="name" disabled={disabled} />
    <Field label="Street address" name="street1" defaultValue={address?.street1 ?? ''} autoComplete="address-line1" disabled={disabled} />
    <Field label="Apartment, suite or unit" name="street2" defaultValue={address?.street2 ?? ''} autoComplete="address-line2" required={false} disabled={disabled} />
    <Field label="City" name="city" defaultValue={address?.city ?? ''} autoComplete="address-level2" disabled={disabled} />
    <Field label="State" name="state" defaultValue={address?.state ?? ''} autoComplete="address-level1" disabled={disabled} maxLength={2} hint="Two-letter US state code." />
    <Field label="ZIP code" name="zip" defaultValue={address?.zip ?? ''} autoComplete="postal-code" disabled={disabled} />
    <Field label="Country" value="United States" readOnly />
    <Field label="Phone" name="phone" type="tel" defaultValue={address?.phone ?? ''} autoComplete="tel" required={false} disabled={disabled} />
    <label className="check"><input type="checkbox" name="residential" defaultChecked={address?.residential ?? false} disabled={disabled} /><span>Residential address</span></label>
  </>
}

export function SavedAddress({ address }: { address: Address }) {
  return <div className="shipping-address"><span>{address.name}</span><span>{address.street1}</span>{address.street2 && <span>{address.street2}</span>}<span>{address.city}, {address.state} {address.zip}</span><span>{address.country}</span>{address.phone && <span>{address.phone}</span>}{typeof address.residential === 'boolean' && <span>{address.residential ? 'Residential' : 'Commercial'}</span>}</div>
}
