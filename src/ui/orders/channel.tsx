import { ChannelBrand } from '../channels/brand'
import { providers, type Provider } from '../channels/model'
import { Icon } from '../icons'
import { channelName } from './model'

/** Where an order came from: a connected channel's mark, a person for orders entered in Pier, else its own name. */
export function ChannelMark({ channel, named = false }: { channel?: string | null; named?: boolean }) {
  const value = channel || 'manual', provider = providers.find(row => row.id === value)
  const mark = provider ? <ChannelBrand provider={provider.id as Provider} /> : value === 'manual' ? <Icon name="person" /> : <span className="channel-text">{value}</span>
  return <span className="channel-mark" title={channelName(value)}>{mark}{named ? <span>{channelName(value)}</span> : provider || value === 'manual' ? <span className="visually-hidden">{channelName(value)}</span> : null}</span>
}
