# 0011: Tutored sessions: a suggested plan beforehand, confirm-don't-type logging afterwards

Date: 2026-09-29 · Status: Accepted

## Context
Live sessions with the tutor are an important part of learning, and they are unstructured. They should count as evidence alongside the app. The tutor's time is the scarcest resource, so logging must take seconds, not minutes.

## Decision
**Before the session:** the tutor sees a **suggested plan** of up to 6 items, each with the reason it was chosen. It is built from evidence by `suggestTutoredSession` (deterministic, works without AI), and an AI can refine it later through MCP. Items, in priority order:
1. the next unready step of an active challenge,
2. what the tutor marked "struggling" last time,
3. objectives with low accuracy in the app,
4. recurring misconceptions (error tags),
5. things recognised in the app but never produced in speech, because live conversation is the best place for those,
6. words looked up repeatedly.

**After the session:** "Log session" opens **pre-filled** from that plan (`sessionLogDraft`):
- Every suggested item starts ticked as *covered*. The tutor unticks what did not happen, and can set a level (struggling / progressing / secure) with one tap per item.
- Length defaults to the usual session length.
- The tutor can add anything else as a **free-text or voice note**. That is the unstructured part.
- Saving records one `tutored_session_logged` event, plus `tutor_observation` events for items given a level. Their origin (`confirmed_suggestion` vs `typed`) and `secondsToLog` are recorded, so we can **measure whether suggestions actually save the tutor time**.

**Later, with AI (Phase 3+):** the free note or voice note is transcribed. An AI proposes structured observations (objectives, words, errors) from it, and the tutor accepts them with one tap. Only accepted proposals become events: the ledger holds confirmed facts only.

## Consequences
- Live sessions feed mastery, readiness and the next suggestions: a closed loop between the app and the tutor.
- Pre-ticked items trade a little accuracy for speed. `origin` and `secondsToLog` let us check whether that trade-off holds up.
- Mutable workflow state (pending AI proposals, suggestion snapshots) lives in ordinary tables, not in the ledger.
