import { memo, useMemo, useState } from 'react'
import { galleryForLocation } from '../lib/gallery'
import { galleryPhotos } from '../data/gallery'
import type { GalleryPhoto } from '../types/gallery'

function PhotoCard({ photo }: { photo: GalleryPhoto }) {
  const [failed, setFailed] = useState(false)
  return <figure className="gallery-card">
    <div className="gallery-image">
      {failed ? <span className="gallery-image-missing">Image unavailable</span> : <img src={photo.image} alt={photo.placeholder ? 'Illustration placeholder, not a campus photograph' : photo.caption} loading="lazy" decoding="async" width="320" height="200" onError={() => setFailed(true)} />}
      {photo.placeholder && <span className="gallery-demo-badge">Placeholder</span>}
    </div>
    <figcaption><strong>{photo.caption}</strong><span>{photo.author}</span></figcaption>
  </figure>
}
function GalleryPreview({ locationId, photos = galleryPhotos }: { locationId: string; photos?: GalleryPhoto[] }) {
  const linked = useMemo(() => galleryForLocation(locationId, photos), [locationId, photos])
  return <section className="panel-section" aria-label="Community Photos">
    <div className="section-heading"><h3>Community Photos</h3><span>{linked.length}</span></div>
    {linked.length ? <div className="gallery-grid">{linked.slice(0, 4).map((photo) => <PhotoCard key={photo.id} photo={photo} />)}</div>
      : <p className="panel-muted">No photos for this location yet.</p>}
    {linked.some((photo) => photo.placeholder) && <p className="gallery-note">Demo cards for future community photos.</p>}
  </section>
}
export default memo(GalleryPreview)
