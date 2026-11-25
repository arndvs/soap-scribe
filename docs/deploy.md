# Deploying

How to run SOAP Scribe on AWS for one practice. Everything here uses placeholders; real account IDs, model IDs and addresses never go in this repo.

**Before any real patient:** every item in [gaps.md](gaps.md) P1 must be done, including the AWS BAA. Check that every service below is on AWS's current *HIPAA Eligible Services Reference*, and use only those for patient data.

## What runs where

| Piece | AWS service | Notes |
|---|---|---|
| API | ECS on Fargate, behind an Application Load Balancer with HTTPS (ACM certificate) | [`deploy/ecs/api-task.json`](../deploy/ecs/api-task.json) |
| Worker | ECS on Fargate, one task, no inbound traffic | [`deploy/ecs/worker-task.json`](../deploy/ecs/worker-task.json) |
| Image | ECR | One image; the task definition picks `dist/api.js` or `dist/worker.js` |
| Secrets | Secrets Manager, one secret `soap-scribe` with JSON keys | Read by the ECS execution role only |
| Models | Amazon Bedrock | Reached through the task role; there is no API key |
| Failure alerts | SES | Job ID and error only, never patient data |
| Logs | CloudWatch Logs | The logger only accepts IDs, statuses, counts and errors |
| Database | MongoDB Atlas, dedicated paid cluster | BAA through MongoDB's Cloud Terms for self-service accounts; confirm the tier |

## One-time setup

1. **AWS BAA.** In AWS Artifact, accept the Business Associate Addendum for the account.
2. **Bedrock.** Request access to the two models you'll use (one fast for extraction, one stronger for composing). Note their model IDs.
3. **Atlas.** Create a dedicated cluster in the same region, with network access limited to the VPC (PrivateLink or peering), and a database user for the app.
4. **Extension token.** Run `pnpm --filter @soap-scribe/server token`. Keep the token for the extension; the hash goes into the secret below.
5. **Pocket webhook.** In the Pocket app's integrations, add a webhook pointing at `https://<your-api-host>/webhooks/pocket` for the `transcription.completed` event. Copy the signing secret when it's shown; it's shown only once.
6. **Secret.** Create one Secrets Manager secret named `soap-scribe` with keys `MONGODB_URI`, `POCKET_API_KEY`, `POCKET_WEBHOOK_SECRET`, `EXTENSION_TOKEN_HASH`.
7. **IAM.**
   - Task role `soap-scribe-task` with [`deploy/iam/task-role-policy.json`](../deploy/iam/task-role-policy.json) (Bedrock for the two models, SES for alerts).
   - Execution role `soap-scribe-execution` with the AWS managed `AmazonECSTaskExecutionRolePolicy` plus [`deploy/iam/execution-role-policy.json`](../deploy/iam/execution-role-policy.json).
   - A GitHub OIDC role for deploys, trusted for this repo's `production` environment only, allowed to push to the ECR repository and update the two ECS services.
8. **SES.** Verify the sender address or domain, and move SES out of the sandbox, or verify the alert recipient too.
9. **ECS.** Create a cluster, the ALB with an HTTPS listener (redirect HTTP to HTTPS), and two services from the task definitions: API with 1–2 tasks behind the ALB, worker with exactly 1 task.
10. **Fill in the placeholders** in `deploy/ecs/*.json` and `deploy/iam/*.json`: model IDs, region, alert addresses. `ACCOUNT_ID` is filled in by the deploy workflow.

## Deploying a change

1. Set the repository variables listed at the top of [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
2. Run **Actions → Deploy → Run workflow**. It builds the image, pushes it to ECR, and updates both services, waiting for each to be stable.

The workflow is manual on purpose: CI runs on every push, but nothing reaches the practice without a person starting it.

## Installing the extension on her computer

```bash
API_URL=https://<your-api-host> JANE_HOST=<her-subdomain>.jane.app pnpm --filter @soap-scribe/extension build
```

Then in Chrome: **chrome://extensions → Developer mode → Load unpacked → `packages/extension/dist`**. Open the extension's options page and paste the token from step 4. Open the side panel from the toolbar button.

## Checking it works

- `GET https://<your-api-host>/health` returns `{"ok":true}`.
- Record a short role-played visit on Pocket. Within a minute of transcription, it appears in the side panel's Today view.
- The worker's CloudWatch log shows `job_created`, then `job_fetched`.

## Rotating secrets

- **Extension token:** generate a new one, update `EXTENSION_TOKEN_HASH`, redeploy, paste the new token in the options page. Do this if her laptop is lost.
- **Pocket webhook secret:** rotate in the Pocket app, update `POCKET_WEBHOOK_SECRET`, redeploy.
- **Pocket API key / Atlas password:** create the new one, update the secret, redeploy, then revoke the old one.
