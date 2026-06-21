"""
Integration test for serve_https.py — the standalone prod frontend server.

Regression guard for the prod "Connecting..." bug: the packaged proxy used to
relay Server-Sent Events with shutil.copyfileobj(), which reads in 64 KB blocks
and therefore withheld the tiny, infrequent SSE events until that buffer filled
(or the stream closed). The browser's EventSource never received the initial
`connected` event, so the UI stayed stuck on "Connecting...". serve_https.py
fixes this by detecting text/event-stream and streaming it line-by-line with an
explicit flush.

The test is discriminating by construction: the fake backend emits one tiny
event immediately and then stays silent for 3 s. A buffering proxy delivers
nothing before the stream closes (t=3 s); the streaming proxy delivers the
event at once. The client reads with a 2 s deadline, so a regression to a
buffering relay makes the test time out and fail.

Run:  python3 -m pytest frontend/scripts/test_serve_https.py
"""
import base64
import http.client
import http.server
import importlib.util
import logging
import os
import socket
import threading
import time
from pathlib import Path

import pytest

# serve_https.py is a standalone script (no package), so load it by path.
_SERVE_PATH = Path(__file__).with_name("serve_https.py")
_spec = importlib.util.spec_from_file_location("serve_https", _SERVE_PATH)
serve_https = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(serve_https)

# Keep the module's INFO logging out of the test output.
logging.getLogger("serve_https").setLevel(logging.WARNING)

_SSE_EVENT = b'event: connected\ndata: {"connection_id": "test-1"}\n\n'
_BACKEND_IDLE_SECONDS = 3.0
_CLIENT_DEADLINE_SECONDS = 2.0


def _free_port():
    """Return an ephemeral free TCP port on localhost."""
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class _FakeSSEBackend(http.server.BaseHTTPRequestHandler):
    """Minimal backend: streams one SSE event, then idles to expose buffering."""

    def log_message(self, *args):  # silence
        pass

    def do_GET(self):
        if self.path.startswith("/sse"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.end_headers()
            self.wfile.write(_SSE_EVENT)
            self.wfile.flush()
            # Hold the connection open without sending more: a streaming proxy
            # must already have forwarded the event above.
            try:
                time.sleep(_BACKEND_IDLE_SECONDS)
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")


@pytest.fixture
def proxy_port():
    """Start a fake SSE backend + serve_https.py proxy, yield the proxy port."""
    backend_port = _free_port()
    p_port = _free_port()

    backend = http.server.ThreadingHTTPServer(("127.0.0.1", backend_port), _FakeSSEBackend)
    threading.Thread(target=backend.serve_forever, daemon=True).start()

    serve_https.AudiogravityHandler.backend_url = f"http://127.0.0.1:{backend_port}"
    proxy = http.server.ThreadingHTTPServer(("127.0.0.1", p_port), serve_https.AudiogravityHandler)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()

    time.sleep(0.2)  # let both servers bind
    try:
        yield p_port
    finally:
        proxy.shutdown()
        backend.shutdown()


def test_sse_is_streamed_immediately(proxy_port):
    """The first SSE event reaches the client well before the stream closes."""
    conn = http.client.HTTPConnection("127.0.0.1", proxy_port, timeout=5)
    try:
        conn.request("GET", "/api/sse/dashboard")
        # Pin a tight read deadline on the socket *before* getresponse(): for an
        # HTTP/1.0 response http.client hands the socket to the response and sets
        # conn.sock = None, but resp.fp keeps reading from this same socket. A
        # buffering relay would block on readline until the backend closes at
        # t=3s, blowing past this 2s timeout.
        sock = conn.sock
        sock.settimeout(_CLIENT_DEADLINE_SECONDS)
        resp = conn.getresponse()

        assert resp.status == 200
        assert "text/event-stream" in resp.getheader("Content-Type", "")
        # The SSE branch must disable proxy buffering for the stream.
        assert resp.getheader("X-Accel-Buffering") == "no"

        start = time.monotonic()
        body = b""
        try:
            while b"event: connected" not in body:
                line = resp.fp.readline()
                if not line:
                    break
                body += line
        except socket.timeout:
            pytest.fail("SSE event not streamed within deadline — proxy is buffering")
        elapsed = time.monotonic() - start

        assert b"event: connected" in body, f"event missing; received: {body!r}"
        assert elapsed < _CLIENT_DEADLINE_SECONDS
    finally:
        conn.close()


def test_non_sse_response_is_proxied(proxy_port):
    """A regular JSON route is proxied normally (no SSE handling)."""
    conn = http.client.HTTPConnection("127.0.0.1", proxy_port, timeout=5)
    try:
        conn.request("GET", "/api/anything")
        resp = conn.getresponse()
        assert resp.status == 200
        assert resp.read() == b"{}"
    finally:
        conn.close()


def _handle_ws_conn(conn):
    """Fake WebSocket backend: answer the upgrade with 101, then echo bytes."""
    try:
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = conn.recv(4096)
            if not chunk:
                return
            buf += chunk
        conn.sendall(
            b"HTTP/1.1 101 Switching Protocols\r\n"
            b"Upgrade: websocket\r\n"
            b"Connection: Upgrade\r\n"
            b"Sec-WebSocket-Accept: test-accept\r\n\r\n"
        )
        while True:
            data = conn.recv(4096)
            if not data:
                break
            conn.sendall(data)  # echo
    except OSError:
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _ws_accept_loop(server_sock):
    while True:
        try:
            conn, _ = server_sock.accept()
        except OSError:
            return
        threading.Thread(target=_handle_ws_conn, args=(conn,), daemon=True).start()


@pytest.fixture
def ws_proxy_port():
    """Start a raw fake WebSocket backend + serve_https.py proxy, yield proxy port."""
    backend = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    backend.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    backend.bind(("127.0.0.1", 0))
    backend.listen(8)
    backend_port = backend.getsockname()[1]
    threading.Thread(target=_ws_accept_loop, args=(backend,), daemon=True).start()

    p_port = _free_port()
    serve_https.AudiogravityHandler.backend_url = f"http://127.0.0.1:{backend_port}"
    proxy = http.server.ThreadingHTTPServer(("127.0.0.1", p_port), serve_https.AudiogravityHandler)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()

    time.sleep(0.2)
    try:
        yield p_port
    finally:
        proxy.shutdown()
        backend.close()


def test_websocket_is_tunneled(ws_proxy_port):
    """A WebSocket upgrade is proxied (101 handshake) and bytes flow both ways.

    Regression guard for the prod terminal (/sysinfo/terminal/ws): the python
    standalone server must tunnel WebSockets, which http.server can't do natively.
    """
    key = base64.b64encode(os.urandom(16)).decode()
    s = socket.create_connection(("127.0.0.1", ws_proxy_port), timeout=5)
    try:
        s.sendall((
            "GET /sysinfo/terminal/ws?token=x HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{ws_proxy_port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        ).encode())
        s.settimeout(3)

        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = s.recv(1024)
            assert chunk, "proxy closed before completing the WS handshake"
            resp += chunk
        status = resp.split(b"\r\n", 1)[0]
        assert b"101" in status, f"expected 101 Switching Protocols, got {status!r}"

        # Bidirectional tunnel: our bytes reach the backend and echo back.
        s.sendall(b"ping-through-tunnel")
        echoed = s.recv(1024)
        assert echoed == b"ping-through-tunnel"
    finally:
        s.close()
