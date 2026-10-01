# FTTechApp mobile

Expo (React Native) app that runs the FTTechApp web app (`../index.html`) on
iOS and Android. The HTML is compiled into the app, so it opens with no
connection; cloud sync still needs one.

## Updating the web app

Replace `../index.html` with the new version and rebuild. The copy inside the
app (`src/webAppHtml.generated.ts`) is regenerated automatically on
`npm install` and whenever Metro starts.

## Running

```bash
npm install
npm start        # scan the QR code with Expo Go
npm run android
npm run ios      # needs macOS
```

## How it fits together

- `App.tsx` shows the embedded page in a WebView, addressed as
  `https://fttechapp.shipstatic.com` so storage, Supabase sync and
  `/dealer-portal` behave as on the website. Reloads and in-app page changes
  re-render the embedded copy instead of going to the network.
- `src/nativeBridge.ts` is injected into the page. It sends downloads (CSV,
  Excel, PDF, backups), Web Share calls, pop-ups and external links to the
  native side, which opens the phone's share sheet or browser.
