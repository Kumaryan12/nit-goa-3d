export const MAX_INPUT_BYTES = 12 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 32_000_000
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export function validateImage(file: { size: number; type: string }): void {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size <= 0 || file.size > MAX_INPUT_BYTES) throw new Error('Image must be nonempty and no larger than 12 MB.')
}
export function resizeDimensions(width: number, height: number, maxEdge = 2048): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > MAX_IMAGE_PIXELS || maxEdge <= 0) throw new Error('Image dimensions are invalid or exceed 32 megapixels.')
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
// Header inspection limits decompression before decoding. MIME alone is untrusted.
export function imageDimensions(bytes: Uint8Array, type: string): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (type === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 255) continue
      const marker = bytes[offset++]
      if (marker === 0xd8 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue
      if (marker === 0xd9 || marker === 0xda) break
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) break
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) }
      offset += size
    }
  }
  if (type === 'image/webp' && bytes.length >= 30 && view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
    const chunk = view.getUint32(12)
    if (chunk === 0x56503858) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    if (chunk === 0x56503820 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
    if (chunk === 0x5650384c && bytes[20] === 0x2f) { const bits = view.getUint32(21, true); return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 } }
  }
  throw new Error('Image content does not match a supported image header.')
}
export async function processImage(file: File): Promise<{ image: Blob; thumbnail: Blob; width: number; height: number }> {
  validateImage(file)
  const header = imageDimensions(new Uint8Array(await file.arrayBuffer()), file.type)
  resizeDimensions(header.width, header.height)
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const dimensions = resizeDimensions(bitmap.width, bitmap.height)
    const encode = async (maxEdge: number, quality: number) => {
      const size = resizeDimensions(bitmap.width, bitmap.height, maxEdge), canvas = document.createElement('canvas')
      canvas.width = size.width; canvas.height = size.height
      const context = canvas.getContext('2d'); if (!context) throw new Error('Image processing is unavailable in this browser.')
      context.drawImage(bitmap, 0, 0, size.width, size.height)
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob?.type === 'image/webp' && blob.size <= 4 * 1024 * 1024 ? resolve(blob) : reject(new Error('Unable to create an optimized WebP below 4 MB.')), 'image/webp', quality))
    }
    const image = await encode(2048, 0.84), thumbnail = await encode(480, 0.76)
    return { image, thumbnail, ...dimensions }
  } finally { bitmap.close() }
}
