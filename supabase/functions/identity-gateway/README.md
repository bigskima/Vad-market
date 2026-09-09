# identity-gateway

Single external KYC boundary for VAD.

Routes:
- `POST /functions/v1/identity-gateway` — authenticated start/resume request. The function manually validates the bearer token because the same function also hosts the public Didit webhook route.
- `POST /functions/v1/identity-gateway/webhook` — Didit webhook. Requires a fresh `X-Timestamp` and valid `X-Signature-V2` (preferred) or raw-body `X-Signature` HMAC-SHA256 signature.
- `GET /functions/v1/identity-gateway/health` — configuration-only health response; never exposes secret values.

Required Supabase secrets:
- `DIDIT_API_KEY`
- `DIDIT_WEBHOOK_SECRET`
- `DIDIT_WORKFLOW_ID`

Optional:
- `DIDIT_CALLBACK_URL`

Do not store these values in GitHub or the Expo bundle.
