// Chatify Android app (Capacitor) helpers.
// The Android app is a thin shell that opens this website, so new web features reach the app on the next
// Render deploy. Only changes to the shell itself (icon, permissions, ...) need a new APK: those are
// published on GitHub Releases, and the app shows "Update available" when a newer one exists.

const REPO = 'punitsharma10/Chatify'
export const ANDROID_APK_URL = `https://github.com/${REPO}/releases/latest/download/Chatify-android.apk`
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const CACHE_KEY = 'chatify-app-update-check'

// true inside the installed Android app
export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.()

export const isAndroidBrowser = () => !isNativeApp() && /Android/i.test(navigator.userAgent)

// "1.2.3" -> [1, 2, 3]
const parse = (v) => String(v || '').replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10) || 0)
export const isNewer = (latest, current) => {
  const a = parse(latest)
  const b = parse(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

export const appVersion = async () => {
  try {
    const info = await window.Capacitor?.Plugins?.App?.getInfo?.()
    return info?.version || null
  } catch {
    return null
  }
}

// { current, latest } when a newer app is on GitHub Releases, else null. Asks GitHub at most every 6 hours.
export const checkForAppUpdate = async ({ force = false } = {}) => {
  if (!isNativeApp()) return null
  const current = await appVersion()
  if (!current) return null

  let latest = null
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
    if (!force && cached && Date.now() - cached.at < CHECK_EVERY_MS) latest = cached.latest
  } catch { /* storage unavailable */ }

  if (!latest) {
    try {
      const res = await fetch(LATEST_RELEASE_API, { headers : { Accept : 'application/vnd.github+json' } })
      if (!res.ok) return null
      const release = await res.json()
      latest = release.tag_name // e.g. "android-v1.0.1"
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at : Date.now(), latest })) } catch { /* ignore */ }
    } catch {
      return null
    }
  }
  return latest && isNewer(latest, current) ? { current, latest : parse(latest).join('.') } : null
}

// leave the app and open a link in the phone's browser (downloads, the new APK, ...)
export const openExternally = (url) => {
  window.location.href = url
}
