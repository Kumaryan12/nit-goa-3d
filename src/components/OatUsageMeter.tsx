import { oatUsageAmount } from '../lib/oatUsage'
import type { OatUsageStatus } from '../lib/oatUsage'

export default function OatUsageMeter({ usage, connected, compact = false }: { usage: OatUsageStatus; connected: boolean; compact?: boolean }) {
  const paused = usage.availability !== 'available'
  const status = !connected ? 'Reconnecting' : usage.availability === 'quota' ? 'Voice paused' : usage.availability === 'checking' ? 'Checking' : usage.availability === 'unavailable' ? 'Monitor offline' : usage.warningLevel === 2 ? 'Near cutoff' : usage.warningLevel === 1 ? 'Approaching limit' : 'Available'
  const amount = usage.usedBytes === null ? 'Usage pending' : `${oatUsageAmount(usage.usedBytes)} used`
  const cutoff = oatUsageAmount(usage.cutoffBytes)
  const renewal = usage.cycleEnd ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(usage.cycleEnd)) : null
  return <section className={`oat-usage ${compact ? 'oat-usage-compact' : ''} ${paused || !connected ? 'oat-usage-paused' : usage.warningLevel ? 'oat-usage-warning' : ''}`} aria-label="Shared voice usage">
    <div className="oat-usage-heading"><strong>Shared voice usage</strong><span role="status">{status}</span></div>
    <p className="oat-usage-total">{amount} <span>· {cutoff} cutoff</span></p>
    {!compact && <>
      <progress aria-label="Shared voice usage toward cutoff" aria-valuetext={`${amount}; voice pauses at ${cutoff}`} max={usage.cutoffBytes} {...(usage.usedBytes === null ? {} : { value: Math.min(usage.usedBytes, usage.cutoffBytes) })} />
      <p className="oat-muted">{usage.checkedAt !== null ? 'Last reported usage' : 'Waiting for usage monitor'}{renewal ? ` · Renews ${renewal} (UTC)` : ''}</p>
      {connected && !paused && usage.warningLevel > 0 && <p className="oat-usage-notice" role="status">{usage.warningLevel === 2 ? 'Almost at the shared limit.' : 'Shared usage is approaching the limit.'} Live voice pauses at {cutoff}.</p>}
    </>}
  </section>
}
