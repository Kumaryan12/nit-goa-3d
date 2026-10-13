import { useEffect, useRef, useState } from 'react'
import { CafeVoiceClient } from '../lib/cafeVoiceClient'
import type { TableVoiceView } from '../lib/cafeVoiceClient'
import type { CampusLiveSession } from './useCampusSession'
const idle: TableVoiceView = { joined: false, pending: false, mic: false, table: null, members: [], connected: 0, error: '' }
export function useCafeVoice(live: CampusLiveSession, seatId: string | undefined, available: boolean) {
  const client = useRef<CafeVoiceClient | null>(null)
  const [view, setView] = useState(idle), [volume, setVolume] = useState(.8), [muted, setMuted] = useState<Set<string>>(new Set())
  const [leaveNotice, setLeaveNotice] = useState('')
  const [leaveConfirmation, setLeaveConfirmation] = useState<'stand' | 'voice' | null>(null)
  useEffect(() => {
    if (!leaveNotice) return
    const timer = window.setTimeout(() => setLeaveNotice(''), 5000)
    return () => window.clearTimeout(timer)
  }, [leaveNotice])
  useEffect(() => {
    let wasJoined = false
    const voice = new CafeVoiceClient(live.sendCafeVoice, next => {
      if (wasJoined && !next.joined) setLeaveNotice('You left the table conversation.')
      if (next.joined) setLeaveNotice('')
      else setLeaveConfirmation(null)
      wasJoined = next.joined
      setView(next)
    }); client.current = voice
    const unregisterGuard = live.registerSocialStopGuard(() => {
      if (!voice.view().joined) return true
      setLeaveConfirmation('stand'); return false
    })
    const unsubscribe = live.subscribeCafeVoice(event => { voice.receive(event); if (!voice.view().joined) setMuted(new Set()) })
    const hidden = () => { if (document.hidden) voice.leave() }, leave = () => voice.leave()
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', leave)
    return () => { unregisterGuard(); unsubscribe(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', leave); voice.close(); client.current = null }
  }, [live.sendCafeVoice, live.subscribeCafeVoice, live.registerSocialStopGuard])
  useEffect(() => { client.current?.leave(); setMuted(new Set()) }, [seatId, available])
  return { view, volume, muted, leaveConfirmation, cancelLeave: () => setLeaveConfirmation(null),
    confirmLeave: () => {
      const stand = leaveConfirmation === 'stand'
      setLeaveConfirmation(null); client.current?.leave(); setMuted(new Set())
      if (stand) live.socialAction('stop')
    },
    leaveNotice, dismissLeaveNotice: () => setLeaveNotice(''),
    listen: () => { if (available) client.current?.listen() }, startMic: () => { if (available) void client.current?.startMic() },
    muteMic: () => client.current?.muteMic(), leave: () => { if (client.current?.view().joined) setLeaveConfirmation('voice'); else { client.current?.leave(); setMuted(new Set()) } },
    setVolume: (value: number) => { setVolume(value); client.current?.volume(value) },
    toggleMute: (id: string) => setMuted(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); client.current?.mute(id, next.has(id)); return next }),
  }
}
