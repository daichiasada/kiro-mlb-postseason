/**
 * Synth-time assertion tests for {@link MlbPostseasonStack} (ISSUE-3).
 *
 * These use `aws-cdk-lib/assertions` Template.fromStack, which synthesizes the
 * CloudFormation template in-process. No live AWS call is made: Template.fromStack
 * only renders the template, and a fixed env ({account, region}) is supplied so
 * nothing is resolved from ambient AWS credentials.
 */
import { describe, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { MlbPostseasonStack } from '../lib/mlb-postseason-stack.js';

function synthTemplate(): Template {
  const app = new App();
  const stack = new MlbPostseasonStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
  });
  return Template.fromStack(stack);
}

describe('MlbPostseasonStack', () => {
  const template = synthTemplate();

  it('provisions a DynamoDB table with TTL enabled on `ttl` and a `pk` HASH key', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      KeySchema: Match.arrayWith([{ AttributeName: 'pk', KeyType: 'HASH' }]),
    });
  });

  it('creates three Node 20 app Lambda functions carrying TABLE_NAME env', () => {
    // CDK also synthesizes helper Lambdas (bucket deployment + auto-delete),
    // so assert on the *application* functions by their nodejs20.x runtime and
    // the required TABLE_NAME env rather than the raw total function count.
    // The three are getBracket, getPrediction, and getGameDetail (ISSUE-19).
    template.resourcePropertiesCountIs(
      'AWS::Lambda::Function',
      {
        Runtime: 'nodejs20.x',
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: Match.anyValue(),
          }),
        },
      },
      3,
    );
  });

  it('scopes BEDROCK_MODEL_ID env to exactly the two Bedrock-invoking functions (getGameDetail excluded)', () => {
    // Only getBracket + getPrediction carry BEDROCK_MODEL_ID. The new
    // getGameDetail function talks to the public MLB API + DynamoDB only and
    // must NOT carry the model env, so the BEDROCK_MODEL_ID-bearing count stays 2.
    template.resourcePropertiesCountIs(
      'AWS::Lambda::Function',
      {
        Runtime: 'nodejs20.x',
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: Match.anyValue(),
            BEDROCK_MODEL_ID: Match.anyValue(),
          }),
        },
      },
      2,
    );
  });

  it('grants the prediction function bedrock:InvokeModel via an IAM policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith(['bedrock:InvokeModel']),
          }),
        ]),
      },
    });
  });

  it('authorizes bedrock:InvokeModel on BOTH foundation-model and inference-profile ARNs (so Amazon Nova + Claude invocation is permitted)', () => {
    // The resources are wildcard foundation-model/* (spans regions) and
    // inference-profile/* (spans the account), which cover the Amazon Nova
    // foundation-model ARNs and the `us.amazon.nova-*` / `us.anthropic.claude-*`
    // inference-profile ARNs. Assert both ARN shapes are present on the same
    // Allow statement that carries bedrock:InvokeModel.
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: Match.arrayWith([
              'bedrock:InvokeModel',
              'bedrock:InvokeModelWithResponseStream',
            ]),
            Resource: Match.arrayWith([
              'arn:aws:bedrock:*::foundation-model/*',
              'arn:aws:bedrock:*:123456789012:inference-profile/*',
            ]),
          }),
        ]),
      },
    });
  });

  it('sets a non-empty BEDROCK_MODEL_ID env on the prediction (bedrock-invoking) function', () => {
    // The prediction function has 512 MB memory (vs 256 for getBracket); match on
    // that so we assert the env on the right application function specifically.
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
      Runtime: 'nodejs20.x',
      Environment: {
        Variables: Match.objectLike({
          BEDROCK_MODEL_ID: Match.anyValue(),
        }),
      },
    });
  });

  it('exposes GET /bracket, GET + POST /prediction, and GET /game HTTP API routes', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /bracket',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /prediction',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /prediction',
    });
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /game',
    });
  });

  it('throttles the HTTP API default stage to bound Bedrock cost exposure (Issue #23)', () => {
    // The implicit `$default` stage carries default-route throttling so the
    // public, no-auth /prediction endpoint cannot be hammered into runaway
    // Bedrock cost. Assert the exact steady-state rate (20 req/s) and burst (40)
    // configured in the stack.
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: Match.objectLike({
        ThrottlingRateLimit: 20,
        ThrottlingBurstLimit: 40,
      }),
    });
  });

  it('routes CloudFront 403 and 404 responses to the SPA index for deep links', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });

  it('ships the SPA + /config.js via a single BucketDeployment (ISSUE-4)', () => {
    // One combined deployment avoids the prune race that could transiently
    // delete /config.js on redeploy. See the stack comment for details.
    template.resourceCountIs('Custom::CDKBucketDeployment', 1);
  });
});
