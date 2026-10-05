import { campusLocations } from '../data/campus.ts'
import type { CampusLocation } from '../types/campus.ts'

export interface CampusSearchResult { location: CampusLocation; score: number }
export const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

export function searchCampus(query: string, locations: CampusLocation[] = campusLocations, limit = 8): CampusSearchResult[] {
  const normalized = normalizeSearch(query)
  if (!normalized || limit <= 0) return []
  const tokens = normalized.split(' ')
  return locations.flatMap((location) => {
    const name = normalizeSearch(location.name)
    const keywords = location.keywords.map(normalizeSearch)
    const category = normalizeSearch(location.category)
    const facilities = location.facilities.map(normalizeSearch)
    const fields = [name, ...keywords, category, ...facilities]
    if (!tokens.every((token) => fields.some((field) => field.split(' ').some(word => word.startsWith(token))))) return []
    const score = name === normalized ? 1000 : name.startsWith(normalized) ? 850 : name.includes(normalized) ? 750
      : keywords.includes(normalized) ? 650 : keywords.some((keyword) => keyword.startsWith(normalized)) ? 550
      : category === normalized ? 500 : 300
    return [{ location, score }]
  }).sort((a, b) => b.score - a.score || a.location.name.localeCompare(b.location.name) || a.location.id.localeCompare(b.location.id))
    .slice(0, Math.floor(limit))
}
