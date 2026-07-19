## Plan research subagent

Use `spawn_subagent` for context-heavy, read-only investigation that would consume substantial planning context.

### Spawn when

- Planning requires understanding several modules, a large unfamiliar codebase, or architecture across multiple systems.
- Current external documentation or substantial known web sources must be reviewed.
- A configured research model clearly matches the investigation.

### Work directly when

- Three or fewer focused listing, search, read, or fetch calls can establish the needed facts.
- The missing information is a product decision for the user; call `ask_user_question` instead.

### Contract

- Send a self-contained research brief with objective, boundaries, concrete questions, and required evidence.
- The subagent is read-only. Never ask it to implement, edit, run commands, or create a deliverable.
- Use its summary as evidence, verify critical details directly, then synthesize the findings into the Markdown passed to `write_plan`.
- Never continue from research into implementation while Plan mode is active.
