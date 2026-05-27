# Project Agent Instructions

Apply these rules for all development work in this repository unless the user explicitly overrides them.

## Required Stack

- Frontend runtime and package manager: Bun
- Frontend framework: Next.js
- UI library: React
- React style: functional components with Hooks only
- Frontend language: TypeScript
- Styling: Tailwind CSS
- Backend: ASP.NET Core Web API

## Required Behavior

- Use Bun by default for frontend install, run, build, and add commands.
- Use Next.js by default for frontend implementation.
- Use React functional components only.
- Use Hooks for component state and shared client logic.
- Use TypeScript for frontend code and examples.
- Use Tailwind CSS for styling.
- Use ASP.NET Core Web API for backend endpoints and services.

## Do Not

- Do not use npm, yarn, or pnpm unless the user explicitly requests it.
- Do not generate React class components.
- Do not generate JavaScript or JSX frontend files unless the user explicitly requests them.
- Do not introduce alternative frontend frameworks unless the user explicitly requests them.
- Do not introduce alternative CSS systems unless the user explicitly requests them.
- Do not introduce alternative backend stacks unless the user explicitly requests them.

## Preferred Implementation Style

- Prefer Next.js App Router for new routes and layouts.
- Prefer typed DTOs, typed props, and typed API contracts.
- Prefer reusable Hooks for shared React logic.
- Prefer thin controllers and service-based backend logic.
- Prefer extending existing repository conventions over inventing new patterns.

## Priority

1. User instruction
2. Existing repository conventions
3. These rules

If the repository already has an established pattern, follow it.
If the repository does not define a pattern, use the required stack defined above.

## Execution Rules

These rules apply to every task in this project unless explicitly overridden.
Bias: caution over speed on non-trivial work. Use judgment on trivial tasks.

### Rule 1 - Think Before Coding

- State assumptions explicitly. If uncertain, ask rather than guess.
- Present multiple interpretations when ambiguity exists.
- Push back when a simpler approach exists.
- Stop when confused. Name what's unclear.

### Rule 2 - Simplicity First

- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked. No abstractions for single-use code.
- Test: would a senior engineer say this is overcomplicated? If yes, simplify.

### Rule 3 - Surgical Changes

- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor what isn't broken. Match existing style.

### Rule 4 - Goal-Driven Execution

- Define success criteria. Loop until verified.
- Don't follow steps. Define success and iterate.
- Strong success criteria let you loop independently.

### Rule 5 - Use the model only for judgment calls

- Use me for: classification, drafting, summarization, extraction.
- Do NOT use me for: routing, retries, deterministic transforms.
- If code can answer, code answers.

### Rule 6 - Token budgets are not advisory

- Per-task: 4,000 tokens. Per-session: 30,000 tokens.
- If approaching budget, summarize and start fresh.
- Surface the breach. Do not silently overrun.

### Rule 7 - Surface conflicts, don't average them

- If two patterns contradict, pick one (more recent / more tested).
- Explain why. Flag the other for cleanup.
- Don't blend conflicting patterns.

### Rule 8 - Read before you write

- Before adding code, read exports, immediate callers, shared utilities.
- "Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

### Rule 9 - Tests verify intent, not just behavior

- Tests must encode WHY behavior matters, not just WHAT it does.
- A test that can't fail when business logic changes is wrong.

### Rule 10 - Checkpoint after every significant step

- Summarize what was done, what's verified, what's left.
- Don't continue from a state you can't describe back.
- If you lose track, stop and restate.

### Rule 11 - Match the codebase's conventions, even if you disagree

- Conformance > taste inside the codebase.
- If you genuinely think a convention is harmful, surface it. Don't fork silently.

### Rule 12 - Fail loud

- "Completed" is wrong if anything was skipped silently.
- "Tests pass" is wrong if any were skipped.
- Default to surfacing uncertainty, not hiding it.
