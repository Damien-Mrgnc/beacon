import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { prefix, ingestionDesiredCount, processorDesiredCount, aiDesiredCount, webDesiredCount } from '../config'
import { type NetworkingOutputs } from './networking'
import { type RegistryOutputs } from './registry'
import { type ClusterOutputs } from './cluster'
import { type DataOutputs } from './data'

export interface ServicesOutputs {
  albDnsName:        pulumi.Output<string>
  ingestionEndpoint: pulumi.Output<string>
  webEndpoint:       pulumi.Output<string>
}

interface ServiceConfig {
  name:         string
  image:        pulumi.Input<string>
  port:         number
  cpu:          number
  memory:       number
  desiredCount: number
  environment:  { name: string; value: pulumi.Input<string> }[]
  secrets:      { name: string; valueFrom: pulumi.Input<string> }[]
  securityGroup: aws.ec2.SecurityGroup
  subnets:       aws.ec2.Subnet[]
  publicIp:      boolean
  // If set, register a target group on the ALB
  albListenerArn?: pulumi.Input<string>
  albPriority?:    number
  healthCheckPath?: string
}

function createFargateService(
  cluster: ClusterOutputs,
  cfg: ServiceConfig,
): { service: aws.ecs.Service; targetGroup: aws.lb.TargetGroup | undefined } {
  const logGroupName = pulumi.interpolate`/ecs/${prefix}`

  // Resolve all Output<string> values inside secrets before JSON.stringify
  const resolvedSecrets = pulumi.all(
    cfg.secrets.map((s) => pulumi.output(s.valueFrom).apply((v) => ({ name: s.name, valueFrom: v })))
  )

  const resolvedEnv = pulumi.all(
    cfg.environment.map((e) => pulumi.output(e.value).apply((v) => ({ name: e.name, value: v })))
  )

  const containerDef = pulumi.all([cfg.image, logGroupName, resolvedSecrets, resolvedEnv]).apply(
    ([image, lgName, secrets, environment]) =>
      JSON.stringify([{
        name:        cfg.name,
        image,
        essential:   true,
        portMappings: cfg.port > 0 ? [{ containerPort: cfg.port, protocol: 'tcp' }] : [],
        environment,
        secrets,
        logConfiguration: {
          logDriver: 'awslogs',
          options: {
            'awslogs-group':         lgName,
            'awslogs-region':        'eu-west-1',
            'awslogs-stream-prefix': cfg.name,
          },
        },
      }]),
  )

  const taskDef = new aws.ecs.TaskDefinition(`${prefix}-td-${cfg.name}`, {
    family:                  `${prefix}-${cfg.name}`,
    cpu:                     String(cfg.cpu),
    memory:                  String(cfg.memory),
    networkMode:             'awsvpc',
    requiresCompatibilities: ['FARGATE'],
    executionRoleArn:        cluster.executionRole.arn,
    taskRoleArn:             cluster.taskRole.arn,
    containerDefinitions:    containerDef,
    tags:                    { Name: `${prefix}-td-${cfg.name}` },
  })

  let targetGroup: aws.lb.TargetGroup | undefined
  let loadBalancers: aws.types.input.ecs.ServiceLoadBalancer[] = []

  if (cfg.albListenerArn && cfg.albPriority !== undefined) {
    targetGroup = new aws.lb.TargetGroup(`${prefix}-tg-${cfg.name}`, {
      name:            `${prefix}-${cfg.name}`.substring(0, 32),
      port:            cfg.port,
      protocol:        'HTTP',
      targetType:      'ip',
      vpcId:           cfg.securityGroup.vpcId,
      healthCheck: {
        path:               cfg.healthCheckPath ?? '/health',
        interval:           30,
        healthyThreshold:   2,
        unhealthyThreshold: 3,
      },
      tags: { Name: `${prefix}-tg-${cfg.name}` },
    })

    new aws.lb.ListenerRule(`${prefix}-lr-${cfg.name}`, {
      listenerArn: cfg.albListenerArn,
      priority:    cfg.albPriority,
      conditions:  [{ pathPattern: { values: ['/*'] } }],
      actions:     [{ type: 'forward', targetGroupArn: targetGroup.arn }],
    })

    loadBalancers = [{
      targetGroupArn: targetGroup.arn,
      containerName:  cfg.name,
      containerPort:  cfg.port,
    }]
  }

  const service = new aws.ecs.Service(`${prefix}-svc-${cfg.name}`, {
    name:           `${prefix}-${cfg.name}`,
    cluster:        cluster.cluster.arn,
    taskDefinition: taskDef.arn,
    desiredCount:   cfg.desiredCount,
    launchType:     'FARGATE',
    networkConfiguration: {
      subnets:        cfg.subnets.map((s) => s.id),
      securityGroups: [cfg.securityGroup.id],
      assignPublicIp: cfg.publicIp,
    },
    loadBalancers,
    deploymentCircuitBreaker: { enable: true, rollback: true },
    tags: { Name: `${prefix}-svc-${cfg.name}` },
  }, { dependsOn: targetGroup ? [targetGroup] : [] })

  return { service, targetGroup }
}

export function createServices(
  net:      NetworkingOutputs,
  registry: RegistryOutputs,
  cluster:  ClusterOutputs,
  data:     DataOutputs,
): ServicesOutputs {
  // ── Application Load Balancer ─────────────────────────────────────────────
  const alb = new aws.lb.LoadBalancer(`${prefix}-alb`, {
    name:           `${prefix}-alb`,
    internal:       false,
    loadBalancerType: 'application',
    securityGroups: [net.sgAlb.id],
    subnets:        net.publicSubnets.map((s) => s.id),
    tags:           { Name: `${prefix}-alb` },
  })

  // Default 404 listener — specific rules override this per service
  const httpListener = new aws.lb.Listener(`${prefix}-listener-http`, {
    loadBalancerArn: alb.arn,
    port:            80,
    protocol:        'HTTP',
    defaultActions:  [{ type: 'fixed-response', fixedResponse: { contentType: 'text/plain', statusCode: '404', messageBody: 'Not Found' } }],
  })

  // ── Ingestion API (port 8000) ─────────────────────────────────────────────
  const ingestionEnv = [
    { name: 'KAFKA_BOOTSTRAP_SERVERS', value: data.kafkaBrokers },
    { name: 'REDIS_URL',               value: pulumi.interpolate`redis://${data.redisEndpoint}` },
    { name: 'KAFKA_TOPIC',             value: 'beacon.events' },
  ]

  const { targetGroup: _ingestionTg } = createFargateService(cluster, {
    name:          'ingestion',
    image:         pulumi.interpolate`${registry.ingestionRepo.repositoryUrl}:latest`,
    port:          8000,
    cpu:           512,
    memory:        1024,
    desiredCount:  ingestionDesiredCount,
    environment:   ingestionEnv,
    secrets: [
      { name: 'CLICKHOUSE_URL',      valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:url::` },
      { name: 'CLICKHOUSE_USER',     valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:user::` },
      { name: 'CLICKHOUSE_PASSWORD', valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:password::` },
    ],
    securityGroup:   net.sgIngestion,
    subnets:         net.privateSubnets,
    publicIp:        false,
    albListenerArn:  httpListener.arn,
    albPriority:     10,
    healthCheckPath: '/health',
  })

  // ── Stream Processor (no inbound — Kafka consumer) ────────────────────────
  createFargateService(cluster, {
    name:         'processor',
    image:        pulumi.interpolate`${registry.processorRepo.repositoryUrl}:latest`,
    port:         0, // no HTTP port
    cpu:          256,
    memory:       512,
    desiredCount: processorDesiredCount,
    environment: [
      { name: 'KAFKA_BOOTSTRAP_SERVERS', value: data.kafkaBrokers },
      { name: 'KAFKA_TOPIC',             value: 'beacon.events' },
      { name: 'KAFKA_GROUP_ID',          value: 'beacon-processor' },
      { name: 'REDIS_URL',               value: pulumi.interpolate`redis://${data.redisEndpoint}` },
      { name: 'CLICKHOUSE_DB',           value: 'beacon' },
    ],
    secrets: [
      { name: 'CLICKHOUSE_URL',      valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:url::` },
      { name: 'CLICKHOUSE_USER',     valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:user::` },
      { name: 'CLICKHOUSE_PASSWORD', valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:password::` },
    ],
    securityGroup: net.sgProcessor,
    subnets:       net.privateSubnets,
    publicIp:      false,
  })

  // ── AI Service (port 8002) ────────────────────────────────────────────────
  createFargateService(cluster, {
    name:         'ai',
    image:        pulumi.interpolate`${registry.aiRepo.repositoryUrl}:latest`,
    port:         8002,
    cpu:          512,
    memory:       1024,
    desiredCount: aiDesiredCount,
    environment: [
      { name: 'REDIS_URL',     value: pulumi.interpolate`redis://${data.redisEndpoint}` },
      { name: 'CLICKHOUSE_DB', value: 'beacon' },
    ],
    secrets: [
      { name: 'GEMINI_API_KEY',      valueFrom: pulumi.interpolate`${data.secrets.gemini.arn}:apiKey::` },
      { name: 'CLICKHOUSE_URL',      valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:url::` },
      { name: 'CLICKHOUSE_USER',     valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:user::` },
      { name: 'CLICKHOUSE_PASSWORD', valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:password::` },
    ],
    securityGroup:   net.sgAi,
    subnets:         net.privateSubnets,
    publicIp:        false,
    albListenerArn:  httpListener.arn,
    albPriority:     20,
    healthCheckPath: '/health',
  })

  // ── Next.js Frontend (port 3000) ──────────────────────────────────────────
  createFargateService(cluster, {
    name:         'web',
    image:        pulumi.interpolate`${registry.webRepo.repositoryUrl}:latest`,
    port:         3000,
    cpu:          512,
    memory:       1024,
    desiredCount: webDesiredCount,
    environment: [
      { name: 'CLICKHOUSE_DB',   value: 'beacon' },
      { name: 'AI_SERVICE_URL',  value: pulumi.interpolate`http://${net.sgAi.id}:8002` },
      { name: 'NODE_ENV',        value: 'production' },
    ],
    secrets: [
      { name: 'CLICKHOUSE_URL',      valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:url::` },
      { name: 'CLICKHOUSE_USER',     valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:user::` },
      { name: 'CLICKHOUSE_PASSWORD', valueFrom: pulumi.interpolate`${data.secrets.clickhouse.arn}:password::` },
    ],
    securityGroup:   net.sgWeb,
    subnets:         net.privateSubnets,
    publicIp:        false,
    albListenerArn:  httpListener.arn,
    albPriority:     30,
    healthCheckPath: '/api/health',
  })

  return {
    albDnsName:        alb.dnsName,
    ingestionEndpoint: pulumi.interpolate`http://${alb.dnsName}`,
    webEndpoint:       pulumi.interpolate`http://${alb.dnsName}`,
  }
}
