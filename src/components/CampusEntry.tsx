import { lazy, Suspense, useCallback, useState } from 'react'
import { campusUnderConstruction } from '../lib/maintenance'
import MaintenancePage from './MaintenancePage'

// Keep Firebase, Three.js and live server connections unloaded during maintenance.
const CommunityApp = lazy(() => import('./CommunityApp'))

export default function CampusEntry() {
  const [maintenance, setMaintenance] = useState(campusUnderConstruction)
  const reopen = useCallback(() => setMaintenance(false), [])
  return maintenance ? <MaintenancePage onReopen={reopen} /> : <Suspense fallback={<div role="status" style={{ padding: 32 }}>Opening campus…</div>}><CommunityApp /></Suspense>
}
