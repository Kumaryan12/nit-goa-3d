export * from './profile.ts'
export function navigate(path: string) {
  history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}
export function campusDestination(search = window.location.search) {
  const params = new URLSearchParams(search)
  params.delete('code')
  params.delete('error')
  params.delete('error_description')
  params.delete('error_code')
  return '/campus' + (params.size ? `?${params}` : '')
}
// Google redirect return paths are local and explicitly allowed.
export function safeAuthDestination(value: string | null) {
  if (value === '/student' || value === '/admin') return value
  if (value && /^\/campus(?:\?[^#\\\r\n]*)?$/.test(value)) return value
  return null
}
