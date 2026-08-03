# TavernKeeper Development Rules

Production scan evaluation and publication are fully automated. Development
canaries may be inspected while a new pipeline is being proven, but no
production scan, contextual assessment, report publication, Tavernary import,
final Tavernary grade, or card update may depend on human approval.

Staff may change global, versioned scanner, context, prompt, assessment, or
synthesis policy through ordinary code review. Staff may not dismiss, edit,
hide, recolor, or manually supersede an individual report or final assessment.
A correction requires a versioned global policy change or a new complete scan;
immutable history remains visible.

Deterministic findings are candidates, not conclusions. Every candidate must
receive one evidence-bound contextual assessment before a V5 report can exist.
Provider failure, token exhaustion, insufficient context, invalid structured
output, incomplete scanner or review coverage, or validation failure must stop
publication. Neither repository may fabricate a low result or emit a degraded
report.

Tavernary alone owns the final public risk grade. Its strict synthesis cannot
lower deterministic minimum-risk floors and cannot publish a partial or
uncited assessment. Scan results must not automatically hide, delist,
quarantine, rank, or otherwise moderate a catalog listing.
