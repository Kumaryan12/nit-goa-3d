export type PhotoStatus = 'pending' | 'approved' | 'rejected'
export interface GalleryPhoto {
  id: string; locationId: string; storagePath: string; thumbnailUrl: string; imageUrl: string;
  caption: string; authorId: string; authorDisplayName: string; createdAt: string; updatedAt: string;
  width: number; height: number; status: PhotoStatus; likeCount: number; liked?: boolean;
  // Compatibility aliases for the Phase 6 demo dataset; never present it as real photography.
  image: string; author: string; placeholder: boolean
}
export interface GalleryUploadInput {
  id: string; locationId: string; caption: string; image: Blob; thumbnail: Blob; width: number; height: number
}
export interface PhotoReportInput { photoId: string; reason: string }
export type UploadStage = 'preparing' | 'uploading' | 'submitting' | 'complete'
export interface GalleryRepository {
  readonly mode: 'demo' | 'supabase'
  getByLocation(locationId: string): Promise<GalleryPhoto[]>
  getRecent(locationId?: string): Promise<GalleryPhoto[]>
  getPopular(locationId?: string): Promise<GalleryPhoto[]>
  getById(id: string): Promise<GalleryPhoto | null>
  create(input: GalleryUploadInput, onStage?: (stage: UploadStage) => void): Promise<GalleryPhoto>
  deleteOwnPhoto(id: string): Promise<void>
  like(id: string): Promise<void>
  unlike(id: string): Promise<void>
  report(input: PhotoReportInput): Promise<void>
}
