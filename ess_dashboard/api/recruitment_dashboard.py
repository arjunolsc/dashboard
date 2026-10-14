# ess_dashboard/api/recruitment_dashboard.py
#
# Recruitment & Onboarding control centre (/onboarding-dashboard): every
# number is read live from the HRMS records - Job Opening, Job Applicant,
# Interview (+ Interview Detail / Interview Feedback), Job Offer, Employee
# Onboarding (+ its portal fields and Onboarding Checklist Item from
# olscpl_hrms), Background Verification, Job Requisition and Employee.
# Same access rule as the other dashboards (HR Manager / System Manager,
# admin_dashboard._check_admin_access) - checked on every call.
#
# Definitions (shown as tooltips on the page too):
#   Applicant stage - the furthest point an application has reached:
#     Joined (an Employee links the applicant) > Offer Accepted > Offer
#     Released (submitted offer awaiting response) > Selected (an interview
#     Cleared, or a draft offer) > Interviewing (interview Pending / Under
#     Review) > In Review (Open / Replied, no interview yet); Rejected = the
#     applicant, their latest interview or their offer was rejected;
#     On Hold = applicant status Hold.
#   Period metrics use the record's creation date (applications, offers)
#   or scheduled date (interviews); "now" metrics ignore the period.
#   Time to hire - application received -> offer accepted, in days.
#   Feedback pending - interview date passed, still Pending / Under Review.
from collections import Counter, defaultdict

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, getdate, now_datetime, nowdate

from ess_dashboard.api.admin_dashboard import _check_admin_access

STAGES = ["In Review", "Interviewing", "Selected", "Offer Released", "Offer Accepted", "Joined", "On Hold", "Rejected"]
AGING_DAYS = 7  # an application still in review after this many days counts as aging
OFFER_WAIT_DAYS = 3  # an offer unanswered this long is flagged


# ── filters ──────────────────────────────────────────────────────────────────
def _filters(filters):
	f = frappe._dict(frappe.parse_json(filters) if isinstance(filters, str) else (filters or {}))
	f.to_date = getdate(f.to_date or nowdate())
	f.from_date = getdate(f.from_date or add_days(f.to_date, -29))
	return f


def _opening_cond(f, alias="jo"):
	"""SQL condition + values restricting to the filtered company / department (on Job Opening)."""
	cond, vals = [], {}
	if f.get("company"):
		cond.append(f"{alias}.company = %(company)s")
		vals["company"] = f.company
	if f.get("department"):
		cond.append(f"{alias}.department = %(department)s")
		vals["department"] = f.department
	return (" and " + " and ".join(cond)) if cond else "", vals


def _openings(f):
	cond, vals = _opening_cond(f)
	return frappe.db.sql(f"""select jo.name, jo.job_title, jo.designation, jo.department, jo.location, jo.company,
			jo.employment_type, jo.status, jo.posted_on, jo.closes_on, jo.vacancies, jo.planned_vacancies,
			jo.publish, jo.custom_is_general, jo.creation
		from `tabJob Opening` jo where 1=1 {cond}""", vals, as_dict=True)


def _applicants(f, period=True, extra="", extra_vals=None):
	cond, vals = _opening_cond(f)
	if cond:  # company / department live on the opening
		where = f"ja.job_title in (select jo.name from `tabJob Opening` jo where 1=1 {cond})"
	else:
		where = "1=1"
	if period:
		where += " and date(ja.creation) between %(from_date)s and %(to_date)s"
		vals.update(from_date=f.from_date, to_date=f.to_date)
	vals.update(extra_vals or {})
	return frappe.db.sql(f"""select ja.name, ja.applicant_name, ja.email_id, ja.phone_number, ja.job_title,
			ja.custom_job_opening_title, ja.designation, ja.custom_department, ja.status, ja.source,
			ja.custom_application_channel as channel, ja.creation, ja.modified, ja.resume_attachment
		from `tabJob Applicant` ja where {where} {extra}""", vals, as_dict=True)


# ── applicant stage ──────────────────────────────────────────────────────────
def _stage_info(names):
	"""{applicant: {stage, interviews[], offer, flags}} for these applicants, in a few grouped queries."""
	if not names:
		return {}
	interviews = defaultdict(list)
	for r in frappe.get_all("Interview", {"job_applicant": ["in", names], "docstatus": ["<", 2]},
			["name", "job_applicant", "status", "scheduled_on", "interview_round", "creation"], order_by="creation asc"):
		interviews[r.job_applicant].append(r)
	offers = {}
	for r in frappe.get_all("Job Offer", {"job_applicant": ["in", names], "docstatus": ["<", 2]},
			["name", "job_applicant", "status", "docstatus", "offer_date", "creation", "custom_offer_responded_on", "modified"],
			order_by="creation asc"):
		offers[r.job_applicant] = r  # latest wins
	joined = set(frappe.get_all("Employee", {"job_applicant": ["in", names]}, pluck="job_applicant"))
	return {"interviews": interviews, "offers": offers, "joined": joined}


def _stage(app, info):
	ivs = info["interviews"].get(app.name, [])
	offer = info["offers"].get(app.name)
	if app.name in info["joined"]:
		return "Joined"
	if offer and offer.docstatus == 1 and offer.status == "Accepted":
		return "Offer Accepted"
	if offer and offer.status == "Rejected" and offer.docstatus == 1:
		return "Rejected"
	if offer and offer.docstatus == 1:
		return "Offer Released"
	if app.status == "Rejected" or (ivs and ivs[-1].status == "Rejected"):
		return "Rejected"
	if offer or any(i.status == "Cleared" for i in ivs):
		return "Selected"
	if any(i.status in ("Pending", "Under Review") for i in ivs):
		return "Interviewing"
	if app.status == "Hold":
		return "On Hold"
	return "In Review"


def _next_action(app, stage, info):
	ivs = info["interviews"].get(app.name, [])
	today = getdate(nowdate())
	if stage == "In Review":
		return "Screen & schedule interview"
	if stage == "Interviewing":
		late = [i for i in ivs if i.status in ("Pending", "Under Review") and i.scheduled_on and getdate(i.scheduled_on) < today]
		return "Interview feedback pending" if late else "Interview scheduled"
	if stage == "Selected":
		offer = info["offers"].get(app.name)
		return "Release offer (draft)" if offer else "Create job offer"
	if stage == "Offer Released":
		return "Awaiting candidate response"
	if stage == "Offer Accepted":
		return "Start / track onboarding"
	if stage == "On Hold":
		return "Decide: resume or reject"
	return ""


# ── overview ─────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_overview(filters=None):
	_check_admin_access()
	f = _filters(filters)
	today = getdate(nowdate())
	openings = _openings(f)
	open_ops = [o for o in openings if o.status == "Open"]
	aging_ops = [o for o in open_ops if o.posted_on and date_diff(today, o.posted_on) > 45]
	overdue_ops = [o for o in open_ops if o.closes_on and getdate(o.closes_on) < today]

	period_apps = _applicants(f)
	all_open_apps = _applicants(f, period=False, extra="and ja.status in ('Open', 'Replied', 'Hold')")
	info = _stage_info([a.name for a in period_apps + all_open_apps])
	period_stage = Counter(_stage(a, info) for a in period_apps)
	open_stage = {a.name: _stage(a, info) for a in all_open_apps}
	in_review = [a for a in all_open_apps if open_stage[a.name] == "In Review"]
	aging_review = [a for a in in_review if date_diff(today, a.creation) > AGING_DAYS]

	iv = _interview_rows(f, period=False)
	iv_today = [r for r in iv if r.scheduled_on and getdate(r.scheduled_on) == today and r.status in ("Pending", "Under Review")]
	iv_upcoming = [r for r in iv if r.scheduled_on and getdate(r.scheduled_on) > today and r.status == "Pending"]
	iv_feedback = [r for r in iv if r.scheduled_on and getdate(r.scheduled_on) < today and r.status in ("Pending", "Under Review")]

	offers = _offer_rows(f, period=False)
	off_draft = [o for o in offers if o.docstatus == 0]
	off_wait = [o for o in offers if o.docstatus == 1 and o.status == "Awaiting Response"]
	off_wait_long = [o for o in off_wait if date_diff(today, o.modified) > OFFER_WAIT_DAYS]
	off_accepted_period = [o for o in offers if o.docstatus == 1 and o.status == "Accepted"
		and f.from_date <= getdate(o.custom_offer_responded_on or o.modified) <= f.to_date]
	accepted_no_onb = [o for o in offers if o.docstatus == 1 and o.status == "Accepted" and not o.onboarding]

	onb = _onboarding_rows(f)
	onb_active = [o for o in onb if o.boarding_status != "Completed" and o.docstatus < 2]
	onb_done_period = [o for o in onb if o.boarding_status == "Completed" and f.from_date <= getdate(o.modified) <= f.to_date]
	join_7 = [o for o in onb_active if o.date_of_joining and 0 <= date_diff(o.date_of_joining, today) <= 7]
	join_30 = [o for o in onb_active if o.date_of_joining and 0 <= date_diff(o.date_of_joining, today) <= 30]
	link_not_sent = [o for o in onb_active if not o.portal_access_key]
	link_expired = [o for o in onb_active if o.portal_access_key and not o.portal_submitted_on
		and o.portal_link_expires_on and o.portal_link_expires_on < now_datetime()]
	docs_pending = [o for o in onb_active if o.portal_submitted_on and o.docs_missing]
	joined_not_done = [o for o in onb_active if o.date_of_joining and getdate(o.date_of_joining) < today]

	req_pending = frappe.db.count("Job Requisition", {"status": "Pending", **({"company": f.company} if f.get("company") else {}),
		**({"department": f.department} if f.get("department") else {})})
	bgv = Counter(frappe.get_all("Background Verification", {"docstatus": ["<", 2]}, pluck="status"))

	overdue = len(iv_feedback) + len(link_expired) + len(overdue_ops) + len(joined_not_done)
	kpis = {
		"activeOpenings": {"value": len(open_ops), "aging": len(aging_ops), "positions": sum(cint(o.vacancies) for o in open_ops)},
		"applicants": {"value": len(period_apps), "unique": len({(a.email_id or a.name).lower() for a in period_apps}),
			"previous": _applicant_count_previous(f)},
		"inReview": {"value": len(in_review), "aging": len(aging_review)},
		"interviews": {"today": len(iv_today), "upcoming": len(iv_upcoming), "feedbackPending": len(iv_feedback)},
		"offers": {"draft": len(off_draft), "awaiting": len(off_wait), "acceptedPeriod": len(off_accepted_period)},
		"joining": {"in7": len(join_7), "in30": len(join_30), "acceptedNoOnboarding": len(accepted_no_onb)},
		"onboarding": {"active": len(onb_active), "completedPeriod": len(onb_done_period), "docsPending": len(docs_pending)},
		"overdue": {"value": overdue, "feedback": len(iv_feedback), "linkExpired": len(link_expired),
			"openingsPastClose": len(overdue_ops), "joinedNotComplete": len(joined_not_done)},
	}
	actions = [a for a in [
		_action("critical", f"{len(iv_feedback)} interview(s) are past their date without a decision", "Feedback pending", len(iv_feedback),
			"Interview feedback or the round result is still open.", "Review interviews", {"tab": "interviews", "segment": "feedback"}),
		_action("critical", f"{len(joined_not_done)} onboarding case(s) are past the joining date but not completed", "Onboarding overdue",
			len(joined_not_done), "Joining date has passed; the onboarding record is still Pending / In Process.", "Open onboarding",
			{"tab": "onboarding", "segment": "overdue"}),
		_action("high", f"{len(link_expired)} onboarding link(s) expired before the candidate submitted", "Link expired", len(link_expired),
			"Resend the onboarding link from the Employee Onboarding record.", "Resend links", {"tab": "onboarding", "segment": "expired"}),
		_action("high", f"{len(aging_review)} application(s) waiting more than {AGING_DAYS} days for screening", "Aging applications",
			len(aging_review), "Open / Replied applicants with no interview yet.", "Review applications",
			{"tab": "applicants", "stage": "In Review", "aging": 1}),
		_action("high", f"{len(off_wait_long)} offer(s) unanswered for more than {OFFER_WAIT_DAYS} days", "Offer follow-up", len(off_wait_long),
			"Submitted offers still Awaiting Response.", "Follow up", {"tab": "offers", "segment": "awaiting"}),
		_action("high", f"{len(overdue_ops)} job opening(s) are past their closing date but still Open", "Openings past close",
			len(overdue_ops), "Close them or extend the closing date.", "Review openings", {"tab": "openings", "status": "Open", "pastClose": 1}),
		_action("medium", f"{len(iv_today)} interview(s) scheduled today", "Interviews today", len(iv_today), "", "View schedule",
			{"tab": "interviews", "segment": "today"}),
		_action("medium", f"{len(join_7)} candidate(s) joining in the next 7 days", "Joining soon", len(join_7),
			"Check documents and readiness before day one.", "Review readiness", {"tab": "onboarding", "segment": "joining"}),
		_action("medium", f"{len(accepted_no_onb)} accepted offer(s) without an onboarding record", "Start onboarding",
			len(accepted_no_onb), "Create the Employee Onboarding and send the portal link.", "Start onboarding",
			{"tab": "offers", "segment": "accepted_no_onboarding"}),
		_action("medium", f"{len(docs_pending)} submitted onboarding form(s) with documents not yet received by HR", "Documents pending",
			len(docs_pending), "Mandatory checklist documents not marked received.", "Verify documents", {"tab": "onboarding", "segment": "documents"}),
		_action("medium", f"{len(link_not_sent)} onboarding case(s) where the portal link was never sent", "Link not sent",
			len(link_not_sent), "", "Send links", {"tab": "onboarding", "segment": "not_sent"}),
		_action("medium", f"{len(off_draft)} draft offer(s) not yet released", "Draft offers", len(off_draft),
			"Submit the Job Offer to email it to the candidate.", "Review offers", {"tab": "offers", "segment": "draft"}),
		_action("medium", f"{req_pending} job requisition(s) awaiting approval", "Requisitions", req_pending, "",
			"Open requisitions", {"url": '/app/job-requisition?status=Pending'}),
		_action("medium", f"{bgv.get('Pending', 0) + bgv.get('In Progress', 0)} background verification(s) open"
			+ (f", {bgv['Flagged']} flagged" if bgv.get("Flagged") else ""), "Background checks",
			bgv.get("Pending", 0) + bgv.get("In Progress", 0) + bgv.get("Flagged", 0), "", "Open verifications",
			{"url": '/app/background-verification?status=["in",["Pending","In Progress","Flagged"]]'}),
	] if a]

	funnel = _funnel(period_apps, info)
	return {
		"kpis": kpis,
		"actions": actions,
		"funnel": funnel,
		"stageCounts": [{"stage": s, "count": period_stage.get(s, 0)} for s in STAGES],
		"topOpenings": sorted(_opening_stats(f, open_ops), key=lambda o: -o["applicants"])[:6],
		"upcomingInterviews": [_iv_out(r) for r in sorted(iv_today + iv_upcoming, key=lambda r: (str(r.scheduled_on), str(r.from_time or "")))[:8]],
		"upcomingJoiners": [_onb_out(o) for o in sorted(join_30, key=lambda o: o.date_of_joining)[:8]],
		"period": {"from": str(f.from_date), "to": str(f.to_date)},
		"updatedAt": str(now_datetime())[:19],
	}


def _action(priority, title, label, count, why, cta, target):
	if not count:
		return None
	return {"priority": priority, "title": title, "label": label, "count": count, "why": why, "cta": cta, "target": target}


def _applicant_count_previous(f):
	days = date_diff(f.to_date, f.from_date) + 1
	prev = frappe._dict(f, from_date=add_days(f.from_date, -days), to_date=add_days(f.from_date, -1))
	return len(_applicants(prev))


def _funnel(apps, info):
	"""How many of the period's applications reached each step. Steps are
	cumulative - an applicant who went further counts for every earlier step
	(an offer can be made without a recorded interview), so the funnel never
	widens: Shortlisted = interviewed or further."""
	steps = ["Applied", "Shortlisted", "Selected", "Offer Released", "Offer Accepted", "Joined"]
	reached = Counter()
	for a in apps:
		ivs = info["interviews"].get(a.name, [])
		offer = info["offers"].get(a.name)
		level = 0
		if ivs:
			level = 1
		if offer or any(i.status == "Cleared" for i in ivs):
			level = 2
		if offer and offer.docstatus == 1:
			level = 3
		if offer and offer.docstatus == 1 and offer.status == "Accepted":
			level = 4
		if a.name in info["joined"]:
			level = 5
		for k in range(level + 1):
			reached[steps[k]] += 1
	out, prev = [], None
	for s in steps:
		n = reached.get(s, 0)
		out.append({"step": s, "count": n, "conversion": round(100 * n / prev, 1) if prev else None})
		prev = n or None
	return {"steps": out, "total": len(apps)}


# ── job openings ─────────────────────────────────────────────────────────────
def _opening_stats(f, openings):
	names = [o.name for o in openings]
	if not names:
		return []
	apps = frappe.get_all("Job Applicant", {"job_title": ["in", names]},
		["name", "job_title", "status", "creation", "applicant_name", "email_id", "modified"])
	info = _stage_info([a.name for a in apps])
	per = defaultdict(Counter)
	new_since = add_days(getdate(nowdate()), -7)
	for a in apps:
		st = _stage(a, info)
		per[a.job_title][st] += 1
		per[a.job_title]["_total"] += 1
		if getdate(a.creation) >= new_since:
			per[a.job_title]["_new"] += 1
	today = getdate(nowdate())
	out = []
	for o in openings:
		c = per.get(o.name, Counter())
		out.append({
			"name": o.name, "title": o.job_title or o.name, "designation": o.designation, "department": o.department,
			"location": o.location, "company": o.company, "employmentType": o.employment_type, "status": o.status,
			"postedOn": str(o.posted_on)[:10] if o.posted_on else None, "closesOn": str(o.closes_on) if o.closes_on else None,
			"daysOpen": date_diff(today, o.posted_on or o.creation) if o.status == "Open" else None,
			"pastClose": bool(o.status == "Open" and o.closes_on and getdate(o.closes_on) < today),
			"vacancies": cint(o.vacancies), "general": cint(o.custom_is_general),
			"applicants": c.get("_total", 0), "new": c.get("_new", 0),
			"inReview": c.get("In Review", 0), "interviewing": c.get("Interviewing", 0), "selected": c.get("Selected", 0),
			"offers": c.get("Offer Released", 0), "accepted": c.get("Offer Accepted", 0), "joined": c.get("Joined", 0),
			"rejected": c.get("Rejected", 0), "onHold": c.get("On Hold", 0),
		})
	return out


@frappe.whitelist()
def get_openings(filters=None):
	_check_admin_access()
	f = _filters(filters)
	rows = _opening_stats(f, _openings(f))
	rows.sort(key=lambda r: (r["status"] != "Open", -(r["daysOpen"] or 0)))
	return {"rows": rows}


@frappe.whitelist()
def get_opening(name):
	_check_admin_access()
	o = frappe.get_doc("Job Opening", name)
	stats = _opening_stats(_filters(None), [frappe._dict(o.as_dict())])[0]
	apps = frappe.get_all("Job Applicant", {"job_title": name}, ["name", "applicant_name", "status", "creation"],
		order_by="creation desc", limit=8)
	today = nowdate()
	interviews = frappe.get_all("Interview", {"job_opening": name, "docstatus": ["<", 2], "scheduled_on": [">=", today],
		"status": "Pending"}, ["name", "job_applicant", "interview_round", "scheduled_on", "from_time"], order_by="scheduled_on asc", limit=5)
	offers = frappe.db.sql("""select jof.name, jof.applicant_name, jof.status, jof.docstatus, jof.offer_date
		from `tabJob Offer` jof join `tabJob Applicant` ja on ja.name = jof.job_applicant
		where ja.job_title = %s and jof.docstatus < 2 order by jof.creation desc limit 6""", name, as_dict=True)
	return {
		**stats,
		"description": frappe.utils.strip_html(o.description or "")[:600],
		"salaryShown": False,
		"recentApplicants": [{"name": a.name, "applicantName": a.applicant_name, "status": a.status, "applied": str(a.creation)[:10]} for a in apps],
		"upcomingInterviews": [{"name": i.name, "applicant": i.job_applicant, "round": i.interview_round,
			"date": str(i.scheduled_on), "time": str(i.from_time or "")[:5]} for i in interviews],
		"offers": [{"name": x.name, "applicantName": x.applicant_name, "status": "Draft" if x.docstatus == 0 else x.status,
			"joining": str(x.offer_date) if x.offer_date else None} for x in offers],
	}


# ── applicants ───────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_applicants(filters=None, stage=None, job_opening=None, search=None, aging=0, page=1, page_size=20, sort="newest", all_time=0,
		channel=None):
	_check_admin_access()
	f = _filters(filters)
	extra, vals = "", {}
	if job_opening:
		extra += " and ja.job_title = %(jo)s"
		vals["jo"] = job_opening
	if channel == "Not recorded":
		extra += " and ifnull(ja.custom_application_channel, '') = ''"
	elif channel:  # QR Code / Link / Website / Added by HR
		extra += " and ja.custom_application_channel = %(channel)s"
		vals["channel"] = channel
	if search:
		extra += " and (ja.applicant_name like %(q)s or ja.email_id like %(q)s or ja.phone_number like %(q)s or ja.name like %(q)s)"
		vals["q"] = f"%{search.strip()}%"
	apps = _applicants(f, period=not (cint(all_time) or job_opening), extra=extra, extra_vals=vals)
	info = _stage_info([a.name for a in apps])
	today = getdate(nowdate())
	rows = []
	for a in apps:
		st = _stage(a, info)
		if stage and st != stage:
			continue
		age = date_diff(today, a.creation)
		if cint(aging) and not (st == "In Review" and age > AGING_DAYS):
			continue
		ivs = info["interviews"].get(a.name, [])
		last_iv = ivs[-1] if ivs else None
		rows.append({
			"name": a.name, "applicantName": a.applicant_name, "email": a.email_id, "phone": a.phone_number,
			"opening": a.job_title, "openingTitle": a.custom_job_opening_title or a.job_title,
			"department": a.custom_department, "status": a.status, "source": a.source, "channel": a.channel,
			"applied": str(a.creation)[:10], "age": age, "lastActivity": str(a.modified)[:16], "stage": st,
			"interview": {"name": last_iv.name, "round": last_iv.interview_round, "status": last_iv.status} if last_iv else None,
			"nextAction": _next_action(a, st, info), "resume": a.resume_attachment,
		})
	key = {"newest": lambda r: r["applied"], "oldest": lambda r: r["applied"], "activity": lambda r: r["lastActivity"],
		"name": lambda r: (r["applicantName"] or "").lower()}.get(sort, lambda r: r["applied"])
	rows.sort(key=key, reverse=sort in ("newest", "activity"))
	page, page_size = max(cint(page), 1), min(max(cint(page_size), 5), 100)
	counts = Counter(r["stage"] for r in rows)
	return {"rows": rows[(page - 1) * page_size: page * page_size], "total": len(rows), "page": page, "pageSize": page_size,
		"stageCounts": dict(counts)}


@frappe.whitelist()
def get_applicant(name):
	_check_admin_access()
	a = frappe.get_doc("Job Applicant", name)
	info = _stage_info([name])
	st = _stage(a, info)
	interviews = []
	for iv in info["interviews"].get(name, []):
		fbs = frappe.get_all("Interview Feedback", {"interview": iv.name, "docstatus": ["<", 2]},
			["name", "interviewer", "result", "average_rating", "docstatus"])
		interviewers = frappe.get_all("Interview Detail", {"parent": iv.name}, pluck="interviewer")
		interviews.append({"name": iv.name, "round": iv.interview_round, "status": iv.status, "date": str(iv.scheduled_on),
			"interviewers": [frappe.utils.get_fullname(u) for u in interviewers],
			"feedback": [{"name": x.name, "by": frappe.utils.get_fullname(x.interviewer), "result": x.result,
				"rating": round((x.average_rating or 0) * 5, 1), "draft": x.docstatus == 0} for x in fbs],
			"feedbackMissing": max(len(interviewers) - len([x for x in fbs if x.docstatus == 1]), 0)})
	offer = info["offers"].get(name)
	onb = frappe.db.get_value("Employee Onboarding", {"job_applicant": name, "docstatus": ["<", 2]},
		["name", "boarding_status", "date_of_joining", "portal_submitted_on", "portal_access_key"], as_dict=True)
	bgv = frappe.db.get_value("Background Verification", {"job_applicant": name, "docstatus": ["<", 2]}, ["name", "status"], as_dict=True)
	emp = frappe.db.get_value("Employee", {"job_applicant": name}, ["name", "employee_name", "status"], as_dict=True)
	return {
		"name": a.name, "applicantName": a.applicant_name, "email": a.email_id, "phone": a.phone_number,
		"opening": a.job_title, "openingTitle": a.get("custom_job_opening_title") or a.job_title,
		"designation": a.designation, "department": a.get("custom_department"), "status": a.status, "source": a.source,
		"applied": str(a.creation)[:10], "resume": a.get("resume_attachment") or a.get("resume_link"),
		"coverLetter": (a.cover_letter or "")[:400], "stage": st, "nextAction": _next_action(a, st, info),
		"reference": {"name": a.get("custom_referrer_name"), "code": a.get("custom_referrer_employee_number")}
			if a.get("custom_has_reference") else None,
		"interviews": interviews,
		"offer": {"name": offer.name, "status": "Draft" if offer.docstatus == 0 else offer.status,
			"joining": str(offer.offer_date) if offer.offer_date else None} if offer else None,
		"onboarding": {"name": onb.name, "status": onb.boarding_status, "joining": str(onb.date_of_joining or ""),
			"submitted": bool(onb.portal_submitted_on), "linkSent": bool(onb.portal_access_key)} if onb else None,
		"bgv": bgv, "employee": emp,
	}


# ── interviews ───────────────────────────────────────────────────────────────
def _interview_rows(f, period=True):
	cond, vals = _opening_cond(f)
	where = f"iv.job_opening in (select jo.name from `tabJob Opening` jo where 1=1 {cond})" if cond else "1=1"
	if period:
		where += " and iv.scheduled_on between %(from_date)s and %(to_date)s"
		vals.update(from_date=f.from_date, to_date=f.to_date)
	rows = frappe.db.sql(f"""select iv.name, iv.job_applicant, iv.job_opening, iv.interview_round, iv.status, iv.docstatus,
			iv.scheduled_on, iv.from_time, iv.to_time, iv.custom_mode_of_interview as mode, ja.applicant_name,
			ja.custom_job_opening_title as opening_title
		from `tabInterview` iv left join `tabJob Applicant` ja on ja.name = iv.job_applicant
		where iv.docstatus < 2 and {where}""", vals, as_dict=True)
	if rows:
		names = [r.name for r in rows]
		panel = defaultdict(list)
		for d in frappe.get_all("Interview Detail", {"parent": ["in", names]}, ["parent", "interviewer"]):
			panel[d.parent].append(d.interviewer)
		given = defaultdict(set)
		for fb in frappe.get_all("Interview Feedback", {"interview": ["in", names], "docstatus": 1}, ["interview", "interviewer"]):
			given[fb.interview].add(fb.interviewer)
		for r in rows:
			r.panel = panel.get(r.name, [])
			r.feedback_given = len(given.get(r.name, ()))
	return rows


def _iv_out(r):
	return {"name": r.name, "applicant": r.job_applicant, "applicantName": r.applicant_name, "opening": r.job_opening,
		"openingTitle": r.opening_title or r.job_opening, "round": r.interview_round, "status": r.status,
		"submitted": r.docstatus == 1, "date": str(r.scheduled_on) if r.scheduled_on else None,
		"time": str(r.from_time or "")[:5], "mode": r.mode,
		"interviewers": [frappe.utils.get_fullname(u) for u in r.get("panel", [])],
		"feedback": f"{r.get('feedback_given', 0)}/{len(r.get('panel', []))}"}


@frappe.whitelist()
def get_interviews(filters=None, segment="upcoming"):
	_check_admin_access()
	f = _filters(filters)
	today = getdate(nowdate())
	now_rows = _interview_rows(f, period=False)
	period_rows = _interview_rows(f, period=True)
	pick = {
		"today": lambda r: r.scheduled_on and getdate(r.scheduled_on) == today,
		"upcoming": lambda r: r.scheduled_on and getdate(r.scheduled_on) >= today and r.status == "Pending",
		"feedback": lambda r: r.scheduled_on and getdate(r.scheduled_on) < today and r.status in ("Pending", "Under Review"),
		"completed": lambda r: r.status in ("Cleared", "Rejected"),
		"all": lambda r: True,
	}
	# today / upcoming / feedback are "now" queues; completed / all follow the period
	source = lambda k: period_rows if k in ("completed", "all") else now_rows  # noqa: E731
	counts = {k: len([r for r in source(k) if p(r)]) for k, p in pick.items()}
	sel = [r for r in source(segment) if pick.get(segment, pick["upcoming"])(r)]
	sel.sort(key=lambda r: (str(r.scheduled_on or ""), str(r.from_time or "")), reverse=segment in ("completed", "all", "feedback"))
	return {"rows": [_iv_out(r) for r in sel[:300]], "total": len(sel), "counts": counts}


# ── offers ───────────────────────────────────────────────────────────────────
def _offer_rows(f, period=True):
	cond, vals = _opening_cond(f)
	where = f"ja.job_title in (select jo.name from `tabJob Opening` jo where 1=1 {cond})" if cond else "1=1"
	if f.get("company"):
		where = f"({where} or jof.company = %(company)s)" if not f.get("department") else where
	if period:
		where += " and date(jof.creation) between %(from_date)s and %(to_date)s"
		vals.update(from_date=f.from_date, to_date=f.to_date)
	rows = frappe.db.sql(f"""select jof.name, jof.job_applicant, jof.applicant_name, jof.designation, jof.company,
			jof.status, jof.docstatus, jof.offer_date, jof.creation, jof.modified, jof.custom_offer_responded_on,
			ja.job_title as opening, ja.custom_job_opening_title as opening_title, ja.creation as applied_on,
			(select eo.name from `tabEmployee Onboarding` eo where eo.job_offer = jof.name and eo.docstatus < 2 limit 1) as onboarding
		from `tabJob Offer` jof left join `tabJob Applicant` ja on ja.name = jof.job_applicant
		where jof.docstatus < 2 and {where}""", vals, as_dict=True)
	return rows


@frappe.whitelist()
def get_offers(filters=None, segment="awaiting"):
	_check_admin_access()
	f = _filters(filters)
	today = getdate(nowdate())
	rows = _offer_rows(f, period=False)
	seg = {
		"draft": lambda o: o.docstatus == 0,
		"awaiting": lambda o: o.docstatus == 1 and o.status == "Awaiting Response",
		"accepted": lambda o: o.docstatus == 1 and o.status == "Accepted",
		"accepted_no_onboarding": lambda o: o.docstatus == 1 and o.status == "Accepted" and not o.onboarding,
		"rejected": lambda o: o.status == "Rejected",
		"all": lambda o: True,
	}
	counts = {k: len([o for o in rows if p(o)]) for k, p in seg.items()}
	sel = sorted([o for o in rows if seg.get(segment, seg["all"])(o)], key=lambda o: o.modified, reverse=True)
	out = []
	for o in sel[:300]:
		status = "Draft" if o.docstatus == 0 else o.status
		pending = {"Draft": "Submit to release offer", "Awaiting Response": "Awaiting candidate response",
			"Accepted": "Open onboarding" if o.onboarding else "Start onboarding", "Rejected": ""}.get(status, "")
		out.append({"name": o.name, "applicant": o.job_applicant, "applicantName": o.applicant_name, "designation": o.designation,
			"opening": o.opening, "openingTitle": o.opening_title or o.opening, "company": o.company, "status": status,
			"offerCreated": str(o.creation)[:10], "joining": str(o.offer_date) if o.offer_date else None,
			"daysToJoin": date_diff(o.offer_date, today) if o.offer_date else None,
			"waitingDays": date_diff(today, o.modified) if status == "Awaiting Response" else None,
			"respondedOn": str(o.custom_offer_responded_on)[:16] if o.custom_offer_responded_on else None,
			"onboarding": o.onboarding, "pendingAction": pending})
	return {"rows": out, "total": len(sel), "counts": counts}


# ── onboarding ───────────────────────────────────────────────────────────────
def _onboarding_rows(f):
	filters = {"docstatus": ["<", 2]}
	if f.get("company"):
		filters["company"] = f.company
	if f.get("department"):
		filters["department"] = f.department
	rows = frappe.get_all("Employee Onboarding", filters, ["name", "employee_name", "employee", "job_applicant", "job_offer",
		"designation", "department", "company", "boarding_status", "date_of_joining", "boarding_begins_on", "docstatus",
		"portal_access_key", "portal_link_sent_on", "portal_link_expires_on", "portal_link_sent_by", "portal_submitted_on",
		"portal_documents_completed_on", "creation", "modified"])
	names = [r.name for r in rows]
	docs = defaultdict(lambda: {"mandatory": 0, "received": 0, "submitted": 0, "missing": []})
	if names:
		for c in frappe.get_all("Onboarding Checklist Item", {"parent": ["in", names], "parenttype": "Employee Onboarding"},
				["parent", "document_type", "mandatory", "candidate_submitted", "hr_received"]):
			d = docs[c.parent]
			if c.mandatory:
				d["mandatory"] += 1
				d["received"] += cint(c.hr_received)
				if not c.hr_received:
					d["missing"].append(c.document_type)
			d["submitted"] += cint(c.candidate_submitted)
		bgv = {}
		apps = [r.job_applicant for r in rows if r.job_applicant]
		if apps:
			for b in frappe.get_all("Background Verification", {"job_applicant": ["in", apps], "docstatus": ["<", 2]},
					["job_applicant", "status"]):
				bgv[b.job_applicant] = b.status
		for r in rows:
			d = docs[r.name]
			r.docs_mandatory, r.docs_received, r.docs_missing = d["mandatory"], d["received"], d["missing"]
			r.bgv = bgv.get(r.job_applicant)
	return rows


def _onb_stage(o):
	now = now_datetime()
	if o.boarding_status == "Completed":
		return "Completed"
	if not o.portal_access_key:
		return "Link not sent"
	if not o.portal_submitted_on:
		return "Link expired" if o.portal_link_expires_on and o.portal_link_expires_on < now else "Awaiting candidate"
	if o.docs_missing:
		return "Documents pending"
	return "Ready for HR"


def _onb_out(o):
	today = getdate(nowdate())
	readiness = round(100 * o.docs_received / o.docs_mandatory) if o.get("docs_mandatory") else None
	return {"name": o.name, "employeeName": o.employee_name, "employee": o.employee, "applicant": o.job_applicant,
		"offer": o.job_offer, "designation": o.designation, "department": o.department, "status": o.boarding_status,
		"stage": _onb_stage(o), "joining": str(o.date_of_joining) if o.date_of_joining else None,
		"daysToJoin": date_diff(o.date_of_joining, today) if o.date_of_joining else None,
		"docsReceived": o.get("docs_received", 0), "docsMandatory": o.get("docs_mandatory", 0), "readiness": readiness,
		"missing": (o.get("docs_missing") or [])[:6], "bgv": o.get("bgv"),
		"owner": frappe.utils.get_fullname(o.portal_link_sent_by) if o.portal_link_sent_by else None,
		"linkExpires": str(o.portal_link_expires_on)[:16] if o.portal_link_expires_on else None,
		"submittedOn": str(o.portal_submitted_on)[:16] if o.portal_submitted_on else None,
		"lastUpdated": str(o.modified)[:16]}


@frappe.whitelist()
def get_onboarding(filters=None, segment="active"):
	_check_admin_access()
	f = _filters(filters)
	today = getdate(nowdate())
	rows = _onboarding_rows(f)
	active = [o for o in rows if o.boarding_status != "Completed"]
	seg = {
		"active": lambda o: o.boarding_status != "Completed",
		"joining": lambda o: o.boarding_status != "Completed" and o.date_of_joining and 0 <= date_diff(o.date_of_joining, today) <= 30,
		"not_sent": lambda o: _onb_stage(o) == "Link not sent",
		"expired": lambda o: _onb_stage(o) == "Link expired",
		"documents": lambda o: _onb_stage(o) == "Documents pending",
		"overdue": lambda o: o.boarding_status != "Completed" and o.date_of_joining and getdate(o.date_of_joining) < today,
		"completed": lambda o: o.boarding_status == "Completed",
	}
	counts = {k: len([o for o in rows if p(o)]) for k, p in seg.items()}
	sel = [o for o in rows if seg.get(segment, seg["active"])(o)]
	sel.sort(key=lambda o: (o.date_of_joining is None, str(o.date_of_joining or "")), reverse=segment == "completed")
	completed = [o for o in rows if o.boarding_status == "Completed"]
	durations = [date_diff(o.modified, o.creation) for o in completed]
	missing_docs = Counter(d for o in active for d in (o.docs_missing or []))
	bgv = Counter(o.bgv for o in rows if o.bgv)
	return {
		"rows": [_onb_out(o) for o in sel[:300]], "total": len(sel), "counts": counts,
		"stageCounts": dict(Counter(_onb_stage(o) for o in rows)),
		"completionRate": round(100 * len(completed) / len(rows), 1) if rows else None,
		"avgDaysToComplete": round(sum(durations) / len(durations), 1) if durations else None,
		"missingDocuments": [{"document": k, "count": v} for k, v in missing_docs.most_common(8)],
		"bgv": dict(bgv),
	}


# ── analytics ────────────────────────────────────────────────────────────────
@frappe.whitelist()
def get_analytics(filters=None):
	_check_admin_access()
	f = _filters(filters)
	today = getdate(nowdate())
	cond, vals = _opening_cond(f)
	scope = f"and ja.job_title in (select jo.name from `tabJob Opening` jo where 1=1 {cond})" if cond else ""
	start = add_months(today.replace(day=1), -11)
	monthly = {r.ym: r.n for r in frappe.db.sql(f"""select date_format(ja.creation, '%%Y-%%m') ym, count(*) n
		from `tabJob Applicant` ja where ja.creation >= %(start)s {scope} group by ym""", {**vals, "start": start}, as_dict=True)}
	months = [add_months(start, i) for i in range(12)]
	daily = {str(r.d): r.n for r in frappe.db.sql(f"""select date(ja.creation) d, count(*) n from `tabJob Applicant` ja
		where date(ja.creation) between %(from_date)s and %(to_date)s {scope} group by d""",
		{**vals, "from_date": f.from_date, "to_date": f.to_date}, as_dict=True)}
	days = [add_days(f.from_date, i) for i in range(min(date_diff(f.to_date, f.from_date) + 1, 120))]

	period_apps = _applicants(f)
	sources = Counter(a.source or "Not recorded" for a in period_apps)
	channels = Counter(a.channel or "Not recorded" for a in period_apps)  # QR Code / Link / Website / Added by HR
	open_ops = [o for o in _openings(f) if o.status == "Open"]
	by_dept = Counter(o.department or "No department" for o in open_ops)
	by_opening = sorted(_opening_stats(f, open_ops), key=lambda o: -o["applicants"])[:10]

	offers = _offer_rows(f, period=False)
	responded = [o for o in offers if o.docstatus == 1 and o.status in ("Accepted", "Rejected")
		and f.from_date <= getdate(o.custom_offer_responded_on or o.modified) <= f.to_date]
	accepted = [o for o in responded if o.status == "Accepted"]
	tth = [date_diff(o.custom_offer_responded_on or o.modified, o.applied_on) for o in accepted if o.applied_on]

	onb_monthly = {r.ym: r.n for r in frappe.db.sql("""select date_format(modified, '%%Y-%%m') ym, count(*) n
		from `tabEmployee Onboarding` where boarding_status = 'Completed' and docstatus < 2 and modified >= %s group by ym""",
		start, as_dict=True)}
	onb = _onboarding_rows(f)
	bottlenecks = Counter(_onb_stage(o) for o in onb if o.boarding_status != "Completed")

	ages = Counter()
	info_apps = _applicants(f, period=False, extra="and ja.status in ('Open', 'Replied')")
	info = _stage_info([a.name for a in info_apps])
	for a in info_apps:
		if _stage(a, info) != "In Review":
			continue
		d = date_diff(today, a.creation)
		ages["0-3 days" if d <= 3 else "4-7 days" if d <= 7 else "8-14 days" if d <= 14 else "15-30 days" if d <= 30 else "30+ days"] += 1

	ivs = _interview_rows(f, period=True)
	workload = defaultdict(lambda: {"interviews": 0, "upcoming": 0, "feedbackPending": 0})
	given = defaultdict(set)
	if ivs:
		for fb in frappe.get_all("Interview Feedback", {"interview": ["in", [r.name for r in ivs]], "docstatus": 1},
				["interview", "interviewer"]):
			given[fb.interview].add(fb.interviewer)
	for r in ivs:
		for u in r.panel:
			w = workload[u]
			w["interviews"] += 1
			if r.scheduled_on and getdate(r.scheduled_on) >= today and r.status == "Pending":
				w["upcoming"] += 1
			if r.scheduled_on and getdate(r.scheduled_on) < today and r.status in ("Pending", "Under Review") and u not in given[r.name]:
				w["feedbackPending"] += 1
	return {
		"monthly": [{"label": m.strftime("%b %y"), "count": monthly.get(m.strftime("%Y-%m"), 0)} for m in months],
		"daily": [{"label": str(d), "count": daily.get(str(d), 0)} for d in days],
		"sources": [{"label": k, "count": v} for k, v in sources.most_common()],
		"channels": [{"label": k, "count": v} for k, v in channels.most_common()],
		"byDepartment": [{"label": k, "count": v} for k, v in by_dept.most_common()],
		"byOpening": [{"name": o["name"], "label": o["title"], "count": o["applicants"]} for o in by_opening],
		"offerAcceptance": {"accepted": len(accepted), "responded": len(responded),
			"rate": round(100 * len(accepted) / len(responded), 1) if responded else None},
		"timeToHire": {"avg": round(sum(tth) / len(tth), 1) if tth else None, "count": len(tth),
			"min": min(tth) if tth else None, "max": max(tth) if tth else None},
		"onboardingMonthly": [{"label": m.strftime("%b %y"), "count": onb_monthly.get(m.strftime("%Y-%m"), 0)} for m in months],
		"bottlenecks": [{"label": k, "count": v} for k, v in bottlenecks.most_common()],
		"reviewAging": [{"label": k, "count": ages.get(k, 0)} for k in ["0-3 days", "4-7 days", "8-14 days", "15-30 days", "30+ days"]],
		"workload": sorted([{"user": u, "name": frappe.utils.get_fullname(u), **w} for u, w in workload.items()],
			key=lambda w: (-w["feedbackPending"], -w["upcoming"], -w["interviews"])),
	}


# ── search / filter options ──────────────────────────────────────────────────
@frappe.whitelist()
def search(q):
	_check_admin_access()
	q = (q or "").strip()
	if len(q) < 2:
		return []
	like = f"%{q}%"
	out = []
	for a in frappe.get_all("Job Applicant", or_filters={"applicant_name": ["like", like], "email_id": ["like", like],
			"phone_number": ["like", like], "name": ["like", like]}, fields=["name", "applicant_name", "custom_job_opening_title"], limit=6):
		out.append({"type": "Applicant", "doctype": "Job Applicant", "name": a.name, "label": a.applicant_name or a.name,
			"sub": a.custom_job_opening_title or ""})
	for o in frappe.get_all("Job Opening", or_filters={"job_title": ["like", like], "name": ["like", like],
			"department": ["like", like]}, fields=["name", "job_title", "department", "status"], limit=5):
		out.append({"type": "Job Opening", "doctype": "Job Opening", "name": o.name, "label": o.job_title or o.name,
			"sub": f"{o.department or ''} · {o.status}"})
	for e in frappe.get_all("Employee Onboarding", or_filters={"employee_name": ["like", like], "name": ["like", like]},
			fields=["name", "employee_name", "boarding_status"], limit=4):
		out.append({"type": "Onboarding", "doctype": "Employee Onboarding", "name": e.name, "label": e.employee_name or e.name,
			"sub": e.boarding_status})
	for e in frappe.get_all("Employee", or_filters={"employee_name": ["like", like], "name": ["like", like]},
			fields=["name", "employee_name", "department"], limit=4):
		out.append({"type": "Employee", "doctype": "Employee", "name": e.name, "label": e.employee_name or e.name,
			"sub": e.department or ""})
	return out


@frappe.whitelist()
def get_filter_options():
	_check_admin_access()
	return {
		"companies": frappe.get_all("Company", pluck="name", order_by="name"),
		"departments": sorted({d for d in frappe.get_all("Job Opening", pluck="department") if d}),
		"user": frappe.utils.get_fullname(frappe.session.user),
	}
