import { demoGalleryRepository } from '../lib/gallery.ts'
import { publicBackendConfig } from '../lib/supabase.ts'
import type { GalleryRepository } from '../types/gallery.ts'
let repository: Promise<GalleryRepository> | null = null
export function createGalleryRepository(): Promise<GalleryRepository> {
  repository ??= publicBackendConfig ? import('./SupabaseGalleryRepository.ts').then(({ SupabaseGalleryRepository }) => new SupabaseGalleryRepository()) : Promise.resolve(demoGalleryRepository)
  return repository
}
