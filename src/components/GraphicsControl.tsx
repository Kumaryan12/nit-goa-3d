import type { GraphicsMode } from '../lib/graphics'
import { validGraphicsMode } from '../lib/graphics'

export default function GraphicsControl({ mode, onChange }: { mode: GraphicsMode; onChange: (mode: GraphicsMode) => void }) {
  return <label className="graphics-control">Graphics
    <select aria-label="Graphics quality" value={mode} onChange={event => onChange(validGraphicsMode(event.target.value))}>
      <option value="auto">Auto</option><option value="smooth">Smooth</option><option value="detailed">Detailed</option>
    </select>
  </label>
}
