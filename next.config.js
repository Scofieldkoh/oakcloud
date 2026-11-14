/** @type {import('next').NextConfig} */
const nextConfig = {
  // Staff-only Annual Return creation reuses the existing drafts route.
  // A rewrite preserves the explicit prefilled-drafts API contract.
  async rewrites() {
    return [
      { source: '/api/forms/:id/prefilled-drafts', destination: '/api/forms/:id/drafts' },
    ];
  },
  // Allow cross-origin requests from custom domain in development
  allowedDevOrigins: ['oakcloud.app', '*.oakcloud.app'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config) => {
    // Persistent Webpack packs fail to snapshot resolve dependencies in this Windows/OneDrive workspace.
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
