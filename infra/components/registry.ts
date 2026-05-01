import * as aws from '@pulumi/aws'
import { prefix } from '../config'

export interface RegistryOutputs {
  ingestionRepo: aws.ecr.Repository
  processorRepo: aws.ecr.Repository
  aiRepo:        aws.ecr.Repository
  webRepo:       aws.ecr.Repository
}

const services = ['ingestion', 'processor', 'ai', 'web'] as const
type Service = (typeof services)[number]

function createRepo(name: Service): aws.ecr.Repository {
  const repo = new aws.ecr.Repository(`${prefix}-${name}`, {
    name:                `${prefix}/${name}`,
    imageTagMutability: 'MUTABLE',
    imageScanningConfiguration: { scanOnPush: true },
    tags: { Name: `${prefix}-${name}` },
  })

  // Lifecycle: keep only last 10 images tagged with a SHA
  new aws.ecr.LifecyclePolicy(`${prefix}-${name}-lifecycle`, {
    repository: repo.name,
    policy: JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description:  'Keep last 10 images',
          selection: {
            tagStatus:   'any',
            countType:   'imageCountMoreThan',
            countNumber: 10,
          },
          action: { type: 'expire' },
        },
      ],
    }),
  })

  return repo
}

export function createRegistry(): RegistryOutputs {
  return {
    ingestionRepo: createRepo('ingestion'),
    processorRepo: createRepo('processor'),
    aiRepo:        createRepo('ai'),
    webRepo:       createRepo('web'),
  }
}
