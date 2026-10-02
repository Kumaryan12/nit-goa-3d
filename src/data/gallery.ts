import type { GalleryPhoto } from '../types/gallery.ts'

// These are labelled demo entries, not photographs of the real campus.
const demoImage = `${import.meta.env?.BASE_URL ?? '/'}gallery/campus-placeholder.svg`
const demoEntries = [
  { id: 'academic-evening-demo', locationId: 'academic-block', image: demoImage, caption: 'Campus evening view', author: 'Student · sample', placeholder: true },
  { id: 'academic-courtyard-demo', locationId: 'academic-block', image: demoImage, caption: 'Academic courtyard', author: 'Student · sample', placeholder: true },
  { id: 'admin-demo', locationId: 'administration-block', image: demoImage, caption: 'Around the administration block', author: 'Student · sample', placeholder: true },
  { id: 'boys-hostel-demo', locationId: 'boys-hostel', image: demoImage, caption: 'Hostel life', author: 'Student · sample', placeholder: true },
  { id: 'girls-hostel-demo', locationId: 'girls-hostel', image: demoImage, caption: 'Hostel courtyard', author: 'Student · sample', placeholder: true },
  { id: 'canteen-demo', locationId: 'canteen', image: demoImage, caption: 'A break between classes', author: 'Student · sample', placeholder: true },
  { id: 'sports-demo', locationId: 'sports-ground', image: demoImage, caption: 'An afternoon on the field', author: 'Student · sample', placeholder: true },
  { id: 'entrance-demo', locationId: 'main-entrance', image: demoImage, caption: 'Welcome to campus', author: 'Student · sample', placeholder: true },
]

export const galleryPhotos: GalleryPhoto[] = demoEntries.map((entry, i) => ({
  ...entry, storagePath: '', thumbnailUrl: entry.image, imageUrl: entry.image,
  authorId: 'demo', authorDisplayName: entry.author, createdAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(), width: 640, height: 400, status: 'approved', likeCount: 0, liked: false,
}))
