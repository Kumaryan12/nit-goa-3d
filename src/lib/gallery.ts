import { galleryPhotos } from '../data/gallery.ts'
import type { GalleryPhoto, GalleryRepository } from '../types/gallery.ts'

export function galleryForLocation(locationId: string, photos: GalleryPhoto[] = galleryPhotos): GalleryPhoto[] {
  return photos.filter((photo) => photo.locationId === locationId)
}

export const demoGalleryRepository: GalleryRepository = {
  async getByLocation(locationId) { return galleryForLocation(locationId) },
}
