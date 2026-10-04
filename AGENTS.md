# Agent guidance

Work feature by feature. Preserve existing user work, verify observable behavior, and
make a conventional commit after each completed feature or independently useful
milestone. Update `AI_CONTEXT.md` in the same commit so another agent can resume from
the verified repository state.

Do not report baseline numbers, chaos results, or defects without actual run artifacts
and run IDs. Synthetic corruption used to test the tester must remain visibly separate
from genuine findings.

## Skills

- `caveman`: `.agents/skills/caveman/SKILL.md` — reduce a task to the simplest robust
  implementation without cutting correctness or safety.
- `brainstorm`: `.agents/skills/brainstorm/SKILL.md` — compare meaningful alternatives
  and converge on a decision before implementation.
