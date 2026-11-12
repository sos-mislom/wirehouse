# Native application artwork

The launcher uses the Cyrillic monogram **СК**, outlined from Onest at weight650:
white on `#15171c`. This artwork belongs to the operating-system launcher and
startup screen; it does not add an icon beside the application name in the UI.

- `app-icon.svg` is the outlined vector master. It needs no installed font.
- `android/res` contains legacy icons at all five Android densities, adaptive
  launcher vectors and a white splash screen with the graphite monogram.
- Android12+ uses a separate launch theme. The app keeps light system bars and
  returns to its normal light theme after startup.
- `ios/AppIcon.appiconset` contains an opaque1024px source icon for the modern
  Xcode asset catalog. Its presence does not establish an IPA/device test.
- `manifest.json` records the font source and every artwork file's SHA256.

`prepare.mjs` copies these committed resources after Capacitor sync, replacing
the template launcher and splash artwork. Normal builds need no image tools.
To regenerate the artwork, use `python apps/mobile/assets/generate-icons.py`
with FontTools, Brotli and Pillow available and the repository's installed
`@fontsource-variable/onest`5.3.1 package. Regeneration does not download fonts.

Onest copyright2021 The Onest Project Authors. Font license:
[SIL Open Font License1.1](ONEST-LICENSE.txt). Font outlines are embedded into
the vector artwork; the modified intermediate font is not distributed.
