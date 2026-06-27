param(
  [string]$Method = "GET",
  [string]$Path = "/me",
  [string]$Body = "",
  [string]$AuthId = "keycloak-user-1",
  [string]$Email = "user@example.com",
  [string]$Role = "user"
)

# ---------------------------------------------------------------------------
# Manual test helper for the GGI backend.
#
# It does the two things a real client must do on every authenticated call:
#   1. Present a valid OIDC bearer JWT (minted locally here, HS256) in the
#      Authorization header.
#   2. Prove possession with an HMAC request signature + fresh timestamp.
#
# The secrets/issuer/audience below MUST match the server's .env. Override the
# identity with -AuthId / -Email / -Role (e.g. -Role admin).
# ---------------------------------------------------------------------------

$BaseUrl = "http://localhost:3000"

# Must match REQUEST_SIGNATURE_SECRET in .env
$Secret = "dev-request-signing-secret-123456"

# Must match OIDC_* in .env
$OidcSecret = "dev-oidc-mock-signing-secret-change-me"
$Issuer = "https://mock-idp.ggi.local/"
$Audience = "ggi-backend"

function ConvertTo-Base64Url([byte[]]$Bytes) {
  [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

# ---- 1. Mint an OIDC JWT (HS256) ------------------------------------------
$NowUnix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$ExpUnix = $NowUnix + 3600

$HeaderJson = '{"alg":"HS256","typ":"JWT"}'
$PayloadObject = [ordered]@{
  sub   = $AuthId
  email = $Email
  role  = $Role
  iss   = $Issuer
  aud   = $Audience
  iat   = $NowUnix
  nbf   = $NowUnix
  exp   = $ExpUnix
  jti   = [guid]::NewGuid().ToString()
}
$PayloadJson = $PayloadObject | ConvertTo-Json -Compress

$HeaderEncoded = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($HeaderJson))
$PayloadEncoded = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($PayloadJson))
$JwtSigningInput = "$HeaderEncoded.$PayloadEncoded"

$JwtHmac = New-Object System.Security.Cryptography.HMACSHA256
$JwtHmac.Key = [Text.Encoding]::UTF8.GetBytes($OidcSecret)
$JwtSigBytes = $JwtHmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($JwtSigningInput))
$JwtSignature = ConvertTo-Base64Url $JwtSigBytes

$Token = "$JwtSigningInput.$JwtSignature"

# ---- 2. Compute the HMAC request signature --------------------------------
# Normalize JSON body so it matches what the server received (if any).
$NormalizedBody = ""
if ($Body -ne "") {
  $NormalizedBody = ($Body | ConvertFrom-Json | ConvertTo-Json -Compress -Depth 20)
}

$Timestamp = (Get-Date).ToUniversalTime().ToString("o")
$SignaturePayload = "$Method`:$Path`:$Timestamp"

$Hmac = New-Object System.Security.Cryptography.HMACSHA256
$Hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
$HashBytes = $Hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($SignaturePayload))
$Signature = -join ($HashBytes | ForEach-Object { $_.ToString("x2") })

# ---- 3. Send the request --------------------------------------------------
$Headers = @{
  "Authorization"       = "Bearer $Token"
  "x-request-timestamp" = $Timestamp
  "x-request-signature" = $Signature
}

if ($NormalizedBody -eq "") {
  Invoke-RestMethod `
    -Uri "$BaseUrl$Path" `
    -Method $Method `
    -Headers $Headers | ConvertTo-Json -Depth 10
} else {
  Invoke-RestMethod `
    -Uri "$BaseUrl$Path" `
    -Method $Method `
    -ContentType "application/json" `
    -Headers $Headers `
    -Body $NormalizedBody | ConvertTo-Json -Depth 10
}
