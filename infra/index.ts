/**
 * Beacon — Pulumi IaC (M10)
 *
 * Stack AWS :
 *   - VPC + subnets + NAT (networking)
 *   - ECR repos par service (registry)
 *   - MSK (Kafka) + ElastiCache (Redis) + ClickHouse EC2 (data)
 *   - ECS Fargate cluster + IAM roles (cluster)
 *   - Services Fargate : ingestion / processor / ai / web + ALB (services)
 *
 * Usage :
 *   pulumi stack init dev
 *   pulumi config set aws:region eu-west-1
 *   pulumi preview   # dry-run — aucun déploiement
 *   pulumi up        # déploiement réel (nécessite compte AWS)
 */

import * as pulumi from '@pulumi/pulumi'
import { createNetworking } from './components/networking'
import { createRegistry }   from './components/registry'
import { createDataLayer }  from './components/data'
import { createCluster }    from './components/cluster'
import { createServices }   from './components/services'
import { prefix, env, region } from './config'

// ── Orchestration ─────────────────────────────────────────────────────────────
const net      = createNetworking()
const registry = createRegistry()
const data     = createDataLayer(net)
const cluster  = createCluster()
const services = createServices(net, registry, cluster, data)

// ── Exports (visible dans `pulumi stack output`) ──────────────────────────────
export const stackInfo = {
  env,
  region,
  prefix,
}

export const endpoints = {
  alb:       services.albDnsName,
  ingestion: services.ingestionEndpoint,
  web:       services.webEndpoint,
}

export const ecrRepos = {
  ingestion: registry.ingestionRepo.repositoryUrl,
  processor: registry.processorRepo.repositoryUrl,
  ai:        registry.aiRepo.repositoryUrl,
  web:       registry.webRepo.repositoryUrl,
}

export const networking = {
  vpcId:          net.vpc.id,
  publicSubnets:  net.publicSubnets.map((s) => s.id),
  privateSubnets: net.privateSubnets.map((s) => s.id),
}

export const data_outputs = {
  kafkaBrokers:  data.kafkaBrokers,
  redisEndpoint: data.redisEndpoint,
  clickhouseIp:  data.clickhousePrivateIp,
}

pulumi.log.info(`Beacon stack [${env}] on ${region} — ${prefix}`)
