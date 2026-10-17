---
name: grill-me
description: Interview the user, one round at a time, until every decision a piece of work depends on is settled, then record those decisions where the architect will read them. Use when the user says "grill me" or asks to stress-test a plan, and before handing LARGE work to the architect while any business rule, edge case or scope question is still open.
---

# Grill Me

An agent given one sentence fills every gap with a guess and keeps going. The guesses are invisible
until a customer hits one. This skill turns the conversation around: **before any plan or code, you
interview the user** until nothing is left silently assumed.

The architect cannot do this itself. It runs as a sub-agent, so it can only write a question into its
plan's Follow Ups and carry on. Grilling happens here, in the main conversation, where the user can
answer.

## The design tree

Map the work as a **design tree**: every decision branches into the decisions that hang off it.

Work it in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the
questions you can ask *now* without guessing at answers you have not heard yet. Ask the whole frontier in
one round. Number each question and give your recommended answer. Then wait.

```
❓ **Q1** - **<question title>**: <question body, with the choices if there are any>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommendation. Most rounds then answer in one line.

Each round of answers reshapes the tree: settled decisions push the frontier outward. Recompute it and ask
the next round. A question whose answer depends on another question still open in this round belongs to a
*later* round.

## Facts are yours, decisions are theirs

Finding a **fact** is your job, never the user's. If a frontier question needs something you can look up
(the code, an API contract, the schema, a specification document, a requirements register, the project's
`CONVENTIONS.md`), dispatch a sub-agent to find it. Don't block on it: only the questions downstream of
that lookup wait; ask the rest of the frontier now.

A **decision** is anything a reasonable engineer could answer two ways: a business rule, an edge case,
what happens to data already in flight, what is out of scope. Put each one to the user and wait.

When the user uses two words for one thing, or one word for two things, stop and ask which they mean
before going further. A term left ambiguous here becomes two implementations later.

## Questions talking cannot settle

Some questions only settle by looking: what a screen should look like, whether a state model feels
right. Don't grill those. Say so, offer a throwaway prototype, and come back to the tree with the answer.

## Done means the frontier is empty

The session is done when every branch has been visited and the user confirms you share an understanding.
Do not act before that confirmation.

Then write the settled decisions to `.claude/plans/<type>-<name>-plan/decisions.md`, using the same
directory name the architect will use:

```markdown
# Decisions: <work>

Settled with <user> on YYYY-MM-DD. The architect plans against these and does not re-ask them.

1. **<decision>**: <the answer, one line>. <why, only if the reason is not obvious>
2. ...

## Out of scope

- <what was explicitly excluded>

## Still open

- <anything deferred on purpose, and who owns it>
```

One line per decision. No implementation detail: that is the plan's job.

Then route the work. Large work goes to the `architect`, pointed at `decisions.md`. Work small enough
for one session can be built here directly, with `decisions.md` as the contract.

---

Adapted from `grilling` in [mattpocock/skills](https://github.com/mattpocock/skills), MIT License,
Copyright (c) 2026 Matt Pocock.
