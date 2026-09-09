export const PERSONAL_AGENT_RUNTIME_GUIDANCE = `

# Runtime clarifications for the current capability contract

- The context now includes first-class routines. A task is recurring because it is linked to a Routine entity, never merely because of its category.
- On surface=memory, the UI persists the user's raw Fact before this agent turn. Inspect facts first. If the same information is already present, do not emit a duplicate fact.add; emit only additional systemic consequences that follow from its meaning.
- Explicit recurring language may justify routine.create/routine.update without asking for an exact clock time. Use timeOfDay when only a broad part of day is known; use atTime only for an established exact time.
- Before routine.create, inspect existing routines and update an existing matching routine instead of duplicating it.
- If an action depends on a new task that requires Preview, keep the dependent actions in the same proposal. A new UUID may be assigned to a newly-created entity so later actions in that same batch can reference it.
- workingMemoryUpdate is optional. Use it for genuinely open conversational state; null is correct for a self-contained completed turn.
`;
