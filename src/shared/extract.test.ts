import { describe, expect, it } from 'vitest';
import { extractChaptersFromHtml, extractPageMetadata } from './extract';

describe('Asura page extraction', () => {
  it('extracts a series fixture using metadata and chapter links', () => {
    document.head.innerHTML = `
      <title>Return of the Mount Hua Sect | Asura Scans</title>
      <link rel="canonical" href="https://asurascans.com/comics/return-of-the-mount-hua-sect-f886a8af">
      <meta property="og:title" content="Return of the Mount Hua Sect | Asura Scans">
      <meta property="og:image" content="https://cdn.asurascans.com/cover.webp">
    `;
    document.body.innerHTML = `
      <main>
        <h1>Return of the Mount Hua Sect</h1>
        <a href="/comics/return-of-the-mount-hua-sect-f886a8af/chapter/152.10">Chapter 152.10</a>
        <a href="/comics/return-of-the-mount-hua-sect-f886a8af/chapter/171">Chapter 171</a>
      </main>
    `;
    const result = extractPageMetadata(
      document,
      'https://asurascans.com/comics/return-of-the-mount-hua-sect-f886a8af',
    );
    expect(result?.title).toBe('Return of the Mount Hua Sect');
    expect(result?.coverUrl).toBe('https://cdn.asurascans.com/cover.webp');
    expect(result?.chapters.map((chapter) => chapter.id)).toEqual(['152.10', '171']);
  });

  it('extracts a chapter reader fixture from the URL and image alt fallback', () => {
    document.head.innerHTML = '<title>Return of the Mount Hua Sect Chapter 171 - Read Online | Asura Scans</title>';
    document.body.innerHTML = `
      <main>
        <img alt="Page 1 - Chapter 171 - Return of the Mount Hua Sect">
        <a href="/comics/return-of-the-mount-hua-sect-f886a8af/chapter/170">Prev</a>
        <a href="/comics/return-of-the-mount-hua-sect-f886a8af/chapter/172">Next</a>
      </main>
    `;
    const result = extractPageMetadata(
      document,
      'https://asurascans.com/comics/return-of-the-mount-hua-sect-f886a8af/chapter/171',
    );
    expect(result?.pageType).toBe('chapter');
    expect(result?.title).toBe('Return of the Mount Hua Sect');
    expect(result?.currentChapter?.id).toBe('171');
    expect(result?.chapters.map((chapter) => chapter.id)).toEqual(['170', '171', '172']);
  });

  it('extracts unique chapter routes from server-rendered HTML', () => {
    const canonical = 'https://asurascans.com/comics/test-series-f886a8af';
    const result = extractChaptersFromHtml(
      `<a href="/comics/test-series-f886a8af/chapter/9">9</a>
       <a href="${canonical}/chapter/10">10</a>
       <a href="/comics/test-series-f886a8af/chapter/10">duplicate</a>`,
      canonical,
    );
    expect(result.map((chapter) => chapter.id)).toEqual(['9', '10']);
  });
});
