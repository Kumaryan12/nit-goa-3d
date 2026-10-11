// Static hosting can share the same verified Node backend as the original site.
// Resolve API paths only against a configured origin, never an arbitrary URL
// supplied by a profile or a query string.
export function backendOrigin(pageURL: string, configured?: string): string {
  const page = new URL(pageURL), url = configured ? new URL(configured) : page
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      configured && (url.pathname !== '/' || url.search || url.hash) ||
      page.protocol === 'https:' && url.protocol !== 'https:')
    throw new Error('Invalid campus server origin')
  return url.origin
}
export function campusServerURL(path: string, pageURL: string, configured?: string): URL {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))
    throw new Error('Invalid campus server path')
  return new URL(path, backendOrigin(pageURL, configured))
}
export function liveServerURL(path: string, pageURL: string, configured?: string, override?: string): URL {
  const url = override ? new URL(override, pageURL) : campusServerURL(path, pageURL, configured)
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol === 'http:') url.protocol = 'ws:'
  if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password ||
      new URL(pageURL).protocol === 'https:' && url.protocol !== 'wss:')
    throw new Error('Invalid live campus server URL')
  return url
}
