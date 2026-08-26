import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, "..");
const defaultSource = path.join(process.env.USERPROFILE || repositoryRoot, "Downloads", "UND_90일_실행계획서_내부용.html");
const sourcePath = path.resolve(process.argv[2] || defaultSource);
// This generated file contains internal source material. It is intentionally
// gitignored and should exist only for the one-time Apps Script migration.
const outputPath = path.join(repositoryRoot, "apps-script", "UndInternalPlan.generated.gs");

const html = fs.readFileSync(sourcePath, "utf8");

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
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\b(?:ask-hd|callout-title)\b[^"']*["'][^>]*>/gi, '<$1 class="plan-callout-title">')
    .replace(/<([a-z0-9]+)\b[^>]*class=["'][^"']*\b(?:ask|callout)\b[^"']*["'][^>]*>/gi, '<$1 class="plan-callout">')
    .replace(/<a\b([^>]*)href=["']#(?:s|a|m)([0-9-]+)["']([^>]*)>/gi, '<a href="#plan/internal">')
    .replace(/\s(?:id|style|target|rel|role|aria-[a-z-]+|data-[a-z-]+)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/\son[a-z]+=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/<(?!\/?(?:h3|h4|h5|p|blockquote|div|table|thead|tbody|tr|th|td|ul|ol|li|strong|em|code|pre|br|a|span)\b)[^>]+>/gi, "")
    .replace(/<([a-z0-9]+)\b([^>]*)>/gi, (match, tag, attrs) => {
      const allowed = new Set(["h3", "h4", "h5", "p", "blockquote", "div", "table", "thead", "tbody", "tr", "th", "td", "ul", "ol", "li", "strong", "em", "code", "pre", "br", "a", "span"]);
      const normalizedTag = tag.toLowerCase();
      if (!allowed.has(normalizedTag)) return "";
      const kept = [];
      String(attrs || "").replace(/\b(class|href|colspan|rowspan)=("[^"]*"|'[^']*')/gi, (_, name, quoted) => {
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

const articlePattern = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
const articles = [];
let articleMatch;
while ((articleMatch = articlePattern.exec(html))) articles.push(articleMatch[1]);
if (articles.length < 2) throw new Error(`내부 계획서의 본문/부록 article을 찾지 못했습니다: ${sourcePath}`);

const sections = [];
articles.slice(0, 2).forEach((article, articleIndex) => {
  const headingPattern = /<h2\b[^>]*id=["']((?:s|a|m)\d+)["'][^>]*>([\s\S]*?)<\/h2>/gi;
  const headings = [];
  let match;
  while ((match = headingPattern.exec(article))) {
    headings.push({ id: match[1].toUpperCase(), titleHtml: match[2], start: match.index, bodyStart: headingPattern.lastIndex });
  }
  headings.forEach((heading, index) => {
    const next = headings[index + 1];
    const title = plainText(heading.titleHtml);
    const isMain = articleIndex === 0 && /^S\d+$/.test(heading.id);
    sections.push({
      id: `PLAN-UND-INTERNAL-20260825-${heading.id}`,
      code: heading.id,
      navLabel: title.replace(/^\d+\.\s*/, "").replace(/\s+—[\s\S]*$/, ""),
      title,
      bodyHtml: sanitizePlanHtml(article.slice(heading.bodyStart, next ? next.start : article.length)),
      sortOrder: sections.length + 1,
      visibilityCode: isMain ? "PROJECT_TEAM" : "POCKET_ONLY",
    });
  });
});

const mainSections = sections.filter((section) => /^S\d+$/.test(section.code));
const privateSections = sections.filter((section) => section.visibilityCode === "POCKET_ONLY");
if (mainSections.length !== 10 || !privateSections.length) {
  throw new Error(`예상한 내부 계획 구조와 다릅니다: main=${mainSections.length}, private=${privateSections.length}`);
}
sections.forEach((section) => {
  if (!section.bodyHtml || section.bodyHtml.length > 49000) {
    throw new Error(`${section.code} 본문 길이가 Google Sheets 셀 제한에 맞지 않습니다: ${section.bodyHtml.length}`);
  }
});

const plan = {
  id: "PLAN-UND-INTERNAL-20260825",
  clientId: "CLT-UND",
  projectId: "PRJ-UND-90D-001",
  versionLabel: "2026-08-25 내부 실행본",
  title: "UND LIFESTYLE 90일 내부 실행계획",
  summary: "포켓컴퍼니와 실행사가 사용하는 90일 채널 전략·실행 로드맵·이행 추적 계획입니다.",
  buildWeeks: 3,
  operationMonths: 3,
  monthlyOutputTarget: 26,
  initialOutputTarget: 32,
  primaryGoal: "90일 브랜드·마케팅 실행",
  statusCode: "PUBLISHED",
  effectiveAt: "2026-08-25",
  visibilityCode: "PROJECT_TEAM",
  sourceCode: "INTERNAL_EXECUTION_PLAN",
  sourceFilename: path.basename(sourcePath),
  sections,
};

const banner = [
  "/**",
  " * Generated from the UND internal execution plan.",
  ` * Source: ${path.basename(sourcePath)}`,
  " * Main sections are PROJECT_TEAM; the execution-team appendix is POCKET_ONLY.",
  " * Do not edit this file by hand; run scripts/generate-und-internal-plan.mjs.",
  " */",
].join("\n");
fs.writeFileSync(outputPath, `${banner}\nvar MH_UND_INTERNAL_PLAN = ${JSON.stringify(plan, null, 2)};\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  sections: sections.length,
  projectTeamSections: sections.filter((item) => item.visibilityCode === "PROJECT_TEAM").length,
  pocketOnlySections: privateSections.length,
  lengths: sections.map((item) => [item.code, item.bodyHtml.length]),
}, null, 2));
