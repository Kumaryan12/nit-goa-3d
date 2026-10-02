import { validClosedRing } from './geo.ts'
import type { CampusMapData, CampusRoadData } from '../types/osm.ts'
export const MAP_CACHE_VERSION = 1
export const MAP_FRESHNESS_MS = 24 * 60 * 60 * 1000
export type MapPayload = CampusMapData | CampusRoadData
export interface CachedMap<T> { payload: T; timestamp: number; stale: boolean }
export interface CacheStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const key = (kind: 'buildings' | 'roads') => `nit-goa:osm:${kind}`
export function validMapPayload(kind: 'buildings' | 'roads', data: unknown): data is MapPayload {
  if (!data || typeof data !== 'object') return false
  const record = data as MapPayload
  const tagsValid = (tags: unknown) => !!tags && typeof tags === 'object' && !Array.isArray(tags) && Object.values(tags).every((v) => typeof v === 'string')
  const geoRing = (ring: unknown) => Array.isArray(ring) && ring.length <= 5000 && !!validClosedRing(ring)
  if (kind === 'buildings' && 'buildings' in record) return ['campus-area','nearby-fallback'].includes(record.source) && Number.isInteger(record.returnedBuildingCount) && record.returnedBuildingCount >= 0 && (record.boundary === null || geoRing(record.boundary)) && Array.isArray(record.buildings) && record.buildings.length > 0 && record.buildings.length <= 10000 && record.buildings.every((b) => typeof b.id === 'string' && ['way','relation'].includes(b.osmType) && Number.isSafeInteger(b.osmId) && tagsValid(b.tags) && Number.isFinite(b.height) && b.height > 0 && geoRing(b.outer) && Array.isArray(b.holes) && b.holes.every(geoRing))
  if (kind === 'roads' && 'roads' in record) return ['campus-area','campus-polygon'].includes(record.source) && Number.isInteger(record.returnedRoadCount) && record.returnedRoadCount >= 0 && geoRing(record.boundary) && Array.isArray(record.roads) && record.roads.length <= 10000 && record.roads.every((r) => typeof r.id === 'string' && Number.isSafeInteger(r.osmId) && tagsValid(r.tags) && ['road','footpath'].includes(r.kind) && Number.isFinite(r.width) && r.width > 0 && Array.isArray(r.paths) && r.paths.every((path) => Array.isArray(path) && path.length >= 2 && path.length <= 10000 && path.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < 100000 && Math.abs(p.z) < 100000)))
  return false
}
export function readMapCache<T extends MapPayload>(storage: CacheStorage, kind: 'buildings' | 'roads', now = Date.now()): CachedMap<T> | null {
  try { const text = storage.getItem(key(kind)); if (!text || text.length > 8_000_000) return null; const data = JSON.parse(text); if (data.version !== MAP_CACHE_VERSION || !Number.isFinite(data.timestamp) || data.timestamp > now + 300000 || data.timestamp <= 0 || !validMapPayload(kind, data.payload)) { storage.removeItem(key(kind)); return null }; return { payload: data.payload, timestamp: data.timestamp, stale: now - data.timestamp > MAP_FRESHNESS_MS } } catch { return null }
}
export function writeMapCache(storage: CacheStorage, kind: 'buildings' | 'roads', payload: MapPayload, now = Date.now()): boolean {
  if (!validMapPayload(kind, payload)) return false
  try { storage.setItem(key(kind), JSON.stringify({ version: MAP_CACHE_VERSION, timestamp: now, payload })); return true } catch { return false }
}
export async function loadMapWithCache<T extends MapPayload>(kind: 'buildings' | 'roads', live: () => Promise<T>, storage: CacheStorage, signal: AbortSignal, offline = false): Promise<{ data: T; cache: CachedMap<T> | null }> {
  signal.throwIfAborted()
  try { if (offline) throw new Error('Offline'); const data = await live(); signal.throwIfAborted(); if (!validMapPayload(kind, data)) throw new Error('Map response is malformed.'); writeMapCache(storage, kind, data); return { data, cache: null } }
  catch (error) { signal.throwIfAborted(); const cache = readMapCache<T>(storage, kind); if (cache) return { data: cache.payload, cache }; throw error }
}
export function cacheAge(timestamp: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000))
  const count = minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes / 60) : Math.floor(minutes / 1440)
  const unit = minutes < 60 ? 'minute' : minutes < 1440 ? 'hour' : 'day'
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}
