import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { renderPostcard } from '../lib/postcard'
import type { ScenePhotoCapture, PostcardFormat, PostcardTheme } from '../lib/postcard'
import './photo-mode.css'

export default function PhotoMode({ capture, place, onClose, onPreviewChange }: {
  capture: React.RefObject<ScenePhotoCapture | null>; place: string; onClose: () => void; onPreviewChange: (paused: boolean) => void
}) {
  const [shot, setShot] = useState<{ image: HTMLCanvasElement; place: string; takenAt: Date } | null>(null)
  const [theme, setTheme] = useState<PostcardTheme>('paper'), [format, setFormat] = useState<PostcardFormat>('landscape')
  const [caption, setCaption] = useState('Wish you were here.'), [busy, setBusy] = useState(false), [composing, setComposing] = useState(false)
  const [asset, setAsset] = useState<{ blob: Blob; url: string; filename: string } | null>(null), [error, setError] = useState('')
  const active = useRef(true), capturing = useRef(false), closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { active.current = true; closeButton.current?.focus(); return () => { active.current = false; onPreviewChange(false); document.getElementById('campus-photo-toggle')?.focus({ preventScroll: true }) } }, [onPreviewChange])
  useEffect(() => { onPreviewChange(!!shot || busy) }, [shot, busy, onPreviewChange])
  useEffect(() => () => { if (shot) shot.image.width = shot.image.height = 0 }, [shot])
  useEffect(() => () => { if (asset) URL.revokeObjectURL(asset.url) }, [asset])
  useEffect(() => {
    if (shot) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [shot, onClose])
  useEffect(() => {
    if (!shot) { setAsset(null); return }
    let valid = true; setComposing(true); setError('')
    const timer = window.setTimeout(() => {
      void renderPostcard(shot.image, { format, theme, caption, place: shot.place, takenAt: shot.takenAt }).then(blob => {
        if (!valid) return
        setAsset({ blob, url: URL.createObjectURL(blob), filename: `nitg-postcard-${shot.takenAt.toISOString().slice(0, 10)}.png` })
        setComposing(false)
      }).catch(() => { if (valid) { setError('The postcard could not be prepared. Try retaking the photo.'); setComposing(false) } })
    }, 150)
    return () => { valid = false; clearTimeout(timer) }
  }, [shot, format, theme, caption])
  const takePhoto = async () => {
    if (capturing.current) return
    setError(''); capturing.current = true; setBusy(true)
    try {
      if (!capture.current) throw Error('The campus is still preparing. Try again in a moment.')
      const image = await capture.current.capture()
      if (active.current) setShot({ image, place, takenAt: new Date() })
      else image.width = image.height = 0
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : 'Photo failed. Please try again.') }
    finally { capturing.current = false; if (active.current) setBusy(false) }
  }
  const share = async () => {
    if (!asset || composing) return
    setError('')
    try { await navigator.share({ title: 'A postcard from NIT Goa', files: [new File([asset.blob], asset.filename, { type: 'image/png' })] }) }
    catch (failure) { if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError('Sharing is unavailable here. Download the PNG to share it instead.') }
  }
  const canShare = asset && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([asset.blob], asset.filename, { type: 'image/png' })] })
  return <div className="photo-mode-ui">
    <div className="photo-mode-heading"><div><span>POSTCARDS FROM CAMPUS</span><strong>Find your frame.</strong></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Exit photo mode">×</button></div>
    <div className="photo-viewfinder" aria-hidden="true"><i /><i /><i /><i /></div>
    <div className="photo-shutter-panel">
      {error && !shot && <p role="alert">{error}</p>}
      <p>Drag to frame · scroll or pinch to zoom</p>
      <button className="photo-shutter" disabled={busy} onClick={() => void takePhoto()} aria-label={busy ? 'Taking photo' : 'Take photo'}><span aria-hidden="true" /></button>
      <span role="status">{busy ? 'Taking your photo…' : 'Take a photo'}</span>
    </div>
    {shot && <Modal title="Your campus postcard" className="postcard-dialog" onClose={() => { setShot(null); setError('') }}>
      <p className="postcard-intro">A little piece of campus to keep.</p>
      <div className="postcard-preview" aria-busy={composing}>{asset ? <img src={asset.url} alt={`Campus postcard: ${caption || 'Wish you were here.'} · ${shot.place}`} /> : <p role="status">Making your postcard…</p>}</div>
      <div className="postcard-options">
        <fieldset><legend>Frame</legend>{(['paper', 'midnight'] as const).map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'paper' ? 'Warm paper' : 'Midnight'}</button>)}</fieldset>
        <fieldset><legend>Format</legend>{(['landscape', 'portrait'] as const).map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)}>{value === 'landscape' ? 'Landscape' : 'Portrait'}</button>)}</fieldset>
      </div>
      <label className="postcard-caption">Your message<input value={caption} maxLength={72} onChange={event => setCaption(event.target.value)} placeholder="Wish you were here." /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="postcard-actions"><button type="button" onClick={() => { setShot(null); setError('') }}>Retake</button>{asset && !composing ? <a href={asset.url} download={asset.filename}>Download PNG ↗</a> : <button disabled>{composing ? 'Preparing…' : 'Download PNG'}</button>}{canShare && <button disabled={composing} type="button" onClick={() => void share()}>Share</button>}</div>
      <p className="postcard-private">Created on your device. Nothing is uploaded.</p>
    </Modal>}
  </div>
}
