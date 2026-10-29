import { defineManifest } from '@crxjs/vite-plugin';
import packageJson from './package.json';

export const manifestConfig = {
  manifest_version: 3,
  name: 'Asura Reading Tracker',
  description: 'Keep a private, synced reading list and chapter progress for Asura Scans.',
  version: packageJson.version,
  permissions: ['storage', 'notifications'],
  host_permissions: ['https://asurascans.com/*'],
  background: {
    service_worker: 'src/background.ts',
    type: 'module',
  },
  action: {
    default_popup: 'index.html',
    default_title: 'Asura Reading Tracker',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  content_scripts: [
    {
      matches: ['https://asurascans.com/*'],
      js: ['src/content.ts'],
      run_at: 'document_idle',
    },
  ],
} satisfies chrome.runtime.ManifestV3;

export default defineManifest(manifestConfig);
