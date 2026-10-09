import { useId, useState } from 'react'
import type { OatSession } from '../hooks/useOatSession'
import { OAT_BACKING_TRACK, OAT_CAPACITY, oatInviteURL } from '../lib/oatProtocol'

const timestamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export default function OatControls({ session, joined, onJoin, onRetry, onClose }: {
  session: OatSession; joined: boolean; onJoin: (name: string) => void; onRetry: () => void; onClose: () => void
}) {
  const [collapsed, setCollapsed] = useState(false), contentId = useId()
  const [title, setTitle] = useState(''), [trackURL, setTrackURL] = useState(''), [trackTitle, setTrackTitle] = useState(''), [copied, setCopied] = useState(false)
  const { snapshot: room, selfId, connection, mic, error } = session
  const live = connection === 'live', onStage = !!selfId && room?.performerId === selfId
  const performer = room?.participants.find(p => p.id === room.performerId), queueIndex = selfId ? room?.queue.indexOf(selfId) ?? -1 : -1
  const invite = oatInviteURL(window.location.href)
  return <aside className={`oat-controls ${collapsed ? 'panel-collapsed' : ''}`} aria-label="OAT concert controls" aria-labelledby={collapsed ? undefined : "oat-title"}>
    <div className="oat-heading"><span className="eyebrow">OAT concert{mic === 'live' ? ' · Mic live' : ''}</span><div className="panel-heading-actions"><button className="panel-collapse" aria-expanded={!collapsed} aria-controls={contentId} aria-label={collapsed ? 'Expand concert controls' : 'Minimize concert controls'} onClick={() => setCollapsed(value => !value)}>{collapsed ? 'Expand' : '−'}</button><button className="panel-close" aria-label="Leave OAT concert" onClick={onClose}>×</button></div></div>
    {collapsed && mic !== 'off' && <button className="navigate-button oat-collapsed-mic" onClick={session.stopMic}>{mic === 'live' ? '● Stop live microphone' : 'Cancel microphone request'}</button>}
    <div id={contentId} hidden={collapsed}>
    <h2 id="oat-title">{room?.concertTitle ?? 'Concerts at the OAT'}</h2>
    {!joined ? <>
      <p>Meet at the theatre, share music and take the stage to sing live.</p>
      <button className="navigate-button" onClick={() => { session.enableSound(); onJoin('Campus member') }}>Join concert</button>
      <p className="oat-muted">You’ll appear with your profile name.</p>
      <p className="oat-muted">Join as a listener. Your microphone stays off until you take the stage and turn it on.</p>
    </> : <>
      <p className="oat-status" role="status">{live ? `${room?.participants.length ?? 0} / ${OAT_CAPACITY} people here` : connection === 'waiting' ? `Theatre full · you’re ${session.queuePosition} in the waiting queue. You’ll enter automatically.` : connection === 'connecting' ? 'Joining the concert…' : 'Connection lost. Your microphone is off.'}</p>
      {!live && connection !== 'connecting' && connection !== 'waiting' && <button className="navigate-button" onClick={onRetry}>Reconnect to concert</button>}
      <section className="oat-section" aria-label="Concert stage">
        <h3>{onStage ? 'You’re on stage' : performer ? `${performer.name} is on stage` : 'The stage is open'}</h3>
        <p className="oat-muted">{onStage ? 'You control the music for the concert.' : queueIndex >= 0 ? `You’re ${queueIndex + 1} in the performer queue.` : 'Listen from the audience or join the performer queue.'}</p>
        <div className="oat-actions">
          {onStage ? <button className="fly-button" onClick={() => { session.stopMic(); session.action({ type: 'leave-stage' }) }} disabled={!live}>End my turn</button>
            : queueIndex >= 0 ? <button className="fly-button" onClick={() => session.action({ type: 'leave-stage' })} disabled={!live}>Leave performer queue</button>
            : <button className="navigate-button" onClick={() => session.action({ type: 'stage' })} disabled={!live}>{performer ? 'Join performer queue' : 'Take the stage'}</button>}
        </div>
        {onStage && <>
          <form className="oat-title-form" onSubmit={event => { event.preventDefault(); if (title.trim()) session.action({ type: 'concert', title: title.trim() }) }}>
            <label htmlFor="oat-concert-title">Concert title</label>
            <div className="oat-input-row"><input id="oat-concert-title" maxLength={32} value={title} placeholder={room?.concertTitle} onChange={event => setTitle(event.target.value)} /><button className="fly-button" disabled={!live || !title.trim()}>Set title</button></div>
          </form>
          <div className={`oat-mic ${mic === 'live' ? 'oat-mic-live' : ''}`}>
            <button className="navigate-button" disabled={!live} onClick={() => mic === 'off' ? void session.startMic() : session.stopMic()}>
              {mic === 'live' ? '● Stop live microphone' : mic === 'requesting' ? 'Cancel microphone request' : '🎤 Start live microphone'}
            </button>
            <p>{mic === 'live' ? 'Your microphone is broadcasting to this concert.' : mic === 'requesting' ? 'Allow microphone access in your browser to sing.' : 'Your voice will be heard by everyone in this concert. Use headphones when singing over music.'}</p>
          </div>
        </>}
        {room?.micOn && !onStage && <p className="oat-live-indicator">● Live microphone · {performer?.name}</p>}
        {session.voiceStatus && <p className="oat-muted" role="status">{session.voiceStatus}</p>}
      </section>
      <section className="oat-section" aria-label="Shared music">
        <h3>Concert music</h3>
        <p className="oat-track-title">{room?.music.url ? room.music.title : 'No track loaded yet'}</p>
        {room?.music.url && <><progress aria-label="Track progress" max={room.music.duration || Math.max(1, session.playhead)} value={session.playhead} /><p className="oat-muted">{timestamp(session.playhead)}{room.music.duration > 0 ? ` / ${timestamp(room.music.duration)}` : ''} · {room.music.playing ? 'Playing for everyone' : 'Paused for everyone'}</p></>}
        {onStage && <>
          <div className="oat-actions"><button className="navigate-button" disabled={!live || !room?.music.url} onClick={() => session.transport(!room?.music.playing)}>{room?.music.playing ? 'Pause for everyone' : 'Play for everyone'}</button><button className="fly-button" disabled={!live || !room?.music.url} onClick={() => session.transport(room?.music.playing ?? false, 0)}>Restart</button></div>
          <button className="fly-button oat-wide" disabled={!live || session.uploading} onClick={() => session.loadTrack(OAT_BACKING_TRACK, 'OAT mellow backing', true)}>Play built-in backing track</button>
          <label className="oat-file">{session.uploading ? 'Sharing your audio…' : 'Share an audio file · up to 12 MB'}<input aria-label="Share concert audio file" type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm,.flac" disabled={!live || session.uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void session.shareFile(file); event.target.value = '' }} /></label>
          <details><summary>Use a direct audio link</summary><form onSubmit={event => { event.preventDefault(); session.loadTrack(trackURL.trim(), trackTitle.trim() || 'Shared track') }}>
            <label htmlFor="oat-track-url">Audio URL</label><input id="oat-track-url" type="url" placeholder="https://…/song.mp3" value={trackURL} onChange={event => setTrackURL(event.target.value)} required />
            <label htmlFor="oat-track-name">Track name</label><input id="oat-track-name" value={trackTitle} maxLength={32} onChange={event => setTrackTitle(event.target.value)} />
            <button className="fly-button" disabled={!live}>Load for everyone</button><p className="oat-muted">Use a link to an audio file. Music service page links won’t play here.</p>
          </form></details>
        </>}
        <div className="oat-sound-controls">
          <button className="fly-button" disabled={!live} onClick={() => !session.listening || session.soundBlocked ? session.enableSound() : session.muteSound()}>{session.soundBlocked ? 'Enable / retry sound' : session.listening ? 'Mute my sound' : 'Enable my sound'}</button>
          <label htmlFor="oat-volume">My volume <input id="oat-volume" type="range" min={0} max={1} step={.05} value={session.volume} onChange={event => session.changeVolume(Number(event.target.value))} /></label>
        </div>
        {session.soundBlocked && <p className="oat-muted" role="status">Tap Enable / retry sound to hear the concert.</p>}
      </section>
      <section className="oat-section" aria-label="Concert lineup"><h3>Up next · {room?.queue.length ?? 0}</h3>
        {room?.queue.length ? <ol className="oat-lineup">{room.queue.map(queued => <li key={queued}>{room.participants.find(p => p.id === queued)?.name}{queued === selfId ? ' (you)' : ''}</li>)}</ol> : <p className="oat-muted">The next performer can join the queue.</p>}
        <h3>Audience</h3><p className="oat-audience">{room?.participants.filter(p => p.id !== room.performerId).map(p => `${p.name}${p.id === selfId ? ' (you)' : ''}`).join(', ') || 'Invite people to your concert.'}</p>
      </section>
    </>}
    <section className="oat-section"><h3>Invite your audience</h3><div className="oat-input-row"><input aria-label="Concert invitation link" readOnly value={invite} onFocus={event => event.target.select()} /><button className="fly-button" onClick={() => { void navigator.clipboard?.writeText(invite).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Copied' : 'Copy link'}</button></div></section>
    </div>
    {error && <p className="oat-error" role="alert">{error}</p>}
  </aside>
}
