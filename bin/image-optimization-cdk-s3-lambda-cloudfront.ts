#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ImageOptimizationCdkS3LambdaCloudfrontStack } from "../lib/image-optimization-cdk-s3-lambda-cloudfront-stack";

const app = new cdk.App();
new ImageOptimizationCdkS3LambdaCloudfrontStack(
  app,
  "ImageOptimizationCdkS3LambdaCloudfrontStack",
  {
    /* If you don't specify 'env', this stack will be environment-agnostic.
     * Account/Region-dependent features and context lookups will not work,
     * but a single synthesized template can be deployed anywhere. */

    /* Uncomment the next line to specialize this stack for the AWS Account
     * and Region that are implied by the current CLI configuration. */
    // env: {
    //   account: process.env.AWS_DEFAULT_ACCOUNT,
    //   region: process.env.AWS_REGION,
    // },

    /* Uncomment the next line if you know exactly what Account and Region you
     * want to deploy the stack to. */
    env: { account: "082397994284", region: "ap-south-1" },

    /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  }
);
