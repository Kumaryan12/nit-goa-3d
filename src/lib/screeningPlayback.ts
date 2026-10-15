import { screeningPosition } from './screening.ts'
import type { ScreeningState } from './screening.ts'
import type { YoutubePlayer } from './youtubePlayer.ts'

export interface ScreeningVideo {
  currentTime: number; duration: number; playbackRate: number; readyState: number; paused: boolean; ended: boolean
  play(): Promise<void>; pause(): void
}
// Nudge small drift without repeated seeks; larger drift, reconnects and
// host seeking need one correction. Do not restart a video at its natural end.
export function syncScreeningVideo(video: ScreeningVideo, room: ScreeningState, now: number, visible: boolean, blocked: () => void, allowPlayback = true) {
  if (!visible) { video.pause(); return }
  if (video.readyState < 1 || (!allowPlayback && room.playing)) return
  const time = screeningPosition(room, now), end = Number.isFinite(video.duration) ? video.duration : Infinity
  const target = Math.min(time, Math.max(0, end - .02)), drift = target - video.currentTime
  if (Math.abs(drift) > (room.playing ? 1.2 : .15)) video.currentTime = target
  video.playbackRate = !room.playing || Math.abs(drift) > 1.2 || Math.abs(drift) < .12 ? 1 : drift > 0 ? 1.03 : .97
  if (!room.playing || time >= end) video.pause()
  else if (allowPlayback && video.paused && !video.ended) void video.play().catch(blocked)
}

// Seeking a blocked or buffering iframe every second repeatedly interrupts its
// startup. Wait for a user gesture / buffered playback, then correct once.
export function syncScreeningYoutube(player: YoutubePlayer, room: ScreeningState, now: number, allowPlayback = true) {
  const state = player.getPlayerState()
  if (!allowPlayback && room.playing) return
  const duration = player.getDuration()
  let target = screeningPosition(room, now)
  // Audio/video tracks can differ by a few milliseconds at their natural end.
  if (room.loop && state === 0 && duration > 0 && target >= duration - .1) target = 0
  if (!room.loop && duration > 0 && target >= duration) { player.pauseVideo(); return }
  if (state !== 3 && Math.abs(player.getCurrentTime() - target) > (room.playing ? 1.3 : .2)) player.seekTo(target, true)
  if (room.playing && [2, 5, -1, ...(room.loop ? [0] : [])].includes(state)) player.playVideo()
  if (!room.playing && state !== 2) player.pauseVideo()
}
