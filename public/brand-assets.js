const simpleIconsBase = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons';
const simpleIconsSource = 'https://www.jsdelivr.com/package/npm/simple-icons';
const localBrandSource = '/brand';
const capCutLogo = 'https://upload.wikimedia.org/wikipedia/commons/1/1c/Capcut-icon.svg';
const capCutSource = 'https://commons.wikimedia.org/wiki/File:Capcut-icon.svg';

function simpleIcon(slug, icon, fallbackIcon) {
  return {
    icon,
    logo: `${simpleIconsBase}/${slug}.svg`,
    fallbackIcon,
    sourceName: 'Simple Icons via jsDelivr',
    sourceUrl: simpleIconsSource,
    exact: true
  };
}

function localBrandLogo(fileName, icon, fallbackIcon) {
  return {
    icon,
    logo: `${localBrandSource}/${fileName}`,
    fallbackIcon,
    sourceName: 'Local brand asset',
    sourceUrl: `${localBrandSource}/${fileName}`,
    exact: true
  };
}

const BRAND_ASSETS = {
  chatgpt: localBrandLogo('ChatGPT.png', '\u{1F916}', 'bot'),
  claude: localBrandLogo('Claude.png', '\u{1F9E0}', 'brain'),
  gemini: localBrandLogo('Gemini.png', '\u2728', 'sparkles'),
  perplexity: localBrandLogo('Perplexity.png', '\u{1F50E}', 'search'),
  cursor: localBrandLogo('Cursor.png', '\u{1F5B1}\uFE0F', 'mouse-pointer-2'),
  canva: simpleIcon('canva', '🎨', 'palette'),
  capcut: {
    icon: '🎬',
    logo: capCutLogo,
    fallbackIcon: 'clapperboard',
    sourceName: 'Wikimedia Commons',
    sourceUrl: capCutSource,
    exact: true
  },
  figma: simpleIcon('figma', '🧩', 'figma'),
  google: simpleIcon('google', '🔎', 'search'),
  microsoft: simpleIcon('microsoft', '▦', 'panel-top'),
  gmail: simpleIcon('gmail', '\u{1F4E7}', 'mail'),
  notion: localBrandLogo('Notion.png', '\u25A3', 'notebook-tabs'),
  paypal: simpleIcon('paypal', '\u{1F4B3}', 'badge-dollar-sign'),
  facebook: simpleIcon('facebook', '\u{1F4D8}', 'facebook'),
  telegram: simpleIcon('telegram', '✈', 'send'),
  tiktok: simpleIcon('tiktok', '♪', 'music'),
  discord: simpleIcon('discord', '◉', 'messages-square')
};

export function normalizeBrandKey(brand) {
  return String(brand || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function getBrandAsset(brand) {
  const key = normalizeBrandKey(brand);
  return BRAND_ASSETS[key] || {
    icon: '#',
    logo: '',
    fallbackIcon: 'tag',
    sourceName: 'Fallback',
    sourceUrl: '',
    exact: false
  };
}

export function brandIcon(brand) {
  return getBrandAsset(brand).icon;
}
