---
id: dev-server-shared-next-dir
trigger: pnpm dev, next dev, dev server, playwright, port 3000, browser test, run the app, 404 static chunks
scope: process
learned: 2026-10-03
evidence: tester started a 2nd `next dev` beside one on :3100, corrupting apps/web/.next (404 static chunks), then `pkill -f next-server` also killed an unrelated project's server on :3000
---

**Lesson:** Reuse a running pedia-dental dev server instead of starting another, and stop dev servers only by PID after confirming their cwd is this repo.

**Why:** Two `next dev` processes share `apps/web/.next` and corrupt it, so pages load with 404s for static chunks. Port 3000 is often taken by the user's other projects, so a broad `pkill -f next-server` takes down work outside this repo.

**Do:**
- Before starting: `lsof -nP -iTCP:3000-3100 -sTCP:LISTEN`, then check each PID's cwd with `lsof -p <pid> | grep cwd`. If one is in this repo, use its port.
- If you need your own server, use a free port and wait for the existing one to stop. Never run two against the same `apps/web/.next`.
- To stop one: `kill <pid>` for a PID whose cwd is this repo. Never `pkill -f next` or `pkill -f next-server`.
- After a corrupted `.next`, stop this repo's server, `rm -rf apps/web/.next`, and start a single server.
