/*
  Cloudflare Worker entry script (wrangler.jsonc -> "main").

  This site is a Worker with static assets: an ordinary request is checked
  against the built static files in public/ FIRST, and only paths with no
  matching asset reach this Worker. So all normal pages are served straight
  from assets and never touch this code -- except /api/*, which
  assets.run_worker_first routes here before the asset server sees it.
  That matters: the asset server answers ANY non-GET request with a bare 405
  ("This page isn't working"), so a sign-up POST that missed this Worker by a
  single character -- /api/sign/ with a trailing slash -- died at the edge.
  Signers hit exactly that in September 2026. The route match below is now
  forgiving, and /api/* never reaches the asset server ahead of this code.

  The Worker exists to handle POST /api/sign, the endpoint the site's one
  sign-up form (the petition, which is also the email list) submits to.

  /api/sign: catch a repeat submission from the same email, then record the
  signature in the group's Google Sheet ("Opposition Signups") via the
  "Neighbors of 2411 - Automation" Apps Script web app (WebSignup.gs), which
  also emails the group right away. Only a SHA-256 hash of "petition:<email>"
  is kept here (never the address), so the store can't be read back as a
  mailing list.

  Why not Formspree any more: from Sept 11-24, 2026 every sign-up this Worker
  forwarded to Formspree was filed under Spam by its "Formshield" filter
  (a server-to-server post looks like a bot), so no notification was sent;
  the free plan also stops at 50 submissions a month. Formspree remains only
  as a fallback if the Sheet can't be reached, so a signature is never lost
  -- anything that lands there is in Formspree's Spam folder.

  The web app only accepts requests carrying SIGNUP_SECRET, a Cloudflare
  secret that must match the Script Property of the same name. Its URL is
  the SIGNUP_WEBAPP_URL var in wrangler.jsonc (fine to be public: without the
  secret it refuses everything).

  Fails open throughout: without the SIGNERS KV binding there is simply no
  duplicate check here, and without SIGNUP_WEBAPP_URL / SIGNUP_SECRET the
  signature goes to the Formspree fallback. A signer only sees the error
  page if every route failed.
*/

const FORMSPREE = "https://formspree.io/f/xzdnrjaz";

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Record a signature in the Google Sheet. Returns the web app's JSON reply
// ({ok, duplicate}) or null if it isn't configured or couldn't be reached.
// Apps Script answers a POST with a 302 to its content host; following that
// redirect (as a GET, per the fetch spec) is how its reply is retrieved.
async function sendToSheet(env, form) {
  if (!env.SIGNUP_WEBAPP_URL || !env.SIGNUP_SECRET) return null;
  const body = new URLSearchParams();
  body.set("secret", env.SIGNUP_SECRET);
  for (const field of ["name", "email", "address", "comment"]) {
    body.set(field, String(form.get(field) || "").trim());
  }
  try {
    const res = await fetch(env.SIGNUP_WEBAPP_URL, { method: "POST", body, redirect: "follow" });
    if (!res.ok) return null;
    const reply = await res.json();
    return reply && reply.ok ? reply : null;
  } catch (e) {
    return null;
  }
}

// Fallback only: the old route. Submissions arriving this way land in
// Formspree's Spam folder (see the note at the top), but they are kept.
async function sendToFormspree(base, form) {
  const origin = new URL(base).origin;
  try {
    const res = await fetch(FORMSPREE, {
      method: "POST",
      headers: { Accept: "application/json", Origin: origin, Referer: origin + "/" },
      body: form,
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function seeOther(base, path) {
  return Response.redirect(new URL(path, base).toString(), 303);
}

async function handleSign(request, env) {
  const base = request.url;

  // A browser opening /api/sign directly (GET) just goes to the petition.
  if (request.method !== "POST") {
    return Response.redirect(new URL("/petition/", base).toString(), 302);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return seeOther(base, "/petition/");
  }

  // Honeypot: a filled _gotcha is a bot -- accept quietly, store/send nothing.
  if (String(form.get("_gotcha") || "").trim()) {
    return seeOther(base, "/thanks/");
  }

  const email = String(form.get("email") || "").trim().toLowerCase();
  const kv = env.SIGNERS; // undefined if the KV namespace isn't bound -> fail open
  // Key prefix stays "petition:" so signatures recorded before the separate
  // join form was retired still count as already signed.
  const key = email ? "petition:" + (await sha256Hex(email)) : null;

  if (kv && key) {
    let seen = null;
    try { seen = await kv.get(key); } catch (e) { seen = null; }
    if (seen) return seeOther(base, "/already-signed/");
  }

  const sheet = await sendToSheet(env, form);
  const recorded = sheet ? true : await sendToFormspree(base, form);
  if (!recorded) {
    return seeOther(base, "/submission-error/");
  }

  if (kv && key) {
    try { await kv.put(key, new Date().toISOString()); } catch (e) {}
  }
  // The Sheet knows about everyone who signed before this Worker's own
  // duplicate store existed, so it can catch repeats the store can't.
  return seeOther(base, sheet && sheet.duplicate ? "/already-signed/" : "/thanks/");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Forgiving match, so a trailing slash still signs someone up instead of
    // falling through to the asset server's 405. (Case is normalized too, but
    // only helps once a request is here: the run_worker_first glob itself is
    // case-sensitive, and no browser posts /API/Sign anyway.)
    const path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";

    if (path === "/api/sign") {
      try {
        return await handleSign(request, env);
      } catch (e) {
        // Never strand a real signer -- send them somewhere they can retry.
        return seeOther(request.url, "/submission-error/");
      }
    }

    // Any other POST that gets routed here (run_worker_first covers /api/*)
    // gets a page that explains itself instead of a raw Cloudflare 405.
    if (request.method === "POST") {
      return seeOther(request.url, "/submission-error/");
    }

    // Everything else is a static asset (or a genuine 404, handled per
    // assets.not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};
