import axios from 'axios'

const url = `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_NAME}/auto/upload`

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

// Uploads a file to Cloudinary. Reports progress (0-100) and supports cancelling with an AbortSignal.
// Returns Cloudinary's response; `url` is always the https URL.
const uploadFile = async (file, { onProgress, signal } = {}) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', 'chatify_File')

  const response = await axios.post(url, formData, {
    signal,
    onUploadProgress : (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    }
  })
  const data = response.data
  return { ...data, url : data.secure_url || data.url }
}

export default uploadFile
