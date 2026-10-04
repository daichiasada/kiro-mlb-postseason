---
inclusion: always
---

# Technology Stack

Approved architecture (one-command deploy on AWS, TypeScript end to end).

## Frontend

- **React + TypeScript**, built with **Vite**.
- Hosted as a static SPA on **Amazon S3** and served through **Amazon CloudFront**.

## Backend

- **Amazon API Gateway** in front of **AWS Lambda** functions written in **TypeScript**.
- Lambda runtime target: **Node.js 20** (local toolchain is Node 22; keep code Node 20
  compatible).
- Handlers: `getBracket` (postseason bracket) and `getPrediction` (win/loss prediction).

## Data

- **Amazon DynamoDB** stores the aggregated bracket JSON, keyed by season, as a cache.
- **Source of truth:** the public **MLB Stats API**
  (`https://statsapi.mlb.com/api/v1/schedule/postseason?sportId=1&season=YYYY`, no API key).
  A Lambda fetches it, aggregates games into series, and caches the result in DynamoDB.
- **Fallback:** the bundled `@mlb/shared` seed dataset (`postseason-2024.json`) is used
  when the live API is unreachable, so the app is always deterministic in tests and demos.

## AI

- **Amazon Bedrock** with **Anthropic Claude** models (e.g. Claude 3 Haiku / Sonnet) via
  `InvokeModel` generates the natural-language prediction narrative. The win probability is
  computed by a deterministic model in code; Bedrock explains it in prose.

## Infrastructure as Code

- **AWS CDK (TypeScript)** provisions everything: S3 + CloudFront, API Gateway + Lambda,
  DynamoDB, and the IAM policy allowing Lambda to call Bedrock.
- Goal: **one-command deploy** (`npm run deploy` → build then `cdk deploy`).

## Build / tooling

- **npm workspaces** monorepo (not yarn / pnpm / bun).
- **Strict TypeScript** via a shared `tsconfig.base.json` extended by each workspace.
- **Vitest** for unit tests. AWS SDK and the MLB API are **mocked** - no live AWS or
  network calls in tests.

## Deploy note

This repository build performs **no live AWS or Bedrock calls**. Deployment is run by the
user from a session with active AWS credentials via `cdk bootstrap` + `cdk deploy`.
