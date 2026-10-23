import test from "node:test";
import assert from "node:assert/strict";
import { parseSocialHtml, socialPlatform } from "../src/lib/social-research.ts";
test("only public platform HTTPS URLs are accepted", () => {
  assert.equal(socialPlatform("https://www.douyin.com/video/123456"), "抖音");
  assert.equal(socialPlatform("https://www.xiaohongshu.com/explore/abc123"), "小红书");
  for (const url of ["http://www.douyin.com/video/123", "https://douyin.com.attacker.test/video/123", "https://localhost/video/123", "https://u:p@www.douyin.com/video/123"]) assert.equal(socialPlatform(url), null);
});
test("extracts real public article metadata and source", () => {
  const html = '<meta property="og:title" content="西安城墙骑行"><meta name="description" content="预约后错峰入场，沿城墙慢行。">';
  const records = parseSocialHtml(html, "https://www.xiaohongshu.com/explore/abc123");
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "西安城墙骑行");
  assert.match(records[0].retrievedAt, /^\d{4}-/);
});
test("login walls and search entry pages never count as collected posts", () => {
  assert.deepEqual(parseSocialHtml('<title>请登录后查看</title>', "https://www.douyin.com/video/123"), []);
  assert.deepEqual(parseSocialHtml('<title>西安旅游搜索结果</title>', "https://www.douyin.com/search/test"), []);
});
