import { galleryPhotos } from '../data/gallery.ts'
import type { GalleryPhoto, GalleryRepository } from '../types/gallery.ts'
export class DemoGalleryRepository implements GalleryRepository {
  readonly mode = 'demo' as const
  private readonly photos: GalleryPhoto[]
  constructor(photos: GalleryPhoto[] = galleryPhotos) { this.photos = photos }
  async getByLocation(locationId: string) { return this.photos.filter((p) => p.locationId === locationId && p.status === 'approved') }
  async getRecent(locationId?: string) { return this.photos.filter((p) => p.status === 'approved' && (!locationId || p.locationId === locationId)).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  async getPopular(locationId?: string) { return (await this.getRecent(locationId)).sort((a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt)) }
  async getById(id: string) { return this.photos.find((p) => p.id === id && p.status === 'approved') ?? null }
  async create(): Promise<GalleryPhoto> { throw new Error('Community persistence is unavailable in demo mode. Photo storage is not connected yet.') }
  async deleteOwnPhoto() { throw new Error('Sign in to a configured community backend to delete your photo.') }
  async like() { throw new Error('Sign in to a configured community backend to like photos.') }
  async unlike() { throw new Error('Sign in to a configured community backend to unlike photos.') }
  async report() { throw new Error('Sign in to a configured community backend to report photos.') }
}
