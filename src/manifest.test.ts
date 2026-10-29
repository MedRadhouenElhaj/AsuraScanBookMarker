import { describe, expect, it } from 'vitest';
// @vitest-environment node
import { manifestConfig as manifest } from '../manifest.config';

describe('production manifest', () => {
  it('uses Manifest V3 and only the intended permissions', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(['storage', 'notifications']);
    expect(manifest.host_permissions).toEqual(['https://asurascans.com/*']);
    expect(manifest.content_scripts?.[0].matches).toEqual(['https://asurascans.com/*']);
    expect(manifest.background?.service_worker).toBe('src/background.ts');
  });

  it('declares every required icon size', () => {
    expect(Object.keys(manifest.icons ?? {})).toEqual(['16', '32', '48', '128']);
  });
});
