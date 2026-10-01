import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Em GitHub Pages a app fica num subcaminho: build com VITE_BASE=/financas/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // A pdfjs pesa 2,5 MB entre o módulo e o worker. Pré-carregá-la obrigaria
        // toda a gente a descarregá-la à instalação, por causa de uma importação
        // que acontece uma vez por mês — e o worker excede o limite do workbox,
        // por isso nem sequer ficaria disponível offline. Fica fora do precache e
        // é guardada em cache depois do primeiro uso: a primeira importação
        // precisa de rede, as seguintes não.
        globIgnores: ['**/pdf*.{js,mjs}'],
        runtimeCaching: [
          {
            urlPattern: new RegExp('/assets/pdf.*\\.m?js$'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'leitor-pdf',
              expiration: { maxEntries: 4 },
            },
          },
        ],
      },
      includeAssets: ['icone.svg', 'icone-192.png', 'icone-512.png'],
      manifest: {
        name: 'Finanças',
        short_name: 'Finanças',
        description: 'Controlo de gastos, excedentes e património',
        lang: 'pt-PT',
        theme_color: '#1a1a19',
        background_color: '#fcfcfb',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icone-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
