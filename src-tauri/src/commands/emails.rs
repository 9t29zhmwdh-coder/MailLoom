use mp_core::{
    db::queries,
    models::email_entry::EmailEntry,
    search::{search, SearchQuery},
};
use tauri::State;
use crate::{error::MpResult, state::AppState};

#[tauri::command]
pub async fn list_emails(
    state: State<'_, AppState>,
    account_id: Option<String>,
    category: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> MpResult<Vec<EmailEntry>> {
    queries::list_emails(
        &state.pool,
        account_id.as_deref(),
        category.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn get_email(state: State<'_, AppState>, id: String) -> MpResult<Option<EmailEntry>> {
    queries::get_email(&state.pool, &id).await.map_err(Into::into)
}

#[tauri::command]
pub async fn search_emails(
    state: State<'_, AppState>,
    query: String,
    limit: Option<u32>,
) -> MpResult<Vec<EmailEntry>> {
    let q = SearchQuery {
        text: query,
        limit: limit.unwrap_or(50),
        ..Default::default()
    };
    search(&state.pool, &q).await.map_err(Into::into)
}

#[tauri::command]
pub async fn mark_read(state: State<'_, AppState>, id: String, read: bool) -> MpResult<()> {
    sqlx::query!("UPDATE emails SET is_read = ? WHERE id = ?", read, id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn mark_flagged(state: State<'_, AppState>, id: String, flagged: bool) -> MpResult<()> {
    sqlx::query!("UPDATE emails SET is_flagged = ? WHERE id = ?", flagged, id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_email(state: State<'_, AppState>, id: String) -> MpResult<mp_core::imap_client::DeleteOutcome> {
    let row = sqlx::query!(
        "SELECT account_id, uid, mailbox FROM emails WHERE id = ?", id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| crate::error::MpError::Other("E-Mail nicht gefunden".to_string()))?;

    // The server comes first: errors used to be dropped, so a mail vanished from
    // the app while it stayed on the server.
    let account = queries::list_accounts(&state.pool).await?
        .into_iter()
        .find(|a| a.id == row.account_id)
        .ok_or_else(|| crate::error::MpError::Other("Account not found".to_string()))?;
    let credential = crate::credentials::for_account(&row.account_id).await?;
    let uid = row.uid as u32;
    let mailbox = row.mailbox.clone();
    let outcome = tokio::task::spawn_blocking(move || {
        mp_core::imap_client::delete_email_imap(&account, &credential, &mailbox, uid)
    })
    .await
    .map_err(|e| crate::error::MpError::Other(e.to_string()))?
    .map_err(|e| crate::error::MpError::Other(e.to_string()))?;

    sqlx::query!("DELETE FROM emails WHERE id = ?", id)
        .execute(&state.pool)
        .await?;
    Ok(outcome)
}

#[tauri::command]
pub async fn update_category(state: State<'_, AppState>, id: String, category: String) -> MpResult<()> {
    // Bestehende Klassifizierung lesen, Kategorie überschreiben und zurückschreiben
    let row = sqlx::query!("SELECT classification_json FROM emails WHERE id = ?", id)
        .fetch_optional(&state.pool)
        .await?;
    let existing_json = row.and_then(|r| r.classification_json).unwrap_or_else(|| "{}".to_string());
    let mut cls: serde_json::Value = serde_json::from_str(&existing_json).unwrap_or(serde_json::json!({}));
    cls["category"] = serde_json::Value::String(category);
    cls["classified_by"] = serde_json::Value::String("user".to_string());
    let updated = serde_json::to_string(&cls).map_err(|e| crate::error::MpError::Other(e.to_string()))?;
    sqlx::query!("UPDATE emails SET classification_json = ? WHERE id = ?", updated, id)
        .execute(&state.pool)
        .await?;
    Ok(())
}
