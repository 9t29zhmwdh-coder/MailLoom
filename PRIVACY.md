# Privacy Policy: MailLoom

## Summary

MailLoom classifies email with a language model. You choose which one, and that choice decides whether any email content leaves your device.

**Local model (default):** nothing leaves the machine except the IMAP connections you configure.

**Cloud model (opt-in):** the sender, the subject and the first 800 characters of each classified email are sent to Anthropic.

## What I Collect

**Nothing.** MailLoom has no telemetry, no analytics and no crash reporting, and I receive no data from your installation under any setting.

That is a separate question from the one below, which is about the model provider you choose, not about me.

## Which Model Runs, and What It Sees

The setting is `ai_backend` and it defaults to `ollama`.

### Local, `ollama`

Classification runs against an Ollama instance you host, by default at `http://localhost:11434`. Email content never leaves your machine.

### Cloud, `claude`

Classification runs against Anthropic's API at `https://api.anthropic.com`. For every email you classify, MailLoom sends:

- the sender's display name and address
- the subject line
- the first 800 characters of the message body

**These are other people's personal data.** The senders never agreed to it. If you handle email covered by the Swiss FADP, the GDPR, professional confidentiality or an employment contract, check whether you are permitted to forward it to a third party before enabling this. What happens to the data afterwards is governed by Anthropic's own terms, which are not mine to summarise.

Selecting the cloud model requires an API key. Without one, classification reports an error rather than quietly running locally, so the two paths never substitute for each other unnoticed.

## Storage

- Emails and classifications are stored in SQLite in the operating system's application data directory
- IMAP passwords and the API key are stored in the operating system keychain, never written to disk in plaintext
- No cloud sync

## Network Access

MailLoom connects to:

1. The IMAP servers you configure
2. Your Ollama instance, by default `localhost:11434`, when the local model is selected
3. `api.anthropic.com`, only when the cloud model is selected and only for emails you classify
4. `login.microsoftonline.com`, only for Microsoft 365 and Outlook.com accounts: to sign in (device code) and to exchange the stored refresh token for a short-lived access token before each IMAP connection. No mail content is sent there; your password is entered at Microsoft in your browser, never in MailLoom

No other outbound connections are made.

## Data Retention

MailLoom retains nothing beyond what you sync from your IMAP server. Deleting the application removes the local database. Removing an account also removes its keychain entry.

## Corrections to Earlier Versions

Up to and including 1.3.0 this file stated that classification ran locally and that no email content was transmitted to external services. That was wrong. The local backend existed in the source but was never instantiated, so every installation classified through Anthropic's API regardless of any setting. Version 1.4.0 makes the choice real and defaults it to local.

## Contact

Security issues: see [SECURITY.md](SECURITY.md)

**Last updated: 2026-07-30**
