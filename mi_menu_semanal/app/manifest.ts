import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MiMenú - Recetas y Congelador',
    short_name: 'MiMenú',
    description: 'Encuentra inspiración para tu próxima creación y gestiona tu congelador.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3faff',
    theme_color: '#A0F2E1',
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
