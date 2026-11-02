const headers = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

function secure(response) {
  const secured = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) secured.headers.set(key, value);
  secured.headers.set("Cache-Control", "no-store");
  return secured;
}

async function limitedBody(request) {
  const reader = request.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.origin !== env.APP_ORIGIN) return secure(new Response("Use the main GymPassJUST address", { status: 403 }));
    if (url.pathname === "/health" || /^\/(api|auth)(\/|$)/.test(url.pathname)) {
      const size = Number(request.headers.get("content-length") || 0);
      if (size > 16384) return secure(Response.json({ error: { code: "REQUEST_FAILED", message: "Request body is too large" } }, { status: 413 }));
      if (!["GET", "HEAD"].includes(request.method)) {
        const bytes = await limitedBody(request);
        if (!bytes) return secure(new Response("Request body is too large", { status: 413 }));
        request = new Request(request, { body: bytes });
      }
      const forwarded = new Request(request);
      // Only Pages sets this private forwarding header. The database Worker has
      // no public endpoint, so browser-supplied values cannot bypass throttling.
      forwarded.headers.set("x-gym-client-ip", request.headers.get("cf-connecting-ip") || "unavailable");
      return secure(await env.GYM.get(env.GYM.idFromName("gympassjust-main-v1")).fetch(forwarded));
    }
    if (!["GET", "HEAD"].includes(request.method)) return secure(new Response("Method not allowed", { status: 405 }));
    // Pages supplies the SPA fallback when no 404.html exists. Preserve the
    // requested URL: /index.html itself is a canonical redirect to / on Pages.
    const response = await env.ASSETS.fetch(request);
    return secure(response);
  },
};
