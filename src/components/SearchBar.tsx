import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { searchCampus } from '../lib/search'
import { categoryLabels } from '../types/campus'
import type { CampusLocation } from '../types/campus'

function SearchBar({ locations, onSelect }: { locations: CampusLocation[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const results = useMemo(() => searchCampus(query, locations), [query, locations])
  const index = Math.min(active, Math.max(0, results.length - 1))
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.current?.focus(); setOpen(true) } }
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', shortcut)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', shortcut) }
  }, [])
  const choose = (id: string) => { setOpen(false); setQuery(''); onSelect(id) }
  const expanded = open && Boolean(query.trim())
  return <div className="campus-search" ref={root}>
    <label className="sr-only" htmlFor={`${listId}-input`}>Search campus</label>
    <span className="search-symbol" aria-hidden="true">⌕</span>
    <input ref={input} id={`${listId}-input`} type="search" placeholder="Search campus..." autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
      aria-activedescendant={expanded && results.length ? `${listId}-${results[index].location.id}` : undefined}
      value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true) }} onFocus={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false) }
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index + 1) % Math.max(1, results.length)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive((index - 1 + results.length) % Math.max(1, results.length)) }
        if (event.key === 'Enter' && expanded && results[index]) { event.preventDefault(); choose(results[index].location.id) }
      }} />
    <kbd className="search-shortcut" aria-hidden="true">⌘ K</kbd>
    {expanded && <div className="search-dropdown">
      <div className="search-results-heading">Campus locations <span>{results.length}</span></div>
      <ul role="listbox" id={listId} aria-label="Campus search results">
        {results.map(({ location }, i) => <li key={location.id} role="option" id={`${listId}-${location.id}`} aria-selected={i === index}
          onPointerDown={(event) => event.preventDefault()} onClick={() => choose(location.id)} onPointerMove={() => setActive(i)}>
          <span className="search-result-icon" aria-hidden="true">{location.icon}</span>
          <span><strong>{location.name}</strong><small>{categoryLabels[location.category]}</small></span><span className="result-arrow" aria-hidden="true">↗</span>
        </li>)}
      </ul>
      {!results.length && <p className="search-empty">No locations found. Try “hostel”, “academic”, or “sports”.</p>}
      <span className="sr-only" role="status">{results.length} results found</span>
    </div>}
  </div>
}
export default memo(SearchBar)
