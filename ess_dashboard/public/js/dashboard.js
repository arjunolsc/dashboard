(function () {
	"use strict";

	// ---- helpers ----

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
	function daysUntil(iso) {
		var target = new Date(iso), now = new Date();
		target.setHours(0, 0, 0, 0);
		now.setHours(0, 0, 0, 0);
		return Math.round((target - now) / 86400000);
	}
	function initials(name) {
		return (name || "").split(" ").filter(Boolean).slice(0, 2).map(function (p) { return p[0].toUpperCase(); }).join("");
	}
	function badgeClass(status) {
		var map = {
			Approved: "badge-approved", Submitted: "badge-submitted", Present: "badge-present",
			Open: "badge-open", Pending: "badge-pending", Rejected: "badge-rejected", Absent: "badge-absent",
			"On Leave": "badge-onleave",
		};
		return map[status] || "badge-default";
	}
	function calTone(status) {
		var map = {
			Present: "cal-present", Absent: "cal-absent", "On Leave": "cal-onleave",
			Holiday: "cal-holiday", "Week Off": "cal-weekoff", "Half Day": "cal-halfday",
			"Work From Home": "cal-present", "On Duty": "cal-present",
		};
		return map[status] || "";
	}
	function escapeHtml(s) {
		var div = document.createElement("div");
		div.textContent = s == null ? "" : String(s);
		return div.innerHTML;
	}

	// ---- icons ----
	var ICONS = {
		home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11.5 12 4l9 7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17" stroke-linecap="round"/></svg>',
		wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M15 14h3" stroke-linecap="round"/></svg>',
		receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" stroke-linejoin="round"/><path d="M8.5 9h7M8.5 13h7" stroke-linecap="round"/></svg>',
		user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20c1.5-4 5-6 7.5-6s6 2 7.5 6" stroke-linecap="round"/></svg>',
		check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.3 2.3 4.7-5.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" stroke-linecap="round"/></svg>',
		bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke-linecap="round"/></svg>',
		chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
		download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0-4-4m4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
	};

	// ---- state ----
	var today = new Date();
	var state = {
		data: null,
		leaveStatusFilter: "All",
		expenseStatusFilter: "All",
		calendarYear: today.getFullYear(),
		calendarMonth: today.getMonth() + 1, // 1-12
		calendarDays: {}, // "YYYY-MM-DD" -> {status, hours}
	};

	function root() { return document.getElementById("app"); }

	function renderError(message) {
		root().innerHTML =
			'<div class="ess-error"><h2>Couldn’t load your dashboard</h2><p>' + escapeHtml(message) + "</p></div>";
	}

	// ---- section renderers ----

	function renderHero() {
		return (
			'<div class="ess-hero">' +
			'<a href="/app/hrms-home" class="ess-home-btn" title="Back to HRMS Home">' +
			ICONS.home + "<span>HRMS Home</span></a>" +
			'<img src="/files/om_logo.svg" alt="OM One" class="ess-hero-logo">' +
			'<p class="ess-hero-title">Employee Self-Service Dashboard</p>' +
			"</div>"
		);
	}

	function renderPageHeading(employee) {
		var today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
		var firstName = (employee.name || "").split(" ")[0];
		return (
			'<div class="ess-page-heading"><h2>Good to see you, ' + escapeHtml(firstName) + "</h2>" +
			'<p>' + today + "</p></div>"
		);
	}

	function kpiCard(label, value, hint, tone, icon) {
		return (
			'<div class="ess-kpi"><div class="ess-kpi-top"><span class="ess-kpi-label">' + label + "</span>" +
			'<div class="ess-kpi-icon tone-' + tone + '">' + icon + "</div></div>" +
			'<div class="ess-kpi-value">' + value + '</div><div class="ess-kpi-hint">' + hint + "</div></div>"
		);
	}

	function renderKpis(d) {
		var leave = d.leaveBalance[0];
		var nextHoliday = d.upcomingHolidays[0];
		var currentMonth = d.attendanceByMonth[d.attendanceByMonth.length - 1];
		var attendancePct = currentMonth
			? Math.round((currentMonth.present / Math.max(1, currentMonth.present + currentMonth.absent)) * 100)
			: null;

		var cards = [
			kpiCard(
				"Leave Balance",
				leave ? leave.remaining : "—",
				leave ? "of " + leave.total + " days (" + escapeHtml(leave.type) + ")" : "No allocation yet",
				"indigo", ICONS.calendar
			),
			kpiCard(
				"This Month's Attendance",
				attendancePct !== null ? attendancePct + "%" : "—",
				currentMonth ? currentMonth.present + " present · " + currentMonth.absent + " absent" : "",
				"emerald", ICONS.check
			),
			kpiCard(
				"Latest Payslip",
				d.latestPayslip ? formatCurrency(d.latestPayslip.netPay) : "—",
				d.latestPayslip ? "Net pay · " + escapeHtml(d.latestPayslip.status) : "Not generated yet",
				"violet", ICONS.wallet
			),
			kpiCard(
				"Next Holiday",
				nextHoliday ? formatDate(nextHoliday.date, { day: "2-digit", month: "short" }) : "—",
				nextHoliday ? escapeHtml(nextHoliday.description) + " · in " + daysUntil(nextHoliday.date) + " day(s)" : "None scheduled",
				"amber", ICONS.sun
			),
		];
		return '<div class="ess-kpi-grid">' + cards.join("") + "</div>";
	}

	function renderAttendanceCard(d) {
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Attendance</h3>' +
			'<p>Last 6 months</p></div>' +
			'<div class="ess-segmented" id="att-range">' +
			'<button data-range="3" class="range-btn">3M</button>' +
			'<button data-range="6" class="range-btn active">6M</button>' +
			"</div></div>" +
			'<div class="ess-card-body"><div class="ess-chart-wrap"><canvas id="attendanceChart"></canvas></div></div></div>'
		);
	}

	function renderLeaveBalanceCard(d) {
		if (!d.leaveBalance.length) {
			return '<div class="ess-card"><div class="ess-card-header"><h3>Leave Balance</h3></div><div class="ess-card-body"><p style="color:var(--ink-500);font-size:13px">No leave allocated yet.</p></div></div>';
		}
		var rows = d.leaveBalance.map(function (l) {
			var pct = l.total ? Math.round((l.remaining / l.total) * 100) : 0;
			return (
				'<div style="margin-bottom:14px"><div class="ess-progress-row">' +
				'<span style="font-size:12.5px;font-weight:500">' + escapeHtml(l.type) + "</span>" +
				'<span style="font-size:12.5px;color:var(--ink-500)">' + l.remaining + " / " + l.total + "</span></div>" +
				'<div class="ess-progress-track"><div class="ess-progress-fill" style="width:' + pct + '%"></div></div></div>'
			);
		}).join("");
		return '<div class="ess-card"><div class="ess-card-header"><h3>Leave Balance</h3></div><div class="ess-card-body">' + rows + "</div></div>";
	}

	function payslipPdfUrl(name) {
		// Frappe's own print-to-PDF endpoint (the same one the "Download PDF"
		// button on a Salary Slip form uses) - GET, whitelisted, permission-
		// checked server-side against the requesting user's own read access.
		return "/api/method/frappe.utils.print_format.download_pdf?doctype=" +
			encodeURIComponent("Salary Slip") + "&name=" + encodeURIComponent(name);
	}

	function renderPayslipCard(d) {
		var p = d.latestPayslip;
		if (!p) {
			return '<div class="ess-card"><div class="ess-card-header"><h3>Latest Payslip</h3></div><div class="ess-card-body"><p style="color:var(--ink-500);font-size:13px">No payslip generated yet.</p></div></div>';
		}
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Latest Payslip</h3>' +
			"<p>" + formatDate(p.start) + " – " + formatDate(p.end) + "</p></div>" +
			'<span class="ess-badge ' + badgeClass(p.status) + '">' + escapeHtml(p.status) + "</span></div>" +
			'<div class="ess-card-body">' +
			'<div class="ess-stat-row"><span class="label">Gross Pay</span><span class="value">' + formatCurrency(p.grossPay) + "</span></div>" +
			'<div class="ess-stat-row"><span class="label">Deductions</span><span class="value">-' + formatCurrency(p.totalDeduction) + "</span></div>" +
			'<div class="ess-stat-row"><span class="label">Net Pay</span><span class="value">' + formatCurrency(p.netPay) + "</span></div>" +
			'<a class="ess-download-btn" href="' + payslipPdfUrl(p.name) + '" download>' +
			ICONS.download + "<span>Download Payslip (PDF)</span></a>" +
			"</div></div>"
		);
	}

	function renderHolidaysCard(d) {
		if (!d.upcomingHolidays.length) {
			return '<div class="ess-card"><div class="ess-card-header"><h3>Upcoming Holidays</h3></div><div class="ess-card-body"><p style="color:var(--ink-500);font-size:13px">None scheduled.</p></div></div>';
		}
		var items = d.upcomingHolidays.map(function (h) {
			var d2 = new Date(h.date);
			return (
				'<div class="ess-list-item"><div class="ess-list-date"><span class="d">' + d2.getDate() +
				'</span><span class="m">' + d2.toLocaleDateString("en-IN", { month: "short" }) + "</span></div>" +
				'<div><p class="title">' + escapeHtml(h.description) + '</p><p class="sub">' + formatDate(h.date) + "</p></div></div>"
			);
		}).join("");
		return '<div class="ess-card"><div class="ess-card-header"><h3>Upcoming Holidays</h3></div><div class="ess-card-body"><div class="ess-list">' + items + "</div></div></div>";
	}

	var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
	var CAL_LEGEND = [
		["cal-present", "Present"],
		["cal-absent", "Absent"],
		["cal-onleave", "On Leave"],
		["cal-holiday", "Holiday"],
		["cal-weekoff", "Week Off"],
	];

	function fetchAttendanceMonth(year, month) {
		return fetch(
			"/api/method/ess_dashboard.api.dashboard.get_attendance_month?year=" + year + "&month=" + month,
			{ method: "GET", credentials: "same-origin" }
		)
			.then(function (res) { return res.json(); })
			.then(function (body) {
				var map = {};
				(body.message.days || []).forEach(function (d) { map[d.date] = d; });
				return map;
			});
	}

	function renderCalendarCard() {
		var year = state.calendarYear, month = state.calendarMonth;
		var firstOfMonth = new Date(year, month - 1, 1);
		var daysInMonth = new Date(year, month, 0).getDate();
		var startWeekday = firstOfMonth.getDay(); // 0=Sun
		var todayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");

		var cells = "";
		for (var i = 0; i < startWeekday; i++) {
			cells += '<div class="cal-cell cal-cell-empty"></div>';
		}
		for (var day = 1; day <= daysInMonth; day++) {
			var dateKey = year + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
			var rec = state.calendarDays[dateKey];
			var tone = rec ? calTone(rec.status) : "";
			var isToday = dateKey === todayKey;
			cells +=
				'<div class="cal-cell' + (tone ? " " + tone : "") + (isToday ? " cal-today" : "") + '" title="' +
				(rec ? escapeHtml(rec.status) : "Not marked") + '">' +
				'<span class="cal-daynum">' + day + "</span>" +
				"</div>";
		}

		var weekdayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
			.map(function (w) { return '<div class="cal-weekday">' + w + "</div>"; })
			.join("");

		var legend = CAL_LEGEND.map(function (l) {
			return '<div class="cal-legend-item"><span class="cal-legend-dot ' + l[0] + '"></span>' + l[1] + "</div>";
		}).join("");

		return (
			'<div class="ess-card" id="attendance-calendar">' +
			'<div class="ess-card-header"><div><p class="cal-title">' + MONTH_NAMES[month - 1] + " " + year + '</p><p class="cal-subtitle">Attendance Calendar</p></div>' +
			'<div class="cal-nav">' +
			'<button class="cal-nav-btn" id="cal-prev">' + ICONS.chevronLeft + "</button>" +
			'<button class="cal-nav-btn" id="cal-next">' + ICONS.chevronRight + "</button>" +
			"</div></div>" +
			'<div class="ess-card-body"><div class="cal-layout">' +
			'<div class="cal-legend">' + legend + "</div>" +
			'<div class="cal-wrap">' +
			'<div class="cal-grid cal-grid-header">' + weekdayHeaders + "</div>" +
			'<div class="cal-grid">' + cells + "</div>" +
			"</div>" +
			"</div></div></div>"
		);
	}

	function refreshCalendar() {
		fetchAttendanceMonth(state.calendarYear, state.calendarMonth).then(function (map) {
			state.calendarDays = map;
			var container = document.getElementById("attendance-calendar");
			if (container) {
				container.outerHTML = renderCalendarCard();
				wireCalendarNav();
			}
		});
	}

	function wireCalendarNav() {
		var prev = document.getElementById("cal-prev");
		var next = document.getElementById("cal-next");
		if (prev) {
			prev.addEventListener("click", function () {
				state.calendarMonth -= 1;
				if (state.calendarMonth < 1) { state.calendarMonth = 12; state.calendarYear -= 1; }
				refreshCalendar();
			});
		}
		if (next) {
			next.addEventListener("click", function () {
				state.calendarMonth += 1;
				if (state.calendarMonth > 12) { state.calendarMonth = 1; state.calendarYear += 1; }
				refreshCalendar();
			});
		}
	}

	function renderProfileCard(d) {
		var e = d.employee;
		var rows = [
			["Employee ID", e.employeeId],
			["Designation", e.designation],
			["Department", e.department],
			["Company", e.company],
			["Date of Joining", formatDate(e.dateOfJoining)],
			["Status", e.status],
			["Email", e.email],
			["Mobile", e.mobile],
			["Shift", e.shift],
			["Weekly Off", e.weeklyOff],
			["Notice Period", e.noticePeriod ? e.noticePeriod + " day(s)" : null],
			["Reports To", e.reportsTo],
		];
		var body = rows.map(function (r) {
			return (
				'<div class="ess-stat-row"><span class="label">' + r[0] + "</span><span class=\"value\">" +
				escapeHtml(r[1] || "—") + "</span></div>"
			);
		}).join("");
		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>' + escapeHtml(e.name) + "</h3><p>Profile details</p></div></div>" +
			'<div class="ess-card-body">' + body + "</div></div>"
		);
	}

	function statusOptions(items, statusKey) {
		var set = {};
		items.forEach(function (i) { set[i[statusKey]] = true; });
		return Object.keys(set);
	}

	function renderLeaveTable(d) {
		var filtered = d.leaveApplications.filter(function (l) {
			return state.leaveStatusFilter === "All" || l.status === state.leaveStatusFilter;
		});
		var options = ["All"].concat(statusOptions(d.leaveApplications, "status"));
		var selectHtml = '<select class="ess-select" id="leave-filter">' + options.map(function (o) {
			return '<option value="' + escapeHtml(o) + '"' + (o === state.leaveStatusFilter ? " selected" : "") + ">" + escapeHtml(o) + "</option>";
		}).join("") + "</select>";

		var rows = filtered.length
			? filtered.map(function (l) {
				return (
					"<tr><td>" + escapeHtml(l.type) + "</td><td>" + formatDate(l.from) + " – " + formatDate(l.to) +
					"</td><td>" + l.days + "</td><td><span class=\"ess-badge " + badgeClass(l.status) + "\">" + escapeHtml(l.status) + "</span></td></tr>"
				);
			}).join("")
			: '<tr><td colspan="4" class="ess-table-empty">No leave requests in this filter</td></tr>';

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Leave Requests</h3><p>' + d.leaveApplications.length + " total</p></div>" + selectHtml + "</div>" +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Type</th><th>Period</th><th>Days</th><th>Status</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	function renderExpenseTable(d) {
		var filtered = d.expenseClaims.filter(function (e) {
			return state.expenseStatusFilter === "All" || e.status === state.expenseStatusFilter;
		});
		var options = ["All"].concat(statusOptions(d.expenseClaims, "status"));
		var selectHtml = '<select class="ess-select" id="expense-filter">' + options.map(function (o) {
			return '<option value="' + escapeHtml(o) + '"' + (o === state.expenseStatusFilter ? " selected" : "") + ">" + escapeHtml(o) + "</option>";
		}).join("") + "</select>";

		var rows = filtered.length
			? filtered.map(function (e) {
				return (
					"<tr><td>" + formatDate(e.date) + "</td><td>" + formatCurrency(e.amount) +
					"</td><td><span class=\"ess-badge " + badgeClass(e.status) + "\">" + escapeHtml(e.status) + "</span></td></tr>"
				);
			}).join("")
			: '<tr><td colspan="3" class="ess-table-empty">No expense claims in this filter</td></tr>';

		return (
			'<div class="ess-card"><div class="ess-card-header"><div><h3>Expense Claims</h3><p>' + d.expenseClaims.length + " total</p></div>" + selectHtml + "</div>" +
			'<div class="ess-card-body"><table class="ess-table"><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
			rows + "</tbody></table></div></div>"
		);
	}

	// ---- chart ----
	var chartInstance = null;
	function drawAttendanceChart(months) {
		var ctx = document.getElementById("attendanceChart");
		if (!ctx || !window.Chart) return;
		if (chartInstance) chartInstance.destroy();
		chartInstance = new Chart(ctx, {
			type: "bar",
			data: {
				labels: months.map(function (m) { return m.month; }),
				datasets: [
					// Same softened tones as the calendar badges (see dashboard.css
					// --emerald/rose/sky-600), so a status reads the same muted
					// color everywhere on the dashboard - Chart.js needs a literal
					// hex here, it can't read the CSS custom properties.
					{ label: "Present", data: months.map(function (m) { return m.present; }), backgroundColor: "#327b65", borderRadius: 6, maxBarThickness: 26 },
					{ label: "Absent", data: months.map(function (m) { return m.absent; }), backgroundColor: "#c0596a", borderRadius: 6, maxBarThickness: 26 },
					{ label: "On Leave", data: months.map(function (m) { return m.onLeave; }), backgroundColor: "#4486a7", borderRadius: 6, maxBarThickness: 26 },
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: {
						position: "bottom",
						labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { size: 12, weight: "600" }, color: "#1e293b" },
					},
				},
				scales: {
					x: { stacked: false, grid: { display: false }, ticks: { font: { size: 12, weight: "600" }, color: "#334155" } },
					y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 12, weight: "600" }, color: "#334155", precision: 0 } },
				},
			},
		});
	}

	// ---- main render ----
	function renderPage(d) {
		return (
			renderPageHeading(d.employee) +
			renderKpis(d) +
			'<div class="ess-two-col">' +
			renderAttendanceCard(d) +
			renderLeaveBalanceCard(d) +
			"</div>" +
			renderCalendarCard() +
			'<div class="ess-two-col">' +
			renderLeaveTable(d) +
			renderProfileCard(d) +
			"</div>" +
			'<div class="ess-two-col">' +
			'<div style="display:flex;flex-direction:column;gap:20px">' + renderPayslipCard(d) + renderHolidaysCard(d) + "</div>" +
			renderExpenseTable(d) +
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
		drawAttendanceChart(d.attendanceByMonth.slice(-6));
		wireEvents();
	}

	function wireEvents() {
		var leaveFilter = document.getElementById("leave-filter");
		if (leaveFilter) {
			leaveFilter.addEventListener("change", function (e) {
				state.leaveStatusFilter = e.target.value;
				render();
			});
		}
		var expenseFilter = document.getElementById("expense-filter");
		if (expenseFilter) {
			expenseFilter.addEventListener("change", function (e) {
				state.expenseStatusFilter = e.target.value;
				render();
			});
		}
		var rangeBtns = document.querySelectorAll("#att-range .range-btn");
		rangeBtns.forEach(function (btn) {
			btn.addEventListener("click", function () {
				rangeBtns.forEach(function (b) { b.classList.remove("active"); });
				btn.classList.add("active");
				var n = parseInt(btn.getAttribute("data-range"), 10);
				drawAttendanceChart(state.data.attendanceByMonth.slice(-n));
			});
		});

		wireCalendarNav();
	}

	// ---- boot ----
	function boot() {
		fetch("/api/method/ess_dashboard.api.dashboard.get_dashboard_data", {
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
				return fetchAttendanceMonth(state.calendarYear, state.calendarMonth);
			})
			.then(function (map) {
				state.calendarDays = map;
				render();
			})
			.catch(function (err) {
				renderError(err.message || "Something went wrong loading your data. Please refresh, or contact HR if this keeps happening.");
			});
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
