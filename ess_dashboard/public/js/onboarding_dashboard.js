(function () {
	"use strict";

	// ---- helpers (same conventions as admin_dashboard.js) ----

	function formatDate(iso, opts) {
		if (!iso) return "—";
		var d = new Date(iso);
		if (isNaN(d.getTime())) return iso;
		return d.toLocaleDateString("en-IN", opts || { day: "2-digit", month: "short", year: "numeric" });
	}
	function escapeHtml(s) {
		var div = document.createElement("div");
		div.textContent = s == null ? "" : String(s);
		return div.innerHTML;
	}
	function daysAway(iso) {
		if (!iso) return null;
		var target = new Date(iso + "T00:00:00");
		var now = new Date();
		now.setHours(0, 0, 0, 0);
		return Math.round((target - now) / 86400000);
	}

	// ---- icons ----
	var ICONS = {
		home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1.2-3.6 3.8-5.4 6.5-5.4s5.3 1.8 6.5 5.4" stroke-linecap="round"/><circle cx="17" cy="8.5" r="2.6"/><path d="M15.5 14.8c2.2.3 4 1.9 5 4.9" stroke-linecap="round"/></svg>',
		clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 17l5-5 4 4 8-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h5v5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 14.5 14.5 9.5" stroke-linecap="round"/><path d="M11 7.5 13 5.5a3.5 3.5 0 0 1 5 5l-2 2" stroke-linecap="round"/><path d="M13 16.5 11 18.5a3.5 3.5 0 0 1-5-5l2-2" stroke-linecap="round"/></svg>',
		alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3.5 2.5 20h19L12 3.5Z" stroke-linejoin="round"/><path d="M12 10v4" stroke-linecap="round"/><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none"/></svg>',
		doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke-linejoin="round"/><path d="M14 3v5h5" stroke-linejoin="round"/></svg>',
		calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke-linecap="round"/></svg>',
	};

	var STATUS_COLOR = { Pending: "#c78a2e", "In Process": "#646dc4", Completed: "#327b65" };

	// ---- state ----
	var state = { data: null };
	var statusChartInstance = null;
	var trendChartInstance = null;

	function root() { return document.getElementById("app"); }

	function renderError(message) {
		root().innerHTML =
			'<div class="ess-error"><h2>Couldn’t load the onboarding dashboard</h2><p>' + escapeHtml(message) + "</p></div>";
	}

	// ---- section renderers ----

	function renderHero() {
		return (
			'<div class="ess-hero">' +
			'<a href="/app/hrms-home" class="ess-home-btn" title="Back to HRMS Home">' +
			ICONS.home + "<span>HRMS Home</span></a>" +
			'<img src="/files/om_logo.svg" alt="OM One" class="ess-hero-logo">' +
			'<p class="ess-hero-title">Onboarding Dashboard</p>' +
			"</div>"
		);
	}

	function renderPageHeading() {
		var today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
		return '<div class="ess-page-heading"><h2>Candidate onboarding pipeline</h2><p>' + today + "</p></div>";
	}

	function renderKpis(d) {
		var k = d.kpis;
		var items = [
			{ label: "Total Onboardings", value: k.total, hint: "All time", icon: ICONS.pipeline, tone: "indigo" },
			{ label: "In Progress", value: k.inProgress, hint: "Pending or in process", icon: ICONS.clock, tone: "amber" },
			{ label: "Completed This Month", value: k.completedThisMonth, hint: "Boarding status: Completed", icon: ICONS.check, tone: "emerald" },
			{
				label: "Avg. Days to Complete",
				value: k.avgDaysToComplete == null ? "—" : k.avgDaysToComplete,
				hint: "From creation to completion",
				icon: ICONS.trend,
				tone: "violet",
			},
		];
		return (
			'<div class="ess-kpi-grid">' +
			items.map(function (it) {
				return (
					'<div class="ess-kpi"><div class="ess-kpi-top"><span class="ess-kpi-label">' + it.label + '</span>' +
					'<div class="ess-kpi-icon tone-' + it.tone + '">' + it.icon + "</div></div>" +
					'<div class="ess-kpi-value">' + it.value + '</div><div class="ess-kpi-hint">' + it.hint + "</div></div>"
				);
			}).join("") +
			"</div>"
		);
	}

	function renderStatusChartCard(d) {
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Status Breakdown</h3><p>All onboardings, all time</p></div></div>' +
			'<div class="ess-card-body"><div class="admin-chart-wrap" style="height:240px"><canvas id="statusChart"></canvas></div></div></div>'
		);
	}

	function renderTrendChartCard() {
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Onboardings Started</h3><p>Last 12 months</p></div></div>' +
			'<div class="ess-card-body"><div class="admin-chart-wrap" style="height:240px"><canvas id="trendChart"></canvas></div></div></div>'
		);
	}

	function renderNameCell(r) {
		return (
			'<a href="/app/employee-onboarding/' + encodeURIComponent(r.name) + '" target="_blank">' +
			escapeHtml(r.employee || r.name) + "</a>" +
			(r.designation ? '<div class="admin-event-extra" style="margin-top:2px">' + escapeHtml(r.designation) + "</div>" : "")
		);
	}

	function renderAwaitingLinkCard(d) {
		var rows = d.awaitingLink.length
			? d.awaitingLink.map(function (r) {
				return "<tr><td>" + renderNameCell(r) + "</td><td>" + escapeHtml(r.department || "—") + "</td></tr>";
			}).join("")
			: '<tr><td colspan="2" class="ess-table-empty">Nobody waiting 🎉</td></tr>';
		var subtitle = d.awaitingLinkTotal > d.awaitingLink.length
			? "Showing " + d.awaitingLink.length + " of " + d.awaitingLinkTotal + " waiting"
			: d.awaitingLinkTotal + " waiting";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + ICONS.link + " Awaiting Portal Link</h3><p>" + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Candidate</th><th>Department</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderNeedsResendCard(d) {
		var rows = d.needsResend.length
			? d.needsResend.map(function (r) {
				return "<tr><td>" + renderNameCell(r) + "</td><td>" + formatDate(r.expiresOn) + "</td></tr>";
			}).join("")
			: '<tr><td colspan="2" class="ess-table-empty">No expired links 🎉</td></tr>';
		var subtitle = d.needsResendTotal > d.needsResend.length
			? "Showing " + d.needsResend.length + " of " + d.needsResendTotal + " expired"
			: d.needsResendTotal + " expired";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + ICONS.alert + " Link Expired — Needs Resend</h3><p>" + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Candidate</th><th>Expired On</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderPendingHrReviewCard(d) {
		var rows = d.pendingHrReview.length
			? d.pendingHrReview.map(function (r) {
				return (
					"<tr><td>" + renderNameCell(r) + "</td><td>" + formatDate(r.submittedOn) + "</td>" +
					"<td>" + r.missingCount + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">Nothing pending 🎉</td></tr>';
		var subtitle = d.pendingHrReviewTotal > d.pendingHrReview.length
			? "Showing " + d.pendingHrReview.length + " of " + d.pendingHrReviewTotal + " waiting on HR"
			: d.pendingHrReviewTotal + " waiting on HR";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + ICONS.doc + " Documents Pending HR Review</h3><p>" + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Candidate</th><th>Submitted</th><th>Missing Docs</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderUpcomingJoinersCard(d) {
		var rows = d.upcomingJoiners.length
			? d.upcomingJoiners.map(function (r) {
				var away = daysAway(r.boardingBeginsOn);
				var whenLabel = away === 0 ? "Today" : away === 1 ? "Tomorrow" : away + " days";
				return (
					"<tr><td>" + renderNameCell(r) + "</td><td>" + formatDate(r.boardingBeginsOn) + "</td>" +
					"<td>" + whenLabel + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">No joiners in the next 14 days</td></tr>';
		var subtitle = d.upcomingJoinersTotal > d.upcomingJoiners.length
			? "Showing " + d.upcomingJoiners.length + " of " + d.upcomingJoinersTotal
			: "Next 14 days";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + ICONS.calendar + " Upcoming Joiners</h3><p>" + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Candidate</th><th>Joining</th><th>In</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderRecentlyCompletedCard(d) {
		var rows = d.recentlyCompleted.length
			? d.recentlyCompleted.map(function (r) {
				return (
					"<tr><td>" + renderNameCell(r) + "</td><td>" + escapeHtml(r.department || "—") + "</td>" +
					"<td>" + formatDate(r.completedOn) + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">None yet</td></tr>';
		var subtitle = d.recentlyCompletedTotal > d.recentlyCompleted.length
			? "Showing " + d.recentlyCompleted.length + " most recent of " + d.recentlyCompletedTotal
			: d.recentlyCompletedTotal + " completed";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + ICONS.check + " Recently Completed</h3><p>" + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Candidate</th><th>Department</th><th>Completed On</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function drawStatusChart(rows) {
		var ctx = document.getElementById("statusChart");
		if (!ctx || !window.Chart) return;
		if (statusChartInstance) statusChartInstance.destroy();
		statusChartInstance = new Chart(ctx, {
			type: "doughnut",
			data: {
				labels: rows.map(function (r) { return r.status; }),
				datasets: [{
					data: rows.map(function (r) { return r.count; }),
					backgroundColor: rows.map(function (r) { return STATUS_COLOR[r.status] || "#94a3b8"; }),
					borderWidth: 0,
				}],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: "62%",
				plugins: { legend: { position: "bottom", labels: { font: { size: 12, weight: "600" }, color: "#334155", boxWidth: 10, padding: 14 } } },
			},
		});
	}

	function drawTrendChart(rows) {
		var ctx = document.getElementById("trendChart");
		if (!ctx || !window.Chart) return;
		if (trendChartInstance) trendChartInstance.destroy();
		trendChartInstance = new Chart(ctx, {
			type: "bar",
			data: {
				labels: rows.map(function (r) { return r.month; }),
				datasets: [{
					label: "Onboardings",
					data: rows.map(function (r) { return r.count; }),
					backgroundColor: "#646dc4",
					borderRadius: 6,
					maxBarThickness: 28,
				}],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: {
					x: { grid: { display: false }, ticks: { font: { size: 11, weight: "600" }, color: "#334155" } },
					y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 12, weight: "600" }, color: "#334155", precision: 0 } },
				},
			},
		});
	}

	// ---- main render ----
	function renderPage(d) {
		return (
			renderPageHeading() +
			renderKpis(d) +
			'<div class="ess-two-col">' + renderStatusChartCard(d) + renderTrendChartCard() + "</div>" +
			'<div class="admin-two-col-even">' + renderAwaitingLinkCard(d) + renderNeedsResendCard(d) + "</div>" +
			'<div class="admin-two-col-even">' + renderPendingHrReviewCard(d) + renderUpcomingJoinersCard(d) + "</div>" +
			renderRecentlyCompletedCard(d)
		);
	}

	function render() {
		var d = state.data;
		var html =
			'<div class="ess-shell">' +
			renderHero() +
			'<div class="ess-content-outer"><div class="ess-content">' + renderPage(d) + "</div></div>" +
			"</div>";

		root().innerHTML = html;
		drawStatusChart(d.statusBreakdown);
		drawTrendChart(d.monthlyTrend);
	}

	// ---- boot ----
	function boot() {
		fetch("/api/method/ess_dashboard.api.onboarding_dashboard.get_onboarding_dashboard_data", {
			method: "GET",
			credentials: "same-origin",
			headers: { "X-Frappe-CSRF-Token": window.csrf_token || "" },
		})
			.then(function (res) {
				if (!res.ok) {
					return res.json().catch(function () { return {}; }).then(function (body) {
						throw new Error((body && body.exc_type) || "Request failed (" + res.status + ")");
					});
				}
				return res.json();
			})
			.then(function (body) {
				state.data = body.message;
				render();
			})
			.catch(function (err) {
				var msg = /PermissionError/.test(err.message || "")
					? "You don’t have access to this dashboard. It’s limited to HR Manager / System Manager."
					: (err.message || "Something went wrong loading the dashboard. Please refresh.");
				renderError(msg);
			});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
