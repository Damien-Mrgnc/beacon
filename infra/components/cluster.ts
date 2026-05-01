import * as aws from '@pulumi/aws'
import { prefix } from '../config'

export interface ClusterOutputs {
  cluster:         aws.ecs.Cluster
  executionRole:   aws.iam.Role
  taskRole:        aws.iam.Role
  logGroup:        aws.cloudwatch.LogGroup
}

export function createCluster(): ClusterOutputs {
  // ── ECS Cluster ───────────────────────────────────────────────────────────
  const cluster = new aws.ecs.Cluster(`${prefix}-cluster`, {
    name: `${prefix}-cluster`,
    settings: [{ name: 'containerInsights', value: 'enabled' }],
    tags: { Name: `${prefix}-cluster` },
  })

  new aws.ecs.ClusterCapacityProviders(`${prefix}-cluster-cp`, {
    clusterName:       cluster.name,
    capacityProviders: ['FARGATE', 'FARGATE_SPOT'],
    defaultCapacityProviderStrategies: [
      { capacityProvider: 'FARGATE',      weight: 1, base: 1 },
      { capacityProvider: 'FARGATE_SPOT', weight: 3 },
    ],
  })

  // ── CloudWatch Log Group ──────────────────────────────────────────────────
  const logGroup = new aws.cloudwatch.LogGroup(`${prefix}-logs`, {
    name:            `/ecs/${prefix}`,
    retentionInDays: 14,
    tags:            { Name: `${prefix}-logs` },
  })

  // ── IAM — Execution Role (ECS pulls image + secrets) ─────────────────────
  const executionRole = new aws.iam.Role(`${prefix}-exec-role`, {
    name: `${prefix}-exec-role`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect:    'Allow',
        Principal: { Service: 'ecs-tasks.amazonaws.com' },
        Action:    'sts:AssumeRole',
      }],
    }),
    tags: { Name: `${prefix}-exec-role` },
  })

  new aws.iam.RolePolicyAttachment(`${prefix}-exec-role-ecr`, {
    role:      executionRole.name,
    policyArn: 'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
  })

  // Allow reading secrets from Secrets Manager
  new aws.iam.RolePolicy(`${prefix}-exec-role-secrets`, {
    role: executionRole.id,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect:   'Allow',
        Action:   ['secretsmanager:GetSecretValue'],
        Resource: [`arn:aws:secretsmanager:*:*:secret:${prefix}/*`],
      }],
    }),
  })

  // ── IAM — Task Role (app-level permissions) ───────────────────────────────
  const taskRole = new aws.iam.Role(`${prefix}-task-role`, {
    name: `${prefix}-task-role`,
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Effect:    'Allow',
        Principal: { Service: 'ecs-tasks.amazonaws.com' },
        Action:    'sts:AssumeRole',
      }],
    }),
    tags: { Name: `${prefix}-task-role` },
  })

  // CloudWatch logs + X-Ray for observability
  new aws.iam.RolePolicy(`${prefix}-task-role-obs`, {
    role: taskRole.id,
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
          Resource: '*',
        },
      ],
    }),
  })

  return { cluster, executionRole, taskRole, logGroup }
}
