import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("고객사·프로젝트·본문의 탐색 열은 배경과 경계선으로 구분된다", () => {
  assert.match(styles, /\.client-rail\s*\{[\s\S]*?border-right:\s*1px solid #cbd5e1;[\s\S]*?background:\s*#f1f4f8;/);
  assert.match(styles, /\.project-sidebar\s*\{[\s\S]*?border-right-color:\s*#cbd5e1;[\s\S]*?background:\s*#fff;/);
  assert.match(styles, /\.content-canvas\s*\{[\s\S]*?background:\s*var\(--ground\);/);
});
