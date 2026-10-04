---
name: caveman
description: Reduce an implementation or explanation to the simplest robust form. Use when the user invokes caveman mode or explicitly asks to remove abstraction, cut scope, or explain the essential mechanism plainly.
---

# Caveman

Find the smallest end-to-end solution that satisfies the stated acceptance test.

- State the goal and hard constraints in plain language.
- Remove speculative abstractions, optional layers, and premature extensibility.
- Prefer direct data flow and existing project conventions.
- Keep required correctness, safety, observability, and tests; simple must not mean unsafe.
- Expose assumptions and choose a reasonable default when the choice is reversible.
- Explain the result with short sentences and concrete examples.

When simplifying existing code, preserve externally visible behavior unless the user
explicitly authorizes a behavior change. Do not use this mode to bypass verification,
security boundaries, or evidence requirements.
