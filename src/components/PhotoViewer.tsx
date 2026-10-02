import { useEffect, useState } from 'react'
import Modal from './Modal'
import type { GalleryPhoto } from '../types/gallery'
export default function PhotoViewer({ photos, photoId, onChange, onClose, onLike, onReport, onDelete, userId, busy }: {
  photos: GalleryPhoto[]; photoId: string; onChange: (id: string) => void; onClose: () => void; onLike: (photo: GalleryPhoto) => void;
  onReport: (photo: GalleryPhoto, reason: string) => Promise<void>; onDelete: (photo: GalleryPhoto) => Promise<void>; userId?: string; busy: boolean
}) {
  const index = photos.findIndex((photo) => photo.id === photoId), photo = photos[index], [reason, setReason] = useState(''), [reportOpen, setReportOpen] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false)
  const change = (offset: number) => { if (photos.length > 1) onChange(photos[(index + offset + photos.length) % photos.length].id) }
  useEffect(() => { setFailed(false); setMessage(''); setReportOpen(false); setReason('') }, [photoId])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.target as HTMLElement).tagName === 'TEXTAREA' || document.querySelectorAll('dialog[open]').length > 2) return; if (event.key === 'ArrowRight') { event.preventDefault(); change(1) } if (event.key === 'ArrowLeft') { event.preventDefault(); change(-1) } }; window.addEventListener('keydown', handler, true); return () => window.removeEventListener('keydown', handler, true) })
  const [touch, setTouch] = useState<number | null>(null)
  return <Modal title="Campus photo" className="photo-viewer" onClose={onClose}>
    {!photo ? <p role="status">Photo unavailable or awaiting approval.</p> : <>
    <div className="viewer-image" onTouchStart={(event) => setTouch(event.touches[0].clientX)} onTouchEnd={(event) => { if (touch !== null) { const dx = event.changedTouches[0].clientX - touch; if (Math.abs(dx) > 60) change(dx > 0 ? -1 : 1) }; setTouch(null) }}>
      {failed ? <p>Image unavailable. Reopen the gallery to refresh the link.</p> : <img src={photo.imageUrl} alt={photo.placeholder ? 'Demo illustration; not a photograph of campus' : photo.caption} onError={() => setFailed(true)} decoding="async" />}</div>
    <p>{photo.caption}</p><p className="panel-muted">{photo.authorDisplayName} · {new Date(photo.createdAt).toLocaleDateString()}{photo.placeholder && ' · Demo illustration'}</p>
    <div className="viewer-controls"><button className="fly-button" disabled={photos.length < 2} onClick={() => change(-1)}>← Previous</button><button className="fly-button" disabled={busy} aria-pressed={!!photo.liked} onClick={() => onLike(photo)}>{photo.liked ? '♥ Unlike' : '♡ Like'} · {photo.likeCount}</button><button className="fly-button" disabled={photos.length < 2} onClick={() => change(1)}>Next →</button><button className="fly-button" onClick={() => setReportOpen(!reportOpen)}>Report</button>{userId === photo.authorId && <button className="fly-button" disabled={busy} onClick={async () => { try { await onDelete(photo); onClose() } catch { setMessage('Unable to delete your photo. Please retry.') } }}>Delete my photo</button>}</div>
    {reportOpen && <form onSubmit={async (event) => { event.preventDefault(); try { await onReport(photo, reason); setMessage('Report received for review.'); setReportOpen(false) } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to report. Please retry.') } }}><label>Reason<textarea name="report-reason" required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="fly-button" disabled={busy}>Send report</button></form>}
    <p role="status">{message}</p></>}
  </Modal>
}
