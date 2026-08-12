/**
 * HTML 字节 → 字符串：charset 检测（HTTP header 优先，meta 声明兜底）后转码。
 * GBK/GB2312 走 TextDecoder（Node ICU 内置，猎聘实测必须）；未知字符集回退 UTF-8 不抛错。
 */
const GBK_LIKE = /gbk|gb2312|gb18030/i;

export function detectCharset(header: string | null, body: Buffer): string | null {
  const fromHeader = header?.match(/charset\s*=\s*"?([a-zA-Z0-9\-_]+)"?/i)?.[1];
  if (fromHeader) return fromHeader;
  // meta 声明：<meta charset="x"> 或 <meta http-equiv="Content-Type" content="...charset=x">
  const head = body.subarray(0, 4096).toString('latin1');
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9\-_]+)/i)?.[1];
  return fromMeta ?? null;
}

export function decodeHtmlBytes(body: Buffer, contentTypeHeader: string | null): string {
  const charset = detectCharset(contentTypeHeader, body);
  if (charset && GBK_LIKE.test(charset)) {
    try { return new TextDecoder('gbk').decode(body); } catch { /* 回退 */ }
  }
  try {
    if (charset && charset.toLowerCase() !== 'utf-8') return new TextDecoder(charset).decode(body);
  } catch { /* 未知字符集回退 */ }
  return body.toString('utf-8');
}
