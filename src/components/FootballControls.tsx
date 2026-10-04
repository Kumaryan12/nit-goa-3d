import type { FootballControls as Input, FootballStatus } from '../lib/football'
import type { FootballConnection } from '../hooks/useFootballSession'
import type { FootballPlayer } from '../lib/footballProtocol'
const eventText = (status: FootballStatus | null) => status?.event === 'blue-goal' ? 'Blue scores!' : status?.event === 'gold-goal' ? 'Gold scores!' : status?.event === 'out' ? 'Out of play' : status?.canKick ? 'Ball in reach · take a shot' : 'Walk to the ball to kick'
export default function FootballControls({ input, status, connection, players, selfId, paused, onLeave, onRetry }: {
  input: React.RefObject<Input>; status: FootballStatus | null; connection: FootballConnection; players: FootballPlayer[]; selfId: string | null; paused: boolean; onLeave: () => void; onRetry: () => void
}) {
  const self = players.find(player => player.id === selfId), live = connection === 'live'
  return <aside className="football-controls" aria-label="Multiplayer football controls">
    <div className="football-heading"><span className="eyebrow">Sports Ground · Live football</span><button className="text-button" onClick={onLeave}>Leave</button></div>
    <div className="football-score" aria-label={`Blue ${status?.blue ?? 0}, Gold ${status?.gold ?? 0}`}><span className="blue">Blue <b>{status?.blue ?? 0}</b></span><span aria-hidden="true">:</span><span className="gold"><b>{status?.gold ?? 0}</b> Gold</span></div>
    <p className="football-connection">{live ? `${players.length} ${players.length === 1 ? 'player' : 'players'} on pitch${self ? ` · You: ${self.team === 'blue' ? 'Blue' : 'Gold'}` : ''}` : connection === 'waiting' ? 'Pitch full · you’re in the waiting queue' : connection === 'connecting' ? 'Joining the shared pitch…' : 'Football server unavailable'}</p>
    <p className="football-event" role="status">{live ? paused ? 'Your player is paused' : `${eventText(status)}${status?.countdown ? ` · Kickoff in ${status.countdown}` : ''}` : connection === 'waiting' ? 'You’ll enter automatically when a place opens.' : 'Reconnect to play with everyone.'}</p>
    <div className="football-actions"><button className="navigate-button" disabled={!live || paused || !status?.canKick} onClick={() => { input.current.kick++ }}>Kick · Space</button>{!live && connection !== 'connecting' && connection !== 'waiting' && <button className="fly-button" onClick={onRetry}>Reconnect</button>}</div>
    <button className="text-button football-reset" disabled={!live || paused} onClick={() => { input.current.reset++ }}>Return ball to center</button>
    <p className="football-help">Move to dribble. Aim by turning or dragging. Space kicks; Shift + Space shoots harder. Blue attacks the blue goal; Gold attacks gold.</p>
  </aside>
}
