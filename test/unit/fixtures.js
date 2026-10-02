// Fixtures no formato que content/extract.js e content/capture.js devolvem.

export function rawPage() {
  return {
    meta: {
      url: 'https://exemplo.com/',
      title: 'Exemplo',
      lang: 'pt-BR',
      description: '',
      themeColor: '',
      generator: '',
      colorScheme: 'normal',
      viewport: { width: 1440, height: 900, dpr: 1 },
      rootFontSize: 16,
      pageBackground: '#0b0b0f',
      bodyColor: '#f4f4f5',
      bodyFont: 'Inter',
      counts: { total: 900, visited: 900, styled: 850 },
      sheets: { total: 3, blocked: [], imports: ['https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&display=swap'] },
      ms: { dom: 40, css: 12, total: 60 },
    },
    colors: [
      { hex: '#0b0b0f', a: 1, css: '#0b0b0f', count: 40, text: 0, chars: 0, bg: 40, area: 5e6, border: 0, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 0, link: 0 },
      { hex: '#f4f4f5', a: 1, css: '#f4f4f5', count: 300, text: 300, chars: 9000, bg: 0, area: 0, border: 0, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 10, link: 0 },
      { hex: '#a1a1aa', a: 1, css: '#a1a1aa', count: 120, text: 120, chars: 3000, bg: 0, area: 0, border: 0, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 0, link: 0 },
      { hex: '#c6f432', a: 1, css: '#c6f432', count: 30, text: 4, chars: 40, bg: 20, area: 20000, border: 2, fill: 4, shadow: 0, gradient: 0, ibg: 18, itext: 0, link: 4 },
      { hex: '#18181b', a: 1, css: '#18181b', count: 25, text: 0, chars: 0, bg: 25, area: 900000, border: 0, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 0, link: 0 },
      { hex: '#27272a', a: 1, css: '#27272a', count: 60, text: 0, chars: 0, bg: 0, area: 0, border: 60, fill: 0, shadow: 0, gradient: 0, ibg: 0, itext: 0, link: 0 },
      { hex: '#000000', a: 0.25, css: '#00000040', count: 12, text: 0, chars: 0, bg: 0, area: 0, border: 0, fill: 0, shadow: 12, gradient: 0, ibg: 0, itext: 0, link: 0 },
      { hex: '#7c3aed', a: 1, css: '#7c3aed', count: 6, text: 0, chars: 0, bg: 0, area: 0, border: 0, fill: 0, shadow: 0, gradient: 6, ibg: 0, itext: 0, link: 0, original: 'oklch(54.1% 0.281 293.009)' },
    ],
    gradients: [{ css: 'linear-gradient(90deg, rgb(124, 58, 237) 0%, rgb(198, 244, 50) 100%)', count: 3 }],
    typography: [
      { stack: 'Inter, sans-serif', family: 'Inter', size: 16, weight: 400, lineHeight: '24px', letterSpacing: 'normal', transform: 'none', style: 'normal', count: 200, chars: 8000, tags: { p: 180, li: 20 }, sample: 'Texto corrido' },
      { stack: '"Space Grotesk", sans-serif', family: 'Space Grotesk', size: 64, weight: 700, lineHeight: '70.4px', letterSpacing: '-1.28px', transform: 'none', style: 'normal', count: 2, chars: 60, tags: { h1: 2 }, sample: 'Título grande' },
      { stack: '"Space Grotesk", sans-serif', family: 'Space Grotesk', size: 40, weight: 700, lineHeight: '48px', letterSpacing: 'normal', transform: 'none', style: 'normal', count: 6, chars: 180, tags: { h2: 6 }, sample: 'Seção' },
      { stack: 'Inter, sans-serif', family: 'Inter', size: 14, weight: 500, lineHeight: '20px', letterSpacing: 'normal', transform: 'none', style: 'normal', count: 30, chars: 500, tags: { button: 30 }, sample: 'Começar' },
      { stack: 'Inter, sans-serif', family: 'Inter', size: 12, weight: 600, lineHeight: '16px', letterSpacing: '1.2px', transform: 'uppercase', style: 'normal', count: 12, chars: 200, tags: { p: 12 }, sample: 'NOVIDADE' },
    ],
    families: [
      { family: 'Inter', stack: 'Inter, sans-serif', count: 242, chars: 8700, weights: { 400: 8000, 500: 500, 600: 200 }, italic: false, tags: { p: 192, button: 30, li: 20 } },
      { family: 'Space Grotesk', stack: '"Space Grotesk", sans-serif', count: 8, chars: 240, weights: { 700: 240 }, italic: false, tags: { h1: 2, h2: 6 } },
    ],
    fontFaces: [
      { family: 'Space Grotesk', weight: '700', style: 'normal', display: 'swap', unicodeRange: 'U+0000-00FF, U+0131', sources: [{ url: 'https://fonts.gstatic.com/s/spacegrotesk/v16/a.woff2', format: 'woff2' }] },
      { family: 'Inter', weight: '100 900', style: 'normal', display: 'swap', unicodeRange: '', sources: [{ url: 'https://exemplo.com/fonts/inter.woff2', format: 'woff2' }] },
    ],
    fontFiles: [],
    spacing: {
      padding: [{ px: 16, count: 120 }, { px: 24, count: 80 }, { px: 8, count: 60 }, { px: 32, count: 30 }, { px: 12, count: 20 }],
      margin: [{ px: 16, count: 40 }, { px: 48, count: 10 }],
      gap: [{ px: 16, count: 30 }, { px: 8, count: 25 }, { px: 64, count: 4 }],
    },
    radii: [{ value: '12px', count: 40 }, { value: '9999px', count: 18 }, { value: '6px', count: 12 }],
    shadows: [{ value: 'rgba(0, 0, 0, 0.25) 0px 10px 30px -10px', count: 8 }, { value: 'rgba(0, 0, 0, 0.1) 0px 1px 2px 0px', count: 20 }],
    textShadows: [],
    filters: [],
    backdrops: [{ value: 'blur(12px)', count: 3 }],
    borders: [{ value: '1px solid', count: 60 }],
    maxWidths: [{ px: 1200, count: 8 }],
    displays: [{ value: 'flex', count: 300 }],
    breakpoints: [{ px: 640, count: 20 }, { px: 768, count: 40 }, { px: 1024, count: 35 }, { px: 1280, count: 8 }],
    containerQueries: 0,
    variables: [
      { name: '--background', scope: 'root', value: '0 0% 4%', resolved: '0 0% 4%', type: 'color', color: { hex: '#0a0a0a', a: 1, css: '#0a0a0a' }, channels: 'hsl', used: true },
      { name: '--background', scope: 'dark', value: '0 0% 100%', resolved: '0 0% 100%', type: 'color', color: { hex: '#ffffff', a: 1, css: '#ffffff' }, channels: 'hsl', used: true },
      { name: '--radius', scope: 'root', value: '0.75rem', resolved: '0.75rem', type: 'dimension', color: null, used: true },
      { name: '--nao-usada', scope: 'root', value: '1px', resolved: '1px', type: 'dimension', color: null, used: false },
    ],
    properties: [],
    keyframes: [
      { name: 'fadeUp', css: '@keyframes fadeUp { \n  0% { opacity: 0; transform: translateY(20px); }\n  100% { opacity: 1; transform: none; }\n}' },
      { name: 'spin', css: '@keyframes spin { \n  100% { transform: rotate(360deg); }\n}' },
    ],
    transitions: [
      { property: 'all', durationMs: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', delayMs: 0, count: 50 },
      { property: 'opacity', durationMs: 600, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', delayMs: 0, count: 12 },
    ],
    animations: [{ name: 'fadeUp', durationMs: 800, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', delayMs: 0, iterations: '1', direction: 'normal', fillMode: 'both', timeline: 'auto', count: 6, example: 'div.hero' }],
    running: [
      { kind: 'waapi', target: 'div.card', duration: 500, delay: 0, iterations: 1, easing: 'ease-out', direction: 'normal', fill: 'forwards', keyframes: [{ offset: 0, opacity: '0', transform: 'scale(0.9)' }, { offset: 1, opacity: '1', transform: 'none' }] },
    ],
    components: {
      buttons: [
        { css: { background: '#c6f432', color: '#0b0b0f', border: 'none', 'border-radius': '9999px', padding: '12px 24px', 'font-family': 'Inter', 'font-size': '14px', 'font-weight': '500', 'line-height': '20px', 'letter-spacing': 'normal', 'text-transform': 'none', 'box-shadow': 'none', transition: 'all 0.2s ease', height: '44px' }, count: 10, sample: 'Começar', example: 'a.btn', states: { hover: { 'background-color': '#d4ff4a' } } },
        { css: { background: 'transparent', color: '#f4f4f5', border: '1px solid #27272a', 'border-radius': '9999px', padding: '12px 24px', 'font-family': 'Inter', 'font-size': '14px', 'font-weight': '500' }, count: 6, sample: 'Saiba mais', example: 'a.btn-ghost', states: {} },
      ],
      inputs: [],
      cards: [{ css: { background: '#18181b', border: '1px solid #27272a', 'border-radius': '12px', padding: '24px', 'box-shadow': 'none' }, count: 9, sample: '', example: 'div.card', states: {} }],
      links: [],
    },
    assets: {
      images: [
        { url: 'https://exemplo.com/hero.webp', kind: 'img', count: 1, w: 1600, h: 900, alt: 'Hero' },
        { url: 'https://exemplo.com/favicon.ico', kind: 'favicon', count: 1, w: 0, h: 0, alt: '' },
      ],
      svgs: [{ markup: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12h14" stroke="currentColor"/></svg>', name: 'arrow-right', w: 24, h: 24, count: 5 }],
      videos: [],
      lottie: [],
      rive: [],
      models: [],
    },
    stack: [{ name: 'Next.js', kind: 'framework', evidence: '#__next' }, { name: 'Tailwind CSS', kind: 'css', evidence: '120 classes' }],
  };
}

export function scanResult() {
  return {
    reveals: [
      { pattern: 'fade-up', from: { opacity: 0, tx: 0, ty: 40, sx: 1, sy: 1, rot: 0, blur: 0, clip: 'none' }, to: { opacity: 1, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, blur: 0, clip: 'none' }, trigger: 'classe .aos-animate', durationMs: 800, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', count: 12, examples: ['section.features > div'] },
    ],
    running: [],
    scrolled: 4000,
  };
}

export function capture() {
  return {
    source: { kind: 'web', url: 'https://exemplo.com/', title: 'Exemplo', viewport: { width: 1440, height: 900 }, at: '2026-10-01T12:00:00Z' },
    root: { description: 'div.card', width: 320, height: 200 },
    tree: {
      t: 'el', tag: 'div', attrs: {}, cls: 'div1',
      decls: [['display', 'flex'], ['flex-direction', 'column'], ['row-gap', '16px'], ['column-gap', '16px'], ['padding-top', '24px'], ['padding-right', '24px'], ['padding-bottom', '24px'], ['padding-left', '24px'], ['background-color', '#18181b'], ['border-top-left-radius', '12px'], ['border-top-right-radius', '12px'], ['border-bottom-right-radius', '12px'], ['border-bottom-left-radius', '12px'], ['box-sizing', 'border-box'], ['color', '#f4f4f5'], ['font-family', 'Inter, sans-serif'], ['width', '320px'], ['max-width', '100%']],
      children: [
        { t: 'el', tag: 'h3', attrs: {}, cls: 'h32', decls: [['font-size', '20px'], ['font-weight', '700'], ['margin-top', '0px'], ['margin-bottom', '0px'], ['box-sizing', 'border-box']], children: [{ t: 'text', v: 'Plano Pro' }] },
        { t: 'el', tag: 'p', attrs: {}, cls: 'p3', decls: [['color', '#a1a1aa'], ['margin-top', '0px'], ['margin-bottom', '0px'], ['box-sizing', 'border-box']], children: [{ t: 'text', v: 'Tudo { que } você precisa ' }] },
        {
          t: 'el', tag: 'a', attrs: { href: 'https://exemplo.com/pro' }, cls: 'a4',
          decls: [['display', 'inline-flex'], ['align-items', 'center'], ['column-gap', '8px'], ['row-gap', '8px'], ['padding-top', '12px'], ['padding-bottom', '12px'], ['padding-left', '20px'], ['padding-right', '20px'], ['background-color', '#c6f432'], ['color', '#0b0b0f'], ['border-top-left-radius', '9999px'], ['border-top-right-radius', '9999px'], ['border-bottom-right-radius', '9999px'], ['border-bottom-left-radius', '9999px'], ['text-decoration-line', 'none'], ['transition-property', 'transform'], ['transition-duration', '0.2s'], ['transition-timing-function', 'ease'], ['box-sizing', 'border-box']],
          children: [
            { t: 'text', v: 'Assinar' },
            { t: 'el', tag: 'svg', ns: 'svg', cls: 'svg5', decls: [['flex-shrink', '0']], attrs: { xmlns: 'http://www.w3.org/2000/svg', width: '16', height: '16', viewBox: '0 0 24 24', color: '#0b0b0f', 'stroke-width': '2' }, children: [{ t: 'el', tag: 'path', ns: 'svg', attrs: { d: 'M5 12h14', stroke: 'currentColor', 'stroke-linecap': 'round' }, children: [] }] },
          ],
        },
      ],
    },
    pseudo: [{ cls: 'div1', pseudo: 'before', decls: [['content', '""'], ['position', 'absolute'], ['width', '8px'], ['height', '8px']] }],
    states: [
      { cls: 'a4', state: 'hover', ownerCls: null, decls: [['transform', 'translateY(-2px)'], ['background-color', '#d4ff4a']] },
      { cls: 'h32', state: 'hover', ownerCls: 'div1', decls: [['color', '#c6f432']] },
    ],
    keyframes: ['@keyframes pulse { 50% { opacity: .5; } }'],
    fontFaces: ["@font-face {\n  font-family: 'Inter';\n  src: url(\"https://exemplo.com/fonts/inter.woff2\") format(\"woff2\");\n}"],
    background: '#0b0b0f',
    stats: { nodes: 5, truncated: false, ms: 10 },
  };
}
