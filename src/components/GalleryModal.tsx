import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { campusLocations } from '../data/campus'
import { createGalleryRepository } from '../repositories/createGalleryRepository'
import { toggleLikeWithRollback } from '../lib/gallery'
import { useAuth } from '../hooks/useAuth'
import type { CampusLocation } from '../types/campus'
import type { GalleryPhoto, GalleryRepository } from '../types/gallery'
const PhotoViewer = lazy(() => import('./PhotoViewer'))
export default function GalleryModal({ locations = campusLocations, locationId, photoId, onPhoto, onClose, onUpload, onAuth }: {
  locations?: CampusLocation[]; locationId?: string; photoId: string | null; onPhoto: (id: string | null) => void; onClose: () => void; onUpload: (id?: string) => void; onAuth: () => void
}) {
  const [location, setLocation] = useState(locationId ?? ''), [sort, setSort] = useState<'latest' | 'popular'>('latest'), [photos, setPhotos] = useState<GalleryPhoto[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [demo, setDemo] = useState(true), [busy, setBusy] = useState(false)
  const auth = useAuth(), repository = useRef<GalleryRepository | null>(null), pending = useRef(false)
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    createGalleryRepository().then(async (repo) => { if (active) { repository.current = repo; setDemo(repo.mode === 'demo') }; return sort === 'popular' ? repo.getPopular(location || undefined) : repo.getRecent(location || undefined) }).then((data) => { if (active) setPhotos(data) }).catch(() => { if (active) setError('Photos could not load. Check your connection and try again.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [location, sort, attempt, auth.user?.id])
  useEffect(() => { if (!photoId || photos.some((photo) => photo.id === photoId)) return; let active = true; createGalleryRepository().then((repo) => repo.getById(photoId)).then((photo) => { if (photo && active) setPhotos((previous) => previous.some((p) => p.id === photo.id) ? previous : [...previous, photo]) }).catch(() => { if (active) setError('This photo is unavailable or awaiting approval.') }); return () => { active = false } }, [photoId, photos])
  const commit = (photo: GalleryPhoto) => setPhotos((previous) => previous.map((p) => p.id === photo.id ? photo : p))
  const like = async (photo: GalleryPhoto) => {
    if (!auth.user) { onAuth(); return }; if (pending.current || !repository.current) return
    pending.current = true; setBusy(true); setError('')
    try { await toggleLikeWithRollback(photo, commit, (liked) => liked ? repository.current!.like(photo.id) : repository.current!.unlike(photo.id)) }
    catch { setError('Your like could not be saved. The count has been restored.') } finally { pending.current = false; setBusy(false) }
  }
  return <Modal title="Campus community gallery" onClose={() => { if (!photoId) onClose(); else onPhoto(null) }} className="full-gallery">
    <div className="gallery-toolbar"><label>View<select name="gallery-sort" aria-label="Gallery sort" value={sort} onChange={(event) => setSort(event.target.value as 'latest' | 'popular')}><option value="latest">Latest</option><option value="popular">Popular</option></select></label><label>Location<select name="gallery-location" aria-label="Gallery location filter" value={location} onChange={(event) => { setLocation(event.target.value); onPhoto(null) }}><option value="">All campus locations</option>{locations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="navigate-button" onClick={() => onUpload(location || undefined)}>Share a campus photo</button></div>
    {demo && <p className="demo-notice">Demo gallery · these are illustrations, not student uploads. Community persistence is unavailable.</p>}
    {!navigator.onLine && <p role="status" className="panel-muted">Offline · displaying available cached or demo content.</p>}
    {error && <p role="alert">{error} <button className="fly-button" onClick={() => setAttempt(attempt + 1)}>Retry</button></p>}
    {loading ? <div className="full-gallery-grid" aria-label="Loading gallery">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton photo-skeleton" />)}</div> : photos.length ? <div className="full-gallery-grid">{photos.map((photo) => <article key={photo.id} className="gallery-card"><button className="photo-open" onClick={() => onPhoto(photo.id)} aria-label={`Open ${photo.caption}`}><img src={photo.thumbnailUrl} alt={photo.placeholder ? 'Demo campus illustration' : photo.caption} loading="lazy" decoding="async" width="480" height="300" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} /></button><div className="photo-caption"><strong>{photo.caption}</strong><span>{locations.find((p) => p.id === photo.locationId)?.name ?? 'Campus'}</span><span>{photo.authorDisplayName} · {new Date(photo.createdAt).toLocaleDateString()}</span><button className="fly-button" disabled={busy} aria-pressed={!!photo.liked} onClick={() => void like(photo)}>{photo.liked ? '♥ Unlike' : '♡ Like'} · {photo.likeCount}</button></div></article>)}</div> : <p>No community photos yet. <button className="fly-button" onClick={() => onUpload(location || undefined)}>Add the first photo</button></p>}
    {photoId && <Suspense fallback={<p role="status">Opening photo…</p>}><PhotoViewer photos={photos} photoId={photoId} onChange={onPhoto} onClose={() => onPhoto(null)} onLike={(photo) => void like(photo)} busy={busy} userId={auth.user?.id}
      onReport={async (photo, reason) => { if (!auth.user) { onAuth(); throw new Error('Sign in to report this photo.') }; if (pending.current) throw new Error('Please wait for the current action.'); pending.current = true; setBusy(true); try { await (repository.current ?? await createGalleryRepository()).report({ photoId: photo.id, reason }) } finally { pending.current = false; setBusy(false) } }}
      onDelete={async (photo) => { if (pending.current) throw new Error('Please wait.'); pending.current = true; setBusy(true); try { await (repository.current ?? await createGalleryRepository()).deleteOwnPhoto(photo.id); setPhotos((previous) => previous.filter((p) => p.id !== photo.id)) } finally { pending.current = false; setBusy(false) } }} /></Suspense>}
  </Modal>
}
