#![allow(unused_imports)]
pub mod account_manager;

use anyhow::Result;
use imap::Session;
use mailparse::{MailHeaderMap, parse_mail};
use chrono::Utc;
use uuid::Uuid;

use crate::oauth::Credential;
use crate::models::{
    email_entry::{Attachment, EmailAddress, EmailEntry, EmailKind},
    account::EmailAccount,
};

pub type TlsSession = Session<imap::Connection>;

/// `AUTHENTICATE XOAUTH2`: the initial response carries user and access token;
/// the crate base64-encodes it.
struct XOAuth2<'a> {
    user: &'a str,
    token: &'a str,
}

impl imap::Authenticator for XOAuth2<'_> {
    type Response = String;
    fn process(&self, _challenge: &[u8]) -> Self::Response {
        format!("user={}\x01auth=Bearer {}\x01\x01", self.user, self.token)
    }
}

pub fn connect_tls(account: &EmailAccount, credential: &Credential) -> Result<TlsSession> {
    let client = imap::ClientBuilder::new(&account.imap_host, account.imap_port)
        .connect()
        .map_err(|e| anyhow::anyhow!("IMAP connection failed: {}", e))?;
    let session = match credential {
        Credential::Password(password) => client
            .login(&account.username, password)
            .map_err(|e| anyhow::anyhow!("IMAP login failed: {:?}", e.0))?,
        Credential::Bearer(token) => client
            .authenticate("XOAUTH2", &XOAuth2 { user: &account.username, token })
            .map_err(|e| anyhow::anyhow!("IMAP sign-in with Microsoft failed: {:?}", e.0))?,
    };
    Ok(session)
}

pub fn fetch_emails(
    account: &EmailAccount,
    credential: &Credential,
    mailbox: &str,
    max: u32,
) -> Result<Vec<EmailEntry>> {
    let mut session = connect_tls(account, credential)?;
    let mailbox_info = session.select(mailbox)?;
    let exists = mailbox_info.exists;
    if exists == 0 {
        let _ = session.logout();
        return Ok(vec![]);
    }

    let batch = max.min(200);
    let start = if exists > batch { exists - batch + 1 } else { 1 };
    let seq_set = format!("{}:{}", start, exists);
    let messages = session.fetch(&seq_set, "(UID FLAGS BODY.PEEK[])")?;

    let mut entries = Vec::new();
    for msg in messages.iter() {
        if let Some(raw) = msg.body() {
            if let Ok(entry) = parse_email_message(raw, msg.uid.unwrap_or(0), mailbox, &account.id) {
                entries.push(entry);
            }
        }
    }

    let _ = session.logout();
    Ok(entries)
}

pub fn list_mailboxes(account: &EmailAccount, credential: &Credential) -> Result<Vec<String>> {
    let mut session = connect_tls(account, credential)?;
    let mailboxes = session
        .list(None, Some("*"))?
        .iter()
        .map(|mb| mb.name().to_string())
        .collect();
    let _ = session.logout();
    Ok(mailboxes)
}

/// What deleting did, so the app can say it truthfully.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", content = "folder", rename_all = "snake_case")]
pub enum DeleteOutcome {
    /// Moved to the server's trash folder (named here); recoverable.
    MovedToTrash(String),
    /// Removed for good: it was in the trash already, or there is none.
    Removed,
    /// Flagged as deleted only. The server lacks UIDPLUS, and a plain EXPUNGE
    /// would also remove every other message flagged as deleted in the folder.
    FlaggedOnly,
}

/// Folder names mail servers use for the trash when they do not mark it with
/// the special-use attribute (RFC 6154).
const TRASH_NAMES: &[&str] = &[
    "Trash", "Deleted Items", "Deleted Messages", "[Gmail]/Trash", "[Google Mail]/Trash",
    "Papierkorb", "Gelöschte Elemente", "INBOX.Trash",
];

fn trash_mailbox<S: std::io::Read + std::io::Write>(session: &mut Session<S>) -> Option<String> {
    let names = session.list(None, Some("*")).ok()?;
    if let Some(marked) = names.iter().find(|n| n.attributes().iter().any(|a| matches!(a, imap_proto::NameAttribute::Trash))) {
        return Some(marked.name().to_string());
    }
    TRASH_NAMES.iter()
        .find_map(|t| names.iter().find(|n| n.name().eq_ignore_ascii_case(t)))
        .map(|n| n.name().to_string())
}

/// Removes exactly the given message. `EXPUNGE` would remove every message
/// flagged as deleted in the mailbox, including ones the person never chose;
/// `UID EXPUNGE` (UIDPLUS) removes only this one. Without UIDPLUS the message
/// stays flagged and nothing else is touched.
fn expunge_one<S: std::io::Read + std::io::Write>(session: &mut Session<S>, uid: &str) -> Result<bool> {
    session.uid_store(uid, "+FLAGS (\\Deleted)")
        .map_err(|e| anyhow::anyhow!("Flagging as deleted failed: {}", e))?;
    if session.capabilities()?.has_str("UIDPLUS") {
        session.uid_expunge(uid).map_err(|e| anyhow::anyhow!("UID EXPUNGE failed: {}", e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Deletes a message the way a mail app does: into the trash when there is one,
/// for good only inside the trash itself. Before, every delete ran a plain
/// EXPUNGE, which also removed other messages flagged as deleted in the folder.
pub fn delete_email_imap(account: &EmailAccount, credential: &Credential, mailbox: &str, uid: u32) -> Result<DeleteOutcome> {
    let mut session = connect_tls(account, credential)?;
    let outcome = delete_in_session(&mut session, mailbox, uid)?;
    let _ = session.logout();
    Ok(outcome)
}

fn delete_in_session<S: std::io::Read + std::io::Write>(session: &mut Session<S>, mailbox: &str, uid: u32) -> Result<DeleteOutcome> {
    let trash = trash_mailbox(session);
    session.select(mailbox)?;
    let uid_str = uid.to_string();

    let outcome = match trash.filter(|t| !t.eq_ignore_ascii_case(mailbox)) {
        Some(trash) => {
            if session.uid_mv(&uid_str, &trash).is_err() {
                session.uid_copy(&uid_str, &trash)
                    .map_err(|e| anyhow::anyhow!("COPY to {} failed: {}", trash, e))?;
                expunge_one(session, &uid_str)?;
            }
            DeleteOutcome::MovedToTrash(trash)
        }
        None => {
            if expunge_one(session, &uid_str)? { DeleteOutcome::Removed } else { DeleteOutcome::FlaggedOnly }
        }
    };
    Ok(outcome)
}

/// Moves a message to another mailbox on the server, creating the target if needed.
///
/// Prefers the MOVE extension (RFC 6851) and falls back to COPY plus removing
/// exactly this message (`UID EXPUNGE`). Without UIDPLUS the original stays in
/// place flagged as deleted rather than risking other messages.
pub fn move_email_imap(
    account: &EmailAccount,
    credential: &Credential,
    mailbox: &str,
    uid: u32,
    target: &str,
) -> Result<()> {
    let mut session = connect_tls(account, credential)?;
    session.select(mailbox)?;

    // The target folder may not exist yet; CREATE on an existing mailbox is an
    // error on most servers, so a failure here is only fatal if the move fails too.
    let _ = session.create(target);

    let uid_str = uid.to_string();
    let move_result = session.uid_mv(&uid_str, target);

    if move_result.is_err() {
        session
            .uid_copy(&uid_str, target)
            .map_err(|e| anyhow::anyhow!("COPY nach {} fehlgeschlagen: {}", target, e))?;
        expunge_one(&mut session, &uid_str)?;
    }

    let _ = session.logout();
    Ok(())
}

pub fn fetch_since_uid(
    account: &EmailAccount,
    credential: &Credential,
    mailbox: &str,
    since_uid: u32,
    max: u32,
) -> Result<Vec<EmailEntry>> {
    let mut session = connect_tls(account, credential)?;
    session.select(mailbox)?;
    let uid_range = format!("{}:*", since_uid + 1);
    let messages = session.uid_fetch(&uid_range, "(UID FLAGS BODY.PEEK[])")?;

    let mut entries: Vec<EmailEntry> = messages
        .iter()
        // `N:*` always includes the newest message, even when its UID is below N;
        // without this filter every sync fetched the last mail again.
        .filter(|msg| msg.uid.is_some_and(|u| u > since_uid))
        .filter_map(|msg| {
            let body = msg.body()?;
            parse_email_message(body, msg.uid.unwrap_or(0), mailbox, &account.id).ok()
        })
        .take(max as usize)
        .collect();

    entries.sort_by_key(|e| std::cmp::Reverse(e.date));
    let _ = session.logout();
    Ok(entries)
}

fn parse_email_message(raw: &[u8], uid: u32, mailbox: &str, account_id: &str) -> Result<EmailEntry> {
    let parsed = parse_mail(raw)?;

    let subject = parsed.headers.get_first_value("Subject").unwrap_or_default();
    let from_raw = parsed.headers.get_first_value("From").unwrap_or_default();
    let to_raw = parsed.headers.get_first_value("To").unwrap_or_default();
    let cc_raw = parsed.headers.get_first_value("Cc").unwrap_or_default();
    let message_id = parsed.headers.get_first_value("Message-Id").unwrap_or_else(|| Uuid::new_v4().to_string());
    let in_reply_to = parsed.headers.get_first_value("In-Reply-To");
    let date_raw = parsed.headers.get_first_value("Date").unwrap_or_default();

    let date = mailparse::dateparse(&date_raw)
        .map(|t| chrono::DateTime::from_timestamp(t, 0).unwrap_or_else(Utc::now))
        .unwrap_or_else(|_| Utc::now());

    let (body_text, body_html, attachments, kind) = extract_body_parts(&parsed);

    let hash = {
        let mut hasher = blake3::Hasher::new();
        hasher.update(raw);
        Some(hasher.finalize().to_hex().to_string())
    };

    Ok(EmailEntry {
        id: Uuid::new_v4().to_string(),
        account_id: account_id.to_string(),
        message_id: message_id.trim_matches(|c| c == '<' || c == '>').to_string(),
        uid,
        mailbox: mailbox.to_string(),
        subject: decode_header_value(&subject),
        from: parse_address(&from_raw),
        to: parse_addresses(&to_raw),
        cc: parse_addresses(&cc_raw),
        date,
        body_text,
        body_html,
        attachments,
        kind,
        in_reply_to,
        references: vec![],
        is_read: false,
        is_flagged: false,
        size: raw.len() as u64,
        hash,
        thread_id: None,
        classification: None,
        fetched_at: Utc::now(),
    })
}

fn extract_body_parts(
    parsed: &mailparse::ParsedMail<'_>,
) -> (Option<String>, Option<String>, Vec<Attachment>, EmailKind) {
    let mut text = None;
    let mut html = None;
    let mut attachments = Vec::new();

    if parsed.subparts.is_empty() {
        let ct = &parsed.ctype;
        if ct.mimetype == "text/plain" {
            text = parsed.get_body().ok();
        } else if ct.mimetype == "text/html" {
            html = parsed.get_body().ok();
        }
        return (text, html, attachments, EmailKind::Plain);
    }

    for part in &parsed.subparts {
        let ct = &part.ctype;
        let disposition = part.headers.get_first_value("Content-Disposition").unwrap_or_default();

        if disposition.contains("attachment") {
            let filename = ct.params.get("name")
                .or_else(|| ct.params.get("filename"))
                .cloned()
                .unwrap_or_else(|| "attachment".to_string());
            let body = part.get_body_raw().unwrap_or_default();
            attachments.push(Attachment {
                filename,
                mime_type: ct.mimetype.clone(),
                size: body.len() as u64,
                content_id: part.headers.get_first_value("Content-Id"),
            });
            continue;
        }

        match ct.mimetype.as_str() {
            "text/plain" => { text = part.get_body().ok(); }
            "text/html"  => { html = part.get_body().ok(); }
            _ => {}
        }

        if !part.subparts.is_empty() {
            let (sub_text, sub_html, mut sub_att, _) = extract_body_parts(part);
            if text.is_none() { text = sub_text; }
            if html.is_none() { html = sub_html; }
            attachments.append(&mut sub_att);
        }
    }

    let kind = if html.is_some() && text.is_some() {
        EmailKind::Multipart
    } else if html.is_some() {
        EmailKind::Html
    } else {
        EmailKind::Plain
    };

    (text, html, attachments, kind)
}

fn parse_address(raw: &str) -> EmailAddress {
    let raw = raw.trim();
    if let Some(angle_start) = raw.rfind('<') {
        if let Some(angle_end) = raw.rfind('>') {
            let name = raw[..angle_start].trim().trim_matches('"').to_string();
            let addr = raw[angle_start + 1..angle_end].trim().to_string();
            return EmailAddress {
                name: if name.is_empty() { None } else { Some(name) },
                address: addr,
            };
        }
    }
    EmailAddress { name: None, address: raw.to_string() }
}

fn parse_addresses(raw: &str) -> Vec<EmailAddress> {
    raw.split(',').map(|s| parse_address(s.trim())).collect()
}

fn decode_header_value(raw: &str) -> String {
    match mailparse::parse_header(format!("X: {raw}").as_bytes()) {
        Ok((header, _)) => header.get_value(),
        Err(_) => raw.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Haelt fest, was `mailparse` aus einer realistischen Nachricht macht.
    ///
    /// Diese Zerlegung ist das Herz der Anwendung: Betreff, Absender und Datum
    /// landen unveraendert in der Liste, die der Nutzer sieht. Aendert ein
    /// Versionssprung die Dekodierung, stehen dort kaputte Umlaute oder ein
    /// falsches Datum, und nichts davon loest einen Fehler aus.
    const NACHRICHT: &[u8] = b"From: =?UTF-8?Q?Rafael_Gr=C3=BCn?= <rafael@example.ch>\r\n\
To: empfang@example.ch, zweiter@example.ch\r\n\
Subject: =?UTF-8?B?QsO8cm9zY2hsw7xzc2VsIGdlZnVuZGVu?=\r\n\
Date: Tue, 15 Jul 2026 14:30:00 +0200\r\n\
Message-Id: <abc123@example.ch>\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Der Schluessel liegt beim Empfang.\r\n";

    #[test]
    fn kopfzeilen_werden_wie_gehabt_dekodiert() {
        let mail = parse_email_message(NACHRICHT, 42, "INBOX", "konto-1").unwrap();

        assert_eq!(mail.subject, "Büroschlüssel gefunden");
        assert_eq!(mail.from.name.as_deref(), Some("Rafael Grün"));
        assert_eq!(mail.from.address, "rafael@example.ch");
        assert_eq!(mail.to.len(), 2);
        assert_eq!(mail.to[1].address, "zweiter@example.ch");
        assert_eq!(mail.message_id, "abc123@example.ch");
    }

    /// Das Datum kommt ueber `mailparse::dateparse` als Unix-Zeit herein und
    /// wird danach zu UTC. Eine verschobene Zeitzonenbehandlung waere in der
    /// Oberflaeche nur als falsche Sortierung sichtbar.
    #[test]
    fn das_datum_wird_korrekt_nach_utc_gerechnet() {
        let mail = parse_email_message(NACHRICHT, 42, "INBOX", "konto-1").unwrap();
        assert_eq!(mail.date.to_rfc3339(), "2026-07-15T12:30:00+00:00");
    }

    /// Fehlt der Betreff, darf nichts umfallen.
    #[test]
    fn eine_nachricht_ohne_betreff_bleibt_verarbeitbar() {
        let roh = b"From: nur@example.ch\r\nDate: Tue, 15 Jul 2026 14:30:00 +0200\r\n\r\nText\r\n";
        let mail = parse_email_message(roh, 1, "INBOX", "konto-1").unwrap();
        assert_eq!(mail.subject, "");
        assert_eq!(mail.from.address, "nur@example.ch");
    }
}

#[cfg(test)]
mod delete_tests {
    //! A scripted IMAP server that records every command, so the tests can
    //! prove that deleting never sends a bare EXPUNGE (which removes every
    //! message flagged as deleted in the folder, not only the chosen one).
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    struct Server { uidplus: bool, trash: bool, move_ok: bool }

    fn run(server: Server) -> (DeleteOutcome, Vec<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let log = Arc::new(Mutex::new(Vec::new()));
        let log2 = log.clone();
        let handle = std::thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut out = stream.try_clone().unwrap();
            out.write_all(b"* OK fake ready\r\n").unwrap();
            for line in BufReader::new(stream).lines() {
                let line = line.unwrap();
                let mut parts = line.splitn(2, ' ');
                let tag = parts.next().unwrap_or("").to_string();
                let cmd = parts.next().unwrap_or("").to_string();
                log2.lock().unwrap().push(cmd.clone());
                let upper = cmd.to_uppercase();
                let reply = if upper.starts_with("CAPABILITY") {
                    format!("* CAPABILITY IMAP4rev1 MOVE{}\r\n{tag} OK\r\n", if server.uidplus { " UIDPLUS" } else { "" })
                } else if upper.starts_with("LIST") {
                    let trash = if server.trash { "* LIST (\\HasNoChildren \\Trash) \"/\" \"Papierkorb\"\r\n" } else { "" };
                    format!("* LIST (\\HasNoChildren) \"/\" \"INBOX\"\r\n{trash}{tag} OK\r\n")
                } else if upper.starts_with("SELECT") {
                    format!("* 3 EXISTS\r\n* OK [UIDVALIDITY 1] ok\r\n{tag} OK [READ-WRITE] done\r\n")
                } else if upper.starts_with("UID MOVE") && !server.move_ok {
                    format!("{tag} NO move refused\r\n")
                } else if upper.starts_with("UID STORE") {
                    format!("* 1 FETCH (UID 5 FLAGS (\\Deleted))\r\n{tag} OK\r\n")
                } else if upper.starts_with("UID EXPUNGE") || upper.starts_with("EXPUNGE") {
                    format!("* 1 EXPUNGE\r\n{tag} OK\r\n")
                } else if upper.starts_with("LOGOUT") {
                    out.write_all(format!("* BYE\r\n{tag} OK\r\n").as_bytes()).unwrap();
                    break;
                } else {
                    format!("{tag} OK\r\n")
                };
                out.write_all(reply.as_bytes()).unwrap();
            }
        });
        let client = imap::ClientBuilder::new("127.0.0.1", port)
            .mode(imap::ConnectionMode::Plaintext)
            .connect()
            .unwrap();
        let mut session = client.login("user", "pass").map_err(|e| e.0).unwrap();
        let outcome = delete_in_session(&mut session, "INBOX", 5).unwrap();
        let _ = session.logout();
        handle.join().unwrap();
        let commands = log.lock().unwrap().clone();
        (outcome, commands)
    }

    fn no_bare_expunge(commands: &[String]) {
        assert!(!commands.iter().any(|c| c.trim().eq_ignore_ascii_case("EXPUNGE")), "{commands:?}");
    }

    #[test]
    fn delete_moves_into_the_trash() {
        let (outcome, commands) = run(Server { uidplus: true, trash: true, move_ok: true });
        assert_eq!(outcome, DeleteOutcome::MovedToTrash("Papierkorb".into()));
        assert!(commands.iter().any(|c| c.starts_with("UID MOVE 5")), "{commands:?}");
        no_bare_expunge(&commands);
    }

    #[test]
    fn without_move_it_copies_and_expunges_only_this_uid() {
        let (outcome, commands) = run(Server { uidplus: true, trash: true, move_ok: false });
        assert_eq!(outcome, DeleteOutcome::MovedToTrash("Papierkorb".into()));
        assert!(commands.iter().any(|c| c.starts_with("UID COPY 5")), "{commands:?}");
        assert!(commands.iter().any(|c| c.starts_with("UID EXPUNGE 5")), "{commands:?}");
        no_bare_expunge(&commands);
    }

    #[test]
    fn without_trash_it_removes_only_this_uid() {
        let (outcome, commands) = run(Server { uidplus: true, trash: false, move_ok: true });
        assert_eq!(outcome, DeleteOutcome::Removed);
        assert!(commands.iter().any(|c| c.starts_with("UID EXPUNGE 5")), "{commands:?}");
        no_bare_expunge(&commands);
    }

    #[test]
    fn without_uidplus_it_only_flags() {
        let (outcome, commands) = run(Server { uidplus: false, trash: false, move_ok: true });
        assert_eq!(outcome, DeleteOutcome::FlaggedOnly);
        assert!(!commands.iter().any(|c| c.to_uppercase().contains("EXPUNGE")), "{commands:?}");
    }
}
