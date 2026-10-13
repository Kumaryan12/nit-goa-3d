import type { useCafeVoice } from '../hooks/useCafeVoice'
import { oatUsageAmount } from '../lib/oatUsage'
export default function CafeTableVoice({ voice, enabled, ownId }: { voice: Pick<ReturnType<typeof useCafeVoice>, 'view' | 'volume' | 'muted' | 'listen' | 'startMic' | 'muteMic' | 'leave' | 'setVolume' | 'toggleMute'>; enabled: boolean; ownId: string | null }) {
  const { view } = voice, others = view.members.filter(m => m.id !== ownId)
  return <div className="cafe-table-voice" role="group" aria-label="Table conversation">
    <div className="cafe-voice-heading"><strong>Table conversation</strong>{view.mic && <span className="cafe-mic-live">● Mic on</span>}</div>
    <p className="social-action-note">{view.joined ? others.length ? `${others.length} ${others.length === 1 ? 'person' : 'people'} joined · ${view.connected} connected` : 'You’re the first here. Invite your tablemates to join.' : 'Talk with people at this table. Your microphone starts only when you choose.'}</p>
    <div className="cafe-drink-actions">
      <button disabled={!enabled || view.pending && !view.mic} onClick={view.mic ? voice.muteMic : voice.startMic}>{view.mic ? 'Mute microphone' : view.pending ? 'Connecting…' : view.joined ? 'Turn mic on' : 'Start talking'}</button>
      {!view.joined && <button disabled={!enabled || view.pending} onClick={voice.listen}>Listen</button>}
      {(view.joined || view.pending) && <button onClick={voice.leave}>Leave voice</button>}
    </div>
    {view.joined && <>
      <label className="cafe-voice-volume">Volume <input aria-label="Table voice volume" type="range" min="0" max="1" step=".05" value={voice.volume} onChange={e => voice.setVolume(Number(e.target.value))} /><span>{Math.round(voice.volume * 100)}%</span></label>
      {others.map(m => <div className="cafe-voice-member" key={m.id}><span>{m.name} <small>{m.mic ? 'Mic on' : 'Listening'}</small></span><button aria-pressed={voice.muted.has(m.id)} onClick={() => voice.toggleMute(m.id)}>{voice.muted.has(m.id) ? 'Unmute' : 'Mute'}</button></div>)}
    </>}
    {view.usage && <p className="social-action-note">Campus voice: {view.usage.usedBytes === null ? 'checking' : oatUsageAmount(view.usage.usedBytes)} used · pauses at {oatUsageAmount(view.usage.cutoffBytes)}.</p>}
    {view.error && <p className="social-action-note cafe-voice-error" role="status">{view.error}</p>}
    {!enabled && <p className="social-action-note">Join the live campus to use table voice.</p>}
    <p className="cafe-voice-privacy">Only this table hears you. Standing up ends voice.</p>
  </div>
}
