import * as cdk from 'aws-cdk-lib';
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as iam from 'aws-cdk-lib/aws-iam';

// find a way to build the frontend before uploading file to S3
// import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
// import { Runtime } from 'aws-cdk-lib/aws-lambda';


// to be used when adding custom domain to the build
import * as acm from "aws-cdk-lib/aws-certificatemanager";

import {
  OriginAccessIdentity,
  AllowedMethods,
  ViewerProtocolPolicy,
  OriginProtocolPolicy,
  Distribution,
} from "aws-cdk-lib/aws-cloudfront";

import { Construct } from 'constructs';

interface CustomStackProps extends cdk.StackProps {
  stage: string;
}

export class CloudfrontDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CustomStackProps) {
    super(scope, id, props);

    // Importing ALB domain name
    // this import is coming from the fargate we created from earlier
    const loadBalancerDomain = cdk.Fn.importValue("loadBalancerUrl");

    // Getting external configuration values from cdk.json file
    // const config = this.node.tryGetContext("stages")[props.stage];

    // SSL certificate
    // const certificateArn = acm.Certificate.fromCertificateArn(this, "tlsCertificate", config.certificateArn);

    // Web hosting bucket
    let websiteBucket = new Bucket(this, "websiteBucket", {
      versioned: false,
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // // Run the frontend build script
    // new NodejsFunction(this, 'FrontendBuild', {
    //     entry: '../cdk-demo/frontend/script.js', // replace with the path to your build script
    //     handler: 'handler', // replace with the exported handler function in your build script
    //     runtime: Runtime.NODEJS_16_X,
    //     environment: {
    //       // any environment variables needed for your build script
    //     },
    //   });

    // Trigger frontend deployment
    new BucketDeployment(this, "websiteDeployment", {
      sources: [Source.asset("../cdk-demo/frontend/build/")],
      destinationBucket: websiteBucket as any
    });

    // Create Origin Access Identity for CloudFront
    const originAccessIdentity = new OriginAccessIdentity(this, "cloudfrontOAI", {
      comment: "OAI for web application cloudfront distribution",
    });

    // Creating CloudFront distribution
    let cloudFrontDist = new Distribution(this, "cloudfrontDist", {
      defaultRootObject: "index.html",
    //   domainNames: ["enlearacademy.tk"],
    //   certificate: certificateArn,
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket as any, {
          originAccessIdentity: originAccessIdentity as any,
        }) as any,
        compress: true,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL,
      },
    });

    // Create an inline policy for the custom resource
    const customResourcePolicy = new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'], // Adjust to the specific action you need
        resources: ['*'], // Allow action on all distributions,
    });

    // Adding CloudFront invalidation
    new customResources.AwsCustomResource(this, 'CloudFrontInvalidation', {
        onCreate: {
          service: 'CloudFront',
          action: 'createInvalidation',
          parameters: {
            DistributionId: cloudFrontDist.distributionId,
            InvalidationBatch: {
              CallerReference: `${Date.now()}`,
              Paths: {
                Quantity: 1,
                Items: ['/*'],
              },
            },
          },
          physicalResourceId: customResources.PhysicalResourceId.of(Date.now().toString()),
        },
        onDelete: {
          service: 'CloudFront',
          action: 'createInvalidation',
          parameters: {
            DistributionId: cloudFrontDist.distributionId,
            InvalidationBatch: {
              CallerReference: `${Date.now()}`,
              Paths: {
                Quantity: 1,
                Items: ['/*'],
              },
            },
          },
        },
        policy: {
            statements: [customResourcePolicy]
        }
      });

    // Creating custom origin for the application load balancer
    const loadBalancerOrigin = new origins.HttpOrigin(loadBalancerDomain, {
      protocolPolicy: OriginProtocolPolicy.HTTP_ONLY,
    });

    // Creating the path pattern to direct to the load balancer origin
    cloudFrontDist.addBehavior("/generate/*", loadBalancerOrigin as any, {
      compress: true,
      viewerProtocolPolicy: ViewerProtocolPolicy.ALLOW_ALL,
      allowedMethods: AllowedMethods.ALLOW_ALL,
    });

    new cdk.CfnOutput(this, "cloudfrontDomainUrl", {
      value: cloudFrontDist.distributionDomainName,
      exportName: "cloudfrontDomainUrl",
    });
  }
}
