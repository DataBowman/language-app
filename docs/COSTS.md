# Costs

These are rough figures at the time of writing. Check vendor pricing before relying on them.

| Item | Cost | Notes |
|---|---|---|
| Expo / React Native, all libraries | $0 | Open source |
| Supabase free tier | $0 | Includes the database, 1 GB file storage and edge functions. Projects pause when idle; the nightly backup job keeps it active. Pro (~$25/mo) only if it outgrows the free tier |
| Backups on Cloudflare R2 / Backblaze B2 | ~$0 | R2 has a free allowance and no download fees; a few GB is pennies |
| GitHub (repo, Actions for CI + backups) | $0 | A private repo includes free Actions minutes |
| Web hosting (Cloudflare Pages or GitHub Pages) | $0 | Static site with HTTPS (required for the microphone and camera). A custom domain is optional (~$10/yr) |
| Text-to-speech | $0 (mostly) | Built-in OS/browser voices. Only browsers with no Spanish voice need server-generated audio, which is a small per-lesson cost and is cached |
| Speech-to-text | $0 on native / low cost per minute on the server | `whisper.rn` runs locally on native. **The web always uses the server** (a fraction of a cent per minute) |
| LLM (lesson generation + feedback) | ~$1–5 / month | A few lessons a week plus feedback on immersive answers. **Quick mode uses no AI.** The optional conversation exercise is the most expensive feature; it has its own rate limit. Everything is capped by a spend limit in the provider's console |
| **Apple Developer Program** | **$99 / year** | Needed only for the native iPhone app (TestFlight). **Optional now** that iPhone users can use the web app |
| Google Play | $0 to start | Android can install the APK directly (EAS internal distribution). $25 one-time only if you want Play Store / internal testing tracks |
| EAS Build (cloud builds) | $0 | The free tier gives a small number of builds per month; local builds are unlimited (iOS local builds need a Mac) |

## Ways to avoid the $99/yr Apple fee (trade-offs)

1. **Use the web app on iPhone (now a first-class target, ADR 0006).** Add it to the home screen as a PWA. Mobile Safari supports the microphone and camera. Trade-offs: no background uploads; Safari can clear local data after a few days without a visit (which is why uploads happen per exercise); offline quick mode is less reliable than native.
2. **Free Apple ID + Xcode sideload.** This needs a Mac, and the app expires every 7 days. Not practical long-term.
3. **The student uses Android, the tutor uses the web dashboard.** Then $0 in total.

Recommendation: build native + web from day one (Expo does both). Start iPhone users on the web app. Pay the Apple fee only if native-only benefits (offline quick mode, on-device speech-to-text, push notifications) become worth it.
