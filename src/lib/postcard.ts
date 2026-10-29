export type PostcardFormat = 'landscape' | 'portrait'
export type PostcardTheme = 'paper' | 'midnight'
export interface ScenePhotoCapture { capture: () => Promise<HTMLCanvasElement> }
export interface PostcardOptions { format: PostcardFormat; theme: PostcardTheme; caption: string; place: string; takenAt: Date }

export function postcardLayout(format: PostcardFormat) {
  const width = format === 'portrait' ? 1200 : 1600, height = format === 'portrait' ? 1600 : 1200
  const margin = 48
  return { width, height, image: { x: margin, y: margin, width: width - margin * 2, height: height - margin * 2 - 200 } }
}

export function postcardCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) throw Error('The campus image is not ready. Try another shot.')
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = targetWidth / scale, height = targetHeight / scale
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height }
}

export function postcardText(value: string, limit = 72) {
  return Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('')
}

function fitText(context: CanvasRenderingContext2D, value: string, width: number) {
  const characters = Array.from(value)
  while (characters.length && context.measureText(characters.join('') + (characters.length < Array.from(value).length ? '…' : '')).width > width) characters.pop()
  return characters.join('') + (characters.length < Array.from(value).length ? '…' : '')
}

export async function renderPostcard(source: HTMLCanvasElement, options: PostcardOptions): Promise<Blob> {
  const layout = postcardLayout(options.format), canvas = document.createElement('canvas')
  canvas.width = layout.width; canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(Error('Your browser could not create a postcard. Try another browser.'))
  const dark = options.theme === 'midnight', ink = dark ? '#f2ead6' : '#203d32', muted = dark ? '#a9bbae' : '#5d7164'
  const { image } = layout, crop = postcardCrop(source.width, source.height, image.width, image.height)
  context.fillStyle = dark ? '#102b25' : '#f6f1e5'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, image.x, image.y, image.width, image.height)
  const bottom = image.y + image.height
  context.fillStyle = ink; context.font = '600 25px system-ui, sans-serif'
  context.fillText('NITG / EXPLORED', 48, bottom + 55)
  context.fillStyle = muted; context.font = '18px system-ui, sans-serif'; context.textAlign = 'right'
  context.fillText(new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(options.takenAt), canvas.width - 48, bottom + 55)
  context.textAlign = 'left'; context.fillStyle = ink; context.font = 'italic 36px Georgia, serif'
  context.fillText(fitText(context, postcardText(options.caption) || 'Wish you were here.', canvas.width - 96), 48, bottom + 112)
  context.fillStyle = muted; context.font = '19px system-ui, sans-serif'
  context.fillText(fitText(context, postcardText(options.place, 90) || 'NIT Goa', canvas.width - 96), 48, bottom + 150)
  context.font = '13px system-ui, sans-serif'
  context.fillText('Map data © OpenStreetMap contributors', 48, canvas.height - 30)
  context.textAlign = 'right'; context.fillText('nitg-explored.pages.dev', canvas.width - 48, canvas.height - 30)
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    canvas.width = canvas.height = 0
    if (blob) resolve(blob); else reject(Error('The postcard could not be saved. Try another shot.'))
  }, 'image/png'))
}
