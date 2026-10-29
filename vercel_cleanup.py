# vercel_cleanup.py
import os, sys, time, requests

TOKEN = os.environ["VERCEL_TOKEN"]
PROJECT_ID = os.environ["VERCEL_PROJECT_ID"]      # prj_xxx
TEAM_ID = os.environ.get("VERCEL_TEAM_ID")        # team_xxx
KEEP = 3                                          # production + 2 latest old
DRY_RUN = "--dry-run" in sys.argv

H = {"Authorization": f"Bearer {TOKEN}"}
team = {"teamId": TEAM_ID} if TEAM_ID else {}

# 1) the deployment that is live right now (never delete it)
proj = requests.get(f"https://api.vercel.com/v9/projects/{PROJECT_ID}",
                    headers=H, params=team).json()
live_id = (proj.get("targets", {}).get("production") or {}).get("id")

# 2) list all deployments, newest first
deps, until = [], None
while True:
    p = {"projectId": PROJECT_ID, "limit": 100, **team}
    if until: p["until"] = until
    r = requests.get("https://api.vercel.com/v6/deployments", headers=H, params=p).json()
    deps += r.get("deployments", [])
    until = r.get("pagination", {}).get("next")
    if not until: break

keep = {d["uid"] for d in deps[:KEEP]}
if live_id: keep.add(live_id)

# 3) delete the rest
for d in deps:
    if d["uid"] in keep: continue
    print("delete", d["uid"], d.get("name"), "(dry run)" if DRY_RUN else "")
    if not DRY_RUN:
        requests.delete(f"https://api.vercel.com/v13/deployments/{d['uid']}",
                        headers=H, params=team)
        time.sleep(0.3)   # avoid rate limits
print(f"kept {len(keep)}, checked {len(deps)}")
