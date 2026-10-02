#Requires -Version 5.1
# 시결 발행 — poems.js를 GitHub에 올려 Netlify 자동 배포
# Grok Bot 없이 바탕화면에서만 동작합니다.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$RepoOwner = 'sigyeol2024'
$RepoName  = 'sigyeol'
$FilePath  = 'poems.js'
$Branch    = 'main'
$ConfigDir = Join-Path $env:LOCALAPPDATA 'SigyeolPublish'
$ConfigFile = Join-Path $ConfigDir 'config.json'

function Get-Config {
    if (-not (Test-Path $ConfigFile)) { return $null }
    return Get-Content -Raw -Encoding UTF8 $ConfigFile | ConvertFrom-Json
}

function Save-Config([string]$Token) {
    if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }
    @{ github_token = $Token } | ConvertTo-Json | Set-Content -Encoding UTF8 $ConfigFile
}

function Invoke-GitHub([string]$Method, [string]$Uri, [string]$Token, $Body = $null) {
    $headers = @{
        Authorization = "Bearer $Token"
        Accept        = 'application/vnd.github+json'
        'User-Agent'  = 'SigyeolPublish'
        'X-GitHub-Api-Version' = '2022-11-28'
    }
    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
    }
    $json = $Body | ConvertTo-Json -Compress
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) -ContentType 'application/json; charset=utf-8'
}

function Ensure-Token($parent) {
    $cfg = Get-Config
    if ($cfg -and $cfg.github_token) { return [string]$cfg.github_token }

    $dlg = New-Object System.Windows.Forms.Form
    $dlg.Text = '시결 발행 — 최초 설정'
    $dlg.Size = New-Object System.Drawing.Size(520, 260)
    $dlg.StartPosition = 'CenterParent'
    $dlg.FormBorderStyle = 'FixedDialog'
    $dlg.MaximizeBox = $false
    $dlg.MinimizeBox = $false

    $lbl = New-Object System.Windows.Forms.Label
    $lbl.Location = New-Object System.Drawing.Point(16, 16)
    $lbl.Size = New-Object System.Drawing.Size(470, 70)
    $lbl.Text = "GitHub Personal Access Token이 필요합니다.`r`nclassic 토큰에서 repo 권한만 켜면 됩니다.`r`n한 번 저장하면 다음부터는 묻지 않습니다."
    $dlg.Controls.Add($lbl)

    $link = New-Object System.Windows.Forms.LinkLabel
    $link.Location = New-Object System.Drawing.Point(16, 90)
    $link.Size = New-Object System.Drawing.Size(470, 20)
    $link.Text = '토큰 만들기 (github.com/settings/tokens)'
    $link.Add_LinkClicked({ Start-Process 'https://github.com/settings/tokens/new?scopes=repo&description=SigyeolPublish' })
    $dlg.Controls.Add($link)

    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Location = New-Object System.Drawing.Point(16, 120)
    $tb.Size = New-Object System.Drawing.Size(470, 24)
    $tb.UseSystemPasswordChar = $true
    $dlg.Controls.Add($tb)

    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = '저장'
    $ok.Location = New-Object System.Drawing.Point(300, 165)
    $ok.Size = New-Object System.Drawing.Size(90, 30)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $dlg.Controls.Add($ok)
    $dlg.AcceptButton = $ok

    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = '취소'
    $cancel.Location = New-Object System.Drawing.Point(396, 165)
    $cancel.Size = New-Object System.Drawing.Size(90, 30)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $dlg.Controls.Add($cancel)
    $dlg.CancelButton = $cancel

    if ($dlg.ShowDialog($parent) -ne [System.Windows.Forms.DialogResult]::OK) { return $null }
    $token = $tb.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($token)) { return $null }
    Save-Config $token
    return $token
}

$form = New-Object System.Windows.Forms.Form
$form.Text = '시결 발행'
$form.Size = New-Object System.Drawing.Size(560, 320)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Location = New-Object System.Drawing.Point(20, 18)
$title.Size = New-Object System.Drawing.Size(500, 28)
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.Text = '시결 · poems.js 발행'
$form.Controls.Add($title)

$hint = New-Object System.Windows.Forms.Label
$hint.Location = New-Object System.Drawing.Point(20, 52)
$hint.Size = New-Object System.Drawing.Size(500, 40)
$hint.Text = "관리자에서 받은 poems.js를 고른 뒤 「올리기」를 누르면`r`nGitHub에 반영되고 Netlify가 자동으로 sigyeol.com을 갱신합니다."
$form.Controls.Add($hint)

$pathBox = New-Object System.Windows.Forms.TextBox
$pathBox.Location = New-Object System.Drawing.Point(20, 105)
$pathBox.Size = New-Object System.Drawing.Size(380, 26)
$pathBox.ReadOnly = $true
$form.Controls.Add($pathBox)

$browse = New-Object System.Windows.Forms.Button
$browse.Text = '파일 선택'
$browse.Location = New-Object System.Drawing.Point(410, 102)
$browse.Size = New-Object System.Drawing.Size(110, 30)
$browse.Add_Click({
    $ofd = New-Object System.Windows.Forms.OpenFileDialog
    $ofd.Filter = 'poems.js|poems.js|JavaScript|*.js|All|*.*'
    $ofd.Title = '발행할 poems.js 선택'
    if ($ofd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $pathBox.Text = $ofd.FileName
        $status.Text = '파일을 골랐습니다. 「올리기」를 누르세요.'
    }
})
$form.Controls.Add($browse)

$status = New-Object System.Windows.Forms.Label
$status.Location = New-Object System.Drawing.Point(20, 150)
$status.Size = New-Object System.Drawing.Size(500, 50)
$status.Text = '대기 중'
$form.Controls.Add($status)

$publish = New-Object System.Windows.Forms.Button
$publish.Text = '올리기'
$publish.Location = New-Object System.Drawing.Point(20, 215)
$publish.Size = New-Object System.Drawing.Size(140, 40)
$publish.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$publish.Add_Click({
    try {
        if ([string]::IsNullOrWhiteSpace($pathBox.Text) -or -not (Test-Path $pathBox.Text)) {
            [System.Windows.Forms.MessageBox]::Show('먼저 poems.js 파일을 선택하세요.', '시결 발행') | Out-Null
            return
        }
        $token = Ensure-Token $form
        if (-not $token) { $status.Text = '토큰 설정이 취소되었습니다.'; return }

        $status.Text = '올리는 중…'
        $form.Refresh()

        $bytes = [System.IO.File]::ReadAllBytes($pathBox.Text)
        $b64 = [Convert]::ToBase64String($bytes)
        $api = "https://api.github.com/repos/$RepoOwner/$RepoName/contents/$FilePath"
        $sha = $null
        try {
            $existing = Invoke-GitHub 'GET' "$api?ref=$Branch" $token
            $sha = $existing.sha
        } catch { }

        $body = @{
            message = ("publish poems.js " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
            content = $b64
            branch  = $Branch
        }
        if ($sha) { $body.sha = $sha }

        $result = Invoke-GitHub 'PUT' $api $token $body
        $commit = $result.commit.html_url
        $status.Text = "완료. 1~2분 뒤 https://sigyeol.com 을 확인하세요.`r`n$commit"
        [System.Windows.Forms.MessageBox]::Show("올렸습니다.`r`n잠시 후 사이트에 반영됩니다.", '시결 발행') | Out-Null
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match '401|Bad credentials|Unauthorized') {
            Remove-Item -Force $ConfigFile -ErrorAction SilentlyContinue
            $msg = "토큰이 잘못되었거나 권한이 없습니다. 다시 실행하면 토큰을 다시 묻습니다.`r`n$msg"
        }
        $status.Text = "실패: $msg"
        [System.Windows.Forms.MessageBox]::Show($msg, '시결 발행 — 오류') | Out-Null
    }
})
$form.Controls.Add($publish)

$openSite = New-Object System.Windows.Forms.Button
$openSite.Text = '사이트 열기'
$openSite.Location = New-Object System.Drawing.Point(175, 215)
$openSite.Size = New-Object System.Drawing.Size(120, 40)
$openSite.Add_Click({ Start-Process 'https://sigyeol.com' })
$form.Controls.Add($openSite)

$openRepo = New-Object System.Windows.Forms.Button
$openRepo.Text = '저장소 열기'
$openRepo.Location = New-Object System.Drawing.Point(310, 215)
$openRepo.Size = New-Object System.Drawing.Size(120, 40)
$openRepo.Add_Click({ Start-Process "https://github.com/$RepoOwner/$RepoName" })
$form.Controls.Add($openRepo)

[void]$form.ShowDialog()
