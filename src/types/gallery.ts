export interface GalleryPhoto {
  id: string
  locationId: string
  image: string
  caption: string
  author: string
  placeholder: boolean
}

// A later API adapter can implement this contract without changing photo cards.
export interface GalleryRepository {
  getByLocation(locationId: string): Promise<GalleryPhoto[]>
}
