/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // As funcoes serverless precisam de tempo para baixar paginas do APMED.
  // O limite maximo do plano Hobby e 300s (configuracao "Fluid compute").
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
