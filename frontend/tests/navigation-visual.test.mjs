import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("상단 회사 선택·좌측 메뉴·본문의 경계가 분명하다", () => {
  assert.match(styles, /\.topbar-company-tabs\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(styles, /\.topbar \.topbar-company-tabs button\.is-active\s*\{[\s\S]*?background:\s*#172f68;/);
  assert.match(styles, /\.project-sidebar\s*\{[\s\S]*?border-right-color:\s*#cbd5e1;[\s\S]*?background:\s*#fff;/);
  assert.match(styles, /\.content-canvas\s*\{[\s\S]*?background:\s*var\(--ground\);/);
  assert.match(styles, /Final shell contract:[\s\S]*?grid-template-columns:\s*224px minmax\(0, 1fr\)/);
});
