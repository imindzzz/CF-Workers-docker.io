export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/abc/")) {
      return json({
        status: "success",
        result: "nginx json",
      });
    }

    const host = url.hostname;
    const match = host.match(/^tsock([^.]+)\.proxy\..*$/);

    if (!match) {
      return new Response("Invalid host", { status: 400 });
    }

    const region = match[1];
    const upstreamUrl = new URL(request.url);
    upstreamUrl.hostname = `tsock.${region}.twilio.com`;
    upstreamUrl.protocol = "https:";

    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      return handleWebSocket(request, upstreamUrl, host);
    }

    return handleHttp(request, upstreamUrl, host);
  },
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function buildProxyHeaders(request, originalHost) {
  const headers = new Headers(request.headers);

  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";

  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-proto", "https");

  // Let Cloudflare/fetch set the correct upstream Host header.
  headers.delete("host");

  return headers;
}

async function handleHttp(request, upstreamUrl, originalHost) {
  const headers = buildProxyHeaders(request, originalHost);

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  });

  return fetch(upstreamRequest);
}

async function handleWebSocket(request, upstreamUrl, originalHost) {
  const headers = buildProxyHeaders(request, originalHost);

  // Upstream websocket handshake goes through fetch with https URL and Upgrade header.
  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers,
    redirect: "manual",
  });

  return fetch(upstreamRequest);
}
