import frappe

from ess_dashboard.asset_version import asset_v

no_cache = 1

ALLOWED_ROLES = {"System Manager", "HR Manager"}


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/onboarding-dashboard"
		raise frappe.Redirect

	if frappe.session.user != "Administrator":
		user_roles = set(frappe.get_roles(frappe.session.user))
		if not (user_roles & ALLOWED_ROLES):
			frappe.local.flags.redirect_location = "/app/hrms-home"
			raise frappe.Redirect

	context.no_sidebar = 1
	context.v_dashboard_css = asset_v("css/dashboard.css")
	context.v_onboarding_js = asset_v("js/onboarding_dashboard.js")
