# ess_dashboard/asset_version.py
#
# These dashboards' JS/CSS are plain files under public/ (no build step,
# unlike frappe's own desk.bundle.<hash>.css), served at a fixed URL that
# never changes when the file's content does - so once a browser caches
# e.g. admin_dashboard.js, editing the file on the server has no visible
# effect until that cache expires or the user hard-refreshes. asset_v()
# appends the file's own mtime as a query string, so the URL itself
# changes on every edit and browsers fetch the new content automatically.
# Same technique as arjun_theme.hooks._v().
import os

_PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "public")


def asset_v(relpath):
	abs_path = os.path.join(_PUBLIC_DIR, relpath)
	try:
		return str(int(os.path.getmtime(abs_path)))
	except OSError:
		return "0"
