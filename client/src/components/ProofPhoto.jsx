import { Camera } from 'lucide-react'
import { useProofImageQuery } from '../app/api'
import { Skeleton } from './ui'

/** The delivery partner's photo proof for an order. `path` is the image's API path for the viewer's role. */
export default function ProofPhoto({ path, at }) {
  const { data: src, isLoading, error } = useProofImageQuery(path)
  return (
    <figure>
      <figcaption className="label flex items-center gap-1.5">
        <Camera className="size-4" aria-hidden="true" /> Delivery photo
      </figcaption>
      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : error || !src ? (
        <p className="text-sm text-muted">The photo could not be loaded.</p>
      ) : (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={`Photo taken by the delivery partner${at ? ` at ${new Date(at).toLocaleString('en-IN')}` : ''}`} className="no-dim max-h-72 w-full rounded-xl object-contain bg-surface-2" />
        </a>
      )}
    </figure>
  )
}

/**
 * Shrink a camera photo on the phone before upload: at most 1280px on the long side, JPEG, stepping the quality down
 * until it is under ~350 kB. Returns a data URL.
 */
export async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  for (const quality of [0.75, 0.6, 0.45, 0.3]) {
    const url = canvas.toDataURL('image/jpeg', quality)
    if (url.length * 0.75 < 350 * 1024) return url
  }
  throw new Error('The photo is too large. Please retake it.')
}
