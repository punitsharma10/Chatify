# Chatify for Android

A small Android app (built with [Capacitor](https://capacitorjs.com)) that opens
**https://chatifybypunit.onrender.com** full screen.

| You change… | What users get | How |
|---|---|---|
| Anything in `client/` or `server/` (features, UI, fixes) | The new version the next time they open the app | Push to `main` → Render deploys. **No new APK needed.** |
| The app shell in `mobile/` (icon, splash, permissions, app name) | "Update available" banner in the app | Release a new APK (below) |

## Install on a phone
Open this link on an Android phone, then tap the downloaded file → **Install**:

https://github.com/punitsharma10/Chatify/releases/latest/download/Chatify-android.apk

- Android may ask to **allow installing from your browser** → Settings → *Allow from this source* → back → Install.
- If **Play Protect** says it doesn't recognise the app: **More details → Install anyway** (it isn't from the Play Store).

iPhone: Apple doesn't allow installing apps outside the App Store/TestFlight (that needs a paid Apple Developer
account). Use Safari → Share → **Add to Home Screen** instead; it opens Chatify full screen like an app.

## Release a new APK (GitHub does the build)
1. One time: add these **repository secrets** (GitHub → Settings → Secrets and variables → Actions → New secret).
   The values are in `C:\Users\paras\ChatifyAndroidKey\KEY-INFO-README.txt`:
   - `ANDROID_KEYSTORE_BASE64` – the whole content of `chatify-release.base64.txt`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS` – `chatify`
   - `ANDROID_KEY_PASSWORD`
2. Make a version tag higher than the last one and push it:
   ```bash
   git tag android-v1.0.1
   git push origin android-v1.0.1
   ```
   or GitHub → **Actions → Android app release → Run workflow** and type the version.
3. In a few minutes the APK appears under **Releases**, and installed apps show **Update available**.

**Keep the signing key safe.** Every update must be signed with the same key
(`C:\Users\paras\ChatifyAndroidKey`). If it's lost, phones can't update the app; people would have to uninstall
and reinstall. Back up that folder and never commit it.

## Build an APK on your PC (optional)
Tools used: Java 21 and the Android SDK in `C:\Users\paras\AndroidBuildTools` (no Android Studio needed).

```powershell
cd mobile
npm install
npx cap sync android
$env:JAVA_HOME = "C:\Users\paras\AndroidBuildTools\jdk-21.0.13+9"
$env:ANDROID_HOME = "C:\Users\paras\AndroidBuildTools\sdk"
$env:CHATIFY_KEYSTORE_FILE = "C:\Users\paras\ChatifyAndroidKey\chatify-release.jks"
$env:CHATIFY_KEYSTORE_PASSWORD = "<password from KEY-INFO-README.txt>"
$env:CHATIFY_KEY_ALIAS = "chatify"
$env:CHATIFY_KEY_PASSWORD = "<same password>"
cd android
.\gradlew.bat assembleRelease '-PappVersionName=1.0.0' '-PappVersionCode=10000'
# -> android\app\build\outputs\apk\release\app-release.apk
```

## What's inside
- `capacitor.config.json` – app id `com.punitsharma.chatify`, the website it opens, offline page
- `www/offline.html` – shown when the phone has no internet
- `android/` – the Android project (icons, splash, camera + microphone permissions for calls and voice messages)
- `assets/icon.svg`, `assets/icon-1024.png` – the app icon source
