import { memo } from 'react'
import type { CampusStatistics } from '../lib/stats'
import type { SceneMetrics } from './CampusScene'

function CampusStats({ stats, metrics }: { stats: CampusStatistics; metrics: SceneMetrics | null }) {
  return <section className="campus-stats" aria-label="Campus statistics">
    <div className="stats-title"><span className="eyebrow">Campus at a glance</span>{metrics && <span className="fps-indicator">{metrics.fps} fps</span>}</div>
    <dl>
      <div><dt>Buildings</dt><dd>{stats.buildings}</dd></div>
      <div><dt>Road segments</dt><dd>{stats.roadSegments}</dd></div>
      <div><dt>Trees</dt><dd>{stats.trees}</dd></div>
    </dl>
    <p className="stats-detail">{stats.roads} mapped roadways · {stats.footpaths} footpaths</p>
  </section>
}
export default memo(CampusStats)
