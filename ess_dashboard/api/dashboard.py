# ess_dashboard/api/dashboard.py
#
# One whitelisted endpoint that returns everything the ESS dashboard
# needs in a single call. Scoped strictly to the logged-in user's own
# linked Employee record - same permission model arjun_chatbot already
# uses (frappe.session.user -> Employee.user_id), never a doctype the
# caller passes in.

import frappe
from frappe.utils import add_months, get_last_day, getdate, nowdate


def _current_employee():
	if frappe.session.user == "Guest":
		return None
	return frappe.db.get_value("Employee", {"user_id": frappe.session.user, "status": "Active"}, "name")


@frappe.whitelist()
def get_dashboard_data():
	employee = _current_employee()
	if not employee:
		frappe.throw(
			frappe._("No active Employee record is linked to your account. Please check with HR."),
			frappe.DoesNotExistError,
		)

	emp = frappe.get_doc("Employee", employee)

	leave_balance = []
	try:
		from hrms.hr.doctype.leave_application.leave_application import get_leave_details

		allocation = (get_leave_details(employee, nowdate()) or {}).get("leave_allocation") or {}
		leave_balance = [
			{"type": k, "remaining": v.get("remaining_leaves"), "total": v.get("total_leaves")}
			for k, v in allocation.items()
		]
	except Exception:
		frappe.log_error(title="ESS Dashboard: leave balance failed")

	today = getdate(nowdate())
	attendance_by_month = []
	for i in range(5, -1, -1):
		month_date = add_months(today, -i)
		start = month_date.replace(day=1)
		end = get_last_day(start)
		rows = frappe.get_all(
			"Attendance",
			filters={"employee": employee, "attendance_date": ["between", [start, end]], "docstatus": 1},
			fields=["status"],
		)
		counts = {}
		for r in rows:
			counts[r.status] = counts.get(r.status, 0) + 1
		attendance_by_month.append(
			{
				"month": start.strftime("%b %Y"),
				"present": counts.get("Present", 0),
				"absent": counts.get("Absent", 0),
				"weekOff": counts.get("Week Off", 0),
				"holiday": counts.get("Holiday", 0),
				"onLeave": counts.get("On Leave", 0),
			}
		)

	leave_apps = frappe.get_all(
		"Leave Application",
		filters={"employee": employee},
		fields=["leave_type", "from_date", "to_date", "status", "total_leave_days"],
		order_by="from_date desc",
		limit=15,
	)

	recent_attendance = frappe.get_all(
		"Attendance",
		filters={"employee": employee, "docstatus": 1},
		fields=["attendance_date", "status", "working_hours"],
		order_by="attendance_date desc",
		limit=40,
	)

	slip = frappe.get_all(
		"Salary Slip",
		filters={"employee": employee, "docstatus": 1},
		fields=["name", "start_date", "end_date", "net_pay", "gross_pay", "total_deduction", "status"],
		order_by="end_date desc",
		limit=1,
	)

	expenses = frappe.get_all(
		"Expense Claim",
		filters={"employee": employee},
		fields=["name", "posting_date", "total_claimed_amount", "status", "approval_status"],
		order_by="posting_date desc",
		limit=15,
	)

	upcoming_holidays = []
	if emp.holiday_list:
		hl = frappe.get_doc("Holiday List", emp.holiday_list)
		upcoming_holidays = [
			{"date": str(h.holiday_date), "description": h.description}
			for h in hl.holidays
			if getdate(h.holiday_date) >= today
		]
		upcoming_holidays.sort(key=lambda x: x["date"])

	return {
		"employee": {
			"name": emp.employee_name,
			"employeeId": emp.name,
			"designation": emp.designation,
			"department": emp.department,
			"company": emp.company,
			"dateOfJoining": str(emp.date_of_joining) if emp.date_of_joining else None,
			"status": emp.status,
			"email": emp.company_email or emp.personal_email,
			"mobile": emp.cell_number,
			"shift": emp.default_shift,
			"weeklyOff": emp.fixed_off_day,
			"noticePeriod": emp.notice_number_of_days,
			"reportsTo": emp.reports_to,
		},
		"leaveBalance": leave_balance,
		"attendanceByMonth": attendance_by_month,
		"leaveApplications": [
			{
				"type": r.leave_type,
				"from": str(r.from_date),
				"to": str(r.to_date),
				"status": r.status,
				"days": r.total_leave_days,
			}
			for r in leave_apps
		],
		"recentAttendance": [
			{"date": str(r.attendance_date), "status": r.status, "hours": r.working_hours}
			for r in recent_attendance
		],
		"latestPayslip": (
			{
				"name": slip[0].name,
				"start": str(slip[0].start_date),
				"end": str(slip[0].end_date),
				"netPay": slip[0].net_pay,
				"grossPay": slip[0].gross_pay,
				"totalDeduction": slip[0].total_deduction,
				"status": slip[0].status,
			}
			if slip
			else None
		),
		"expenseClaims": [
			{
				"name": r.name,
				"date": str(r.posting_date),
				"amount": r.total_claimed_amount,
				"status": r.status,
				"approvalStatus": r.approval_status,
			}
			for r in expenses
		],
		"upcomingHolidays": upcoming_holidays[:5],
	}


@frappe.whitelist()
def get_attendance_month(year, month):
	"""One calendar month of attendance for the logged-in user's own
	Employee, for the big calendar view on the dashboard. Separate from
	get_dashboard_data (which only ships a rolling 6-month summary and a
	40-row recent list) so the calendar can page to any month, past or
	future, without bloating the main payload."""
	employee = _current_employee()
	if not employee:
		frappe.throw(
			frappe._("No active Employee record is linked to your account. Please check with HR."),
			frappe.DoesNotExistError,
		)

	year = int(year)
	month = int(month)
	start = getdate(f"{year}-{month:02d}-01")
	end = get_last_day(start)

	rows = frappe.get_all(
		"Attendance",
		filters={"employee": employee, "attendance_date": ["between", [start, end]], "docstatus": 1},
		fields=["attendance_date", "status", "working_hours"],
	)

	return {
		"year": year,
		"month": month,
		"days": [
			{"date": str(r.attendance_date), "status": r.status, "hours": r.working_hours} for r in rows
		],
	}
