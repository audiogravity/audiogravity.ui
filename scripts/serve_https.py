import http.server
import http.client
import ssl
import sys
import os
import argparse
import urllib.parse
import socket
import select
import logging
import shutil
import gzip
import re
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Types MIME compressibles avec gzip
_GZIP_TYPES = {
    'application/javascript', 'text/javascript',
    'text/css', 'text/html', 'text/plain',
    'application/json', 'image/svg+xml',
}

# Cache gzip en mémoire : {path: (mtime, compressed_bytes)}
_gzip_cache: dict = {}

# Preload hints cache: {html_path: (mtime, [link_header_values])}
# Populated by _extract_preload_links() on first HTML serve and invalidated on mtime change.
_preload_cache: dict = {}

_RE_HASHED = re.compile(r'-[A-Za-z0-9_]{8,}\.(js|css)$')

# Tag-level patterns — capture the whole opening tag so attribute order is irrelevant.
_RE_SCRIPT_TAG  = re.compile(r'<script\b[^>]+>', re.I)
_RE_LINK_TAG    = re.compile(r'<link\b[^>]+>', re.I)
# Attribute-level patterns — applied to the matched tag string.
_RE_ATTR_TYPE   = re.compile(r'\btype=["\']module["\']', re.I)
_RE_ATTR_REL_SS = re.compile(r'\brel=["\']stylesheet["\']', re.I)
_RE_ATTR_REL_MP = re.compile(r'\brel=["\']modulepreload["\']', re.I)
_RE_ATTR_SRC    = re.compile(r'\bsrc=["\'](/[^"\']+)["\']', re.I)
_RE_ATTR_HREF   = re.compile(r'\bhref=["\'](/[^"\']+)["\']', re.I)


def _extract_preload_links(html_path: str) -> list[str]:
    """Parse an HTML file and return Link header values for its critical assets.

    Uses a two-pass approach (find tag, then extract attribute) so attribute
    order within the tag is irrelevant.  Extracts hashed Vite assets from:
    ``<script type="module" src="…">``, ``<link rel="modulepreload" href="…">``,
    and ``<link rel="stylesheet" href="…">``.  Non-hashed assets are excluded.

    Args:
        html_path: Absolute path to the HTML file to parse.

    Returns:
        List of ``Link:`` header value strings ready to pass to send_header().
    """
    try:
        with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
            html = f.read()
    except OSError:
        return []

    links = []
    for tag in _RE_SCRIPT_TAG.findall(html):
        if not _RE_ATTR_TYPE.search(tag):
            continue
        m = _RE_ATTR_SRC.search(tag)
        if m and _RE_HASHED.search(m.group(1)):
            links.append(f'<{m.group(1)}>; rel=preload; as=script; crossorigin=anonymous')

    for tag in _RE_LINK_TAG.findall(html):
        m_href = _RE_ATTR_HREF.search(tag)
        if not m_href or not _RE_HASHED.search(m_href.group(1)):
            continue
        if _RE_ATTR_REL_MP.search(tag):
            links.append(f'<{m_href.group(1)}>; rel=modulepreload; as=script; crossorigin=anonymous')
        elif _RE_ATTR_REL_SS.search(tag):
            links.append(f'<{m_href.group(1)}>; rel=preload; as=style')

    return links

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class AudiogravityHandler(SimpleHTTPRequestHandler):
    backend_url = None

    def log_message(self, format, *args):
        logger.info("%s - %s" % (self.address_string(), format%args))

    def handle_one_request(self):
        # A client dropping a keep-alive connection (e.g. after an SSE stream or a
        # page reload) makes the next request read fail with a broken pipe; otherwise
        # http.server dumps a full traceback. Swallow it and close the connection.
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def finish(self):
        # Same rationale for the final wfile flush when the client is already gone.
        try:
            super().finish()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        # WebSocket upgrade (e.g. the admin terminal at /sysinfo/terminal/ws):
        # http.server can't proxy WebSockets, so tunnel it raw to the backend.
        if self.headers.get('Upgrade', '').lower() == 'websocket':
            self.proxy_websocket()
        elif self.path.startswith('/api/') or self.path.split('?')[0] == '/openapi.json':
            self.proxy_request('GET')
        else:
            self._serve_static()

    def _serve_static(self):
        """Sert les fichiers statiques avec gzip si le client le supporte."""
        accept_encoding = self.headers.get('Accept-Encoding', '')
        if 'gzip' not in accept_encoding:
            super().do_GET()
            return

        path = self.translate_path(self.path)
        if os.path.isdir(path):
            super().do_GET()
            return

        ctype = self.guess_type(path)
        # Normaliser le type MIME (enlever les paramètres ex: "text/html; charset=utf-8")
        ctype_base = ctype.split(';')[0].strip()
        if ctype_base not in _GZIP_TYPES:
            super().do_GET()
            return

        try:
            mtime = os.path.getmtime(path)
        except OSError:
            self.send_error(404, 'File not found')
            return

        cached = _gzip_cache.get(path)
        if cached and cached[0] == mtime:
            compressed = cached[1]
        else:
            try:
                with open(path, 'rb') as f:
                    compressed = gzip.compress(f.read(), compresslevel=6)
                _gzip_cache[path] = (mtime, compressed)
            except OSError:
                self.send_error(404, 'File not found')
                return

        # Assets avec hash Vite dans le nom → immuables, cache 1 an
        # Autres fichiers (index.html, sw.js, manifest) → revalidation obligatoire
        filename = os.path.basename(path)
        is_hashed = bool(_RE_HASHED.search(filename))
        cache_control = 'public, max-age=31536000, immutable' if is_hashed else 'no-cache'

        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Vary', 'Accept-Encoding')
        self.send_header('Content-Length', str(len(compressed)))
        self.send_header('Cache-Control', cache_control)

        # Link: rel=preload hints for HTML pages — browser fetches critical JS/CSS
        # immediately without waiting for the HTML parser to discover the tags.
        # Modern alternative to HTTP/2 Server Push (deprecated in Chrome 2022).
        if ctype_base == 'text/html' and not is_hashed:
            cached_preload = _preload_cache.get(path)
            if cached_preload and cached_preload[0] == mtime:
                preload_links = cached_preload[1]
            else:
                preload_links = _extract_preload_links(path)
                _preload_cache[path] = (mtime, preload_links)
            for link in preload_links:
                self.send_header('Link', link)

        self.end_headers()
        self.wfile.write(compressed)

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.proxy_request('POST')
        else:
            super().do_POST()

    def do_PUT(self):
        if self.path.startswith('/api/'):
            self.proxy_request('PUT')
        else:
            super().do_PUT()

    def do_DELETE(self):
        if self.path.startswith('/api/'):
            self.proxy_request('DELETE')
        else:
            super().do_DELETE()

    def proxy_request(self, method):
        if not self.backend_url:
            self.send_error(502, "Backend URL not configured")
            return

        # Prepare target URL (strip /api prefix only for /api/* routes)
        path = self.path[4:] if self.path.startswith('/api/') else self.path
        if not path: path = '/'
        
        parsed_backend = urllib.parse.urlparse(self.backend_url)
        target_host = parsed_backend.hostname
        target_port = parsed_backend.port or (80 if parsed_backend.scheme == 'http' else 443)
        
        # Prepare headers to forward to backend
        headers = {key: value for key, value in self.headers.items() if key.lower() not in ['host', 'connection']}
        headers['Host'] = f"{target_host}:{target_port}"
        headers['Connection'] = 'close'
        
        # Add proxy headers
        headers['X-Real-IP'] = self.client_address[0]
        headers['X-Forwarded-For'] = self.client_address[0]
        headers['X-Forwarded-Proto'] = 'https' if isinstance(self.request, ssl.SSLSocket) else 'http'
        
        # Read body for POST/PUT
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None
        
        try:
            conn = http.client.HTTPConnection(target_host, target_port, timeout=60)
            conn.request(method, path, body, headers)
            response = conn.getresponse()
            
            # Detect SSE
            content_type = response.getheader('Content-Type', '')
            is_sse = 'text/event-stream' in content_type.lower()
            
            # Send response status
            self.send_response(response.status)
            
            # Forward headers from backend to client
            for key, value in response.getheaders():
                # Don't forward hop-by-hop headers
                if key.lower() not in ['connection', 'transfer-encoding']:
                    self.send_header(key, value)
            
            if is_sse:
                # Crucial for SSE: disable buffering
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('X-Accel-Buffering', 'no')
                self.send_header('Connection', 'keep-alive')
                self.end_headers()
                
                logger.info(f"Streaming SSE for {path}")
                # BACKLOG.md: reading .fp raw leaks chunk-framing bytes into the
                # relayed body (benign for EventSource today; risky for events
                # large enough to span multiple chunks).
                try:
                    while True:
                        line = response.fp.readline()
                        if not line:
                            break
                        self.wfile.write(line)
                        if line == b'\r\n' or line == b'\n':
                            self.wfile.flush()
                except (ConnectionResetError, BrokenPipeError, socket.error):
                    logger.info("Client disconnected from SSE stream")
            else:
                # Handle regular response
                self.send_header('Connection', 'close')
                self.end_headers()
                
                # Stream the rest of the body
                shutil.copyfileobj(response, self.wfile)
                self.wfile.flush()
            
            conn.close()
            
        except Exception as e:
            logger.error(f"Proxy Error for {path}: {str(e)}")
            try:
                self.send_error(502, f"Proxy Error: {str(e)}")
            except:
                pass

    # Idle timeout for a tunneled WebSocket (matches the reverse-proxy's
    # proxy_read_timeout 1h): an idle terminal survives up to this long.
    _WS_IDLE_TIMEOUT = 3600

    def proxy_websocket(self):
        """Proxy a WebSocket upgrade to the backend via raw bidirectional tunneling.

        Used in standalone (no reverse proxy) deployments for the admin terminal
        (``/sysinfo/terminal/ws``). When an nginx reverse proxy sits in front, it
        handles the upgrade on its own ``location`` and this never runs.

        http.server has no WebSocket support, so we open a plain socket to the
        backend, replay the client's upgrade request verbatim, then shuttle bytes
        in both directions (handshake 101 + frames) until either side closes.
        """
        self.close_connection = True
        if not self.backend_url:
            self.send_error(502, "Backend URL not configured")
            return

        # Strip the /api prefix if present (consistent with proxy_request); the
        # terminal path carries none and reaches the backend verbatim.
        path = self.path[4:] if self.path.startswith('/api/') else self.path
        if not path:
            path = '/'

        parsed = urllib.parse.urlparse(self.backend_url)
        host = parsed.hostname
        port = parsed.port or (80 if parsed.scheme == 'http' else 443)

        try:
            upstream = socket.create_connection((host, port), timeout=10)
        except OSError as exc:
            logger.error(f"WebSocket upstream connect failed for {path}: {exc}")
            try:
                self.send_error(502, f"WebSocket upstream connect failed: {exc}")
            except OSError:
                pass
            return

        # Replay the client's upgrade request (request line + headers), rewriting
        # only Host. The Upgrade/Connection/Sec-WebSocket-* headers and the token
        # in the query string are preserved, so the backend completes the 101.
        lines = [f"GET {path} HTTP/1.1", f"Host: {host}:{port}"]
        for key, value in self.headers.items():
            if key.lower() == 'host':
                continue
            lines.append(f"{key}: {value}")
        try:
            upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))
        except OSError as exc:
            logger.error(f"WebSocket upstream send failed for {path}: {exc}")
            upstream.close()
            return

        logger.info(f"Tunneling WebSocket for {path}")
        try:
            self._relay(self.connection, upstream)
        finally:
            upstream.close()

    @classmethod
    def _relay(cls, a, b):
        """Shuttle bytes between two sockets until either side closes or idles."""
        socks = (a, b)
        while True:
            try:
                readable, _, errored = select.select(socks, [], socks, cls._WS_IDLE_TIMEOUT)
            except (OSError, ValueError):
                break
            if errored or not readable:
                break  # peer error, or idle past the timeout — drop the tunnel
            for src in readable:
                dst = b if src is a else a
                try:
                    data = src.recv(65536)
                except OSError:
                    return
                if not data:
                    return  # clean close from one side
                try:
                    dst.sendall(data)
                except OSError:
                    return


def run(port, backend, use_ssl, cert_file, key_file):
    AudiogravityHandler.backend_url = backend
    server_address = ('0.0.0.0', port)
    
    # Use ThreadingHTTPServer to handle multiple concurrent connections
    httpd = ThreadingHTTPServer(server_address, AudiogravityHandler)
    
    if use_ssl:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(certfile=cert_file, keyfile=key_file)
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        logger.info(f"Serving HTTPS on 0.0.0.0:{port}, proxying /api to {backend}")
    else:
        logger.info(f"Serving HTTP on 0.0.0.0:{port}, proxying /api to {backend}")
        
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server stopping...")
        httpd.server_close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Audiogravity Standalone Server')
    parser.add_argument('--port', type=int, default=8080, help='Port to listen on')
    parser.add_argument('--backend', type=str, required=True, help='Backend base URL')
    parser.add_argument('--ssl', action='store_true', help='Enable SSL/TLS')
    parser.add_argument('--cert', type=str, default='ssl/cert.pem', help='Path to SSL certificate')
    parser.add_argument('--key', type=str, default='ssl/key.pem', help='Path to SSL private key')
    
    args = parser.parse_args()
    run(args.port, args.backend, args.ssl, args.cert, args.key)
