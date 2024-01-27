import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import { CDKContext } from "../types";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";

import { aws_lambda as lambda } from "aws-cdk-lib";

import { aws_apigateway as apigw } from "aws-cdk-lib";
import {
  aws_cloudfront as cloudfront,
  aws_certificatemanager as acm,
} from "aws-cdk-lib";

import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";

import path = require("path");

export class S3StackConstruct extends Construct {
  readonly bucket: s3.Bucket;
  readonly bucketArn: s3.Bucket["bucketArn"];
  constructor(scope: Construct, id: string, context: CDKContext) {
    super(scope, id);

    const resizerLambda = new NodejsFunction(this, "resizerLambda", {
      functionName: `${context.appName}-resizerLambda`,
      entry: path.join(__dirname, "../lambda/s3Resizer/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      ephemeralStorageSize: cdk.Size.gibibytes(1),
      bundling: {
        nodeModules: ["sharp"],
        commandHooks: {
          beforeBundling(_inputDir: string, _outputDir: string) {
            return [];
          },
          beforeInstall(inputDir: string, outputDir: string) {
            return [];
          },
          afterBundling(_inputDir: string, outputDir: string) {
            return [
              `cd ${outputDir}`,
              `rm -rf node_modules/sharp`,
              `rm -rf node_modules/sharp-cli`,
              `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install --arch=x64 --platform=linux --libc=glibc sharp`,
            ];
          },
        },
      },
    });

    resizerLambda.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    const apiGateWay = new apigw.LambdaRestApi(this, "apiGateWay", {
      handler: resizerLambda,
    });

    const backendURL = `${apiGateWay.restApiId}.execute-api.${context.region}.amazonaws.com`;

    // Create a S3 bucket
    const bucket = new s3.Bucket(this, `cdk-s3-bucket`, {
      bucketName: `cdk-s3-bucket`,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "error.html",
      websiteRoutingRules: [
        {
          hostName: backendURL,
          httpRedirectCode: "307",
          protocol: s3.RedirectProtocol.HTTPS,
          replaceKey: s3.ReplaceKey.prefixWith("prod/?key="),
          condition: {
            httpErrorCodeReturnedEquals: "403",
          },
        },
        {
          hostName: backendURL,
          httpRedirectCode: "307",
          protocol: s3.RedirectProtocol.HTTPS,
          replaceKey: s3.ReplaceKey.prefixWith("prod/?key="),
          condition: {
            httpErrorCodeReturnedEquals: "404",
          },
        },
      ],
    });

    bucket.grantReadWrite(resizerLambda);
    bucket.grantPut(resizerLambda);
    bucket.grantPutAcl(resizerLambda);

    bucket.policy?.document.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:*"],
        resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      })
    );

    resizerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        resources: ["arn:aws:logs:*:*:*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
      })
    );

    const DOMAIN = context.mediaDomain;

    resizerLambda.addEnvironment("BUCKET_NAME", bucket.bucketName);
    resizerLambda.addEnvironment("URL", `https://${DOMAIN}`);

    this.bucket = bucket;
    this.bucketArn = bucket.bucketArn;

    new cdk.CfnOutput(this, "s3 bucket domain Name", {
      value: bucket.bucketDomainName,
    });

    new cdk.CfnOutput(this, "s3 bucket name", {
      value: bucket.bucketName,
    });

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: DOMAIN,
    });

    const certificate = new acm.DnsValidatedCertificate(this, "Certificate", {
      domainName: DOMAIN,
      hostedZone,
      region: "us-east-1",
    });

    const oai = new cloudfront.OriginAccessIdentity(
      this,
      `${context.appName}-origin-access-id`,
      {}
    );

    bucket.grantRead(oai);

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "Distribution",
      {
        originConfigs: [
          {
            customOriginSource: {
              domainName: bucket.bucketWebsiteDomainName,
              originProtocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
            },

            behaviors: [
              {
                isDefaultBehavior: true,
              },
            ],
          },
        ],
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
          certificate,
          {
            aliases: [DOMAIN],
            securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            sslMethod: cloudfront.SSLMethod.SNI,
          }
        ),
      }
    );

    // Define A Record in Route53 for sub-domain.
    const route = new route53.ARecord(this, "ARecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    });

    // Output the url of the website.
    new cdk.CfnOutput(this, "URL", {
      description: "The url of the website",
      value:
        bucket.bucketWebsiteUrl + "\n" + distribution.distributionDomainName,
    });
  }
}
