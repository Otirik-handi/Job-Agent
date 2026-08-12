import { describe, expect, it } from 'vitest';
import { detectWaf } from './web-waf-detect';

describe('detectWaf（WAF/反爬特征）', () => {
  it('阿里云 WAF 特征（51job 实测）', () => {
    expect(detectWaf(200, '', '<html><body>aliyun_waf</body></html>')).toBeTruthy();
    expect(detectWaf(200, '', 'var _0x3f2a=function(){return"混淆";}')).toBeTruthy();
  });
  it('非 2xx 视为拦截信号', () => {
    expect(detectWaf(403, '', '')).toBeTruthy();
    expect(detectWaf(302, '', '')).toBeTruthy();
  });
  it('正常页面不误报', () => {
    expect(detectWaf(200, 'text/html', '<h1>岗位详情</h1>')).toBeNull();
  });
});
