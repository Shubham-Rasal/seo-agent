import { withWorkflow } from 'workflow/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {},
  async rewrites() {
    return [
      { source: '/.well-known/agent-card.json', destination: '/api/agent-card' },
    ];
  },
};

export default withWorkflow(nextConfig);
