import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { CDKContext } from "../types";
import { S3StackConstruct } from "./s3-stack";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

const CONTEXT: CDKContext = {
  appName: "ImageOptimizationCdkS3LambdaCloudfront",
  region: "ap-south-1",
  mediaDomain: "s3-resizer.nitishxyz.dev",
};

export class ImageOptimizationCdkS3LambdaCloudfrontStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'ImageOptimizationCdkS3LambdaCloudfrontQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    const s3Bucket = new S3StackConstruct(
      this,
      `${CONTEXT?.appName}-S3`,
      CONTEXT!
    );
  }
}
