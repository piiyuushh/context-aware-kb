import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // @kb/shared ships TypeScript source (see packages/shared/package.json exports),
  // so Next has to compile it as part of the web app build.
  transpilePackages: ['@kb/shared'],
  /**
   * The API sends no CORS headers and authenticates every request with an
   * httpOnly cookie, so the browser can only reach it same-origin. Proxying
   * `/api/v1/*` through the dev/prod web server keeps the OAuth state cookie,
   * the session cookie and every fetch on one origin.
   */
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }]
  },
  images: {
    // Only GitHub's avatar host is allowed, so `/_next/image` cannot be used as
    // an open proxy for arbitrary remote URLs.
    remotePatterns: [{ protocol: 'https', hostname: 'avatars.githubusercontent.com' }],
  },
}

export default nextConfig
