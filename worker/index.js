/*
  Cloudflare Worker entry script (wrangler.jsonc -> "main").

  This site is a Worker with static assets: every request is checked against
  the built static files in public/ FIRST, and only paths with no matching
  asset reach this Worker (run_worker_first is left at its default, false).
  So all normal pages are served straight from assets and never touch this
  code -- the Worker exists only to handle POST /api/sign, the sign-up
  endpoint the petition and join forms submit to.

  /api/sign: catch a repeat submission from the same email before it reaches
  the group's inbox and spreadsheet as a duplicate, then forward to Formspree
  exactly as the browser used to. Only a SHA-256 hash of "<form>:<email>" is
  stored (never the address), so the store can't be read back as a mailing
  list. Petition and join are tracked separately, so signing one doesn't
  block the other.

  Fails open: until a KV namespace is bound as SIGNERS (see wrangler.jsonc),
  env.SIGNERS is undefined and every submission is forwarded to Formspree
  without a duplicate check -- so this is safe to ship before KV exists.
*/

const FORMSPREE = "https://formspree.io/f/xzdnrjaz";

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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

  const formType = form.get("form_type") === "join" ? "join" : "petition";
  const email = String(form.get("email") || "").trim().toLowerCase();
  const kv = env.SIGNERS; // undefined until the KV namespace is bound -> fail open
  const key = email ? formType + ":" + (await sha256Hex(email)) : null;

  if (kv && key) {
    let seen = null;
    try { seen = await kv.get(key); } catch (e) { seen = null; }
    if (seen) return seeOther(base, "/already-signed/?form=" + formType);
  }

  const origin = new URL(base).origin;
  let upstream = null;
  try {
    upstream = await fetch(FORMSPREE, {
      method: "POST",
      headers: { Accept: "application/json", Origin: origin, Referer: origin + "/" },
      body: form,
    });
  } catch (e) {
    upstream = null;
  }

  if (!upstream || !upstream.ok) {
    return seeOther(base, "/submission-error/");
  }

  if (kv && key) {
    try { await kv.put(key, new Date().toISOString()); } catch (e) {}
  }
  return seeOther(base, "/thanks/?form=" + formType);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/sign") {
      try {
        return await handleSign(request, env);
      } catch (e) {
        // Never strand a real signer -- send them somewhere they can retry.
        return Response.redirect(new URL("/submission-error/", request.url).toString(), 303);
      }
    }
    // Everything else is a static asset (or a genuine 404, handled per
    // assets.not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};
