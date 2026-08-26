import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const defaultSource = "C:\\Users\\PK-INVEXT\\Downloads\\UND_90일_실행계획_클라이언트공유용.html";
const sourcePath = path.resolve(process.argv[2] || defaultSource);
const outputPath = path.join(repositoryRoot, "apps-script", "UndClientPlan.gs");

const html = fs.readFileSync(sourcePath, "utf8");
const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
if (!articleMatch) throw new Error(`계획서 본문 article을 찾지 못했습니다: ${sourcePath}`);

function plainText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePlanHtml(value) {
  return String(value || "")
    .replace(/<figure\b[^>]*>[\s\S]*?<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/gi, '<p class="plan-figure-caption">$1</p>')
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<div\b[^>]*class=["'][^"']*\btw\b[^"']*["'][^>]*>/gi, '<div class="plan-table-wrap">')
    .replace(/<p\b[^>]*class=["'][^"']*\bcta\b[^"']*["'][^>]*>/gi, '<p class="plan-callout">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bask-hd\b[^"']*["'][^>]*>/gi, '<$1 class="plan-callout-title">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bask\b[^"']*["'][^>]*>/gi, '<$1 class="plan-callout plan-callout-question">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bmstat\b[^"']*["'][^>]*>/gi, '<$1 class="plan-meeting-status">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bms-done\b[^"']*["'][^>]*>/gi, '<$1 class="plan-status-done">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bms-plan\b[^"']*["'][^>]*>/gi, '<$1 class="plan-status-plan">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\bmno\b[^"']*["'][^>]*>/gi, '<$1 class="plan-meeting-number">')
    .replace(/<a\b([^>]*)href=["']https:\/\/claude\.ai\/code\/artifact\/4a4c608f-885e-4c6a-a307-be3086665b14["']([^>]*)>/gi, '<a href="#tasks">')
    .replace(/<a\b([^>]*)href=["']#(s\d+(?:-\d+)?)["']([^>]*)>/gi, '<a href="#plan" data-plan-target="$2">')
    .replace(/\s(?:id|style|target|rel|role|aria-[a-z-]+|data-t)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\son[a-z]+=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/<(?!\/?(?:h3|h4|h5|p|blockquote|div|table|thead|tbody|tr|th|td|ul|ol|li|strong|em|code|pre|br|a|span)\b)[^>]+>/gi, "")
    .replace(/<([a-z0-9]+)\b([^>]*)>/gi, (match, tag, attrs) => {
      const allowed = new Set(["h3", "h4", "h5", "p", "blockquote", "div", "table", "thead", "tbody", "tr", "th", "td", "ul", "ol", "li", "strong", "em", "code", "pre", "br", "a", "span"]);
      const normalizedTag = tag.toLowerCase();
      if (!allowed.has(normalizedTag)) return "";
      const kept = [];
      String(attrs || "").replace(/\b(class|href|data-plan-target|colspan|rowspan)=("[^"]*"|'[^']*')/gi, (_, name, quoted) => {
        const raw = quoted.slice(1, -1);
        if (name.toLowerCase() === "href" && !raw.startsWith("#") && !/^https:\/\//i.test(raw)) return "";
        kept.push(`${name.toLowerCase()}="${raw.replace(/"/g, "&quot;")}"`);
        return "";
      });
      return `<${normalizedTag}${kept.length ? ` ${kept.join(" ")}` : ""}>`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const article = articleMatch[1];
const headingPattern = /<h2\b[^>]*id=["'](s\d+)["'][^>]*>([\s\S]*?)<\/h2>/gi;
const headings = [];
let match;
while ((match = headingPattern.exec(article))) {
  headings.push({ id: match[1], titleHtml: match[2], start: match.index, bodyStart: headingPattern.lastIndex });
}
if (headings.length !== 10) throw new Error(`예상한 계획 섹션 10개와 다릅니다: ${headings.length}`);

const sections = headings.map((heading, index) => {
  const next = headings[index + 1];
  const title = plainText(heading.titleHtml);
  return {
    id: `PLAN-UND-20260825-${heading.id.toUpperCase()}`,
    code: heading.id.toUpperCase(),
    navLabel: title.replace(/^\d+\.\s*/, "").replace(/\s+—[\s\S]*$/, ""),
    title,
    bodyHtml: sanitizePlanHtml(article.slice(heading.bodyStart, next ? next.start : article.length)),
    sortOrder: index + 1,
  };
});

sections.forEach((section) => {
  if (!section.bodyHtml || section.bodyHtml.length > 49000) {
    throw new Error(`${section.code} 본문 길이가 Google Sheets 셀 제한에 맞지 않습니다: ${section.bodyHtml.length}`);
  }
});

const plan = {
  id: "PLAN-UND-90D-20260825",
  clientId: "CLT-UND",
  projectId: "PRJ-UND-90D-001",
  versionLabel: "2026-08-25 대표이사 미팅 반영본",
  title: "UND LIFESTYLE 90일 실행계획",
  summary: "쇼룸 방문 예약과 상담 문의를 중심으로 자사몰·콘텐츠·검색·광고를 연결하는 실행계획입니다.",
  buildWeeks: 3,
  operationMonths: 3,
  monthlyOutputTarget: 26,
  initialOutputTarget: 32,
  primaryGoal: "쇼룸 방문 예약 · 상담 문의",
  statusCode: "PUBLISHED",
  effectiveAt: "2026-08-25",
  sourceFilename: path.basename(sourcePath),
  sections,
};

const banner = [
  "/**",
  " * Generated from the approved UND client-facing execution plan.",
  ` * Source: ${path.basename(sourcePath)}`,
  " * Do not edit this file by hand; run scripts/generate-und-client-plan.mjs.",
  " */",
].join("\n");
fs.writeFileSync(outputPath, `${banner}\nvar MH_UND_CLIENT_PLAN = ${JSON.stringify(plan, null, 2)};\n`, "utf8");
console.log(JSON.stringify({ outputPath, sections: sections.length, lengths: sections.map((item) => [item.code, item.bodyHtml.length]) }, null, 2));
