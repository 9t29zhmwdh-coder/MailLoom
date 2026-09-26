<div align="center">
  <img src="RayStudio.png" alt="MailLoom" width="120"/>
  <h1>MailLoom</h1>

</div>

<p>Sortiert dein Postfach danach, was eine Mail tatsächlich ist, und zeigt dir jede Entscheidung, bevor sie greift</p>

[🇬🇧 English Version](README.md)

[![CI](https://github.com/9t29zhmwdh-coder/MailLoom/actions/workflows/ci.yml/badge.svg)](https://github.com/9t29zhmwdh-coder/MailLoom/actions) [![CodeQL](https://github.com/9t29zhmwdh-coder/MailLoom/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/9t29zhmwdh-coder/MailLoom/security/code-scanning) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/9t29zhmwdh-coder/MailLoom/badge)](https://securityscorecards.dev/viewer/?uri=github.com/9t29zhmwdh-coder/MailLoom) [![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13696/badge)](https://www.bestpractices.dev/projects/13696)

![Rust](https://img.shields.io/badge/Rust-1.96+-CE422B?logo=rust&logoColor=white) ![Tauri](https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&logoColor=white) ![Plattform](https://img.shields.io/badge/Plattform-macOS-lightgrey) ![AI | Claude](https://img.shields.io/badge/AI-Claude-black?logo=anthropic&logoColor=white) ![AI | Claude Code](https://img.shields.io/badge/AI-Claude_Code-black?logo=anthropic&logoColor=white) ![AI | Copilot](https://img.shields.io/badge/AI-Copilot-black?logo=github&logoColor=white) ![AI | Ollama](https://img.shields.io/badge/AI-Ollama-black?logo=ollama&logoColor=white) [![Release](https://img.shields.io/github/v/release/9t29zhmwdh-coder/MailLoom?color=3F8E7E)](https://github.com/9t29zhmwdh-coder/MailLoom/releases) [![License](https://img.shields.io/github/license/9t29zhmwdh-coder/MailLoom?color=lightgrey)](LICENSE)

> **So läuft es:** MailLoom ist eine native Desktop-App, kein Server oder Browser-Tool. Sie öffnet sich als eigenes Fenster, ohne Tray-Icon oder Hintergrunddienst; sie synchronisiert und klassifiziert nur, während das Fenster geöffnet ist.

![MailLoom](docs/screenshot.de.png)

<sub>Screenshot mit erfundenen Demodaten. Absender und Betreffzeilen sind ausgedacht, es ist kein echtes Postfach zu sehen.</sub>

---

> 💾 [**Für macOS herunterladen**](https://github.com/9t29zhmwdh-coder/MailLoom/releases/latest/download/MailLoom.dmg) (DMG, immer das neueste Release): nicht signiert/notarisiert, macOS Gatekeeper zeigt beim ersten Start eine "nicht verifizierter Entwickler"-Warnung (Rechtsklick → Öffnen, um das zu umgehen). Oder selbst aus dem Quellcode bauen, siehe Erste Schritte unten. Windows/Linux werden nicht gebaut: MailLoom nutzt den macOS-Schlüsselbund und wird nur auf macOS getestet.

---

> 🌱 Neu hier? → [Schritt-für-Schritt-Anleitung für Einsteiger](GETTING_STARTED.md)

---

**Sortiert dein Postfach danach, was eine Mail tatsächlich ist, und zeigt dir jede Entscheidung, bevor sie greift.**

Mail-Regeln treffen auf einen Absender oder ein Wort im Betreff. Damit sind
Newsletter abgedeckt und sonst nichts, denn eine Rechnung, eine
Versandbestätigung und ein Phishing-Versuch kündigen sich im Header nicht an.
Also bleiben die Regeln halbfertig und das Postfach ein Haufen.

MailLoom liest jede Mail und ordnet sie in eine von 16 Kategorien ein:
Rechnung, Paket, Phishing, Arbeit, Newsletter und den Rest. Jeden Vorschlag
bestätigst oder korrigierst du, und nichts wird verschoben oder gelöscht,
bevor du es sagst.

**Du entscheidest, welches Modell deine Mail liest.** Ein lokales
Ollama-Modell ist die Voreinstellung, und damit verlässt kein Mailinhalt das
Gerät. Claude von Anthropic steht zur Wahl, wenn du das bevorzugst, dann gehen
Absender, Betreff und die ersten 800 Zeichen jeder klassifizierten Mail an
deren API. Die Wahl ist eine Einstellung, keine Build-Option, und
[PRIVACY.md](PRIVACY.md) schreibt aus, was jeweils übertragen wird.

Schnell-Login für iCloud, Gmail und Fastmail (App-Passwort) sowie für
Microsoft 365 und Outlook.com (Microsoft-Anmeldung im Browser; Microsoft nimmt
für IMAP keine Passwörter mehr an), ohne manuelle Servereinstellungen. Mails
liegen lokal in SQLite; Passwörter, Microsoft-Anmeldetokens und der API-Key im
macOS-Schlüsselbund.

**Nichts für dich, wenn** sich deine Mail schon selbst sortiert. Wenn
Absenderregeln dein Postfach abdecken, sind die schneller und brauchen gar kein
Modell. Das hier ist für das Postfach, in dem zählt, *was* eine Mail ist, nicht
wer sie geschickt hat.

## Funktionen

| | Funktion | Status |
|---|---|---|
| **Sync** | iCloud, Gmail, Fastmail, beliebiger IMAP (App-Passwort); Microsoft 365 und Outlook.com per Microsoft-Anmeldung (OAuth2-Device-Code, `XOAUTH2`) | Fertig |
| **Kategorisierung** | 16 Kategorien: Newsletter, Rechnung, Paket, Arbeit, Phishing... | Fertig |
| **KI-Review** | Jede KI-Entscheidung prüfen und korrigieren, bevor sie gilt | Fertig |
| **Ordner-Browser** | Alle IMAP-Ordner anzeigen, KI-Reorganisationsvorschläge | Fertig |
| **E-Mails löschen** | Verschiebt die Mail in den Papierkorb des Servers; im Papierkorb selbst oder auf Servern ohne Papierkorb wird genau diese Mail entfernt (`UID EXPUNGE`), nie andere als gelöscht markierte. Die App sagt, was davon passiert ist | Fertig |
| **Dashboard** | Stats, Kategorienverteilung, Sync pro Konto | Fertig |
| **Suche** | Volltextsuche über alle synchronisierten E-Mails | Fertig |
| **Multi-Account** | Mehrere IMAP-Konten in einem Dashboard | Fertig |
| **Keychain** | Passwörter und Microsoft-Refresh-Tokens nur im macOS-Schlüsselbund | Fertig |
| **Regeln** | Regeln nach Kategorie, Absender, Betreff oder Text, als Vorschlag angelegt | Fertig |
| **IMAP-Aktionen** | Tatsächliches Verschieben auf dem Server nach Bestätigung | Fertig |

---

## Voraussetzungen

- [Rust](https://rustup.rs/) 1.96+
- [Node.js](https://nodejs.org/) 20+
- [Tauri CLI v2](https://tauri.app/): `cargo install tauri-cli`
- Ein [Anthropic API-Key](https://console.anthropic.com/) für die E-Mail-Klassifizierung
- macOS 13+ (Apple Silicon und Intel, Universal Binary)

---

## Schnellstart

```bash
git clone https://github.com/9t29zhmwdh-coder/MailLoom
cd MailLoom
cd frontend && npm install && cd ..
SQLX_OFFLINE=true cargo tauri dev
```

Beim ersten Start: **Einstellungen** öffnen, Anthropic API-Key einfügen (wird im macOS-Schlüsselbund gespeichert, nicht auf der Festplatte), IMAP-Konto hinzufügen. Auf dem Dashboard **Sync** klicken, dann **KI klassifizieren**.

---

## Deinstallation / Aufräumen

- App-Bundle löschen
- Lokale Datenbank entfernen: `~/Library/Application Support/com.raystudio.mailloom/`
- Gespeicherten API-Key und IMAP-Zugangsdaten aus der Schlüsselbundverwaltung.app entfernen (suche nach "claude-api-key" und deinen Konto-Bezeichnungen)

Es bleiben keine weiteren Dateien oder Hintergrunddienste zurück.

---

## KI-Backend

MailLoom nutzt [Claude](https://www.anthropic.com/claude) (Anthropic API) für E-Mail-Klassifizierung, Zusammenfassungen und Antwortvorschläge. Das erfordert einen eigenen Anthropic API-Key und eine Internetverbindung; E-Mail-Inhalte für die Klassifizierung verlassen dein Gerät und werden von der Anthropic API verarbeitet.

Standardmodell: `claude-haiku-4-5` (schnell, günstig), in den Einstellungen umstellbar auf `claude-sonnet-4-6` oder `claude-opus-4-8`.

---

## Datenschutz

E-Mails und Sync-Status werden lokal in SQLite gespeichert. Mit dem lokalen Standardmodell sieht kein Dritter deine Mails; mit dem Cloud-Modell erreichen Klassifizierungsanfragen Anthropic und sonst niemanden. IMAP-Passwörter, Microsoft-Anmeldetokens und der Anthropic-API-Key liegen im macOS-Schlüsselbund und werden nie im Klartext auf die Festplatte geschrieben.

---

## Architektur

```
MailLoom/
├── crates/mp-core/      Rust: IMAP-Client, Klassifizierung, DB, Claude-API-Backend
├── crates/mp-cli/       CLI-Binary
├── src-tauri/           Tauri v2 Backend + IPC-Commands
└── frontend/            React + TypeScript + Tailwind + Recharts
```

---

**Autor:** [Rafael Yilmaz](https://github.com/9t29zhmwdh-coder) · **Status:** Aktiv · ![version](https://img.shields.io/github/v/release/9t29zhmwdh-coder/MailLoom?color=6b7280&style=flat-square)
