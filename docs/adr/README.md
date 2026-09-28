# Architecture Decision Records

Short, dated records of the important decisions. Do not rewrite an accepted ADR. To change a decision, add a new ADR that supersedes the old one.

| # | Decision | Status |
|---|---|---|
| [0001](0001-cross-platform-client-expo.md) | Expo / React Native for the client | Accepted (web scope widened by 0006) |
| [0002](0002-backend-supabase.md) | Supabase as the backend | Accepted |
| [0003](0003-offline-first-single-writer-sync.md) | Offline-first, single-writer sync | Accepted (amended by 0006, 0007) |
| [0004](0004-ai-server-side-with-human-approval.md) | AI runs on the server; the tutor approves generated lessons | Accepted (amended by 0006, 0007, 0008) |
| [0005](0005-append-only-data-and-backups.md) | Append-only facts and independent backups | Accepted |
| [0006](0006-browser-as-first-class-platform.md) | The browser is a first-class platform | Accepted |
| [0007](0007-two-learning-modes.md) | Two learning modes (immersive and quick) in one app | Accepted |
| [0008](0008-mcp-provider-agnostic-ai.md) | MCP server as the provider-independent interface between data and any AI | Proposed (scoping amended by 0010) |
| [0009](0009-learning-event-ledger.md) | Learning event ledger: record raw facts now, derive features later | Accepted (read access amended by 0010) |
| [0010](0010-learning-data-visibility.md) | Curated progress for the student; full analytics for the tutor and the tutor's AI | Accepted (engineer access added by 0013) |
| [0011](0011-tutored-sessions.md) | Tutored sessions: suggested plan, confirm-don't-type logging | Accepted |
| [0012](0012-scenario-challenges.md) | Scenario challenges: real-world goals the curriculum works towards | Accepted |
| [0013](0013-engineer-raw-data-access.md) | Read-only raw-data access for the engineer | Accepted |
| [0014](0014-learner-context-is-data.md) | Learner context is data, never an assumption; plan changes apply automatically | Accepted |
