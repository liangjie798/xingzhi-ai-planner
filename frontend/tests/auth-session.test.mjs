import test from 'node:test';
import assert from 'node:assert/strict';
import { csrf, login } from '../src/lib/auth.ts';
import config from '../next.config.ts';

test('development API proxy follows the configured backend port; production keeps its reverse proxy', async () => {
  const previousMode = process.env.NODE_ENV, previousBase = process.env.BACKEND_INTERNAL_URL;
  try {
    process.env.NODE_ENV = 'development';
    process.env.BACKEND_INTERNAL_URL = 'http://127.0.0.1:8081/';
    assert.deepEqual(await config.rewrites(), [{source:'/api/:path*',destination:'http://127.0.0.1:8081/api/:path*'}]);
    delete process.env.BACKEND_INTERNAL_URL;
    assert.match((await config.rewrites())[0].destination, /127\.0\.0\.1:8080\/api/);
    process.env.NODE_ENV = 'production';
    assert.deepEqual(await config.rewrites(), []);
  } finally {
    if(previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if(previousBase === undefined) delete process.env.BACKEND_INTERNAL_URL; else process.env.BACKEND_INTERNAL_URL = previousBase;
  }
});

test('failed CSRF bootstrap never submits credentials and gives actionable connection errors', async () => {
  const original = globalThis.fetch;
  try {
    for(const [status, message] of [[404,/代理端口/],[503,/后端服务/]]) {
      const requests=[];
      globalThis.fetch = async (url) => {requests.push(url);return new Response('',{status});};
      await assert.rejects(login('test-user','test-password'), message);
      assert.deepEqual(requests, ['/api/v1/auth/csrf']);
    }
    globalThis.fetch = async () => {throw new TypeError('network unavailable');};
    await assert.rejects(csrf(), /检查网络及后端服务/);
  } finally {globalThis.fetch = original;}
});

test('invalid success payloads cannot bootstrap a login session', async () => {
  const original = globalThis.fetch;
  try {
    for(const body of ['<html>wrong service</html>','{}',JSON.stringify({headerName:'X-CSRF-TOKEN',token:''}),JSON.stringify({headerName:'bad\r\nheader',token:'value'})]) {
      globalThis.fetch = async () => new Response(body,{status:200});
      await assert.rejects(csrf(), /无效的会话信息/);
    }
  } finally {globalThis.fetch = original;}
});

test('login retains same-origin cookies and sends the issued CSRF token before credentials', async () => {
  const original=globalThis.fetch, requests=[];
  try {
    globalThis.fetch=async (url,options)=>{
      requests.push({url,options});
      return Response.json(url.endsWith('/csrf')?{headerName:'X-CSRF-TOKEN',token:'issued-test-token'}:{username:'test-user',role:'USER'});
    };
    assert.equal((await login('test-user','test-password')).role,'USER');
    assert.equal(requests[0].options.cache,'no-store');
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    assert.equal(requests[1].options.credentials,'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'],'issued-test-token');
    assert.equal(requests[1].options.method,'POST');
  } finally {globalThis.fetch=original;}
});
