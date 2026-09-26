use mp_core::{
    ai::{backend_from_settings, AiBackend},
    classifier::ClassifierEngine,
    db::queries,
    imap_client::account_manager,
};
use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use crate::{error::MpResult, state::AppState};

/// API-Key für Claude: zuerst System-Keychain (Konto "claude-api-key"),
/// dann die Umgebungsvariable ANTHROPIC_API_KEY (praktisch für Testläufe).
fn claude_api_key() -> Option<String> {
    account_manager::get_password("claude-api-key")
        .ok()
        .filter(|k| !k.is_empty())
        .or_else(|| std::env::var("ANTHROPIC_API_KEY").ok())
        .filter(|k| !k.is_empty())
}

/// Baut das in den Einstellungen gewaehlte Backend.
///
/// Schlaegt fehl statt auszuweichen: waere die Cloud gewaehlt und kein
/// Schluessel hinterlegt, wuerde ein stiller Wechsel auf das lokale Modell die
/// Wahl des Nutzers ueberstimmen, und umgekehrt duerfte ein fehlendes lokales
/// Modell niemals dazu fuehren, dass E-Mail-Inhalte doch an einen Cloud-Dienst
/// gehen.
fn build_backend(settings: &mp_core::models::account::AppSettings) -> MpResult<Box<dyn AiBackend>> {
    backend_from_settings(
        &settings.ai_backend,
        &settings.ollama_url,
        &settings.text_model,
        claude_api_key().as_deref(),
        &settings.claude_model,
    )
    .ok_or_else(|| {
        crate::error::MpError::Other(
            "Cloud-Backend gewaehlt, aber kein API-Key hinterlegt (Schluesselbund 'claude-api-key' oder ANTHROPIC_API_KEY). \
             Key eintragen oder in den Einstellungen auf das lokale Modell wechseln."
                .to_string(),
        )
    })
}

#[tauri::command]
pub async fn classify_email(state: State<'_, AppState>, email_id: String) -> MpResult<()> {
    let settings = state.settings.read().await.clone();
    let email = queries::get_email(&state.pool, &email_id)
        .await?
        .ok_or_else(|| crate::error::MpError::Other("Email not found".to_string()))?;

    let ai = build_backend(&settings)?;
    let engine = ClassifierEngine::new(Some(ai));
    let cls = engine.classify(&email).await;

    queries::update_classification(&state.pool, &email_id, &cls).await?;
    Ok(())
}

#[tauri::command]
pub async fn classify_batch(
    state: State<'_, AppState>,
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> MpResult<u32> {
    let settings = state.settings.read().await.clone();
    let pool = state.pool.clone();
    let app_clone = app.clone();

    // Backend einmal vorab pruefen, damit ein fehlender Schluessel sofort gemeldet
    // wird und nicht erst mitten im Hintergrundlauf pro E-Mail.
    let _ = build_backend(&settings)?;
    let lim = limit.unwrap_or(200) as i64;
    let emails = sqlx::query!(
        r#"SELECT id AS "id!" FROM emails WHERE classification_json IS NULL ORDER BY date_ts DESC LIMIT ?"#,
        lim
    )
    .fetch_all(&pool)
    .await?;

    let total = emails.len() as u32;
    let choice = settings.ai_backend.clone();
    let ollama_url = settings.ollama_url.clone();
    let text_model = settings.text_model.clone();
    let claude_model = settings.claude_model.clone();
    let key = claude_api_key();

    tokio::spawn(async move {
        let mut done = 0u32;
        for row in emails {
            if let Ok(Some(email)) = queries::get_email(&pool, &row.id).await {
                let Some(ai) = mp_core::ai::backend_from_settings(
                    &choice, &ollama_url, &text_model, key.as_deref(), &claude_model,
                ) else { break };
                let engine = ClassifierEngine::new(Some(ai));
                let cls = engine.classify(&email).await;
                let _ = queries::update_classification(&pool, &row.id, &cls).await;
                done += 1;
                let _ = app_clone.emit("classify://progress", serde_json::json!({
                    "done": done,
                    "total": total,
                    "email_id": row.id,
                }));
            }
        }
        let _ = app_clone.emit("classify://done", done);
    });

    Ok(total)
}

/// Prueft, ob das Cloud-LLM-Backend (Claude) erreichbar ist. IPC-Name bleibt aus
/// Kompatibilitaetsgruenden `check_ollama`, testet aber das Claude-Backend.
#[tauri::command]
pub async fn check_ollama(state: State<'_, AppState>) -> MpResult<bool> {
    let settings = state.settings.read().await.clone();
    // Prueft das tatsaechlich gewaehlte Backend. Der Name stammt aus der Zeit,
    // als nur Ollama vorgesehen war; die Funktion sprach danach ausschliesslich
    // den Cloud-Dienst an und meldete dessen Erreichbarkeit als "Ollama laeuft".
    match build_backend(&settings) {
        Ok(backend) => Ok(backend.is_available().await),
        Err(_) => Ok(false),
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct FolderSuggestion {
    pub action: String,
    pub folder: String,
    pub target: Option<String>,
    pub reason: String,
}

#[tauri::command]
pub async fn suggest_folder_reorganization(
    state: State<'_, AppState>,
    account_id: String,
) -> MpResult<Vec<FolderSuggestion>> {
    let settings = state.settings.read().await.clone();

    let accounts = queries::list_accounts(&state.pool).await?;
    let account = accounts.into_iter().find(|a| a.id == account_id)
        .ok_or_else(|| crate::error::MpError::Other("Account nicht gefunden".to_string()))?;
    let credential = crate::credentials::for_account(&account_id).await?;

    let folders: Vec<String> = tokio::task::spawn_blocking(move || {
        mp_core::imap_client::list_mailboxes(&account, &credential)
            .unwrap_or_default()
    })
    .await
    .unwrap_or_default();

    let category_stats: Vec<(String, i64)> = sqlx::query!(
        r#"SELECT
             CAST(json_extract(classification_json, '$.category') AS TEXT) AS "cat: String",
             COUNT(*) AS "cnt!: i64"
           FROM emails
           WHERE account_id = ? AND classification_json IS NOT NULL
           GROUP BY json_extract(classification_json, '$.category')
           ORDER BY COUNT(*) DESC"#,
        account_id
    )
    .fetch_all(&state.pool)
    .await?
    .into_iter()
    .filter_map(|r| Some((r.cat?, r.cnt)))
    .collect();

    let folder_list = folders.join(", ");
    let cat_list = category_stats.iter()
        .map(|(c, n)| format!("{}: {} E-Mails", c, n))
        .collect::<Vec<_>>()
        .join(", ");

    let prompt = format!(
        "Du bist ein E-Mail-Organisationsexperte. Analysiere diese IMAP-Ordnerstruktur und die E-Mail-Kategorienverteilung und schlage Reorganisationsaktionen vor.\n\nAktuelle Ordner: {}\n\nE-Mail-Kategorien: {}\n\nAntworte mit einem JSON-Array mit Objekten: {{\"action\": \"merge|rename|create|delete\", \"folder\": \"Ordnername\", \"target\": \"Zielordner oder null\", \"reason\": \"Erklärung\"}}.\nNur sinnvolle Aktionen, maximal 8 Vorschläge. Nur JSON, kein Text darum.",
        if folder_list.is_empty() { "Keine Ordner gefunden".to_string() } else { folder_list },
        if cat_list.is_empty() { "Keine klassifizierten E-Mails".to_string() } else { cat_list }
    );

    let backend = build_backend(&settings)?;
    let response = backend.summarize(&prompt).await
        .map_err(|e| crate::error::MpError::Other(e.to_string()))?;

    let clean = response.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let suggestions: Vec<FolderSuggestion> = serde_json::from_str(clean)
        .unwrap_or_default();

    Ok(suggestions)
}

#[tauri::command]
pub async fn generate_summary(state: State<'_, AppState>, email_id: String) -> MpResult<String> {
    let settings = state.settings.read().await.clone();
    let email = queries::get_email(&state.pool, &email_id)
        .await?
        .ok_or_else(|| crate::error::MpError::Other("Email not found".to_string()))?;

    let backend = build_backend(&settings)?;
    let body = email.body_text.as_deref().unwrap_or(&email.subject);
    backend.summarize(body).await.map_err(Into::into)
}
