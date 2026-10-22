/* GlowGuide: local, educational association-mining demo. All data is synthetic. */
const state = {
    routines: [],
    products: new Map(),
    analysis: [],
    contextPairs: [],
    filters: { context: "all", skin: "all", algorithm: "both" },
};

const $ = (id) => document.getElementById(id),
    fmt = (n) => Number(n || 0).toLocaleString("en-US"),
    pct = (n) => `${(n * 100).toFixed(1)}%`;

function parseCSV(text) {
    const rows = [];
    let row = [],
        field = "",
        quoted = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];

        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (c === '"') quoted = false;
            else field += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n") {
            row.push(field.replace(/\r$/, ""));
            if (row.some((v) => v !== "")) rows.push(row);
            row = [];
            field = "";
        } else field += c;
    }

    if (field || row.length) {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
    }

    const headers = rows.shift() || [];

    return rows.map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))
    );
}

async function loadData() {
    try {
        const [r, p] = await Promise.all([
            fetch("data/routines.csv"),
            fetch("data/products.csv"),
        ]);

        if (!r.ok || !p.ok) throw Error("Could not read bundled CSVs");

        const [rt, pt] = await Promise.all([r.text(), p.text()]);

        state.routines = parseCSV(rt);
        parseCSV(pt).forEach((x) => state.products.set(x.product_id, x));

        state.routines.forEach(
            (x) => (x.items = x.products_used.split("|").filter(Boolean))
        );

        initialize();

        $("load-status").textContent = "Dataset ready";
        document.querySelector(".live-status>span:first-child").style.background =
            "#77a887";
    } catch (e) {
        $("load-status").textContent = "Could not load data";
        $("rules-list").innerHTML =
            `<div class="empty-state"><b>Dataset could not be opened</b><span>Run the included start file or follow README instructions.</span></div>`;
        console.error(e);
    }
}

function initialize() {
    const people = new Set(state.routines.map((x) => x.respondent_id));
    const cats = new Set(
        [...state.products.values()].map((x) => x.product_category)
    );

    $("metric-routines").textContent = fmt(state.routines.length);
    $("metric-people").textContent = fmt(people.size);
    $("metric-products").textContent = fmt(state.products.size);
    $("metric-categories").textContent = cats.size;
    $("category-total").textContent = `${state.products.size} products`;

    $("data-provenance").textContent =
        `${fmt(state.routines.length)} synthetic routine transactions · Generated examples only`;

    const types = [...new Set(state.routines.map((x) => x.skin_type))].sort();

    types.forEach((s) => {
        const o = document.createElement("option");
        o.value = s;
        o.textContent = s;
        $("skin-filter").append(o);
    });

    renderDistribution();
    runAnalysis();
}

function filteredRoutines(contextOverride = null) {
    const context = contextOverride ?? state.filters.context;

    return state.routines.filter(
        (r) =>
            (context === "all" || r.routine_context === context) &&
            (state.filters.skin === "all" || r.skin_type === state.filters.skin)
    );
}

function supportKey(items) {
    return items.join("~");
}

function apriori(transactions, minCount, maxSize = 4) {
    const counts = new Map();
    const one = new Map();

    transactions.forEach((t) =>
        t.forEach((x) => one.set(x, (one.get(x) || 0) + 1))
    );

    let level = [...one]
        .filter(([, c]) => c >= minCount)
        .map(([x, c]) => ({ items: [x], count: c }))
        .sort((a, b) => a.items[0].localeCompare(b.items[0]));

    level.forEach((x) => counts.set(supportKey(x.items), x.count));

    let k = 2;

    while (level.length && k <= maxSize) {
        const prev = new Set(level.map((x) => supportKey(x.items))),
            candidates = new Map();

        for (let i = 0; i < level.length; i++)
            for (let j = i + 1; j < level.length; j++) {
                const a = level[i].items,
                    b = level[j].items;

                if (a.slice(0, -1).join("~") !== b.slice(0, -1).join("~"))
                    continue;

                const cand = [...a, b[b.length - 1]];

                if (cand.length !== k) continue;

                let valid = true;

                for (let drop = 0; drop < cand.length; drop++) {
                    const sub = cand.filter((_, ix) => ix !== drop);

                    if (!prev.has(supportKey(sub))) {
                        valid = false;
                        break;
                    }
                }

                if (valid) candidates.set(supportKey(cand), cand);
            }

        if (!candidates.size) break;

        const countsNow = new Map(
            [...candidates.keys()].map((key) => [key, 0])
        );

        for (const basket of transactions) {
            if (basket.length < k) continue;

            for (const [key, cand] of candidates) {
                if (cand.every((x) => basket.includes(x)))
                    countsNow.set(key, countsNow.get(key) + 1);
            }
        }

        level = [...countsNow]
            .filter(([, c]) => c >= minCount)
            .map(([key, count]) => ({ items: candidates.get(key), count }));

        level.forEach((x) => counts.set(supportKey(x.items), x.count));

        k++;
    }

    return counts;
}

function makeFPTree(weightedTransactions, minCount) {
    const frequency = new Map();

    weightedTransactions.forEach(({ items, weight }) =>
        items.forEach((x) => frequency.set(x, (frequency.get(x) || 0) + weight))
    );

    const keep = new Set(
        [...frequency]
            .filter(([, c]) => c >= minCount)
            .map(([x]) => x)
    );

    const order = new Map(
        [...frequency]
            .filter(([x]) => keep.has(x))
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([x], i) => [x, i])
    );

    const root = { item: null, count: 0, parent: null, children: new Map() };
    const headers = new Map();

    for (const { items, weight } of weightedTransactions) {
        const sorted = items
            .filter((x) => keep.has(x))
            .sort((a, b) => order.get(a) - order.get(b));

        let node = root;

        for (const item of sorted) {
            if (!node.children.has(item)) {
                const child = {
                    item,
                    count: 0,
                    parent: node,
                    children: new Map(),
                    next: null,
                };

                node.children.set(item, child);

                if (!headers.has(item))
                    headers.set(item, { count: 0, head: null, tail: null });

                const h = headers.get(item);

                if (h.tail) h.tail.next = child;
                else h.head = child;

                h.tail = child;
            }

            node = node.children.get(item);
            node.count += weight;
            headers.get(item).count += weight;
        }
    }

    return { root, headers };
}

function fpGrowth(transactions, minCount, maxSize = 4) {
    const tree = makeFPTree(
        transactions.map((items) => ({ items, weight: 1 })),
        minCount
    ),
        out = new Map();

    function grow(current, headers) {
        const items = [...headers].sort(
            (a, b) => a[1].count - b[1].count || a[0].localeCompare(b[0])
        );

        for (const [item, entry] of items) {
            const next = [...current, item].sort();

            if (next.length > maxSize) continue;

            out.set(supportKey(next), entry.count);

            const paths = [];

            for (let node = entry.head; node; node = node.next) {
                const path = [];
                let p = node.parent;

                while (p && p.item !== null) {
                    path.push(p.item);
                    p = p.parent;
                }

                if (path.length)
                    paths.push({ items: path, weight: node.count });
            }

            if (paths.length) {
                const cond = makeFPTree(paths, minCount);
                if (cond.headers.size) grow(next, cond.headers);
            }
        }
    }

    grow([], tree.headers);

    return out;
}

function makeRules(frequent, n, minConfidence) {
    const rules = [];
    const lookup = frequent;

    for (const [key, count] of frequent) {
        const items = key.split("~");

        if (items.length < 2) continue;

        for (let i = 0; i < items.length; i++) {
            const ant = items.filter((_, j) => i !== j);

            if (!ant.length) continue;

            const antCount = lookup.get(supportKey(ant));

            if (!antCount) continue;

            const confidence = count / antCount;
            if (confidence < minConfidence) continue;

            const consequent = items[i],
                support = count / n,
                base = (frequent.get(consequent) || 0) / n,
                lift = base ? confidence / base : 0;

            const reliability = Math.min(
                1,
                count /
                Math.max(
                    1,
                    2 * Math.ceil((n * Number($("support-range").value)) / 100)
                )
            );

            const score = Math.max(
                0,
                Math.min(
                    100,
                    100 *
                    confidence *
                    (0.65 + (0.35 * Math.min(lift, 3)) / 3) *
                    reliability
                )
            );

            rules.push({
                antecedent: ant,
                consequent,
                support,
                confidence,
                lift,
                count,
                score,
                key: `${ant.join("+")}=>${consequent}`,
            });
        }
    }

    return rules;
}

/*
 * Mine rules with the selected algorithm and attach its identity to each rule.
 * This prevents undefined or hardcoded algorithm labels in the UI.
 */
function mine(transactions, method, support, confidence) {
    if (!transactions.length) return [];

    const minCount = Math.max(
        5,
        Math.ceil((transactions.length * support) / 100)
    );

    const baskets = transactions.map((r) => [...new Set(r.items)].sort());

    const freq =
        method === "apriori"
            ? apriori(baskets, minCount)
            : fpGrowth(baskets, minCount);

    return makeRules(freq, baskets.length, confidence / 100).map((rule) => ({
        ...rule,
        method: method === "apriori" ? "Apriori" : "FP-Growth",
    }));
}

function analyze() {
    const transactions = filteredRoutines();

    if (!transactions.length)
        return { ap: [], fp: [], rows: transactions, merged: [] };

    const support = Number($("support-range").value),
        confidence = Number($("confidence-range").value);

    let ap = [],
        fp = [];

    if (state.filters.algorithm !== "fp")
        ap = mine(transactions, "apriori", support, confidence);

    if (state.filters.algorithm !== "apriori")
        fp = mine(transactions, "fp", support, confidence);

    const merged = new Map();

    for (const rule of [...ap, ...fp]) {
        const existing = merged.get(rule.key);

        if (!existing) {
            merged.set(rule.key, {
                ...rule,
                methods: new Set([rule.method]),
            });
            continue;
        }

        // Record every algorithm that found this rule.
        existing.methods.add(rule.method);

        // Keep the higher-scoring metrics while retaining both methods.
        if (rule.score > existing.score) {
            merged.set(rule.key, {
                ...rule,
                methods: existing.methods,
            });
        }
    }

    const mergedRules = [...merged.values()].map((rule) => ({
        ...rule,
        method:
            rule.methods.size > 1
                ? "Both"
                : [...rule.methods][0],
    }));

    return {
        ap,
        fp,
        rows: transactions,
        merged: mergedRules,
    };
}

function analyzeContextPair() {
    const ctxs = ["morning", "evening"],
        pairs = { morning: new Map(), evening: new Map() },
        sizes = {};

    for (const c of ctxs) {
        const rows = filteredRoutines(c);
        sizes[c] = rows.length;

        for (const r of rows) {
            const items = [...new Set(r.items)].sort();

            for (let i = 0; i < items.length; i++)
                for (let j = i + 1; j < items.length; j++) {
                    const k = `${items[i]}~${items[j]}`;
                    pairs[c].set(k, (pairs[c].get(k) || 0) + 1);
                }
        }
    }

    const keys = new Set([
        ...pairs.morning.keys(),
        ...pairs.evening.keys(),
    ]);

    let best = null;

    for (const key of keys) {
        const a =
            (pairs.morning.get(key) || 0) / Math.max(1, sizes.morning),
            b =
                (pairs.evening.get(key) || 0) / Math.max(1, sizes.evening);

        const strength = a + b;

        if (!best || strength > best.strength)
            best = {
                key,
                a,
                b,
                strength,
                amCount: pairs.morning.get(key) || 0,
                pmCount: pairs.evening.get(key) || 0,
            };
    }

    return { best, sizes };
}

function productName(id) {
    return state.products.get(id)?.product_name || id;
}

function renderRules() {
    const data = state.analysis;
    let rules = data.merged || [];
    const sort = $("sort-filter").value;

    rules.sort((a, b) =>
        sort === "support"
            ? b.support - a.support
            : sort === "confidence"
                ? b.confidence - a.confidence
                : sort === "lift"
                    ? b.lift - a.lift
                    : b.score - a.score
    );

    $("nav-pattern-count").textContent = rules.length;
    $("result-summary").textContent =
        `${rules.length} rules · ${fmt(data.rows?.length || 0)} transactions`;

    if (!rules.length) {
        $("rules-list").innerHTML =
            '<div class="empty-state"><b>No patterns at these settings yet</b><span>Try lowering minimum support or confidence.</span></div>';
        return;
    }

    const top = rules.slice(0, 6);

    $("rules-list").innerHTML = top
        .map((r) => {
            const ctx = contextTilt(r.key);

            return `<article class="rule-card"><div><div class="rule-title"><span class="rule-items">${r.antecedent.map((x) => `<span class="product-tag">${escapeHTML(productName(x))}</span>`).join(' <span class="arrow">+</span> ')} <span class="arrow">→</span> <span class="product-tag">${escapeHTML(productName(r.consequent))}</span></span></div><div class="rule-meta"><span>Support <b>${pct(r.support)}</b></span><span>Confidence <b>${pct(r.confidence)}</b></span><span>Lift <b>${r.lift.toFixed(2)}×</b></span><span>${escapeHTML(r.method)}</span></div></div><div class="rule-right"><span class="rule-context ${ctx.css}">${ctx.label}</span><div><div class="fit-badge">${Math.round(r.score)}</div><div class="fit-label">GLOW SCORE</div></div></div></article>`;
        })
        .join("");
}

function contextTilt(ruleKey) {
    const [ante, con] = ruleKey.split("=>");
    const ids = ante.split("+").concat(con).sort();

    let am = 0,
        pm = 0,
        amN = 0,
        pmN = 0;

    for (const r of state.routines) {
        if (state.filters.skin !== "all" && r.skin_type !== state.filters.skin)
            continue;

        if (ids.every((x) => r.items.includes(x))) {
            if (r.routine_context === "morning") am++;
            else pm++;
        }

        if (r.routine_context === "morning") amN++;
        else pmN++;
    }

    const a = am / Math.max(amN, 1),
        b = pm / Math.max(pmN, 1),
        delta = a - b;

    if (Math.abs(delta) < 0.002)
        return { label: "Balanced", css: "balanced" };

    return delta > 0
        ? { label: "Morning-led", css: "" }
        : { label: "Evening-led", css: "evening" };
}

function renderContext() {
    const { best, sizes } = analyzeContextPair();

    if (!best) {
        $("context-chart").innerHTML =
            '<div class="chart-loading">No routines for this filter</div>';
        return;
    }

    const [one, two] = best.key.split("~"),
        am = best.a * 100,
        pm = best.b * 100,
        max = Math.max(am, pm, 1),
        scale = 70 / max;

    const bar = (x, y, val, cls) =>
        `<rect class="${cls}" x="${x}" y="${y}" width="${Math.max(2, val * scale)}" height="9" rx="4"/><text class="chart-value" x="${x + Math.max(2, val * scale) + 4}" y="${y + 8}">${val.toFixed(1)}%</text>`;

    $("context-chart").innerHTML =
        `<svg class="chart-svg" viewBox="0 0 250 112" role="img" aria-label="Routine pair prevalence comparison"><line class="chart-grid" x1="92" y1="5" x2="92" y2="104"/><text class="chart-label" x="0" y="28">${escapeHTML(shortName(productName(one)))}</text><text class="chart-label" x="0" y="73">${escapeHTML(shortName(productName(two)))}</text>${bar(93, 15, am, "chart-bar-am")}${bar(93, 60, pm, "chart-bar-pm")}<text class="chart-label" x="0" y="100">PAIR IN ${fmt(sizes.morning)} AM / ${fmt(sizes.evening)} PM BASKETS</text></svg>`;

    const stronger = am > pm ? "morning" : "evening";

    $("shift-title").textContent =
        `${Math.abs(am - pm).toFixed(1)} point ${stronger} tilt`;

    $("shift-copy").textContent =
        `${shortName(productName(one))} + ${shortName(productName(two))} appears together in ${am.toFixed(1)}% of morning and ${pm.toFixed(1)}% of evening routines.`;
}

function shortName(s) {
    return s.length > 23 ? s.slice(0, 21) + "…" : s;
}

function renderDistribution() {
    const cats = new Map(),
        skins = new Map();

    state.products.forEach((p) =>
        cats.set(p.product_category, (cats.get(p.product_category) || 0) + 1)
    );

    const max = Math.max(...cats.values());

    $("category-bars").innerHTML = [...cats]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(
            ([k, v]) =>
                `<div class="category-row"><span>${escapeHTML(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div><span class="category-value">${v}</span></div>`
        )
        .join("");

    state.routines.forEach((r) =>
        skins.set(r.skin_type, (skins.get(r.skin_type) || 0) + 1)
    );

    const n = Math.max(...skins.values());

    $("skin-mix").innerHTML = [...skins]
        .sort((a, b) => b[1] - a[1])
        .map(
            ([k, v]) =>
                `<div class="skin-row"><span>${escapeHTML(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / n) * 100}%"></div></div><span class="category-value">${Math.round((v / state.routines.length) * 100)}%</span></div>`
        )
        .join("");
}

function runAnalysis() {
    const btn = $("run-button");

    btn.disabled = true;
    btn.innerHTML =
        '<span class="loader" style="width:12px;height:12px;border-width:1.5px;margin:0"></span> Mining…';

    $("rules-list").innerHTML =
        '<div class="empty-state"><div class="loader"></div><b>Finding meaningful combinations</b><span>Apriori and FP-Growth are scanning the selected routines.</span></div>';

    setTimeout(() => {
        const started = performance.now();

        state.analysis = analyze();

        renderRules();
        renderContext();

        const elapsed = ((performance.now() - started) / 1000).toFixed(1);

        $("engine-note").textContent =
            `Glow score blends confidence, lift and support reliability · ${elapsed}s`;

        btn.disabled = false;
        btn.innerHTML = '<span class="run-glyph">↗</span> Run analysis';
    }, 30);
}

function escapeHTML(s) {
    return String(s).replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c]
    );
}

function exportRules() {
    const rules = state.analysis.merged || [];

    if (!rules.length) return;

    const rows = [
        [
            "antecedent",
            "consequent",
            "support",
            "confidence",
            "lift",
            "glow_score",
            "algorithm",
            "routine_context_comparison",
        ],
        ...rules.map((r) => [
            r.antecedent.map(productName).join(" + "),
            productName(r.consequent),
            r.support.toFixed(5),
            r.confidence.toFixed(5),
            r.lift.toFixed(4),
            r.score.toFixed(2),
            r.method,
            contextTilt(r.key).label,
        ]),
    ];

    const csv = rows
        .map((r) =>
            r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")
        )
        .join("\r\n");

    const a = document.createElement("a");

    a.href = URL.createObjectURL(
        new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
    );

    a.download = "glowguide_association_rules.csv";
    a.click();

    URL.revokeObjectURL(a.href);
}

function showModal() {
    $("modal").hidden = false;
}

function hideModal() {
    $("modal").hidden = true;
}

document.addEventListener("DOMContentLoaded", () => {
    loadData();

    $("context-filter").addEventListener("change", (e) => {
        state.filters.context = e.target.value;
        runAnalysis();
    });

    $("skin-filter").addEventListener("change", (e) => {
        state.filters.skin = e.target.value;
        runAnalysis();
    });

    $("algorithm-filter").addEventListener("change", (e) => {
        state.filters.algorithm = e.target.value;
        runAnalysis();
    });

    $("run-button").addEventListener("click", runAnalysis);

    $("support-range").addEventListener(
        "input",
        (e) =>
        ($("support-label").textContent =
            `${Number(e.target.value).toFixed(1)}%`)
    );

    $("confidence-range").addEventListener(
        "input",
        (e) => ($("confidence-label").textContent = `${e.target.value}%`)
    );

    $("support-range").addEventListener("change", runAnalysis);
    $("confidence-range").addEventListener("change", runAnalysis);
    $("sort-filter").addEventListener("change", renderRules);
    $("export-button").addEventListener("click", exportRules);
    $("help-button").addEventListener("click", showModal);

    $("method-link").addEventListener("click", (e) => {
        e.preventDefault();
        showModal();
    });

    $("footer-method").addEventListener("click", (e) => {
        e.preventDefault();
        showModal();
    });

    $("modal-close").addEventListener("click", hideModal);
    $("modal-done").addEventListener("click", hideModal);

    $("modal").addEventListener("click", (e) => {
        if (e.target === $("modal")) hideModal();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideModal();
    });
});