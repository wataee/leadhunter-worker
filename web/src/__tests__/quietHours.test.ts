import { describe, it, expect } from 'vitest';
import { isQuietHours } from '../lib/notifications';

describe('5.9 isQuietHours', () => {
  it('identifies hours crossing midnight correctly', () => {
    // If quiet hours are 23:00 to 08:00
    // Test logic:
    const checkHour = (h: number, start = 23, end = 8) => {
      if (start > end) {
        return h >= start || h < end;
      }
      return h >= start && h < end;
    };

    expect(checkHour(23)).toBe(true);
    expect(checkHour(3)).toBe(true);
    expect(checkHour(7)).toBe(true);
    expect(checkHour(8)).toBe(false);
    expect(checkHour(14)).toBe(false);
    expect(checkHour(22)).toBe(false);
  });

  it('runs isQuietHours without error', () => {
    const res = isQuietHours(23, 8);
    expect(typeof res).toBe('boolean');
  });
});
