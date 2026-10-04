/**
 * MLB Postseason site infrastructure.
 *
 * Resources:
 *   - DynamoDB table (bracket cache, PAY_PER_REQUEST, TTL on `ttl`).
 *   - Two bundled Lambda functions (getBracket, getPrediction) on Node 20.
 *   - HTTP API (API Gateway v2) with CORS for the SPA + localhost dev.
 *   - Private S3 bucket (OAC) + CloudFront distribution serving the SPA.
 *   - A BucketDeployment for the built SPA plus a deploy-time `/config.js`
 *     that injects the API base URL into the static bundle at runtime.
 *   - CfnOutputs: ApiUrl, DistributionDomainName, BucketName, TableName.
 */
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import {
  Stack,
  type StackProps,
  CfnOutput,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root resolved from this file (infra/lib -> repo root). */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const BACKEND_HANDLERS = path.join(REPO_ROOT, 'backend', 'src', 'handlers');
const FRONTEND_DIST = path.join(REPO_ROOT, 'frontend', 'dist');

/** Default Bedrock model; mirrors backend's DEFAULT_MODEL_ID. */
const DEFAULT_BEDROCK_MODEL_ID = 'anthropic.claude-3-haiku-20240307-v1:0';

export class MlbPostseasonStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bedrockModelId =
      this.node.tryGetContext('bedrockModelId') ?? DEFAULT_BEDROCK_MODEL_ID;

    // ---- DynamoDB bracket cache ------------------------------------------
    const table = new dynamodb.Table(this, 'BracketCacheTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // ---- Lambda functions -------------------------------------------------
    const commonBundling: lambdaNodejs.BundlingOptions = {
      format: lambdaNodejs.OutputFormat.ESM,
      target: 'node20',
      // AWS SDK v3 is provided by the Lambda Node 20 runtime; keep it external.
      externalModules: ['@aws-sdk/*'],
    };

    const getBracketFn = new lambdaNodejs.NodejsFunction(this, 'GetBracketFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(BACKEND_HANDLERS, 'getBracket.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_MODEL_ID: bedrockModelId,
      },
      bundling: commonBundling,
    });

    const getPredictionFn = new lambdaNodejs.NodejsFunction(
      this,
      'GetPredictionFn',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(BACKEND_HANDLERS, 'getPrediction.ts'),
        handler: 'handler',
        // The prediction path calls Amazon Bedrock, so give it more headroom.
        memorySize: 512,
        timeout: Duration.seconds(30),
        environment: {
          TABLE_NAME: table.tableName,
          BEDROCK_MODEL_ID: bedrockModelId,
        },
        bundling: commonBundling,
      }
    );

    // ---- IAM --------------------------------------------------------------
    table.grantReadWriteData(getBracketFn);
    table.grantReadWriteData(getPredictionFn);

    // Bedrock InvokeModel for the prediction function. Scope to foundation
    // models + inference profiles in this region/account so the policy is
    // least-privilege while still allowing a swap of the exact model id.
    getPredictionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/*`,
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        ],
      })
    );

    // ---- S3 + CloudFront for the SPA -------------------------------------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin:
          cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // SPA routing: serve index.html for client-side routes / missing keys.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
    });

    const corsOrigin = `https://${distribution.distributionDomainName}`;

    // ---- HTTP API ---------------------------------------------------------
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: [corsOrigin, 'http://localhost:5173', 'http://localhost:3000'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type'],
        maxAge: Duration.days(1),
      },
    });

    const bracketIntegration =
      new apigwv2Integrations.HttpLambdaIntegration(
        'GetBracketIntegration',
        getBracketFn
      );
    const predictionIntegration =
      new apigwv2Integrations.HttpLambdaIntegration(
        'GetPredictionIntegration',
        getPredictionFn
      );

    httpApi.addRoutes({
      path: '/bracket',
      methods: [apigwv2.HttpMethod.GET],
      integration: bracketIntegration,
    });
    httpApi.addRoutes({
      path: '/prediction',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: predictionIntegration,
    });

    const apiUrl = httpApi.apiEndpoint;

    // ---- Deploy the SPA + inject the API URL -----------------------------
    // The built SPA (frontend/dist, must exist at synth time) and the
    // deploy-time /config.js are shipped by a SINGLE BucketDeployment.
    //
    // ISSUE-4 (BucketDeployment prune race): a previous design used two
    // deployments - the SPA one pruned by default while a separate
    // DeployRuntimeConfig used prune:false to add /config.js. On a redeploy the
    // SPA deployment's prune step could transiently delete the existing
    // /config.js before the second deployment rewrote it, so a request landing
    // in that window would 404 on the runtime config. Combining both sources
    // into one deployment makes prune internally consistent: /config.js is part
    // of the same managed object set as the SPA, so it is never pruned away and
    // is always present after each deploy. `apiUrl` is a deploy-time token and
    // Source.data resolves it when the asset is rendered.
    new s3deploy.BucketDeployment(this, 'DeploySpa', {
      sources: [
        s3deploy.Source.asset(FRONTEND_DIST),
        s3deploy.Source.data('config.js', `window.__API_BASE_URL__ = "${apiUrl}";`),
      ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ---- Outputs ----------------------------------------------------------
    new CfnOutput(this, 'ApiUrl', {
      value: apiUrl,
      description: 'HTTP API base URL (set as window.__API_BASE_URL__).',
    });
    new CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain serving the SPA.',
    });
    new CfnOutput(this, 'BucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket hosting the SPA static assets.',
    });
    new CfnOutput(this, 'TableName', {
      value: table.tableName,
      description: 'DynamoDB table caching aggregated brackets.',
    });
  }
}
