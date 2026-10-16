import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import '../../src/styles.css'

// Run Vite with an empty VITE_FIREBASE_API_KEY for local-only social actions.
// Use published geometry so rehearsal never depends on live map queries.
createRoot(document.getElementById('root')!).render(<App publishedMap />)
