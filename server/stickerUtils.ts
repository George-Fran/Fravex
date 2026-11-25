import crypto from 'node:crypto';
import sharp from 'sharp';

/**
 * Injects WhatsApp Sticker EXIF metadata (pack name & author) into a WebP buffer.
 * Supports VP8, VP8L, and VP8X WebP containers. Falls back safely if layout is non-standard.
 */
export function addStickerExif(webpBuffer: Buffer, packName: string, authorName: string): Buffer {
  try {
    if (
      webpBuffer.length < 16 ||
      webpBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
      webpBuffer.toString('ascii', 8, 12) !== 'WEBP'
    ) {
      return webpBuffer;
    }

    const json = JSON.stringify({
      'sticker-pack-id': crypto.randomUUID(),
      'sticker-pack-name': packName || 'FRAVEX Stickers',
      'sticker-pack-publisher': authorName || 'FRAVEX',
      emojis: ['✨'],
    });
    const jsonBytes = Buffer.from(json, 'utf-8');

    const tiffHeader = Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
      0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
    ]);
    tiffHeader.writeUInt32LE(jsonBytes.length, 14);
    const exifPayload = Buffer.concat([tiffHeader, jsonBytes]);

    const paddedExif =
      exifPayload.length % 2 === 1
        ? Buffer.concat([exifPayload, Buffer.from([0x00])])
        : exifPayload;

    const exifChunkHeader = Buffer.alloc(8);
    exifChunkHeader.write('EXIF', 0, 4, 'ascii');
    exifChunkHeader.writeUInt32LE(exifPayload.length, 4);
    const exifChunk = Buffer.concat([exifChunkHeader, paddedExif]);

    const chunksStart = 12;
    const firstTag = webpBuffer.toString('ascii', chunksStart, chunksStart + 4);

    if (firstTag === 'VP8X') {
      const existingFlags = webpBuffer.readUInt32LE(chunksStart + 8);
      const updated = Buffer.from(webpBuffer);
      updated.writeUInt32LE(existingFlags | 0x08, chunksStart + 8);
      const result = Buffer.concat([updated, exifChunk]);
      result.writeUInt32LE(result.length - 8, 4);
      return result;
    }

    // Simple VP8 / VP8L container: prepend VP8X chunk with EXIF flag (0x08) and canvas 512x512
    const vp8xChunk = Buffer.alloc(18);
    vp8xChunk.write('VP8X', 0, 4, 'ascii');
    vp8xChunk.writeUInt32LE(10, 4);
    vp8xChunk.writeUInt32LE(0x08, 8);
    // Width - 1 (511 = 0x01FF) in 24-bit LE
    vp8xChunk[12] = 0xff;
    vp8xChunk[13] = 0x01;
    vp8xChunk[14] = 0x00;
    // Height - 1 (511 = 0x01FF) in 24-bit LE
    vp8xChunk[15] = 0xff;
    vp8xChunk[16] = 0x01;
    vp8xChunk[17] = 0x00;

    const bodyChunks = webpBuffer.subarray(chunksStart);
    const totalLength = 4 + vp8xChunk.length + bodyChunks.length + exifChunk.length;
    const riffHeader = Buffer.alloc(12);
    riffHeader.write('RIFF', 0, 4, 'ascii');
    riffHeader.writeUInt32LE(totalLength, 4);
    riffHeader.write('WEBP', 8, 4, 'ascii');

    return Buffer.concat([riffHeader, vp8xChunk, bodyChunks, exifChunk]);
  } catch {
    return webpBuffer;
  }
}

export async function createWebpStickerFromImage(
  imageBuffer: Buffer,
  options: { crop?: boolean; packName: string; authorName: string }
): Promise<Buffer> {
  const fit = options.crop ? 'cover' : 'contain';

  const webp = await sharp(imageBuffer)
    .rotate()
    .resize(512, 512, {
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();

  return addStickerExif(webp, options.packName, options.authorName);
}

function colorMaxDiff(
  data: Buffer,
  offset: number,
  bg: [number, number, number]
): number {
  return Math.max(
    Math.abs(data[offset] - bg[0]),
    Math.abs(data[offset + 1] - bg[1]),
    Math.abs(data[offset + 2] - bg[2])
  );
}

/**
 * Extracts a sticker from a TikTok sticker preview screenshot (dark or light modal),
 * strips the modal background connected to the crop borders (preserving interior details
 * while making rounded corners / cutout backgrounds transparent), and outputs a 512x512 WebP sticker.
 */
export async function createTikTokStickerFromScreenshot(
  imageBuffer: Buffer,
  options: { packName: string; authorName: string }
): Promise<{ buffer: Buffer; detectedBox: boolean }> {
  const { data, info } = await sharp(imageBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const c = info.channels;

  const pxAt = (x: number, y: number): [number, number, number] => {
    const idx = (y * w + x) * c;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };
  const rgbDiff = (a: [number, number, number], b: [number, number, number]) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

  // Locate longest contiguous vertical band where both outer margins share a uniform modal sheet color
  let bestRun: { start: number; end: number; len: number; col: [number, number, number] } = {
    start: 0,
    end: 0,
    len: 0,
    col: [0, 0, 0],
  };
  let curRun: { start: number; end: number; len: number; col: [number, number, number] } | null =
    null;

  const yScanStart = Math.floor(h * 0.25);
  const yScanEnd = Math.floor(h * 0.94);

  for (let y = yScanStart; y < yScanEnd; y++) {
    const l1 = pxAt(Math.floor(w * 0.05), y);
    const l2 = pxAt(Math.floor(w * 0.14), y);
    const r1 = pxAt(Math.floor(w * 0.86), y);
    const r2 = pxAt(Math.floor(w * 0.95), y);
    const uniformRow = rgbDiff(l1, l2) <= 6 && rgbDiff(r1, r2) <= 6 && rgbDiff(l1, r1) <= 6;

    if (uniformRow) {
      if (!curRun) {
        curRun = { start: y, end: y, len: 1, col: l1 };
      } else if (rgbDiff(l1, curRun.col) <= 7) {
        curRun.end = y;
        curRun.len += 1;
      } else {
        if (curRun.len > bestRun.len) bestRun = curRun;
        curRun = { start: y, end: y, len: 1, col: l1 };
      }
    } else if (curRun) {
      if (curRun.len > bestRun.len) bestRun = curRun;
      curRun = null;
    }
  }
  if (curRun && curRun.len > bestRun.len) bestRun = curRun;

  // Verify we detected a substantial modal sheet (>= 14% of image height)
  if (bestRun.len >= Math.floor(h * 0.14)) {
    const bg = bestRun.col;
    const sheetTop = bestRun.start;
    const sheetBottom = Math.min(bestRun.end + Math.floor(h * 0.02), h - 1);

    const xCenterStart = Math.floor(w * 0.14);
    const xCenterEnd = Math.floor(w * 0.86);
    const minGap = Math.max(8, Math.floor(h * 0.015));

    const bands: Array<{ top: number; bottom: number }> = [];
    let band: { top: number; bottom: number } | null = null;
    let gap = 0;

    for (let y = sheetTop; y <= sheetBottom; y++) {
      let nonBgCount = 0;
      let sampled = 0;
      for (let x = xCenterStart; x <= xCenterEnd; x += 2) {
        sampled += 1;
        if (colorMaxDiff(data, (y * w + x) * c, bg) > 16) {
          nonBgCount += 1;
        }
      }
      const ratio = sampled > 0 ? nonBgCount / sampled : 0;
      if (ratio > 0.015) {
        if (!band) band = { top: y, bottom: y };
        else band.bottom = y;
        gap = 0;
      } else if (band) {
        gap += 1;
        if (gap >= minGap) {
          bands.push(band);
          band = null;
          gap = 0;
        }
      }
    }
    if (band) bands.push(band);

    // Choose the main sticker band (skip tiny 1-line UI artifacts if any)
    const stickerBand = bands.find((b) => b.bottom - b.top >= Math.max(24, h * 0.04)) ?? bands[0];

    if (stickerBand) {
      let minX = w;
      let maxX = 0;
      const xBoundLeft = Math.floor(w * 0.04);
      const xBoundRight = Math.floor(w * 0.96);

      for (let y = stickerBand.top; y <= stickerBand.bottom; y++) {
        for (let x = xBoundLeft; x <= xBoundRight; x++) {
          if (colorMaxDiff(data, (y * w + x) * c, bg) > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
      }

      const cropW = maxX - minX + 1;
      const cropH = stickerBand.bottom - stickerBand.top + 1;

      if (cropW >= 24 && cropH >= 24) {
        // Copy cropped region and flood-fill border-connected modal background to transparent
        const cropped = Buffer.alloc(cropW * cropH * 4);
        for (let row = 0; row < cropH; row++) {
          const srcOffset = ((stickerBand.top + row) * w + minX) * c;
          data.copy(cropped, row * cropW * 4, srcOffset, srcOffset + cropW * 4);
        }

        const visited = new Uint8Array(cropW * cropH);
        const queue = new Int32Array(cropW * cropH);
        let head = 0;
        let tail = 0;

        const trySeed = (cx: number, cy: number) => {
          const p = cy * cropW + cx;
          if (visited[p]) return;
          if (colorMaxDiff(cropped, p * 4, bg) <= 16) {
            visited[p] = 1;
            queue[tail++] = p;
          }
        };

        for (let cx = 0; cx < cropW; cx++) {
          trySeed(cx, 0);
          trySeed(cx, cropH - 1);
        }
        for (let cy = 0; cy < cropH; cy++) {
          trySeed(0, cy);
          trySeed(cropW - 1, cy);
        }

        while (head < tail) {
          const p = queue[head++];
          cropped[p * 4 + 3] = 0;
          const cx = p % cropW;
          const cy = (p - cx) / cropW;

          if (cx > 0) trySeed(cx - 1, cy);
          if (cx + 1 < cropW) trySeed(cx + 1, cy);
          if (cy > 0) trySeed(cx, cy - 1);
          if (cy + 1 < cropH) trySeed(cx, cy + 1);
        }

        const webp = await sharp(cropped, {
          raw: { width: cropW, height: cropH, channels: 4 },
        })
          .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 90, effort: 4 })
          .toBuffer();

        return {
          buffer: addStickerExif(webp, options.packName, options.authorName),
          detectedBox: true,
        };
      }
    }
  }

  // Fallback for already-cropped TikTok screenshots: trim uniform edges if any & convert
  const fallback = await sharp(imageBuffer)
    .rotate()
    .trim({ threshold: 16 })
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();

  return {
    buffer: addStickerExif(fallback, options.packName, options.authorName),
    detectedBox: false,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxCharsPerLine) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxCharsPerLine) {
        lines.push(word.slice(i, i + maxCharsPerLine));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 5);
}

export async function createTextSticker(
  rawText: string,
  options: { packName: string; authorName: string }
): Promise<Buffer> {
  const cleaned = rawText.trim().slice(0, 90);
  const maxChars = cleaned.length > 36 ? 14 : cleaned.length > 16 ? 11 : 9;
  const lines = wrapLines(cleaned, maxChars);

  const fontSize =
    lines.length >= 4 ? 54 : lines.length === 3 ? 64 : lines.length === 2 ? 78 : 92;
  const lineHeight = Math.round(fontSize * 1.18);
  const blockHeight = lines.length * lineHeight;
  const startY = Math.round((512 - blockHeight) / 2 + fontSize * 0.85);

  const textElements = lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      const safe = escapeXml(line);
      return `
        <text x="256" y="${y}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="#0f172a" stroke="#ffffff" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${safe}</text>
        <text x="256" y="${y}" text-anchor="middle" font-family="sans-serif" font-weight="800" font-size="${fontSize}" fill="#0f172a">${safe}</text>
      `;
    })
    .join('\n');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect x="24" y="24" width="464" height="464" rx="56" fill="#ecfdf5" stroke="#16a34a" stroke-width="10" />
      ${textElements}
    </svg>
  `;

  const webp = await sharp(Buffer.from(svg))
    .resize(512, 512)
    .webp({ quality: 92 })
    .toBuffer();

  return addStickerExif(webp, options.packName, options.authorName);
}
