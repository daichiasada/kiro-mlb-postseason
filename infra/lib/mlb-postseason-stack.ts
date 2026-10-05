/**
 * MLB Postseason site infrastructure.
 *
 * Resources:
 *   - DynamoDB table (bracket cache, PAY_PER_REQUEST, TTL on `ttl`).
 *   - Three bundled Lambda functions (getBracket, getPrediction, getGameDetail)
 *     on Node 20. Only getPrediction is granted bedrock:InvokeModel; getGameDetail
 *     talks to the public MLB API + DynamoDB only (no Bedrock).
 *   - HTTP API (API Gateway v2) with CORS for the SPA + localhost dev, exposing
 *     GET /bracket, GET + POST /prediction, and GET /game.
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
  Fn,
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

/**
 * Default Bedrock model; mirrors backend/shared `DEFAULT_NARRATIVE_MODEL_ID`.
 * The default is now an Amazon Nova inference profile (Nova Lite) per Issue #13:
 * it balances quality, latency, and cost and is invocable on-demand through a
 * cross-region inference profile (prefix `us.`). Anthropic Claude Haiku remains
 * a selectable option. Override at deploy time with
 * `--context bedrockModelId=<id>`.
 */
const DEFAULT_BEDROCK_MODEL_ID = 'us.amazon.nova-lite-v1:0';

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

    // The game-detail function fetches per-game data from the public MLB API and
    // caches it in DynamoDB. It never calls Bedrock, so it carries only
    // TABLE_NAME (no BEDROCK_MODEL_ID) and gets no bedrock:InvokeModel policy.
    const getGameDetailFn = new lambdaNodejs.NodejsFunction(
      this,
      'GetGameDetailFn',
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.join(BACKEND_HANDLERS, 'getGameDetail.ts'),
        handler: 'handler',
        memorySize: 256,
        timeout: Duration.seconds(15),
        environment: {
          TABLE_NAME: table.tableName,
        },
        bundling: commonBundling,
      }
    );

    // The OG-image and share-HTML functions generate a deterministic SVG /
    // crawler HTML from the shared pure builders and cache the bytes in
    // DynamoDB. Like getGameDetail they NEVER call Bedrock, so they carry only
    // TABLE_NAME (no BEDROCK_MODEL_ID) and get no bedrock:InvokeModel policy.
    // These functions carry NO SITE_ORIGIN env: injecting the CloudFront domain
    // as a Lambda env would complete a CloudFront<->Lambda synth cycle. The
    // public site origin instead reaches the share Lambda at runtime via a
    // custom CloudFront origin request header (`x-site-origin`); see the
    // share/OG CloudFront behaviors below.
    const getOgImageFn = new lambdaNodejs.NodejsFunction(this, 'GetOgImageFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(BACKEND_HANDLERS, 'getOgImage.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: commonBundling,
    });

    const getShareHtmlFn = new lambdaNodejs.NodejsFunction(this, 'GetShareHtmlFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(BACKEND_HANDLERS, 'getShareHtml.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        TABLE_NAME: table.tableName,
      },
      bundling: commonBundling,
    });

    // ---- IAM --------------------------------------------------------------
    table.grantReadWriteData(getBracketFn);
    table.grantReadWriteData(getPredictionFn);
    table.grantReadWriteData(getGameDetailFn);
    table.grantReadWriteData(getOgImageFn);
    table.grantReadWriteData(getShareHtmlFn);

    // Bedrock InvokeModel for the prediction function. The selectable models are
    // cross-region inference profiles (prefix `us.`): the Amazon Nova family
    // (`us.amazon.nova-micro|lite|pro-v1:0`, Nova Lite being the default) AND the
    // Anthropic Claude Haiku profile (`us.anthropic.claude-haiku-...`). An
    // inference profile transparently routes the request to the underlying
    // foundation model in ANY region of its geography (us-east-1, us-east-2,
    // us-west-2, ...), and Bedrock authorizes BOTH the inference-profile ARN and
    // the underlying foundation-model ARN in whichever region actually serves the
    // request. The two wildcard resources below therefore authorize invocation of
    // BOTH the Anthropic Claude inference profile AND every Amazon Nova
    // model/inference profile (foundation-model/* spans regions, inference-profile/*
    // spans the account's profiles) with no per-model change needed. The
    // foundation-model grant must span regions (wildcard region) rather than being
    // pinned to `this.region`; otherwise the invoke fails with AccessDeniedException
    // on e.g. `arn:aws:bedrock:us-east-2::foundation-model/amazon.nova-lite-v1:0`.
    // NOTE: each selected model must also be *access-enabled* for Bedrock in the
    // account/region (Bedrock model access); that is a runtime account setting, not
    // IAM. The deterministic templated fallback keeps /prediction returning 200
    // even when a chosen model is not yet access-enabled.
    getPredictionFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
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

    // ---- HTTP API ---------------------------------------------------------
    // CORS allow-origins is a wildcard `*` rather than the specific CloudFront
    // domain. Issue #21 adds CloudFront behaviors that forward `/og` and
    // `/share` to THIS HTTP API, which makes the distribution depend on the
    // API; referencing `distribution.distributionDomainName` back here (the old
    // behavior) would then create a CloudFront<->API cyclic dependency that CDK
    // rejects at synth. The API is a public, no-auth, read-only JSON/SVG/HTML
    // surface and every handler already emits `Access-Control-Allow-Origin: *`,
    // so a wildcard preflight origin is consistent and breaks the cycle without
    // weakening anything meaningful.
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
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
    const gameDetailIntegration =
      new apigwv2Integrations.HttpLambdaIntegration(
        'GetGameDetailIntegration',
        getGameDetailFn
      );
    const ogImageIntegration =
      new apigwv2Integrations.HttpLambdaIntegration(
        'GetOgImageIntegration',
        getOgImageFn
      );
    const shareHtmlIntegration =
      new apigwv2Integrations.HttpLambdaIntegration(
        'GetShareHtmlIntegration',
        getShareHtmlFn
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
    httpApi.addRoutes({
      path: '/game',
      methods: [apigwv2.HttpMethod.GET],
      integration: gameDetailIntegration,
    });
    // Issue #21: the per-series OG image (SVG) and the crawler-readable share
    // HTML. Neither invokes Bedrock.
    httpApi.addRoutes({
      path: '/og',
      methods: [apigwv2.HttpMethod.GET],
      integration: ogImageIntegration,
    });
    httpApi.addRoutes({
      path: '/share',
      methods: [apigwv2.HttpMethod.GET],
      integration: shareHtmlIntegration,
    });

    // ---- HTTP API throttling (Issue #23) ---------------------------------
    // /prediction is a public, no-auth endpoint whose billable branch invokes
    // Amazon Bedrock, so an unbounded request rate is an open-ended cost risk.
    // Apply default-route throttling to the implicit `$default` stage: a
    // steady-state rate of 20 requests/second with a burst of 40. These values
    // bound how fast the endpoint can be hammered into runaway Bedrock cost
    // while sitting well above any normal browsing pattern (a visitor loading
    // the bracket, prediction, and a few game details), so legitimate traffic
    // is unaffected. The implicit default stage is created by apigwv2.HttpApi,
    // so we reach its L1 CfnStage via the escape hatch to set DefaultRouteSettings.
    //
    // Prediction cache hit/miss and Bedrock InvokeModel metrics are emitted by
    // the backend via Embedded Metric Format (EMF) stdout logs (FEAT-002), so
    // no cloudwatch:PutMetricData IAM is required here.
    const defaultStage = httpApi.defaultStage!.node
      .defaultChild as apigwv2.CfnStage;
    defaultStage.defaultRouteSettings = {
      throttlingRateLimit: 20,
      throttlingBurstLimit: 40,
    };

    const apiUrl = httpApi.apiEndpoint;

    // ---- Share/OG routing through CloudFront (Issue #21) -----------------
    // A social crawler fetching a share link must reach the Lambda-rendered
    // meta tags on the SITE origin, not the SPA shell. We route by DEDICATED
    // paths (`/og*` and `/share*`) to the HTTP API instead of User-Agent
    // sniffing: UA sniffing is brittle (crawlers change UAs, previews from
    // messaging apps vary) and would route the SAME SPA URL differently per
    // client. A human who lands on `/share/...` is redirected into the SPA by
    // the share HTML itself (meta-refresh + location.replace), so normal SPA
    // navigation (the default behavior below) is unaffected.
    //
    // `httpApi.apiEndpoint` is `https://<id>.execute-api.<region>.amazonaws.com`;
    // HttpOrigin wants just the host, so split off the domain. The origin
    // request policy forwards the query string, and the cache policy keys on it,
    // so `?season=&seriesId=&lang=` reach the Lambda and distinct series are
    // cached separately.
    const apiDomain = Fn.select(2, Fn.split('/', apiUrl));
    const apiOrigin = new cloudfrontOrigins.HttpOrigin(apiDomain);

    // Carry the PUBLIC site origin (the host the viewer actually requested -
    // the CloudFront distribution domain, or a custom CNAME in front of it) to
    // the share/OG Lambdas. The `/og*` and `/share*` behaviors below use
    // ALL_VIEWER_EXCEPT_HOST_HEADER, which strips the viewer Host before the
    // origin request, so without this the Lambda would read API Gateway's own
    // execute-api host and bake the API domain into
    // og:url/canonical/og:image/the redirect target.
    //
    // We cannot pass the distribution's own domain as a custom ORIGIN header or
    // a Lambda env: `distribution.distributionDomainName` is a Fn::GetAtt on the
    // distribution, and using it on the distribution's origin (self-reference)
    // or on the share Lambda env (distribution -> API -> Lambda -> distribution)
    // both create a synth cycle. Instead a VIEWER-REQUEST CloudFront Function
    // copies the viewer's `Host` into an `x-site-origin` request header BEFORE
    // the origin request policy strips Host. The function is a literal, static
    // construct that references NOTHING else, so synth stays acyclic, and it
    // naturally reports whatever public host the viewer used (cloudfront.net or
    // a custom domain). The share handler reads `x-site-origin` ahead of Host.
    const siteOriginFunction = new cloudfront.Function(this, 'ShareSiteOriginFn', {
      comment: 'Copy viewer Host into x-site-origin for share/OG absolute URLs.',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          '  var host = request.headers.host && request.headers.host.value;',
          '  if (host) {',
          "    request.headers['x-site-origin'] = { value: 'https://' + host };",
          '  }',
          '  return request;',
          '}',
        ].join('\n'),
      ),
    });
    // A cache policy that INCLUDES the query string in the cache key so distinct
    // `?season=&seriesId=&lang=` combinations are cached (and served) as
    // distinct objects rather than collapsing to one.
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'ShareApiCachePolicy', {
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      defaultTtl: Duration.minutes(15),
      minTtl: Duration.seconds(0),
      maxTtl: Duration.hours(1),
      enableAcceptEncodingGzip: true,
    });
    const apiBehavior: cloudfront.AddBehaviorOptions = {
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originRequestPolicy:
        cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      cachePolicy: apiCachePolicy,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      // Capture the public site host into x-site-origin before Host is stripped.
      functionAssociations: [
        {
          function: siteOriginFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
    };
    for (const pattern of ['/og', '/og/*', '/share', '/share/*']) {
      distribution.addBehavior(pattern, apiOrigin, apiBehavior);
    }

    // NOTE on the public origin for the share HTML's absolute URLs:
    // We deliberately do NOT inject the CloudFront domain as a SITE_ORIGIN env
    // on getShareHtmlFn. The CloudFront behaviors above already make the
    // distribution depend on this HTTP API (and therefore on its Lambdas);
    // adding `distribution.distributionDomainName` as an env on the share
    // Lambda would complete a CloudFront<->Lambda cyclic dependency that CDK
    // rejects at synth. Instead the public site origin reaches the share Lambda
    // via the `x-site-origin` request header set by the VIEWER-REQUEST
    // CloudFront Function above (it copies the viewer Host before Host is
    // stripped) - acyclic because the function references nothing else. The
    // handler reads `x-site-origin` ahead of the (stripped) Host header, with an
    // X-Forwarded-Proto + Host derivation and a localhost fallback for local
    // runs. A SITE_ORIGIN env is still honored first if one is ever provided
    // out-of-band, so the choice stays overridable.

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
