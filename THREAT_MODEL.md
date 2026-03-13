# Security Threat Assessment

This sample prioritizes simplicity. For production use, mitigate residual risks as recommended below:


| Area | Threats | ✅ Mitigations Implemented | ⚠️ Residual Risks for Production Use |
|---|---|---|---|
| **Authentication** | Credential stuffing, token theft, session replay | Cognito User Pool: self-sign-up disabled, strong password policy, `preventUserExistenceErrors`, SRP auth, 1-hour token expiry, token revocation enabled. Client-side: credential storage scanning, in-memory encryption via Web Crypto API, memory cleanup on logout | MFA is OFF — set to `REQUIRED`. Advanced Security not enabled — enable `ENFORCED`. No app-layer rate limiting |
| **Authorization** | Privilege escalation, unauthenticated access, confused deputy | Least-privilege IAM: only `StartWebRTCContact`, `DescribeContact`, `StopContact`, `DisconnectParticipant`. Resources scoped to Connect instance ARN. Unauthenticated identities disabled. Temporary STS credentials only, `serverSideTokenCheck: true` | `DisconnectParticipant` uses `Resource: '*'` (service limitation). No ABAC |
| **Data in Transit** | MITM, TLS downgrade, WebSocket interception | CloudFront `REDIRECT_TO_HTTPS`, HSTS (`max-age=63072000`), TLS 1.2 minimum, S3 bucket policy denies non-TLS. CSP restricts `connect-src` to specific AWS domains. Chime SDK uses SRTP/DTLS | Default CloudFront domain doesn't fully enforce TLS 1.2 — use custom domain + ACM cert. CSP requires `unsafe-inline`/`unsafe-eval` for Connect Chat Widget |
| **Data at Rest** | Unauthorized S3 access, public exposure | SSE-S3 encryption, `BlockPublicAccess.BLOCK_ALL`, CloudFront OAC with SigV4 + `SourceAccount` condition, S3 versioning enabled | Consider SSE-KMS for audit trail. S3 access logging disabled. No Object Lock |
| **Input Validation** | XSS, injection, malformed API responses | `InputSanitizer` for strings, display names, chat messages, file names, IDs (UUID regex). `APIResponseValidator` for all Connect API responses. URL validation (wss/https). Security headers: `nosniff`, `X-Frame-Options: DENY`, `strict-origin-when-cross-origin` | No full HTML sanitizer (e.g., DOMPurify). Client-only validation — no server-side layer |
| **Infrastructure** | Dependency hijacking, CDK misconfiguration | CDK Nag (`AwsSolutionsChecks`), `SecurityAspect` enforces suppression justifications, pinned dependency versions, `package-lock.json` | No WAF on CloudFront. No CloudFront access logging. No automated dependency vulnerability scanning. No geo-restrictions |
