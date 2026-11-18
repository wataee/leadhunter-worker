import { describe, it, expect } from 'vitest';
import { parseUpworkEmail } from '../shared/upworkEmailParser';

describe('Upwork Email Alert Ingestion Parser', () => {
  it('parses single job alert email with HTML and job link', () => {
    const payload = {
      subject: 'New job: YouTube Video Editor for Tech Channel - Upwork',
      from: 'Upwork Notifications <donotreply@upwork.com>',
      html: `
        <div>
          <h2><a href="https://www.upwork.com/jobs/~01a2b3c4d5e6f7g8h9">YouTube Video Editor for Tech Channel</a></h2>
          <p>Hourly: $35.00 - $65.00</p>
          <p>Looking for a talented editor for our tech and finance YouTube channel. Must know Premiere Pro and After Effects.</p>
          <p>Client: Payment verified, United States, 4.95 Rating.</p>
          <p>Requires 16 connects to apply.</p>
        </div>
      `,
    };

    const jobs = parseUpworkEmail(payload);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe('YouTube Video Editor for Tech Channel');
    expect(jobs[0].url).toBe('https://www.upwork.com/jobs/~01a2b3c4d5e6f7g8h9');
    expect(jobs[0].budget).toBe('$35.00 - $65.00');
    expect(jobs[0].clientPaymentVerified).toBe(true);
    expect(jobs[0].connectsRequired).toBe(16);
  });

  it('parses multi-job digest alert email', () => {
    const payload = {
      subject: '3 new jobs matching your saved search "Shorts/Reels"',
      from: 'donotreply@upwork.com',
      text: `
        Job 1: Fast-paced Reels Editor for Fitness Influencer
        Budget: $300
        https://www.upwork.com/jobs/~011122334455667788
        Need 10 short-form reels edited with dynamic subtitles and sound design. Payment verified.

        Job 2: Podcast Video Editor (Multicam)
        Hourly: $40 - $55
        https://www.upwork.com/jobs/~019988776655443322
        Multicamera podcast editing, 4K footage. United Kingdom.
      `,
    };

    const jobs = parseUpworkEmail(payload);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs[0].url).toBe('https://www.upwork.com/jobs/~011122334455667788');
    expect(jobs[0].budget).toBe('$300');
    expect(jobs[1].url).toBe('https://www.upwork.com/jobs/~019988776655443322');
    expect(jobs[1].budget).toBe('$40 - $55');
  });

  it('returns empty array when content is unrelated or empty', () => {
    expect(parseUpworkEmail({})).toEqual([]);
    expect(parseUpworkEmail({ subject: 'Hello world', text: 'Nothing here' })).toEqual([]);
  });
});
