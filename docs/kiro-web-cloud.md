# Kiro Web, cloud sessions, and cloud configuration (BONUS)

This project was built on **Kiro Web** using cloud sessions. This document
explains how that worked and the local-vs-cloud engineering differences to show
in the demo video.

## Built on Kiro Web with cloud sessions

- The entire monorepo (shared, backend, frontend, infra) was authored inside a
  Kiro Web cloud session rather than a local IDE. The session provides a
  disposable, reproducible workspace with Node preinstalled, so there is no
  "works on my machine" drift.
- Spec-driven and steering-driven development is the same in the cloud: the
  `.kiro/specs/mlb-postseason/` and `.kiro/steering/*.md` files live in the repo
  and travel with every clone, local or cloud.
- Source control is handled from the cloud session. The repo's first commit is
  from the challenge window, and work landed as small, reviewable commits.

## Local vs cloud engineering differences (for the demo video)

Highlight these contrasts on camera:

| Concern | Local IDE | Kiro Web cloud session |
| --- | --- | --- |
| Environment | Your machine's Node/toolchain versions | A fresh, pinned cloud workspace every session |
| Setup | Clone + install + hope versions match | Session is ready; `npm install` is reproducible |
| Agent hooks | `.kiro/hooks/*.kiro.hook` run on local save events | Same hooks run in the cloud session on the same events |
| MCP servers | Launched by your local `uvx`/`node` | Launched inside the cloud session (same `.kiro/settings/mcp.json`) |
| Browser e2e | Local Playwright + local browser | Playwright / agent-browser Power in the session |
| Secrets / AWS | Your local AWS profile / SSO | Cloud session credentials activated for the session |
| Teardown | Manual cleanup | Session is disposable; nothing left behind |

The point for judges: the SAME repo artifacts (specs, steering, hooks, MCP
config, custom agent, property tests) drive the build identically in both
places. Nothing is hidden in a local-only config.

## How AWS cloud configuration activates for deploy

The repository build itself performs **no live AWS or Bedrock calls** - it is
install, typecheck, build, unit + property tests, and `cdk synth`. Deploy is a
separate, credential-gated step:

1. In a fresh Kiro Web session, activate AWS credentials for the session
   (profile, SSO, or environment variables). The CDK/Lambda target is the Node
   20 runtime.
2. Grant Amazon Bedrock model access for the chosen Claude model
   (`anthropic.claude-3-haiku-20240307-v1:0` by default) in the deploy region.
3. First-time only, bootstrap the account/region:

   ```bash
   npm run bootstrap   # cd infra && npx cdk bootstrap
   ```

4. Deploy with one command from the repo root:

   ```bash
   npm install && npm run build && npm run deploy
   ```

   `npm run deploy` re-runs the ordered build (`shared -> backend -> frontend ->
   infra`) and then `cdk deploy`. The frontend is built before deploy because
   CDK packages `frontend/dist` as the S3 website source at synth time.

5. The SPA finds the API with **no rebuild**: CDK writes `/config.js` at the
   bucket root with `window.__API_BASE_URL__`, which `index.html` loads before
   the app bundle. The same static bundle therefore works against any deployed
   API, local or cloud.

See the root `README.md` ("One-command deploy") for the full flow and the stack
outputs (ApiUrl, DistributionDomainName, BucketName, TableName).
