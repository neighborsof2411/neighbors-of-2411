/*
  Cloudflare Pages Function -- POST /api/sign

  The petition and join forms (layouts/_partials/petition-form.html) post
  here instead of straight to Formspree, so a repeat submission from the
  same email address can be caught before it lands in the group's inbox
  and spreadsheet as a duplicate.

  Flow:
    1. Honeypot (_gotcha) filled     -> quiet redirect to /thanks/; nothing stored or sent.
    2. Email already recorded for    -> /already-signed/  (petition and join are
       THIS form                        tracked separately: signing one doesn't
                                        block the other)
    3. Otherwise forward the submission to Formspree exactly as the browser
       used to (same endpoint, same fields, same _subject), record the
       signer, and redirect to /thanks/. If Formspree rejects it, nothing is
       recorded and the visitor lands on /submission-error/ so they can retry.

  Storage: a KV namespace bound as SIGNERS. Only a SHA-256 hash of
  "<form>:<lower-cased email>" is stored -- never the address itself -- so
  the store can't be read back out as a mailing list.

  ONE-TIME SETUP (Cloudflare dashboard -> this Pages project -> Settings ->
  Functions -> KV namespace bindings): create a namespace and bind it under
  the variable name SIGNERS, for both Production and Preview.

  Until that binding exists this function FAILS OPEN: every submission still
  reaches Formspree, it just can't detect repeats yet. So it is safe to
  deploy first and bind later.
*/

const FORMSPREE = "https://formspree.io/f/xzdnrjaz";

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}

function redirect(request, path) {
  return Response.redirect(new URL(path, request.url).toString(), 303);
}

export async function onRequestPost({ request, env }) {
  const form = await request.formData();

  if (String(form.get("_gotcha") || "").trim()) {
    return redirect(request, "/thanks/");
  }

  const formType = form.get("form_type") === "join" ? "join" : "petition";
  const email = String(form.get("email") || "").trim().toLowerCase();
  const kv = env.SIGNERS;
  const key = email ? formType + ":" + (await sha256Hex(email)) : null;

  if (kv && key && (await kv.get(key))) {
    return redirect(request, "/already-signed/?form=" + formType);
  }

  const origin = new URL(request.url).origin;
  let upstream = null;
  try {
    upstream = await fetch(FORMSPREE, {
      method: "POST",
      headers: { Accept: "application/json", Origin: origin, Referer: origin + "/" },
      body: form,
    });
  } catch (err) {
    upstream = null;
  }

  if (!upstream || !upstream.ok) {
    return redirect(request, "/submission-error/");
  }

  if (kv && key) {
    await kv.put(key, new Date().toISOString());
  }
  return redirect(request, "/thanks/?form=" + formType);
}

// GET only -- someone opening /api/sign in a browser is sent to the petition.
// (Using onRequestGet, not onRequest: a catch-all onRequest would also
// swallow POSTs and the duplicate check would never run.)
export function onRequestGet({ request }) {
  return redirect(request, "/petition/");
}
