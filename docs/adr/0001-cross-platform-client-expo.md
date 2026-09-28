# 0001: Expo / React Native for the client

Date: 2026-09-27 · Status: Accepted (amended, see README)

## Context
The app must run on iOS and Android. One developer maintains it, so it should be one codebase, open source, and cheap to build. It depends heavily on the microphone, camera and video, and the tutor would benefit from a desktop/web view.

## Options
- **Expo (React Native, TypeScript)**: one codebase for iOS, Android and web. Has mature `expo-audio`, `expo-camera`, `expo-video`, `expo-sqlite`, `expo-secure-store` and `expo-speech` modules. Cloud builds (EAS) mean an iOS build does not require owning a Mac. Uses TypeScript, the same language as the backend functions.
- **Flutter**: excellent UI and performance, but Dart cannot share code with the TypeScript edge functions, and its web output is weaker for a dashboard.
- **Native Swift + Kotlin**: best platform fit, but it doubles the work. Not viable for one person.
- **PWA only**: cheapest, but on iOS it has weaker background upload, offline storage and media APIs.

## Decision
Use Expo with expo-router and TypeScript in strict mode. Build one app with role-based navigation, not two separate apps. Enable the web build for the tutor.

## Consequences
The lesson schema and scoring logic are shared with the server. Some native modules (for example `whisper.rn`) need a "development build" instead of Expo Go. That is accepted.
