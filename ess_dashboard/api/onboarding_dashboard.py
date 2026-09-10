# ess_dashboard/api/onboarding_dashboard.py
#
# Company-wide view of the candidate onboarding pipeline (Employee
# Onboarding + its portal fields from olscpl_hrms) for HR/System Manager
# staff - same access policy as api/admin_dashboard.py, reused rather than
# duplicated.

import frappe
from frappe.utils import add_days, add_months, get_datetime, getdate, now_datetime, today

from ess_dashboard.api.admin_dashboard import _check_admin_access

RECENT_LIMIT = 15
UPCOMING_WINDOW_DAYS = 14


@frappe.whitelist()
def get_onboarding_dashboard_data():
	_check_admin_access()

	today_date = getdate(today())
	now = now_datetime()
	month_start = today_date.replace(day=1)

	all_rows = frappe.get_all(
		"Employee Onboarding",
		fields=[
			"name", "employee_name", "designation", "department", "boarding_status",
			"boarding_begins_on", "date_of_joining", "creation", "modified",
			"portal_access_key", "portal_link_sent_on", "portal_link_expires_on",
			"portal_submitted_on", "portal_documents_completed_on",
		],
	)

	total = len(all_rows)
	status_counts = {}
	completed_this_month = 0
	completed_durations = []
	awaiting_link = []
	needs_resend = []
	pending_hr_review_candidates = []
	upcoming_joiners = []
	recently_completed = []

	for r in all_rows:
		status_counts[r.boarding_status or "Pending"] = status_counts.get(r.boarding_status or "Pending", 0) + 1

		is_completed = r.boarding_status == "Completed"
		if is_completed:
			modified_date = getdate(r.modified)
			if modified_date >= month_start:
				completed_this_month += 1
			completed_durations.append((get_datetime(r.modified) - get_datetime(r.creation)).days)
			recently_completed.append(r)
			continue

		if not r.portal_access_key:
			awaiting_link.append(r)
		elif r.portal_link_expires_on and get_datetime(r.portal_link_expires_on) < now and not r.portal_submitted_on:
			needs_resend.append(r)
		elif r.portal_submitted_on:
			pending_hr_review_candidates.append(r)

		if r.boarding_begins_on:
			begins = getdate(r.boarding_begins_on)
			if today_date <= begins <= add_days(today_date, UPCOMING_WINDOW_DAYS):
				upcoming_joiners.append(r)

	recently_completed.sort(key=lambda r: r.modified, reverse=True)
	upcoming_joiners.sort(key=lambda r: r.boarding_begins_on)
	awaiting_link.sort(key=lambda r: r.creation)
	needs_resend.sort(key=lambda r: r.portal_link_expires_on)

	pending_hr_review = _with_missing_document_counts(pending_hr_review_candidates)
	pending_hr_review.sort(key=lambda r: r["missingCount"], reverse=True)

	avg_days_to_complete = (
		round(sum(completed_durations) / len(completed_durations), 1) if completed_durations else None
	)

	return {
		"kpis": {
			"total": total,
			"inProgress": status_counts.get("Pending", 0) + status_counts.get("In Process", 0),
			"completedThisMonth": completed_this_month,
			"avgDaysToComplete": avg_days_to_complete,
		},
		"statusBreakdown": [
			{"status": s, "count": c} for s, c in status_counts.items()
		],
		"monthlyTrend": _monthly_trend(today_date),
		"awaitingLinkTotal": len(awaiting_link),
		"awaitingLink": [_row_summary(r) for r in awaiting_link[:RECENT_LIMIT]],
		"needsResendTotal": len(needs_resend),
		"needsResend": [
			dict(_row_summary(r), expiresOn=str(r.portal_link_expires_on)) for r in needs_resend[:RECENT_LIMIT]
		],
		"pendingHrReviewTotal": len(pending_hr_review),
		"pendingHrReview": pending_hr_review[:RECENT_LIMIT],
		"upcomingJoinersTotal": len(upcoming_joiners),
		"upcomingJoiners": [
			dict(_row_summary(r), boardingBeginsOn=str(r.boarding_begins_on)) for r in upcoming_joiners[:RECENT_LIMIT]
		],
		"recentlyCompletedTotal": len(recently_completed),
		"recentlyCompleted": [
			dict(_row_summary(r), completedOn=str(r.modified)) for r in recently_completed[:RECENT_LIMIT]
		],
	}


def _row_summary(r):
	return {
		"name": r.name,
		"employee": r.employee_name,
		"designation": r.designation,
		"department": r.department,
	}


def _with_missing_document_counts(rows):
	"""How many mandatory checklist documents HR still hasn't marked
	received, for each candidate who's already submitted their side -
	the whole point of this card is to surface who's stuck waiting on HR,
	not the candidate."""
	if not rows:
		return []

	names = [r.name for r in rows]
	checklist_rows = frappe.get_all(
		"Onboarding Checklist Item",
		filters={"parent": ["in", names], "mandatory": 1, "hr_received": 0},
		fields=["parent"],
	)
	missing_counts = {}
	for c in checklist_rows:
		missing_counts[c.parent] = missing_counts.get(c.parent, 0) + 1

	out = []
	for r in rows:
		missing = missing_counts.get(r.name, 0)
		if missing:
			out.append(dict(_row_summary(r), missingCount=missing, submittedOn=str(r.portal_submitted_on)))
	return out


def _monthly_trend(today_date):
	"""Onboardings created per month, the last 12 months - a simple GROUP
	BY on a DATE_FORMAT'd creation date rather than one query per month."""
	start = add_days(today_date.replace(day=1), -365)
	rows = frappe.db.sql(
		"""
		select date_format(creation, '%%Y-%%m') as ym, count(name) as cnt
		from `tabEmployee Onboarding`
		where creation >= %s
		group by ym
		order by ym asc
		""",
		(start,),
		as_dict=True,
	)
	counts_by_ym = {r.ym: r.cnt for r in rows}

	# 12 trailing months ending this month, oldest first.
	month_start = today_date.replace(day=1)
	months = []
	for offset in range(11, -1, -1):
		label_date = add_months(month_start, -offset)
		ym = label_date.strftime("%Y-%m")
		months.append({"month": label_date.strftime("%b %Y"), "count": counts_by_ym.get(ym, 0)})
	return months
