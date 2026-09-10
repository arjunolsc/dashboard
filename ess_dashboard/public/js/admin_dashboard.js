(function () {
	"use strict";

	// ---- helpers (same conventions as dashboard.js) ----

	function formatCurrency(v) {
		if (v === null || v === undefined) return "—";
		return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);
	}
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

	// ---- icons ----
	var ICONS = {
		home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c1.2-3.6 3.8-5.4 6.5-5.4s5.3 1.8 6.5 5.4" stroke-linecap="round"/><circle cx="17" cy="8.5" r="2.6"/><path d="M15.5 14.8c2.2.3 4 1.9 5 4.9" stroke-linecap="round"/></svg>',
		userPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c1.4-4 4.6-6 7-6s5.6 2 7 6" stroke-linecap="round"/><path d="M18 8v5M15.5 10.5h5" stroke-linecap="round"/></svg>',
		check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15 14h3" stroke-linecap="round"/></svg>',
		cake: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 21h20M7 12V8M12 12V8M17 12V8" stroke-linecap="round"/><path d="M7 4.5c0-1 .8-1.5.8-2.5M12 4.5c0-1 .8-1.5.8-2.5M17 4.5c0-1 .8-1.5.8-2.5" stroke-linecap="round"/><path d="M4 17h16" stroke-linecap="round"/></svg>',
		badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.7 7 5.2-2.8 5.2 2.8-1.7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	};

	// A single calm tone reads as one clean list, not a rainbow of
	// unrelated categories - department identity is already carried by
	// the row label, a color per bar would just add visual noise. Same
	// softened indigo as --indigo-600 in dashboard.css (Chart.js needs a
	// literal hex, it can't read CSS custom properties).
	var DEPT_COLOR = "#646dc4";

	// ---- state ----
	var state = { data: null };
	var deptChartInstance = null;

	function root() { return document.getElementById("app"); }

	function renderError(message) {
		root().innerHTML =
			'<div class="ess-error"><h2>Couldn’t load the admin dashboard</h2><p>' + escapeHtml(message) + "</p></div>";
	}

	// ---- section renderers ----

	function renderHero() {
		return (
			'<div class="ess-hero">' +
			'<a href="/app/hrms-home" class="ess-home-btn" title="Back to HRMS Home">' +
			ICONS.home + "<span>HRMS Home</span></a>" +
			'<img src="/files/om_logo.svg" alt="OM One" class="ess-hero-logo">' +
			'<p class="ess-hero-title">HR Admin Dashboard</p>' +
			"</div>"
		);
	}

	function renderPageHeading() {
		var today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
		return (
			'<div class="ess-page-heading"><h2>Company overview</h2><p>' + today + "</p></div>"
		);
	}

	function renderKpis(d) {
		var att = d.todayAttendance;
		var items = [
			{ label: "Active Employees", value: d.headcount.totalActive, hint: d.headcount.newJoinersThisMonth + " joined this month", icon: ICONS.users, tone: "indigo" },
			{ label: "Present Today", value: att.present, hint: att.unmarked + " not yet marked", icon: ICONS.check, tone: "emerald" },
			{ label: "Pending Leave Approvals", value: d.pendingLeavesTotal, hint: "Awaiting action", icon: ICONS.clock, tone: "amber" },
			{ label: "Pending Expense Claims", value: d.pendingExpensesTotal, hint: "Awaiting approval", icon: ICONS.wallet, tone: "rose" },
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

	function renderAttendanceTodayCard(d) {
		var att = d.todayAttendance;
		var rows = [
			{ label: "Present", value: att.present, color: "#327b65" },
			{ label: "Absent", value: att.absent, color: "#c0596a" },
			{ label: "On Leave", value: att.onLeave, color: "#4486a7" },
			{ label: "Half Day", value: att.halfDay, color: "#a67330" },
			{ label: "Week Off", value: att.weekOff, color: "#94a3b8" },
			{ label: "Holiday", value: att.holiday, color: "#886ec4" },
			{ label: "Not marked", value: att.unmarked, color: "#e2e8f0" },
		].filter(function (r) { return r.value > 0; });

		var total = rows.reduce(function (s, r) { return s + r.value; }, 0) || 1;

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Today’s Attendance</h3><p>Across all active employees</p></div></div>' +
			'<div class="ess-card-body">' +
			'<div class="admin-attendance-bar">' + rows.map(function (r) {
				return '<span style="width:' + ((r.value / total) * 100).toFixed(2) + '%;background:' + r.color + '" title="' + r.label + ': ' + r.value + '"></span>';
			}).join("") + "</div>" +
			'<div class="admin-attendance-legend">' + rows.map(function (r) {
				return (
					'<div class="admin-attendance-legend-item"><span class="admin-dot" style="background:' + r.color + '"></span>' +
					escapeHtml(r.label) + '<b>' + r.value + '</b></div>'
				);
			}).join("") + "</div>" +
			"</div></div>"
		);
	}

	function renderDepartmentCard(d) {
		var subtitle = d.departmentCountTotal > d.departmentHeadcount.length
			? "Top " + d.departmentHeadcount.length + " of " + d.departmentCountTotal + " departments"
			: d.departmentCountTotal + " departments";
		// Chart.js's default autoSkip hides every other y-axis label once
		// bars are packed tighter than it thinks text needs - with up to
		// 15 department names that meant only every other one showed. Give
		// each bar a fixed ~32px of height (autoSkip is turned off in
		// drawDepartmentChart) so all of them always fit and render.
		var chartHeight = Math.max(240, d.departmentHeadcount.length * 40);
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Headcount by Department</h3><p>' + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><div class="admin-chart-wrap" style="height:' + chartHeight + 'px"><canvas id="deptChart"></canvas></div></div></div>'
		);
	}

	function renderPendingLeavesCard(d) {
		var rows = d.pendingLeaves.length
			? d.pendingLeaves.map(function (l) {
				return (
					'<tr><td><a href="/app/leave-application/' + encodeURIComponent(l.name) + '" target="_blank">' + escapeHtml(l.employee) + "</a></td>" +
					"<td>" + escapeHtml(l.type) + "</td><td>" + formatDate(l.from) + " – " + formatDate(l.to) + "</td><td>" + l.days + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="4" class="ess-table-empty">Nothing pending 🎉</td></tr>';

		var subtitle = d.pendingLeavesTotal > d.pendingLeaves.length
			? "Showing " + d.pendingLeaves.length + " of " + d.pendingLeavesTotal + " waiting"
			: d.pendingLeavesTotal + " waiting";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Pending Leave Approvals</h3><p>' + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Employee</th><th>Type</th><th>Period</th><th>Days</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderPendingExpensesCard(d) {
		var rows = d.pendingExpenses.length
			? d.pendingExpenses.map(function (e) {
				return (
					'<tr><td><a href="/app/expense-claim/' + encodeURIComponent(e.name) + '" target="_blank">' + escapeHtml(e.employee) + "</a></td>" +
					"<td>" + formatDate(e.date) + "</td><td>" + formatCurrency(e.amount) + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">Nothing pending 🎉</td></tr>';

		var subtitle = d.pendingExpensesTotal > d.pendingExpenses.length
			? "Showing " + d.pendingExpenses.length + " of " + d.pendingExpensesTotal + " waiting"
			: d.pendingExpensesTotal + " waiting";
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Pending Expense Claims</h3><p>' + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Employee</th><th>Date</th><th>Amount</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderPendingRegularizationsCard(d) {
		var rows = d.pendingRegularizations.length
			? d.pendingRegularizations.map(function (r) {
				return (
					'<tr><td><a href="/app/attendance-regularization/' + encodeURIComponent(r.name) + '" target="_blank">' + escapeHtml(r.employee) + "</a></td>" +
					"<td>" + formatDate(r.date) + "</td><td>" + escapeHtml(r.type || "—") + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">Nothing pending 🎉</td></tr>';
		var subtitle = d.pendingRegularizationsTotal > d.pendingRegularizations.length
			? "Showing " + d.pendingRegularizations.length + " of " + d.pendingRegularizationsTotal + " waiting"
			: d.pendingRegularizationsTotal + " waiting";

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Pending Attendance Regularization</h3><p>' + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Employee</th><th>Date</th><th>Type</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderPendingClearancesCard(d) {
		var rows = d.pendingClearances.length
			? d.pendingClearances.map(function (c) {
				return (
					'<tr><td><a href="/app/employee-separation/' + encodeURIComponent(c.employeeSeparation) + '" target="_blank">' + escapeHtml(c.employee) + "</a></td>" +
					"<td>" + escapeHtml(c.type || "—") + "</td><td>" + escapeHtml(c.approver || "—") + "</td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">Nothing pending 🎉</td></tr>';
		var subtitle = d.pendingClearancesTotal > d.pendingClearances.length
			? "Showing " + d.pendingClearances.length + " of " + d.pendingClearancesTotal + " waiting"
			: d.pendingClearancesTotal + " waiting";

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Pending Offboarding Clearances</h3><p>' + subtitle + '</p></div></div>' +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Employee</th><th>Clearance</th><th>Approver</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderEventsCard(title, icon, items, total, emptyText, extraKey) {
		var rows = items.length
			? items.map(function (it) {
				var extra = extraKey && it[extraKey] != null ? ' <span class="admin-event-extra">(' + it[extraKey] + " yrs)</span>" : "";
				return (
					'<div class="admin-event-row"><span class="admin-event-name">' + escapeHtml(it.employee) + extra + "</span>" +
					'<span class="admin-event-date">' + formatDate(it.date, { day: "2-digit", month: "short" }) + "</span></div>"
				);
			}).join("")
			: '<div class="ess-table-empty">' + emptyText + "</div>";
		var subtitle = total > items.length ? "Soonest " + items.length + " of " + total + " in the next 30 days" : "Next 30 days";

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + icon + " " + title + '</h3><p>' + subtitle + "</p></div></div>" +
			'<div class="ess-card-body">' + rows + "</div></div>"
		);
	}

	function drawDepartmentChart(rows) {
		var ctx = document.getElementById("deptChart");
		if (!ctx || !window.Chart) return;
		if (deptChartInstance) deptChartInstance.destroy();
		deptChartInstance = new Chart(ctx, {
			type: "bar",
			data: {
				labels: rows.map(function (r) { return r.department; }),
				datasets: [{
					label: "Employees",
					data: rows.map(function (r) { return r.count; }),
					backgroundColor: DEPT_COLOR,
					borderRadius: 6,
					maxBarThickness: 26,
				}],
			},
			options: {
				indexAxis: "y",
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: {
					x: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 12, weight: "600" }, color: "#334155", precision: 0 } },
					y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 12, weight: "600" }, color: "#334155" } },
				},
			},
		});
	}

	// ---- main render ----
	function renderPage(d) {
		// Cards are stacked two columns of masonry rather than paired off
		// row-by-row - a short card (e.g. Today's Attendance once most of
		// the day is unmarked) would otherwise leave a slab of empty space
		// under it, sized to whatever its taller row-mate happens to be.
		// Each column here just keeps flowing, so a short card is followed
		// immediately by the next real card in its own column instead.
		var leftCol =
			renderAttendanceTodayCard(d) +
			renderPendingLeavesCard(d) +
			renderPendingRegularizationsCard(d) +
			renderEventsCard("Upcoming Birthdays", ICONS.cake, d.upcomingBirthdays, d.upcomingBirthdaysTotal, "No birthdays in the next 30 days");
		var rightCol =
			renderDepartmentCard(d) +
			renderPendingExpensesCard(d) +
			renderPendingClearancesCard(d) +
			renderEventsCard("Upcoming Work Anniversaries", ICONS.badge, d.upcomingAnniversaries, d.upcomingAnniversariesTotal, "No anniversaries in the next 30 days", "years");

		return (
			renderPageHeading() +
			renderKpis(d) +
			'<div class="ess-masonry-two-col">' +
			'<div class="ess-masonry-col">' + leftCol + "</div>" +
			'<div class="ess-masonry-col">' + rightCol + "</div>" +
			"</div>"
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
		drawDepartmentChart(d.departmentHeadcount);
	}

	// ---- boot ----
	function boot() {
		fetch("/api/method/ess_dashboard.api.admin_dashboard.get_admin_dashboard_data", {
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
