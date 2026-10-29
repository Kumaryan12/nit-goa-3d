import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CampusEntry from './components/CampusEntry'
import ApplicationBoundary from './components/ApplicationBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ApplicationBoundary><CampusEntry /></ApplicationBoundary>
  </StrictMode>,
)
