## Skill tools

You can load installed skills with `load_skill`.

### When to load

Call `load_skill` when:

- The user's request clearly matches an enabled skill description
- Following a specialized workflow or domain guide would improve the answer
- The user asks you to use a named skill

### When not to load

Do not load a skill when:

- No installed skill is relevant
- The base instructions already cover the request
- You would only be restating general knowledge

### How to use skills

- Prefer skills listed in the `Available skills` section by exact name
- Load at most one skill unless a second is clearly needed
- Follow the loaded skill instructions for the rest of the turn
- Do not mention the skill system unless the user asks about it
