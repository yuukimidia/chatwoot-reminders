/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Precisa carregar dentro de um <iframe> no domínio do Chatwoot.
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          {
            key: 'Content-Security-Policy',
            value: `frame-ancestors ${process.env.CHATWOOT_BASE_URL || '*'};`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
