import { isNativeApp, openExternally } from './nativeApp'
// Cloudinary URL helpers: request smaller, optimised versions instead of downloading originals.
const isCloudinary = (url) => typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/upload/')

export const cloudinaryTransform = (url, transform) =>
  isCloudinary(url) ? url.replace('/upload/', `/upload/${transform}/`) : url

export const thumbUrl = (url, width = 480) => cloudinaryTransform(url, `w_${width},c_limit,q_auto,f_auto`)

// first frame of a video as a jpg poster
export const videoPoster = (url) =>
  isCloudinary(url) ? cloudinaryTransform(url, 'so_0,w_480,c_limit,q_auto').replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg') : undefined

export const formatBytes = (bytes = 0) => {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export const fileExtension = (name = '') => {
  const m = /\.([a-z0-9]{1,6})$/i.exec(name)
  return m ? m[1].toUpperCase() : 'FILE'
}

export const fileNameFromUrl = (url = '') => {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) } catch { return 'download' }
}

// download a (cross-origin) file with its name; falls back to opening it
export const downloadMedia = async (url, name) => {
  // the Android app's web view can't save files: hand the download to the phone's browser
  if (isNativeApp()) return openExternally(cloudinaryTransform(url, 'fl_attachment'))
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('failed')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name || fileNameFromUrl(url)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
  } catch {
    window.open(cloudinaryTransform(url, 'fl_attachment'), '_blank', 'noopener')
  }
}

export const kindOfFile = (file) => {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  return 'file'
}
