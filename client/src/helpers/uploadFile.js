import axios from 'axios'
import { encryptFile, registerUpload } from './e2ee'

const url = `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_NAME}/auto/upload`

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

// Uploads a file to Cloudinary. Reports progress (0-100) and supports cancelling with an AbortSignal.
// With `encrypt`, the file is end-to-end encrypted on this device first: Cloudinary only ever stores
// random-looking bytes, and the key travels inside the encrypted message.
// Returns Cloudinary's response; `url` is always the https URL.
const uploadFile = async (file, { onProgress, signal, encrypt = false } = {}) => {
  let body = file
  let meta = null
  if (encrypt) {
    const enc = await encryptFile(file)
    body = enc.blob
    meta = enc.meta
  }
  const formData = new FormData()
  formData.append('file', body)
  formData.append('upload_preset', 'chatify_File')

  const response = await axios.post(url, formData, {
    signal,
    onUploadProgress : (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    }
  })
  const data = response.data
  const out = { ...data, url : data.secure_url || data.url }
  if (meta) registerUpload(out.url, meta, file)
  return out
}

export default uploadFile
