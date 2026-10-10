import { useEffect, useState } from 'react'
import type { CampusPose, CampusSession } from '../lib/campusProtocol'
import { FINDER_INTERVAL_MS, locatePeople } from '../lib/peopleFinder'
import type { FinderLandmark, LocatedPerson } from '../lib/peopleFinder'

export function usePeopleFinder(session: React.RefObject<CampusSession>, pose: React.RefObject<CampusPose | null>, landmarks: FinderLandmark[], muted: ReadonlySet<string>, enabled: boolean) {
  const [people, setPeople] = useState<LocatedPerson[]>([])
  useEffect(() => {
    if (!enabled) { setPeople([]); return }
    const update = () => {
      if (document.hidden) return
      const { snapshot, id, snapshotReceivedAt } = session.current
      const now = snapshot && snapshotReceivedAt !== undefined ? snapshot.serverTime + performance.now() - snapshotReceivedAt : Date.now()
      setPeople(locatePeople(snapshot, id, pose.current, landmarks, muted, now))
    }
    update()
    const timer = window.setInterval(update, FINDER_INTERVAL_MS)
    document.addEventListener('visibilitychange', update)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [session, pose, landmarks, muted, enabled])
  return people
}
