import type { NextConfig } from 'next';
import type { Configuration as WebpackConfig, WebpackOptionsNormalized } from 'webpack';

const nextConfig: NextConfig = {
  webpack: (config: WebpackConfig, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      if (Array.isArray(config.externals)) {
        config.externals.push('ws');
      } else if (typeof config.externals === 'undefined') {
        config.externals = ['ws'];
      } else {
        config.externals = [config.externals, 'ws'];
      }
    }
    return config;
  },
};

export default nextConfig;
