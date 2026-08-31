import { describe, expect, it } from 'vitest';
import { testAdultGatewayModels } from '../llm';

describe('testAdultGatewayModels', () => {
  it('returns normalized result rows', async () => {
    const rows = await testAdultGatewayModels();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('model');
    expect(rows[0]).toHaveProperty('ok');
    expect(rows[0]).toHaveProperty('reason');
  });
});
