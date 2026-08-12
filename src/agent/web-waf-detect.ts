/** WAF/反爬特征检测：返回命中的特征名（降级链触发依据），无命中返回 null */
const WAF_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aliyun_waf', re: /aliyun[_ -]?waf/i },
  { name: 'waf_keyword', re: /_waf|waf\.cdn|security\.cdn/i },
  { name: 'js_obfuscation', re: /var _0x[a-f0-9]{4,}/i },
  { name: 'captcha_page', re: /captcha|verify|安全验证|滑动验证/i },
];

export function detectWaf(status: number, contentType: string | null, body: string): string | null {
  if (status < 200 || status >= 300) return `http_${status}`;
  if (body.length === 0) return 'empty_body';
  for (const { name, re } of WAF_PATTERNS) {
    if (re.test(body)) return name;
  }
  return null;
}
