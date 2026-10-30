import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from './Modal'
import { POSTCARD_CAPTIONS, POSTCARD_GROUP_LIMIT, postcardNames, postcardPeopleInCrop, postcardShareText, renderPostcard } from '../lib/postcard'
import type { ScenePhoto, ScenePhotoCapture, PostcardFormat, PostcardTheme } from '../lib/postcard'
import type { CampusLiveSession } from '../hooks/useCampusSession'
import type { CampusPose } from '../lib/campusProtocol'
import type { SocialAction } from '../lib/social'
import './photo-mode.css'

const PHOTO_POSES = [['wave', 'Wave'], ['cheer', 'Celebrate'], ['heart', 'Heart'], ['dance', 'Dance']] as const
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Photo cancelled', 'AbortError')); return }
    const cancel = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); reject(new DOMException('Photo cancelled', 'AbortError')) }
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export default function PhotoMode({ capture, place, onClose, onPreviewChange, live, pose, walking }: {
  capture: React.RefObject<ScenePhotoCapture | null>; place: string; onClose: () => void; onPreviewChange: (paused: boolean) => void
  live: CampusLiveSession; pose: React.RefObject<CampusPose | null>; walking: boolean
}) {
  const [shot, setShot] = useState<(ScenePhoto & { place: string; takenAt: Date }) | null>(null)
  const [photoPose, setPhotoPose] = useState<SocialAction | 'none'>('none'), [delay, setDelay] = useState(3), [countdown, setCountdown] = useState(0)
  const [includeNames, setIncludeNames] = useState(false), [selectedIds, setSelectedIds] = useState<string[]>([])
  const [theme, setTheme] = useState<PostcardTheme>('paper'), [format, setFormat] = useState<PostcardFormat>('portrait')
  const [caption, setCaption] = useState<string>(POSTCARD_CAPTIONS[0]), [busy, setBusy] = useState(false), [composing, setComposing] = useState(false)
  const [copyStatus, setCopyStatus] = useState(''), captionCopy = useRef<HTMLTextAreaElement>(null)
  const [asset, setAsset] = useState<{ blob: Blob; url: string; filename: string } | null>(null), [error, setError] = useState('')
  const active = useRef(true), capturing = useRef(false), closeButton = useRef<HTMLButtonElement>(null)
  const liveRef = useRef(live); liveRef.current = live
  const shutter = useRef<AbortController | null>(null)
  const candidates = useMemo(() => shot ? postcardPeopleInCrop(shot.people, shot.image.width, shot.image.height, format, includeNames) : [], [shot, format, includeNames])
  const names = useMemo(() => includeNames ? postcardNames(candidates.filter(person => selectedIds.includes(person.id)).map(person => person.name)) : [], [candidates, selectedIds, includeNames])
  const self = live.people.find(person => person.id === live.session.current.id)
  const poseAvailable = walking && (live.connection === 'live' || live.socialPreview) && !self?.ride && !self?.concert && !self?.screening && self?.activity !== 'football' && self?.social?.action !== 'sit' && pose.current?.visible && !pose.current.airborne && (pose.current.vehicle ?? 'walk') === 'walk'
  const canSave = !!asset && !composing && (!includeNames || names.length > 0)
  useEffect(() => {
    active.current = true; closeButton.current?.focus()
    const hidden = () => { if (document.hidden) shutter.current?.abort() }
    document.addEventListener('visibilitychange', hidden)
    return () => { active.current = false; shutter.current?.abort(); document.removeEventListener('visibilitychange', hidden); onPreviewChange(false); document.getElementById('campus-photo-toggle')?.focus({ preventScroll: true }) }
  }, [onPreviewChange])
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
      void renderPostcard(shot.image, { format, theme, caption, place: shot.place, takenAt: shot.takenAt, includeNames, names }).then(blob => {
        if (!valid) return
        setAsset({ blob, url: URL.createObjectURL(blob), filename: `nitg-postcard-${shot.takenAt.toISOString().slice(0, 10)}-${format}.png` })
        setComposing(false)
      }).catch(() => { if (valid) { setError('The postcard could not be prepared. Try retaking the photo.'); setComposing(false) } })
    }, 150)
    return () => { valid = false; clearTimeout(timer) }
  }, [shot, format, theme, caption, includeNames, names])
  const takePhoto = async () => {
    if (capturing.current) return
    setError(''); capturing.current = true; setBusy(true)
    const controller = new AbortController(); shutter.current = controller
    const duration = Math.max(delay, photoPose === 'none' ? 0 : 1) * 1000, deadline = performance.now() + duration
    const tick = () => { if (active.current) setCountdown(Math.max(0, Math.ceil((deadline - performance.now()) / 1000))) }
    tick(); const timer = window.setInterval(tick, 100)
    try {
      if (!capture.current) throw Error('The campus is still preparing. Try again in a moment.')
      await wait(Math.max(0, duration - (photoPose === 'none' ? 0 : 1000)), controller.signal)
      if (photoPose !== 'none') {
        if (!poseAvailable) throw Error('Stand on foot outside an activity to use a photo pose, or choose Natural.')
        const current = () => { const session = liveRef.current.session.current; return session.snapshot?.people.find(person => person.id === session.id)?.social }
        if (current()?.action !== photoPose || (current()?.until ?? 0) < Date.now() + 1300) {
          const previous = current()?.startedAt
          if (!liveRef.current.socialAction(photoPose)) throw Error('The pose could not start. Give it a moment and try again.')
          const limit = performance.now() + 5000
          while (current()?.action !== photoPose || current()?.startedAt === previous) {
            await wait(50, controller.signal)
            if (liveRef.current.socialError) throw Error(liveRef.current.socialError)
            if (performance.now() >= limit) throw Error('Your pose was not confirmed. Try again once the campus reconnects.')
          }
        }
        await wait(Math.max(350, deadline - performance.now()), controller.signal)
      }
      if (controller.signal.aborted || document.hidden) throw new DOMException('Photo cancelled', 'AbortError')
      const photo = await capture.current.capture()
      if (active.current && !controller.signal.aborted) { setSelectedIds(photo.people.some(person => person.id === liveRef.current.session.current.id) ? [liveRef.current.session.current.id!] : []); setShot({ ...photo, place, takenAt: new Date() }) }
      else photo.image.width = photo.image.height = 0
    } catch (failure) { if (active.current) setError(failure instanceof DOMException && failure.name === 'AbortError' ? 'Photo cancelled.' : failure instanceof Error ? failure.message : 'Photo failed. Please try again.') }
    finally { clearInterval(timer); shutter.current = null; capturing.current = false; if (active.current) { setBusy(false); setCountdown(0) } }
  }
  const share = async () => {
    if (!asset || !canSave) return
    setError('')
    try { await navigator.share({ title: 'A postcard from NIT Goa', text: postcardShareText(caption, shot?.place ?? place, names), files: [new File([asset.blob], asset.filename, { type: 'image/png' })] }) }
    catch (failure) { if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError('Sharing is unavailable here. Download the PNG to share it instead.') }
  }
  const copyCaption = async () => {
    const text = postcardShareText(caption, shot?.place ?? place, names)
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text); setCopyStatus('Caption copied.')
    } catch { captionCopy.current?.focus(); captionCopy.current?.select(); setCopyStatus('Caption selected. Use your device’s Copy command.') }
  }
  const canShare = asset && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([asset.blob], asset.filename, { type: 'image/png' })] })
  return <div className="photo-mode-ui" data-busy={busy || undefined}>
    <div className="photo-mode-heading"><div><span>POSTCARDS FROM CAMPUS</span><strong>Find your frame.</strong></div><button ref={closeButton} type="button" onClick={onClose} aria-label="Exit photo mode">×</button></div>
    <div className="photo-viewfinder" aria-hidden="true"><i /><i /><i /><i /></div>
    {!shot && <div className="photo-pose-tools"><fieldset disabled={busy || live.socialPending}><legend>Your pose</legend><button aria-pressed={photoPose === 'none'} onClick={() => { setPhotoPose('none'); if (photoPose !== 'none') live.socialAction('stop') }}>Natural</button>{PHOTO_POSES.map(([action, label]) => <button key={action} disabled={!poseAvailable} aria-pressed={photoPose === action} onClick={() => { if (live.socialAction(action)) setPhotoPose(action) }}>{label}</button>)}</fieldset><p>{live.socialError || (poseAvailable ? 'You face the camera. Friends choose their own pose.' : 'Walk on foot and stand up to pose. Seated and riding photos keep your current pose.')}</p><fieldset disabled={busy}><legend>Shutter timer</legend>{[0, 3, 5].map(value => <button key={value} aria-pressed={delay === value} onClick={() => setDelay(value)}>{value === 0 ? 'Off' : `${value}s`}</button>)}</fieldset></div>}
    {busy && <div className="photo-countdown" role="status" aria-live="polite"><strong>{countdown || '…'}</strong><span>{countdown ? 'Get ready' : 'Getting your photo ready'}</span><button onClick={() => shutter.current?.abort()}>Cancel shot</button></div>}
    <div className="photo-shutter-panel">
      {error && !shot && <p role="alert">{error}</p>}
      <p>Drag to frame · scroll or pinch to zoom</p>
      <button className="photo-shutter" disabled={busy} onClick={() => void takePhoto()} aria-label={busy ? 'Taking photo' : 'Take photo'}><span aria-hidden="true" /></button>
      <span role="status">{busy ? 'Taking your photo…' : 'Take a photo'}</span>
    </div>
    {shot && <Modal title="Your campus postcard" className="postcard-dialog" onClose={() => { setShot(null); setError('') }}>
      <p className="postcard-intro">Your corner of Goa. Ready for the feed.</p>
      <div className="postcard-preview" aria-busy={composing}>{asset ? <img src={asset.url} alt={`NIT Goa postcard: ${caption || POSTCARD_CAPTIONS[0]} · ${shot.place}`} /> : <p role="status">Making your postcard…</p>}</div>
      <div className="postcard-actions"><button type="button" onClick={() => { setShot(null); setError('') }}>Retake</button>{asset && canSave ? <a href={asset.url} download={asset.filename}>Download PNG ↗</a> : <button disabled>{includeNames && !names.length ? 'Choose a name' : 'Preparing…'}</button>}{canShare && <button disabled={!canSave} type="button" onClick={() => void share()}>Share</button>}</div>
      <div className="postcard-options">
        <fieldset><legend>Frame</legend>{(['paper', 'midnight'] as const).map(value => <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value === 'paper' ? 'Warm paper' : 'Midnight'}</button>)}</fieldset>
        <fieldset><legend>Format</legend>{(['portrait', 'story', 'landscape'] as const).map(value => <button key={value} type="button" aria-pressed={format === value} onClick={() => setFormat(value)}>{value === 'portrait' ? 'Post · 4:5' : value === 'story' ? 'Story · 9:16' : 'Postcard · 4:3'}</button>)}</fieldset>
      </div>
      <fieldset className="postcard-group"><legend>People in the photo</legend><label><input type="checkbox" checked={includeNames} disabled={!shot.people.length} onChange={event => { setIncludeNames(event.target.checked); setCopyStatus('') }} />Add group names</label>{includeNames && <><p>Choose the people you can see in this crop. Up to {POSTCARD_GROUP_LIMIT} names.</p><div>{candidates.map(person => <label key={person.id}><input type="checkbox" checked={selectedIds.includes(person.id)} disabled={!selectedIds.includes(person.id) && names.length >= POSTCARD_GROUP_LIMIT} onChange={event => { setSelectedIds(ids => event.target.checked ? [...ids.filter(id => candidates.some(candidate => candidate.id === id)), person.id].slice(0, POSTCARD_GROUP_LIMIT) : ids.filter(id => id !== person.id)); setCopyStatus('') }} />{person.name}</label>)}</div>{!candidates.length && <p>No nearby avatars are suggested in this crop. Try another format or retake.</p>}</>}{!shot.people.length && <p>Walk with your avatar and bring friends into view, then retake to add names.</p>}</fieldset>
      <label className="postcard-caption">Your message<input value={caption} maxLength={72} onChange={event => { setCaption(event.target.value); setCopyStatus('') }} placeholder={POSTCARD_CAPTIONS[0]} /></label>
      <div className="postcard-presets" role="group" aria-label="Caption ideas">{POSTCARD_CAPTIONS.map(value => <button key={value} type="button" aria-pressed={caption === value} onClick={() => { setCaption(value); setCopyStatus('') }}>{value}</button>)}</div>
      <details className="postcard-share-copy"><summary>Caption for your post</summary><textarea ref={captionCopy} aria-label="Caption to copy" readOnly rows={4} value={postcardShareText(caption, shot.place, names)} /><button type="button" onClick={() => void copyCaption()}>Copy caption</button><span role="status">{copyStatus}</span></details>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="postcard-private">Created on your device. Nothing is uploaded.</p>
    </Modal>}
  </div>
}
