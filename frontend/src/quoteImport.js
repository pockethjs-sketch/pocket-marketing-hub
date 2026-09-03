const FIELD_ALIASES = {
  media: ["매체", "채널", "플랫폼", "미디어", "MEDIA", "CHANNEL"],
  kind: ["업무", "구분", "분류", "유형", "카테고리", "업무구분", "TYPE", "CATEGORY"],
  name: ["서비스항목", "항목", "항목명", "품목", "품명", "서비스", "서비스명", "상품", "상품명", "작업내용", "업무내용", "업무명", "내용", "공정", "공정명", "ITEM", "SERVICE", "DESCRIPTION"],
  detail: ["세부내용", "세부", "세부사항", "상세", "상세내용", "설명", "비고", "특이사항", "REMARK", "NOTE", "비고사항"],
  price: ["단가", "기준단가", "제안단가", "정가", "공급단가", "단위단가", "가격", "UNITPRICE", "PRICE"],
  qty: ["수량", "개수", "갯수", "횟수", "건수", "분량", "QTY", "QTY.", "Q'TY", "QUANTITY", "수", "EA"],
  unit: ["단위", "UNIT"],
  amount: ["금액", "합계", "소계", "총액", "공급가액", "공급가", "합계금액", "AMOUNT", "TOTAL", "SUM"],
};

export const QUOTE_MAPPING_FIELDS = Object.freeze([
  { key: "media", label: "매체" },
  { key: "name", label: "항목" },
  { key: "detail", label: "세부내용" },
  { key: "qty", label: "수량" },
  { key: "unit", label: "단위" },
  { key: "amount", label: "금액" },
]);

const FIELD_ORDER = ["media", "kind", "detail", "name", "price", "qty", "unit", "amount"];
const CHANNEL_WORDS = ["YOUTUBE", "유튜브", "NAVER", "네이버", "네이버블로그", "INSTAGRAM", "인스타", "인스타그램", "TIKTOK", "틱톡", "ADS", "광고", "FACEBOOK", "페이스북", "블로그", "BLOG", "SNS", "카카오", "KAKAO", "구글", "GOOGLE", "쇼핑", "플레이스", "PLACE"];
const KIND_TO_MEDIA = { INSTAGRAM: "Instagram", 인스타그램: "Instagram", 인스타: "Instagram", TIKTOK: "TikTok", 틱톡: "TikTok", BLOG: "NAVER", 블로그: "NAVER", PLACE: "NAVER", 플레이스: "NAVER", 네이버: "NAVER", YOUTUBE: "YouTube", 유튜브: "YouTube", ADS: "Ads", 광고: "Ads" };
const GENERIC_BANDS = ["SNS", "소셜", "기타", "ETC", "공통", "기본", "OPTION", "옵션", "추가"];
const COUNT_UNITS = ["건", "편", "회", "주", "개", "장", "회차", "명", "컷", "페이지", "포스팅", "건수"];
const LUMP_UNITS = ["식", "월", "개월", "년", "세트", "SET", "LOT"];
const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_QUOTE_TASKS = 600;

const compact = (value) => String(value ?? "").replace(/\s+/g, "");
const normalized = (value) => compact(value).toUpperCase().replace(/[()[\]{}.:,·・\-_/]/g, "");
const cell = (cells, index) => index === undefined || index === null ? "" : String(cells[index] || "").trim();
const pad = (value) => String(value).padStart(2, "0");

function numberValue(value) {
  const token = String(value ?? "").replace(/[^\d.\-]/g, "");
  if (!token || token === "-" || token === ".") return null;
  const parsed = Number.parseFloat(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyLike(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  if (/[원₩¥$]/.test(text)) return true;
  if (/^\-?[\d,]{4,}(\.\d+)?$/.test(text) && text.includes(",")) return true;
  const parsed = numberValue(text);
  return parsed !== null && Math.abs(parsed) >= 1000 && /^[\d,.\s원₩\-]+$/.test(text);
}

function countLike(value) {
  const text = String(value ?? "").trim();
  const parsed = numberValue(text);
  return Boolean(text && /^\d{1,4}\s*[가-힣A-Za-z]{0,4}$/.test(text) && (parsed || 0) <= 9999);
}

export function addIsoDays(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return String(iso || "");
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(left, right) {
  const start = new Date(`${left}T00:00:00`);
  const end = new Date(`${right}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end - start) / 86_400_000);
}

function datesIn(value) {
  const result = [];
  const expression = /(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g;
  let match;
  while ((match = expression.exec(String(value || "")))) result.push(`${match[1]}-${pad(match[2])}-${pad(match[3])}`);
  return result;
}

export function parseDelimited(text, separator) {
  const source = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = separator || (source.split("\n", 1)[0].split("\t").length > source.split("\n", 1)[0].split(",").length ? "\t" : ",");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') { value += '"'; index += 1; } else quoted = false;
      } else value += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) { row.push(value); value = ""; }
    else if (character === "\n") { row.push(value); rows.push(row); row = []; value = ""; }
    else value += character;
  }
  row.push(value);
  if (row.length > 1 || row[0]) rows.push(row);
  return rows;
}

export function gridFromCells(matrix) {
  const width = matrix.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const rows = matrix.map((row) => {
    const cells = Array.from({ length: width }, (_, index) => String(row[index] ?? "").replace(/\s+/g, " ").trim());
    return { cells, text: cells.filter(Boolean).join(" "), single: cells.filter(Boolean).length === 1 };
  });
  return { columns: Array.from({ length: width }, (_, index) => ({ index })), rows };
}

function pdfLines(items, tolerance = 2.5) {
  const rows = [];
  [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x).forEach((item) => {
    let row = rows.at(-1);
    if (!row || row.page !== item.page || Math.abs(item.y - row.y) > tolerance) {
      row = { page: item.page, y: item.y, raw: [] };
      rows.push(row);
    }
    row.raw.push(item);
    row.y = row.raw.reduce((sum, entry) => sum + entry.y, 0) / row.raw.length;
  });
  return rows.map((row) => {
    const tokens = [];
    let token = null;
    row.raw.sort((a, b) => a.x - b.x).forEach((item) => {
      const height = item.h || 4.5;
      if (!token) token = { text: item.text, x: item.x, end: item.x + (item.w || 0) };
      else {
        const ratio = (item.x - token.end) / height;
        if (ratio < 1.2) {
          token.text += `${ratio < 0.08 ? "" : " "}${item.text}`;
          token.end = item.x + (item.w || 0);
        } else {
          tokens.push(token);
          token = { text: item.text, x: item.x, end: item.x + (item.w || 0) };
        }
      }
    });
    if (token) tokens.push(token);
    const clean = tokens.map((entry) => ({ ...entry, text: entry.text.replace(/\s+/g, " ").trim() })).filter((entry) => entry.text);
    return { ...row, items: clean, text: clean.map((entry) => entry.text).join(" ") };
  }).filter((row) => row.items.length);
}

export function gridFromPdf(items) {
  const lines = pdfLines(items);
  const samples = lines.filter((line) => line.items.length >= 3).flatMap((line) => line.items).sort((a, b) => a.x - b.x);
  const clusters = [];
  samples.forEach((token) => {
    let cluster = clusters.at(-1);
    if (!cluster || token.x - cluster.last > 13) {
      cluster = { left: token.x, right: token.end, last: token.x, count: 0 };
      clusters.push(cluster);
    }
    cluster.left = Math.min(cluster.left, token.x);
    cluster.right = Math.max(cluster.right, token.end);
    cluster.last = token.x;
    cluster.count += 1;
  });
  const columns = clusters.filter((cluster) => cluster.count >= 2).map((cluster, index) => ({ ...cluster, index }));
  const rows = lines.map((line) => {
    const cells = Array.from({ length: columns.length }, () => "");
    line.items.forEach((token) => {
      let best = 0;
      let distance = Number.POSITIVE_INFINITY;
      columns.forEach((column, index) => {
        const nextDistance = token.x >= column.left - 4 && token.x <= column.right + 4 ? 0 : Math.min(Math.abs(token.x - column.left), Math.abs(token.end - column.right));
        if (nextDistance < distance) { distance = nextDistance; best = index; }
      });
      cells[best] = cells[best] ? `${cells[best]} ${token.text}` : token.text;
    });
    return { cells, text: cells.filter(Boolean).join(" "), single: cells.filter(Boolean).length === 1 };
  });
  return { columns, rows };
}

function scanHeader(grid) {
  let best = null;
  grid.rows.slice(0, 25).forEach((row, rowIndex) => {
    const map = {};
    row.cells.forEach((value, columnIndex) => {
      const key = normalized(value);
      FIELD_ORDER.forEach((field) => {
        if (map[field] === undefined && FIELD_ALIASES[field]?.some((alias) => key === normalized(alias))) map[field] = columnIndex;
      });
    });
    const hits = Object.keys(map).length;
    const strong = ["name", "qty", "amount", "price"].filter((field) => map[field] !== undefined).length;
    if (hits >= 2 && strong >= 1 && (!best || hits > best.hits)) best = { rowIndex, map, hits };
  });
  return best;
}

function columnStats(grid, start) {
  return grid.columns.map((_, columnIndex) => {
    const values = grid.rows.slice(start).map((row) => cell(row.cells, columnIndex)).filter(Boolean);
    const numbers = values.map(numberValue).filter((value) => value !== null);
    return {
      index: columnIndex,
      values,
      filled: values.length,
      moneyRatio: values.length ? values.filter(moneyLike).length / values.length : 0,
      countRatio: values.length ? values.filter(countLike).length / values.length : 0,
      textRatio: values.length ? values.filter((value) => /[가-힣A-Za-z]/.test(value)).length / values.length : 0,
      averageLength: values.length ? values.reduce((sum, value) => sum + value.length, 0) / values.length : 0,
      mean: numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0,
      distinct: new Set(values).size,
    };
  });
}

function inferColumns(grid, start) {
  const stats = columnStats(grid, start);
  const minimum = Math.max(2, (grid.rows.length - start) * 0.25);
  const live = stats.filter((item) => item.filled >= minimum);
  const map = {};
  const money = live.filter((item) => item.moneyRatio >= 0.5).sort((a, b) => b.mean - a.mean);
  if (money.length) map.amount = money[0].index;
  if (money.length > 1) map.price = money.at(-1).index;
  const counts = live.filter((item) => ![map.amount, map.price].includes(item.index) && item.countRatio >= 0.5 && item.mean > 0 && item.mean < 2000).sort((a, b) => a.mean - b.mean);
  if (counts.length) map.qty = counts[0].index;
  const texts = live.filter((item) => ![map.amount, map.price, map.qty].includes(item.index) && item.textRatio >= 0.5).sort((a, b) => b.averageLength - a.averageLength);
  if (texts.length) map.name = texts[0].index;
  const rest = texts.slice(1);
  const media = rest.find((item) => item.averageLength <= 12 && item.distinct <= Math.max(3, item.filled * 0.6));
  if (media) map.media = media.index;
  const detail = rest.find((item) => item.index !== map.media && item.averageLength > 6);
  if (detail) map.detail = detail.index;
  const unit = live.find((item) => !Object.values(map).includes(item.index) && item.averageLength <= 4 && item.values.filter((value) => COUNT_UNITS.includes(value) || LUMP_UNITS.includes(value.toUpperCase())).length >= Math.max(2, item.values.length * 0.7));
  if (unit) map.unit = unit.index;
  return { map, stats };
}

function totalRow(value) {
  return /합계|총액|총결제|공급가액|부가세|VAT|할인금액|소계|TOTAL|SUBTOTAL/i.test(compact(value));
}

function readTotals(grid, start) {
  const totals = {};
  grid.rows.slice(start).forEach((row) => {
    const text = compact(row.text);
    const values = row.cells.filter(moneyLike);
    const value = numberValue(values.at(-1));
    if (value === null) return;
    if (/기준단가합계|정가합계|공급가합계|소계|SUBTOTAL/i.test(text) && totals.base === undefined) totals.base = value;
    else if (/할인/.test(text) && totals.discount === undefined) {
      totals.discount = Math.abs(value);
      const percent = /\(?([\d.]+)\s*%\)?/.exec(text);
      if (percent) totals.discountPct = Number(percent[1]);
    } else if (/공급가액|공급가/.test(text) && totals.supply === undefined) totals.supply = value;
    else if (/부가세|VAT/i.test(text) && totals.vat === undefined) totals.vat = value;
    else if (/총결제|총액|합계금액|TOTAL/i.test(text) && totals.total === undefined) totals.total = value;
    else if (/합계/.test(text) && totals.base === undefined) totals.base = value;
  });
  return totals;
}

function readMeta(grid, before) {
  const metadata = { client: "", project: "", manager: "", issuedAt: "", start: "", end: "" };
  const labels = {
    client: ["CLIENT", "고객", "고객사", "거래처", "수신", "업체", "업체명", "클라이언트", "상호"],
    project: ["PROJECT", "프로젝트", "캠페인", "건명", "공사명", "제목", "SUBJECT", "캠페인명"],
    manager: ["담당자", "담당", "연락처", "CONTACT", "MANAGER", "작성자"],
  };
  const periods = ["CAMPAIGNPERIOD", "기간", "캠페인기간", "진행기간", "계약기간", "PERIOD", "작업기간", "수행기간"];
  const allLabels = [...Object.values(labels).flat(), ...periods].map(normalized);
  const isLabel = (value) => allLabels.some((label) => normalized(value) === label || normalized(value).startsWith(label));
  const grab = (aliases, rowIndex) => {
    const cells = grid.rows[rowIndex].cells;
    for (let index = 0; index < cells.length; index += 1) {
      if (!aliases.some((alias) => normalized(cells[index]) === normalized(alias) || normalized(cells[index]).startsWith(normalized(alias)))) continue;
      const inline = /[:：]\s*(.+)$/.exec(cells[index]);
      if (inline?.[1]?.trim()) return inline[1].trim();
      for (let next = index + 1; next < cells.length; next += 1) {
        const value = cell(cells, next);
        if (value && !isLabel(value)) return value;
      }
      for (let next = rowIndex + 1; next < Math.min(rowIndex + 4, grid.rows.length); next += 1) {
        const value = cell(grid.rows[next].cells, index);
        if (value && !isLabel(value)) return value;
      }
    }
    return "";
  };
  for (let rowIndex = 0; rowIndex < Math.max(before, 1); rowIndex += 1) {
    Object.entries(labels).forEach(([field, aliases]) => { if (!metadata[field]) metadata[field] = grab(aliases, rowIndex); });
    const row = grid.rows[rowIndex];
    if (!metadata.start && periods.some((label) => row.cells.some((value) => normalized(value).startsWith(normalized(label))))) {
      let dates = datesIn(row.text);
      if (!dates.length) {
        for (let next = rowIndex + 1; next < Math.min(rowIndex + 4, grid.rows.length); next += 1) {
          dates = datesIn(grid.rows[next].text);
          if (dates.length) break;
        }
      }
      if (dates.length) { metadata.start = dates[0]; metadata.end = dates[1] || addIsoDays(dates[0], 29); }
    }
    if (!metadata.issuedAt && /견\s*적|발행|작성일|DATE/i.test(row.text)) metadata.issuedAt = datesIn(row.text)[0] || "";
  }
  return metadata;
}

export function analyzeQuoteGrid(grid) {
  if (!grid?.rows?.length || !grid?.columns?.length) throw new Error("견적서에서 표를 찾지 못했습니다.");
  const header = scanHeader(grid);
  let start = header ? header.rowIndex + 1 : 0;
  if (!header) {
    const inferredStart = grid.rows.findIndex((row) => row.cells.filter(Boolean).length >= 3 && row.cells.some(moneyLike));
    start = inferredStart < 0 ? 0 : inferredStart;
  }
  const inferred = inferColumns(grid, start);
  const map = {};
  FIELD_ORDER.forEach((field) => {
    if (header?.map[field] !== undefined) map[field] = header.map[field];
    else if (inferred.map[field] !== undefined) map[field] = inferred.map[field];
  });
  if (map.name === undefined && map.kind !== undefined && header) { map.name = map.kind; delete map.kind; }
  const claimed = new Set();
  ["name", "qty", "amount", "price", "unit", "media", "detail", "kind"].forEach((field) => {
    if (map[field] === undefined) return;
    if (claimed.has(map[field])) delete map[field]; else claimed.add(map[field]);
  });
  const rows = [];
  let band = "";
  for (let rowIndex = start; rowIndex < grid.rows.length; rowIndex += 1) {
    const row = grid.rows[rowIndex];
    const filled = row.cells.filter(Boolean);
    if (!filled.length) continue;
    if (totalRow(row.text)) break;
    if (filled.length === 1 && filled[0].length <= 16 && !/^\d/.test(filled[0])) {
      const position = row.cells.findIndex(Boolean);
      if (position >= 0 && position < (map.name ?? 1)) { band = filled[0]; continue; }
    }
    rows.push({ cells: [...row.cells], band, rowIndex });
  }
  const columns = grid.columns.map((_, index) => ({ index, label: header ? cell(grid.rows[header.rowIndex].cells, index) : "", samples: inferred.stats[index]?.values.slice(0, 3) || [] }));
  return { rows, columns, map, autoMapped: Boolean(header), metadata: readMeta(grid, start), totals: readTotals(grid, start) };
}

export function buildQuoteItems(analysis, mapping = analysis.map) {
  const mergedRows = [];
  analysis.rows.forEach((row) => {
    const name = cell(row.cells, mapping.name);
    const anchor = cell(row.cells, mapping.qty) || cell(row.cells, mapping.amount);
    if (!name) return;
    if (anchor || !mergedRows.length) mergedRows.push({ ...row, cells: [...row.cells] });
    else {
      const previous = mergedRows.at(-1);
      if (mapping.detail !== undefined && mapping.detail !== mapping.name) previous.cells[mapping.detail] = [previous.cells[mapping.detail], name].filter(Boolean).join(" / ");
      else previous.extraDetail = [previous.extraDetail, name].filter(Boolean).join(" / ");
    }
  });
  return mergedRows.map((row) => {
    const quantityRaw = cell(row.cells, mapping.qty);
    const match = /(\d[\d,]*)\s*([^\d\s]*)/.exec(quantityRaw) || [];
    const quantity = Math.max(1, Number.parseInt(String(match[1] || "1").replace(/,/g, ""), 10) || 1);
    const unit = cell(row.cells, mapping.unit) || match[2] || "";
    const mediaCell = cell(row.cells, mapping.media) || cell(row.cells, mapping.kind);
    const band = row.band || "";
    const fromCell = KIND_TO_MEDIA[normalized(mediaCell)] || (CHANNEL_WORDS.includes(normalized(mediaCell)) ? mediaCell : "");
    const bandValid = band && CHANNEL_WORDS.includes(normalized(band)) && !GENERIC_BANDS.includes(normalized(band));
    return {
      media: fromCell || (bandValid ? KIND_TO_MEDIA[normalized(band)] || band : "") || band || mediaCell || "기타",
      name: cell(row.cells, mapping.name),
      detail: cell(row.cells, mapping.detail) || row.extraDetail || "",
      quantity,
      unit,
      price: numberValue(cell(row.cells, mapping.price)),
      amount: numberValue(cell(row.cells, mapping.amount)),
      split: quantity > 1 && quantity <= 200 && !LUMP_UNITS.includes(unit.toUpperCase()),
    };
  }).filter((item) => item.name);
}

function taskWorkstream(title, detail, media) {
  const text = `${title} ${detail}`;
  if (/디자인|아트워크|썸네일|배너\s*제작|템플릿|시안/.test(text)) return "DESIGN";
  if (/영상|촬영|편집|쇼츠|숏폼|릴스|본편/.test(text) || /YOUTUBE|TIKTOK|유튜브|틱톡/i.test(media)) return "VIDEO";
  return "MARKETING";
}

function scheduleRange(start, end) {
  const length = Math.min(Math.max(0, daysBetween(start, end)), 3659);
  return Array.from({ length: length + 1 }, (_, index) => addIsoDays(start, index));
}

function materializeRows(items, { start, end, splitQuantities }) {
  const span = Math.max(1, daysBetween(start, end) + 1);
  return items.flatMap((item) => {
    const count = splitQuantities && item.split ? Math.min(item.quantity, 200) : 1;
    return Array.from({ length: count }, (_, index) => {
      const dueDate = count === 1 ? end : addIsoDays(start, Math.max(0, Math.round(((index + 1) * span) / count) - 1));
      const title = count === 1 ? item.name : `${item.name} ${index + 1}/${count}`;
      const workstreamCode = taskWorkstream(title, item.detail, item.media);
      return {
        phase_code: "P0",
        workstream_code: workstreamCode,
        category_code: item.media,
        title,
        description: item.detail || null,
        responsible_org_code: workstreamCode === "DESIGN" ? "POCKET" : "NS",
        reviewer_org_code: "POCKET",
        status_code: "NOT_STARTED",
        priority_code: "NORMAL",
        planned_start_date: start,
        due_date: dueDate,
        schedule_dates: scheduleRange(start, dueDate),
        progress_percent: 0,
        remarks: `${count === 1 && item.quantity > 1 ? `${item.quantity}${item.unit || ""} · ` : ""}${item.amount !== null ? `${Math.round(item.amount / count).toLocaleString("ko-KR")}원` : ""}`.trim() || null,
        visibility_code: "PROJECT_TEAM",
        source_code: "QUOTE_IMPORT",
      };
    });
  });
}

function deriveDesignRows(rows) {
  const additions = [];
  rows.forEach((row) => {
    const text = `${row.title} ${row.description || ""}`;
    let title = "";
    let detail = "";
    const description = String(row.description || "");
    const blogDesignIncluded = /대문|배너\s*(제작|디자인)|프로필\s*(제작|디자인)/.test(description);
    const channelDesignIncluded = /채널\s*아트|프로필\s*(제작|디자인)|썸네일\s*템플릿/.test(description);
    const thumbnailIncluded = /썸네일/.test(description);
    if (/블로그/.test(text) && /(계정|세팅|셋업|구축)/.test(text) && !blogDesignIncluded) { title = "디자인 제작"; detail = "블로그 대문·배너·프로필 디자인"; }
    else if (/YOUTUBE|유튜브/i.test(row.category_code) && /(채널|계정)/.test(text) && /(세팅|셋업|구축|최적화)/.test(text) && !channelDesignIncluded) { title = "디자인 제작"; detail = "채널아트·프로필·썸네일 템플릿 디자인"; }
    else if (/YOUTUBE|유튜브/i.test(row.category_code) && /본편/.test(text) && /(업로드|SEO|운영|제작)/.test(text) && !/쇼츠|숏폼|SHORTS|릴스/i.test(text) && !thumbnailIncluded) { title = "썸네일 제작"; detail = "본편 영상 썸네일 디자인"; }
    if (!title) return;
    if (rows.some((candidate) => candidate.category_code === row.category_code && candidate.title === title && candidate.planned_start_date === row.planned_start_date && candidate.due_date === row.due_date)) return;
    additions.push({ ...row, title, description: detail, workstream_code: "DESIGN", responsible_org_code: "POCKET", remarks: "견적 항목에서 자동 생성", source_code: "QUOTE_IMPORT_DERIVED" });
  });
  return [...rows, ...additions];
}

export function buildQuoteImportPayload({ analysis, items, selectedIndexes, clientName, projectName, start, end, splitQuantities = true, deriveDesign = true, fileName = "" }) {
  if (!start || !end || end < start) throw new Error("프로젝트 시작일과 종료일을 확인해 주세요.");
  const chosen = items.filter((_, index) => selectedIndexes.includes(index));
  if (!chosen.length) throw new Error("생성할 견적 항목을 하나 이상 선택해 주세요.");
  let tasks = materializeRows(chosen, { start, end, splitQuantities });
  if (deriveDesign) tasks = deriveDesignRows(tasks);
  if (tasks.length > MAX_QUOTE_TASKS) throw new Error(`한 번에 생성할 수 있는 업무는 ${MAX_QUOTE_TASKS}개입니다. 수량 분할을 끄거나 항목을 나눠 주세요.`);
  const quote = {
    source_file: fileName,
    issued_at: analysis.metadata.issuedAt || null,
    client: analysis.metadata.client || clientName || null,
    project: analysis.metadata.project || projectName || null,
    manager: analysis.metadata.manager || null,
    imported_at: new Date().toISOString(),
    totals: analysis.totals || {},
    selected_item_count: chosen.length,
    generated_task_count: tasks.length,
  };
  return {
    fields: { client_name: clientName.trim(), project_name: projectName.trim(), description: "견적서에서 생성한 마케팅 프로젝트", start_date: start, end_date: end },
    quote,
    tasks,
  };
}

const LIBRARIES = {
  sheet: ["https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"],
  pdf: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"],
};
const libraryPromises = {};

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`파일 해석 도구를 불러오지 못했습니다: ${url}`));
    document.head.appendChild(script);
  });
}

async function ensureLibrary(kind) {
  const read = () => kind === "sheet" ? globalThis.XLSX : globalThis.pdfjsLib;
  if (read()) return read();
  if (!libraryPromises[kind]) libraryPromises[kind] = (async () => {
    let lastError;
    for (const url of LIBRARIES[kind]) {
      try { await loadScript(url); if (read()) return read(); } catch (error) { lastError = error; }
    }
    throw lastError || new Error("파일 해석 도구를 준비하지 못했습니다.");
  })().catch((error) => { delete libraryPromises[kind]; throw error; });
  return libraryPromises[kind];
}

function fileKind(file) {
  const extension = String(file.name || "").split(".").at(-1).toLowerCase();
  if (extension === "pdf") return "pdf";
  if (["csv", "tsv", "txt"].includes(extension)) return "csv";
  if (["xlsx", "xls", "xlsm", "xlsb", "ods"].includes(extension)) return "sheet";
  throw new Error("PDF, 엑셀 또는 CSV 견적서만 불러올 수 있습니다.");
}

async function pdfTextItems(library, buffer, onProgress) {
  library.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const document = await library.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true }).promise;
  const items = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    content.items.forEach((item) => {
      const text = String(item.str || "").trim();
      if (text) items.push({ text, x: item.transform[4], y: viewport.height - item.transform[5], w: item.width, h: item.height, page: pageNumber });
    });
    onProgress?.({ stage: "parsing", detail: `${pageNumber} / ${document.numPages}쪽` });
  }
  return items;
}

export async function readQuoteFile(file, onProgress) {
  if (!file) throw new Error("견적서 파일을 선택해 주세요.");
  if (file.size > MAX_FILE_BYTES) throw new Error("견적서는 20MB 이하 파일만 불러올 수 있습니다.");
  const kind = fileKind(file);
  onProgress?.({ stage: "reading", detail: file.name });
  let grid;
  let sheetName = "";
  if (kind === "csv") {
    grid = gridFromCells(parseDelimited(await file.text(), file.name.toLowerCase().endsWith(".tsv") ? "\t" : undefined));
  } else if (kind === "sheet") {
    onProgress?.({ stage: "library", detail: "엑셀 해석 도구 준비" });
    const XLSX = await ensureLibrary("sheet");
    const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    const candidates = workbook.SheetNames.map((name) => {
      const candidateGrid = gridFromCells(XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }));
      try {
        const analysis = analyzeQuoteGrid(candidateGrid);
        return { name, grid: candidateGrid, analysis, score: analysis.rows.length + (analysis.map.name !== undefined ? 100 : 0) };
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    if (!candidates.length) throw new Error("엑셀 시트에서 견적 항목 표를 찾지 못했습니다.");
    ({ grid, name: sheetName } = candidates[0]);
  } else {
    onProgress?.({ stage: "library", detail: "PDF 해석 도구 준비" });
    const PDF = await ensureLibrary("pdf");
    grid = gridFromPdf(await pdfTextItems(PDF, await file.arrayBuffer(), onProgress));
  }
  onProgress?.({ stage: "matching", detail: "항목과 수량을 확인하는 중" });
  const analysis = analyzeQuoteGrid(grid);
  const items = buildQuoteItems(analysis);
  if (!items.length) throw new Error("견적 항목을 찾지 못했습니다. 열 지정을 확인해 주세요.");
  return { fileName: file.name, kind, sheetName, analysis, items };
}

export function quoteColumnLabel(column) {
  if (column.label) return `열 ${column.index + 1} · ${column.label}`;
  const samples = column.samples.filter(Boolean).slice(0, 2).join(", ");
  return `열 ${column.index + 1}${samples ? ` · ${samples.slice(0, 24)}` : " (빈 열)"}`;
}
