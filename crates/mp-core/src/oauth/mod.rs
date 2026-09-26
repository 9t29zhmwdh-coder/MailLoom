//! Microsoft sign-in for IMAP.
//!
//! Exchange Online turned off password (basic) authentication for IMAP in
//! October 2022 and outlook.com in September 2024. The app-password route
//! MailLoom offered for Microsoft 365 could therefore never succeed. This uses
//! the OAuth 2.0 device authorization grant: MailLoom shows a short code, the
//! person confirms it in the browser at microsoft.com, and MailLoom receives a
//! refresh token for the IMAP scope. No password ever reaches the app.

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};

static HTTP: std::sync::LazyLock<reqwest::Client> = std::sync::LazyLock::new(reqwest::Client::new);

const AUTHORITY: &str = "https://login.microsoftonline.com/common/oauth2/v2.0";
pub const IMAP_SCOPE: &str = "https://outlook.office.com/IMAP.AccessAsUser.All offline_access";

/// Client ID baked in at build time (a public identifier of the app
/// registration, not a secret). The settings can override it.
pub fn default_client_id() -> Option<&'static str> {
    option_env!("MAILLOOM_MS_CLIENT_ID").filter(|id| !id.trim().is_empty())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
    error_description: Option<String>,
}

pub async fn start_device_login(client_id: &str) -> Result<DeviceCode> {
    let resp = HTTP
        .post(format!("{AUTHORITY}/devicecode"))
        .form(&[("client_id", client_id), ("scope", IMAP_SCOPE)])
        .send()
        .await
        .context("Microsoft sign-in is not reachable")?;
    if !resp.status().is_success() {
        let err: TokenError = resp.json().await.context("Unexpected answer from Microsoft")?;
        bail!("{}", err.error_description.unwrap_or(err.error));
    }
    Ok(resp.json().await?)
}

/// Waits until the person has confirmed the code in the browser.
pub async fn wait_for_login(client_id: &str, code: &DeviceCode) -> Result<Tokens> {
    let mut interval = code.interval.max(1);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(code.expires_in);
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        let resp = HTTP
            .post(format!("{AUTHORITY}/token"))
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", client_id),
                ("device_code", code.device_code.as_str()),
            ])
            .send()
            .await?;
        if resp.status().is_success() {
            return Ok(resp.json().await?);
        }
        let err: TokenError = resp.json().await.context("Unexpected answer from Microsoft")?;
        match err.error.as_str() {
            "authorization_pending" => {}
            "slow_down" => interval += 5,
            _ => bail!("{}", err.error_description.unwrap_or(err.error)),
        }
    }
    Err(anyhow!("The code expired before it was confirmed. Start the sign-in again."))
}

pub async fn refresh(client_id: &str, refresh_token: &str) -> Result<Tokens> {
    let resp = HTTP
        .post(format!("{AUTHORITY}/token"))
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("refresh_token", refresh_token),
            ("scope", IMAP_SCOPE),
        ])
        .send()
        .await
        .context("Microsoft sign-in is not reachable")?;
    if !resp.status().is_success() {
        let err: TokenError = resp.json().await.context("Unexpected answer from Microsoft")?;
        bail!("Microsoft sign-in expired, please sign in again ({})", err.error_description.unwrap_or(err.error));
    }
    Ok(resp.json().await?)
}

/// What is stored in the keychain for an account.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StoredSecret {
    Password { password: String },
    MicrosoftOAuth { client_id: String, refresh_token: String },
}

/// Accounts stored before OAuth hold the bare password string.
impl StoredSecret {
    pub fn decode(raw: &str) -> Self {
        serde_json::from_str(raw).unwrap_or_else(|_| Self::Password { password: raw.to_string() })
    }

    pub fn encode(&self) -> String {
        match self {
            // Plain passwords stay plain, so older builds can still read them.
            Self::Password { password } => password.clone(),
            other => serde_json::to_string(other).unwrap_or_default(),
        }
    }
}

/// What the IMAP connection authenticates with.
#[derive(Debug, Clone)]
pub enum Credential {
    Password(String),
    /// A fresh access token for `AUTHENTICATE XOAUTH2`.
    Bearer(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_secrets_round_trip_and_old_passwords_still_read() {
        let oauth = StoredSecret::MicrosoftOAuth { client_id: "c".into(), refresh_token: "r".into() };
        assert_eq!(StoredSecret::decode(&oauth.encode()), oauth);
        assert_eq!(StoredSecret::decode("hunter2"), StoredSecret::Password { password: "hunter2".into() });
        assert_eq!(StoredSecret::Password { password: "p".into() }.encode(), "p");
    }
}
