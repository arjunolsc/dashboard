// /recruitment-dashboard - Recruitment & Onboarding control centre.
// Data: ess_dashboard.api.recruitment_dashboard (live HRMS records, HR Manager /
// System Manager only). Every count links to the record, a filtered desk list
// (/app/<doctype>?field=value) or a filtered tab here; rows open a quick-view
// drawer with links to the full record. Styles: public/css/recruitment.css.
(function () {
	"use strict";

	const API = "ess_dashboard.api.recruitment_dashboard.";
	const app = document.getElementById("rd-app");

	// ── helpers ──────────────────────────────────────────────────────────────
	const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
	const slug = (dt) => dt.toLowerCase().replace(/ /g, "-");
	const deskUrl = (dt, name) => `/app/${slug(dt)}/${encodeURIComponent(name)}`;
	const newUrl = (dt, values) => `/app/${slug(dt)}/new` + qs(values);
	function qs(obj) {
		const parts = Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null && v !== "")
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === "object" ? JSON.stringify(v) : v)}`);
		return parts.length ? "?" + parts.join("&") : "";
	}
	const listUrl = (dt, filters) => `/app/${slug(dt)}` + qs(filters);
	const fmt = (iso, opts) => {
		if (!iso) return "—";
		const d = new Date(String(iso).length <= 10 ? iso + "T00:00:00" : String(iso).replace(" ", "T"));
		return isNaN(d) ? iso : d.toLocaleDateString("en-IN", opts || { day: "2-digit", month: "short", year: "numeric" });
	};
	const n = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN"));
	const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const initials = (s) => (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
	const store = {
		get(k, d) { try { const v = localStorage.getItem("rd-" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
		set(k, v) { try { localStorage.setItem("rd-" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
	};

	const inflight = {};
	function api(method, args, key) {
		// one request per key: a newer call aborts the older one, so stale results never land
		key = key || method;
		if (inflight[key]) inflight[key].abort();
		const ctl = (inflight[key] = new AbortController());
		return fetch(`/api/method/${API}${method}` + qs(args), {
			credentials: "same-origin", signal: ctl.signal,
			headers: { "X-Frappe-CSRF-Token": window.csrf_token || "", Accept: "application/json" },
		}).then((r) => r.json().then((body) => {
			if (!r.ok) {
				let msg = body._server_messages ? JSON.parse(JSON.parse(body._server_messages)[0]).message : body.exc_type;
				throw new Error(msg || `Request failed (${r.status})`);
			}
			return body.message;
		}));
	}
	const aborted = (e) => e && e.name === "AbortError";

	const I = {
		logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.9-3.3 3.3-5 6-5s5.1 1.7 6 5"/><path d="M16 11l2 2 4-4"/></svg>',
		search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
		refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
		theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/></svg>',
		home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
		plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
		x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
		dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
		ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
		overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
		openings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
		applicants: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.9-3.3 3.3-5 6-5s5.1 1.7 6 5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16.5 15c2.3.3 3.8 1.9 4.5 4.6"/></svg>',
		interviews: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
		offers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="m9 14 2 2 4-4"/></svg>',
		onboarding: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/></svg>',
		analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
	};

	const TABS = [
		["overview", "Overview"], ["openings", "Job Openings"], ["applicants", "Applicants"], ["interviews", "Interviews"],
		["offers", "Offers"], ["onboarding", "Onboarding"], ["analytics", "Analytics"],
	];

	// status -> badge tone
	const TONE = {
		Open: "brand", Closed: "", "In Review": "info", Interviewing: "brand", Selected: "good", "Offer Released": "warn",
		"Offer Accepted": "good", Joined: "good", Rejected: "bad", "On Hold": "warn", Pending: "warn", "Under Review": "info",
		Cleared: "good", Draft: "", "Awaiting Response": "warn", Accepted: "good", Completed: "good", "In Process": "info",
		"Link not sent": "bad", "Link expired": "bad", "Awaiting candidate": "warn", "Documents pending": "warn", "Ready for HR": "good",
		Flagged: "bad", "In Progress": "info", Replied: "info", Hold: "warn",
		"QR Code": "brand", Link: "info", Website: "", "Added by HR": "",
	};
	const badge = (s, label) => (s ? `<span class="rd-badge ${TONE[s] ? "is-" + TONE[s] : ""}">${esc(label || s)}</span>` : "");

	// ── state ────────────────────────────────────────────────────────────────
	const PRESETS = [["today", "Today"], ["7d", "Last 7 days"], ["30d", "Last 30 days"], ["month", "This month"],
		["lastmonth", "Last month"], ["quarter", "This quarter"], ["year", "Last 12 months"], ["custom", "Custom range"]];
	function presetRange(p) {
		const t = new Date(); t.setHours(0, 0, 0, 0);
		const d = (x) => new Date(x);
		switch (p) {
			case "today": return [ymd(t), ymd(t)];
			case "7d": return [ymd(d(t.getTime() - 6 * 864e5)), ymd(t)];
			case "month": return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(t)];
			case "lastmonth": return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
			case "quarter": return [ymd(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1)), ymd(t)];
			case "year": return [ymd(new Date(t.getFullYear() - 1, t.getMonth(), t.getDate() + 1)), ymd(t)];
			default: return [ymd(d(t.getTime() - 29 * 864e5)), ymd(t)];
		}
	}
	const saved = store.get("filters", {});
	const state = {
		preset: saved.preset || "30d", from: saved.from, to: saved.to, company: saved.company || "", department: saved.department || "",
		tab: (location.hash.slice(1).split("?")[0]) || store.get("tab", "overview"),
		options: { companies: [], departments: [], user: "" },
		overview: null, updatedAt: null,
		openings: { search: "", status: "Open", sort: "default", pastClose: 0, rows: null },
		applicants: { search: "", stage: "", opening: "", aging: 0, page: 1, pageSize: 20, sort: "newest", allTime: 0, channel: "" },
		interviews: { segment: "feedback" }, offers: { segment: "awaiting" }, onboarding: { segment: "active" },
	};
	if (state.preset !== "custom" || !state.from) [state.from, state.to] = presetRange(state.preset);
	if (!TABS.some(([k]) => k === state.tab)) state.tab = "overview";
	const filterArgs = () => ({ filters: { from_date: state.from, to_date: state.to, company: state.company, department: state.department } });
	const charts = {};
	function chart(id, cfg) {
		if (charts[id]) charts[id].destroy();
		const el = document.getElementById(id);
		if (!el || !window.Chart) return;
		const dark = document.documentElement.dataset.theme === "dark";
		Chart.defaults.color = dark ? "#b2bad0" : "#46506a";
		Chart.defaults.borderColor = dark ? "#253050" : "#eef1f6";
		Chart.defaults.font.family = "Inter, system-ui, sans-serif";
		charts[id] = new Chart(el, cfg);
	}
	const BRAND = () => getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#3b5bdb";
	const PALETTE = ["#3b5bdb", "#2f9e44", "#e8890c", "#7048e8", "#1098ad", "#d6383a", "#5c7cfa", "#94a3b8", "#c2255c", "#66a80f"];

	// ── shell ────────────────────────────────────────────────────────────────
	function renderShell() {
		app.innerHTML = `
			<header class="rd-top">
				<div class="rd-brand">
					<a class="rd-logo" href="/app/atlas-home" title="Back to Atlas Home" aria-label="Back to Atlas Home">
						<img src="/assets/olscpl_hrms/images/om_logo.svg" alt="OM One"></a>
					<div class="rd-title">Recruitment &amp; Onboarding</div>
					<div class="rd-sub">Manage hiring pipelines, evaluate applicants, track offers and onboard new joiners from one workspace</div>
				</div>
				<div class="rd-search" role="search">
					${I.search}
					<input id="rd-q" type="search" placeholder="Search applicants, openings, employees…" autocomplete="off" aria-label="Search">
					<div id="rd-results" class="rd-results" hidden></div>
				</div>
				<div class="rd-top-right">
					<span class="rd-updated" title="When this view was last loaded"><i></i><span id="rd-upd">Loading…</span></span>
					<button class="rd-btn is-outline" id="rd-refresh">${I.refresh}<span>Refresh</span></button>
					<button class="rd-btn" id="rd-theme" aria-label="Switch theme">${I.theme}<span>Theme</span></button>
					<a class="rd-btn" href="/app/atlas-home">${I.home}<span>Atlas Home</span></a>
					<span class="rd-user" id="rd-user"></span>
				</div>
			</header>
			<div class="rd-filters">
				<div class="rd-field"><label for="rd-preset">PERIOD</label>
					<select id="rd-preset">${PRESETS.map(([k, l]) => `<option value="${k}" ${k === state.preset ? "selected" : ""}>${l}</option>`).join("")}</select></div>
				<div class="rd-field" id="rd-custom" ${state.preset === "custom" ? "" : "hidden"}>
					<input type="date" id="rd-from" value="${state.from}" aria-label="From date"><label>TO</label>
					<input type="date" id="rd-to" value="${state.to}" aria-label="To date"></div>
				<div class="rd-field"><label for="rd-company">COMPANY</label><select id="rd-company"><option value="">All companies</option></select></div>
				<div class="rd-field"><label for="rd-dept">DEPARTMENT</label><select id="rd-dept"><option value="">All departments</option></select></div>
				<button class="rd-btn is-primary" id="rd-apply">Apply</button>
				<button class="rd-btn" id="rd-reset">Reset</button>
				<div class="rd-chips" id="rd-chips"></div>
				<div class="rd-quick">
					<button class="rd-btn is-outline" id="rd-quick" aria-haspopup="true" aria-expanded="false">${I.plus}Quick actions</button>
					<div class="rd-menu" id="rd-quick-menu" hidden>
						<a href="${newUrl("Job Opening")}">${I.openings}Create job opening</a>
						<a href="/app/job-applicant#parse-resume">${I.applicants}Add applicant from resume</a>
						<a href="${newUrl("Interview")}">${I.interviews}Schedule interview</a>
						<a href="${newUrl("Job Offer")}">${I.offers}Create job offer</a>
						<a href="${newUrl("Employee Onboarding")}">${I.onboarding}Start onboarding</a>
						<a href="${listUrl("Job Requisition", { status: "Pending" })}">${I.ext}Job requisitions to approve</a>
						<a href="/onboarding-dashboard">${I.ext}Onboarding dashboard (classic)</a>
					</div>
				</div>
			</div>
			<nav class="rd-tabs" role="tablist" id="rd-tabs"></nav>
			<main class="rd-main" id="rd-main"></main>`;
		bindShell();
		renderTabs();
	}

	function renderTabs(counts) {
		counts = counts || {};
		document.getElementById("rd-tabs").innerHTML = TABS.map(([k, label]) => {
			const c = counts[k];
			return `<button class="rd-tab ${state.tab === k ? "is-active" : ""}" role="tab" aria-selected="${state.tab === k}" data-tab="${k}">
				${I[k]}${label}${c ? `<span class="rd-count ${c.alert ? "is-alert" : ""}" title="${esc(c.title || "")}">${n(c.value)}</span>` : ""}</button>`;
		}).join("");
	}

	function renderChips() {
		const chips = [];
		if (state.company) chips.push(["company", state.company]);
		if (state.department) chips.push(["department", state.department]);
		document.getElementById("rd-chips").innerHTML = chips.map(([k, v]) =>
			`<button class="rd-chip" data-chip="${k}" aria-label="Remove ${esc(v)} filter">${esc(v)}${I.x}</button>`).join("");
	}

	function bindShell() {
		const $ = (id) => document.getElementById(id);
		$("rd-preset").onchange = (e) => { $("rd-custom").hidden = e.target.value !== "custom"; };
		$("rd-apply").onclick = () => {
			state.preset = $("rd-preset").value;
			if (state.preset === "custom") { state.from = $("rd-from").value; state.to = $("rd-to").value; }
			else [state.from, state.to] = presetRange(state.preset);
			if (state.from > state.to) return toast("The start date is after the end date.");
			state.company = $("rd-company").value; state.department = $("rd-dept").value;
			applyFilters();
		};
		$("rd-reset").onclick = () => {
			Object.assign(state, { preset: "30d", company: "", department: "" });
			[state.from, state.to] = presetRange("30d");
			$("rd-preset").value = "30d"; $("rd-custom").hidden = true; $("rd-company").value = ""; $("rd-dept").value = "";
			applyFilters();
		};
		$("rd-chips").onclick = (e) => {
			const b = e.target.closest("[data-chip]"); if (!b) return;
			state[b.dataset.chip] = ""; $(b.dataset.chip === "company" ? "rd-company" : "rd-dept").value = ""; applyFilters();
		};
		$("rd-refresh").onclick = () => loadTab(true);
		$("rd-theme").onclick = () => {
			const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
			document.documentElement.dataset.theme = next; try { localStorage.setItem("rd-theme", next); } catch (e) { /* ignore */ }
			loadTab(false, true);
		};
		$("rd-quick").onclick = (e) => {
			e.stopPropagation(); const m = $("rd-quick-menu"); m.hidden = !m.hidden; $("rd-quick").setAttribute("aria-expanded", String(!m.hidden));
		};
		document.addEventListener("click", () => { $("rd-quick-menu").hidden = true; $("rd-results").hidden = true; closeRowMenu(); });
		$("rd-tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b) go({ tab: b.dataset.tab }); };
		bindSearch();
		window.addEventListener("hashchange", () => {
			const t = location.hash.slice(1).split("?")[0] || "overview";
			if (t !== state.tab && TABS.some(([k]) => k === t)) { closeDrawer(); state.tab = t; renderTabs(state.tabCounts); loadTab(); }
		});
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") closeDrawer();
			if (e.key === "/" && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); $("rd-q").focus(); }
		});
	}

	function applyFilters() {
		store.set("filters", { preset: state.preset, from: state.from, to: state.to, company: state.company, department: state.department });
		state.applicants.page = 1;
		renderChips(); loadTab(true);
		toast("Filters applied");
	}

	// navigate within the dashboard (action items, stage chips, KPI cards)
	function go(target) {
		if (target.url) { location.href = target.url; return; }
		closeDrawer();
		const tab = target.tab || state.tab;
		if (tab === "applicants") Object.assign(state.applicants, { stage: target.stage || "", opening: target.opening || "",
			aging: target.aging || 0, page: 1, allTime: target.allTime ? 1 : 0, search: "", channel: target.channel || "" });
		if (tab === "openings") Object.assign(state.openings, { status: target.status || "Open", pastClose: target.pastClose || 0 });
		if (["interviews", "offers", "onboarding"].includes(tab) && target.segment) state[tab].segment = target.segment;
		state.tab = tab; store.set("tab", tab);
		if (location.hash.slice(1) !== tab) history.pushState(null, "", "#" + tab);
		renderTabs(state.tabCounts);
		loadTab();
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	// ── search ───────────────────────────────────────────────────────────────
	function bindSearch() {
		const input = document.getElementById("rd-q"), box = document.getElementById("rd-results");
		let timer, active = -1;
		input.addEventListener("click", (e) => e.stopPropagation());
		input.addEventListener("input", () => {
			clearTimeout(timer);
			const q = input.value.trim();
			if (q.length < 2) { box.hidden = true; return; }
			timer = setTimeout(() => {
				api("search", { q }, "search").then((rows) => {
					active = -1;
					box.innerHTML = rows.length ? rows.map((r, i) => `<a class="rd-result" data-i="${i}" href="${deskUrl(r.doctype, r.name)}"
							${r.doctype === "Job Applicant" || r.doctype === "Job Opening" ? `data-drawer="${esc(r.doctype)}" data-name="${esc(r.name)}"` : ""}>
							<span class="rd-result-type">${esc(r.type)}</span><b>${esc(r.label)}</b><span class="rd-result-sub">${esc(r.sub)}</span></a>`).join("")
						: `<div class="rd-empty"><b>No matches</b>Try a name, email, phone or ID.</div>`;
					box.hidden = false;
				}).catch((e) => { if (!aborted(e)) { box.innerHTML = `<div class="rd-empty">${esc(e.message)}</div>`; box.hidden = false; } });
			}, 250);
		});
		input.addEventListener("keydown", (e) => {
			const items = [...box.querySelectorAll(".rd-result")];
			if (!items.length) return;
			if (e.key === "ArrowDown" || e.key === "ArrowUp") {
				e.preventDefault(); active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
				items.forEach((el, i) => el.classList.toggle("is-active", i === active));
			} else if (e.key === "Enter" && active >= 0) { e.preventDefault(); items[active].click(); }
		});
		box.addEventListener("click", (e) => {
			const a = e.target.closest("[data-drawer]");
			if (a && !e.ctrlKey && !e.metaKey) { e.preventDefault(); box.hidden = true; openDrawer(a.dataset.drawer, a.dataset.name); }
		});
	}

	// ── tab loading ──────────────────────────────────────────────────────────
	const main = () => document.getElementById("rd-main");
	function skeleton() {
		return `<div class="rd-kpis">${'<div class="rd-kpi"><div class="rd-skel" style="height:12px;width:50%"></div><div class="rd-skel" style="height:30px;width:40%;margin:12px 0"></div><div class="rd-skel" style="height:10px;width:70%"></div></div>'.repeat(4)}</div>
			<div class="rd-card"><div class="rd-card-body"><div class="rd-skel" style="height:220px"></div></div></div>`;
	}
	function errorBox(msg, retry) {
		return `<div class="rd-error" role="alert"><div><b>Couldn't load this section.</b> ${esc(msg)}</div><button class="rd-btn" data-retry="${retry}">Retry</button></div>`;
	}
	function setUpdated() {
		const d = new Date();
		document.getElementById("rd-upd").textContent = "Updated " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
	}
	function loadTab(force, redrawOnly) {
		const btn = document.getElementById("rd-refresh");
		btn.classList.add("is-loading");
		const done = () => btn.classList.remove("is-loading");
		const fn = { overview: loadOverview, openings: loadOpenings, applicants: loadApplicants, interviews: loadInterviews,
			offers: loadOffers, onboarding: loadOnboarding, analytics: loadAnalytics }[state.tab];
		if (!redrawOnly) main().innerHTML = skeleton();
		Promise.resolve(fn()).then(() => { setUpdated(); done(); }).catch((e) => {
			done();
			if (aborted(e)) return;
			main().innerHTML = errorBox(e.message || "Unknown error", state.tab);
		});
		// tab badges come from the overview counts
		// (the overview tab sets them itself)
		if (state.tab !== "overview" && (force || !state.tabCounts)) api("get_overview", filterArgs(), "counts").then(setTabCounts).catch(() => {});
	}
	document.addEventListener("click", (e) => { const r = e.target.closest("[data-retry]"); if (r) loadTab(true); });

	function setTabCounts(o) {
		const k = o.kpis;
		state.tabCounts = {
			openings: { value: k.activeOpenings.value, title: "Open job openings" },
			applicants: { value: k.inReview.value, title: "Applications awaiting screening" },
			interviews: { value: k.interviews.feedbackPending, alert: k.interviews.feedbackPending > 0, title: "Interviews awaiting a decision" },
			offers: { value: k.offers.awaiting + k.offers.draft, title: "Draft + awaiting-response offers" },
			onboarding: { value: k.onboarding.active, alert: k.overdue.joinedNotComplete > 0, title: "Active onboarding cases" },
		};
		renderTabs(state.tabCounts);
	}

	// ── overview ─────────────────────────────────────────────────────────────
	function kpi({ label, value, hint, tone, href, target, lead, tip, trend }) {
		const attrs = target ? `href="#" data-go='${esc(JSON.stringify(target))}'` : `href="${href}"`;
		return `<a class="rd-kpi tone-${tone} ${lead ? "is-lead" : ""}" ${attrs} title="${esc(tip || "")}">
			<div class="rd-kpi-label">${esc(label)} ${trend || ""}</div>
			<div class="rd-kpi-value rd-num">${value}</div><div class="rd-kpi-hint">${hint}</div></a>`;
	}
	function trendBadge(cur, prev) {
		if (!prev) return "";
		const pct = Math.round(((cur - prev) / prev) * 100);
		if (!pct) return "";
		return `<span class="rd-trend ${pct > 0 ? "is-up" : "is-down"}" title="vs the previous ${esc(periodLabel())}">${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%</span>`;
	}
	const periodLabel = () => (PRESETS.find(([k]) => k === state.preset) || [0, "period"])[1].toLowerCase();

	function loadOverview() {
		return api("get_overview", filterArgs(), "overview").then((o) => {
			state.overview = o; setTabCounts(o);
			const k = o.kpis, p = `${fmt(o.period.from, { day: "numeric", month: "short" })} – ${fmt(o.period.to, { day: "numeric", month: "short" })}`;
			const kpis = [
				kpi({ label: "ACTIVE JOB OPENINGS", value: n(k.activeOpenings.value), tone: "blue", lead: 1, target: { tab: "openings", status: "Open" },
					hint: `${k.activeOpenings.aging ? `<span class="is-warn">${k.activeOpenings.aging} open 45+ days</span>` : "None open 45+ days"} · ${n(k.activeOpenings.positions)} ${k.activeOpenings.positions === 1 ? "vacancy" : "vacancies"}`,
					tip: "Job Openings with status Open (now)" }),
				kpi({ label: "APPLICATIONS", value: n(k.applicants.value), tone: "info", lead: 1, target: { tab: "applicants" },
					trend: trendBadge(k.applicants.value, k.applicants.previous),
					hint: `${n(k.applicants.unique)} unique candidates · ${esc(p)}`, tip: "Job Applicants created in the selected period" }),
				kpi({ label: "IN REVIEW", value: n(k.inReview.value), tone: "amber", target: { tab: "applicants", stage: "In Review", allTime: 1 },
					hint: k.inReview.aging ? `<span class="is-warn">${k.inReview.aging} waiting over 7 days</span>` : "None waiting over 7 days",
					tip: "Open / Replied applicants with no interview yet (now)" }),
				kpi({ label: "INTERVIEWS", value: n(k.interviews.today), tone: "blue", target: { tab: "interviews", segment: "today" },
					hint: `today · ${n(k.interviews.upcoming)} upcoming · ${k.interviews.feedbackPending ? `<span class="is-bad">${k.interviews.feedbackPending} awaiting decision</span>` : "0 awaiting decision"}` }),
				kpi({ label: "OFFERS IN PROGRESS", value: n(k.offers.awaiting + k.offers.draft), tone: "amber", target: { tab: "offers", segment: "awaiting" },
					hint: `${n(k.offers.awaiting)} awaiting response · ${n(k.offers.draft)} draft · <b>${n(k.offers.acceptedPeriod)}</b> accepted in period` }),
				kpi({ label: "JOINING SOON", value: n(k.joining.in7), tone: "green", target: { tab: "onboarding", segment: "joining" },
					hint: `next 7 days · ${n(k.joining.in30)} in 30 days${k.joining.acceptedNoOnboarding ? ` · <span class="is-warn">${k.joining.acceptedNoOnboarding} not started</span>` : ""}` }),
				kpi({ label: "ONBOARDING IN PROGRESS", value: n(k.onboarding.active), tone: "info", target: { tab: "onboarding", segment: "active" },
					hint: `${n(k.onboarding.completedPeriod)} completed in period · ${k.onboarding.docsPending ? `<span class="is-warn">${k.onboarding.docsPending} with documents pending</span>` : "no documents pending"}` }),
				kpi({ label: "OVERDUE ACTIONS", value: n(k.overdue.value), tone: k.overdue.value ? "red" : "green", target: { tab: "overview", anchor: "actions" },
					hint: `${k.overdue.feedback} interviews · ${k.overdue.linkExpired} expired links · ${k.overdue.joinedNotComplete} past joining`,
					tip: "Only items whose real date has passed: interview date, link expiry, joining date, opening close date" }),
			].join("");

			const fmax = Math.max(1, ...o.funnel.steps.map((s) => s.count));
			const stepTarget = { Applied: { tab: "applicants" }, Shortlisted: { tab: "interviews", segment: "all" }, Selected: { tab: "applicants", stage: "Selected" },
				"Offer Released": { tab: "offers", segment: "all" }, "Offer Accepted": { tab: "offers", segment: "accepted" }, Joined: { tab: "applicants", stage: "Joined" } };
			const funnel = o.funnel.steps.map((s) => `
				<a class="rd-fstep" href="#" data-go='${esc(JSON.stringify(stepTarget[s.step]))}' title="Open ${esc(s.step)}">
					<span class="rd-fname">${esc(s.step)}</span>
					<span class="rd-fbar"><span style="width:${Math.max(4, (100 * s.count) / fmax)}%">${s.count ? n(s.count) : ""}</span></span>
					<span class="rd-fconv">${s.conversion == null ? "" : s.conversion + "%"}</span>
					<span class="rd-fcount rd-num">${n(s.count)}</span></a>`).join("");
			const stageChips = o.stageCounts.filter((s) => s.count).map((s) =>
				`<a class="rd-stagechip" href="#" data-go='${esc(JSON.stringify({ tab: "applicants", stage: s.stage }))}'>${badge(s.stage)} <b>${n(s.count)}</b></a>`).join("");

			const actions = o.actions.length ? o.actions.map((a) => `
				<div class="rd-action is-${a.priority}">
					<span class="dot" aria-hidden="true"></span>
					<div><div class="rd-action-title"><span class="rd-action-tag">${a.priority === "critical" ? "OVERDUE" : a.priority === "high" ? "ATTENTION" : "TO DO"}</span>${esc(a.title)}</div>
						${a.why ? `<div class="rd-action-why">${esc(a.why)}</div>` : ""}</div>
					<a class="rd-btn" href="${a.target.url || "#"}" ${a.target.url ? "" : `data-go='${esc(JSON.stringify(a.target))}'`}>${esc(a.cta)}</a>
				</div>`).join("") : `<div class="rd-empty"><b>All clear</b>Nothing needs attention right now.</div>`;

			const topOpenings = o.topOpenings.length ? `<table class="rd-table"><thead><tr><th>OPENING</th><th class="num">APPLICANTS</th><th class="num">IN REVIEW</th><th class="num">OFFERS</th><th class="num">DAYS OPEN</th></tr></thead><tbody>
				${o.topOpenings.map((r) => `<tr data-drawer="Job Opening" data-name="${esc(r.name)}">
					<td><a class="rd-cell-title" href="${deskUrl("Job Opening", r.name)}" data-drawer="Job Opening" data-name="${esc(r.name)}">${esc(r.title)}</a><span class="rd-cell-sub">${esc(r.department || "")}</span></td>
					<td class="num">${cnt(r.applicants, "#", { tab: "applicants", opening: r.name })}</td>
					<td class="num">${cnt(r.inReview, "#", { tab: "applicants", opening: r.name, stage: "In Review" })}</td>
					<td class="num">${n(r.offers + r.accepted)}</td><td class="num">${n(r.daysOpen)}</td></tr>`).join("")}</tbody></table>`
				: `<div class="rd-empty"><b>No open job openings</b><a class="rd-link" href="${newUrl("Job Opening")}">Create a job opening</a></div>`;

			const ivs = o.upcomingInterviews.length ? o.upcomingInterviews.map((r) => `
				<div class="rd-li"><span class="rd-date"><b>${fmt(r.date, { day: "numeric" })}</b><small>${fmt(r.date, { month: "short" })}</small></span>
					<div class="rd-li-main"><a class="rd-li-title" href="${deskUrl("Interview", r.name)}">${esc(r.applicantName || r.applicant)} · ${esc(r.round || "")}</a>
						<div class="rd-li-sub">${esc(r.openingTitle || "")} ${r.time ? "· " + esc(r.time) : ""} ${r.interviewers.length ? "· " + esc(r.interviewers.join(", ")) : ""}</div></div>
					${badge(r.status)}</div>`).join("") : `<div class="rd-empty"><b>No interviews scheduled</b><a class="rd-link" href="${newUrl("Interview")}">Schedule an interview</a></div>`;

			const joiners = o.upcomingJoiners.length ? o.upcomingJoiners.map((r) => `
				<div class="rd-li"><span class="rd-avatar">${esc(initials(r.employeeName))}</span>
					<div class="rd-li-main"><a class="rd-li-title" href="${deskUrl("Employee Onboarding", r.name)}">${esc(r.employeeName)}</a>
						<div class="rd-li-sub">${esc(r.designation || "")} · joins ${fmt(r.joining, { day: "numeric", month: "short" })} (${r.daysToJoin === 0 ? "today" : "in " + r.daysToJoin + " d"})</div></div>
					${readiness(r)}</div>`).join("") : `<div class="rd-empty"><b>No joiners in the next 30 days</b></div>`;

			main().innerHTML = `
				<div class="rd-head"><h2>Hiring &amp; Onboarding Overview</h2><span class="rd-pill">LIVE HRMS DATA</span>
					<span class="rd-note">Period metrics: ${esc(p)} · snapshot metrics are as of now</span></div>
				<div class="rd-kpis">${kpis}</div>
				<div class="rd-grid cols-2">
					<div class="rd-stack">
						<section class="rd-card"><div class="rd-card-head"><div><h3>Recruitment pipeline</h3>
							<p>Applications received ${esc(p)} and how far they got · % = conversion from the previous step</p></div>
							<a class="rd-link" href="#" data-go='{"tab":"applicants"}'>View applicants</a></div>
							<div class="rd-card-body"><div class="rd-funnel">${funnel}</div>
							<div class="rd-stagechips" aria-label="Current stage of these applications">${stageChips}</div>
							<div class="rd-defn">Steps count everyone who reached them or went further. Stage chips show where each application is now.</div></div></section>
						<section class="rd-card"><div class="rd-card-head"><div><h3>Most applied open positions</h3><p>All-time applicants per open opening</p></div>
							<a class="rd-link" href="#" data-go='{"tab":"openings"}'>All openings</a></div>
							<div class="rd-card-body rd-table-wrap">${topOpenings}</div></section>
					</div>
					<div class="rd-stack">
						<section class="rd-card" id="actions"><div class="rd-card-head"><div><h3>Needs your attention</h3><p>Live counts, most urgent first</p></div></div>
							<div class="rd-card-body"><div class="rd-actions">${actions}</div></div></section>
						<section class="rd-card"><div class="rd-card-head"><div><h3>Upcoming interviews</h3><p>Today and later</p></div>
							<a class="rd-link" href="#" data-go='{"tab":"interviews","segment":"upcoming"}'>Schedule</a></div>
							<div class="rd-card-body"><div class="rd-list">${ivs}</div></div></section>
						<section class="rd-card"><div class="rd-card-head"><div><h3>Joining in the next 30 days</h3><p>Readiness = mandatory documents received by HR</p></div>
							<a class="rd-link" href="#" data-go='{"tab":"onboarding","segment":"joining"}'>Onboarding</a></div>
							<div class="rd-card-body"><div class="rd-list">${joiners}</div></div></section>
					</div>
				</div>`;
		});
	}

	function cnt(v, href, target) {
		const attrs = target ? `href="#" data-go='${esc(JSON.stringify(target))}'` : `href="${href}"`;
		return `<a class="rd-cnt ${v ? "" : "is-zero"}" ${attrs}>${n(v)}</a>`;
	}
	function readiness(r) {
		if (!r.docsMandatory) return badge(r.stage);
		const pct = r.readiness || 0;
		return `<span title="${r.docsReceived}/${r.docsMandatory} mandatory documents received"><span class="rd-progress"><span style="width:${pct}%;background:${pct === 100 ? "var(--good)" : pct >= 50 ? "var(--warn)" : "var(--bad)"}"></span></span><span class="rd-num">${pct}%</span></span>`;
	}

	// ── job openings ─────────────────────────────────────────────────────────
	function loadOpenings() {
		return api("get_openings", filterArgs(), "openings").then((d) => { state.openings.rows = d.rows; drawOpenings(); });
	}
	function drawOpenings() {
		const s = state.openings, q = s.search.toLowerCase();
		let rows = s.rows.filter((r) => (!s.status || r.status === s.status) && (!s.pastClose || r.pastClose)
			&& (!q || [r.title, r.name, r.department, r.location, r.designation].join(" ").toLowerCase().includes(q)));
		const sorters = { applicants: (a, b) => b.applicants - a.applicants, days: (a, b) => (b.daysOpen || 0) - (a.daysOpen || 0),
			review: (a, b) => b.inReview - a.inReview, title: (a, b) => a.title.localeCompare(b.title) };
		if (sorters[s.sort]) rows = rows.slice().sort(sorters[s.sort]);
		const counts = { Open: s.rows.filter((r) => r.status === "Open").length, Closed: s.rows.filter((r) => r.status === "Closed").length, "": s.rows.length };
		const th = (label, key, cls) => `<th class="${cls || ""} ${key ? "is-sort" : ""}" ${key ? `data-sort="${key}"` : ""}>${label}${s.sort === key ? " ↓" : ""}</th>`;
		main().innerHTML = `
			<div class="rd-head"><h2>Job Openings</h2><span class="rd-pill">ALL-TIME APPLICANTS PER OPENING</span>
				<span class="rd-note"><a class="rd-link" href="${listUrl("Job Opening")}">Open in desk ${I.ext}</a></span></div>
			<section class="rd-card">
				<div class="rd-toolbar">
					<div class="rd-seg" role="group" aria-label="Status">${[["Open", "Open"], ["Closed", "Closed"], ["", "All"]].map(([k, l]) =>
						`<button data-status="${k}" class="${s.status === k ? "is-active" : ""}">${l} <i>${counts[k]}</i></button>`).join("")}</div>
					${s.pastClose ? `<button class="rd-chip" data-clear="pastClose">Past closing date${I.x}</button>` : ""}
					<input type="search" id="rd-os" placeholder="Search title, ID, department, location" value="${esc(s.search)}" aria-label="Search openings">
					<a class="rd-btn is-primary" href="${newUrl("Job Opening")}" style="margin-left:auto">${I.plus}New job opening</a>
				</div>
				<div class="rd-table-wrap"><table class="rd-table"><thead><tr>
					${th("JOB OPENING", "title")}<th>DEPARTMENT · LOCATION</th>${th("APPLICANTS", "applicants", "num")}<th class="num">NEW (7D)</th>
					${th("IN REVIEW", "review", "num")}<th class="num">INTERVIEWING</th><th class="num">SELECTED</th><th class="num">OFFERS</th>
					<th class="num">ACCEPTED</th><th class="num">JOINED</th><th class="num">VACANCIES</th>${th("DAYS OPEN", "days", "num")}<th>STATUS</th><th></th></tr></thead>
					<tbody>${rows.length ? rows.map((r) => `<tr data-drawer="Job Opening" data-name="${esc(r.name)}">
						<td><a class="rd-cell-title" href="${deskUrl("Job Opening", r.name)}" data-drawer="Job Opening" data-name="${esc(r.name)}">${esc(r.title)}</a>
							<span class="rd-cell-sub">${esc(r.name)}${r.general ? " · general application" : ""}</span></td>
						<td>${esc(r.department || "—")}<span class="rd-cell-sub">${esc(r.location || "")}</span></td>
						<td class="num">${cnt(r.applicants, listUrl("Job Applicant", { job_title: r.name }))}</td>
						<td class="num">${cnt(r.new, "#", { tab: "applicants", opening: r.name })}</td>
						<td class="num">${cnt(r.inReview, "#", { tab: "applicants", opening: r.name, stage: "In Review" })}</td>
						<td class="num">${cnt(r.interviewing, listUrl("Interview", { job_opening: r.name, status: ["in", ["Pending", "Under Review"]] }))}</td>
						<td class="num">${cnt(r.selected, "#", { tab: "applicants", opening: r.name, stage: "Selected" })}</td>
						<td class="num">${cnt(r.offers, "#", { tab: "applicants", opening: r.name, stage: "Offer Released" })}</td>
						<td class="num">${cnt(r.accepted, "#", { tab: "applicants", opening: r.name, stage: "Offer Accepted" })}</td>
						<td class="num">${cnt(r.joined, "#", { tab: "applicants", opening: r.name, stage: "Joined" })}</td>
						<td class="num">${n(r.vacancies || null)}</td>
						<td class="num">${r.daysOpen == null ? "—" : `<span class="${r.daysOpen > 45 ? "rd-badge is-warn" : ""}">${r.daysOpen}</span>`}</td>
						<td>${badge(r.status)}${r.pastClose ? ` <span class="rd-badge is-bad" title="Closes on ${esc(r.closesOn)}">Past close</span>` : ""}</td>
						<td>${rowMenu([
							["View job opening", deskUrl("Job Opening", r.name)], ["Applicants (desk list)", listUrl("Job Applicant", { job_title: r.name })],
							["Interviews", listUrl("Interview", { job_opening: r.name })], ["Schedule interview", newUrl("Interview", { job_opening: r.name })],
							["Add applicant", newUrl("Job Applicant", { job_title: r.name })], ["Edit / close opening", deskUrl("Job Opening", r.name)]])}</td>
					</tr>`).join("") : `<tr><td colspan="14"><div class="rd-empty"><b>${s.rows.length ? "No openings match these filters" : "No job openings yet"}</b>
						${s.rows.length ? "Clear the search or change the status." : `<a class="rd-link" href="${newUrl("Job Opening")}">Create one</a>`}</div></td></tr>`}</tbody></table></div>
				<div class="rd-pager">${rows.length} of ${s.rows.length} openings · default order: open first, longest open first</div>
			</section>`;
		const os = document.getElementById("rd-os");
		os.oninput = debounce(() => { s.search = os.value; drawOpenings(); document.getElementById("rd-os").focus(); placeCaret("rd-os"); }, 200);
		main().querySelectorAll("[data-status]").forEach((b) => (b.onclick = () => { s.status = b.dataset.status; drawOpenings(); }));
		main().querySelectorAll("[data-sort]").forEach((b) => (b.onclick = () => { s.sort = s.sort === b.dataset.sort ? "default" : b.dataset.sort; drawOpenings(); }));
		const clr = main().querySelector("[data-clear]"); if (clr) clr.onclick = () => { s.pastClose = 0; drawOpenings(); };
	}
	function placeCaret(id) { const el = document.getElementById(id); if (el) el.setSelectionRange(el.value.length, el.value.length); }
	function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

	// row action menu (kebab) - links only, never changes data by itself
	function rowMenu(items) {
		return `<button class="rd-kebab" data-menu='${esc(JSON.stringify(items))}' aria-label="Actions">${I.dots}</button>`;
	}
	function closeRowMenu() { const m = document.querySelector(".rd-rowmenu"); if (m) m.remove(); }
	document.addEventListener("click", (e) => {
		const k = e.target.closest("[data-menu]");
		if (!k) return;
		e.stopPropagation(); e.preventDefault(); closeRowMenu();
		const r = k.getBoundingClientRect();
		const m = document.createElement("div");
		m.className = "rd-menu rd-rowmenu";
		m.style.top = r.bottom + 4 + "px"; m.style.left = Math.max(8, r.right - 230) + "px";
		m.innerHTML = JSON.parse(k.dataset.menu).map(([l, href]) => `<a href="${href}">${esc(l)}</a>`).join("");
		document.body.appendChild(m);
	}, true);

	// in-dashboard navigation + drawers (capture so row clicks don't also fire)
	document.addEventListener("click", (e) => {
		if (e.ctrlKey || e.metaKey || e.button === 1) return;
		const g = e.target.closest("[data-go]");
		if (g) {
			e.preventDefault(); e.stopPropagation();
			const t = JSON.parse(g.dataset.go);
			if (t.anchor) { const el = document.getElementById(t.anchor); if (el) el.scrollIntoView({ behavior: "smooth" }); return; }
			go(t); return;
		}
		if (e.target.closest(".rd-kebab, .rd-menu a, a[href]:not([data-drawer])")) return;
		const d = e.target.closest("[data-drawer]");
		if (d && d.closest("#rd-main")) { e.preventDefault(); openDrawer(d.dataset.drawer, d.dataset.name); }
	});

	// ── applicants ───────────────────────────────────────────────────────────
	function loadApplicants() {
		const s = state.applicants;
		return api("get_applicants", { ...filterArgs(), stage: s.stage, job_opening: s.opening, search: s.search, aging: s.aging,
			page: s.page, page_size: s.pageSize, sort: s.sort, all_time: s.allTime, channel: s.channel }, "applicants").then((d) => drawApplicants(d));
	}
	function drawApplicants(d) {
		const s = state.applicants, pages = Math.max(1, Math.ceil(d.total / s.pageSize));
		const stages = ["", "In Review", "Interviewing", "Selected", "Offer Released", "Offer Accepted", "Joined", "On Hold", "Rejected"];
		const scope = s.opening ? `Opening ${s.opening} · all time` : s.allTime ? "All time" : `Applied ${fmt(state.from)} – ${fmt(state.to)}`;
		main().innerHTML = `
			<div class="rd-head"><h2>Applicants</h2><span class="rd-pill">${esc(scope.toUpperCase())}</span>
				<span class="rd-note"><a class="rd-link" href="${listUrl("Job Applicant", s.opening ? { job_title: s.opening } : {})}">Open in desk ${I.ext}</a></span></div>
			<section class="rd-card">
				<div class="rd-toolbar">
					<input type="search" id="rd-as" placeholder="Search name, email, phone, ID" value="${esc(s.search)}" aria-label="Search applicants">
					<select id="rd-astage" aria-label="Stage">${stages.map((x) => `<option value="${x}" ${s.stage === x ? "selected" : ""}>${x || "All stages"}${x && d.stageCounts[x] != null && !s.stage ? ` (${d.stageCounts[x]})` : ""}</option>`).join("")}</select>
					<select id="rd-achannel" aria-label="Application channel">${[["", "All channels"], ["QR Code", "QR Code"], ["Link", "Link"], ["Website", "Website"],
						["Added by HR", "Added by HR"], ["Not recorded", "Not recorded"]].map(([k, l]) => `<option value="${k}" ${s.channel === k ? "selected" : ""}>${l}</option>`).join("")}</select>
					<select id="rd-asort" aria-label="Sort">${[["newest", "Newest first"], ["oldest", "Oldest first"], ["activity", "Recent activity"], ["name", "Name A–Z"]].map(([k, l]) =>
						`<option value="${k}" ${s.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
					<label class="rd-field" style="gap:6px"><input type="checkbox" id="rd-aall" ${s.allTime ? "checked" : ""} ${s.opening ? "disabled" : ""}> All time</label>
					${s.opening ? `<button class="rd-chip" data-clear="opening">Opening: ${esc(s.opening)}${I.x}</button>` : ""}
					${s.aging ? `<button class="rd-chip" data-clear="aging">Waiting 7+ days${I.x}</button>` : ""}
					<div style="margin-left:auto;display:flex;gap:8px">
						<a class="rd-btn" href="/app/job-applicant#parse-resume">Parse resume</a>
						<a class="rd-btn is-primary" href="${newUrl("Job Applicant", s.opening ? { job_title: s.opening } : {})}">${I.plus}New applicant</a></div>
				</div>
				<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>APPLICANT</th><th>APPLIED FOR</th><th>APPLIED</th><th class="num">AGE</th>
					<th>STAGE</th><th>LAST INTERVIEW</th><th>NEXT ACTION</th><th>CHANNEL · SOURCE</th><th></th></tr></thead><tbody>
					${d.rows.length ? d.rows.map((r) => `<tr data-drawer="Job Applicant" data-name="${esc(r.name)}">
						<td><a class="rd-cell-title" href="${deskUrl("Job Applicant", r.name)}" data-drawer="Job Applicant" data-name="${esc(r.name)}">${esc(r.applicantName || r.name)}</a>
							<span class="rd-cell-sub">${esc(r.email || "")}</span></td>
						<td>${r.opening ? `<a href="${deskUrl("Job Opening", r.opening)}" data-drawer="Job Opening" data-name="${esc(r.opening)}">${esc(r.openingTitle)}</a>` : "—"}
							<span class="rd-cell-sub">${esc(r.department || "")}</span></td>
						<td>${fmt(r.applied)}</td>
						<td class="num"><span class="${r.stage === "In Review" && r.age > 7 ? "rd-badge is-warn" : ""}">${r.age}d</span></td>
						<td>${badge(r.stage)}</td>
						<td>${r.interview ? `<a href="${deskUrl("Interview", r.interview.name)}">${esc(r.interview.round || "Interview")}</a> ${badge(r.interview.status)}` : '<span class="rd-cell-sub">—</span>'}</td>
						<td>${esc(r.nextAction || "—")}</td>
						<td>${r.channel ? badge(r.channel) : "—"}<span class="rd-cell-sub">${esc(r.source || "")}</span></td>
						<td>${rowMenu(applicantActions(r))}</td></tr>`).join("")
						: `<tr><td colspan="9"><div class="rd-empty"><b>No applicants match these filters</b>Try "All time", another stage, or clear the search.</div></td></tr>`}
				</tbody></table></div>
				<div class="rd-pager">
					<span>${d.total ? `${(s.page - 1) * s.pageSize + 1}–${Math.min(s.page * s.pageSize, d.total)} of ${n(d.total)}` : "0 results"}</span>
					<select id="rd-aps" aria-label="Rows per page">${[20, 50, 100].map((v) => `<option ${v === s.pageSize ? "selected" : ""}>${v}</option>`).join("")}</select>
					<button class="rd-btn" id="rd-aprev" ${s.page <= 1 ? "disabled" : ""}>Previous</button>
					<span>Page ${s.page} of ${pages}</span>
					<button class="rd-btn" id="rd-anext" ${s.page >= pages ? "disabled" : ""}>Next</button>
				</div>
			</section>`;
		const $ = (id) => document.getElementById(id);
		const reload = () => { main().style.opacity = .55; loadApplicants().then(() => { main().style.opacity = 1; setUpdated(); }).catch((e) => { main().style.opacity = 1; if (!aborted(e)) toast(e.message); }); };
		$("rd-as").oninput = debounce(() => { s.search = $("rd-as").value; s.page = 1; reload(); }, 300);
		$("rd-astage").onchange = () => { s.stage = $("rd-astage").value; s.page = 1; reload(); };
		$("rd-asort").onchange = () => { s.sort = $("rd-asort").value; reload(); };
		$("rd-achannel").onchange = () => { s.channel = $("rd-achannel").value; s.page = 1; reload(); };
		$("rd-aall").onchange = () => { s.allTime = $("rd-aall").checked ? 1 : 0; s.page = 1; reload(); };
		$("rd-aps").onchange = () => { s.pageSize = +$("rd-aps").value; s.page = 1; reload(); };
		$("rd-aprev").onclick = () => { s.page--; reload(); };
		$("rd-anext").onclick = () => { s.page++; reload(); };
		main().querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => { s[b.dataset.clear] = b.dataset.clear === "aging" ? 0 : ""; s.page = 1; reload(); }));
		if (s.search) { $("rd-as").focus(); placeCaret("rd-as"); }
	}
	function applicantActions(r) {
		const a = [["View applicant", deskUrl("Job Applicant", r.name)]];
		if (r.resume) a.push(["View resume", r.resume]);
		if (["In Review", "Interviewing", "Selected"].includes(r.stage)) a.push(["Schedule interview", newUrl("Interview", { job_applicant: r.name, job_opening: r.opening })]);
		if (r.interview) a.push(["Open last interview", deskUrl("Interview", r.interview.name)]);
		if (r.stage === "Selected") a.push(["Create job offer", newUrl("Job Offer", { job_applicant: r.name })]);
		if (["Offer Released", "Offer Accepted"].includes(r.stage)) a.push(["View job offers", listUrl("Job Offer", { job_applicant: r.name })]);
		if (r.stage === "Offer Accepted") a.push(["Onboarding", listUrl("Employee Onboarding", { job_applicant: r.name })]);
		if (r.opening) a.push(["View job opening", deskUrl("Job Opening", r.opening)]);
		return a;
	}

	// ── interviews ───────────────────────────────────────────────────────────
	function loadInterviews() {
		return api("get_interviews", { ...filterArgs(), segment: state.interviews.segment }, "interviews").then((d) => {
			const seg = [["feedback", "Awaiting decision"], ["today", "Today"], ["upcoming", "Upcoming"], ["completed", "Completed (period)"], ["all", "All (period)"]];
			main().innerHTML = `
				<div class="rd-head"><h2>Interviews</h2><span class="rd-pill">ROUNDS · PANEL · FEEDBACK</span>
					<span class="rd-note"><a class="rd-link" href="${listUrl("Interview")}">Open in desk ${I.ext}</a> · <a class="rd-link" href="/app/interview/view/calendar">Calendar</a></span></div>
				<section class="rd-card">
					<div class="rd-toolbar"><div class="rd-seg" role="group" aria-label="Interviews">${seg.map(([k, l]) =>
						`<button data-seg="${k}" class="${state.interviews.segment === k ? "is-active" : ""}">${l} <i>${d.counts[k] ?? ""}</i></button>`).join("")}</div>
						<a class="rd-btn is-primary" style="margin-left:auto" href="${newUrl("Interview")}">${I.plus}Schedule interview</a></div>
					<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>DATE</th><th>CANDIDATE</th><th>OPENING</th><th>ROUND</th><th>MODE</th>
						<th>INTERVIEWERS</th><th class="num">FEEDBACK</th><th>STATUS</th><th></th></tr></thead><tbody>
						${d.rows.length ? d.rows.map((r) => `<tr onclick="location.href='${deskUrl("Interview", r.name)}'">
							<td>${fmt(r.date)}<span class="rd-cell-sub">${esc(r.time || "")}</span></td>
							<td><a class="rd-cell-title" href="${deskUrl("Job Applicant", r.applicant)}" data-drawer="Job Applicant" data-name="${esc(r.applicant)}">${esc(r.applicantName || r.applicant)}</a></td>
							<td>${r.opening ? `<a href="${deskUrl("Job Opening", r.opening)}">${esc(r.openingTitle)}</a>` : "—"}</td>
							<td><a href="${deskUrl("Interview", r.name)}">${esc(r.round || r.name)}</a></td>
							<td>${esc(r.mode || "—")}</td>
							<td>${esc(r.interviewers.join(", ") || "—")}</td>
							<td class="num"><a class="rd-cnt" href="${listUrl("Interview Feedback", { interview: r.name })}" title="Submitted feedback / panel size">${esc(r.feedback)}</a></td>
							<td>${badge(r.status)}${r.submitted ? "" : ' <span class="rd-cell-sub">not submitted</span>'}</td>
							<td>${rowMenu([["Open interview", deskUrl("Interview", r.name)], ["Feedback records", listUrl("Interview Feedback", { interview: r.name })],
								["Add feedback", newUrl("Interview Feedback", { interview: r.name })], ["View candidate", deskUrl("Job Applicant", r.applicant)]])}</td></tr>`).join("")
							: `<tr><td colspan="9"><div class="rd-empty"><b>No interviews here</b>${state.interviews.segment === "feedback" ? "Every past interview has a decision." : "Nothing in this view for the selected filters."}</div></td></tr>`}
					</tbody></table></div>
					<div class="rd-pager">${n(d.total)} interview(s) · "Awaiting decision" = interview date passed, status still Pending / Under Review</div>
				</section>`;
			main().querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => { state.interviews.segment = b.dataset.seg; loadTab(); }));
			main().querySelectorAll("tbody a, .rd-kebab").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
		});
	}

	// ── offers ───────────────────────────────────────────────────────────────
	function loadOffers() {
		return api("get_offers", { ...filterArgs(), segment: state.offers.segment }, "offers").then((d) => {
			const seg = [["awaiting", "Awaiting response"], ["draft", "Draft (not released)"], ["accepted", "Accepted"],
				["accepted_no_onboarding", "Accepted, no onboarding"], ["rejected", "Declined"], ["all", "All"]];
			main().innerHTML = `
				<div class="rd-head"><h2>Job Offers</h2><span class="rd-pill">COMPENSATION NOT SHOWN</span>
					<span class="rd-note"><a class="rd-link" href="${listUrl("Job Offer")}">Open in desk ${I.ext}</a></span></div>
				<section class="rd-card">
					<div class="rd-toolbar"><div class="rd-seg" role="group" aria-label="Offers">${seg.map(([k, l]) =>
						`<button data-seg="${k}" class="${state.offers.segment === k ? "is-active" : ""}">${l} <i>${d.counts[k] ?? ""}</i></button>`).join("")}</div>
						<a class="rd-btn is-primary" style="margin-left:auto" href="${newUrl("Job Offer")}">${I.plus}New job offer</a></div>
					<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>CANDIDATE</th><th>DESIGNATION · OPENING</th><th>CREATED</th>
						<th>JOINING DATE</th><th>STATUS</th><th>WAITING</th><th>NEXT ACTION</th><th></th></tr></thead><tbody>
						${d.rows.length ? d.rows.map((r) => `<tr onclick="location.href='${deskUrl("Job Offer", r.name)}'">
							<td><a class="rd-cell-title" href="${deskUrl("Job Applicant", r.applicant)}" data-drawer="Job Applicant" data-name="${esc(r.applicant)}">${esc(r.applicantName || r.applicant)}</a>
								<span class="rd-cell-sub">${esc(r.name)}</span></td>
							<td>${esc(r.designation || "—")}<span class="rd-cell-sub">${r.opening ? `<a href="${deskUrl("Job Opening", r.opening)}">${esc(r.openingTitle)}</a>` : esc(r.company || "")}</span></td>
							<td>${fmt(r.offerCreated)}</td>
							<td>${fmt(r.joining)}${r.daysToJoin != null && r.status !== "Rejected" ? `<span class="rd-cell-sub">${r.daysToJoin < 0 ? `${-r.daysToJoin} d ago` : r.daysToJoin === 0 ? "today" : `in ${r.daysToJoin} d`}</span>` : ""}</td>
							<td>${badge(r.status)}</td>
							<td>${r.waitingDays != null ? `<span class="${r.waitingDays > 3 ? "rd-badge is-warn" : ""}">${r.waitingDays} d</span>` : "—"}</td>
							<td>${r.status === "Accepted" ? (r.onboarding ? `<a class="rd-link" href="${deskUrl("Employee Onboarding", r.onboarding)}">Open onboarding</a>`
								: `<a class="rd-link" href="${newUrl("Employee Onboarding", { job_applicant: r.applicant, job_offer: r.name })}">Start onboarding</a>`) : esc(r.pendingAction || "—")}</td>
							<td>${rowMenu([["Review offer", deskUrl("Job Offer", r.name)], ["View candidate", deskUrl("Job Applicant", r.applicant)]]
								.concat(r.opening ? [["View job opening", deskUrl("Job Opening", r.opening)]] : []))}</td></tr>`).join("")
							: `<tr><td colspan="8"><div class="rd-empty"><b>No offers in this view</b></div></td></tr>`}
					</tbody></table></div>
					<div class="rd-pager">${n(d.total)} offer(s) · Draft = saved but not submitted (submitting emails it to the candidate) · approvals follow the Job Offer's own rules</div>
				</section>`;
			main().querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => { state.offers.segment = b.dataset.seg; loadTab(); }));
			main().querySelectorAll("tbody a, .rd-kebab").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
		});
	}

	// ── onboarding ───────────────────────────────────────────────────────────
	function loadOnboarding() {
		return api("get_onboarding", { ...filterArgs(), segment: state.onboarding.segment }, "onboarding").then((d) => {
			const seg = [["active", "In progress"], ["joining", "Joining in 30 days"], ["overdue", "Past joining date"], ["not_sent", "Link not sent"],
				["expired", "Link expired"], ["documents", "Documents pending"], ["completed", "Completed"]];
			const st = d.stageCounts;
			const metric = (label, v, segk, tone) => `<a class="rd-metric" href="#" data-go='${esc(JSON.stringify({ tab: "onboarding", segment: segk }))}'>
				<small>${label}</small><b class="rd-num" style="${tone ? `color:var(--${tone})` : ""}">${n(v)}</b></a>`;
			main().innerHTML = `
				<div class="rd-head"><h2>Onboarding</h2><span class="rd-pill">PORTAL · DOCUMENTS · VERIFICATION</span>
					<span class="rd-note"><a class="rd-link" href="${listUrl("Employee Onboarding")}">Open in desk ${I.ext}</a> · <a class="rd-link" href="/onboarding-dashboard">Classic dashboard</a></span></div>
				<div class="rd-metrics" style="margin-bottom:16px">
					${metric("In progress", d.counts.active, "active")}
					${metric("Joining in 30 days", d.counts.joining, "joining", "good")}
					${metric("Past joining date, not completed", d.counts.overdue, "overdue", d.counts.overdue ? "bad" : "")}
					${metric("Completed", d.counts.completed, "completed")}
				</div>
				<div class="rd-grid cols-2">
					<section class="rd-card">
						<div class="rd-toolbar"><div class="rd-seg" role="group" aria-label="Onboarding">${seg.map(([k, l]) =>
							`<button data-seg="${k}" class="${state.onboarding.segment === k ? "is-active" : ""}">${l} <i>${d.counts[k] ?? ""}</i></button>`).join("")}</div></div>
						<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>CANDIDATE</th><th>JOINING</th><th>STAGE</th><th>DOCUMENTS</th>
							<th>BGV</th><th>LINK SENT BY</th><th></th></tr></thead><tbody>
							${d.rows.length ? d.rows.map((r) => `<tr onclick="location.href='${deskUrl("Employee Onboarding", r.name)}'">
								<td><a class="rd-cell-title" href="${deskUrl("Employee Onboarding", r.name)}">${esc(r.employeeName)}</a>
									<span class="rd-cell-sub">${esc([r.designation, r.department].filter(Boolean).join(" · "))}</span></td>
								<td>${fmt(r.joining)}${r.daysToJoin != null && r.status !== "Completed" ? `<span class="rd-cell-sub" style="${r.daysToJoin < 0 ? "color:var(--bad)" : ""}">${r.daysToJoin < 0 ? `${-r.daysToJoin} d overdue` : r.daysToJoin === 0 ? "today" : `in ${r.daysToJoin} d`}</span>` : ""}</td>
								<td>${badge(r.stage)}</td>
								<td title="${esc(r.missing.join(", "))}">${readiness(r)}<span class="rd-cell-sub">${r.docsMandatory ? `${r.docsReceived}/${r.docsMandatory} received` : ""}</span></td>
								<td>${r.bgv ? badge(r.bgv) : '<span class="rd-cell-sub">—</span>'}</td>
								<td>${esc(r.owner || "—")}<span class="rd-cell-sub">${r.linkExpires && !r.submittedOn ? "expires " + fmt(r.linkExpires) : r.submittedOn ? "submitted " + fmt(r.submittedOn) : ""}</span></td>
								<td>${rowMenu([["Open onboarding", deskUrl("Employee Onboarding", r.name)]]
									.concat(r.applicant ? [["View candidate", deskUrl("Job Applicant", r.applicant)], ["Background verification", listUrl("Background Verification", { job_applicant: r.applicant })]] : [])
									.concat(r.offer ? [["View job offer", deskUrl("Job Offer", r.offer)]] : [])
									.concat(r.employee ? [["Employee record", deskUrl("Employee", r.employee)]] : []))}</td></tr>`).join("")
								: `<tr><td colspan="7"><div class="rd-empty"><b>No onboarding cases in this view</b></div></td></tr>`}
						</tbody></table></div>
						<div class="rd-pager">${n(d.total)} case(s) · Stage comes from the onboarding portal: link sent → candidate submitted → mandatory documents received by HR</div>
					</section>
					<div class="rd-stack">
						<section class="rd-card"><div class="rd-card-head"><div><h3>Where onboarding is waiting</h3><p>All cases by portal stage</p></div></div>
							<div class="rd-card-body"><div class="rd-list">${["Link not sent", "Link expired", "Awaiting candidate", "Documents pending", "Ready for HR", "Completed"].map((k) =>
								`<div class="rd-li"><div class="rd-li-main">${badge(k)}</div><b class="rd-num">${n(st[k] || 0)}</b></div>`).join("")}</div>
							<div class="rd-defn">Completion rate ${d.completionRate == null ? "—" : d.completionRate + "%"} (completed ÷ all onboarding records) · average ${d.avgDaysToComplete == null ? "—" : d.avgDaysToComplete + " days"} from creation to completion</div></div></section>
						<section class="rd-card"><div class="rd-card-head"><div><h3>Most-missing documents</h3><p>Mandatory, not yet received by HR (active cases)</p></div></div>
							<div class="rd-card-body"><div class="rd-list">${d.missingDocuments.length ? d.missingDocuments.map((m) =>
								`<div class="rd-li"><div class="rd-li-main"><span class="rd-li-title">${esc(m.document)}</span></div><b class="rd-num">${n(m.count)}</b></div>`).join("")
								: '<div class="rd-empty"><b>No missing documents</b></div>'}</div></div></section>
						<section class="rd-card"><div class="rd-card-head"><div><h3>Background verification</h3><p>Linked to these onboarding cases</p></div>
							<a class="rd-link" href="${listUrl("Background Verification")}">All</a></div>
							<div class="rd-card-body"><div class="rd-list">${["Pending", "In Progress", "Flagged", "Cleared"].map((k) =>
								`<a class="rd-li" href="${listUrl("Background Verification", { status: k })}"><div class="rd-li-main">${badge(k)}</div><b class="rd-num">${n(d.bgv[k] || 0)}</b></a>`).join("")}</div></div></section>
					</div>
				</div>`;
			main().querySelectorAll("[data-seg]").forEach((b) => (b.onclick = () => { state.onboarding.segment = b.dataset.seg; loadTab(); }));
			main().querySelectorAll("tbody a, .rd-kebab").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
		});
	}

	// ── analytics ────────────────────────────────────────────────────────────
	function loadAnalytics() {
		return api("get_analytics", filterArgs(), "analytics").then((a) => {
			const oa = a.offerAcceptance, tth = a.timeToHire;
			main().innerHTML = `
				<div class="rd-head"><h2>Recruitment &amp; Onboarding Analytics</h2><span class="rd-pill">${esc(fmt(state.from))} – ${esc(fmt(state.to))}</span></div>
				<div class="rd-metrics" style="margin-bottom:16px">
					<div class="rd-metric"><small>Offer acceptance rate</small><b class="rd-num">${oa.rate == null ? "—" : oa.rate + "%"}</b><small>${oa.accepted} of ${oa.responded} answered in period</small></div>
					<div class="rd-metric"><small>Average time to hire</small><b class="rd-num">${tth.avg == null ? "—" : tth.avg + " d"}</b><small>application → offer accepted · ${tth.count} hires${tth.count ? ` · ${tth.min}–${tth.max} d` : ""}</small></div>
					<div class="rd-metric"><small>Applications in period</small><b class="rd-num">${n(a.daily.reduce((s, x) => s + x.count, 0))}</b><small>${esc(fmt(state.from))} – ${esc(fmt(state.to))}</small></div>
					<div class="rd-metric"><small>Interviewers with decisions pending</small><b class="rd-num">${n(a.workload.filter((w) => w.feedbackPending).length)}</b><small>of ${a.workload.length} on panels in period</small></div>
				</div>
				<div class="rd-grid cols-2e">
					${chartCard("ch-trend", "Applications received", "Last 12 months · click a bar for that month", "")}
					${chartCard("ch-daily", "Applications per day", "Selected period", "")}
					${chartCard("ch-opening", "Applications by open position", "All-time · click to open the applicants", "")}
					${chartCard("ch-dept", "Open job openings by department", "Now · click to filter openings", "is-small")}
					${chartCard("ch-channel", "How they applied", "QR code / shared link (walk-ins) / careers site / added by HR · click to open", "is-small")}
					${chartCard("ch-source", "Where applicants come from", "Applicant Source, selected period", "is-small")}
					${chartCard("ch-aging", "Screening backlog by age", "In Review applicants, days since applying · click to review", "is-small")}
					${chartCard("ch-onb", "Onboarding completed", "Last 12 months", "is-small")}
					${chartCard("ch-bottle", "Onboarding waiting at", "Active cases by portal stage · click to open", "is-small")}
				</div>
				<div class="rd-section-gap"></div>
				<section class="rd-card"><div class="rd-card-head"><div><h3>Interviewer workload</h3>
					<p>Interview panels in the selected period. Job Openings have no recruiter field, so workload is shown per interviewer.</p></div></div>
					<div class="rd-table-wrap"><table class="rd-table"><thead><tr><th>INTERVIEWER</th><th class="num">INTERVIEWS (PERIOD)</th><th class="num">UPCOMING</th>
						<th class="num">DECISION PENDING</th></tr></thead><tbody>
						${a.workload.length ? a.workload.map((w) => `<tr onclick="location.href='${listUrl("Interview Feedback", { interviewer: w.user })}'">
							<td><span class="rd-cell-title">${esc(w.name)}</span><span class="rd-cell-sub">${esc(w.user)}</span></td>
							<td class="num">${n(w.interviews)}</td><td class="num">${n(w.upcoming)}</td>
							<td class="num">${w.feedbackPending ? `<span class="rd-badge is-bad">${w.feedbackPending}</span>` : "0"}</td></tr>`).join("")
							: `<tr><td colspan="4"><div class="rd-empty"><b>No interviews in this period</b></div></td></tr>`}</tbody></table></div></section>`;
			const brand = BRAND();
			const months = a.monthly;
			chart("ch-trend", { type: "bar", data: { labels: months.map((m) => m.label), datasets: [{ data: months.map((m) => m.count), backgroundColor: brand, borderRadius: 5 }] },
				options: baseOpts((i) => { const t = new Date(); const d = new Date(t.getFullYear(), t.getMonth() - (11 - i), 1);
					Object.assign(state, { from: ymd(d), to: ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)), preset: "custom" });
					syncFilterInputs(); state.tabCounts = null; go({ tab: "applicants" }); }) });
			chart("ch-daily", { type: "line", data: { labels: a.daily.map((d) => fmt(d.label, { day: "numeric", month: "short" })),
				datasets: [{ data: a.daily.map((d) => d.count), borderColor: brand, backgroundColor: brand + "22", fill: true, tension: .35, pointRadius: 2 }] }, options: baseOpts() });
			chart("ch-opening", { type: "bar", data: { labels: a.byOpening.map((o) => o.label), datasets: [{ data: a.byOpening.map((o) => o.count), backgroundColor: brand, borderRadius: 5 }] },
				options: { ...baseOpts((i) => go({ tab: "applicants", opening: a.byOpening[i].name })), indexAxis: "y" } });
			chart("ch-dept", { type: "doughnut", data: { labels: a.byDepartment.map((d) => d.label), datasets: [{ data: a.byDepartment.map((d) => d.count), backgroundColor: PALETTE }] },
				options: pieOpts((i) => { state.department = a.byDepartment[i].label === "No department" ? "" : a.byDepartment[i].label; syncFilterInputs(); renderChips(); go({ tab: "openings", status: "Open" }); }) });
			chart("ch-channel", { type: "doughnut", data: { labels: a.channels.map((d) => d.label), datasets: [{ data: a.channels.map((d) => d.count), backgroundColor: PALETTE }] },
				options: pieOpts((i) => go({ tab: "applicants", channel: a.channels[i].label })) });
			chart("ch-source", { type: "doughnut", data: { labels: a.sources.map((d) => d.label), datasets: [{ data: a.sources.map((d) => d.count), backgroundColor: PALETTE }] }, options: pieOpts() });
			chart("ch-aging", { type: "bar", data: { labels: a.reviewAging.map((d) => d.label), datasets: [{ data: a.reviewAging.map((d) => d.count),
				backgroundColor: ["#2f9e44", "#5c7cfa", "#e8890c", "#e8590c", "#d6383a"], borderRadius: 5 }] },
				options: baseOpts((i) => go({ tab: "applicants", stage: "In Review", allTime: 1, aging: i >= 2 ? 1 : 0 })) });
			chart("ch-onb", { type: "bar", data: { labels: a.onboardingMonthly.map((m) => m.label), datasets: [{ data: a.onboardingMonthly.map((m) => m.count), backgroundColor: "#2f9e44", borderRadius: 5 }] }, options: baseOpts() });
			const segOf = { "Link not sent": "not_sent", "Link expired": "expired", "Documents pending": "documents" };
			chart("ch-bottle", { type: "bar", data: { labels: a.bottlenecks.map((b) => b.label), datasets: [{ data: a.bottlenecks.map((b) => b.count), backgroundColor: "#e8890c", borderRadius: 5 }] },
				options: { ...baseOpts((i) => go({ tab: "onboarding", segment: segOf[a.bottlenecks[i].label] || "active" })), indexAxis: "y" } });
		});
	}
	function chartCard(id, title, sub, cls) {
		return `<section class="rd-card"><div class="rd-card-head"><div><h3>${title}</h3><p>${sub}</p></div></div>
			<div class="rd-card-body"><div class="rd-chart ${cls}"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div></div></section>`;
	}
	function baseOpts(onClick) {
		return { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
			scales: { x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
			onClick: onClick ? (e, els) => els.length && onClick(els[0].index) : undefined,
			onHover: onClick ? (e, els) => (e.native.target.style.cursor = els.length ? "pointer" : "default") : undefined };
	}
	function pieOpts(onClick) {
		return { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "right", labels: { boxWidth: 10, usePointStyle: true } } },
			onClick: onClick ? (e, els) => els.length && onClick(els[0].index) : undefined };
	}
	function syncFilterInputs() {
		const $ = (id) => document.getElementById(id);
		$("rd-preset").value = state.preset; $("rd-custom").hidden = state.preset !== "custom";
		$("rd-from").value = state.from; $("rd-to").value = state.to; $("rd-company").value = state.company; $("rd-dept").value = state.department;
		store.set("filters", { preset: state.preset, from: state.from, to: state.to, company: state.company, department: state.department });
	}

	// ── drawers ──────────────────────────────────────────────────────────────
	let lastFocus = null;
	function closeDrawer() {
		document.querySelectorAll(".rd-drawer, .rd-scrim").forEach((e) => e.remove());
		if (lastFocus) lastFocus.focus();
	}
	function openDrawer(doctype, name) {
		closeDrawer(); lastFocus = document.activeElement;
		const scrim = document.createElement("div"); scrim.className = "rd-scrim"; scrim.onclick = closeDrawer;
		const d = document.createElement("aside"); d.className = "rd-drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
		d.innerHTML = `<div class="rd-drawer-head"><div><h3>${esc(name)}</h3><p>${esc(doctype)}</p></div>
			<button class="rd-btn rd-close" aria-label="Close">${I.x}</button></div><div class="rd-drawer-body"><div class="rd-skel" style="height:240px"></div></div>`;
		document.body.append(scrim, d);
		d.querySelector(".rd-close").onclick = closeDrawer;
		d.querySelector(".rd-close").focus();
		const body = d.querySelector(".rd-drawer-body"), head = d.querySelector(".rd-drawer-head > div");
		const p = doctype === "Job Applicant" ? api("get_applicant", { name }, "drawer").then((a) => applicantDrawer(a, head, body))
			: api("get_opening", { name }, "drawer").then((o) => openingDrawer(o, head, body));
		p.catch((e) => { if (!aborted(e)) body.innerHTML = errorBox(e.message, state.tab); });
	}
	const dl = (pairs) => `<dl class="rd-dl">${pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v == null || v === "" ? "—" : v}</dd>`).join("")}</dl>`;

	function applicantDrawer(a, head, body) {
		head.innerHTML = `<h3>${esc(a.applicantName || a.name)}</h3><p>${badge(a.stage)} &nbsp;${esc(a.name)}</p>`;
		const steps = [
			["Applied", fmt(a.applied), true],
			["Interviews", a.interviews.length ? `${a.interviews.length} round(s)` : "not started", a.interviews.length > 0],
			["Offer", a.offer ? a.offer.status : "—", !!a.offer && a.offer.status === "Accepted"],
			["Onboarding", a.onboarding ? a.onboarding.status : "—", !!a.onboarding && a.onboarding.status === "Completed"],
			["Employee", a.employee ? a.employee.name : "—", !!a.employee],
		];
		const actions = [`<a class="rd-btn is-primary" href="${deskUrl("Job Applicant", a.name)}">Open full profile ${I.ext}</a>`];
		if (a.resume) actions.push(`<a class="rd-btn" href="${esc(a.resume)}" target="_blank" rel="noopener">View resume</a>`);
		if (["In Review", "Interviewing", "Selected"].includes(a.stage)) actions.push(`<a class="rd-btn" href="${newUrl("Interview", { job_applicant: a.name, job_opening: a.opening })}">Schedule interview</a>`);
		if (a.stage === "Selected" && !a.offer) actions.push(`<a class="rd-btn" href="${newUrl("Job Offer", { job_applicant: a.name })}">Create offer</a>`);
		if (a.offer) actions.push(`<a class="rd-btn" href="${deskUrl("Job Offer", a.offer.name)}">${a.offer.status === "Draft" ? "Review draft offer" : "View offer"}</a>`);
		if (a.offer && a.offer.status === "Accepted" && !a.onboarding) actions.push(`<a class="rd-btn" href="${newUrl("Employee Onboarding", { job_applicant: a.name, job_offer: a.offer.name })}">Start onboarding</a>`);
		if (a.onboarding) actions.push(`<a class="rd-btn" href="${deskUrl("Employee Onboarding", a.onboarding.name)}">Onboarding</a>`);
		body.innerHTML = `
			<div class="rd-drawer-actions">${actions.join("")}</div>
			${a.nextAction ? `<div class="rd-error" style="background:var(--brand-soft);color:var(--brand-ink);margin-top:0"><b>Next:</b> ${esc(a.nextAction)}</div>` : ""}
			<div class="rd-h4">CONTACT &amp; APPLICATION</div>
			${dl([["Email", a.email ? `<a class="rd-link" href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : ""], ["Phone", esc(a.phone)],
				["Applied for", a.opening ? `<a class="rd-link" href="${deskUrl("Job Opening", a.opening)}">${esc(a.openingTitle)}</a>` : ""],
				["Department", esc(a.department)], ["Applied on", fmt(a.applied)], ["Applicant status", badge(a.status)], ["Source", esc(a.source)],
				["Referred by", a.reference ? esc(`${a.reference.name || ""} ${a.reference.code ? "(" + a.reference.code + ")" : ""}`) : undefined]])}
			<div class="rd-h4">JOURNEY</div>
			<ul class="rd-timeline">${steps.map(([k, v, done]) => `<li class="${done ? "is-done" : ""}"><b>${k}</b> · <span class="rd-cell-sub" style="display:inline">${esc(v)}</span></li>`).join("")}</ul>
			<div class="rd-h4">INTERVIEWS</div>
			${a.interviews.length ? a.interviews.map((iv) => `<div class="rd-card" style="padding:10px 12px;margin-bottom:8px">
				<div style="display:flex;gap:8px;align-items:center"><a class="rd-cell-title" href="${deskUrl("Interview", iv.name)}">${esc(iv.round || iv.name)}</a>${badge(iv.status)}
					<span class="rd-cell-sub" style="margin-left:auto">${fmt(iv.date)}</span></div>
				<div class="rd-cell-sub">Panel: ${esc(iv.interviewers.join(", ") || "—")}${iv.feedbackMissing ? ` · <span style="color:var(--warn)">${iv.feedbackMissing} feedback missing</span>` : ""}</div>
				${iv.feedback.map((f) => `<div style="margin-top:4px"><a href="${deskUrl("Interview Feedback", f.name)}">${esc(f.by)}</a> ${f.result ? badge(f.result) : ""} <span class="rd-cell-sub" style="display:inline">${f.rating}/5${f.draft ? " · draft" : ""}</span></div>`).join("")}
			</div>`).join("") : '<div class="rd-cell-sub">No interviews yet.</div>'}
			${a.offer ? `<div class="rd-h4">OFFER</div>${dl([["Offer", `<a class="rd-link" href="${deskUrl("Job Offer", a.offer.name)}">${esc(a.offer.name)}</a>`], ["Status", badge(a.offer.status)], ["Joining date", fmt(a.offer.joining)]])}` : ""}
			${a.onboarding ? `<div class="rd-h4">ONBOARDING</div>${dl([["Record", `<a class="rd-link" href="${deskUrl("Employee Onboarding", a.onboarding.name)}">${esc(a.onboarding.name)}</a>`],
				["Status", badge(a.onboarding.status)], ["Portal", a.onboarding.submitted ? "Candidate submitted" : a.onboarding.linkSent ? "Link sent, waiting" : "Link not sent"],
				["Joining", fmt(a.onboarding.joining)]])}` : ""}
			${a.bgv ? `<div class="rd-h4">BACKGROUND VERIFICATION</div>${dl([["Record", `<a class="rd-link" href="${deskUrl("Background Verification", a.bgv.name)}">${esc(a.bgv.name)}</a>`], ["Status", badge(a.bgv.status)]])}` : ""}
			${a.employee ? `<div class="rd-h4">EMPLOYEE</div>${dl([["Employee", `<a class="rd-link" href="${deskUrl("Employee", a.employee.name)}">${esc(a.employee.name)} · ${esc(a.employee.employee_name)}</a>`], ["Status", esc(a.employee.status)]])}` : ""}`;
	}

	function openingDrawer(o, head, body) {
		head.innerHTML = `<h3>${esc(o.title)}</h3><p>${badge(o.status)} &nbsp;${esc(o.name)}</p>`;
		const dist = [["In Review", o.inReview], ["Interviewing", o.interviewing], ["Selected", o.selected], ["Offer Released", o.offers],
			["Offer Accepted", o.accepted], ["Joined", o.joined], ["On Hold", o.onHold], ["Rejected", o.rejected]];
		const max = Math.max(1, ...dist.map((x) => x[1]));
		body.innerHTML = `
			<div class="rd-drawer-actions">
				<a class="rd-btn is-primary" href="${deskUrl("Job Opening", o.name)}">Open job opening ${I.ext}</a>
				<a class="rd-btn" href="#" data-go='${esc(JSON.stringify({ tab: "applicants", opening: o.name }))}'>All ${n(o.applicants)} applicants</a>
				<a class="rd-btn" href="${newUrl("Job Applicant", { job_title: o.name })}">Add applicant</a>
				<a class="rd-btn" href="${newUrl("Interview", { job_opening: o.name })}">Schedule interview</a>
			</div>
			${dl([["Department", esc(o.department)], ["Location", esc(o.location)], ["Designation", esc(o.designation)], ["Employment type", esc(o.employmentType)],
				["Company", esc(o.company)], ["Vacancies", n(o.vacancies || null)], ["Posted", fmt(o.postedOn)], ["Closes", fmt(o.closesOn)],
				["Days open", o.daysOpen == null ? "—" : n(o.daysOpen)]])}
			<div class="rd-h4">APPLICANTS BY STAGE</div>
			<div class="rd-funnel">${dist.map(([k, v]) => `<a class="rd-fstep" style="grid-template-columns:120px minmax(0,1fr) 40px" href="#" data-go='${esc(JSON.stringify({ tab: "applicants", opening: o.name, stage: k }))}'>
				<span class="rd-fname">${k}</span><span class="rd-fbar"><span style="width:${Math.max(3, (100 * v) / max)}%"></span></span><span class="rd-fcount rd-num">${n(v)}</span></a>`).join("")}</div>
			<div class="rd-h4">RECENT APPLICANTS</div>
			<div class="rd-list">${o.recentApplicants.length ? o.recentApplicants.map((a) => `<div class="rd-li"><span class="rd-avatar">${esc(initials(a.applicantName))}</span>
				<div class="rd-li-main"><a class="rd-li-title" href="${deskUrl("Job Applicant", a.name)}" data-drawer="Job Applicant" data-name="${esc(a.name)}">${esc(a.applicantName || a.name)}</a>
				<div class="rd-li-sub">applied ${fmt(a.applied)}</div></div>${badge(a.status)}</div>`).join("") : '<div class="rd-cell-sub">No applicants yet.</div>'}</div>
			<div class="rd-h4">UPCOMING INTERVIEWS</div>
			<div class="rd-list">${o.upcomingInterviews.length ? o.upcomingInterviews.map((i) => `<div class="rd-li"><span class="rd-date"><b>${fmt(i.date, { day: "numeric" })}</b><small>${fmt(i.date, { month: "short" })}</small></span>
				<div class="rd-li-main"><a class="rd-li-title" href="${deskUrl("Interview", i.name)}">${esc(i.applicant)} · ${esc(i.round || "")}</a><div class="rd-li-sub">${esc(i.time)}</div></div></div>`).join("")
				: '<div class="rd-cell-sub">None scheduled.</div>'}</div>
			<div class="rd-h4">OFFERS</div>
			<div class="rd-list">${o.offers.length ? o.offers.map((x) => `<div class="rd-li"><div class="rd-li-main"><a class="rd-li-title" href="${deskUrl("Job Offer", x.name)}">${esc(x.applicantName)}</a>
				<div class="rd-li-sub">joining ${fmt(x.joining)}</div></div>${badge(x.status)}</div>`).join("") : '<div class="rd-cell-sub">No offers yet.</div>'}</div>
			${o.description ? `<div class="rd-h4">DESCRIPTION</div><div class="rd-cell-sub" style="white-space:pre-line">${esc(o.description)}…</div>` : ""}`;
		body.querySelectorAll("[data-go]").forEach((g) => g.addEventListener("click", () => closeDrawer()));
		body.querySelectorAll("[data-drawer]").forEach((g) => g.addEventListener("click", (e) => { if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); openDrawer(g.dataset.drawer, g.dataset.name); } }));
	}

	function toast(msg) {
		document.querySelectorAll(".rd-toast").forEach((t) => t.remove());
		const t = document.createElement("div"); t.className = "rd-toast"; t.setAttribute("role", "status"); t.textContent = msg;
		document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
	}

	// ── boot ─────────────────────────────────────────────────────────────────
	renderShell();
	renderChips();
	api("get_filter_options", {}, "options").then((o) => {
		document.getElementById("rd-company").innerHTML = '<option value="">All companies</option>' + o.companies.map((c) => `<option ${c === state.company ? "selected" : ""}>${esc(c)}</option>`).join("");
		document.getElementById("rd-dept").innerHTML = '<option value="">All departments</option>' + o.departments.map((c) => `<option ${c === state.department ? "selected" : ""}>${esc(c)}</option>`).join("");
		document.getElementById("rd-user").textContent = o.user;
	}).catch((e) => { if (!aborted(e)) main().innerHTML = errorBox(e.message, "overview"); });
	if (location.hash.slice(1) !== state.tab) history.replaceState(null, "", "#" + state.tab);
	loadTab(true);
})();
