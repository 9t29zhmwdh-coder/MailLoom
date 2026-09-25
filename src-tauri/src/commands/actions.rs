use mp_core::{
    db::queries,
    models::action::{ActionKind, ActionStatus, OrganizeAction},
};
use tauri::State;
use crate::{error::MpResult, state::AppState};

#[tauri::command]
pub async fn list_actions(state: State<'_, AppState>) -> MpResult<Vec<OrganizeAction>> {
    queries::list_actions(&state.pool).await.map_err(Into::into)
}

#[tauri::command]
pub async fn propose_actions(state: State<'_, AppState>) -> MpResult<u32> {
    let emails = sqlx::query!(
        r#"SELECT id AS "id!", subject, from_json, classification_json FROM emails WHERE classification_json IS NOT NULL"#
    )
    .fetch_all(&state.pool)
    .await?;

    let existing: std::collections::HashSet<String> = sqlx::query!(
        "SELECT DISTINCT email_id FROM organize_actions"
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.email_id)
    .collect();

    let mut count = 0u32;
    for row in emails {
        if existing.contains(&row.id) { continue; }
        if let Some(cls_json) = row.classification_json {
            if let Ok(cls) = serde_json::from_str::<mp_core::models::classification::Classification>(&cls_json) {
                let folder = cls.category.folder_name().to_string();
                let from_addr = serde_json::from_str::<mp_core::models::email_entry::EmailAddress>(&row.from_json)
                    .map(|a| a.address)
                    .unwrap_or_default();

                let action = OrganizeAction::move_to(
                    &row.id,
                    &row.subject,
                    &from_addr,
                    &folder,
                    &format!("Kategorie: {}", cls.category.display_name()),
                );
                let _ = queries::insert_action(&state.pool, &action).await;
                count += 1;
            }
        }
    }
    Ok(count)
}

/// Carries out one action on the IMAP server and reports what actually happened.
///
/// Until this was implemented the command only wrote `Applied` into the local
/// database, so the app reported success while the message stayed exactly where
/// it was on the server. A failure now ends up as `ActionStatus::Failed` carrying
/// the server's reason, a state the model always had but nothing ever set.
async fn execute_action(state: &AppState, action_id: &str) -> MpResult<ActionStatus> {
    let action_row = sqlx::query!(
        "SELECT email_id, kind_json, target_folder FROM organize_actions WHERE id = ?",
        action_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| crate::error::MpError::Other("Aktion nicht gefunden".to_string()))?;

    let kind: ActionKind = serde_json::from_str(&action_row.kind_json)
        .map_err(|e| crate::error::MpError::Other(format!("Unbekannte Aktionsart: {}", e)))?;

    // Only the folder-changing kinds touch the server. Tags and read state are
    // local concepts in this app, so they stay a database-only change on purpose.
    let target = match kind {
        ActionKind::MoveToFolder | ActionKind::MoveToReview => match action_row.target_folder {
            Some(f) if !f.is_empty() => f,
            _ => return Ok(ActionStatus::Failed("Kein Zielordner gesetzt".to_string())),
        },
        _ => return Ok(ActionStatus::Applied),
    };

    let email = sqlx::query!(
        "SELECT account_id, uid, mailbox FROM emails WHERE id = ?",
        action_row.email_id
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| crate::error::MpError::Other("E-Mail nicht gefunden".to_string()))?;

    // Moving a message into the mailbox it already sits in is a no-op, not a failure.
    if email.mailbox == target {
        return Ok(ActionStatus::Applied);
    }

    let accounts = queries::list_accounts(&state.pool).await?;
    let account = match accounts.into_iter().find(|a| a.id == email.account_id) {
        Some(a) => a,
        None => return Ok(ActionStatus::Failed("Konto nicht mehr vorhanden".to_string())),
    };

    let credential = match crate::credentials::for_account(&email.account_id).await {
        Ok(c) => c,
        Err(e) => return Ok(ActionStatus::Failed(format!("No credential for the account: {e}"))),
    };

    let uid = email.uid as u32;
    let mailbox = email.mailbox.clone();
    let target_for_move = target.clone();

    let result = tokio::task::spawn_blocking(move || {
        mp_core::imap_client::move_email_imap(&account, &credential, &mailbox, uid, &target_for_move)
    })
    .await
    .map_err(|e| crate::error::MpError::Other(format!("Hintergrundaufgabe abgebrochen: {}", e)))?;

    match result {
        Ok(()) => {
            // The server is the source of truth now, so the local row follows it.
            sqlx::query!(
                "UPDATE emails SET mailbox = ? WHERE id = ?",
                target,
                action_row.email_id
            )
            .execute(&state.pool)
            .await?;
            Ok(ActionStatus::Applied)
        }
        Err(e) => Ok(ActionStatus::Failed(e.to_string())),
    }
}

async fn store_status(state: &AppState, action_id: &str, status: &ActionStatus) -> MpResult<()> {
    let json = serde_json::to_string(status)
        .map_err(|e| crate::error::MpError::Other(e.to_string()))?;
    sqlx::query!("UPDATE organize_actions SET status_json = ? WHERE id = ?", json, action_id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn apply_action(state: State<'_, AppState>, action_id: String) -> MpResult<ActionStatus> {
    let status = execute_action(&state, &action_id).await?;
    store_status(&state, &action_id, &status).await?;
    Ok(status)
}

#[derive(Debug, Default, serde::Serialize)]
pub struct ApplyReport {
    pub applied: u32,
    pub failed: u32,
    pub first_error: Option<String>,
}

/// Applies every pending action and reports applied and failed counts separately.
///
/// A single number cannot distinguish "everything moved" from "everything was
/// marked done while the server refused", which is exactly the confusion this
/// rewrite is meant to remove.
#[tauri::command]
pub async fn apply_all_actions(state: State<'_, AppState>) -> MpResult<ApplyReport> {
    let pending = serde_json::to_string(&ActionStatus::Pending)
        .map_err(|e| crate::error::MpError::Other(e.to_string()))?;

    let ids: Vec<String> = sqlx::query!(
        r#"SELECT id AS "id!" FROM organize_actions WHERE status_json = ?"#,
        pending
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .map(|r| r.id)
    .collect();

    let mut report = ApplyReport::default();
    for id in ids {
        let status = match execute_action(&state, &id).await {
            Ok(s) => s,
            Err(e) => ActionStatus::Failed(e.to_string()),
        };
        match &status {
            ActionStatus::Applied => report.applied += 1,
            ActionStatus::Failed(reason) => {
                report.failed += 1;
                report.first_error.get_or_insert_with(|| reason.clone());
            }
            _ => report.failed += 1,
        }
        store_status(&state, &id, &status).await?;
    }
    Ok(report)
}

#[tauri::command]
pub async fn skip_action(state: State<'_, AppState>, action_id: String) -> MpResult<()> {
    let status = serde_json::to_string(&ActionStatus::Skipped).unwrap();
    sqlx::query!("UPDATE organize_actions SET status_json = ? WHERE id = ?", status, action_id)
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn skip_all_actions(state: State<'_, AppState>) -> MpResult<u32> {
    let pending = serde_json::to_string(&ActionStatus::Pending).unwrap();
    let skipped = serde_json::to_string(&ActionStatus::Skipped).unwrap();
    let result = sqlx::query!(
        "UPDATE organize_actions SET status_json = ? WHERE status_json = ?",
        skipped, pending
    )
    .execute(&state.pool)
    .await?;
    Ok(result.rows_affected() as u32)
}
