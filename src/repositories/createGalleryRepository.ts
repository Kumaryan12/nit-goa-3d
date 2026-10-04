import { demoGalleryRepository } from '../lib/gallery.ts'
import type { GalleryRepository } from '../types/gallery.ts'
// Photo storage will be connected separately; authentication uses Firebase.
export function createGalleryRepository(): Promise<GalleryRepository> {
  return Promise.resolve(demoGalleryRepository)
}
