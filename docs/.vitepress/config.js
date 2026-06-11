export default {
  title: 'AstroX License',
  description: 'Developer Wiki & Documentation',
  themeConfig: {
    siteTitle: 'AstroX Docs',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/introduction' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Setup & Deploy', link: '/setup' },
        ],
      },
      {
        text: 'Discord Bot',
        items: [{ text: 'Slash Commands', link: '/commands' }],
      },
      {
        text: 'REST API Handshake',
        items: [{ text: 'Validation Endpoint', link: '/api' }],
      },
      {
        text: 'Java Integration',
        items: [{ text: 'Java Plugin Guide', link: '/java-integration' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Eangly99/astrox-license' }],
    footer: {
      message: 'Protected under Ironclad security assessments.',
      copyright: 'Copyright © 2026 AstroX License',
    },
    search: {
      provider: 'local',
    },
  },
};
