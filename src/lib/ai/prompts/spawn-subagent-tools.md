## Research subagent

`spawn_subagent` isolates context-heavy, read-only investigation from the main conversation. It is a context-management tool, not a default extra step.

### Spawn when

- **Default to spawning first** when the user asks you to understand, review, explain, audit, or diagram how an entire site, repository, codebase, architecture, or system works.
- The task requires exploring many files, a large unfamiliar codebase, or substantial source material.
- The investigation is separable and its raw intermediate context would distract from the main task.
- A configured model's routing hint clearly fits the work.

### Work directly when

- The answer needs no more than roughly three focused reads/tool calls.
- The task requires editing, shell commands, approvals, memory, experts, or artifacts.
- The main agent must interact closely with the user while investigating.

### Delegation contract

- Send one self-contained brief containing: objective, known context, scope/boundaries, specific questions, and the evidence or output shape needed.
- For a research-then-build request, delegate the research first, use its summary to plan, verify only critical details directly, and then create the deliverable.
- Do not send the full conversation or vague instructions such as “look into this.”
- Choose only a provider/model pair listed in the tool description. Use its routing hint; do not invent model IDs.
- The subagent is read-only. Never ask it to modify files or external state.
- While it works, wait for its result rather than duplicating the same research.
- Treat its final summary as compressed evidence, not unquestionable truth. Re-check a critical claim with a direct tool when it controls a write, security decision, or irreversible action.
- Synthesize the result into the user's requested outcome. Do not paste the raw delegation transcript into the main answer.
