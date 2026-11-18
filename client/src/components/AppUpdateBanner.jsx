import React, { useEffect, useState } from 'react'
import { IoClose, IoArrowDownCircle } from 'react-icons/io5'
import { checkForAppUpdate, openExternally, ANDROID_APK_URL, isNativeApp, isAndroidBrowser, appVersion } from '../helpers/nativeApp'
import { notify } from '../helpers/toast'

// Inside the Android app: WhatsApp-style "Update available" bar when a newer APK is on GitHub Releases.
const AppUpdateBanner = () => {
  const [update, setUpdate] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    const check = () => checkForAppUpdate().then((u) => { if (alive) setUpdate(u) })
    check()
    // also check when the app comes back to the foreground
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (!update || dismissed) return null

  return (
    <div className='fixed inset-x-0 top-0 z-[80] flex items-center gap-3 bg-wa-teal px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white shadow-md' role='status'>
      <IoArrowDownCircle size={26} className='shrink-0' />
      <div className='min-w-0 flex-1'>
        <p className='text-[14.5px] font-medium'>Update available</p>
        <p className='truncate text-xs text-white/80'>Chatify {update.latest} is ready to install</p>
      </div>
      <button onClick={() => openExternally(ANDROID_APK_URL)} className='shrink-0 rounded-full bg-white px-4 py-1.5 text-sm font-medium text-wa-teal'>Update</button>
      <button onClick={() => setDismissed(true)} className='shrink-0 rounded-full p-1 text-white/80 hover:bg-white/10' title='Later'><IoClose size={18} /></button>
    </div>
  )
}

// Settings > Chatify app: version + "Check for updates" in the app, a download link on Android browsers,
// and how to add Chatify to the home screen on iPhone / computers.
export const AppSettings = () => {
  const [version, setVersion] = useState(null)
  const [checking, setChecking] = useState(false)
  const native = isNativeApp()
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent)

  useEffect(() => { if (native) appVersion().then(setVersion) }, [native])

  const check = async () => {
    setChecking(true)
    const u = await checkForAppUpdate({ force : true })
    setChecking(false)
    if (u) openExternally(ANDROID_APK_URL)
    else notify("You're on the latest version")
  }

  const row = 'flex items-center justify-between gap-4 px-6 pb-4'
  if (native) {
    return (
      <div className={row}>
        <div>
          <p className='text-[15px] text-wa-text'>Chatify for Android{version ? ` ${version}` : ''}</p>
          <p className='text-xs text-wa-muted'>New features arrive automatically. App updates show up here and at the top of the screen.</p>
        </div>
        <button onClick={check} disabled={checking} className='wa-btn shrink-0 px-4 py-2 disabled:opacity-60'>{checking ? 'Checking…' : 'Check for updates'}</button>
      </div>
    )
  }
  if (isAndroidBrowser()) {
    return (
      <div className={row}>
        <div>
          <p className='text-[15px] text-wa-text'>Get the Android app</p>
          <p className='text-xs text-wa-muted'>Install Chatify on your phone. It updates itself.</p>
        </div>
        <a href={ANDROID_APK_URL} className='wa-btn shrink-0 px-4 py-2'>Download</a>
      </div>
    )
  }
  return (
    <p className='px-6 pb-4 text-sm text-wa-muted'>
      {iphone
        ? <>On iPhone, tap <b className='font-medium text-wa-text'>Share</b> in Safari, then <b className='font-medium text-wa-text'>Add to Home Screen</b> to open Chatify like an app.</>
        : <>Install Chatify as an app from your browser's address bar, or download the Android app from your phone.</>}
    </p>
  )
}

export default AppUpdateBanner
