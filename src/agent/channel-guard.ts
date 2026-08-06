/** 渠道发现本地规则护栏（纯函数，无 I/O）：
 *  URL/邮箱从 JD 文本本地提取；LLM 产物必须引用提取集合，否则标记 needs_check；
 *  招聘平台/ATS 域名黑名单覆写分类。经验 #6：严禁 LLM 臆造事实，只给核验动作。 */

export type ExtractedCandidates = { urls: string[]; emails: string[] };

const URL_RE = /https?:\/\/[^\s<>"'()，。；：、？！（）]+/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** URL/邮箱尾部常见标点（中英文） */
const TRAILING_PUNCT_RE = /[.,;:!?，。；：、）)\]}>"'”’]+$/;

function cleanTrailing(text: string): string {
  return text.replace(TRAILING_PUNCT_RE, '');
}

/** 从文本提取 URL 与邮箱（去重、清洗尾部标点） */
export function extractCandidates(text: string): ExtractedCandidates {
  const urls: string[] = [];
  const emails: string[] = [];
  const seenUrl = new Set<string>();
  const seenEmail = new Set<string>();

  for (const m of text.matchAll(URL_RE)) {
    const cleaned = cleanTrailing(m[0]);
    if (!cleaned || seenUrl.has(cleaned)) continue;
    seenUrl.add(cleaned);
    urls.push(cleaned);
  }
  for (const m of text.matchAll(EMAIL_RE)) {
    const cleaned = cleanTrailing(m[0]).toLowerCase();
    if (!cleaned || seenEmail.has(cleaned)) continue;
    seenEmail.add(cleaned);
    emails.push(cleaned);
  }
  return { urls, emails };
}

/** 招聘平台/ATS 域名黑名单（主域名级；子域名与裸域均命中） */
export const JOB_BOARD_DOMAINS = [
  'zhipin.com',          // BOSS 直聘
  'lagou.com',           // 拉勾
  '51job.com',           // 前程无忧
  'zhaopin.com',         // 智联招聘
  'liepin.com',          // 猎聘
  'maimai.cn',           // 脉脉
  'nowcoder.com',        // 牛客
  'shixiseng.com',       // 实习僧
  'yingjiesheng.com',    // 应届生求职网
  'dajie.com',           // 大街网
  'kanzhun.com',         // 看准网（BOSS 旗下）
  'jobui.com',           // 职友集
  'mokahr.com',          // Moka ATS
  'beisen.com',          // 北森 ATS
] as const;

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** URL 主域名是否命中招聘平台/ATS 黑名单（www./m. 等子域名与裸域均命中，evilzhipin.com 不误伤） */
export function isJobBoardDomain(url: string): boolean {
  const host = domainOf(url);
  if (!host) return false;
  return JOB_BOARD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export type ChannelVerification = 'verified' | 'needs_check';

function normUrl(u: string): string {
  return u.trim().replace(/\/+$/, '').toLowerCase();
}

/** 核验 LLM 引用的 url/email：必须命中本地提取集合（规范化比较）且格式合法，否则 needs_check */
export function verifyChannel(
  channel: { url: string | null; email: string | null },
  allowedUrls: string[],
  allowedEmails: string[],
): ChannelVerification {
  const url = channel.url ? normUrl(channel.url) : null;
  const email = channel.email ? channel.email.trim().toLowerCase() : null;
  if (url && !allowedUrls.some((u) => normUrl(u) === url)) return 'needs_check';
  if (email && !allowedEmails.includes(email)) return 'needs_check';
  if (!url && !email) return 'needs_check';
  return 'verified';
}
