import { useEffect, useId, useState } from 'react'
import { campusUpdates } from '../data/campusUpdate'
import type { CampusUpdateDestination } from '../data/campusUpdate'
import { navigate } from '../lib/community'
import { acknowledgeCampusUpdate, campusUpdateStorageKey, unreadCampusUpdates } from '../lib/campusUpdate'
import './CampusUpdateNotice.css'

export default function CampusUpdateNotice({ ready, busy, open, onOpen, onClose, onExplore }: {
  ready: boolean; busy: boolean; open: boolean; onOpen: () => void; onClose: () => void
  onExplore: (destination: CampusUpdateDestination) => void
}) {
  const [unread, setUnread] = useState(() => unreadCampusUpdates()), [visible, setVisible] = useState(() => unread.length > 0), id = useId()
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== campusUpdateStorageKey && event.key !== null) return
      const next = unreadCampusUpdates(); setUnread(next); setVisible(next.length > 0)
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  useEffect(() => {
    if (!open) return
    setVisible(false); acknowledgeCampusUpdate()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])
  const dismiss = () => { setVisible(false); acknowledgeCampusUpdate() }
  if (!ready || !open && (busy || !visible)) return null
  return <section className={`campus-update-notice${open ? ' campus-update-expanded' : ''}`} aria-labelledby={id}>
    <button className="campus-update-close" aria-label={open ? 'Close campus updates' : 'Dismiss campus update'} onClick={open ? onClose : dismiss}>×</button>
    <span className="campus-update-eyebrow">✦ What’s new</span>
    <h2 id={id}>{open ? 'Campus updates' : 'What’s new on campus'}</h2>
    {!open && <>
      <p>{unread.length} {unread.length === 1 ? 'new update' : 'updates'} to catch up on.</p>
      <ul className="campus-update-highlights">{unread.slice(0, 3).map(update => <li key={update.id}>{update.title}</li>)}</ul>
    </>}
    {open && <div className="campus-update-list" tabIndex={0} role="region" aria-label="All campus updates">
      {campusUpdates.map(update => <article className="campus-update-item" key={update.id}>
        <span className="campus-update-kind">{update.kind}</span>
        <h3>{update.title}</h3>
        <p>{update.detail}</p>
        {update.destination && <button className="campus-update-shortcut" onClick={() => { onClose(); onExplore(update.destination!) }}>{update.action} <span aria-hidden="true">↗</span></button>}
      </article>)}
    </div>}
    <div className="campus-update-links">
      <button className="campus-update-explore" onClick={open ? onClose : () => { dismiss(); onOpen() }}>{open ? 'Back to campus' : 'See all updates'} <span aria-hidden="true">{open ? '✓' : '↗'}</span></button>
      {open ? <a href="/updates" onClick={event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault(); onClose(); navigate('/updates')
      }}>Full update log</a> : <button className="campus-update-later" onClick={dismiss}>Later</button>}
    </div>
  </section>
}
