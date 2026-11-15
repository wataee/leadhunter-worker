import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signSessionToken,
  verifySessionToken,
  verifyPassword,
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginAttempts,
  requireAuth,
  parseSessionCookie,
} from '../web/netlify/functions/_shared/auth.ts';

test('1.3 Session token generation and verification', () => {
  const secret = 'super-secret-key-at-least-32-chars-long';
  const { token, expiresAt } = signSessionToken(secret, 60_000);

  assert.ok(token, 'Token should be generated');
  assert.ok(expiresAt > Date.now(), 'Token expires in future');
  assert.equal(verifySessionToken(token, secret), true, 'Valid token must be verified');

  // Wrong secret
  assert.equal(
    verifySessionToken(token, 'different-secret-key-for-testing'),
    false,
    'Token with wrong secret must fail'
  );

  // Tampered payload
  const parts = token.split('.');
  const tamperedPayload = `${Date.now() + 9999999}.${parts[1]}.${parts[2]}`;
  assert.equal(verifySessionToken(tamperedPayload, secret), false, 'Tampered token must fail');

  // Tampered signature
  const tamperedSig = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -2)}aa`;
  assert.equal(verifySessionToken(tamperedSig, secret), false, 'Tampered signature must fail');

  // Expired token
  const expired = signSessionToken(secret, -5000);
  assert.equal(verifySessionToken(expired.token, secret), false, 'Expired token must fail');
});

test('1.3 Password verification with timingSafeEqual', () => {
  const correct = 'MySecretAdminPassword123!';
  assert.equal(verifyPassword(correct, correct), true, 'Correct password must match');
  assert.equal(verifyPassword('WrongPassword', correct), false, 'Wrong password must fail');
  assert.equal(verifyPassword('', correct), false, 'Empty password must fail');
  assert.equal(verifyPassword(correct, ''), false, 'Empty expected password must fail');
});

test('1.3 Rate limiting on login attempts (5 attempts / 15 min)', () => {
  const testIp = '192.168.1.100';
  resetLoginAttempts(testIp);

  // Initial state: allowed, 5 remaining
  let check = checkLoginRateLimit(testIp);
  assert.equal(check.allowed, true);
  assert.equal(check.remaining, 5);

  // Record 4 failures
  for (let i = 1; i <= 4; i++) {
    recordLoginFailure(testIp);
    check = checkLoginRateLimit(testIp);
    assert.equal(check.allowed, true);
    assert.equal(check.remaining, 5 - i);
  }

  // 5th failure
  recordLoginFailure(testIp);
  check = checkLoginRateLimit(testIp);
  assert.equal(check.allowed, false, '6th attempt must be blocked');
  assert.equal(check.remaining, 0);

  // Reset on successful login
  resetLoginAttempts(testIp);
  check = checkLoginRateLimit(testIp);
  assert.equal(check.allowed, true, 'After reset, login must be allowed again');
  assert.equal(check.remaining, 5);
});

test('1.3 Cookie parsing and requireAuth middleware', () => {
  assert.equal(parseSessionCookie('lh_session=abc123xyz'), 'abc123xyz');
  assert.equal(parseSessionCookie('foo=bar; lh_session=token456; other=1'), 'token456');
  assert.equal(parseSessionCookie(''), null);
  assert.equal(parseSessionCookie(undefined), null);

  const prevEnv = process.env.NODE_ENV;
  const prevNetlifyDev = process.env.NETLIFY_DEV;
  const prevAppPass = process.env.APP_PASSWORD;

  try {
    // Without APP_PASSWORD -> allowed
    delete process.env.APP_PASSWORD;
    let res = requireAuth({ headers: {} });
    assert.equal(res.authenticated, true);

    // Production with APP_PASSWORD
    process.env.NODE_ENV = 'production';
    delete process.env.NETLIFY_DEV;
    process.env.APP_PASSWORD = 'strong_test_password_123';

    // No credentials -> 401
    res = requireAuth({ headers: {} });
    assert.equal(res.authenticated, false);
    assert.equal(res.statusCode, 401);

    // Valid cookie -> 200
    const { token } = signSessionToken();
    res = requireAuth({ headers: { cookie: `lh_session=${token}` } });
    assert.equal(res.authenticated, true);

    // Valid Bearer -> 200
    res = requireAuth({ headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.authenticated, true);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevNetlifyDev !== undefined) process.env.NETLIFY_DEV = prevNetlifyDev;
    else delete process.env.NETLIFY_DEV;
    if (prevAppPass !== undefined) process.env.APP_PASSWORD = prevAppPass;
    else delete process.env.APP_PASSWORD;
  }
});
