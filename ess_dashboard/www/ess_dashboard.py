import frappe

from ess_dashboard.asset_version import asset_v

no_cache = 1


def get_context(context):
	if frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/ess-dashboard"
		raise frappe.Redirect
	context.no_sidebar = 1
	context.v_dashboard_css = asset_v("css/dashboard.css")
	context.v_dashboard_js = asset_v("js/dashboard.js")
