"""Local integration tests for the optional FastAPI API-key boundary."""
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(base, method, route, payload=None, api_key=None):
    headers = {}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(base + route, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def run():
    port = free_port()
    api_key = secrets.token_urlsafe(48)
    env = os.environ.copy()
    env.update({
        "VERIBRAND_PYTHON_API_KEY": api_key,
        "VERIBRAND_PYTHON_HOST": "127.0.0.1",
        "VERIBRAND_PYTHON_PORT": str(port),
        "VERIBRAND_PYTHON_RELOAD": "false",
    })
    process = subprocess.Popen(
        [sys.executable, "main.py"],
        cwd=os.path.dirname(__file__),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(50):
            try:
                if request(base, "GET", "/health")[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                time.sleep(0.2)
        else:
            raise AssertionError("FastAPI service did not become ready.")

        assert request(base, "GET", "/health")[0] == 200
        payload = {"text": "Inkloom AI provides 99.9% uptime.", "channel": "enterprise_web"}
        assert request(base, "POST", "/api/audit", payload)[0] == 401
        assert request(base, "POST", "/api/audit", payload, "wrong")[0] == 401
        authorized = request(base, "POST", "/api/audit", payload, api_key)
        assert authorized[0] == 200, authorized[1].decode("utf-8", errors="replace")
        assert request(base, "GET", "/api/vault")[0] == 401
        assert request(base, "GET", "/api/vault", api_key=api_key)[0] == 200
        assert request(base, "GET", "/api/vision/contrast")[0] == 401
        assert request(base, "GET", "/api/vision/contrast?fg=invalid", api_key=api_key)[0] == 400

        print("PASS: public health endpoint.")
        print("PASS: audit/vault/contrast reject missing and invalid API keys.")
        print("PASS: valid API key authorizes supported endpoints.")
        print("PASS: invalid contrast input is rejected.")
        return 0
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(run())
