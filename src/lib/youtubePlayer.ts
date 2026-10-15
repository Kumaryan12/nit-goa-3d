export interface YoutubePlayer {
  playVideo(): void; pauseVideo(): void; seekTo(time: number, ahead: boolean): void
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number
  setVolume(value: number): void; mute(): void; unMute(): void; destroy(): void
}
interface YoutubeAPI { Player: new (element: HTMLElement, options: { events: { onReady: (event: { target: YoutubePlayer }) => void; onError: (event: { data: number }) => void; onAutoplayBlocked: () => void; onStateChange: (event: { data: number }) => void } }) => YoutubePlayer }
type YoutubeWindow = Window & { YT?: YoutubeAPI; onYouTubeIframeAPIReady?: () => void }
let loading: Promise<YoutubeAPI> | null = null
export function loadYoutubePlayer(): Promise<YoutubeAPI> {
  const w = window as YoutubeWindow
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script'), previous = w.onYouTubeIframeAPIReady
    const failed = () => { clearTimeout(timeout); script.remove(); loading = null; w.onYouTubeIframeAPIReady = previous; reject(Error('YouTube could not load. Check your connection or content blocker.')) }
    const timeout = window.setTimeout(failed, 20000)
    w.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); previous?.(); if (w.YT?.Player) resolve(w.YT); else failed() }
    script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.onerror = failed
    document.head.appendChild(script)
  })
  return loading
}
