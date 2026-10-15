import { useCallback, useEffect, useRef, useState } from 'react'
import { syncScreeningVideo, syncScreeningYoutube } from '../lib/screeningPlayback'
import { loadYoutubePlayer } from '../lib/youtubePlayer'
import type { YoutubePlayer } from '../lib/youtubePlayer'
import type { ScreeningState } from '../lib/screening'
export interface ScreeningPlayerControls { fullscreen: () => void; enableSound: () => void }
export default function ScreeningPlayer({ room, muted, volume, setMuted, setVolume, onEnded, serverNow, controls }: { room: ScreeningState; muted: boolean; volume: number; setMuted: (v: boolean) => void; setVolume: (v: number) => void; onEnded: () => void; serverNow: () => number; controls: React.RefObject<ScreeningPlayerControls | null> }) {
  const root = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), youtubeHost = useRef<HTMLDivElement>(null), youtube = useRef<YoutubePlayer | null>(null)
  const state = useRef(room); state.current = room
  const [error, setError] = useState(''), [blocked, setBlocked] = useState(false), [fullscreen, setFullscreen] = useState(false), [notice, setNotice] = useState('')
  const [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0)
  const isReady = useRef(false), autoplayBlocked = useRef(false)
  const ended = useRef(onEnded); ended.current = onEnded
  const preferences = useRef({ muted, volume }); preferences.current = { muted, volume }
  const sync = useCallback(() => {
    const room = state.current
    try {
      if (video.current) syncScreeningVideo(video.current, room, serverNow(), !document.hidden, () => { autoplayBlocked.current = true; setBlocked(true) }, !autoplayBlocked.current)
      const p = youtube.current
      if (!p) return
      p.setVolume(preferences.current.volume * 100)
      if (preferences.current.muted) p.mute(); else p.unMute()
      if (document.hidden) { p.pauseVideo(); return }
      syncScreeningYoutube(p, room, serverNow(), !autoplayBlocked.current)
    } catch { /* The player may be preparing or being destroyed. */ }
  }, [serverNow])
  useEffect(() => {
    setError(''); setBlocked(false); autoplayBlocked.current = false; isReady.current = false; setReady(false)
    const media = room.media
    if (media?.kind !== 'youtube' || !youtubeHost.current) return
    let alive = true, player: YoutubePlayer | null = null
    const iframe = document.createElement('iframe')
    iframe.title = room.title; iframe.width = '960'; iframe.height = '480'
    iframe.allow = 'autoplay; fullscreen; picture-in-picture'; iframe.allowFullscreen = true
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    const url = new URL(`https://www.youtube-nocookie.com/embed/${media.videoId}`)
    url.search = new URLSearchParams({ enablejsapi: '1', origin: window.location.origin, playsinline: '1', controls: '1', rel: '0', mute: '1' }).toString()
    iframe.src = url.href; youtubeHost.current.replaceChildren(iframe)
    void loadYoutubePlayer().then(api => {
      if (!alive) return
      player = new api.Player(iframe, { events: {
        onReady: event => { if (alive) { youtube.current = event.target; isReady.current = true; setReady(true); sync() } },
        onError: event => { if (alive) setError([101, 150].includes(event.data) ? 'This video does not allow embedding. Ask the host to choose another video.' : 'This YouTube video is unavailable. Ask the host to check the link.') },
        onAutoplayBlocked: () => { if (alive) { autoplayBlocked.current = true; setBlocked(true) } },
        onStateChange: event => {
          if (!alive) return
          if (event.data === 1) { autoplayBlocked.current = false; setBlocked(false) }
          if (event.data === 0) ended.current()
        },
      } })
    }).catch(e => { if (alive) setError(e.message) })
    return () => { alive = false; youtube.current = null; player?.destroy(); iframe.remove() }
  }, [room.media?.url, room.session, room.title, sync, attempt])
  useEffect(() => { const timeout = window.setTimeout(() => { if (!isReady.current) setError('The video is taking too long to load. Retry, or ask the host to check the source.') }, 30000); return () => clearTimeout(timeout) }, [room.media?.url, room.session, attempt])
  useEffect(() => { sync(); const timer = window.setInterval(sync, 1000); document.addEventListener('visibilitychange', sync); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', sync) } }, [sync, room.revision])
  useEffect(() => { if (video.current) { video.current.muted = muted; video.current.volume = volume } sync() }, [muted, volume, sync])
  useEffect(() => {
    const element = video.current
    if (element && room.media?.kind === 'video') { element.src = room.media.url; element.load() }
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load() } }
  }, [room.media?.url, attempt])
  const enableSound = () => {
    setMuted(false); preferences.current.muted = false; autoplayBlocked.current = false; setBlocked(false)
    const v = video.current
    if (v) { v.muted = false; if (state.current.playing) void v.play().catch(() => setBlocked(true)) }
    const p = youtube.current
    if (p) { p.unMute(); if (state.current.playing) p.playVideo() }
    sync()
  }
  useEffect(() => {
    const fullscreen = () => {
      if (root.current?.requestFullscreen) void root.current.requestFullscreen().catch(() => setNotice('Use the video’s fullscreen control on this browser.'))
      else { const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null; if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); else setNotice('Use the video’s fullscreen control on this browser.') }
    }
    controls.current = { fullscreen, enableSound }
    return () => { controls.current = null }
  })
  useEffect(() => { const changed = () => setFullscreen(document.fullscreenElement === root.current); document.addEventListener('fullscreenchange', changed); return () => document.removeEventListener('fullscreenchange', changed) }, [])
  return <div ref={root} className="screening-player" aria-label={`${room.title} screening screen`} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
    {room.media?.kind === 'video' ? <video ref={video} key={room.media.url} src={room.media.url} playsInline muted={muted} preload="metadata" onEnded={() => ended.current()} onLoadedMetadata={() => { isReady.current = true; setReady(true); sync() }} onCanPlay={sync} onError={() => setError('The video could not play. The host should check that this is a public browser-compatible video link.')} aria-label={room.title} /> : <div ref={youtubeHost} className="screening-youtube" />}
    {notice && <div className="screening-player-notice" role="status">{notice}</div>}
    {!ready && !error && <div className="screening-player-loading" role="status">Preparing the screen…</div>}
    {(blocked || muted) && ready && !error && <button className="screening-enable-sound" onClick={enableSound}>{blocked ? 'Tap to start playback' : 'Enable sound'}</button>}
    {error && <div className="screening-player-error" role="alert">{error}<button onClick={() => setAttempt(v => v + 1)}>Retry player</button></div>}
    <div className="screening-player-sound"><button onClick={() => muted ? enableSound() : setMuted(true)}>{muted ? 'Sound off' : 'Mute'}</button><label>Volume <input aria-label="Screening volume" type="range" min="0" max="1" step=".05" value={volume} onChange={e => setVolume(Number(e.target.value))}/></label><button onClick={() => document.fullscreenElement ? void document.exitFullscreen().catch(() => {}) : controls.current?.fullscreen()}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button></div>
  </div>
}
