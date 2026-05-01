import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { prefix, clickhouseInstanceType } from '../config'
import { type NetworkingOutputs } from './networking'

export interface DataOutputs {
  kafkaBrokers:        pulumi.Output<string>
  redisEndpoint:       pulumi.Output<string>
  clickhousePrivateIp: pulumi.Output<string>
  secrets:             SecretsOutputs
}

interface SecretsOutputs {
  clickhouse: aws.secretsmanager.Secret
  gemini:     aws.secretsmanager.Secret
  kafka:      aws.secretsmanager.Secret
}

export function createDataLayer(net: NetworkingOutputs): DataOutputs {
  const privateSubnetIds = net.privateSubnets.map((s) => s.id)

  // ── MSK (Kafka) ──────────────────────────────────────────────────────────
  const mskSubnetGroup = new aws.msk.Cluster(`${prefix}-kafka`, {
    clusterName:   `${prefix}-kafka`,
    kafkaVersion:  '3.5.1',
    numberOfBrokerNodes: 2,
    brokerNodeGroupInfo: {
      instanceType:   'kafka.t3.small',
      clientSubnets:  privateSubnetIds,
      securityGroups: [net.sgData.id],
      storageInfo: {
        ebsStorageInfo: { volumeSize: 20 },
      },
    },
    encryptionInfo: {
      encryptionInTransit: {
        clientBroker: 'TLS_PLAINTEXT',
        inCluster:    true,
      },
    },
    tags: { Name: `${prefix}-kafka` },
  })

  const kafkaBrokers = mskSubnetGroup.bootstrapBrokersTls

  // ── ElastiCache Redis ─────────────────────────────────────────────────────
  const redisSubnetGroup = new aws.elasticache.SubnetGroup(`${prefix}-redis-subnets`, {
    name:      `${prefix}-redis-subnets`,
    subnetIds: privateSubnetIds,
  })

  const redisCluster = new aws.elasticache.Cluster(`${prefix}-redis`, {
    clusterId:           `${prefix}-redis`,
    engine:              'redis',
    engineVersion:       '7.0',
    nodeType:            'cache.t3.micro',
    numCacheNodes:       1,
    subnetGroupName:     redisSubnetGroup.name,
    securityGroupIds:    [net.sgData.id],
    tags:                { Name: `${prefix}-redis` },
  })

  const redisEndpoint = pulumi.interpolate`${redisCluster.cacheNodes[0]!.address}:6379`

  // ── ClickHouse on EC2 ─────────────────────────────────────────────────────
  // Using EC2 + EBS for self-managed ClickHouse (cost-effective for FDE demo)
  // Ubuntu 22.04 LTS — eu-west-1 (hardcoded to avoid ec2:DescribeImages at preview time)
  // Update with: aws ec2 describe-images --owners 099720109477 --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*" --query "sort_by(Images,&CreationDate)[-1].ImageId"
  const clickhouseAmi = pulumi.output({ id: 'ami-0905a3c97561e0b69' })

  const clickhouseUserData = `#!/bin/bash
set -e
apt-get update -qq
apt-get install -y apt-transport-https ca-certificates curl gnupg

# Install ClickHouse
curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' | gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" > /etc/apt/sources.list.d/clickhouse.list
apt-get update -qq
apt-get install -y clickhouse-server clickhouse-client

# Configure
cat > /etc/clickhouse-server/config.d/network.xml << 'EOF'
<clickhouse>
  <listen_host>0.0.0.0</listen_host>
</clickhouse>
EOF

systemctl enable clickhouse-server
systemctl start clickhouse-server
`

  const clickhouseInstance = new aws.ec2.Instance(`${prefix}-clickhouse`, {
    ami:                      pulumi.output(clickhouseAmi).id,
    instanceType:             clickhouseInstanceType,
    subnetId:                 net.privateSubnets[0]!.id,
    vpcSecurityGroupIds:      [net.sgData.id],
    associatePublicIpAddress: false,
    userData:                 clickhouseUserData,
    rootBlockDevice: {
      volumeType: 'gp3',
      volumeSize: 100,
      encrypted:  true,
    },
    tags: { Name: `${prefix}-clickhouse` },
  })

  // ── Secrets Manager ───────────────────────────────────────────────────────
  const clickhouseSecret = new aws.secretsmanager.Secret(`${prefix}-secret-clickhouse`, {
    name:                   `${prefix}/clickhouse`,
    description:            'ClickHouse credentials for Beacon',
    recoveryWindowInDays:   0,
    tags:                   { Name: `${prefix}-clickhouse` },
  })

  new aws.secretsmanager.SecretVersion(`${prefix}-secret-clickhouse-v1`, {
    secretId:     clickhouseSecret.id,
    secretString: JSON.stringify({
      url:      pulumi.interpolate`http://${clickhouseInstance.privateIp}:8123`,
      user:     'beacon',
      password: 'REPLACE_ME',
      db:       'beacon',
    }),
  })

  const geminiSecret = new aws.secretsmanager.Secret(`${prefix}-secret-gemini`, {
    name:                  `${prefix}/gemini`,
    description:           'Gemini API key for Beacon AI service',
    recoveryWindowInDays:  0,
    tags:                  { Name: `${prefix}-gemini` },
  })

  new aws.secretsmanager.SecretVersion(`${prefix}-secret-gemini-v1`, {
    secretId:     geminiSecret.id,
    secretString: JSON.stringify({ apiKey: 'REPLACE_ME' }),
  })

  const kafkaSecret = new aws.secretsmanager.Secret(`${prefix}-secret-kafka`, {
    name:                  `${prefix}/kafka`,
    description:           'Kafka bootstrap brokers',
    recoveryWindowInDays:  0,
    tags:                  { Name: `${prefix}-kafka` },
  })

  new aws.secretsmanager.SecretVersion(`${prefix}-secret-kafka-v1`, {
    secretId:     kafkaSecret.id,
    secretString: pulumi.interpolate`{"bootstrapBrokers":"${kafkaBrokers}"}`,
  })

  return {
    kafkaBrokers,
    redisEndpoint,
    clickhousePrivateIp: clickhouseInstance.privateIp,
    secrets: {
      clickhouse: clickhouseSecret,
      gemini:     geminiSecret,
      kafka:      kafkaSecret,
    },
  }
}
