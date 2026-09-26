//! The credential for an account's IMAP connection, from the keychain.
//!
//! Password accounts return their password. Microsoft accounts hold a refresh
//! token; it is exchanged for a fresh access token on every use, and when
//! Microsoft rotates the refresh token the new one replaces the old in the keychain.

use mp_core::{
    imap_client::account_manager,
    oauth::{self, Credential, StoredSecret},
};

use crate::error::{MpError, MpResult};

pub async fn for_account(account_id: &str) -> MpResult<Credential> {
    let raw = account_manager::get_password(account_id)
        .map_err(|e| MpError::Keyring(e.to_string()))?;
    match StoredSecret::decode(&raw) {
        StoredSecret::Password { password } => Ok(Credential::Password(password)),
        StoredSecret::MicrosoftOAuth { client_id, refresh_token } => {
            let tokens = oauth::refresh(&client_id, &refresh_token).await?;
            if let Some(rotated) = tokens.refresh_token.filter(|t| *t != refresh_token) {
                let secret = StoredSecret::MicrosoftOAuth { client_id, refresh_token: rotated };
                account_manager::store_password(account_id, &secret.encode())
                    .map_err(|e| MpError::Keyring(e.to_string()))?;
            }
            Ok(Credential::Bearer(tokens.access_token))
        }
    }
}
