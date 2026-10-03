#!/usr/bin/env node
// PreToolUse guard on `git commit` and `git push`: refuses to record or publish commits under the wrong
// GitHub account.
//
// Written after a commit went out authored by the user's work account (the global ~/.gitconfig email)
// instead of the account that owns this repo. Vercel's Hobby plan blocks deploys of private-repo commits
// whose author is not the account owner, so the push landed and the deploy silently never happened.
//
// The expected identity is `gitIdentity` in harness.config.json:
//
//   "gitIdentity": { "name": "...", "email": "..." }
//
// No `gitIdentity`, no check: the guard stands aside.
//
//   commit  the author git WOULD use (`git var GIT_AUTHOR_IDENT`, or an explicit --author) must match.
//   push    every commit not yet on any remote must already carry that author, because a push publishes
//           whatever is there, including commits made before this guard existed.
//
// Matches on the binary per segment, like guard-commit, so a command that merely MENTIONS git commit or
// git push (grep, echo, docs) is not the subject. Fails OPEN when git cannot be read.
//
// Try it without running anything:
//   echo '{"tool_input":{"command":"git push origin master"}}' | node .claude/harness/guard-git-identity.mjs

import { execFileSync } from 'node:child_process'

import { deny, load, readPayload } from './config.mjs'

const git = args => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' }).trim()
  } catch {
    return null
  }
}

const segments = command => command.split(/(?:&&|\|\||[;|\n])/g).map(segment => segment.trim())

// `git -c k=v commit`, `git -C dir push`: global options may sit between `git` and the subcommand.
const runs = (command, sub) =>
  segments(command).some(segment => new RegExp(`^git\\s+((-c|-C)\\s+\\S+\\s+)*${sub}\\b`).test(segment))

const sameEmail = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase()

const fix = ({ name, email }) =>
  `Set it for THIS repo only (never the global config, which belongs to another account):\n\n` +
  `  git config --local user.name "${name}"\n` +
  `  git config --local user.email "${email}"`

// ── The decision, as a pure function ───────────────────────────────────────────
export const inspect = ({ identity, command, author = null, unpushed = [] }) => {
  if (runs(command, 'commit') && !/--dry-run\b/.test(command)) {
    const explicit = command.match(/--author[= ]["']?[^<"']*<([^>]+)>/)?.[1]
    const email = explicit ?? author

    if (email && !sameEmail(email, identity.email)) {
      return (
        `Blocked: this commit would be authored as <${email}>, but this repo must be committed as ` +
        `${identity.name} <${identity.email}>.\n\n` +
        `A commit under the wrong account cannot deploy on Vercel (Hobby blocks other authors on a ` +
        `private repo), and fixing it afterwards means rewriting history.\n\n${fix(identity)}`
      )
    }
  }

  if (runs(command, 'push')) {
    const wrong = unpushed.filter(({ email }) => !sameEmail(email, identity.email))

    if (wrong.length) {
      const list = wrong.map(({ sha, email, subject }) => `  ${sha}  <${email}>  ${subject}`).join('\n')

      return (
        `Blocked: this push would publish ${wrong.length} commit(s) not authored as ` +
        `${identity.name} <${identity.email}>:\n\n${list}\n\n` +
        `Vercel will refuse to deploy them. Ask the user how to proceed: re-author them before pushing, ` +
        `or push and then add a correctly authored commit on top (Vercel checks only the latest commit). ` +
        `For future commits:\n\n${fix(identity)}`
      )
    }
  }

  return null
}

const main = async () => {
  const payload = await readPayload()

  if (!payload) process.exit(0)

  const command = payload.tool_input?.command ?? ''

  if (!runs(command, 'commit') && !runs(command, 'push')) process.exit(0)

  const identity = load().gitIdentity

  if (!identity?.email) process.exit(0)

  const author = git(['var', 'GIT_AUTHOR_IDENT'])?.match(/<([^>]*)>/)?.[1] ?? null

  // Commits on HEAD that no remote has yet: exactly what a push of this branch would publish.
  const unpushed = (git(['log', '--format=%h%x09%ae%x09%s', 'HEAD', '--not', '--remotes']) ?? '')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [sha, email, subject] = line.split('\t')
      return { sha, email, subject }
    })

  const reason = inspect({ identity, command, author, unpushed })

  if (reason) deny(reason)

  process.exit(0)
}

if (process.argv[1]?.endsWith('guard-git-identity.mjs')) main()
