// In your backend Next.js project's next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other existing configurations

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('ws');
    }
    return config;
  },
};

module.exports = nextConfig;