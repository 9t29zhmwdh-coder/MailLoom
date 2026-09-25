use mp_core::{
    db::queries,
    imap_client::account_manager,
    models::account::EmailAccount,
};
use tauri::{Emitter, State};
use crate::{error::MpResult, state::AppState};

#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> MpResult<Vec<EmailAccount>> {
    queries::list_accounts(&state.pool).await.map_err(Into::into)
}

#[tauri::command]
pub async fn add_account(
    state: State<'_, AppState>,
    account: EmailAccount,
    password: String,
) -> MpResult<EmailAccount> {
    account_manager::store_password(&account.id, &password)
        .map_err(|e| crate::error::MpError::Keyring(e.to_string()))?;
    queries::upsert_account(&state.pool, &account).await?;
    Ok(account)
}

#[tauri::command]
pub async fn update_account(
    state: State<'_, AppState>,
    account: EmailAccount,
) -> MpResult<()> {
    queries::upsert_account(&state.pool, &account).await.map_err(Into::into)
}

#[tauri::command]
pub async fn delete_account(state: State<'_, AppState>, id: String) -> MpResult<()> {
    let _ = account_manager::delete_password(&id);
    queries::delete_account(&state.pool, &id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn list_mailboxes(
    state: State<'_, AppState>,
    account_id: String,
) -> MpResult<Vec<String>> {
    let accounts = queries::list_accounts(&state.pool).await?;
    let account = accounts.into_iter().find(|a| a.id == account_id)
        .ok_or_else(|| crate::error::MpError::Other("Account nicht gefunden".to_string()))?;
    let credential = crate::credentials::for_account(&account_id).await?;
    tokio::task::spawn_blocking(move || {
        mp_core::imap_client::list_mailboxes(&account, &credential)
            .map_err(|e| crate::error::MpError::Imap(e.to_string()))
    })
    .await
    .map_err(|e| crate::error::MpError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn test_connection(account: EmailAccount, password: String) -> MpResult<Vec<String>> {
    tokio::task::spawn_blocking(move || {
        account_manager::test_connection(&account, &mp_core::oauth::Credential::Password(password))
            .map_err(|e| crate::error::MpError::Imap(e.to_string()))
    })
    .await
    .map_err(|e| crate::error::MpError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn sync_account(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    account_id: String,
) -> MpResult<u32> {
    let pool = state.pool.clone();
    let settings = state.settings.read().await.clone();

    let accounts = queries::list_accounts(&pool).await?;
    let account = accounts.into_iter().find(|a| a.id == account_id)
        .ok_or_else(|| crate::error::MpError::Other("Account not found".to_string()))?;

    let credential = crate::credentials::for_account(&account_id).await?;

    let max = settings.max_emails_per_sync;
    let app_clone = app.clone();

    let count = tokio::task::spawn_blocking(move || {
        mp_core::imap_client::fetch_emails(&account, &credential, "INBOX", max)
            .map_err(|e| crate::error::MpError::Imap(e.to_string()))
    })
    .await
    .map_err(|e| crate::error::MpError::Other(e.to_string()))??;

    let fetched = count.len() as u32;
    for email in &count {
        let _ = queries::insert_email(&pool, email).await;
        let _ = app_clone.emit("sync://progress", &email.id);
    }

    let now = chrono::Utc::now().timestamp();
    sqlx::query!("UPDATE email_accounts SET last_sync = ? WHERE id = ?", now, account_id)
        .execute(&pool)
        .await?;

    let _ = app.emit("sync://done", fetched);
    Ok(fetched)
}

async fn ms_client_id(state: &AppState) -> MpResult<String> {
    let configured = state.settings.read().await.ms_client_id.trim().to_string();
    if !configured.is_empty() {
        return Ok(configured);
    }
    mp_core::oauth::default_client_id().map(str::to_string).ok_or_else(|| {
        crate::error::MpError::Other(
            "No Microsoft app registration configured. Enter its client ID in Settings.".to_string(),
        )
    })
}

/// Step 1 of Microsoft sign-in: a code the person enters at the shown address.
#[tauri::command]
pub async fn microsoft_login_start(state: State<'_, AppState>) -> MpResult<mp_core::oauth::DeviceCode> {
    let client_id = ms_client_id(&state).await?;
    Ok(mp_core::oauth::start_device_login(&client_id).await?)
}

/// Step 2: waits for the confirmation, checks the IMAP sign-in with the new
/// token, then stores the refresh token in the keychain and adds the account.
#[tauri::command]
pub async fn microsoft_login_finish(
    state: State<'_, AppState>,
    account: EmailAccount,
    code: mp_core::oauth::DeviceCode,
) -> MpResult<EmailAccount> {
    let client_id = ms_client_id(&state).await?;
    let tokens = mp_core::oauth::wait_for_login(&client_id, &code).await?;
    let refresh_token = tokens.refresh_token.ok_or_else(|| {
        crate::error::MpError::Other("Microsoft returned no refresh token (offline_access missing)".to_string())
    })?;
    let check = account.clone();
    let credential = mp_core::oauth::Credential::Bearer(tokens.access_token);
    tokio::task::spawn_blocking(move || account_manager::test_connection(&check, &credential))
        .await
        .map_err(|e| crate::error::MpError::Other(e.to_string()))?
        .map_err(|e| crate::error::MpError::Imap(e.to_string()))?;

    let secret = mp_core::oauth::StoredSecret::MicrosoftOAuth { client_id, refresh_token };
    account_manager::store_password(&account.id, &secret.encode())
        .map_err(|e| crate::error::MpError::Keyring(e.to_string()))?;
    queries::upsert_account(&state.pool, &account).await?;
    Ok(account)
}
