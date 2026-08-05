import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format-time';

describe('format-time', () => {
  it('今天显示 HH:mm', () => {
    expect(formatRelativeTime(new Date().toISOString())).toMatch(/^\d{2}:\d{2}$/);
  });
  it('昨天显示「昨天」', () => {
    expect(formatRelativeTime(new Date(Date.now() - 86400000).toISOString())).toBe('昨天');
  });
  it('同年更早显示 MM-DD', () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    if (now.getDate() === 1) d.setMonth(d.getMonth() - 1);
    expect(formatRelativeTime(d.toISOString())).toMatch(/^\d{2}-\d{2}$/);
  });
  it('更早年份显示 YYYY-MM-DD', () => {
    expect(formatRelativeTime('2025-06-15T08:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('非法时间返回空串', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });
});
