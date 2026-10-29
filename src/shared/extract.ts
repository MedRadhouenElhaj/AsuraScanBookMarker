import { compareChapterIds, maxChapter, parseAsuraRoute } from './domain';
import type { ChapterRef, PageMetadata } from './types';

function absoluteUrl(value: string | null | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return undefined;
  }
}

function cleanTitle(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\s*Chapter\s+[\d.]+.*$/i, '')
    .replace(/\s*\|\s*Asura Scans.*$/i, '')
    .trim();
}

export function chapterRefFromUrl(value: string, baseUrl: string): ChapterRef | undefined {
  const absolute = absoluteUrl(value, baseUrl);
  if (!absolute) return undefined;
  const parsed = parseAsuraRoute(absolute);
  if (!parsed?.chapterId) return undefined;
  return { id: parsed.chapterId, url: absolute };
}

export function extractPageMetadata(
  document: Document,
  locationHref: string,
): PageMetadata | null {
  const route = parseAsuraRoute(locationHref);
  if (!route) return null;

  const canonical = absoluteUrl(
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    locationHref,
  );
  const canonicalUrl = `https://asurascans.com/comics/${route.slug}`;
  const heading = cleanTitle(document.querySelector('h1')?.textContent);
  const ogTitle = cleanTitle(
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content,
  );
  const imageAltTitle = cleanTitle(
    document.querySelector<HTMLImageElement>('main img[alt*="Chapter"]')?.alt.replace(
      /^Page\s+\d+\s+-\s+Chapter\s+[\d.]+\s+-\s+/i,
      '',
    ),
  );
  const title = heading || ogTitle || imageAltTitle || cleanTitle(document.title) || route.slug;
  const matchingImage = [...document.querySelectorAll<HTMLImageElement>('main img')].find(
    (image) => image.alt === title,
  );
  const coverUrl = absoluteUrl(
    document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ??
      matchingImage?.src,
    locationHref,
  );

  const chapterMap = new Map<string, ChapterRef>();
  document.querySelectorAll<HTMLAnchorElement>('a[href*="/chapter/"]').forEach((anchor) => {
    const chapter = chapterRefFromUrl(anchor.getAttribute('href') ?? anchor.href, locationHref);
    const parsed = chapter ? parseAsuraRoute(chapter.url) : null;
    if (chapter && parsed?.slug === route.slug) chapterMap.set(chapter.id, chapter);
  });

  for (const chapter of extractChaptersFromHtml(document.documentElement.outerHTML, canonicalUrl)) {
    chapterMap.set(chapter.id, chapter);
  }
  const chapters = [...chapterMap.values()].sort((left, right) =>
    compareChapterIds(left.id, right.id),
  );
  const currentChapter = route.chapterId
    ? { ...chapterMap.get(route.chapterId), id: route.chapterId, url: locationHref.split('#')[0] }
    : undefined;
  if (currentChapter && !chapterMap.has(currentChapter.id)) {
    chapters.push(currentChapter);
    chapters.sort((left, right) => compareChapterIds(left.id, right.id));
  }

  // Prefer Asura's canonical series URL. The page canonical on chapter routes may point to the chapter.
  return {
    slug: route.slug,
    pageType: route.pageType,
    title,
    canonicalUrl:
      route.pageType === 'series' && canonical?.includes(`/comics/${route.slug}`)
        ? canonical
        : canonicalUrl,
    coverUrl,
    currentChapter,
    chapters,
  };
}

export function extractChaptersFromHtml(html: string, canonicalUrl: string): ChapterRef[] {
  const route = parseAsuraRoute(canonicalUrl);
  if (!route) return [];
  const escapedSlug = route.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(
    `(?:https:\\/\\/asurascans\\.com)?\\/comics\\/${escapedSlug}\\/chapter\\/([^"'/?#<\\s]+)`,
    'gi',
  );
  const chapters = new Map<string, ChapterRef>();
  for (const match of html.matchAll(expression)) {
    const id = decodeURIComponent(match[1]);
    chapters.set(id, {
      id,
      url: `${canonicalUrl.replace(/\/$/, '')}/chapter/${encodeURIComponent(id)}`,
    });
  }
  // Astro serializes each value as [type, value]. Read only ChapterList props,
  // never scripts or arbitrary objects containing a chapter number.
  for (const island of html.matchAll(/<astro-island\b[^>]*>/gi)) {
    if (!/ChapterListReact/.test(island[0])) continue;
    const props = island[0].match(/\bprops="([^"]*)"/i)?.[1];
    if (!props) continue;
    try {
      const decoded = props.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      const data = JSON.parse(decoded);
      const rows = data.chapters?.[1];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const chapter = row?.[1];
        const number = chapter?.number?.[1];
        if (typeof number !== 'number' && typeof number !== 'string') continue;
        const id = String(number);
        if (!/^\d+(?:[.-]\d+)*$/.test(id)) continue;
        const premium = chapter.is_premium?.[1];
        const until = chapter.early_access_until?.[1];
        chapters.set(id, {
          id,
          url: `${canonicalUrl.replace(/\/$/, '')}/chapter/${encodeURIComponent(id)}`,
          availability: premium === false ? 'free' : premium === true ? 'locked' : 'unknown',
          ...(typeof until === 'string' && Number.isFinite(Date.parse(until)) ? { unlockAt: until } : {}),
        });
      }
    } catch { /* Missing or changed site data remains unknown, never free. */ }
  }
  return [...chapters.values()].sort((left, right) => compareChapterIds(left.id, right.id));
}

export function deriveLatestChapter(metadata: PageMetadata): ChapterRef | undefined {
  return maxChapter([
    ...metadata.chapters,
    ...(metadata.currentChapter ? [metadata.currentChapter] : []),
  ]);
}
