# 0008: An MCP server as the single, provider-independent interface between the app's data and any AI

Date: 2026-09-27 · Status: Proposed · Amends: 0004 (the `AiProvider` interface becomes an MCP server + a thin model adapter)

## Context
- Lesson and plan generation needs rich context (goal, learner snapshot, curriculum graph, plan, rules; see [CONTENT_FRAMEWORK.md](../CONTENT_FRAMEWORK.md)).
- The AI provider must be **interchangeable**. No part of the system may depend on one vendor's API shape.
- It is useful if the tutor can also work **conversationally** with an AI of their choice (e.g. "make next week's lessons more about travel"), using the same safe operations as the automated pipeline.

The **Model Context Protocol (MCP)** is an open standard for exposing data (*resources*), operations (*tools*) and reusable instructions (*prompts*) to any AI application. Many AI clients and model providers support it.

## Decision

### 1. One MCP server ("curriculum server") is the contract

It is hosted as a Supabase Edge Function (Streamable HTTP), and can run locally over stdio for development. It exposes **task-shaped** operations, never raw SQL:

| Kind | Name | Purpose |
|---|---|---|
| Resource | `framework://current` | Pedagogy rules, quality checks and parameters (versioned) |
| Resource | `schema://lesson-content` | JSON Schema for lessons, with field descriptions |
| Resource | `learner://{id}/snapshot` | Compact learner model: mastery, velocity, errors, interests |
| Resource | `goal://{id}/active` | Active goal + feasibility |
| Resource | `plan://{id}/current` | Current plan version + progress against it |
| Resource | `curriculum://objectives{?level,type}` | Curriculum graph slices |
| Tool | `search_objectives`, `get_objective` | Browse the graph |
| Tool | `get_learner_evidence(objective_id)` | Detail behind a mastery value |
| Tool | `check_lesson(draft)` | Runs the **deterministic** quality checks Q1–Q7, Q9, Q10 and returns failures |
| Tool | `save_lesson_draft(draft, rationale)` | Stores a draft (status `draft` only) + provenance |
| Tool | `propose_plan_revision(changes, rationale)` | Stores a *proposed* plan version for tutor approval |
| Tool | `lookup_lexicon(lemmas)` | Glosses, frequency, variety info |
| Prompt | `generate_immersive_lesson`, `compose_quick_pack`, `weekly_plan_review`, `assess_attempt` | Provider-neutral prompt templates, versioned in git |

### 2. Callers

- **Automated pipeline** (edge function orchestrator): an MCP *client* + a model adapter. It runs a prompt, lets the model call tools, and records a `generation_run`.
- **Tutor's own AI client** (any MCP-capable desktop/chat app): connects to the same server with the tutor's credentials.
- **Tests / eval harness**: calls the same tools with fixed inputs.

### 3. The model adapter is thin and uses only features every provider shares

`LlmClient.run({ system, messages, tools, responseSchema })` → text / tool calls / JSON.
- Start with two adapters (for example one native vendor SDK + one **OpenAI-compatible** endpoint, which covers many hosted and local/open-weight models) to *prove* the swap works from day one.
- Use only what all providers offer: chat messages, tool calls with JSON Schema, JSON output. Provider-specific extras (prompt caching etc.) are optional optimisations behind flags, never needed for correctness.
- Provider, model and per-task routing are configuration (`ai.config`): e.g. a stronger model for lesson generation, a cheaper one for feedback, and a *different* one for the Q8 second-opinion review.

### 4. Safety rules (enforced in the server, not the prompt)

- The MCP server acts **as the calling user** (their JWT, under RLS), not as the service role. The pipeline uses a dedicated "ai-pipeline" user limited to drafts and proposals.
- Write tools can only create **drafts / proposals**. There is no tool that publishes, deletes, or modifies attempts or evidence. Publishing is a tutor action in the app.
- Learner content (transcripts, free text) is passed as **data**, clearly delimited. Any "instructions" inside it are not acted on, and tool permissions make that harmless anyway.
- Rate limits and cost limits per caller; every tool call is written to `audit_log` with the calling client and model.
- Remote access uses Supabase Auth tokens (OAuth-style for third-party MCP clients); no long-lived shared keys.

## Consequences
- Swapping or mixing AI providers is a config change plus an eval run ([CONTENT_FRAMEWORK §7](../CONTENT_FRAMEWORK.md)), with no code changes.
- Quality checks sit in code behind `check_lesson`, so every model is held to the same standard.
- The MCP tool list shapes the data model, so the final schema is decided **after** the framework's open questions are answered.
- MCP is still evolving. Our dependency is limited to the server boundary. If the protocol changed dramatically, the same operations could be exposed as a plain HTTP API.
