import { galleryPhotos } from '../data/gallery.ts'
import { DemoGalleryRepository } from '../repositories/DemoGalleryRepository.ts'
import type { GalleryPhoto } from '../types/gallery.ts'
export function galleryForLocation(locationId: string, photos: GalleryPhoto[] = galleryPhotos): GalleryPhoto[] { return photos.filter((photo) => photo.locationId === locationId) }
export const demoGalleryRepository = new DemoGalleryRepository()
export function optimisticLike(photo: GalleryPhoto): GalleryPhoto { return { ...photo, liked: !photo.liked, likeCount: Math.max(0, photo.likeCount + (photo.liked ? -1 : 1)) } }
export async function toggleLikeWithRollback(photo: GalleryPhoto, commit: (p: GalleryPhoto) => void, persist: (liked: boolean) => Promise<void>): Promise<void> {
  const next = optimisticLike(photo); commit(next)
  try { await persist(!!next.liked) } catch (error) { commit(photo); throw error }
}
