#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FargateDemoStack } from '../lib/fagate';
import { CloudfrontDemoStack } from '../lib/cloudfront';

const app = new cdk.App();

// Fargate stack
new FargateDemoStack(app, 'CdkDemoStack', {
  env: { account: '755454644004', region: 'us-east-1' },
});

// Cloudfront stack
new CloudfrontDemoStack(app, 'CloudfrontDemoStack', {
  stage: "prod",
  env: { account: '755454644004', region: 'us-east-1' },
});
