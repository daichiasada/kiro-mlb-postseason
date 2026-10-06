#!/usr/bin/env node
/**
 * CDK application entry point for the MLB postseason site.
 *
 * The stack is deployed into the account/region resolved from the standard
 * CDK environment variables (CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION), which
 * the CDK CLI populates from the active AWS credentials/profile at deploy time.
 */
import { App } from 'aws-cdk-lib';
import { MlbPostseasonStack } from '../lib/mlb-postseason-stack.js';

const app = new App();

new MlbPostseasonStack(app, 'MlbPostseasonStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description:
    'MLB postseason summary site: SPA (S3 + CloudFront), HTTP API + Lambda, DynamoDB cache, Amazon Bedrock prediction narrative.',
});

app.synth();
