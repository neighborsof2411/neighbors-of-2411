#!/usr/bin/env python3
"""Keep data/meetings.yaml in step with the City of Orange's agenda system.

Runs on a schedule (.github/workflows/meeting-watch.yml). For each upcoming
meeting already in data/meetings.yaml it reads Legistar and the posted agenda
PDF, because the listing alone isn't enough: only the Sept 21 cancellation
ever set the "Meeting Cancelled" location; Oct 5 and Nov 2 were visible only
in the PDF notice, and the City's calendar page kept listing them.

  Cancellation notice      -> marks the meeting cancelled (published), alerts
  Agenda, project absent   -> adds the link, "not on agenda" (published), alerts
  Agenda mentions project  -> changes NOTHING on the site, alerts for approval
  Unreadable or unexpected -> changes nothing, alerts

Never adds or deletes a meeting. Alerts are GitHub issues, which GitHub emails
to the repo's watchers. Issues the site already acted on are closed on
creation; ones needing a person stay open. Seen agendas are remembered in
.github/meeting-watch-state.json so each one alerts only once.
"""
import argparse, datetime, io, json, os, re, subprocess, sys, urllib.parse, urllib.request
from pypdf import PdfReader

API = "https://webapi.legistar.com/v1/cityoforange/events"
BODIES = {"Planning Commission": "Planning Commission", "Orange City Council": "City Council"}
PROJECT_TERMS = ["2411", "glassell", "rexford", "25-0013", "env25-0002", "env 25-0002",
                 "sp-1180", "site plan review no. 1180", "design review no. 5154"]
MIN_AGENDA_CHARS = 500
NOT_ON_AGENDA_NOTE = ("The City's posted agenda doesn't list 2411 Glassell. "
                      "Public comment is still open on other matters.")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "neighbors-of-2411-meeting-watch"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def events(today):
    query = urllib.parse.urlencode({"$filter": f"EventDate ge datetime'{today}'", "$orderby": "EventDate"})
    return [e for e in json.loads(fetch(f"{API}?{query}")) if e.get("EventBodyName") in BODIES]


def pdf_text(data):
    reader = PdfReader(io.BytesIO(data))
    return len(reader.pages), " ".join((p.extract_text() or "") for p in reader.pages)


def classify(location, pages, text):
    """cancelled | project | clear | unreadable, from the listing and agenda."""
    flat = re.sub(r"\s+", " ", text).lower()
    if "notice of cancellation" in flat or "cancel" in (location or "").lower():
        return "cancelled"
    if len(flat) < MIN_AGENDA_CHARS or pages < 2:
        return "unreadable"   # scanned, truncated, or a kind of notice we don't know
    if any(term in flat for term in PROJECT_TERMS):
        return "project"
    return "clear"


def find_block(text, date, body):
    """(start, end) of a meeting's entry in the YAML text, or None."""
    for m in re.finditer(r"^  - body: (.+)\n(?:    .*\n?)+", text, re.M):
        if m.group(1).strip() == body and re.search(rf'^    date: "{date}"$', m.group(0), re.M):
            return m.span()
    return None


def edit(text, date, body, change):
    span = find_block(text, date, body)
    return text[:span[0]] + change(text[span[0]:span[1]]) + text[span[1]:]


def mark_cancelled(block):
    return re.sub(r'^(    date: ".*"\n)', r"\1    cancelled: true\n", block, count=1, flags=re.M)


def mark_clear(url):
    def change(block):
        block = re.sub(r'^    agenda: .*$', f'    agenda: "{url}"', block, flags=re.M)
        block = re.sub(r'^    project: .*$', "    project: not on agenda", block, flags=re.M)
        return re.sub(r'^    note: .*$', f"    note: {NOT_ON_AGENDA_NOTE}", block, flags=re.M)
    return change


def alert(title, body, keep_open, dry_run):
    print(("[hold] " if keep_open else "[info] ") + title)
    if dry_run:
        return
    url = subprocess.run(["gh", "issue", "create", "--title", title, "--body", body],
                         check=True, capture_output=True, text=True).stdout.strip()
    if not keep_open:
        subprocess.run(["gh", "issue", "close", url], check=True)


def run(meetings_path, state_path, today, dry_run):
    text = open(meetings_path, encoding="utf-8").read()
    state = json.load(open(state_path)) if os.path.exists(state_path) else {"seen": {}}
    for e in events(today):
        date, body = e["EventDate"][:10], BODIES[e["EventBodyName"]]
        label = f"{body} {date}"
        where = f"[{label} on the City's calendar]({e.get('EventInSiteURL') or ''})"
        span = find_block(text, date, body)
        if not span:
            if state["seen"].get(f"new:{label}") is None:
                state["seen"][f"new:{label}"] = True
                alert(f"New meeting not on the site: {label}",
                      f"{where} is in the City's system but not in `data/meetings.yaml`. "
                      "The watcher never adds meetings; add it if it should be listed.", True, dry_run)
            continue
        block = text[span[0]:span[1]]
        if "cancelled: true" in block:
            continue
        agenda = e.get("EventAgendaFile") or ""
        location = e.get("EventLocation") or ""
        if not agenda and "cancel" not in location.lower():
            continue   # nothing posted yet
        stamp = f"{agenda}|{e.get('EventAgendaLastPublishedUTC')}|{location}"
        if state["seen"].get(label) == stamp:
            continue
        state["seen"][label] = stamp
        try:
            pages, pdf = pdf_text(fetch(agenda)) if agenda else (0, "")
            kind = classify(location, pages, pdf)
        except Exception as err:
            kind, pdf = "unreadable", str(err)
        link = f"[Agenda PDF]({agenda})" if agenda else "No agenda PDF."
        if kind == "cancelled":
            text = edit(text, date, body, mark_cancelled)
            alert(f"Cancelled: {label}", f"The City cancelled this meeting. The site now shows it as cancelled.\n\n{link}. {where}.", False, dry_run)
        elif kind == "clear":
            text = edit(text, date, body, mark_clear(agenda))
            alert(f"Agenda posted: {label}", f"The agenda doesn't mention the project, so the site now links it and shows \"not on agenda.\"\n\n{link}. {where}.", False, dry_run)
        elif kind == "project":
            flat = re.sub(r"\s+", " ", pdf)
            hits = [flat[max(0, m.start() - 90):m.end() + 90] for t in PROJECT_TERMS
                    for m in list(re.finditer(re.escape(t), flat, re.I))[:1]]
            alert(f"ACTION NEEDED: project may be on the {label} agenda",
                  "**Nothing on the site has changed.** The agenda matches a project search term. "
                  "Check it, then say what the site should say (a plain street mention can also match).\n\n"
                  + "\n".join(f"- ...{h}..." for h in hits) + f"\n\n{link}. {where}.", True, dry_run)
        else:
            alert(f"Please check: couldn't read the {label} agenda",
                  f"**Nothing on the site has changed.** The posted document didn't look like an agenda or a cancellation notice.\n\n{link}. {where}.", True, dry_run)
    if not dry_run:
        open(meetings_path, "w", encoding="utf-8").write(text)
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2, sort_keys=True)
            f.write("\n")
    return text


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--meetings", default="data/meetings.yaml")
    ap.add_argument("--state", default=".github/meeting-watch-state.json")
    ap.add_argument("--today", default=datetime.date.today().isoformat())
    ap.add_argument("--dry-run", action="store_true", help="print alerts; write nothing")
    args = ap.parse_args()
    try:
        run(args.meetings, args.state, args.today, args.dry_run)
    except Exception as err:   # a broken watcher must not go quiet
        print(err, file=sys.stderr)
        raise
