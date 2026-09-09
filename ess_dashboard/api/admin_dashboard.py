# ess_dashboard/api/admin_dashboard.py
#
# Company-wide HR ops dashboard for HR/System Manager staff - the
# counterpart to api/dashboard.py, which is scoped to the logged-in
# user's own Employee record. Everything here is org-wide, so every
# entry point is gated by _check_admin_access() before touching data.

import frappe
from frappe.utils import add_days, getdate, nowdate, today

ALLOWED_ROLES = {"System Manager", "HR Manager"}


def _has_admin_access():
    if frappe.session.user == "Administrator":
        return True
    user_roles = set(frappe.get_roles(frappe.session.user))
    return bool(user_roles & ALLOWED_ROLES)


def _check_admin_access():
    if not _has_admin_access():
        frappe.throw(
            frappe._("You need the HR Manager or System Manager role to view this dashboard."),
            frappe.PermissionError,
        )


@frappe.whitelist()
def get_admin_dashboard_data():
    _check_admin_access()

    today_date = getdate(today())

    # Headcount
    total_active = frappe.db.count("Employee", {"status": "Active"})
    month_start = today_date.replace(day=1)
    new_joiners = frappe.db.count(
        "Employee",
        {"status": "Active", "date_of_joining": ["between", [month_start, today_date]]},
    )

    dept_rows = frappe.get_all(
        "Employee",
        filters={"status": "Active"},
        fields=["department"],
    )
    dept_counts = {}
    for r in dept_rows:
        key = r.department or "Unassigned"
        # Department names carry a trailing " - <Abbr>" suffix - strip it
        # for a readable chart label.
        label = key.split(" - ")[0] if key != "Unassigned" else key
        dept_counts[label] = dept_counts.get(label, 0) + 1
    all_departments = sorted(dept_counts.items(), key=lambda kv: kv[1], reverse=True)
    # Multi-branch orgs can have 100+ distinct departments with a long tail
    # of tiny ones - a bar chart that long is unreadable, so the chart only
    # ever shows the biggest 10; department_count_total keeps the true
    # count for the card's subtitle.
    department_headcount = [{"department": k, "count": v} for k, v in all_departments[:10]]
    department_count_total = len(all_departments)

    # Today's attendance breakdown across all active employees
    attendance_rows = frappe.get_all(
        "Attendance",
        filters={"attendance_date": today_date, "docstatus": 1},
        fields=["status"],
    )
    attendance_counts = {}
    for r in attendance_rows:
        attendance_counts[r.status] = attendance_counts.get(r.status, 0) + 1
    marked_total = sum(attendance_counts.values())
    today_attendance = {
        "present": attendance_counts.get("Present", 0),
        "absent": attendance_counts.get("Absent", 0),
        "onLeave": attendance_counts.get("On Leave", 0),
        "halfDay": attendance_counts.get("Half Day", 0),
        "weekOff": attendance_counts.get("Week Off", 0),
        "holiday": attendance_counts.get("Holiday", 0),
        "unmarked": max(total_active - marked_total, 0),
    }

    # Pending approvals - the list below is capped for display, but the
    # KPI card needs the true total, not just how many rows we fetched.
    leave_filters = {"status": "Open"}
    expense_filters = {"docstatus": 1, "approval_status": "Draft"}

    pending_leaves_total = frappe.db.count("Leave Application", leave_filters)
    pending_expenses_total = frappe.db.count("Expense Claim", expense_filters)

    pending_leaves = frappe.get_all(
        "Leave Application",
        filters=leave_filters,
        fields=["name", "employee_name", "leave_type", "from_date", "to_date", "total_leave_days"],
        order_by="from_date asc",
        limit=20,
    )

    pending_expenses = frappe.get_all(
        "Expense Claim",
        filters=expense_filters,
        fields=["name", "employee_name", "total_claimed_amount", "posting_date"],
        order_by="posting_date asc",
        limit=20,
    )

    # Pending attendance regularizations - a custom doctype (olscpl_hrms)
    # with its own workflow_state, not a stock HRMS approval flow, so it
    # isn't covered by the leave/expense filters above.
    pending_regularizations = []
    pending_regularizations_total = 0
    if frappe.db.exists("DocType", "Attendance Regularization"):
        reg_filters = {"workflow_state": "Pending"}
        pending_regularizations_total = frappe.db.count("Attendance Regularization", reg_filters)
        pending_regularizations = frappe.get_all(
            "Attendance Regularization",
            filters=reg_filters,
            fields=["name", "employee_name", "for_date", "regularization_type", "reason"],
            order_by="for_date asc",
            limit=20,
        )

    # Pending offboarding clearances - a custom doctype (olscpl_hrms) that
    # tracks per-department sign-off (Accounts, IT, Admin, ...) for an
    # exiting employee's Employee Separation record.
    pending_clearances = []
    pending_clearances_total = 0
    if frappe.db.exists("DocType", "Employee Separation Clearance"):
        clearance_filters = {"status": "Pending"}
        pending_clearances_total = frappe.db.count("Employee Separation Clearance", clearance_filters)
        pending_clearances = frappe.get_all(
            "Employee Separation Clearance",
            filters=clearance_filters,
            fields=["name", "employee_separation", "employee", "clearance_type", "approver"],
            order_by="employee_separation asc",
            limit=20,
        )
        emp_names = list({r.employee for r in pending_clearances if r.employee})
        emp_name_map = (
            {e.name: e.employee_name for e in frappe.get_all(
                "Employee", filters={"name": ["in", emp_names]}, fields=["name", "employee_name"]
            )}
            if emp_names
            else {}
        )
        approver_names = list({r.approver for r in pending_clearances if r.approver})
        approver_name_map = (
            {e.name: e.employee_name for e in frappe.get_all(
                "Employee", filters={"name": ["in", approver_names]}, fields=["name", "employee_name"]
            )}
            if approver_names
            else {}
        )

    # Upcoming birthdays & work anniversaries (next 30 days, wrapping
    # year-end). At this employee count a 30-day window can easily hold
    # several hundred people - each list is capped to the soonest 15 so
    # the card stays a normal-sized list rather than a giant scroll.
    upcoming_birthdays_all = _upcoming_yearly_events("date_of_birth", today_date, 30)
    upcoming_anniversaries_all = _upcoming_yearly_events("date_of_joining", today_date, 30)
    upcoming_birthdays = upcoming_birthdays_all[:15]
    upcoming_anniversaries = upcoming_anniversaries_all[:15]

    return {
        "headcount": {
            "totalActive": total_active,
            "newJoinersThisMonth": new_joiners,
        },
        "departmentHeadcount": department_headcount,
        "departmentCountTotal": department_count_total,
        "todayAttendance": today_attendance,
        "pendingLeavesTotal": pending_leaves_total,
        "pendingExpensesTotal": pending_expenses_total,
        "pendingLeaves": [
            {
                "name": r.name,
                "employee": r.employee_name,
                "type": r.leave_type,
                "from": str(r.from_date),
                "to": str(r.to_date),
                "days": r.total_leave_days,
            }
            for r in pending_leaves
        ],
        "pendingExpenses": [
            {
                "name": r.name,
                "employee": r.employee_name,
                "amount": r.total_claimed_amount,
                "date": str(r.posting_date),
            }
            for r in pending_expenses
        ],
        "pendingRegularizationsTotal": pending_regularizations_total,
        "pendingRegularizations": [
            {
                "name": r.name,
                "employee": r.employee_name,
                "date": str(r.for_date) if r.for_date else None,
                "type": r.regularization_type,
                "reason": r.reason,
            }
            for r in pending_regularizations
        ],
        "pendingClearancesTotal": pending_clearances_total,
        "pendingClearances": [
            {
                "employeeSeparation": r.employee_separation,
                "employee": emp_name_map.get(r.employee, r.employee),
                "type": r.clearance_type,
                "approver": approver_name_map.get(r.approver, r.approver),
            }
            for r in pending_clearances
        ],
        "upcomingBirthdays": upcoming_birthdays,
        "upcomingBirthdaysTotal": len(upcoming_birthdays_all),
        "upcomingAnniversaries": upcoming_anniversaries,
        "upcomingAnniversariesTotal": len(upcoming_anniversaries_all),
    }


def _upcoming_yearly_events(date_field, today_date, window_days):
    """Active employees whose date_field's month/day falls within the next
    window_days, wrapping across a year-end. Used for both birthdays
    (date_of_birth) and work anniversaries (date_of_joining) - same
    day-of-year comparison, just a different source field and, for
    anniversaries, the doc's actual year matters for "N years" too."""
    rows = frappe.get_all(
        "Employee",
        filters={"status": "Active", date_field: ["is", "set"]},
        fields=["name", "employee_name", date_field],
    )

    upcoming = []
    for r in rows:
        raw = r.get(date_field)
        if not raw:
            continue
        d = getdate(raw)
        # Next occurrence of this month/day on or after today.
        try:
            next_date = d.replace(year=today_date.year)
        except ValueError:
            # Feb 29 in a non-leap year.
            next_date = d.replace(year=today_date.year, day=28)
        if next_date < today_date:
            try:
                next_date = d.replace(year=today_date.year + 1)
            except ValueError:
                next_date = d.replace(year=today_date.year + 1, day=28)

        if today_date <= next_date <= add_days(today_date, window_days):
            entry = {
                "employee": r.employee_name,
                "date": str(next_date),
            }
            if date_field == "date_of_joining":
                entry["years"] = next_date.year - d.year
            upcoming.append(entry)

    upcoming.sort(key=lambda x: x["date"])
    return upcoming
