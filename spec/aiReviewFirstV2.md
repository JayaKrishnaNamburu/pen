# AI V2 — Review-First Product Direction

**Status:** Proposed

**Related packages:** `@pen/ai`, `@pen/react`, `@pen/ai-tools`, `@pen/bench`

**Depends on:** Wave 6, Wave 7

---

## Goal

Refocus Pen's next AI product layer around **reviewable, document-native collaboration**.

After this direction lock:

- Pen defaults to inspectable changes over opaque mutation
- staged review becomes the primary AI product surface
- route quality and trust metrics are treated as first-class product concerns
- planning is introduced narrowly as a preparation flow
- tool-backed AI remains an escalation path, not the default Pen experience

This document does not replace Wave 7. It clarifies the product direction for the next AI wave built on top of Wave 7's technical substrate.

---

## Why This Direction Exists

Pen already has unusually strong foundations for AI editing:

- CRDT-native persistent suggestions
- accept/reject semantics that work across sessions and collaborators
- staged review artifacts
- structured mutation planning
- mutation receipts and route metadata
- session and turn state for inline and chat flows

Those strengths are more strategically important than adding a broad agent shell.

The next product step should therefore make this sentence obviously true:

**Pen is the best place to collaborate with AI on reviewable document changes.**

---

## Core Product Principle

Pen's primary AI experience is **review-first document collaboration**, not general-purpose tool orchestration.

This means:

1. AI output should be inspectable before commitment whenever confidence is not high.
2. The default mental model is "review and resolve changes", not "run an agent and hope".
3. Tool-backed flows are allowed, but are secondary to document-native mutation paths.
4. Planning is valuable when it improves reviewability and execution quality, not as a generic chat persona system.
5. Branch-backed AI remains experimental until staged review is proven insufficient for target workflows.

---

## Product Hierarchy

### Primary surfaces

- inline edit review
- chat-driven review
- structured preview
- unified change list
- accept/reject lifecycle
- mutation evidence and receipts

### Secondary surfaces

- narrow planning mode
- tool escalation UI
- debug and metrics views

### Deferred surfaces

- broad public multi-mode chat shell
- org-wide agent customization
- branch-first AI workflows
- terminal-first general coding agent behavior

---

## What Changes From The Earlier AI Direction

The earlier AI direction correctly invested in a broad technical substrate:

- generation zones
- sessions and turns
- command menu
- track changes
- tool loop
- structured plans

The next direction tightens product focus:

- review clarity beats breadth of AI surface area
- route correctness beats more visible modes
- acceptance outcomes beat generic "agent capability"
- mutation evidence beats opaque streaming
- planning is introduced narrowly, not as a full mode matrix

---

## Non-Goals

- This direction does not try to make Pen a full VS Code-style coding agent.
- This direction does not prioritize org-level instruction systems.
- This direction does not move branch-backed AI into the main product flow.
- This direction does not replace Wave 7 suggestion semantics with a new review model.
- This direction does not require all AI output to be staged; direct apply remains valid when confidence and target suitability are high.

---

## Product Priorities

### Priority 1: Review-first UX

Pen should unify the user experience of:

- persistent suggestions
- structured review items
- validated mutation plans
- turn-level accept/reject resolution

### Priority 2: Route quality and trust

Pen should measure and improve:

- wrong-lane decisions
- stale context failures
- invalid/noop mutation receipts
- acceptance by lane and apply strategy

### Priority 3: Narrow planning

Pen should expose a constrained planning flow that:

- prepares reviewable changes
- captures assumptions and verification steps
- hands off into review/edit
- never mutates directly

### Priority 4: Controlled tool escalation

Pen should support tool-backed AI when needed, but:

- only as escalation
- with readable tool summaries
- with approvals for risky tools
- without displacing the document-native default path

---

## Canonical Product Model

### Review-first flow

1. user issues a request
2. Pen routes the request
3. Pen chooses direct apply, staged suggestions, or staged review based on confidence and target kind
4. Pen renders a unified review surface
5. user accepts or rejects at turn, group, or item scope
6. Pen records receipt, route, outcome, and metrics

### Planning flow

1. user requests a plan
2. Pen produces a draft or validated plan
3. Pen captures assumptions, open questions, and verification steps
4. user hands off into review/edit
5. execution reuses plan context rather than starting from scratch

### Escalation flow

1. document-native route is attempted first
2. if the route is insufficient, Pen escalates into tool-backed execution
3. risky tools require approval
4. tool results are summarized for humans
5. final outputs still resolve into reviewable document changes whenever applicable

---

## Success Criteria

This direction is successful when:

- users can understand what AI changed without reading debug logs
- acceptance rate improves for staged changes
- retry loops decline for structured and reviewed flows
- wrong-lane and stale-context failures become measurable and trend downward
- planning improves execution quality without introducing broad mode complexity
- tool usage remains purposeful rather than becoming the default path

---

## Relationship To Existing Specs

### Wave 7

Wave 7 remains the technical foundation for:

- sessions
- suggestions
- accept/reject
- track changes
- tool loop
- diff and review primitives

This direction builds the next product layer on top of that substrate.

### Wave 11

Wave 11 branching, apps, and execution remain valid but are not pulled wholesale into the core AI product sequence. Branch-backed AI stays deferred until staged review proves insufficient for key workflows.

---

## Required Follow-on Specs

This direction should be implemented through the following follow-on docs:

1. `wave07bAiReviewProduct.md`
2. `wave07cAiPlanningMode.md`
3. `aiMetricsAndEvaluation.md`
4. `wave07dAiToolEscalation.md`

---

## Direction Lock

For the next AI product phase, Pen should optimize for:

- review clarity
- route correctness
- change trust
- acceptance outcomes

It should not optimize first for:

- more visible chat modes
- broader generic agent behavior
- org-scale customization systems
- branch-first AI workflows
