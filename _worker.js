export default {
  async fetch(request, env, ctx) {
    // 仅处理 WebSocket 升级请求
    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('请使用 WebSocket 连接', { status: 426 });
    }

    // 为客户端创建一对 WebSocket，client 将返回给浏览器，server 用于内部通信
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // 接受内部 server 端的连接
    server.accept();

    // 准备连接到上游目标
    const targetUrl = 'wss://tsock.us1.twilio.com/v3/wsconnect';
    const targetHeaders = { Upgrade: 'websocket' };

    // 转发客户端请求的子协议（如果有）
    const clientProtocol = request.headers.get('Sec-WebSocket-Protocol');
    if (clientProtocol) {
      targetHeaders['Sec-WebSocket-Protocol'] = clientProtocol;
    }

    let targetResponse;
    try {
      targetResponse = await fetch(targetUrl, { headers: targetHeaders });
    } catch (err) {
      // 连接上游失败时关闭客户端连接
      server.close(1011, 'Upstream connection failed');
      return new Response(null, { status: 101, webSocket: client });
    }

    // 目标服务器必须返回 101 并携带一个 WebSocket 对象
    const targetSocket = targetResponse.webSocket;
    if (!targetSocket) {
      server.close(1011, 'Upstream did not upgrade');
      return new Response(null, { status: 101, webSocket: client });
    }

    // 从上游响应中获取选定的子协议，以便回传给客户端
    const selectedProtocol = targetResponse.headers.get('Sec-WebSocket-Protocol');

    // 双向转发消息
    server.addEventListener('message', (event) => {
      targetSocket.send(event.data);
    });
    targetSocket.addEventListener('message', (event) => {
      server.send(event.data);
    });

    // 双向传递关闭信号
    server.addEventListener('close', (event) => {
      targetSocket.close(event.code, event.reason);
    });
    targetSocket.addEventListener('close', (event) => {
      server.close(event.code, event.reason);
    });

    // 错误处理
    server.addEventListener('error', () => {
      targetSocket.close(1011, 'Client error');
    });
    targetSocket.addEventListener('error', () => {
      server.close(1011, 'Upstream error');
    });

    // 返回 101 响应，将 client 端交给客户端，并可携带选定的子协议
    const init = { status: 101, webSocket: client };
    if (selectedProtocol) {
      init.headers = { 'Sec-WebSocket-Protocol': selectedProtocol };
    }
    return new Response(null, init);
  }
};
