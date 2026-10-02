import { memo, useEffect, useState } from 'react'
import { createGalleryRepository } from '../repositories/createGalleryRepository'
import type { GalleryPhoto } from '../types/gallery'
function GalleryPreview({ locationId, onGallery, onUpload }: { locationId: string; onGallery: (id: string, photo?: string) => void; onUpload: (id: string) => void }) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [demo, setDemo] = useState(true)
  useEffect(() => { let active = true; setLoading(true); setError(false); createGalleryRepository().then(async (repo) => { if (active) setDemo(repo.mode === 'demo'); return repo.getByLocation(locationId) }).then((data) => { if (active) setPhotos(data) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [locationId])
  return <section className="panel-section" aria-label="Community photos"><div className="section-heading"><h3>Community photos</h3><button className="text-button" onClick={() => onGallery(locationId)}>View gallery →</button></div>
    {loading ? <div className="gallery-grid"><div className="skeleton photo-skeleton" /><div className="skeleton photo-skeleton" /></div> : error ? <p className="panel-muted">Photos could not load. Open the gallery to retry.</p> : photos.length ? <div className="gallery-grid">{photos.slice(0, 4).map((photo) => <button className="gallery-card preview-photo" key={photo.id} onClick={() => onGallery(locationId, photo.id)}><div className="gallery-image"><img src={photo.thumbnailUrl} alt={photo.placeholder ? 'Demo illustration, not a campus photograph' : photo.caption} loading="lazy" decoding="async" />{photo.placeholder && <span className="gallery-demo-badge">Demo illustration</span>}</div><strong>{photo.caption}</strong></button>)}</div> : <p className="panel-muted">No community photos yet.</p>}
    {demo && <p className="gallery-note">Demo illustrations · community persistence unavailable.</p>}<button className="fly-button" onClick={() => onUpload(locationId)}>{photos.length ? 'Add photo' : 'Add the first photo'}</button>
  </section>
}
export default memo(GalleryPreview)
