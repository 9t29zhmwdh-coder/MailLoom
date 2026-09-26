use anyhow::{Context, Result};
use keyring::Entry;

use crate::models::account::EmailAccount;

const SERVICE: &str = "com.raystudio.mailloom";

/// Opens the keychain entry for one account.
///
/// This talks to the Security framework through `keyring` rather than shelling
/// out to `/usr/bin/security`. The CLI takes the password as a command-line
/// argument, and `security add-generic-password -h` says so itself: "Use of the
/// -p or -w options is insecure." Arguments are readable from the process table,
/// so any process running as the same user could read the password out of `ps`
/// while the call was in flight. Its only alternative is an interactive prompt,
/// which a GUI app cannot use.
fn entry(account_id: &str) -> Result<Entry> {
    Entry::new(SERVICE, account_id).context("Schluesselbund-Eintrag nicht zugreifbar")
}

pub fn store_password(account_id: &str, password: &str) -> Result<()> {
    entry(account_id)?
        .set_password(password)
        .context("Passwort konnte nicht im Schluesselbund gespeichert werden")
}

pub fn get_password(account_id: &str) -> Result<String> {
    entry(account_id)?
        .get_password()
        .with_context(|| format!("Kein Schluesselbund-Eintrag fuer '{}'", account_id))
}

pub fn delete_password(account_id: &str) -> Result<()> {
    match entry(account_id)?.delete_credential() {
        Ok(()) => Ok(()),
        // Deleting an entry that was never stored is the desired end state, not
        // a failure. Treating it as one would break account removal after a
        // failed setup.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e).context("Schluesselbund-Eintrag konnte nicht entfernt werden"),
    }
}

pub fn test_connection(account: &EmailAccount, credential: &crate::oauth::Credential) -> Result<Vec<String>> {
    let mut session = super::connect_tls(account, credential)?;
    let mailboxes: Vec<String> = session
        .list(None, Some("*"))?
        .iter()
        .map(|mb| mb.name().to_string())
        .collect();
    let _ = session.logout();
    Ok(mailboxes)
}
