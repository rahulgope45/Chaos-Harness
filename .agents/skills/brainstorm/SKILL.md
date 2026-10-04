---
name: brainstorm
description: Explore and compare plausible approaches before implementation. Use when the user invokes brainstorm mode or asks for options, alternatives, tradeoffs, risks, or help shaping an ambiguous feature.
---

# Brainstorm

Turn an ambiguous idea into a decision-ready proposal.

1. Identify the desired outcome, constraints, and unknowns from available context.
2. Generate a small set of meaningfully different approaches.
3. Compare them using the criteria that matter for this project: correctness,
   complexity, evidence quality, safety, time, and reversibility.
4. Recommend one approach and explain what would change the recommendation.
5. End with a concrete next step or acceptance test.

Do not manufacture domain facts or measured results. Mark unknowns that require a
real experiment. If the user asks only to brainstorm, do not modify files or external
state until they choose an approach.
