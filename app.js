const DATA_DIR = "data";
const THEME_KEY = "postMergeRealityTheme";
const COLORS = {
  agentic: "#F58F29",
  human: "#8789C0",
  bot: "#9B9B9B",
  corrective: "#D55E00",
  adaptive: "#0072B2",
  perfective: "#009E73",
  preventive: "#CC79A7",
  management: "#E69F00",
};
const MAINTENANCE_CLASSES = ["corrective", "adaptive", "perfective", "preventive", "management"];
const MAINTENANCE_LABELS = {
  corrective: "Corrective",
  adaptive: "Adaptive",
  perfective: "Perfective",
  preventive: "Preventive",
  management: "Management",
};
const ROLE_MAINTENANCE_SHADES = {
  Agentic: ["#F58F29", "#F8A34F", "#FAB875", "#FCCC9C", "#FEE1C2"],
  Human: ["#8789C0", "#9C9EC9", "#B1B3D4", "#C7C8DF", "#DDDEEA"],
};
const TERMINAL_ACTORS = [
  "terminated_by_agentic",
  "terminated_by_human",
  "terminated_by_bot",
  "survived",
  "terminated_by_unknown",
];
const SANKEY_VISIBLE_ACTORS = [
  "terminated_by_agentic",
  "terminated_by_human",
  "terminated_by_bot",
  "survived",
];
const TERMINAL_ACTOR_LABELS = {
  terminated_by_agentic: "Agentic",
  terminated_by_human: "Human",
  terminated_by_bot: "Bot",
  survived: "Survived",
  terminated_by_unknown: "Unknown",
};
const TERMINAL_ACTOR_COLORS = {
  terminated_by_agentic: COLORS.agentic,
  terminated_by_human: COLORS.human,
  terminated_by_bot: COLORS.bot,
  survived: "#59A14F",
  terminated_by_unknown: "#C7C7C7",
};

const state = {
  repos: [],
  weekly: [],
  distributions: {},
  overview: {},
  selectedRepo: "",
  search: "",
  language: "",
  minAgentic: 0,
  activeTab: "findings",
};

let chartTooltip = null;

const fmt = new Intl.NumberFormat("en-US");
const pct = (value, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value)
    ? "n/a"
    : `${(value * 100).toFixed(digits)}%`;

function colorRoleTerms(text) {
  return String(text)
    .replace(/\bAgentic\b/g, '<span class="agenticText">Agentic</span>')
    .replace(/\bagentic\b/g, '<span class="agenticText">agentic</span>')
    .replace(/\bHuman\b/g, '<span class="humanText">Human</span>')
    .replace(/\bhuman\b/g, '<span class="humanText">human</span>');
}

function roleTextStyle(text) {
  const normalized = String(text).toLowerCase();
  if (normalized.includes("agentic") || normalized.includes("ag.")) {
    return `fill: ${COLORS.agentic}`;
  }
  if (normalized.includes("human") || normalized.includes("hu.")) {
    return `fill: ${COLORS.human}`;
  }
  return "";
}

function cssVar(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (_error) {
    return null;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (_error) {
    // Ignore storage failures; the toggle still works for the current page load.
  }
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = normalized;
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    const isDark = normalized === "dark";
    const label = isDark ? "Switch to light mode" : "Switch to dark mode";
    const text = document.getElementById("themeToggleText");
    if (text) text.textContent = label;
    toggle.setAttribute("aria-label", label);
    toggle.setAttribute("aria-pressed", String(isDark));
    toggle.setAttribute("title", label);
  }
}

function initTheme() {
  const stored = getStoredTheme();
  const preferredDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  applyTheme(stored || (preferredDark ? "dark" : "light"));
}

function bindThemeToggle() {
  const toggle = document.getElementById("themeToggle");
  toggle.addEventListener("click", () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    storeTheme(nextTheme);
    if (state.activeTab === "visualization" && state.repos.length) {
      renderAll();
    }
  });
}

function svgEl(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, value);
  }
  return element;
}

function clearSvg(svg) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const width = svg.clientWidth || 800;
  const height = svg.clientHeight || 300;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  return { width, height };
}

function extent(values, fallback = [0, 1]) {
  const clean = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value));
  if (!clean.length) return fallback;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  return min === max ? [min, min + 1] : [min, max];
}

function scale(domainMin, domainMax, rangeMin, rangeMax) {
  return (value) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return rangeMin + ((value - domainMin) / (domainMax - domainMin || 1)) * (rangeMax - rangeMin);
  };
}

function niceAxisMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * base;
}

function formatAxisValue(value) {
  if (Math.abs(value) >= 10 || Number.isInteger(value)) return fmt.format(Math.round(value));
  return value.toFixed(1);
}

function addText(svg, text, x, y, attrs = {}) {
  const roleStyle = roleTextStyle(text);
  if (roleStyle && !attrs.style) {
    attrs = { ...attrs, style: roleStyle };
  }
  const node = svgEl("text", { x, y, ...attrs });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function ensureChartTooltip() {
  if (chartTooltip && document.body.contains(chartTooltip)) return chartTooltip;
  chartTooltip = document.createElement("div");
  chartTooltip.className = "chartTooltip";
  document.body.appendChild(chartTooltip);
  return chartTooltip;
}

function positionChartTooltip(clientX, clientY) {
  const tooltip = ensureChartTooltip();
  const margin = 12;
  const offset = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + offset;
  let top = clientY + offset;
  if (left + rect.width + margin > window.innerWidth) {
    left = clientX - rect.width - offset;
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = clientY - rect.height - offset;
  }
  tooltip.style.left = `${Math.max(margin, left)}px`;
  tooltip.style.top = `${Math.max(margin, top)}px`;
}

function showChartTooltip(event, text) {
  const tooltip = ensureChartTooltip();
  tooltip.textContent = text;
  tooltip.classList.add("visible");
  positionChartTooltip(event.clientX, event.clientY);
}

function moveChartTooltip(event) {
  if (!chartTooltip?.classList.contains("visible")) return;
  positionChartTooltip(event.clientX, event.clientY);
}

function hideChartTooltip() {
  if (!chartTooltip) return;
  chartTooltip.classList.remove("visible");
}

function addTitle(node, text) {
  if (!text) return node;
  node.dataset.tooltip = text;
  node.style.cursor = "pointer";
  node.addEventListener("pointerenter", (event) => showChartTooltip(event, text));
  node.addEventListener("pointermove", moveChartTooltip);
  node.addEventListener("pointerleave", hideChartTooltip);
  node.addEventListener("pointercancel", hideChartTooltip);
  return node;
}

function formatPercentExact(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(2)}%`;
}

function formatRateExact(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(3)} per 100 commits`;
}

function addAxes(svg, plot, xLabel, yLabel) {
  const axisColor = cssVar("--axis") || "#d0d0d4";
  svg.appendChild(svgEl("line", { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: axisColor }));
  svg.appendChild(svgEl("line", { x1: plot.left, y1: plot.top, x2: plot.left, y2: plot.bottom, stroke: axisColor }));
  addText(svg, xLabel, (plot.left + plot.right) / 2, plot.bottom + 42, { "text-anchor": "middle", class: "chartLabel" });
  addText(svg, yLabel, 18, (plot.top + plot.bottom) / 2, { "text-anchor": "middle", class: "chartLabel", transform: `rotate(-90 18 ${(plot.top + plot.bottom) / 2})` });
}

function languageOptions() {
  return [...new Set(state.repos.map((repo) => repo.primary_language || "Unknown"))].sort();
}

function filteredRepos() {
  const query = state.search.trim().toLowerCase();
  return state.repos.filter((repo) => {
    if (query && !repo.repo.toLowerCase().includes(query)) return false;
    if (state.language && repo.primary_language !== state.language) return false;
    if (repo.agentic_commits < state.minAgentic) return false;
    return true;
  });
}

function focusedRepos() {
  if (!state.selectedRepo) return filteredRepos();
  return state.repos.filter((repo) => repo.repo_key === state.selectedRepo);
}

function filteredWeekly() {
  const keys = new Set(focusedRepos().map((repo) => repo.repo_key));
  return state.weekly.filter((row) => keys.has(row.repo_key));
}

function updateControls() {
  const languageSelect = document.getElementById("languageSelect");
  languageSelect.innerHTML = `<option value="">All languages</option>` +
    languageOptions().map((language) => `<option value="${language}">${language}</option>`).join("");

  updateRepoSelect();
}

function compareRepoNames(a, b) {
  const aName = String(a.repo || "");
  const bName = String(b.repo || "");
  const aStartsWithNumber = /^\d/.test(aName.trim());
  const bStartsWithNumber = /^\d/.test(bName.trim());
  if (aStartsWithNumber !== bStartsWithNumber) {
    return aStartsWithNumber ? 1 : -1;
  }
  return aName.localeCompare(bName, undefined, { sensitivity: "base" });
}

function updateRepoSelect() {
  const repoSelect = document.getElementById("repoSelect");
  const repos = filteredRepos().slice().sort(compareRepoNames);
  repoSelect.innerHTML = `<option value="">All filtered repos</option>` +
    repos.map((repo) => `<option value="${repo.repo_key}">${repo.repo}</option>`).join("");
  repoSelect.value = state.selectedRepo;
}

function renderCards() {
  const repos = focusedRepos();
  const totals = repos.reduce(
    (acc, repo) => {
      acc.repos += 1;
      acc.commits += repo.total_commits;
      acc.agentic += repo.agentic_commits;
      acc.human += repo.human_commits;
      acc.lines += repo.lifecycle_total_lines;
      acc.survived += repo.survived_lines;
      return acc;
    },
    { repos: 0, commits: 0, agentic: 0, human: 0, lines: 0, survived: 0 },
  );
  const cards = [
    ["Repositories", fmt.format(totals.repos)],
    ["Commits", fmt.format(totals.commits)],
    ["Agentic commit share", pct(totals.commits ? totals.agentic / totals.commits : null)],
    ["Tracked line survival", pct(totals.lines ? totals.survived / totals.lines : null)],
  ];
  document.getElementById("overviewCards").innerHTML = cards
    .map(([label, value]) => `<div class="card"><div class="label">${colorRoleTerms(label)}</div><div class="value">${value}</div></div>`)
    .join("");
}

function aggregateWeekly(rows) {
  const byWeek = new Map();
  for (const row of rows) {
    if (!row.week) continue;
    const current = byWeek.get(row.week) || {
      week: row.week,
      agentic_tracked_lines: 0,
      agentic_survived_lines: 0,
      human_tracked_lines: 0,
      human_survived_lines: 0,
    };
    current.agentic_tracked_lines += Number(row.agentic_tracked_lines || 0);
    current.agentic_survived_lines += Number(row.agentic_survived_lines || 0);
    current.human_tracked_lines += Number(row.human_tracked_lines || 0);
    current.human_survived_lines += Number(row.human_survived_lines || 0);
    byWeek.set(row.week, current);
  }
  return [...byWeek.values()]
    .map((row) => ({
      week: row.week,
      agentic_tracked_lines: row.agentic_tracked_lines,
      agentic_survived_lines: row.agentic_survived_lines,
      human_tracked_lines: row.human_tracked_lines,
      human_survived_lines: row.human_survived_lines,
      agentic_line_survival_rate: row.agentic_tracked_lines
        ? row.agentic_survived_lines / row.agentic_tracked_lines
        : null,
      human_line_survival_rate: row.human_tracked_lines
        ? row.human_survived_lines / row.human_tracked_lines
        : null,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

function renderTimeline() {
  const svg = document.getElementById("timelineChart");
  const { width, height } = clearSvg(svg);
  const rows = aggregateWeekly(filteredWeekly());
  const plot = { left: 68, right: width - 22, top: 22, bottom: height - 64 };
  addAxes(svg, plot, "Week", "Line survival rate");
  if (!rows.length) return;
  const x = scale(0, rows.length - 1, plot.left, plot.right);
  const yMax = Math.max(
    1,
    ...rows.flatMap((row) => [
      row.agentic_line_survival_rate || 0,
      row.human_line_survival_rate || 0,
    ]),
  );
  const y = scale(0, yMax, plot.bottom, plot.top);
  const lines = [
    ["agentic_line_survival_rate", "Agentic survival", COLORS.agentic],
    ["human_line_survival_rate", "Human survival", COLORS.human],
  ];
  for (const [key, label, color] of lines) {
    const plottedPoints = rows
      .map((row, index) => ({ row, index, x: x(index), y: y(row[key]), value: row[key] }))
      .filter((point) => point.y !== null);
    const points = plottedPoints
      .map((point) => `${point.x},${point.y}`)
      .join(" ");
    const line = svgEl("polyline", { points, fill: "none", stroke: color, "stroke-width": 2.2 });
    addTitle(line, `${label}\nHover a point for weekly values.`);
    svg.appendChild(line);
    for (const point of plottedPoints) {
      const prefix = key.startsWith("agentic") ? "agentic" : "human";
      const survived = point.row[`${prefix}_survived_lines`] || 0;
      const tracked = point.row[`${prefix}_tracked_lines`] || 0;
      const dot = svgEl("circle", {
        cx: point.x,
        cy: point.y,
        r: 5,
        fill: color,
        opacity: 0.18,
      });
      addTitle(
        dot,
        `${label}\nWeek: ${point.row.week.slice(0, 10)}\nSurvival: ${formatPercentExact(point.value)}\nSurvived lines: ${fmt.format(survived)}\nTracked lines: ${fmt.format(tracked)}`,
      );
      svg.appendChild(dot);
    }
  }
  rows.filter((_row, index) => index % Math.ceil(rows.length / 5 || 1) === 0).forEach((row, index) => {
    const sourceIndex = rows.indexOf(row);
    addText(svg, row.week.slice(0, 10), x(sourceIndex), plot.bottom + 22, { "text-anchor": "middle", class: "chartLabel" });
  });
  const legendY = plot.bottom - 9;
  const legendX = Math.max(plot.left + 12, plot.right - 330);
  lines.forEach(([_key, label, color], index) => {
    const xPos = legendX + index * 165;
    svg.appendChild(svgEl("line", {
      x1: xPos,
      y1: legendY - 4,
      x2: xPos + 22,
      y2: legendY - 4,
      stroke: color,
      "stroke-width": 3,
    }));
    addText(svg, label, xPos + 28, legendY, { class: "chartLabel" });
  });
}

function renderMaintenance() {
  const svg = document.getElementById("maintenanceChart");
  const { width, height } = clearSvg(svg);
  const repos = focusedRepos();
  const counts = {
    Agentic: Object.fromEntries(MAINTENANCE_CLASSES.map((key) => [key, 0])),
    Human: Object.fromEntries(MAINTENANCE_CLASSES.map((key) => [key, 0])),
  };
  for (const repo of repos) {
    const byRole = repo.maintenance_class_counts_by_role || {};
    for (const role of ["Agentic", "Human"]) {
      const roleCounts = byRole[role] || {};
      for (const key of MAINTENANCE_CLASSES) {
        counts[role][key] += Number(roleCounts[key] || 0);
      }
    }
  }
  renderMaintenanceStackedChart(svg, width, height, counts, "commits");
}

function renderTerminalMaintenance() {
  const svg = document.getElementById("terminalMaintenanceChart");
  const { width, height } = clearSvg(svg);
  const repos = focusedRepos();
  const counts = {
    Agentic: Object.fromEntries(MAINTENANCE_CLASSES.map((key) => [key, 0])),
    Human: Object.fromEntries(MAINTENANCE_CLASSES.map((key) => [key, 0])),
  };
  for (const repo of repos) {
    const byRole = repo.terminal_maintenance_class_counts_by_role || {};
    for (const role of ["Agentic", "Human"]) {
      const roleCounts = byRole[role] || {};
      for (const key of MAINTENANCE_CLASSES) {
        counts[role][key] += Number(roleCounts[key] || 0);
      }
    }
  }
  renderMaintenanceStackedChart(svg, width, height, counts, "terminal lines");
}

function aggregateOriginTerminalFlow(repos) {
  const counts = {
    Agentic: Object.fromEntries(TERMINAL_ACTORS.map((actor) => [actor, 0])),
    Human: Object.fromEntries(TERMINAL_ACTORS.map((actor) => [actor, 0])),
  };
  for (const repo of repos) {
    const flow = repo.origin_terminal_actor_flow || {};
    for (const role of ["Agentic", "Human"]) {
      const roleCounts = flow[role] || {};
      for (const actor of TERMINAL_ACTORS) {
        counts[role][actor] += Number(roleCounts[actor] || 0);
      }
    }
  }
  return counts;
}

function compactLineCount(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return fmt.format(value);
}

function nodePositions(order, totals, totalFlow, top, bottom, gap) {
  const nodes = order.filter((node) => totals[node] > 0);
  if (!nodes.length || totalFlow <= 0) return {};
  const availableHeight = bottom - top - gap * Math.max(nodes.length - 1, 0);
  const flowScale = availableHeight / totalFlow;
  return { positions: nodePositionsWithScale(nodes, totals, top, gap, flowScale), flowScale };
}

function nodePositionsWithScale(order, totals, top, gap, flowScale) {
  const positions = {};
  let cursor = top;
  for (const node of order) {
    const height = totals[node] * flowScale;
    positions[node] = { top: cursor, bottom: cursor + height };
    cursor += height + gap;
  }
  return positions;
}

function sankeyPath(xLeft, xRight, leftTop, leftBottom, rightTop, rightBottom) {
  const curve = (xRight - xLeft) * 0.42;
  return [
    `M ${xLeft} ${leftTop}`,
    `C ${xLeft + curve} ${leftTop}, ${xRight - curve} ${rightTop}, ${xRight} ${rightTop}`,
    `L ${xRight} ${rightBottom}`,
    `C ${xRight - curve} ${rightBottom}, ${xLeft + curve} ${leftBottom}, ${xLeft} ${leftBottom}`,
    "Z",
  ].join(" ");
}

function renderOriginTerminalSankey() {
  const svg = document.getElementById("originTerminalSankey");
  const { width, height } = clearSvg(svg);
  const counts = aggregateOriginTerminalFlow(focusedRepos());
  const originOrder = ["Agentic", "Human"];
  const actorOrder = TERMINAL_ACTORS.filter((actor) =>
    originOrder.some((role) => counts[role][actor] > 0),
  );
  const originTotals = Object.fromEntries(
    originOrder.map((role) => [
      role,
      TERMINAL_ACTORS.reduce((sum, actor) => sum + counts[role][actor], 0),
    ]),
  );
  const actorTotals = Object.fromEntries(
    actorOrder.map((actor) => [
      actor,
      originOrder.reduce((sum, role) => sum + counts[role][actor], 0),
    ]),
  );
  const totalFlow = originOrder.reduce((sum, role) => sum + originTotals[role], 0);
  if (!totalFlow || !actorOrder.length) {
    addText(svg, "No lifecycle flow data for the current filter.", width / 2, height / 2, {
      "text-anchor": "middle",
      class: "chartLabel",
    });
    return;
  }

  const plot = { left: 86, right: width - 94, top: 24, bottom: height - 64 };
  const nodeWidth = 18;
  const gap = 12;
  const leftLayout = nodePositions(originOrder, originTotals, totalFlow, plot.top, plot.bottom, gap);
  const rightLayout = nodePositions(actorOrder, actorTotals, totalFlow, plot.top, plot.bottom, gap);
  const flowScale = Math.min(leftLayout.flowScale, rightLayout.flowScale);
  const leftPositions = nodePositionsWithScale(
    originOrder.filter((role) => originTotals[role] > 0),
    originTotals,
    plot.top,
    gap,
    flowScale,
  );
  const rightPositions = nodePositionsWithScale(
    actorOrder,
    actorTotals,
    plot.top,
    gap,
    flowScale,
  );
  const leftCursor = Object.fromEntries(Object.entries(leftPositions).map(([node, pos]) => [node, pos.top]));
  const rightCursor = Object.fromEntries(Object.entries(rightPositions).map(([node, pos]) => [node, pos.top]));
  const flowLeftX = plot.left + nodeWidth;
  const flowRightX = plot.right - nodeWidth;

  for (const role of originOrder) {
    for (const actor of actorOrder) {
      const count = counts[role][actor];
      if (count <= 0) continue;
      const flowHeight = count * flowScale;
      const leftTop = leftCursor[role];
      const leftBottom = leftTop + flowHeight;
      leftCursor[role] = leftBottom;
      const rightTop = rightCursor[actor];
      const rightBottom = rightTop + flowHeight;
      rightCursor[actor] = rightBottom;
      const path = svgEl("path", {
        d: sankeyPath(flowLeftX, flowRightX, leftTop, leftBottom, rightTop, rightBottom),
        fill: role === "Agentic" ? COLORS.agentic : COLORS.human,
        opacity: 0.42,
      });
      addTitle(
        path,
        `${role} origin → ${TERMINAL_ACTOR_LABELS[actor]}\nLines: ${fmt.format(count)}\nShare of ${role} origin lines: ${formatPercentExact(count / originTotals[role])}\nShare of all tracked flow lines: ${formatPercentExact(count / totalFlow)}`,
      );
      svg.appendChild(path);
    }
  }

  for (const role of originOrder) {
    const pos = leftPositions[role];
    if (!pos) continue;
    const node = svgEl("rect", {
      x: plot.left,
      y: pos.top,
      width: nodeWidth,
      height: Math.max(1, pos.bottom - pos.top),
      rx: 5,
      fill: role === "Agentic" ? COLORS.agentic : COLORS.human,
      stroke: "#ffffff",
      "stroke-width": 1,
    });
    addTitle(
      node,
      `${role} origin lines\nLines: ${fmt.format(originTotals[role])}\nShare of all tracked flow lines: ${formatPercentExact(originTotals[role] / totalFlow)}`,
    );
    svg.appendChild(node);
    addText(svg, role, plot.left - 12, (pos.top + pos.bottom) / 2 - 10, {
      "text-anchor": "end",
      class: "chartLabel",
      style: role === "Agentic" ? `fill: ${COLORS.agentic}` : `fill: ${COLORS.human}`,
    });
    addText(svg, compactLineCount(originTotals[role]), plot.left - 12, (pos.top + pos.bottom) / 2 + 11, {
      "text-anchor": "end",
      class: "chartLabel",
      style: cssVar("--chart-label") ? `fill: ${cssVar("--chart-label")}` : "",
    });
  }

  for (const actor of actorOrder) {
    const pos = rightPositions[actor];
    if (!pos) continue;
    const node = svgEl("rect", {
      x: plot.right - nodeWidth,
      y: pos.top,
      width: nodeWidth,
      height: Math.max(1, pos.bottom - pos.top),
      rx: 5,
      fill: TERMINAL_ACTOR_COLORS[actor],
      stroke: "#ffffff",
      "stroke-width": 1,
    });
    addTitle(
      node,
      `${TERMINAL_ACTOR_LABELS[actor]}\nLines: ${fmt.format(actorTotals[actor])}\nShare of all tracked flow lines: ${formatPercentExact(actorTotals[actor] / totalFlow)}`,
    );
    svg.appendChild(node);
    addText(svg, compactLineCount(actorTotals[actor]), plot.right + 12, (pos.top + pos.bottom) / 2 + 5, {
      class: "chartLabel",
      style: cssVar("--chart-label") ? `fill: ${cssVar("--chart-label")}` : "",
    });
  }

  const legendActors = actorOrder;
  const legendWidth = legendActors.reduce((sum, actor) => sum + 30 + TERMINAL_ACTOR_LABELS[actor].length * 9, 0);
  let cursor = Math.max(12, (width - legendWidth) / 2);
  const legendY = height - 25;
  for (const actor of legendActors) {
    svg.appendChild(svgEl("rect", {
      x: cursor,
      y: legendY - 10,
      width: 13,
      height: 13,
      rx: 3,
      fill: TERMINAL_ACTOR_COLORS[actor],
    }));
    addText(svg, TERMINAL_ACTOR_LABELS[actor], cursor + 20, legendY + 2, {
      class: "chartLabel",
    });
    cursor += 30 + TERMINAL_ACTOR_LABELS[actor].length * 9;
  }
}

function renderFindingChart(svgId, findingKey) {
  const svg = document.getElementById(svgId);
  const { width, height } = clearSvg(svg);
  const repos = focusedRepos();
  const repoField =
    findingKey === "static_findings"
      ? "static_finding_counts_by_role_status"
      : "supply_chain_finding_counts_by_role_status";
  const denominators = {
    Agentic: repos.reduce(
      (sum, repo) =>
        sum + Number(repo.finding_denominator_commits_by_role?.Agentic || 0),
      0,
    ),
    Human: repos.reduce(
      (sum, repo) =>
        sum + Number(repo.finding_denominator_commits_by_role?.Human || 0),
      0,
    ),
  };
  const counts = {
    Agentic: { introduced: 0, removed: 0 },
    Human: { introduced: 0, removed: 0 },
  };
  for (const repo of repos) {
    const byRole = repo[repoField] || {};
    for (const role of ["Agentic", "Human"]) {
      const roleCounts = byRole[role] || {};
      counts[role].introduced += Number(roleCounts.introduced || 0);
      counts[role].removed += Number(roleCounts.removed || 0);
    }
  }
  const rate = (role, status) =>
    denominators[role] ? (counts[role][status] / denominators[role]) * 100 : 0;
  const rows = [];
  for (const role of ["Agentic", "Human"]) {
    for (const status of ["introduced", "removed"]) {
      rows.push([
        `${role} ${status}`,
        rate(role, status),
        {
          role,
          status,
          findings: counts[role][status],
          commits: denominators[role],
        },
      ]);
    }
  }
  renderBarChart(svg, width, height, rows, "Finding group", "Findings / 100 commits");
}

function renderMaintenanceStackedChart(svg, width, height, counts, unitLabel) {
  const plot = { left: 108, right: width - 24, top: 88, bottom: height - 62 };
  const barHeight = 44;
  const rowGap = 18;
  const rowYs = {
    Agentic: plot.top,
    Human: plot.top + barHeight + rowGap,
  };
  const axisColor = cssVar("--axis") || "#d0d0d4";
  const labelColor = cssVar("--chart-label") || "#4c4d52";
  const totals = {
    Agentic: MAINTENANCE_CLASSES.reduce((sum, key) => sum + counts.Agentic[key], 0),
    Human: MAINTENANCE_CLASSES.reduce((sum, key) => sum + counts.Human[key], 0),
  };
  const showTotalLabels = false;

  if (!totals.Agentic && !totals.Human) {
    addText(svg, "No maintenance-class data for the current filter.", width / 2, height / 2, {
      "text-anchor": "middle",
      class: "chartLabel",
    });
    return;
  }

  renderMaintenanceLegend(svg, plot.left, 22);

  for (const role of ["Agentic", "Human"]) {
    const y = rowYs[role];
    addText(svg, role, plot.left - 18, y + barHeight / 2 + 5, {
      "text-anchor": "end",
      class: "chartLabel",
      style: role === "Agentic" ? `fill: ${COLORS.agentic}` : `fill: ${COLORS.human}`,
    });
    const background = svgEl("rect", {
      x: plot.left,
      y,
      width: plot.right - plot.left,
      height: barHeight,
      rx: 7,
      fill: cssVar("--subpanel") || "transparent",
      stroke: cssVar("--line") || "#ddd",
    });
    addTitle(background, `${role}\nTotal: ${fmt.format(totals[role])} ${unitLabel}`);
    svg.appendChild(background);

    let cursor = plot.left;
    for (const [index, key] of MAINTENANCE_CLASSES.entries()) {
      const value = counts[role][key];
      if (value <= 0 || totals[role] <= 0) continue;
      const segmentWidth = (value / totals[role]) * (plot.right - plot.left);
      const segment = svgEl("rect", {
        x: cursor,
        y,
        width: Math.max(0, segmentWidth),
        height: barHeight,
        fill: ROLE_MAINTENANCE_SHADES[role][index],
        opacity: 0.96,
      });
      addTitle(
        segment,
        `${role} ${MAINTENANCE_LABELS[key]}\n${fmt.format(value)} ${unitLabel}\nShare within ${role}: ${formatPercentExact(value / totals[role])}`,
      );
      svg.appendChild(segment);
      if (segmentWidth > 96) {
        addText(svg, `${MAINTENANCE_LABELS[key]} ${(value / totals[role] * 100).toFixed(0)}%`, cursor + segmentWidth / 2, y + barHeight / 2 + 5, {
          "text-anchor": "middle",
          class: "chartLabel",
          style: "fill: #171717",
        });
      }
      cursor += segmentWidth;
    }
    if (showTotalLabels) {
      addText(svg, `${fmt.format(totals[role])} ${unitLabel}`, plot.right, y + barHeight + 22, {
        "text-anchor": "end",
        class: "chartLabel",
        style: `fill: ${labelColor}`,
      });
    }
  }

  svg.appendChild(svgEl("line", { x1: plot.left, y1: plot.bottom, x2: plot.right, y2: plot.bottom, stroke: axisColor }));
  for (const tick of [0, 0.25, 0.5, 0.75, 1]) {
    const x = plot.left + tick * (plot.right - plot.left);
    svg.appendChild(svgEl("line", { x1: x, y1: plot.bottom, x2: x, y2: plot.bottom + 6, stroke: axisColor }));
    addText(svg, `${Math.round(tick * 100)}%`, x, plot.bottom + 25, {
      "text-anchor": "middle",
      class: "chartLabel",
    });
  }
}

function renderMaintenanceLegend(svg, x, y) {
  let cursor = x;
  for (const [index, key] of MAINTENANCE_CLASSES.entries()) {
    const itemWidth = key === "management" ? 140 : 124;
    const agenticPatch = svgEl("rect", {
      x: cursor,
      y,
      width: 18,
      height: 8,
      fill: ROLE_MAINTENANCE_SHADES.Agentic[index],
    });
    addTitle(agenticPatch, `Agentic ${MAINTENANCE_LABELS[key]}`);
    svg.appendChild(agenticPatch);
    const humanPatch = svgEl("rect", {
      x: cursor,
      y: y + 8,
      width: 18,
      height: 8,
      fill: ROLE_MAINTENANCE_SHADES.Human[index],
    });
    addTitle(humanPatch, `Human ${MAINTENANCE_LABELS[key]}`);
    svg.appendChild(humanPatch);
    addText(svg, MAINTENANCE_LABELS[key], cursor + 24, y + 13, { class: "chartLabel" });
    cursor += itemWidth;
  }
}

function renderBarChart(svg, width, height, entries, xLabel, yLabel) {
  const plot = { left: 82, right: width - 18, top: 24, bottom: height - 72 };
  addAxes(svg, plot, xLabel, yLabel);
  if (!entries.length) return;
  const maxValue = niceAxisMax(Math.max(...entries.map((entry) => entry[1]), 1));
  const barGap = 8;
  const barWidth = (plot.right - plot.left - barGap * (entries.length - 1)) / entries.length;
  const y = scale(0, maxValue, plot.bottom, plot.top);
  const axisColor = cssVar("--axis") || "#d0d0d4";
  for (const tick of [0, maxValue / 2, maxValue]) {
    const tickY = y(tick);
    svg.appendChild(svgEl("line", {
      x1: plot.left - 5,
      y1: tickY,
      x2: plot.left,
      y2: tickY,
      stroke: axisColor,
    }));
    addText(svg, formatAxisValue(tick), plot.left - 11, tickY + 5, {
      "text-anchor": "end",
      class: "chartLabel",
    });
  }
  entries.forEach(([label, value, metadata], index) => {
    const x = plot.left + index * (barWidth + barGap);
    const top = y(value);
    const bar = svgEl("rect", {
      x,
      y: top,
      width: Math.max(1, barWidth),
      height: plot.bottom - top,
      fill: roleColorForLabel(label) || (index % 2 === 0 ? COLORS.agentic : COLORS.human),
      opacity: 0.86,
    });
    const hoverText = metadata
      ? `${label}\nRate: ${formatRateExact(value)}\nFindings: ${fmt.format(metadata.findings)}\nCommits considered: ${fmt.format(metadata.commits)}`
      : `${label}\nValue: ${formatAxisValue(value)}`;
    addTitle(bar, hoverText);
    svg.appendChild(bar);
    addText(svg, shortLabel(label), x + barWidth / 2, plot.bottom + 22, { "text-anchor": "middle", class: "chartLabel" });
  });
}

function roleColorForLabel(label) {
  const normalized = String(label).toLowerCase();
  if (normalized.includes("agentic") || normalized.includes("ag.")) return COLORS.agentic;
  if (normalized.includes("human") || normalized.includes("hu.")) return COLORS.human;
  return null;
}

function shortLabel(label) {
  return String(label)
    .replaceAll("_", " ")
    .replace("introduced", "intro.")
    .replace("removed", "rem.")
    .replace("Agentic", "Ag.")
    .replace("Human", "Hu.");
}

function renderTable() {
  const repos = focusedRepos()
    .slice()
    .sort((a, b) => b.agentic_commits - a.agentic_commits)
    .slice(0, 250);
  document.getElementById("tableCaption").textContent = `${fmt.format(repos.length)} repositories shown.`;
  document.getElementById("repoTableBody").innerHTML = repos
    .map((repo) => `
      <tr>
        <td><a href="${repo.repo_url}" target="_blank" rel="noreferrer">${repo.repo}</a></td>
        <td>${repo.primary_language || "Unknown"}</td>
        <td>${fmt.format(repo.stars)}</td>
        <td>${fmt.format(repo.agentic_commits)}</td>
        <td>${pct(repo.agentic_commit_share)}</td>
        <td>${pct(repo.latest_agentic_living_line_share)}</td>
        <td>${pct(repo.survival_rate)}</td>
      </tr>
    `)
    .join("");
}

function renderAll() {
  if (state.selectedRepo && !filteredRepos().some((repo) => repo.repo_key === state.selectedRepo)) {
    state.selectedRepo = "";
  }
  updateRepoSelect();
  renderCards();
  renderTimeline();
  renderMaintenance();
  renderOriginTerminalSankey();
  renderTerminalMaintenance();
  renderFindingChart("staticChart", "static_findings");
  renderFindingChart("supplyChart", "supply_chain_findings");
  renderTable();
}

function replayLandingReveal() {
  const hero = document.querySelector(".paperHero");
  if (!hero) return;
  hero.classList.remove("landingReveal");
  void hero.offsetWidth;
  hero.classList.add("landingReveal");
}

function replayVisualizationReveal() {
  const layout = document.querySelector("#visualizationPage .layout");
  if (!layout) return;
  layout.classList.remove("vizReveal");
  void layout.offsetWidth;
  layout.classList.add("vizReveal");
}

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".navTab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  const visualizationTab = document.querySelector('.navTab[data-tab="visualization"]');
  if (visualizationTab) {
    visualizationTab.classList.remove("navNudge");
    if (tab === "findings") {
      window.requestAnimationFrame(() => visualizationTab.classList.add("navNudge"));
    }
  }
  document.getElementById("findingsPage").classList.toggle("hidden", tab !== "findings");
  document.getElementById("visualizationPage").classList.toggle("hidden", tab !== "visualization");
  if (tab === "findings") {
    replayLandingReveal();
  }
  if (tab === "visualization" && state.repos.length) {
    requestAnimationFrame(() => {
      renderAll();
      replayVisualizationReveal();
    });
  }
}

function bindTabNavigation() {
  document.querySelectorAll(".navTab").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
    button.addEventListener("animationend", () => button.classList.remove("navNudge"));
  });
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function bindCitationCopy() {
  const button = document.getElementById("citationCopyButton");
  const citation = document.getElementById("citationText");
  if (!button || !citation) return;
  button.addEventListener("click", async () => {
    const original = "Copy";
    try {
      await copyTextToClipboard(citation.textContent.trim());
      button.textContent = "Copied";
      button.classList.add("copied");
    } catch (error) {
      console.error(error);
      button.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove("copied");
    }, 1800);
  });
}

function bindControls() {
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderAll();
  });
  document.getElementById("languageSelect").addEventListener("change", (event) => {
    state.language = event.target.value;
    renderAll();
  });
  document.getElementById("repoSelect").addEventListener("change", (event) => {
    state.selectedRepo = event.target.value;
    renderAll();
  });
  document.getElementById("minAgenticInput").addEventListener("input", (event) => {
    state.minAgentic = Number(event.target.value || 0);
    renderAll();
  });
  document.getElementById("resetButton").addEventListener("click", () => {
    state.search = "";
    state.language = "";
    state.selectedRepo = "";
    state.minAgentic = 0;
    document.getElementById("searchInput").value = "";
    document.getElementById("minAgenticInput").value = "0";
    updateControls();
    renderAll();
  });
  window.addEventListener("resize", () => renderAll());
}

async function loadData() {
  const [repos, weekly, distributions, overview, manifest] = await Promise.all([
    fetch(`${DATA_DIR}/repos.json`).then((response) => response.json()),
    fetch(`${DATA_DIR}/weekly_panel.json`).then((response) => response.json()),
    fetch(`${DATA_DIR}/distributions.json`).then((response) => response.json()),
    fetch(`${DATA_DIR}/overview.json`).then((response) => response.json()),
    fetch(`${DATA_DIR}/manifest.json`).then((response) => response.json()),
  ]);
  state.repos = repos;
  state.weekly = weekly;
  state.distributions = distributions;
  state.overview = overview;
  document.getElementById("loadStatus").textContent = "";
  updateControls();
  bindControls();
  renderAll();
  setActiveTab(state.activeTab);
  console.info("Data manifest", manifest);
}

initTheme();
bindTabNavigation();
bindThemeToggle();
bindCitationCopy();
loadData().catch((error) => {
  console.error(error);
  document.getElementById("loadStatus").textContent = "Failed to load data.";
});
