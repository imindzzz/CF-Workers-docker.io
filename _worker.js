export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Keep the simple health/debug endpoint from nginx.
    if (url.pathname.startsWith("/abc/")) {
      return new Response('{"status":"success","result":"nginx json"}', {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }
    // Match host like: tsock{region}.proxy.example.com
    // nginx regex: ^tsock(?<region>[^\.]+)[.]proxy[.].*
    const host = url.hostname;
    const match = host.match(/^tsock([^.]+)\.proxy\..*$/);
    if (!match) {
      return new Response("Invalid host", { status: 400 });
    }
    const region = match[1];
    const upstreamUrl = new URL(request.url);
    upstreamUrl.protocol = "https:";
    upstreamUrl.hostname = `tsock.${region}.twilio.com`;
    const headers = new Headers(request.headers);
    // Approximate nginx proxy headers.
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      "";
    if (clientIp) {
      headers.set("x-forwarded-for", clientIp);
    }
    // Forward original host info if upstream needs it.
    headers.set("x-forwarded-host", host);
    headers.set("x-forwarded-proto", "https");
    // Remove headers that may conflict or are controlled by fetch/runtime.
    headers.delete("host");
    const proxyRequest = new Request(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
    return fetch(proxyRequest);
  },
};
