# 设置密码变量
$KEY_PASSWORD = "yang123456"

# 1. 创建 .tauri 目录
New-Item -ItemType Directory -Force -Path .\.tauri

# 2. 生成密钥（使用密码）
pnpm tauri signer generate -w .\.tauri\noia.key --password $KEY_PASSWORD

# 3. 读取并设置公钥
$PUBKEY = Get-Content .\.tauri\noia.key.pub -Raw
$PUBKEY | gh secret set TAURI_SIGNING_PUBLIC_KEY -R ZDYoung0519/NOIA2

# 4. 读取并设置私钥
$PRIVKEY = Get-Content .\.tauri\noia.key -Raw
$PRIVKEY | gh secret set TAURI_SIGNING_PRIVATE_KEY -R ZDYoung0519/NOIA2

# 5. 设置密码（使用变量）
$KEY_PASSWORD | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R ZDYoung0519/NOIA2

# 6. 验证
gh secret list -R ZDYoung0519/NOIA2

# 7. 查看公钥（保存备用）
Write-Host "Your public key (save this):" -ForegroundColor Yellow
Get-Content .\.tauri\noia.key.pub

Write-Host "`n✅ Setup completed with password: $KEY_PASSWORD" -ForegroundColor Green
Write-Host "⚠️  Remember this password for future updates!" -ForegroundColor Yellow
