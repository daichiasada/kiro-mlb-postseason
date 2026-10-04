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

The MLB postseason summary site is designed so that normal development here naturally
produces the kinds of artifacts the exam rewards:

- **Spec / steering-driven development:** this `.kiro/steering/` set (university, product,
  tech, structure) drives the build, and the work is planned as discrete features under
  `.agents/tasks/`. This demonstrates intentional, spec-first use of Kiro.
- **Agent hooks potential:** the monorepo is structured so hooks (e.g. "refresh the cached
  bracket", "run tests on save") can be added without rework.
- **MCP / Amazon Bedrock integration:** the win/loss prediction feature calls Amazon
  Bedrock (Anthropic Claude) to generate a natural-language series narrative - a concrete
  AI integration rather than a toy.
- **Infrastructure as Code:** AWS CDK (TypeScript) provisions the entire stack
  (S3 + CloudFront, API Gateway + Lambda, DynamoDB, Bedrock IAM) for one-command deploy.
- **Testing:** Vitest unit tests cover the prediction logic and MLB data aggregation,
  with AWS SDK and the MLB API mocked (no live calls in CI).
- **Documentation:** a README covering one-command deploy and local development.

Keeping these artifacts healthy throughout development is the practical way to maximize the
exam score.
