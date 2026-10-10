# Image to PDF Converter — Setup Guide (Android only)

## 1. Install dependencies

```bash
npx react-native init ImagePdfConverter
cd ImagePdfConverter

npm install react-native-image-crop-picker
npm install @dr.pogodin/react-native-fs
npm install react-native-html-to-pdf
npm install react-native-permissions
```

Then copy `App.js`, `src/screens/HomeScreen.js`, and `src/utils/pdfHelper.js`
from this project into your generated project (overwrite the default `App.js`).

## 2. Android permissions

Open `android/app/src/main/AndroidManifest.xml` and add, just above `<application>`:

```xml
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

`READ_EXTERNAL_STORAGE` is requested for older Android versions (pre-Android 13). The app requests this at runtime in `HomeScreen.js`. On Android 13+, no explicit storage permissions are required since it uses the system Photo Picker.

## 3. react-native-image-crop-picker native setup

This library needs a small manifest addition. In the same
`AndroidManifest.xml`, ensure `android:requestLegacyExternalStorage="true"`
is NOT required (it isn't for this library on modern RN versions), but do add
this line inside `<application>` if you hit a "provider" conflict on build:

```xml
<provider
  android:name="com.reactnativecommunity.imagepicker.ImagePickerFileProvider"
  ... />
```

(Only add this if the build error explicitly asks for it — most current
versions of the library auto-merge this via their own manifest.)

## 4. Rebuild native code after installing

Every time you install a library with native code (all three above have
native Android code), run:

```bash
cd android && ./gradlew clean && cd ..
npx react-native run-android
```

## 5. How the flow works

1. **Pick** — `HomeScreen.js` calls `ImagePicker.openPicker({ multiple: true })`
   from `react-native-image-crop-picker`. Returns an array of local image paths.
2. **Preview** — Selected images show as a horizontal thumbnail strip. Tap the
   red × to remove one before converting.
3. **Convert** — `pdfHelper.js` reads each image as base64 (`@dr.pogodin/react-native-fs`),
   builds one HTML page per image, and calls `react-native-html-to-pdf` to
   render it into a real PDF file saved under the app's Documents directory.
4. **Share** — Uses React Native's **built-in** `Share` API (no extra library
   needed) to open the Android share sheet — WhatsApp, Gmail, Drive, etc.

## 6. Next features to add (v2, after publishing v1)

- Reorder images via drag-and-drop before converting (e.g. `react-native-draggable-flatlist`)
- Compress PDF quality option (adjust `compressImageQuality` in the picker)
- AdMob banner + interstitial ad after successful conversion
- PDF-to-Image (separate feature, needs native `PdfRenderer` — build after v1 has users)

## 7. Testing checklist before Play Store upload

- [ ] Test with 1 image, 5 images, and 20+ images (large PDF performance)
- [ ] Test on a real device with Android 13+ (permission flow differs from older)
- [ ] Test share sheet opens correctly and PDF opens in a PDF viewer
- [ ] Test app doesn't crash if user cancels image picker
- [ ] Generate release APK/AAB with signed keystore before uploading