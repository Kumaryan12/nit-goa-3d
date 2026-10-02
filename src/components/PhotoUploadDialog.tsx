import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { campusLocations } from '../data/campus'
import { processImage, validateImage } from '../lib/images'
import { createGalleryRepository } from '../repositories/createGalleryRepository'
import { useAuth } from '../hooks/useAuth'
import type { GalleryUploadInput, UploadStage } from '../types/gallery'
export default function PhotoUploadDialog({ locationId, onClose, onAuth }: { locationId?: string; onClose: () => void; onAuth: () => void }) {
  const auth = useAuth(), [location, setLocation] = useState(campusLocations.some((p) => p.id === locationId) ? locationId! : campusLocations[0].id)
  const [caption, setCaption] = useState(''), [preview, setPreview] = useState(''), [error, setError] = useState(''), [stage, setStage] = useState<UploadStage | null>(null)
  const [prepared, setPrepared] = useState<Awaited<ReturnType<typeof processImage>> | null>(null), [online, setOnline] = useState(navigator.onLine)
  const pending = useRef(false), uploadId = useRef(crypto.randomUUID()), active = useRef(true), generation = useRef(0)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  const busy = stage === 'preparing' || stage === 'uploading' || stage === 'submitting'
  return <Modal title="Share a campus photo" onClose={() => { if (!pending.current) onClose() }}>
    {stage === 'complete' ? <div role="status"><h3>Photo submitted</h3><p>Your photo is pending moderation. It will appear publicly after approval.</p><button className="navigate-button" onClick={onClose}>Done</button></div> : <form onSubmit={async (event) => {
      event.preventDefault(); if (pending.current || !prepared || !auth.user || !online) return
      pending.current = true; setError(''); setStage('uploading')
      try { const input: GalleryUploadInput = { id: uploadId.current, locationId: location, caption, ...prepared }; const repository = await createGalleryRepository(); await repository.create(input, (next) => { if (active.current) setStage(next) }); if (active.current) setStage('complete') }
      catch (failure) { if (active.current) { setError(failure instanceof Error ? failure.message : 'Upload failed. Please retry.'); setStage(null) } } finally { pending.current = false }
    }}>
      <p className="panel-muted">JPEG, PNG or WebP · up to 12 MB and 32 megapixels. Resized and re-encoded to remove EXIF/GPS metadata. Upload only photos you have permission to share; avoid identifiable people without consent.</p>
      {!auth.configured ? <p className="demo-notice">Demo mode: image preparation is available, but community uploads cannot be saved.</p> : auth.loading ? <div className="skeleton" aria-label="Checking sign-in" /> : !auth.user ? <p><button type="button" className="fly-button" onClick={onAuth}>Sign in to upload</button></p> : <p className="panel-muted">Signed in · your upload will need approval.</p>}
      {!online && <p role="status">You are offline. Reconnect before uploading.</p>}
      <label>Choose image<input name="campus-photo" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={busy} onChange={async (event) => {
        const file = event.target.files?.[0]; if (!file) return
        const attempt = ++generation.current; setPrepared(null); setError(''); setPreview(''); setStage('preparing'); uploadId.current = crypto.randomUUID()
        try { validateImage(file); const result = await processImage(file); if (!active.current || attempt !== generation.current) return; setPrepared(result); setPreview(URL.createObjectURL(result.image)); setStage(null) }
        catch (failure) { if (active.current && attempt === generation.current) { setError(failure instanceof Error ? failure.message : 'Unable to decode image.'); setStage(null) } }
      }} /></label>
      {preview && <img className="upload-preview" src={preview} alt="Your processed photo preview" />}
      <label>Campus location<select name="photo-location" value={location} disabled={busy} onChange={(event) => setLocation(event.target.value)}>{campusLocations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Caption<textarea name="caption" required maxLength={500} rows={3} value={caption} disabled={busy} onChange={(event) => setCaption(event.target.value)} /></label>
      <p className="panel-muted">{caption.length}/500 characters · location association is chosen by you.</p>
      {error && <p role="alert" className="form-error">{error}</p>}<p role="status">{stage === 'preparing' ? 'Preparing image…' : stage === 'uploading' ? 'Uploading…' : stage === 'submitting' ? 'Submitting…' : ''}</p>
      <button className="navigate-button" disabled={busy || !prepared || !caption.trim() || !auth.user || !online}>Submit for moderation</button>
    </form>}
  </Modal>
}
