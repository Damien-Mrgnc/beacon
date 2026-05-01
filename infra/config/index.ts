import * as pulumi from '@pulumi/pulumi'

const cfg = new pulumi.Config('beacon')
const aws = new pulumi.Config('aws')

export const env                  = cfg.require('env')
export const region               = aws.require('region')
export const vpcCidr              = cfg.get('vpcCidr') ?? '10.0.0.0/16'
export const clickhouseInstanceType = cfg.get('clickhouseInstanceType') ?? 't3.large'
export const ingestionDesiredCount  = cfg.getNumber('ingestionDesiredCount') ?? 2
export const processorDesiredCount  = cfg.getNumber('processorDesiredCount') ?? 1
export const aiDesiredCount         = cfg.getNumber('aiDesiredCount') ?? 1
export const webDesiredCount        = cfg.getNumber('webDesiredCount') ?? 2

export const prefix = `beacon-${env}`
