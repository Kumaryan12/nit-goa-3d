import { oatName, oatAudioURL, oatMusicPosition, OAT_CAPACITY } from '../src/lib/oatProtocol.ts'
import type { OatParticipant, OatSnapshot, OatMusic } from '../src/lib/oatProtocol.ts'

export function createOatRoom() {
  const participants = new Map<string, OatParticipant>(), actions = new Map<string, number>()
  let performerId: string | null = null, queue: string[] = [], micOn = false, sequence = 0
  let concertTitle = 'OAT Open Mic'
  const emptyMusic = (now: number): OatMusic => ({ url: '', title: '', position: 0, playing: false, updatedAt: now, duration: 0 })
  let music = emptyMusic(Date.now())
  function advance(now: number) { performerId = queue.shift() ?? null; micOn = false; music = emptyMusic(now) }
  return {
    add(id: string, now = Date.now()) {
      if (participants.size >= OAT_CAPACITY || participants.has(id)) return null
      const participant = { id, name: `Visitor ${Array.from(participants.values()).length + 1}` }
      participants.set(id, participant); sequence++; music.updatedAt ||= now
      return participant
    },
    remove(id: string, now = Date.now()) {
      if (!participants.delete(id)) return
      for (const key of actions.keys()) if (key.startsWith(id + ':')) actions.delete(key)
      queue = queue.filter(item => item !== id)
      if (performerId === id) advance(now)
      if (!participants.size) { performerId = null; music = emptyMusic(now); micOn = false; concertTitle = 'OAT Open Mic' }
      sequence++
    },
    isPerformer: (id: string) => performerId === id && participants.has(id),
    handle(id: string, value: unknown, now = Date.now()): string | null {
      const participant = participants.get(id)
      if (!participant || !value || typeof value !== 'object') return 'Join the OAT first.'
      const msg = value as Record<string, unknown>
      if (!['name', 'stage', 'leave-stage', 'concert', 'mic', 'track', 'transport', 'duration'].includes(String(msg.type))) return 'Unknown OAT action.'
      const actionKey = `${id}:${msg.type}`
      const stoppingLiveMic = msg.type === 'mic' && msg.enabled === false && micOn && performerId === id
      if (now - (actions.get(actionKey) ?? -Infinity) < 80 && !stoppingLiveMic) return 'Please wait a moment.'
      actions.set(actionKey, now)
      if (msg.type === 'name') {
        const name = oatName(msg.name); if (!name) return 'Enter a display name.'
        participant.name = name
      } else if (msg.type === 'stage') {
        if (id !== performerId && !queue.includes(id)) { if (!performerId) performerId = id; else queue.push(id) }
      } else if (msg.type === 'leave-stage') {
        queue = queue.filter(item => item !== id); if (performerId === id) advance(now)
      } else {
        if (performerId !== id) return 'Only the person on stage can control the performance.'
        if (msg.type === 'concert') {
          const title = oatName(msg.title); if (!title) return 'Enter a concert title.'
          concertTitle = title
        } else if (msg.type === 'mic') {
          if (typeof msg.enabled !== 'boolean') return 'Invalid microphone state.'
          micOn = msg.enabled
        } else if (msg.type === 'track') {
          const url = oatAudioURL(msg.url), title = oatName(msg.title) || 'Shared track'
          if (!url) return 'Use an audio file or a direct HTTPS audio link.'
          music = { url, title, position: 0, playing: msg.playing === true, updatedAt: now, duration: 0 }
        } else if (msg.type === 'transport') {
          if (!music.url || typeof msg.playing !== 'boolean' || !Number.isFinite(msg.position) || (msg.position as number) < 0 || (msg.position as number) > 14400) return 'Invalid playback position.'
          music = { ...music, position: music.duration ? Math.min(msg.position as number, music.duration) : msg.position as number, playing: msg.playing, updatedAt: now }
        } else if (msg.type === 'duration') {
          if (!music.url || msg.url !== music.url || !Number.isFinite(msg.duration) || (msg.duration as number) <= 0 || (msg.duration as number) > 14400) return 'Invalid track duration.'
          music.duration = msg.duration as number
        } else return 'Unknown OAT action.'
      }
      sequence++; return null
    },
    snapshot(now = Date.now()): OatSnapshot {
      if (music.playing && music.duration > 0 && oatMusicPosition(music, now) >= music.duration) { music = { ...music, position: music.duration, updatedAt: now, playing: false }; sequence++ }
      return { type: 'state', sequence, serverTime: now, participants: [...participants.values()].map(p => ({ ...p })), performerId, queue: [...queue], micOn, music: { ...music }, concertTitle }
    },
  }
}
