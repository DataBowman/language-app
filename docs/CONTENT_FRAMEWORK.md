# Content generation framework

> **Status: draft for discussion.** This document decides *what good lesson content needs*. The database structure ([DATA_MODEL.md](DATA_MODEL.md)), the lesson format and the translation approach are **provisional** until the open questions in §10 are answered.

## 0. Why this comes first

An AI can only generate good lessons if it can see the right information and is asked for the right things. If we design the database first, we fix what the AI can know before we have decided what it *needs* to know. So the order is:

```
this framework  →  data the AI needs (§8)  →  MCP tools (ADR 0008)  →  final schema + lesson format
```

The framework is **provider-independent**. It describes learners, goals, curricula and quality rules, not prompts for one particular model. Any capable model reached through the MCP server ([ADR 0008](adr/0008-mcp-provider-agnostic-ai.md)) should be able to follow it.

## 1. The five models the AI reasons over

Good content comes from combining five kinds of information. Each one becomes an MCP resource that any AI can read.

| # | Model | Question it answers | Examples |
|---|---|---|---|
| 1 | **Goal** | *Why* are we learning, *to what level*, *by when*? | "Hold a 20-min conversation with family in Mexico by 2027-06-01"; target CEFR B1 speaking, A2+ reading |
| 2 | **Learner** | *Where* is the student now and *how* do they learn? | Level per skill, learning speed, memory strength, common errors, interests, time available |
| 3 | **Curriculum graph** | *What* can be learned, and in what order? | Objectives (can-do statements, grammar, vocabulary sets, functions) with prerequisites |
| 4 | **Plan** | *Which* objectives, in *which order*, *this week*? | A versioned, re-plannable path through the graph towards the goal |
| 5 | **Pedagogy + quality rules** | *How* should a lesson be built, and what counts as *good*? | Lesson anatomy, new-item limits, recycling, checks that must pass |

The key design choice: **the curriculum is not a fixed list of lessons.** It is a **graph of objectives**, and a **plan** is re-calculated from goal + learner state. Lessons are generated *from the plan*. If the student learns faster or slower, or the goal or deadline changes, the plan changes, and lessons follow automatically.

## 2. Goal model

| Field | Why it matters for generation |
|---|---|
| Target outcome, written as can-do statements | Lessons must build towards real abilities, not only cover topics |
| Target level **per skill** (listening, speaking, reading, writing) | Most learners need uneven profiles (e.g. strong speaking, basic writing) |
| **Deadline** (optional) | Drives pace, and how much to cut from the plan if it is behind |
| **Domain / context** (travel, family, work, exam) | Chooses vocabulary, scenarios and register (tú vs usted) |
| **Spanish variety** (Spain / Mexico / Rioplatense / neutral Latin American) | Affects vocabulary (coche/carro), grammar (vosotros, voseo), accent of TTS voices and model answers. **Must be consistent across all content** |
| Weekly time budget, and the mix of quick vs immersive | Controls how much fits before the deadline |
| Priority order when time is short | e.g. "speaking over writing": used when the plan must be cut |

A student can have more than one goal (for example "long-term B2" + "trip in March"). Exactly one goal is **active** for planning at a time; others are paused.

### Scenario challenges ([ADR 0012](adr/0012-scenario-challenges.md))

Goals are made concrete through **challenges**: real situations such as *greet a Spanish-speaking colleague* or *travel to a Spanish-speaking country*. Each challenge is split into steps linked to objectives, with key phrases, an in-app rehearsal and success criteria. The planner gives priority to objectives of active challenges, and a challenge can carry its own target date. Readiness is derived from evidence (`challengeReadiness`). The goal is to **do it for real**, then reflect (`challenge_completed`).

### Feasibility check (done by code, before any AI is involved)

```
hours_needed   ≈ Σ remaining objectives × est. hours each      (calibrated from this learner's own history)
hours_available = weekly_budget × weeks_until_deadline
ratio = hours_available / hours_needed
  ratio ≥ 1.1  → on track
  0.8–1.1      → tight: warn, favour high-priority objectives
  < 0.8        → not feasible: propose options (more time / narrower scope / later date), tutor decides
```

Rough external anchors, used only until this learner's own pace is known: guided learning hours are often quoted as roughly 90–100 h for A1, 180–200 h cumulative for A2, 350–400 h for B1, 500–600 h for B2. The US Foreign Service Institute (FSI) puts Spanish in its easiest category for English speakers. After a few weeks, **the learner's measured pace replaces these estimates.**

## 3. Learner model

These are all **computed from evidence**: the append-only learning event ledger ([LEARNING_DATA.md](LEARNING_DATA.md)). They are never typed in by hand, except the preferences.

| Signal | Source | Used for |
|---|---|---|
| Mastery per objective (0–1, plus confidence) | Attempts, assessments, tutor ratings, weighted by recency | Picking what to teach next; deciding what is "known" |
| Known vocabulary (lemmas) + memory strength | FSRS cards | Keeping new texts at the right difficulty (§5.2) |
| **Learning velocity** | Objectives mastered per study hour, rolling 4 weeks | Pace vs deadline; plan re-calculation |
| Retention | FSRS lapse rate | Whether to slow new material and review more |
| Error patterns | AI/tutor assessments tagged with error categories (gender agreement, ser/estar, …) | Targeted practice |
| Speaking indicators | Speech-to-text transcripts: words per minute, pauses, pronunciation feedback | Speaking-specific objectives |
| Engagement | Session completion, hint use, streaks, skipped exercises, optional 1-tap difficulty/enjoyment rating | Adjusting difficulty and variety; detecting overload |
| Interests and life context | Stated by the student and tutor | Choosing topics (motivation), making examples personal |
| Constraints | Time per day, device, when they study | Choosing session length and mode |

The AI gets this as a **compact learner snapshot**: a small, summarised document (not raw rows), so any model with a normal context window can use it.

## 4. Curriculum graph

### 4.1 Objectives

An **objective** is the smallest unit we plan, teach and measure. Types:

| Type | Example id | Example |
|---|---|---|
| `can_do` (communicative) | `cd.order_food` | "Can order food and ask about ingredients in a restaurant" |
| `grammar` | `gr.preterite.regular` | Regular preterite forms and uses |
| `vocab_set` | `vo.food.basic` | ~30 food lemmas |
| `function` | `fn.polite_requests` | ¿Me podría…? / Quisiera… |
| `pronunciation` | `pr.rr_trill` | Trilled /r/ |
| `culture` | `cu.meal_times_mx` | Meal times and customs (Mexico) |

Each objective has: a stable readable id, a CEFR level, skills involved, a description written for a teacher, **prerequisites**, estimated hours, **mastery criteria** (e.g. "≥ 80% on 3 separate days, including 1 spoken production"), and a variety tag if it applies to one variety only.

`can_do` objectives link to the grammar, vocabulary and functions they need. That link is how the plan knows that "order food" needs `vo.food.basic` + `fn.polite_requests` first.

### 4.2 Sources (open, citable)

- **CEFR descriptors** (Council of Europe, including the 2020 Companion Volume): the can-do statements.
- **Plan Curricular del Instituto Cervantes (PCIC)**: the standard Spanish grammar, function and notion lists by level (A1–C2).
- **Frequency lists** (open corpus-based lists): which vocabulary to teach first.

We build a starter graph for A1–A2 (about 150–250 objectives) **once**, with AI help, reviewed by the tutor. It is stored as data (a seed file in git plus database rows), so it can be versioned and extended.

## 5. Pedagogy and quality rules (what "good" means)

### 5.1 Principles

| Principle | Concrete rule the generator must follow |
|---|---|
| **Comprehensible input** (i+1) | Input texts and audio: **≥ 95% known words** (≥ 98% for extended listening). New words are glossed |
| **Limited new load** | Immersive lesson: ≤ 8–12 new lemmas and ≤ 1 new grammar point. Quick session: 0–3 new items |
| **Recycling** | ≥ 30% of the practice uses items from earlier lessons, especially FSRS-due and weak items |
| **Retrieval before re-teaching** | Start with recall of previous material (a warm-up) |
| **Pushed output** | Every immersive lesson ends with free speaking or video production tied to the can-do objective |
| **Interleaving** | Mix item types and earlier objectives within practice; avoid blocks of 10 identical exercises |
| **Multimodal** | Pair new vocabulary with a picture and/or audio; listen before read at low levels |
| **Personal relevance** | Scenarios drawn from the goal's domain and the learner's interests |
| **Useful feedback** | Corrections restate the correct form and name the error category; praise is specific |
| **One variety** | All content, audio and model answers use the goal's Spanish variety |

### 5.2 Lesson anatomy (immersive)

```
1. Warm-up (retrieval)       2–4 min   due/weak items, earlier objectives
2. Input                     5–10 min  story / dialogue / video / picture scene at i+1
3. Noticing                  3–5 min   draw attention to the target form (highlight, compare)
4. Controlled practice       5–10 min  auto-scorable exercises on the target
5. Free production           5–10 min  speak / record a video / describe a picture / role-play
6. Wrap-up                   1–2 min   summary, self-rating, new items added to FSRS
```

Quick sessions have no anatomy. They are **retrieval-only**, assembled from the FSRS queue plus drills from lessons already studied (ADR 0007).

### 5.3 Quality checks: all must pass before the tutor even sees a draft

| # | Check | How |
|---|---|---|
| Q1 | Valid structure | JSON Schema / zod validation |
| Q2 | Aligned to objectives | Every exercise references ≥ 1 planned objective id; every planned objective is practised |
| Q3 | Difficulty | **Deterministic** known-word coverage against the learner's vocabulary (lemmatised) meets §5.1 |
| Q4 | New-load limits | Count of new lemmas and grammar points is within limits |
| Q5 | Recycling | Share of recycled items ≥ threshold |
| Q6 | Answer keys | Auto-scored exercises have exactly one correct answer (or a complete list of accepted answers) |
| Q7 | Variety consistency | Variety-specific word/form lists (vosotros, voseo, regional words) do not conflict with the goal's variety |
| Q8 | Language correctness | Second-opinion review by an AI (ideally **a different model** from the generator) + a spell/grammar checker (e.g. LanguageTool, open source) |
| Q9 | Media | Referenced images/audio exist and are licensed; TTS-friendly text (no symbols that TTS reads badly) |
| Q10 | Timing | Estimated duration fits the session length |

Checks Q1–Q7, Q9 and Q10 are **code** in `packages/core`, so they behave the same whichever AI wrote the lesson. Failed checks go back to the generator once, with the specific failures. If it fails twice, the draft goes to the tutor marked as failed.

## 6. Adaptation: three loops

| Loop | Timescale | Who decides | What changes |
|---|---|---|---|
| **Micro** | During a session | Code (on the device) | Repeat missed items at the end; offer hints; shorten a quick session if accuracy collapses |
| **Meso** | Next lesson | AI proposes, tutor approves | Which objectives the next lesson targets; difficulty; the error patterns to target |
| **Macro** | Weekly, or when triggered | AI makes a **plan revision** that applies automatically (tutor notified, can revert; `plan_autonomy` can require approval instead) | Order, pruning or adding objectives; quick/immersive mix; pace; goal feasibility |

### Macro re-planning triggers

- **Pace drift**: projected completion date slips > 2 weeks beyond the deadline, or is > 3 weeks ahead of it.
- **Retention problem**: FSRS lapse rate above threshold for 2 weeks (too much new material).
- **Plateau**: an objective's mastery hasn't moved after N attempts (it needs a different approach, or a missing prerequisite).
- **Goal change**: new deadline, new domain, new target level.
- **Tutor override**: at any time.

### What a plan revision contains

A plan revision is a **new version** of the plan, never an in-place edit (the history of plan changes is itself useful data). It contains the changed objective sequence, a new projected date, and a **rationale** that cites the evidence ("velocity 0.8 obj/h vs needed 1.1; propose dropping `cu.*` and 4 writing objectives, which are low priority for the speaking goal").

Examples:
- *Learning faster than planned* → pull later objectives forward, raise the new-item limit slightly, and add stretch content (authentic video).
- *Learning slower, deadline fixed* → cut to the objectives on the shortest path to the goal's priority can-do statements, increase the quick-mode share (cheaper retention), and tell the tutor what was dropped.
- *Deadline passed or goal reached* → propose the next goal.

## 7. Human in the loop, provenance and evaluation

- **The tutor approves** every immersive lesson and every plan revision. Quick sessions are assembled by code from approved content, so they need no approval.
- **Provenance** is recorded for every AI output: provider, model, prompt template id + version, framework version, a hash of the input snapshot, checks passed/failed, and tutor edits (the diff between the AI draft and the published version). Tutor edits are the best signal of generation quality.
- **Evaluation set**: about 20 fixed generation requests (different learners/goals/objectives). When prompts, models or providers change, re-run the set and compare check pass rates, tutor ratings and cost. **This is what makes switching AI providers a measured decision instead of a guess.**

## 8. What this implies for the data model (to be finalised)

New or changed entities compared with the current draft [DATA_MODEL.md](DATA_MODEL.md):

| Entity | Purpose |
|---|---|
| `goals` | §2, one active per student; versioned |
| `objectives`, `objective_prereqs`, `objective_links` | §4 curriculum graph; seeded from git |
| `evidence` (or tagging existing `attempts`/`assessments` with objective ids + error categories) | §3; mastery is derived from this |
| `mastery` (view or materialised table) | Per objective: level, confidence, last evidence |
| `plans`, `plan_items` | §6, versioned plan (objective sequence, target dates, rationale, status) |
| `lessons` gains `objective_ids[]`, `framework_version` | §5.3 Q2 alignment |
| `generation_runs` | §7 provenance, check results, cost, and the link to the resulting draft |
| `lexicon` (lemma, variety, frequency rank, gloss) | §5.1 difficulty checks, translation (§9) |
| `eval_cases`, `eval_results` | §7 comparing providers |

Design rules for keeping the data easy for an AI to use:
- **Stable, readable ids** for objectives and error categories (`gr.ser_estar`), not only UUIDs.
- **Plain-language descriptions** on objectives, exercise types and schema fields. Models read these.
- **Summary views** (learner snapshot, plan summary) exist specifically to feed AI context compactly.
- **AI never gets raw SQL.** It uses task-shaped MCP tools only (ADR 0008).

## 9. Translation and language layers

There are three separate concerns. Keep them separate.

| Layer | What | Approach |
|---|---|---|
| **App UI text** | Buttons, menus | i18n files (en, es) in git. Immersive mode switches to es |
| **Glosses / hints** | English meaning of Spanish items shown on tap | Stored **with the content** (in the lexicon + per-exercise hints), generated at authoring time, reviewed with the lesson. **Never machine-translated live** |
| **Explanations** | Grammar notes, feedback | Language chosen by the learner's level: English at A1–A2, simple Spanish from B1 (a tunable parameter). Stored in both where needed |

The content language is always the goal's Spanish variety. Translation *direction* is Spanish → English (glosses), never English content translated into Spanish, which tends to produce unnatural Spanish.

## 10. Learner context: resolved ([ADR 0014](adr/0014-learner-context-is-data.md))

The earlier open questions have one answer: **treat all of them as unknown at all times.**
- Variety, weekly time and quick/immersive share are *settings* (NULL = unknown, neutral defaults used and flagged as assumed).
- Level is *estimated* continuously from evidence (`estimateLevels`).
- Goals are *selectable* (challenge, level or custom, with an optional date).
- The curriculum is bundled, versioned content (CEFR + PCIC based; a tutor's own material can be added later).
- Plan revisions apply **automatically** by default (`plan_autonomy = 'auto'`), are versioned, and can be reverted.

## 11. Tunable parameters (defaults, versioned with the framework)

| Parameter | Default |
|---|---|
| Known-word coverage for input text / extended listening | 95% / 98% |
| New lemmas per immersive lesson | 8–12 |
| New grammar points per lesson | ≤ 1 |
| Minimum recycled share | 30% |
| Mastery threshold | ≥ 0.8 on 3 separate days, incl. 1 production |
| Re-plan trigger: behind / ahead | > 2 weeks behind / > 3 weeks ahead |
| Explanations in Spanish from level | B1 |
| Max generator retries on failed checks | 1 |
