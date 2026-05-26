export default {
  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const clientPair = new WebSocketPair();
    const client = clientPair[0];
    const workerSocket = clientPair[1];

    workerSocket.accept();

    let upstream;
    try {
      upstream = new WebSocket("wss://tsock.us1.twilio.com/v3/wsconnect");
      upstream.accept();
    } catch (err) {
      workerSocket.close(1011, "Upstream connection failed");
      return new Response(null, { status: 101, webSocket: client });
    }

    workerSocket.addEventListener("message", (event) => {
      try {
        upstream.send(event.data);
      } catch (_) {
        workerSocket.close(1011, "Failed to send upstream");
      }
    });

    upstream.addEventListener("message", (event) => {
      try {
        workerSocket.send(event.data);
      } catch (_) {
        upstream.close(1011, "Failed to send downstream");
      }
    });

    workerSocket.addEventListener("close", (event) => {
      try {
        upstream.close(event.code, event.reason);
      } catch (_) {}
    });

    upstream.addEventListener("close", (event) => {
      try {
        workerSocket.close(event.code, event.reason);
      } catch (_) {}
    });

    workerSocket.addEventListener("error", () => {
      try {
        upstream.close(1011, "Client socket error");
      } catch (_) {}
    });

    upstream.addEventListener("error", () => {
      try {
        workerSocket.close(1011, "Upstream socket error");
      } catch (_) {}
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
