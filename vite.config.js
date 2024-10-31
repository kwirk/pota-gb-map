import { VitePWA } from 'vite-plugin-pwa';

export default {
  base: '/pota-gb-map/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: {},
      manifest: {
        name: 'UK Portable Ham Map',
        short_name: 'UK Ham Map',
        description: 'A map for UK based portable amateur radio operators, overlaying award programme references and associated land designations',
        theme_color: '#cbcbcb',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\/pota-gb-map\/[^_]+\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'local',
            },
          },
          {
            urlPattern: /^https:\/\/api.pota.app\/park\/grids\//i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pota',
            },
          },
          {
            urlPattern: /^https:\/\/www.cqgma.org\/mvs\/aaawff\.php/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'wwff',
            },
          },
          {
            urlPattern: /^https:\/\/api-db2.sota.org.uk\/api\//i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'sota',
            },
          },
          {
            urlPattern: /^https:\/\/api-beta.rsgb.online\/locator\//i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'repeaters',
            },
          },
        ],
      },
    }),
  ],
};
