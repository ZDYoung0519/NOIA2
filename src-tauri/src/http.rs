use serde::{Deserialize, Serialize};


// 定义 HTTP 响应结构体
#[derive(Debug, Serialize, Deserialize)]
pub struct HttpResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

// 定义请求参数结构体（前端传入）
#[derive(Debug, Deserialize)]
pub struct HttpRequestParams {
    url: String,
    method: Option<String>,              // 如 "GET", "POST"，默认 GET
    headers: Option<Vec<(String, String)>>,
    body: Option<String>,                // 请求体字符串
}

#[tauri::command]
pub async fn http_request(params: HttpRequestParams) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();
    let method = params.method.unwrap_or_else(|| "GET".to_string()).to_uppercase();

    // 构建请求
    let mut builder = match method.as_str() {
        "GET" => client.get(&params.url),
        "POST" => client.post(&params.url),
        "PUT" => client.put(&params.url),
        "DELETE" => client.delete(&params.url),
        "PATCH" => client.patch(&params.url),
        "HEAD" => client.head(&params.url),
        _ => return Err(format!("Unsupported HTTP method: {}", method)),
    };

    // 添加请求头
    if let Some(headers) = params.headers {
        for (key, value) in headers {
            builder = builder.header(key, value);
        }
    }

    // 添加请求体（如果有）
    if let Some(body) = params.body {
        builder = builder.body(body.to_owned());
    }

    // 发送请求
    let response = builder.send().await.map_err(|e| e.to_string())?;

    // 提取响应信息
    let status = response.status().as_u16();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, headers, body })
}