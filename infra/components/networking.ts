import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { prefix, vpcCidr } from '../config'

export interface NetworkingOutputs {
  vpc:              aws.ec2.Vpc
  publicSubnets:    aws.ec2.Subnet[]
  privateSubnets:   aws.ec2.Subnet[]
  sgIngestion:      aws.ec2.SecurityGroup
  sgProcessor:      aws.ec2.SecurityGroup
  sgAi:             aws.ec2.SecurityGroup
  sgWeb:            aws.ec2.SecurityGroup
  sgAlb:            aws.ec2.SecurityGroup
  sgData:           aws.ec2.SecurityGroup
}

export function createNetworking(): NetworkingOutputs {
  // ── VPC ──────────────────────────────────────────────────────────────────
  const vpc = new aws.ec2.Vpc(`${prefix}-vpc`, {
    cidrBlock:          vpcCidr,
    enableDnsHostnames: true,
    enableDnsSupport:   true,
    tags: { Name: `${prefix}-vpc` },
  })

  const igw = new aws.ec2.InternetGateway(`${prefix}-igw`, {
    vpcId: vpc.id,
    tags:  { Name: `${prefix}-igw` },
  })

  // ── Subnets (2 AZs) ──────────────────────────────────────────────────────
  const azSuffixes = ['a', 'b']
  const availabilityZones = azSuffixes.map((s) => pulumi.interpolate`eu-west-1${s}`)

  const publicSubnets: aws.ec2.Subnet[] = availabilityZones.map((az, i) =>
    new aws.ec2.Subnet(`${prefix}-public-${i}`, {
      vpcId:               vpc.id,
      availabilityZone:    az,
      cidrBlock:           `10.0.${i}.0/24`,
      mapPublicIpOnLaunch: true,
      tags:                { Name: `${prefix}-public-${i}` },
    }),
  )

  const privateSubnets: aws.ec2.Subnet[] = availabilityZones.map((az, i) =>
    new aws.ec2.Subnet(`${prefix}-private-${i}`, {
      vpcId:            vpc.id,
      availabilityZone: az,
      cidrBlock:        `10.0.${i + 10}.0/24`,
      tags:             { Name: `${prefix}-private-${i}` },
    }),
  )

  // ── NAT Gateways (one per AZ for HA) ─────────────────────────────────────
  const natEips = publicSubnets.map((_, i) =>
    new aws.ec2.Eip(`${prefix}-nat-eip-${i}`, { domain: 'vpc' }),
  )

  const natGateways = publicSubnets.map((subnet, i) =>
    new aws.ec2.NatGateway(`${prefix}-nat-${i}`, {
      subnetId:     subnet.id,
      allocationId: natEips[i]!.id,
      tags:         { Name: `${prefix}-nat-${i}` },
    }),
  )

  // ── Route tables ──────────────────────────────────────────────────────────
  const publicRt = new aws.ec2.RouteTable(`${prefix}-rt-public`, {
    vpcId:  vpc.id,
    routes: [{ cidrBlock: '0.0.0.0/0', gatewayId: igw.id }],
    tags:   { Name: `${prefix}-rt-public` },
  })

  publicSubnets.forEach((subnet, i) =>
    new aws.ec2.RouteTableAssociation(`${prefix}-rta-public-${i}`, {
      subnetId:     subnet.id,
      routeTableId: publicRt.id,
    }),
  )

  privateSubnets.forEach((subnet, i) => {
    const rt = new aws.ec2.RouteTable(`${prefix}-rt-private-${i}`, {
      vpcId:  vpc.id,
      routes: [{ cidrBlock: '0.0.0.0/0', natGatewayId: natGateways[i]!.id }],
      tags:   { Name: `${prefix}-rt-private-${i}` },
    })
    new aws.ec2.RouteTableAssociation(`${prefix}-rta-private-${i}`, {
      subnetId:     subnet.id,
      routeTableId: rt.id,
    })
  })

  // ── Security Groups ───────────────────────────────────────────────────────
  const sgAlb = new aws.ec2.SecurityGroup(`${prefix}-sg-alb`, {
    vpcId:       vpc.id,
    description: 'ALB - public HTTP/HTTPS',
    ingress: [
      { protocol: 'tcp', fromPort: 80,  toPort: 80,  cidrBlocks: ['0.0.0.0/0'] },
      { protocol: 'tcp', fromPort: 443, toPort: 443, cidrBlocks: ['0.0.0.0/0'] },
    ],
    egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:  { Name: `${prefix}-sg-alb` },
  })

  const sgIngestion = new aws.ec2.SecurityGroup(`${prefix}-sg-ingestion`, {
    vpcId:       vpc.id,
    description: 'Ingestion FastAPI - traffic from ALB',
    ingress: [
      { protocol: 'tcp', fromPort: 8000, toPort: 8000, securityGroups: [sgAlb.id] },
    ],
    egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:  { Name: `${prefix}-sg-ingestion` },
  })

  const sgProcessor = new aws.ec2.SecurityGroup(`${prefix}-sg-processor`, {
    vpcId:       vpc.id,
    description: 'Stream Processor - no inbound',
    ingress: [],
    egress:  [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:    { Name: `${prefix}-sg-processor` },
  })

  const sgAi = new aws.ec2.SecurityGroup(`${prefix}-sg-ai`, {
    vpcId:       vpc.id,
    description: 'AI Service FastAPI - internal only',
    ingress: [
      { protocol: 'tcp', fromPort: 8002, toPort: 8002, securityGroups: [sgAlb.id] },
    ],
    egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:  { Name: `${prefix}-sg-ai` },
  })

  const sgWeb = new aws.ec2.SecurityGroup(`${prefix}-sg-web`, {
    vpcId:       vpc.id,
    description: 'Next.js frontend - traffic from ALB',
    ingress: [
      { protocol: 'tcp', fromPort: 3000, toPort: 3000, securityGroups: [sgAlb.id] },
    ],
    egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:  { Name: `${prefix}-sg-web` },
  })

  const sgData = new aws.ec2.SecurityGroup(`${prefix}-sg-data`, {
    vpcId:       vpc.id,
    description: 'Data tier - MSK, ElastiCache, ClickHouse',
    ingress: [
      // Kafka (MSK)
      { protocol: 'tcp', fromPort: 9092, toPort: 9092, securityGroups: [sgIngestion.id, sgProcessor.id] },
      // Redis
      { protocol: 'tcp', fromPort: 6379, toPort: 6379, securityGroups: [sgIngestion.id, sgProcessor.id, sgAi.id, sgWeb.id] },
      // ClickHouse HTTP + native
      { protocol: 'tcp', fromPort: 8123, toPort: 8123, securityGroups: [sgProcessor.id, sgAi.id, sgWeb.id] },
      { protocol: 'tcp', fromPort: 9000, toPort: 9000, securityGroups: [sgProcessor.id] },
    ],
    egress: [{ protocol: '-1', fromPort: 0, toPort: 0, cidrBlocks: ['0.0.0.0/0'] }],
    tags:  { Name: `${prefix}-sg-data` },
  })

  return {
    vpc,
    publicSubnets,
    privateSubnets,
    sgIngestion,
    sgProcessor,
    sgAi,
    sgWeb,
    sgAlb,
    sgData,
  }
}
