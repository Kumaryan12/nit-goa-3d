import { useEffect, useState } from 'react'
import { SCREENING_CAPACITY, SCREENING_REACTIONS, screeningPosition } from '../lib/screening'
import type { ScreeningSession } from '../hooks/useScreening'
import type { ScreeningPlayerControls } from './ScreeningPlayer'

const stamp = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export default function ScreeningControls({ session, admin, onJoin, onClose, player }: { session: ScreeningSession; admin: boolean; onJoin: () => void; onClose: () => void; player: React.RefObject<ScreeningPlayerControls | null> }) {
  const { room, joined, live } = session
  const [collapsed, setCollapsed] = useState(false), [title, setTitle] = useState(''), [url, setURL] = useState(''), [seek, setSeek] = useState('0'), [chat, setChat] = useState(''), [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick(v => v + 1), 1000); return () => clearInterval(t) }, [])
  const position = room ? screeningPosition(room, session.serverNow()) : 0
  return <aside className={`screening-controls ${collapsed ? 'screening-collapsed' : ''}`} aria-label="Chapora screening controls" onKeyDown={e => e.stopPropagation()}>
    <div className="screening-heading"><span className="eyebrow">CHAPORA · MOVIE NIGHT</span><div><button aria-label={collapsed ? 'Expand screening controls' : 'Minimize screening controls'} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? 'Expand' : '−'}</button><button aria-label="Close screening panel" onClick={onClose}>×</button></div></div>
    {!collapsed && <>
      <h2>{room?.media ? room.title : 'Take a seat. Share a story.'}</h2>
      <p className="screening-status" role="status">{session.connectionStatus ?? (!room?.media ? 'No screening yet. The campus host chooses what plays.' : `${room.playing ? 'Now playing' : 'Paused'} · ${stamp(position)} · ${room.participants.length} / ${SCREENING_CAPACITY} seats`)}</p>
      {session.connectionStatus && <button onClick={session.reconnect}>Reconnect screening</button>}
      {room?.media && !room.hostOnline && <p className="screening-notice">The host disconnected. Playback is paused.</p>}
      {joined ? <>
        <p className="screening-seat">You’re seated in Chapora. Leave the screening to walk around.</p>
        <div className="screening-buttons"><button className="navigate-button" onClick={() => player.current?.fullscreen()}>Cinema view ↗</button><button onClick={session.leave}>Leave screening</button></div>
        <div className="screening-personal-sound"><button onClick={() => session.muted ? player.current?.enableSound() : session.setMuted(true)}>{session.muted ? 'Enable sound' : 'Mute sound'}</button><label>Volume<input aria-label="My screening volume" type="range" min="0" max="1" step=".05" value={session.volume} onChange={e => session.setVolume(Number(e.target.value))}/></label></div><p className="screening-hint">Your volume is personal. Playback follows the host.</p>
        <div className="screening-reactions" aria-label="Screening reactions">{SCREENING_REACTIONS.map(r => <button key={r} aria-label={`React ${r}`} onClick={() => session.command('react', { text: r })}>{r}</button>)}</div>
        <details className="screening-chat"><summary>Quiet chat{room?.messages.length ? ` · ${room.messages.length}` : ''}</summary><div className="screening-messages" role="log" aria-label="Screening chat">{room?.messages.map(m => <p key={m.id}><strong>{m.name}</strong><span>{m.text}</span></p>)}</div><form onSubmit={e => { e.preventDefault(); if (chat.trim() && session.command('chat', { text: chat })) setChat('') }}><label className="screening-sr-only" htmlFor="screening-chat">Message the audience</label><input id="screening-chat" maxLength={280} value={chat} onChange={e => setChat(e.target.value)} placeholder="Message the audience"/><button disabled={!live || !chat.trim()}>Send</button></form></details>
      </> : <button className="navigate-button" disabled={!live || !room?.media || session.pending} onClick={onJoin}>{session.pending ? 'Finding your seat…' : 'Join screening'}</button>}
      {session.error && <p className="screening-notice" role="alert">{session.error}</p>}
      {admin && <details className="screening-host" open={!room?.media}><summary>Host controls · only you</summary>
        <form onSubmit={e => { e.preventDefault(); session.command('load', { title: title.trim(), url: url.trim() }) }}>
          <label>Screening title<input maxLength={80} required value={title} onChange={e => setTitle(e.target.value)} placeholder="Tonight in Chapora"/></label>
          <label>Video link<input type="url" maxLength={2048} required value={url} onChange={e => setURL(e.target.value)} placeholder="YouTube or public HTTPS MP4 / WebM"/></label>
          <span className="screening-hint">Use a video you can share. Videos stream directly to viewers.</span><button disabled={!live}>Prepare screening</button>
        </form>
        {room?.media && <><div className="screening-buttons"><button disabled={!live} onClick={() => session.command(room.playing ? 'pause' : 'play')}>{room.playing ? 'Pause for everyone' : 'Play for everyone'}</button><button disabled={!live} onClick={() => session.command('end')}>End screening</button></div><form onSubmit={e => { e.preventDefault(); session.command('seek', { position: Number(seek) }) }}><label>Go to time (seconds)<input type="number" min="0" max="14400" step="1" value={seek} onChange={e => setSeek(e.target.value)}/></label><button disabled={!live}>Seek for everyone</button></form></>}
      </details>}
    </>}
  </aside>
}
