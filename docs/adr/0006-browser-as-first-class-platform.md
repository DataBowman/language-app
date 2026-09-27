# 0006: The browser is a first-class platform

Date: 2026-09-27 · Status: Accepted · Amends: 0001 (web was tutor-only), 0003 (local storage), 0004 (speech-to-text)

## Context
Both the student and the tutor must be able to use the app in a web browser (desktop and mobile), not only in the native iOS/Android apps. Expo already builds for the web. The question is which assumptions in the earlier ADRs are native-only.

## What changes in the browser

| Area | Native | Browser | Design response |
|---|---|---|---|
| Local database | `expo-sqlite` (files on disk) | `expo-sqlite` web (WASM + OPFS) or IndexedDB | Hide it behind the `LocalDb` adapter; the repositories stay unchanged |
| Durability of local data | Stays until the app is uninstalled | **The browser may evict it** (Safari clears site data after about 7 days without a visit unless the site is installed as a PWA) | On the web the local copy is **only a cache and a short-lived outbox**. Call `navigator.storage.persist()`. Upload immediately. Show an "unsynced recordings" warning and a `beforeunload` guard |
| Background upload | OS background tasks | Only while the tab is open | Upload after each exercise, not at the end of the lesson |
| Recording format | Chosen by us (AAC/m4a) | `MediaRecorder`: Chrome/Firefox usually give WebM/Opus, Safari gives MP4/AAC | Check what the browser supports and prefer `audio/mp4` when it is available. Store the real MIME type. The server and players must accept both |
| Speech-to-text | `whisper.rn` on the device | No native module | The web always uses the **server** `transcribe` function (the browser's own speech API is inconsistent and unavailable in Firefox) |
| Text-to-speech | OS voices | `speechSynthesis`: Spanish voices vary by browser | Check a Spanish voice exists. If not, fall back to pre-generated audio from the server, cached on the lesson |
| Session token storage | Keychain/Keystore (`expo-secure-store`) | `localStorage` (readable by any script that runs through XSS) | Strict Content-Security-Policy, **no third-party scripts**, short token lifetime, PKCE login flow |
| Distribution | App stores / TestFlight | Static hosting (Cloudflare Pages / GitHub Pages, free, HTTPS) | Microphone and camera require HTTPS. Add a PWA manifest so it can be installed to the home screen |
| Input devices | Touch only | Keyboard + mouse available | Allow typed answers on the web; a responsive layout for wide screens |

## Decision
1. Treat the web as a first-class target in CI (web build + Playwright end-to-end tests) from Phase 0.
2. Add a **platform adapter layer** (`src/platform/`) with one interface and a `.native.ts` / `.web.ts` implementation for each: `LocalDb`, `Recorder`, `SpeechToText`, `TextToSpeech`, `SecureSession`, `BackgroundSync`. No code outside `src/platform` may import a platform-specific module.
3. On the web the durability rule is: **nothing counts as saved until the server confirms it**, and the UI shows sync status.
4. Server-side speech-to-text is always available (it is the web path, and the fallback on native).
5. Edge functions allow requests only from our own web origin (CORS), and Supabase Auth redirect URLs list only our domains.

## Consequences
- The web gives a $0 way to use the app on iPhone (see COSTS.md). Playwright tests in a real browser also make the whole app easier to test.
- Server speech-to-text use and cost rise a little, because web users always use it.
- Features that need true background work (push notifications, long offline sessions) are native-first and degrade gracefully on the web.
