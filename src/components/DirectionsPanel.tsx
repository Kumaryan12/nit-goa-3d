import { memo, useMemo } from 'react'
import { routeDirections } from '../lib/directions'
import type { RoutePresentation } from '../lib/traversal'
function DirectionsPanel({ presentation }: { presentation: RoutePresentation }) {
  const steps = useMemo(() => routeDirections(presentation.route.path, presentation.endName), [presentation])
  return <section className="directions-panel" aria-label="Walking directions"><h3>Directions to {presentation.endName}</h3>
    <p className="panel-muted">Start at {presentation.startName}.</p><ol>{steps.map((step, i) => <li key={i}>{step.instruction}</li>)}</ol>
    <p className="panel-muted">Blue: mapped road route. Dashed gold: unverified connections ({Math.round(presentation.route.startConnection + presentation.route.endConnection)} m). Location anchors and door access are approximate. Assumes authorized campus access and 80 m/min walking speed.</p>
  </section>
}
export default memo(DirectionsPanel)
