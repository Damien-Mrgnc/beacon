/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@beacon/api', '@beacon/sdk'],
  output: 'standalone',
}

module.exports = nextConfig
