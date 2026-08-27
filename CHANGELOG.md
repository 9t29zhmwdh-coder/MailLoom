# Changelog, MailLoom

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [1.8.1] - 2026-08-27

### Changed

- **Eigenes App-Icon.** Bis hierher trug jedes Werkzeug des Portfolios dasselbe RayStudio-Logo, byteweise identisch, was im Dock und in der Titelleiste nicht auseinanderzuhalten war. MailLoom bekommt jetzt sein eigenes Zeichen im bestehenden Hausstil: runder Rahmen mit Goldkante, tiefdunkler Grund, die Initialen in einer Didone-Serife, der goldene Strahl mit Funkeln darueber.

  Zwei Fassungen, wie es Apple und Microsoft ebenfalls halten: ab 128 Punkten die feine mit dem Schriftzug, darunter eine ohne. Gesperrte Versalien werden bei 32 Punkten zu einem grauen Streifen und nehmen den Initialen nur den Platz weg, den sie dort brauchen.

  Die Farbwerte stammen aus `RegistrarCheck.png`, nicht aus einer Schaetzung: Grund `#010d22`, Gold von `#a7782f` ueber `#e2c47e` nach `#ca9f4d`. Die SVG-Quellen liegen unter `src-tauri/icons/source/`, damit sich das Zeichen spaeter aendern laesst, ohne es nachbauen zu muessen.

---

## [1.8.0] - 2026-08-05

### Changed

- `recharts` 2 to 3. The dashboard uses it for a pie chart with a custom label render prop, which was rendered in a real DOM under both versions with the same data and produced the same four paths and two labels. Rendered in a DOM rather than server-side on purpose: version 3 builds the chart on the client and produces nothing server-side, which looks like a regression and is not.
- `keyring` 4.1.5 to 4.1.6 and `thiserror` 2.0.18 to 2.0.19, both patch releases. `keyring` holds the IMAP password, so the eight tests over the credential path matter more here than the version numbers; they pass unchanged.

### Removed

- `date-fns`. Dependabot proposed a 3 to 4 bump; the package is declared in `package.json` and imported in no source file. The bundle dropped from 654 kB to 617 kB.

---

## [1.7.3] - 2026-08-05

### Changed

- The `glib` advisory GHSA-wrw7-89jp-8q8g is now recorded in `SECURITY.md` and its unreachable versions ignored in `dependabot.yml`, matching the six sibling repositories. It had been dismissed as tolerable risk here, which left it invisible while Dependabot kept attempting an update that cannot succeed: `tauri` 2.11.5 requires `gtk ^0.18`, `gtk` 0.18.2 requires `glib ^0.18`, and cargo rejects 0.20.0 outright. The dismissal has been withdrawn so the entry and the Security tab agree.

---

## [1.7.2] - 2026-08-05

### Added

- A smoke test in CI: the application is built, started, and checked to still be running five seconds later. Until now the pipeline only ever established that the code compiles. A program that builds cleanly and dies on launch would have passed every check and been discovered by whoever downloaded it.
- It runs on Linux and macOS. The Linux job needs `xvfb`, since a GTK window closes immediately without an X server, and that would produce a failure the runner invents rather than one the code has.
- The test also fails on a panic in the output even when the process survives, because a background task that dies quietly leaves the window open and useless.

---

## [1.7.1] - 2026-08-04

### Changed

- TypeScript 5.9.3 to 7. No source change was needed. The production build runs `tsc` ahead of vite, so the typecheck has to pass for anything to be produced at all, and the generated files come out with the same content hashes as before.

---

## [1.7.0] - 2026-08-03

### Changed

- `mailparse` 0.15 to 0.16. This crate does the message parsing, so a change in how encoded words or timestamps are handled would show up as broken umlauts or wrong sorting in the list a user reads. The three parsing tests added first pass unmodified.
- `thiserror` 1 to 2. The error strings the frontend shows are unchanged, held by tests that pass under both versions.
- `sqlx` 0.8 to 0.9. Every query site uses a static SQL literal, so none runs into the guard 0.9 introduces for query strings that are not `&'static str`.
- React 18 to 19 with `react-dom` and both type packages together, since neither half resolves alone. Checked against what React 19 removes rather than assumed.
- `zustand` 4 to 5. All four stores already import the named `create`, which is the form version 5 expects.
- The npm group, covering `lightningcss`, `postcss` and the devtools plugin below vite.
- `github/codeql-action` 4.37.3 to 4.37.4 and `actions/attest` 4.2.0 to 4.2.1, merged separately and carried by this version.

### Added

- Three tests over the message parsing: a realistic message with a UTF-8 encoded subject, a quoted-printable sender name, two recipients and a +0200 timestamp, plus one without a subject. Subject, sender, recipients, message id and the conversion to UTC are all held.
- Tests that hold the `MpError` messages, including the `anyhow` conversion that goes through a hand-written `From`.

### Removed

- `base64` from `mp-core` and `thiserror` from `mp-core`. Both were declared and never referenced. `base64` had been proposed for a 0.22 to 0.23 bump; it remains in the tree below `charset` below `mailparse`, which is not a declaration of ours.

---

## [1.6.0] - 2026-08-03

### Changed

- Tailwind CSS 3 to 4. The config file is gone, the stylesheet imports tailwindcss directly, and PostCSS uses `@tailwindcss/postcss`. autoprefixer is no longer a dependency because version 4 prefixes on its own.
- Three utility names were rewritten across nine components: `rounded` to `rounded-sm` 17 times, `outline-none` to `outline-hidden` 9 times, `flex-shrink-0` to `shrink-0` 13 times. Only the last two change behaviour. Measured under 4.3.3, `rounded` is still 0.25rem and kept as an alias; the scale shifted under the name `rounded-sm`, which this code never used.
- The upgrade tool leaves occurrences inside multi-line template literals untouched. That matters little for `rounded`, but the same blind spot applies to `outline-none`, which does change behaviour, so every migrated repository was checked: none survived anywhere.

---

## [1.5.1] - 2026-07-31

### Changed

- Both READMEs now open with why mail rules stop working, which is that an invoice, a delivery notice and a phishing attempt do not announce themselves in the header, rather than with the category "AI-powered email organizer".
- The description said classification runs through Claude and named the Anthropic API as the only path. Since 1.4.0 a local Ollama model is the default and the choice is a setting. The READMEs now say so and point at PRIVACY.md for what each backend transmits.
- An Ollama badge sits alongside the Claude one, matching what the app actually supports.

---

## [1.5.0] - 2026-07-31

### Added

- The settings screen lets you pick the backend. 1.4.0 made the choice real in the code but left no way to make it, so the setting could only be changed by editing the stored configuration. The picker sits above the API key field, because it decides whether any email content leaves the machine and the key only matters once the cloud path is chosen.

### Fixed

- The sidebar named the backend that is actually in use. It read "Claude online" whatever the setting said, which became wrong the moment the local model became the default.
- The interface started in English on a German system. The language fell back to `'en'` outright instead of reading the operating system's, so every German user changed it by hand once. A stored choice still wins over the system setting.

### Changed

- New screenshots in both READMEs, taken with invented demo data. The old ones still showed the previous product name in the window title. A caption states that the senders and subjects are made up.

---

## [1.4.0] - 2026-07-30

### Added

- The AI backend is selectable. `ai_backend` chooses between a local Ollama instance and Anthropic's API, and defaults to `ollama`.

### Fixed

- Classification ran exclusively through Anthropic's API. `OllamaBackend` was fully implemented but never instantiated anywhere, so every command built a `ClaudeBackend` regardless of any setting. Even `check_ollama` reported Anthropic's availability under Ollama's name.
- `PRIVACY.md` stated that classification ran locally and that no email content was transmitted to external services. Neither was true. The file now describes what each backend sends, and records the correction rather than quietly replacing the text.

### Security

- An unknown value in `ai_backend`, whether a typo or a leftover from an older configuration, selects the local model. A configuration mistake must not send somebody's email to a third party.
- Choosing the cloud backend without an API key reports an error instead of falling back to the local model, and a missing local model never falls back to the cloud. Either silent substitution would override a deliberate choice about where private mail is processed.
- The README now names what the cloud path transmits: sender, subject and the first 800 characters of the body. That content belongs to the people who wrote to you, who did not agree to it.

---

## [1.3.0] - 2026-07-30

### Changed

- Renamed from MailPilot to MailLoom. "Mail Pilot" is a registered trademark of Mindsense LLC, whose product is also a macOS email client, so the collision was in the same category on the same platform rather than merely a similar word. The bundle identifier changes with it, which resets the keychain service name: stored account passwords have to be entered once more.

---

## [1.2.5] - 2026-07-30

### Security

- Passwords no longer pass through a command line. Keychain access went through `/usr/bin/security` with the password as an argument, and `security add-generic-password -h` says of that option: "Use of the -p or -w options is insecure." Command-line arguments are readable from the process table, so any process running as the same user could read an IMAP password out of `ps` while the call was in flight. This affected both mail account passwords and the Claude API key, which is stored the same way. Access now goes through the Security framework via the `keyring` crate, with no subprocess and no argument to expose.
- The CLI offered no way out: its only alternative to the argument is an interactive prompt that asks for the password twice, which a windowed application cannot answer.

### Added

- A round-trip test for the keychain path, macOS only. The coverage job runs on Linux, where keyring defaults to the D-Bus secret service that a CI runner does not provide, and a failure there says nothing about this code. It It stores a secret, reads it back, deletes it and checks that the entry is gone, then deletes again to confirm removal stays a no-op. A test that only asserted "no error" would have passed against the insecure version too.

---

## [1.2.4] - 2026-07-29

### Added

- `frontend/src/vite-env.d.ts`, referencing `vite/client`. Vite has always declared modules for `*.css` and the other asset types it handles, but nothing in this project pulled that declaration in. TypeScript 5 accepts the untyped side-effect import of `index.css` regardless, so the gap stayed invisible; TypeScript 7 rejects it with `TS2882`. The file belongs to Vite's own project scaffold and was simply missing, so this closes an existing hole rather than preparing for a specific upgrade.
### Security

- The release workflow no longer grants `contents: write` for its whole run. The permission moves to the one job that publishes the release, and everything else runs with `contents: read`. OpenSSF Scorecard scores the Token-Permissions check 0 out of 10 whenever any workflow holds a top-level write permission, regardless of how little of the run needs it, so this single line was what held the check at zero.

---

## [1.2.3] - 2026-07-29

### Changed

- `reqwest` updated from 0.12 to 0.13. The `rustls-tls` feature no longer exists in 0.13 and is replaced by `rustls`, so the automated dependency update could not build: it can raise a version number but not rename a feature.

### Security

- TLS now trusts the operating system's certificate store rather than a bundled root set. The `rustls` feature in 0.13 pulls in `rustls-platform-verifier`, where 0.12 resolved roots independently of the host. A machine that trusts an internal certificate authority, which is the normal case behind a corporate proxy, now works without extra configuration. The other side of that is real and worth naming: the trust decision moves to the machine the tool runs on, so a tampered local certificate store is enough to intercept the connection.
- The rustls crypto provider changes from `ring` to `aws-lc-rs`, which is what the `rustls` feature selects in 0.13.

---

## [1.2.2] - 2026-07-29

### Changed

Dependency and workflow updates merged since 1.2.1:

- chore(ci): bump the actions group across 1 directory with 3 updates
- chore(deps): bump the npm group across 1 directory with 4 updates
- chore(deps): bump the cargo group across 1 directory with 9 updates

---

## [1.2.1] - 2026-07-29

### Fixed

- The release built for the runner's own architecture only, so every DMG since the first release carried an `arm64` binary that an Intel Mac cannot start. The build now targets `universal-apple-darwin` and covers both architectures.
- The folder suggestions carried the note "IMAP actions are coming in a future version", which stopped being true when they shipped in 1.1.0. It now says where the moves are actually confirmed.

### Changed

- The release is created as a draft and only published after `lipo -archs` confirms both architectures are in the bundled binary. The runner is Apple Silicon, so a build that quietly loses the `x86_64` slice still produces a working DMG there and would fail only on a user's machine. A published release cannot be taken back once people have downloaded it, so the check runs before publication rather than after.
- The DMG path moved to `target/universal-apple-darwin/release/bundle/dmg`, since multi-architecture output does not land in the single-architecture build directory.

---

## [1.2.0] - 2026-07-28

### Added

- Filter rules are evaluated for real. `mp-core::rules` decides whether a rule matches an email and turns the matches into pending move actions. Until now the model and the database table existed but nothing ever read them, and the Rules tab was six toggles that only changed local component state.
- Rules tab backed by the database: list, create from a category template, write a custom rule (sender, subject, body or sender domain), enable, disable and delete. Each rule is shown as a readable sentence rather than its stored JSON shape.
- "Apply rules" queues the matches as proposals and reports how many were queued. Nothing is carried out here: the proposals go through the same confirmation in the Organize tab as the AI suggestions, so a broadly written rule cannot reshuffle a mailbox on its own.
- Commands `list_rules`, `save_rule`, `set_rule_enabled`, `delete_rule` and `run_rules`, with the matching queries in `mp-core::db`.

### Security

- A rule with no conditions never matches. Treating an empty condition list as "matches everything" would turn a half-filled form into a mailbox-wide move.
- `SenderDomain` compares the full host after the `@`, so a rule for `example.com` does not also match a sender at `example.com.attacker.net`.
- Only folder moves become actions. Tagging, read state and category changes are local concepts that the organize pipeline cannot carry out on the server, and producing actions for them would promise something it does not do.
- A rule is skipped for emails that already have a queued or applied action, so running the rules twice does not stack duplicate moves on one message.

---

## [1.1.0] - 2026-07-28

### Added

- Organize tab: proposals to move emails into their category folder on the IMAP server, applied one by one or in bulk, each with subject, sender, target folder and the reason behind it. Failures are listed separately with the server's own message and can be retried. This is the piece that was missing: the backend commands for actions existed and were declared in the frontend API, but no component ever called them, so the whole pipeline was unreachable.
- `move_email_imap` in the IMAP client. It prefers the MOVE extension (RFC 6851) and falls back to COPY plus `\Deleted` plus EXPUNGE where the server does not support it, and creates the target folder when it is missing.

### Fixed

- `apply_action` and `apply_all_actions` only wrote `Applied` into the local database and never contacted the server. Had anything called them, the app would have reported success while every message stayed exactly where it was. They now perform the move and record `Failed` with the server's reason when it does not work, a status the model always had but nothing ever set.
- `apply_all_actions` returned a single number that could not distinguish "everything moved" from "everything was marked done while the server refused". It now reports applied and failed counts separately, plus the first error.
- The local `mailbox` column is updated after a successful move, so the app's view matches the server instead of drifting from it.

### Changed

- README feature table: `IMAP actions` moves from Planned to Done. `Rules` stays planned; the data model and the `filter_rules` table exist, but no engine evaluates them yet.

## [1.0.5] - 2026-07-28

### Fixed

- The CodeQL job requested `packages: read`, `actions: read` and `contents: read` at job level, repeating grants the workflow level already provides. OpenSSF Scorecard counts that as excessive token permissions and scores `Token-Permissions` at 0 out of 10 for it. The job now requests only `security-events: write`, which is the one grant that genuinely exceeds the workflow default.

## [1.0.4] - 2026-07-28

### Changed

- CodeQL moved from GitHub's default setup to an advanced setup with a committed `.github/workflows/codeql.yml`. The default setup skips pull requests that touch no code of a given language, so a dependency pull request changing only a lock file reported `skipping` on the required `Analyze (...)` checks forever and could never be merged. The workflow runs on every pull request regardless of what changed. It also uses the `security-extended` query suite, which the default setup does not allow choosing. Required checks are unchanged: verified on `BugRadar` that all eight, the generic `CodeQL` check included, turn green under this setup.
- Dependabot now groups only minor and patch updates per ecosystem; majors arrive as individual pull requests. The previous grouping put React 18 to 19, Tailwind 3 to 4 and similar breaking changes into one pull request together with urgently needed security patches, which made the whole batch unreviewable and unmergeable. Actions stay grouped wholesale. Follows `engineering-standards` v0.11.0.

## [1.0.3] - 2026-07-28

### Security

- `postcss` updated to 8.5.24, closing a high-severity path traversal in the source map auto-loading via `sourceMappingURL` that affects all versions up to and including 8.5.17.

Applied as a normal pull request rather than by merging Dependabot's, because Dependabot pull requests cannot currently pass this repository's required checks: CodeQL runs through GitHub's default setup, which does not trigger on a pull request that only touches a lock file, so its checks report `skipping` and never turn green. Bypassing a required check is not an option per `standards/ci-cd.md` section 7, so the fix takes the route that runs the full pipeline.

## [1.0.2] - 2026-07-28

### Added

- `.github/dependabot.yml`, with grouped weekly updates. The file was missing, and without it there are no version updates at all: repository security alerts only fire for disclosed vulnerabilities. Follows `engineering-standards` v0.10.0.

### Fixed

- 7 action references used a mutable tag or branch instead of a commit SHA, `dtolnay/rust-toolchain@stable` among them where applicable. A branch HEAD can be moved to point at different code at any time. All are now pinned, at the version that was actually running rather than upgraded, so any major bump arrives as its own reviewable Dependabot PR.
- The Cargo workspace and `tauri.conf.json` were on 1.0.0 while the tag and changelog said 1.0.1, and `frontend/package.json` was on 0.3.8. The 1.0.1 release therefore shipped without the manifests being bumped. All manifests now agree on 1.0.2.

## [1.0.1] - 2026-07-20

### Changed

- OpenSSF Scorecard workflow and badge.
- `copilot-instructions.md` for consistent AI-assisted contributions.
- Restored real umlauts that had been substituted with ASCII approximations.
- German README now uses the same dynamic version badge as the English one instead of a hardcoded version string.
- Split the README's security/CI badges onto their own line, separate from the platform/tech/AI badges (they were rendering as a single merged line).

## [1.0.0] - 2026-07-17

First stable release: a real, packaged, installable distribution exists
for end users. macOS DMG installer. Windows/Linux are not built: MailPilot shells out to the macOS-only `/usr/bin/security` Keychain CLI for credential storage, a real platform dependency, not a gap.

## [0.3.9] - 2026-07-17

### Changed
- CI: added an explicit `permissions: contents: read` block to the workflow(s) that were missing one (CodeQL `actions/missing-workflow-permissions`), narrowing the default GITHUB_TOKEN scope.

## [0.3.8] - 2026-07-12

### Added

- TERMS_OF_SALE.md: terms covering the purchase of a pre-built, packaged distribution through a marketplace (as-is, no warranty, liability strictly capped at the amount paid). Does not modify the existing MIT LICENSE, which continues to cover the source code at no cost.

### Security

- Bumped `vite` and `@vitejs/plugin-react` (frontend dev dependencies) to resolve 4 Dependabot-reported advisories affecting the Vite dev server only, not the built/shipped application (a high-severity `server.fs.deny` bypass on Windows, an NTLMv2 hash disclosure via UNC path handling, a path traversal in optimized-deps `.map` handling, and an esbuild dev-server exposure).
- Documented a 5th advisory (`glib`, RUSTSEC, medium) as an accepted, time-boxed exception in SECURITY.md: it is a transitive dependency pinned by Tauri's own Linux GTK bindings and cannot be patched in isolation without a Tauri major-version bump.

## [0.3.7] - 2026-07-11

### Fixed

- Removed an eszett and em-dashes across the repo (TEMPLATE_NOTES.md, README.de.md, ARCHITECTURE.md, CONTRIBUTING.md, SKELETON.md). Swiss German orthography.

## [0.3.6] - 2026-07-11

### Added

- Documented Dual-Licensing assessment (Community-only) in ROADMAP.md.

### Fixed

- Removed em-dashes from ROADMAP.md headings.

## [0.3.5] - 2026-07-11

### Fixed

- Replaced the unmonitored security@raystudio.ch email in SECURITY.md with a GitHub Security Advisory link, matching the rest of the portfolio.

## [0.3.4] - 2026-07-11

### Fixed

- Updated actions/checkout, actions/setup-node, codecov/codecov-action and tauri-apps/tauri-action to their latest major versions in CI and the release workflow, since GitHub is deprecating the Node.js 20 runtime and older action versions were being forced onto Node 24 and crashing during post-run cleanup.

## [0.3.3] - 2026-07-11

### Fixed

- Fixed the release workflow's stable-named DMG upload: it looked for the built bundle under `src-tauri/target/...`, but this is a Cargo workspace, so Cargo places build output under the workspace root `target/...`. The stable `MailPilot.dmg` download link in README.md never actually got uploaded before this fix.

## [0.3.2] - 2026-07-11

### Fixed

- Corrected README hero section: only the title image and title stay centered, the tagline is now left aligned like the rest of the document

## [0.3.1] - 2026-07-10

### Fixed

- Removed em-dash from the download callout in README.md/README.de.md, replaced with a colon

## [0.3.0] - 2026-07-10

### Added

- Release workflow: pushing a `v*` tag now builds the macOS DMG bundle via `tauri-action` and attaches it to a GitHub Release. Not code-signed/notarized. Windows/Linux are intentionally not built (app uses the macOS Keychain, only ever tested on macOS)

## [0.2.2] - 2026-07-10

### Changed

- Moved the "New here? -> beginners guide" callout in README.md above the intro (previously only appeared near Requirements)

### Added

- Added the "New here?" beginner guide callout to README.de.md (was missing)

## [0.2.1] - 2026-07-08

### Fixed

- CI excluded the `mailpilot` app crate from all checks, hiding the crate's own bugs
- Missing English/German UI translation (the app was previously German-only)
- README claimed a local, offline, no-API-key AI backend; the app actually uses Claude via the Anthropic API (API key stored in Keychain). Corrected across both READMEs, badges, requirements, quick start and privacy sections
- German README had ASCII-transliterated umlauts (`fuer`, `koennen`, ...) throughout instead of proper `ü`/`ö`/`ä`

### Added

- README onboarding sections: how it runs, screenshot, in practice, uninstall/cleanup

## [0.2.0] (2026-07-03)

### Added

- IMAP folder browser with folder-level navigation
- Email deletion and AI-assisted folder suggestions
- Sync UX: relative timestamps, auto-sync toggle, per-account result display
- Unit and integration tests for `mp-core` with coverage reporting

### Changed

- AI backend switched to local Ollama (offline-first)

### Fixed

- ISO date-string handling in relative-time formatting
- CI security audit: documented ignores for quick-xml advisories
  (RUSTSEC-2026-0194/-0195, transitive via plist/tauri, no upstream fix yet)

## [0.1.0] - 2026-06-12

### Added

- IMAP client with TLS support (Outlook, Gmail, Apple Mail)
- Incremental sync engine with UID tracking and flag handling
- OS keyring integration (`keyring` crate), credentials never written to disk
- `ClassifierEngine` with `OllamaBackend` for local AI email classification
- Smart tagging and folder mapping based on classifier output
- Server-side IMAP MOVE for organised folder structure
- SQLite offline storage for emails, tags, accounts, and sync state
- Tauri v2 desktop shell with React/TypeScript frontend
- Inbox view with tag filters and AI-suggested labels
- Classifier review UI (accept/reject AI suggestions)
- Account management UI (add/remove IMAP accounts)
- Bilingual README (English / German)
- CONTRIBUTING.md with development setup guide
- SECURITY.md with vulnerability reporting process
