export type PostcardFormat = 'landscape' | 'portrait' | 'story'
export type PostcardTheme = 'paper' | 'midnight'
export interface PhotoPerson { id: string; name: string; x: number; y: number }
export interface ScenePhoto { image: HTMLCanvasElement; people: PhotoPerson[] }
export interface ScenePhotoCapture { capture: () => Promise<ScenePhoto> }
export interface PostcardOptions { format: PostcardFormat; theme: PostcardTheme; caption: string; place: string; takenAt: Date; includeNames?: boolean; names?: string[] }
export const POSTCARD_GROUP_LIMIT = 8
export function postcardNames(names: readonly string[]) { return names.slice(0, POSTCARD_GROUP_LIMIT).map(name => postcardText(name, 24)).filter(Boolean) }

export const POSTCARD_CAPTIONS = ['Some places stay with you.', 'Same campus. New memories.', 'Meet me where the memories are.', 'A little Goa, a lot of memories.'] as const

export function postcardShareText(caption: string, place: string, names: readonly string[] = []) {
  const group = postcardNames(names)
  return `${postcardText(caption) || POSTCARD_CAPTIONS[0]}\n\n${postcardText(place, 90) || 'NIT Goa'}${group.length ? `\nWith ${group.join(' · ')}` : ''}\nExplore NIT Goa in 3D → https://nitg-explored.pages.dev`
}

export function postcardLayout(format: PostcardFormat, includeNames = false) {
  const width = format === 'landscape' ? 1600 : 1080
  const height = format === 'story' ? 1920 : format === 'portrait' ? 1350 : 1200
  // Leave breathing room for story apps' profile header and reply controls.
  const top = format === 'story' ? 164 : 32, bottom = format === 'story' ? 200 : 24
  return { width, height, top, bottom, image: { x: 32, y: top + 112, width: width - 64, height: height - top - bottom - 240 - (includeNames ? 72 : 0) } }
}

// Use coordinates frozen with the photo, and recheck when a different format crops it.
export function postcardPeopleInCrop(people: readonly PhotoPerson[], sourceWidth: number, sourceHeight: number, format: PostcardFormat, includeNames: boolean) {
  const { image } = postcardLayout(format, includeNames), crop = postcardCrop(sourceWidth, sourceHeight, image.width, image.height)
  const ids = new Set<string>()
  return people.filter(person => {
    const x = person.x * sourceWidth, y = person.y * sourceHeight
    if (ids.has(person.id) || !Number.isFinite(x) || !Number.isFinite(y) || x < crop.x || x > crop.x + crop.width || y < crop.y || y > crop.y + crop.height) return false
    ids.add(person.id); return true
  }).slice(0, 32)
}

export function postcardCrop(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(value => Number.isFinite(value) && value > 0)) throw Error('The campus image is not ready. Try another shot.')
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = targetWidth / scale, height = targetHeight / scale
  return { x: (sourceWidth - width) / 2, y: (sourceHeight - height) / 2, width, height }
}

export function postcardText(value: string, limit = 72) {
  return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('')
}

function fitText(context: CanvasRenderingContext2D, value: string, width: number) {
  const characters = Array.from(value)
  while (characters.length && context.measureText(characters.join('') + (characters.length < Array.from(value).length ? '…' : '')).width > width) characters.pop()
  return characters.join('') + (characters.length < Array.from(value).length ? '…' : '')
}

let logoPromise: Promise<HTMLImageElement> | undefined
function instituteLogo() {
  if (!logoPromise) logoPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const logo = new Image()
    const finish = () => { clearTimeout(timer); logo.onload = logo.onerror = null }
    const timer = window.setTimeout(() => { finish(); reject(Error('The NIT Goa logo could not load. Please try again.')) }, 8000)
    logo.onload = () => { finish(); resolve(logo) }
    logo.onerror = () => { finish(); reject(Error('The NIT Goa logo could not load. Please try again.')) }
    logo.src = '/brand/nit-goa-logo.png'
  }).catch(error => { logoPromise = undefined; throw error })
  return logoPromise
}

function captionLines(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(' ')
  if (context.measureText(text).width <= width) return [text]
  // Balance two-line headlines instead of leaving a single short word alone.
  let balanced: string[] | undefined, difference = Infinity
  for (let split = 1; split < words.length; split++) {
    const pair = [words.slice(0, split).join(' '), words.slice(split).join(' ')]
    const widths = pair.map(value => context.measureText(value).width)
    if (widths.every(value => value <= width) && Math.abs(widths[0] - widths[1]) < difference) {
      balanced = pair; difference = Math.abs(widths[0] - widths[1])
    }
  }
  if (balanced) return balanced
  const lines: string[] = []; let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > width) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return [...lines.slice(0, 2), ...(lines.length > 2 ? [lines.slice(2).join(' ')] : [])].map(value => fitText(context, value, width))
}

export async function renderPostcard(source: HTMLCanvasElement, options: PostcardOptions): Promise<Blob> {
  const layout = postcardLayout(options.format, options.includeNames), canvas = document.createElement('canvas')
  canvas.width = layout.width; canvas.height = layout.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(Error('Your browser could not create a postcard. Try another browser.'))
  try {
    const logo = await instituteLogo()
    const dark = options.theme === 'midnight', ink = dark ? '#f2ead6' : '#203d32', muted = dark ? '#afc1b5' : '#5d7164'
    const { image } = layout, crop = postcardCrop(source.width, source.height, image.width, image.height)
    context.fillStyle = dark ? '#102b25' : '#f6f1e5'; context.fillRect(0, 0, canvas.width, canvas.height)
    // Keep the official wordmark intact, at its original aspect ratio, on white.
    context.fillStyle = '#ffffff'; context.fillRect(48, layout.top + 7, 360, 68)
    const logoWidth = 336, logoHeight = logoWidth * logo.naturalHeight / logo.naturalWidth
    context.drawImage(logo, 60, layout.top + 41 - logoHeight / 2, logoWidth, logoHeight)
    context.textAlign = 'right'; context.fillStyle = ink; context.font = '600 23px system-ui, sans-serif'
    context.fillText('NITG / EXPLORED', canvas.width - 48, layout.top + 35)
    context.fillStyle = muted; context.font = '15px system-ui, sans-serif'
    context.fillText('An independent campus experience', canvas.width - 48, layout.top + 62)
    context.textAlign = 'left'
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, image.x, image.y, image.width, image.height)
    const photoBottom = image.y + image.height
    const shade = context.createLinearGradient(0, photoBottom - 420, 0, photoBottom)
    shade.addColorStop(0, 'rgba(5, 24, 20, 0)'); shade.addColorStop(.5, 'rgba(5, 24, 20, 0.55)'); shade.addColorStop(1, 'rgba(5, 24, 20, 0.94)')
    context.fillStyle = shade; context.fillRect(image.x, Math.max(image.y, photoBottom - 420), image.width, Math.min(420, image.height))
    context.fillStyle = '#f3e9cc'; context.font = '600 17px system-ui, sans-serif'
    context.fillText('POSTCARDS FROM CAMPUS', image.x + 36, photoBottom - 46)
    const fontSize = options.format === 'landscape' ? 76 : 66, lineHeight = fontSize * 1.08
    context.font = `italic ${fontSize}px Georgia, serif`; context.fillStyle = '#fff9e8'
    const lines = captionLines(context, postcardText(options.caption) || POSTCARD_CAPTIONS[0], image.width - 72)
    lines.forEach((line, index) => context.fillText(line, image.x + 36, photoBottom - 96 - (lines.length - 1 - index) * lineHeight))
    context.fillStyle = ink; context.font = '600 26px system-ui, sans-serif'
    context.fillText(fitText(context, postcardText(options.place, 90) || 'NIT Goa', canvas.width - 350), 48, photoBottom + 48)
    context.fillStyle = muted; context.font = '18px system-ui, sans-serif'; context.textAlign = 'right'
    context.fillText(new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(options.takenAt), canvas.width - 48, photoBottom + 48)
    context.textAlign = 'left'; context.font = '19px system-ui, sans-serif'
    context.fillText('A campus, connected.', 48, photoBottom + 80)
    if (options.includeNames && options.names?.length) {
      context.font = '18px system-ui, sans-serif'
      captionLines(context, `With ${postcardNames(options.names).join(' · ')}`, canvas.width - 96).forEach((line, index) => context.fillText(line, 48, photoBottom + 114 + index * 22))
    }
    context.font = '13px system-ui, sans-serif'
    context.fillText('Map data © OpenStreetMap contributors', 48, canvas.height - layout.bottom)
    context.textAlign = 'right'; context.fillText('nitg-explored.pages.dev', canvas.width - 48, canvas.height - layout.bottom)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob); else reject(Error('The postcard could not be saved. Try another shot.'))
    }, 'image/png'))
  } finally { canvas.width = canvas.height = 0 }
}
