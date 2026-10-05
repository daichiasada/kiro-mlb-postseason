---
inclusion: always
---

# Kiro University Challenge - Requirements

This project is a submission for the **Kiro University Challenge** final exam.
Source: https://kiro.dev/2026/university/

## Challenge shape

- **Duration:** 1-week challenge.
- **Lessons:** Posted daily, **September 21–24**. Lessons are educational only; they are
  not submitted, judged, or credited on their own.
- **Surfaces:** Some lessons are specific to a particular Kiro surface - the **IDE**, the
  **CLI**, or **Kiro Web**. This user is working on **Kiro Web**.
- **Final exam:** **ONE graded build**. Submissions open **Fri 9/25**; the take-home final
  exam is **due Mon 10/5, 23:59 PDT**.
- **Final exam entry form:** must be **submitted by Mon 10/5, 23:59 PDT**.

## Hard requirements for the build

- Must be a **NEW project** built during the challenge.
- The project's **first GitHub commit must be on or after Mon Sept 21** (not before).
  This repository starts from zero commits for exactly this reason - keep the first commit
  clean and coherent.
- The build should deliver **real functionality** (a larger project), scored across all
  **7 required lessons**.

## How scoring works

Credits scale with how many of the 7 required lessons you demonstrate on the final build.

| Milestone | Credits |
| --- | --- |
| Lessons 1–3 | 250 each, up to 750 |
| Lessons 4–5 | 500 each, up to 1,000 |
| Lessons 6–7 | 1,000 each, up to 2,000 |
| All 7 required lessons in final submission | 1,000 completion award |
| Bonus Lesson 1 (paid plans only) | 250 additional |
| Bonus Lesson 2 | 250 additional |
| **Maximum total** | **5,250 credits** |

There are **7 required lessons plus 2 bonus lessons** for extra credit.

## How this project demonstrates the lessons

The MLB postseason summary site demonstrates all seven required lessons plus both bonuses.
The authoritative judge-facing map is `DEMONSTRATED_LESSONS.md` at the repo root; the list
below summarizes each demonstrated lesson with a pointer to the real artifact that proves
it. These are shipped artifacts, not plans.

Required lessons:

1. **Spec-driven development:** the spec set in `.kiro/specs/mlb-postseason/`
   (`requirements.md`, `design.md`, `tasks.md`) describes the system as actually built and
   traces to the real modules; the work is planned as discrete features under
   `.agents/tasks/`.
2. **Steering docs:** this `.kiro/steering/` set (`kiro-university`, `product`, `tech`,
   `structure`, `testing`) is `inclusion: always` and shapes every change.
3. **Agent hooks:** `.kiro/hooks/*.kiro.hook` automate the inner loop - tests on save,
   typecheck on save, and a manual Playwright e2e run.
4. **Property-based testing (IDE-only):** fast-check suites exercise the real functions in
   `backend/src/predict/model.property.test.ts` and
   `backend/src/mlb/aggregate.property.test.ts`.
5. **Powers:** the agent-browser / Playwright and github-cli powers were used during the
   build, and a self-contained power is packaged at `.kiro/powers/mlb-postseason/` (see Bonus 2).
6. **Model Context Protocol (MCP):** `.kiro/settings/mcp.json` configures the public
   `aws-docs` and `fetch` MCP servers (no secrets).
7. **Custom agents:** `.kiro/agents/mlb-postseason-dev.json` defines the
   `mlb-postseason-dev` agent, encoding the monorepo layout, conventions, and the real
   resolution order.

Bonus lessons:

- **Bonus 1 - Kiro Web, cloud sessions, cloud configuration:** `docs/kiro-web-cloud.md`
  explains how the project was built on Kiro Web with cloud sessions and how AWS cloud
  configuration activates for `cdk bootstrap` + `cdk deploy`.
- **Bonus 2 - Package a Kiro Power:** `.kiro/powers/mlb-postseason/` is a self-contained,
  installable power (manifest + bundled steering + skill + `mlb-fetch` MCP server + README)
  that sits outside the npm workspaces so it adds no build surface.

Supporting artifacts referenced by the lessons above:

- **Amazon Bedrock integration:** the win/loss prediction feature calls Amazon Bedrock
  (Anthropic Claude) to generate a natural-language series narrative with a deterministic
  fallback - a concrete AI integration rather than a toy.
- **Infrastructure as Code:** AWS CDK (TypeScript) in `infra/` provisions the entire stack
  (S3 + CloudFront, API Gateway + Lambda, DynamoDB, Bedrock IAM) for one-command deploy.
- **Testing:** Vitest unit tests cover the prediction logic and MLB data aggregation, with
  the AWS SDK and the MLB API mocked (no live calls in CI); see `.kiro/steering/testing.md`.
- **Documentation:** `README.md` covers one-command deploy and local development.

Keeping these artifacts healthy throughout development is the practical way to maximize the
exam score.
