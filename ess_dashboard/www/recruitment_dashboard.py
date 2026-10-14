# /recruitment-dashboard - Recruitment & Onboarding control centre (data:
# api/recruitment_dashboard.py). Separate from /onboarding-dashboard, which
# stays as it is. Same access rule as the other dashboards.
import frappe

from ess_dashboard.asset_version import asset_v

no_cache = 1

ALLOWED_ROLES = {"System Manager", "HR Manager"}


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/recruitment-dashboard"
		raise frappe.Redirect

	if frappe.session.user != "Administrator" and not (set(frappe.get_roles()) & ALLOWED_ROLES):
		frappe.local.flags.redirect_location = "/app/atlas-home"
		raise frappe.Redirect

	context.no_sidebar = 1
	context.v_css = asset_v("css/recruitment.css")
	context.v_js = asset_v("js/recruitment_dashboard.js")
