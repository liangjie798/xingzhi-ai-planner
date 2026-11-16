import test from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_COOKIE, hasSeenIntro, needsIntroGate } from '../src/lib/intro-gate.ts';

test('介绍页 cookie 判定：没有 cookie 或 cookie 值不对时均视为未看过', () => {
  assert.equal(hasSeenIntro(undefined), false);
  assert.equal(hasSeenIntro(''), false);
  assert.equal(hasSeenIntro('foo=bar'), false);
  assert.equal(hasSeenIntro(`${INTRO_COOKIE}=0`), false);
  assert.equal(hasSeenIntro(`${INTRO_COOKIE}=1`), true);
  assert.equal(hasSeenIntro(`other=1; ${INTRO_COOKIE}=1; theme=dark`), true);
});

test('只有未看过介绍时访问 /login 才被前置到介绍页', () => {
  assert.equal(needsIntroGate('/login', undefined), true);
  assert.equal(needsIntroGate('/login', 'foo=bar'), true);
  assert.equal(needsIntroGate('/login', `${INTRO_COOKIE}=1`), false);
  assert.equal(needsIntroGate('/welcome', undefined), false);
  assert.equal(needsIntroGate('/admin/login', undefined), false);
  assert.equal(needsIntroGate('/XingZhi', undefined), false);
  assert.equal(needsIntroGate('/api/v1/health', undefined), false);
});
