import { VitePWA } from 'vite-plugin-pwa'

export default {
  base: "/pota-gb-map/",
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: {},
      manifest: {
        name: 'UK Portable Ham Map',
        short_name: 'UK Ham Map',
        description: 'A map for UK based portable amateur radio operators, overlaying award programme references and associated land designations',
        theme_color: '#cbcbcb',
      }
    })
  ]
}
