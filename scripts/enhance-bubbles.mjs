import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const username = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || "fateme529";
const outputDir = process.env.OUTPUT_DIR || "dist";

const themes = [
  {
    source: "base-light.svg",
    output: "github-activity-bubbles.svg",
    background: "#F8F4FA",
    panel: "#FFFDFB",
    border: "#D8C6E3",
    text: "#2A1925",
    muted: "#7A6474",
    empty: "#F0E7F4",
    levels: ["#F0E7F4", "#D8C6E3", "#B99AC8", "#815799", "#512A46"],
    bubbleStart: "#E9DDF0",
    bubbleMiddle: "#B99AC8",
    bubbleEnd: "#512A46",
    dust: "#815799",
    progressStart: "#B99AC8",
    progressEnd: "#512A46",
  },
  {
    source: "base-dark.svg",
    output: "github-activity-bubbles-dark.svg",
    background: "#1B1219",
    panel: "#241923",
    border: "#5B3B52",
    text: "#FFFDFB",
    muted: "#C8B7C2",
    empty: "#33242F",
    levels: ["#33242F", "#5F4259", "#815799", "#B99AC8", "#E9DDF0"],
    bubbleStart: "#815799",
    bubbleMiddle: "#B99AC8",
    bubbleEnd: "#E9DDF0",
    dust: "#C8ADD6",
    progressStart: "#815799",
    progressEnd: "#E9DDF0",
  },
];

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

async function fetchContributionTotal() {
  const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "text/html", "User-Agent": "fateme529-contribution-bubbles" },
      });
      if (response.ok) {
        const html = await response.text();
        const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const match = plain.match(/([\d,]+) contributions? in the last year/i);
        if (match) return match[1];
      }
    } catch {
      // Retry transient network failures.
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  return null;
}

function monthLabels(now = new Date()) {
  const currentSunday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - now.getUTCDay(),
  ));
  const firstSunday = new Date(currentSunday);
  firstSunday.setUTCDate(firstSunday.getUTCDate() - 52 * 7);

  const labels = [];
  let previousMonth = -1;
  for (let column = 0; column < 53; column += 1) {
    const date = new Date(firstSunday);
    date.setUTCDate(date.getUTCDate() + column * 7);
    const month = date.getUTCMonth();
    if (column === 0 || month !== previousMonth) {
      labels.push({
        column,
        name: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date),
      });
    }
    previousMonth = month;
  }

  const spaced = [];
  for (const label of labels) {
    const previous = spaced.at(-1);
    if (previous && label.column - previous.column < 3) spaced[spaced.length - 1] = label;
    else spaced.push(label);
  }
  return spaced;
}

function readCells(svg) {
  const styleStart = svg.indexOf("<style>");
  const styleEnd = svg.indexOf("</style>", styleStart);
  const style = styleStart >= 0 && styleEnd >= 0 ? svg.slice(styleStart + 7, styleEnd) : svg;
  const cells = [];
  const pattern = /<rect class="c(?: (c[0-9a-z]+))?" x="([\d.]+)" y="([\d.]+)"[^>]*\/>/g;

  for (const match of svg.matchAll(pattern)) {
    const className = match[1] || null;
    const cell = {
      className,
      x: Number(match[2]),
      y: Number(match[3]),
      level: 0,
      sourceTime: 0,
    };
    if (className) {
      const levelMatch = new RegExp(`\\.c\\.${className}\\{fill:var\\(--c([0-4])\\)`).exec(style);
      if (levelMatch) cell.level = Number(levelMatch[1]);

      const start = style.indexOf(`@keyframes ${className}{`);
      const end = style.indexOf(`}.c.${className}{`, start);
      if (start >= 0 && end >= 0) {
        const times = [...style.slice(start, end).matchAll(/([\d.]+)%/g)];
        if (times.length) cell.sourceTime = Number(times[0][1]);
      }
    }
    cells.push(cell);
  }
  if (!cells.length) throw new Error("No contribution cells were found in the generated SVG.");
  return cells;
}

function pct(value) {
  return Math.max(0, Math.min(100, value)).toFixed(2).replace(/\.00$/, "");
}

function bubbleAnimation(activeCells, theme) {
  const duration = 22000;
  const css = [];
  const markup = [];
  const sorted = [...activeCells].sort((a, b) => a.sourceTime - b.sourceTime);
  const denominator = Math.max(1, sorted.length - 1);

  sorted.forEach((cell, index) => {
    const event = 8 + (index / denominator) * 76;
    const start = event - 4;
    const middle = event - 1.5;
    const peak = event + 1.8;
    const burst = event + 3.7;
    const powderEnd = event + 7.2;
    const name = `b${index}`;
    const particleName = `p${index}`;
    const radius = 5.2 + Math.max(1, cell.level) * 0.9;

    css.push(`@keyframes ${name}{0%,${pct(start)}%{opacity:0;transform:scale(.12);fill:${theme.bubbleStart}}${pct(middle)}%{opacity:.76;transform:scale(.55);fill:${theme.bubbleStart}}${pct(peak)}%{opacity:.94;transform:scale(1.55);fill:${theme.bubbleMiddle}}${pct(burst)}%{opacity:0;transform:scale(1.95);fill:${theme.bubbleEnd}}100%{opacity:0;transform:scale(1.95);fill:${theme.bubbleEnd}}}`);
    css.push(`@keyframes ${particleName}{0%,${pct(peak)}%{opacity:0;transform:translate(0,0) scale(.25)}${pct(burst)}%{opacity:.92;transform:translate(0,0) scale(1)}${pct(powderEnd)}%,100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.12)}}`);

    const centerX = 86 + cell.x + 6;
    const centerY = 84 + cell.y + 6;
    const particles = [];
    for (let particle = 0; particle < 9; particle += 1) {
      const angle = ((Math.PI * 2) / 9) * particle + index * 0.31;
      const distance = 11 + ((index + particle) % 4) * 2.4;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const particleRadius = 1.15 + ((index + particle) % 3) * 0.35;
      particles.push(`<circle class="powder ${particleName}" r="${particleRadius.toFixed(2)}" style="--dx:${dx.toFixed(2)}px;--dy:${dy.toFixed(2)}px"/>`);
    }

    markup.push(`<g transform="translate(${centerX} ${centerY})"><circle class="bubble ${name}" r="${radius.toFixed(2)}"/>${particles.join("")}</g>`);
  });

  return { duration, css: css.join(""), markup: markup.join("") };
}

function render(svg, theme, contributionTotal) {
  const cells = readCells(svg);
  const activeCells = cells.filter((cell) => cell.className);
  const animation = bubbleAnimation(activeCells, theme);
  const months = monthLabels()
    .map(({ column, name }) => `<text x="${88 + column * 16}" y="70" class="month">${name}</text>`)
    .join("");
  const grid = cells.map((cell) => {
    const fill = theme.levels[Math.max(0, Math.min(4, cell.level))];
    const className = cell.className ? "cell active" : "cell";
    return `<rect class="${className}" x="${86 + cell.x}" y="${84 + cell.y}" width="12" height="12" rx="3" fill="${fill}"/>`;
  }).join("");
  const title = contributionTotal
    ? `${escapeXml(contributionTotal)} contributions in the last year`
    : `${activeCells.length} active days in the last year`;

  return `<svg viewBox="0 0 1000 300" width="1000" height="300" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">Fatemeh's contribution bubbles</title>
  <desc id="desc">Real GitHub contribution days bloom into lilac and plum bubbles, then dissolve into small particles.</desc>
  <defs>
    <linearGradient id="progress" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${theme.progressStart}"/><stop offset="1" stop-color="${theme.progressEnd}"/></linearGradient>
    <filter id="bubbleGlow" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="1.2" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="panelClip"><rect x="1" y="1" width="998" height="298" rx="22"/></clipPath>
  </defs>
  <style>
    .label{font:700 20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:${theme.text}}
    .meta{font:650 10px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.8px;fill:${theme.muted}}
    .month{font:600 11px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:${theme.muted}}
    .axis{font:600 10px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;fill:${theme.muted}}
    .cell{shape-rendering:geometricPrecision;stroke:${theme.border};stroke-width:.65px}
    .active{stroke:${theme.bubbleEnd};stroke-opacity:.28}
    .bubble{opacity:0;stroke:${theme.bubbleEnd};stroke-width:1.1px;transform-box:fill-box;transform-origin:center;animation:none ${animation.duration}ms cubic-bezier(.22,.61,.36,1) infinite;filter:url(#bubbleGlow)}
    .powder{opacity:0;fill:${theme.dust};transform-box:fill-box;transform-origin:center;animation:none ${animation.duration}ms ease-out infinite}
    ${animation.css}
    ${activeCells.map((_, index) => `.b${index}{animation-name:b${index}}.p${index}{animation-name:p${index}}`).join("")}
    .progress{transform-box:fill-box;transform-origin:left center;animation:progress ${animation.duration}ms linear infinite}
    @keyframes progress{0%{transform:scale(0,1)}92%,100%{transform:scale(1,1)}}
    @media (prefers-reduced-motion:reduce){.bubble,.powder,.progress{animation:none}.bubble,.powder{display:none}.progress{transform:scale(1,1)}}
  </style>
  <g clip-path="url(#panelClip)">
    <rect width="1000" height="300" fill="${theme.background}"/>
    <rect x="14" y="14" width="972" height="272" rx="17" fill="${theme.panel}" stroke="${theme.border}"/>
    <text x="86" y="42" class="label">${title}</text>
    <text x="934" y="42" text-anchor="end" class="meta">REAL ACTIVITY · ONE DAY AT A TIME</text>
    ${months}
    <text x="42" y="118" class="axis">Mon</text><text x="42" y="150" class="axis">Wed</text><text x="42" y="182" class="axis">Fri</text>
    <g>${grid}</g>
    <g>${animation.markup}</g>
    <g transform="translate(748 214)"><text x="0" y="10" class="axis">Less</text>${theme.levels.map((color, index) => `<rect x="${34 + index * 16}" y="0" width="12" height="12" rx="3" fill="${color}"/>`).join("")}<text x="122" y="10" class="axis">More</text></g>
    <text x="86" y="252" class="meta">ACTIVITY BLOOM · EACH BURST STARTS ON A REAL CONTRIBUTION DAY</text>
    <rect x="86" y="264" width="848" height="10" rx="5" fill="${theme.empty}"/>
    <rect class="progress" x="86" y="264" width="848" height="10" rx="5" fill="url(#progress)"/>
  </g>
  <rect x="1" y="1" width="998" height="298" rx="22" fill="none" stroke="${theme.border}" stroke-width="2"/>
</svg>`;
}

const contributionTotal = await fetchContributionTotal();
for (const theme of themes) {
  const sourcePath = join(outputDir, theme.source);
  const outputPath = join(outputDir, theme.output);
  const sourceSvg = await readFile(sourcePath, "utf8");
  await writeFile(outputPath, render(sourceSvg, theme, contributionTotal));
  await unlink(sourcePath);
}

console.log(`Created contribution bubbles for ${username}${contributionTotal ? ` with ${contributionTotal} yearly contributions` : ""}.`);
