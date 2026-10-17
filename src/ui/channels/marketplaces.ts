// Amazon's official Marketplace IDs and SP-API Endpoints directories.
// Choosing a marketplace also chooses its regional API origin.
export const marketplaces = [
  { id: 'ATVPDKIKX0DER', name: 'United States', region: 'na' },
  { id: 'A2EUQ1WTGCTBG2', name: 'Canada', region: 'na' },
  { id: 'A1AM78C64UM0Y8', name: 'Mexico', region: 'na' },
  { id: 'A2Q3Y263D00KWC', name: 'Brazil', region: 'na' },
  { id: 'A1F83G8C2ARO7P', name: 'United Kingdom', region: 'eu' },
  { id: 'A1PA6795UKMFR9', name: 'Germany', region: 'eu' },
  { id: 'A13V1IB3VIYZZH', name: 'France', region: 'eu' },
  { id: 'APJ6JRA9NG5V4', name: 'Italy', region: 'eu' },
  { id: 'A1RKKUPIHCS9HS', name: 'Spain', region: 'eu' },
  { id: 'A1805IZSGTT6HS', name: 'Netherlands', region: 'eu' },
  { id: 'AMEN7PMS3EDWL', name: 'Belgium', region: 'eu' },
  { id: 'A28R8C7NBKEWEA', name: 'Ireland', region: 'eu' },
  { id: 'A2NODRKZP88ZB9', name: 'Sweden', region: 'eu' },
  { id: 'A1C3SOZRARQ6R3', name: 'Poland', region: 'eu' },
  { id: 'A33AVAJ2PDY3EV', name: 'Turkey', region: 'eu' },
  { id: 'A21TJRUUN4KGV', name: 'India', region: 'eu' },
  { id: 'A2VIGQ35RCS4UG', name: 'United Arab Emirates', region: 'eu' },
  { id: 'A17E79C6D8DWNP', name: 'Saudi Arabia', region: 'eu' },
  { id: 'ARBP9OOSHTCHU', name: 'Egypt', region: 'eu' },
  { id: 'AE08WJ6YKNBMC', name: 'South Africa', region: 'eu' },
  { id: 'A1VC38T7YXB528', name: 'Japan', region: 'fe' },
  { id: 'A39IBJ37TRP1C6', name: 'Australia', region: 'fe' },
  { id: 'A19VAU5U5O7RUS', name: 'Singapore', region: 'fe' },
]
export const marketplaceOrigin = (id: string) => {
  const region = marketplaces.find(row => row.id === id)?.region
  return region ? `https://sellingpartnerapi-${region}.amazon.com` : ''
}
