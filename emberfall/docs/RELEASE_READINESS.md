# Release readiness: version and gaps before Cloudflare

Status as of this document. The project is a **contribution preview, version 0.9.0**
(`package.json`). It is not v1.0 and not production multiplayer; `README.md`,
`HANDOFF.md` and the Makefile say the same.

## Where the version stands

- `package.json` is 0.9.0. The CHANGELOG has no 0.9 entry yet; its newest entry is 0.8.0.
- Local tests pass: unit, API (curl), intake (curl), UI (Playwright), and the browser and multiplayer smokes.
- Deployment is staging-only. `make deploy` refuses anything but `ENV=staging` with a reviewed config.

## Gaps before publishing to Cloudflare

Blocking:
1. **Accounts.** Email and password accounts exist: registration and sign-in are on `/api/account/*`, with accounts stored in D1 (`migrations/0002_accounts.sql`) and HMAC sessions scoped to the account room. The sign-in UI is not built, and the persistent game endpoints still sit behind the staging bearer token.
2. **Real-time chat.** Not built. Shared rooms poll over HTTP. Chat is in progress: the message log is done; the WebSocket on the room's Durable Object, the global lobby object and the chat UI are not.
3. **Infrastructure.** `wrangler.toml` still has `database_id = "REPLACE_WITH_D1_DATABASE_ID"`. The D1 database, the R2 bucket and the migrations have not been created in Cloudflare.
4. **Assets.** Upload works only on the local intake (127.0.0.1). Production upload and the publication gate are not wired (`RUNBOOK.md`).
5. **Operations.** No metrics, alarms, backups, or rollback rehearsal. `RUNBOOK.md` says none of these is certified.
6. **Capacity and cost.** Not measured. `RUNBOOK.md` requires measured workloads before any limit is claimed.

Before a public launch:
7. Token refresh and revocation. Account and game sessions expire after 15 minutes and there is no refresh or revocation.
8. Moderated room membership and the lobby's moderation rules.
9. Node version. The project targets Node 24; this machine runs Node 25.
10. CI. The workflow in `.github/workflows/build.yml` has not run against a real pipeline with the browser suites.

## Next steps, in order

1. Account sign-in UI, and tying game saves to the signed-in account.
2. WebSocket chat on the room's Durable Object, then the lobby, with the Workers AI moderation binding and wiring.
3. Chat UI.
4. Staging deploy with a real D1 ID, then the operational items above.
