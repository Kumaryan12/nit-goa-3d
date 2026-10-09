import { createContext, Suspense, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CampusLoadingScreen from './CampusLoadingScreen'
import type { CampusLoadingScreenProps } from './CampusLoadingScreen'

const CampusLoadingContext = createContext<{
  startedAt: number
  report: (screen: CampusLoadingScreenProps | null) => void
} | null>(null)

export const useCampusLoadingBoundary = () => useContext(CampusLoadingContext)

// Own the intro outside Suspense. Resolving the campus bundle updates progress
// on the same DOM node instead of replacing the fallback and replaying AK.
export default function CampusLoadingBoundary({ children }: { children: ReactNode }) {
  const startedAt = useRef(performance.now())
  const [screen, report] = useState<CampusLoadingScreenProps | null>({})
  const loading = useMemo(() => ({ startedAt: startedAt.current, report }), [])
  return <CampusLoadingContext.Provider value={loading}>
    <Suspense fallback={null}>{children}</Suspense>
    {screen && <CampusLoadingScreen {...screen} />}
  </CampusLoadingContext.Provider>
}
