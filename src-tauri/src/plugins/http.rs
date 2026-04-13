use std::time::Duration;

use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestParams {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub body: String,
}

fn default_method() -> String {
    "GET".to_string()
}

#[tauri::command]
pub async fn http_request(params: HttpRequestParams) -> Result<HttpResponsePayload, String> {
    let method = Method::from_bytes(params.method.trim().as_bytes())
        .map_err(|error| format!("invalid http method '{}': {error}", params.method))?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("failed to build http client: {error}"))?;

    let mut request = client.request(method, &params.url);
    for (key, value) in params.headers {
        request = request.header(&key, &value);
    }

    if let Some(body) = params.body {
        request = request.body(body);
    }

    let response = request
        .send()
        .await
        .map_err(|error| format!("request failed: {error}"))?;

    let status = response.status().as_u16();
    let body = response
        .text()
        .await
        .map_err(|error| format!("failed to read response body: {error}"))?;

    Ok(HttpResponsePayload { status, body })
}
