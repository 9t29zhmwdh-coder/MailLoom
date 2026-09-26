<div align="center">
  <img src="RayStudio.png" alt="MailLoom" width="120"/>
  <h1>MailLoom</h1>

</div>

<p>Sorts your inbox by what each mail actually is, and shows you every decision before it acts</p>

[🇩🇪 Deutsche Version](README.de.md)

[![CI](https://github.com/9t29zhmwdh-coder/MailLoom/actions/workflows/ci.yml/badge.svg)](https://github.com/9t29zhmwdh-coder/MailLoom/actions) [![CodeQL](https://github.com/9t29zhmwdh-coder/MailLoom/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/9t29zhmwdh-coder/MailLoom/security/code-scanning) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/9t29zhmwdh-coder/MailLoom/badge)](https://securityscorecards.dev/viewer/?uri=github.com/9t29zhmwdh-coder/MailLoom) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13696/badge)](https://www.bestpractices.dev/projects/13696)

![Rust](https://img.shields.io/badge/Rust-1.96+-CE422B?logo=rust&logoColor=white) ![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white) ![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey) ![AI | Claude](https://img.shields.io/badge/AI-Claude-black?logo=anthropic&logoColor=white) ![AI | Claude Code](https://img.shields.io/badge/AI-Claude_Code-black?logo=anthropic&logoColor=white) ![AI | Copilot](https://img.shields.io/badge/AI-Copilot-black?logo=github&logoColor=white) ![AI | Ollama](https://img.shields.io/badge/AI-Ollama-black?logo=ollama&logoColor=white) [![Release](https://img.shields.io/github/v/release/9t29zhmwdh-coder/MailLoom?color=3F8E7E)](https://github.com/9t29zhmwdh-coder/MailLoom/releases) [![License](https://img.shields.io/github/license/9t29zhmwdh-coder/MailLoom?color=lightgrey)](LICENSE)

> **How it runs:** MailLoom is a native desktop app, not a server or browser tool. It opens as its own window and has no tray icon or background service; it only syncs and classifies while the window is open.

![MailLoom](docs/screenshot.png)

<sub>Screenshot with invented demo data. The senders and subjects are made up; no real mailbox is shown.</sub>

---

> 💾 [**Download for macOS**](https://github.com/9t29zhmwdh-coder/MailLoom/releases/latest/download/MailLoom.dmg) (DMG, always the latest release): not code-signed/notarized, so macOS Gatekeeper will show an "unidentified developer" warning on first run (right-click → Open to bypass). Or build from source, see Getting Started below. Windows/Linux are not built: MailLoom uses the macOS Keychain and is only tested on macOS.

---

> 🌱 New here? → [Step-by-step guide for beginners](GETTING_STARTED.md)

---

**Sorts your inbox by what each mail actually is, and shows you every decision before it acts.**

Mail rules match a sender or a word in the subject. That covers newsletters
and nothing else, because an invoice, a delivery notice and a phishing attempt
do not announce themselves in the header. So the rules stay half-written and
the inbox stays a pile.

MailLoom reads each mail and sorts it into one of 16 categories: invoice,
package, phishing, work, newsletter and the rest. Every suggestion is yours to
confirm or correct, and nothing is moved or deleted until you say so.

**You choose which model reads your mail.** A local Ollama model is the
default, and with it no email content leaves the machine. Anthropic's Claude
is available if you prefer it, and then sender, subject and the first 800
characters of each classified mail are sent to their API. The choice is a
setting, not a build option, and [PRIVACY.md](PRIVACY.md) spells out what each
one sends.

Quick login for iCloud, Gmail and Fastmail (app password) and for Microsoft 365
and Outlook.com (Microsoft sign-in in the browser; Microsoft no longer accepts
passwords for IMAP), with no manual server setup. Mail is stored locally in
SQLite; passwords, Microsoft sign-in tokens and the API key live in the macOS
Keychain.

**Not for you if** your mail already sorts itself. If sender rules cover your
inbox, they are faster and need no model at all. This is for the inbox where
what matters is what the mail *is*, not who sent it.

## Features

| | Feature | Status |
|---|---|---|
| **Sync** | iCloud, Gmail, Fastmail, any IMAP (app password); Microsoft 365 and Outlook.com via Microsoft sign-in (OAuth2 device code, `XOAUTH2`) | Done |
| **Categorization** | 16 categories: Newsletter, Invoice, Package, Work, Phishing... | Done |
| **AI Review** | Confirm or correct every AI decision before it takes effect | Done |
| **Folder Browser** | View all IMAP folders, get AI reorganization suggestions | Done |
| **Delete emails** | Moves the mail to the server's trash; inside the trash, or on servers without one, removes exactly this mail (`UID EXPUNGE`), never other mails marked as deleted. The app says which of these happened | Done |
| **Dashboard** | Stats, category distribution, per-account sync | Done |
| **Search** | Full-text across all synced emails | Done |
| **Multi-Account** | Multiple IMAP accounts in one view | Done |
| **Keychain** | Passwords and Microsoft refresh tokens stored in the macOS Keychain only | Done |
| **Rules** | Rules by category, sender, subject or body, queued as proposals | Done |
| **IMAP actions** | Actually move emails on the server after confirmation | Done |

---

## Requirements

- [Rust](https://rustup.rs/) 1.96+
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI v2](https://tauri.app/): `cargo install tauri-cli`
- An [Anthropic API key](https://console.anthropic.com/) for email classification
- macOS 13+ (Apple Silicon and Intel, universal binary)

---

## Quick Start

```bash
git clone https://github.com/9t29zhmwdh-coder/MailLoom
cd MailLoom
cd frontend && npm install && cd ..
SQLX_OFFLINE=true cargo tauri dev
```

On first launch, open **Settings**, paste your Anthropic API key (stored in the macOS Keychain, not on disk), and add an IMAP account. Click **Sync** on the Dashboard, then **Classify with AI**.

---

## Uninstall / Cleanup

- Delete the app bundle
- Remove the local database: `~/Library/Application Support/com.raystudio.mailloom/`
- Remove the stored API key and IMAP credentials from Keychain Access.app (search for "claude-api-key" and your account labels)

No other files or background services are left behind.

---

## AI Backend

You choose which model classifies your email, and that choice decides whether any email content leaves your device.

| Setting | Runs on | What leaves the device |
|---|---|---|
| `ollama` (default) | your own [Ollama](https://ollama.com) instance, by default `localhost:11434` | nothing |
| `claude` | [Anthropic's API](https://www.anthropic.com/claude), with your own key | sender, subject and the first 800 characters of the body, per classified email |

The local path needs a running Ollama with a model pulled, `qwen3.5:4b` by default. The cloud path needs an API key in the Keychain; without one, classification reports an error instead of quietly switching to the local model, so the two never substitute for each other unnoticed.

Cloud models: `claude-haiku-4-5` by default, configurable to `claude-sonnet-4-6` or `claude-opus-4-8`.

**Before enabling the cloud path**, note that the content sent belongs to the people who wrote to you, and they did not agree to it. If your mail falls under the Swiss FADP, the GDPR, professional confidentiality or an employment contract, check whether forwarding it to a third party is permitted.

---

## Privacy

Emails and sync state are stored locally in SQLite. With the default local model no third party sees your mail at all; with the cloud model, classification requests reach Anthropic and nothing else does. IMAP passwords and the API key are stored in the macOS Keychain and never written to disk in plain text. See [PRIVACY.md](PRIVACY.md) for what exactly is transmitted.

---

## Architecture

```
MailLoom/
├── crates/mp-core/      Rust: IMAP client, classifier, DB, Claude API backend
├── crates/mp-cli/       CLI binary
├── src-tauri/           Tauri v2 backend + IPC commands
└── frontend/            React + TypeScript + Tailwind + Recharts
```

---

**Author:** [Rafael Yilmaz](https://github.com/9t29zhmwdh-coder) · **Status:** Active · ![version](https://img.shields.io/github/v/release/9t29zhmwdh-coder/MailLoom?color=6b7280&style=flat-square)
