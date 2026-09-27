# Costs

These are rough figures at the time of writing. Check vendor pricing before relying on them.

| Item | Cost | Notes |
|---|---|---|
| Expo / React Native, all libraries | $0 | Open source |
| Supabase free tier | $0 | Includes the database, 1 GB file storage and edge functions. Projects pause when idle; the nightly backup job keeps it active. Pro (~$25/mo) only if it outgrows the free tier |
| Backups on Cloudflare R2 / Backblaze B2 | ~$0 | R2 has a free allowance and no download fees; a few GB is pennies |
| GitHub (repo, Actions for CI + backups) | $0 | A private repo includes free Actions minutes |
| Text-to-speech | $0 | The phone's built-in Spanish voices |
| Speech-to-text | $0 on the device / low cost per minute on the server | `whisper.rn` runs locally; the server fallback costs a fraction of a cent per minute |
| LLM (lesson generation + feedback) | ~$1–5 / month | A few lessons a week plus feedback per attempt. Capped by a rate limit and a spend limit in the provider's console |
| **Apple Developer Program** | **$99 / year** | Needed to install on iPhone via TestFlight. This is the only real fixed cost |
| Google Play | $0 to start | Android can install the APK directly (EAS internal distribution). $25 one-time only if you want Play Store / internal testing tracks |
| EAS Build (cloud builds) | $0 | The free tier gives a small number of builds per month; local builds are unlimited (iOS local builds need a Mac) |

## Ways to avoid the $99/yr Apple fee (trade-offs)

1. **Web app first.** The same Expo codebase runs in the browser. Mobile Safari supports microphone and camera. This is fine to validate the lesson loop; background uploads and offline use are weaker.
2. **Free Apple ID + Xcode sideload.** This needs a Mac, and the app expires every 7 days. Not practical long-term.
3. **The student uses Android, the tutor uses the web dashboard.** Then $0 in total.

Recommendation: build Phase 0–1 as native + web from day one (Expo does both). Decide on the Apple fee when the iPhone app is actually needed.
