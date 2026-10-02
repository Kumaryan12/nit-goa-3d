import { getSupabase } from '../lib/supabase.ts'
import { campusLocations } from '../data/campus.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { GalleryPhoto, GalleryRepository, GalleryUploadInput, PhotoReportInput, UploadStage } from '../types/gallery.ts'
export interface PhotoRow { id: string; location_id: string; storage_path: string; caption: string; author_id: string; author_display_name: string; created_at: string; updated_at: string; width: number; height: number; status: GalleryPhoto['status']; like_count: number }
export function photoFromRow(row: PhotoRow, imageUrl: string, thumbnailUrl: string, liked = false): GalleryPhoto {
  return { id: row.id, locationId: row.location_id, storagePath: row.storage_path, imageUrl, thumbnailUrl, caption: row.caption, authorId: row.author_id, authorDisplayName: row.author_display_name, createdAt: row.created_at, updatedAt: row.updated_at, width: row.width, height: row.height, status: row.status, likeCount: row.like_count, liked, image: imageUrl, author: row.author_display_name, placeholder: false }
}
export class SupabaseGalleryRepository implements GalleryRepository {
  readonly mode = 'supabase' as const
  private cache = new Map<string, GalleryPhoto>()
  private readonly clientProvider: () => Promise<SupabaseClient>
  constructor(clientProvider: () => Promise<SupabaseClient> = getSupabase) { this.clientProvider = clientProvider }
  private async identity() { const client = await this.clientProvider(); const { data, error } = await client.auth.getUser(); if (error || !data.user) throw new Error('Please sign in again to continue.'); return { client, user: data.user } }
  private async hydrate(rows: PhotoRow[]): Promise<GalleryPhoto[]> {
    const client = await this.clientProvider()
    const { data: auth } = await client.auth.getSession()
    const likes = auth.session && rows.length ? await client.from('photo_likes').select('photo_id').eq('user_id', auth.session.user.id).in('photo_id', rows.map((row) => row.id)) : null
    if (likes?.error) throw likes.error
    const liked = new Set(likes?.data?.map((row) => row.photo_id) ?? [])
    const paths = rows.flatMap((row) => [row.storage_path, row.storage_path.replace(/original\.webp$/, 'thumbnail.webp')])
    const urls = paths.length ? await client.storage.from('campus-gallery').createSignedUrls(paths, 3600) : null
    if (urls?.error) throw new Error('Photo storage could not be read. Please retry.')
    return rows.map((row, i) => { const photo = photoFromRow(row, urls?.data?.[i * 2]?.signedUrl ?? '', urls?.data?.[i * 2 + 1]?.signedUrl ?? '', liked.has(row.id)); this.cache.set(photo.id, photo); return photo })
  }
  private async list(order: 'created_at' | 'like_count', locationId?: string) {
    const client = await this.clientProvider()
    let query = client.from('photos').select('*').eq('status', 'approved').order(order, { ascending: false }).order('id').limit(60)
    if (locationId) query = query.eq('location_id', locationId)
    try { const { data, error } = await query; if (error) throw error; return await this.hydrate(data ?? []) }
    catch (error) { if (typeof navigator !== 'undefined' && navigator.onLine === false) return [...this.cache.values()].filter((photo) => !locationId || photo.locationId === locationId); throw error }
  }
  getByLocation(locationId: string) { return this.list('created_at', locationId) }
  getRecent(locationId?: string) { return this.list('created_at', locationId) }
  getPopular(locationId?: string) { return this.list('like_count', locationId) }
  async getById(id: string) { const client = await this.clientProvider(); const { data, error } = await client.from('photos').select('*').eq('id', id).eq('status', 'approved').maybeSingle(); if (error) throw error; return data ? (await this.hydrate([data]))[0] : null }
  async create(input: GalleryUploadInput, onStage?: (stage: UploadStage) => void) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Reconnect before uploading.')
    if (!campusLocations.some((p) => p.id === input.locationId) || !input.caption.trim() || input.caption.length > 500 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id) || !Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || Math.max(input.width, input.height) > 2048) throw new Error('Invalid photo details.')
    for (const blob of [input.image, input.thumbnail]) if (blob.type !== 'image/webp' || blob.size > 4 * 1024 * 1024 || blob.size === 0) throw new Error('Upload must be an optimized WebP below 4 MB.')
    const { client, user } = await this.identity(), storage = client.storage.from('campus-gallery'), folder = `${user.id}/${input.id}`
    // Stable UUID across retries plus database PK and storage upsert=false prevent duplicate submissions.
    const { data: existing, error: lookupError } = await client.from('photos').select('*').eq('id', input.id).eq('author_id', user.id).maybeSingle()
    if (lookupError) throw lookupError
    if (existing) return photoFromRow(existing, '', '')
    onStage?.('uploading')
    const paths: string[] = []
    try {
      for (const [name, blob] of [['original.webp', input.image], ['thumbnail.webp', input.thumbnail]] as const) {
        const path = `${folder}/${name}`, { error } = await storage.upload(path, blob, { contentType: 'image/webp', upsert: false })
        // Existing objects at this owner-only stable path can be from a lost response.
        if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`Storage upload failed: ${error.message}`)
        paths.push(path)
      }
      onStage?.('submitting')
      const { data, error } = await client.from('photos').insert({ id: input.id, location_id: input.locationId, storage_path: `${folder}/original.webp`, caption: input.caption.trim(), author_id: user.id, width: input.width, height: input.height, status: 'pending' }).select('*').single()
      if (error) {
        const retry = await client.from('photos').select('*').eq('id', input.id).eq('author_id', user.id).maybeSingle()
        if (retry.data) return photoFromRow(retry.data, '', '')
        throw new Error(`Photo submission failed: ${error.message}. Retry with your caption intact.`)
      }
      onStage?.('complete'); return photoFromRow(data, '', '')
    } catch (error) {
      // Leave owned retry objects at the stable path; deleting after an uncertain DB response
      // could destroy a successfully submitted photo. Dashboard cleanup can remove true orphans.
      void paths; throw error
    }
  }
  async deleteOwnPhoto(id: string) {
    const { client, user } = await this.identity()
    const { data, error } = await client.from('photos').select('storage_path').eq('id', id).eq('author_id', user.id).single()
    if (error || !data) throw new Error('Only the owner can delete this photo.')
    // Delete objects while the owner row still exists, then delete metadata.
    const removed = await client.storage.from('campus-gallery').remove([data.storage_path, data.storage_path.replace(/original\.webp$/, 'thumbnail.webp')]); if (removed.error) throw removed.error
    const deleted = await client.from('photos').delete().eq('id', id).eq('author_id', user.id); if (deleted.error) throw deleted.error
    this.cache.delete(id)
  }
  async like(id: string) { const { client, user } = await this.identity(); const { error } = await client.from('photo_likes').upsert({ photo_id: id, user_id: user.id }, { onConflict: 'photo_id,user_id', ignoreDuplicates: true }); if (error) throw error }
  async unlike(id: string) { const { client, user } = await this.identity(); const { error } = await client.from('photo_likes').delete().eq('photo_id', id).eq('user_id', user.id); if (error) throw error }
  async report(input: PhotoReportInput) { if (!input.reason.trim() || input.reason.length > 500) throw new Error('Enter a reason of 1–500 characters.'); const { client, user } = await this.identity(); const { error } = await client.from('photo_reports').insert({ photo_id: input.photoId, reporter_id: user.id, reason: input.reason.trim() }); if (error && error.code !== '23505') throw error }
}
