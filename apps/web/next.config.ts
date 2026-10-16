import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @kb/shared ships TypeScript source (see packages/shared/package.json exports),
  // so Next has to compile it as part of the web app build.
  transpilePackages: ['@kb/shared'],
}

export default nextConfig
