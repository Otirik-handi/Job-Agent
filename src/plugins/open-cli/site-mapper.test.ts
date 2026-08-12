import { describe, expect, it } from 'vitest';
import { mapUrlToCommand } from './site-mapper';

describe('mapUrlToCommand（URL → opencli 命令，实测 CLI）', () => {
  it('51job 详情：we.51job.com/jobs/<jobId>.html → 51job detail', () => {
    expect(mapUrlToCommand('https://we.51job.com/jobs/12345678.html'))
      .toEqual({ site: '51job', cmd: 'detail', args: ['12345678'] });
  });
  it('51job 搜索：we.51job.com 关键词页 → 51job search（query 从 URL 参数提取）', () => {
    expect(mapUrlToCommand('https://we.51job.com/pc/search?keyword=前端&city=北京'))
      .toEqual({ site: '51job', cmd: 'search', args: ['前端'] });
  });
  it('Boss 详情：zhipin.com/job_detail/<securityId>.html → boss detail', () => {
    expect(mapUrlToCommand('https://www.zhipin.com/job_detail/abc123xyz.html'))
      .toEqual({ site: 'boss', cmd: 'detail', args: ['abc123xyz'] });
  });
  it('Boss 搜索 → boss search（query 从 URL 参数提取）', () => {
    expect(mapUrlToCommand('https://www.zhipin.com/web/geek/job?query=后端'))
      .toEqual({ site: 'boss', cmd: 'search', args: ['后端'] });
  });
  it('不支持的 URL → null', () => {
    expect(mapUrlToCommand('https://www.zhaopin.com/jobdetail/1.htm')).toBeNull();
    expect(mapUrlToCommand('https://example.com/x')).toBeNull();
  });
});
