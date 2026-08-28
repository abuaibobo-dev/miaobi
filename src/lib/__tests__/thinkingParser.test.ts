import { describe, it, expect } from 'vitest';
import { parseThinking } from '../thinkingParser';

describe('parseThinking', () => {
  it('解析 <thinking> 标签', () => {
    const { thinking, body } = parseThinking('<thinking>先构思人物</thinking>正文内容');
    expect(thinking).toBe('先构思人物');
    expect(body).toBe('正文内容');
  });

  it('解析 🧠 标记', () => {
    const { thinking, body } = parseThinking('🧠 思考中：\n检查剧情\n\n正文段落');
    expect(thinking).toBe('检查剧情');
    expect(body).toBe('正文段落');
  });

  it('无思考时 body 原样返回', () => {
    const { thinking, body } = parseThinking('只有正文');
    expect(thinking).toBe('');
    expect(body).toBe('只有正文');
  });

  it('思考后紧跟正文不吞正文（回归）', () => {
    const { body } = parseThinking('🧠 思考中：\n一段思考\n正文第一句');
    expect(body).toContain('正文第一句');
  });

  it('两种思考格式并存', () => {
    const { thinking, body } = parseThinking('<think>a</think>\n\n🧠 思考中：\nb\n\n正');
    expect(thinking).toContain('a');
    expect(thinking).toContain('b');
    expect(body).toBe('正');
  });
});
