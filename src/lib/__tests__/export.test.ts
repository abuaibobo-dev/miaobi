import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../export';

describe('sanitizeFilename', () => {
  it('替换非法文件名字符', () => {
    expect(sanitizeFilename('a/b:c*?')).toBe('a_b_c__');
    expect(sanitizeFilename('标题"特殊"')).toBe('标题_特殊_');
  });

  it('折叠连续点号防路径穿越', () => {
    expect(sanitizeFilename('..')).toBe('.');
    expect(sanitizeFilename('../../etc')).toBe('._._etc');
  });

  it('截断超长文件名', () => {
    const long = 'x'.repeat(300) + '.txt';
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
  });

  it('正常文件名不变', () => {
    expect(sanitizeFilename('第一章 相遇.txt')).toBe('第一章 相遇.txt');
  });
});
