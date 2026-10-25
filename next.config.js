/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },

  // `sharp` tem binario nativo (.node). O Next precisa empacotar o pacote
  // como dependencia externa do server, senao o binario nao acompanha o
  // bundle e a conversao das paginas para JPEG falha em runtime.
  serverExternalPackages: ['sharp'],

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
