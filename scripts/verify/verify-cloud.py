#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify-cloud.py — Gipfel 云端 API 验证（仅标准库 urllib）

检查（云端 http://106.54.26.86）：
  1. GET /api/health            → 200
  2. GET /market                → 200 且返回股票数组
  3. POST /auth/login           → admin/admin123 拿到 token
  4. GET /admin/accounts        → X-Admin-Key 正确 → 200 列表（需 GIPFEL_ADMIN_KEY）
  5. GET /admin/accounts        → X-Admin-Key 错误 → 403

特性：
  - 无网络 / 云端不可达 → 打印 SKIP 并以退出码 2 结束（不报错）
  - 手动跟随重定向（保留 POST 方法与请求体），兼容 nginx HTTP→HTTPS 301
  - 可配置环境变量：GIPFEL_CLOUD_URL / GIPFEL_ADMIN_KEY

退出码：0=全部通过  1=存在失败  2=云端不可达（跳过）
"""
import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("GIPFEL_CLOUD_URL", "http://106.54.26.86")
# 仅从环境变量读取管理密钥；不得把生产凭据提交到仓库。
ADMIN_KEY = os.environ.get("GIPFEL_ADMIN_KEY", "")
TIMEOUT = 10

# 云端证书可能是自签名/临时配置，跳过证书校验
SSL_CTX = ssl._create_unverified_context()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """禁止 urllib 自动跟随重定向，改为手动控制（保留 POST 方法/请求体）"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        return None


def build_opener():
    return urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=SSL_CTX))


OPENER = build_opener()


class NetError(Exception):
    """网络层错误（不可达/超时/TLS 失败），用于触发 SKIP"""


def raw_request(method, url, body=None, headers=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        resp = OPENER.open(req, timeout=TIMEOUT)
        return resp.status, resp.read(), resp.geturl(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.geturl(), dict(e.headers)
    except (urllib.error.URLError, socket.timeout, ssl.SSLError, ConnectionError, OSError) as e:
        raise NetError("{}: {}".format(type(e).__name__, e)) from e


def request(method, path, body=None, headers=None):
    """手动跟随重定向（最多 5 跳），跨 origin 后更新有效 base，POST 不降级为 GET。"""
    url = EFFECTIVE["base"] + path
    for _ in range(6):
        code, resp_body, final_url, resp_headers = raw_request(method, url, body, headers)
        if code in (301, 302, 303, 307, 308):
            loc = resp_headers.get("Location") or resp_headers.get("location")
            if not loc:
                return code, resp_body, final_url
            url = loc if loc.startswith("http") else EFFECTIVE["base"] + loc
            # 301/302 时保持 POST（nginx/FastAPI 的斜杠重定向需要方法不变）
            continue
        return code, resp_body, final_url
    raise NetError("重定向循环: {}".format(path))


EFFECTIVE = {"base": BASE}


def discover():
    """探测云端可达性并确定有效 base（跟随 http→https 301 等）。"""
    code, body, final_url = request("GET", "/api/health")
    # 记录最终 origin（http://host[:port]），后续请求直接打到有效地址
    from urllib.parse import urlsplit
    u = urlsplit(final_url)
    EFFECTIVE["base"] = "{}://{}".format(u.scheme, u.netloc)
    return code, body


def parse_json(body, label):
    try:
        return json.loads(body.decode("utf-8"))
    except Exception:
        raise AssertionError("{} 响应不是合法 JSON: {}".format(label, body[:200]))


RESULTS = []


def check(name, fn):
    try:
        fn()
        RESULTS.append((name, "PASS", ""))
        print("  [PASS] {}".format(name))
    except NetError as e:
        RESULTS.append((name, "SKIP", str(e)))
        print("  [SKIP] {}（网络错误: {}）".format(name, e))
    except AssertionError as e:
        RESULTS.append((name, "FAIL", str(e)))
        print("  [FAIL] {}".format(name))
        print("         {}".format(e))
    except Exception as e:  # noqa: BLE001
        RESULTS.append((name, "FAIL", repr(e)))
        print("  [FAIL] {}（异常: {!r}）".format(name, e))


def is_stock_list(data):
    if isinstance(data, list):
        return True
    if isinstance(data, dict):
        return any(isinstance(data.get(k), list) for k in ("data", "stocks", "items", "results"))
    return False


def main():
    print("═══ verify-cloud.py — 云端 API 验证 ═══")
    print("目标: {}".format(BASE))
    print("")

    # 探测：不可达 → SKIP（退出码 2）
    try:
        code, body = discover()
    except NetError as e:
        print("  [SKIP] 云端不可达（{}）— 跳过云端验证（退出码 2）".format(e))
        print("")
        print("verify-cloud: SKIP (云端不可达)")
        sys.exit(2)
    print("有效服务地址: {}".format(EFFECTIVE["base"]))
    print("")

    check("GET /api/health → 200", lambda: _test_health(code, body))

    def _test_market():
        c, b, _ = request("GET", "/market")
        assert c == 200, "期望 200，实际 {}".format(c)
        data = parse_json(b, "/market")
        assert is_stock_list(data), "/market 应返回股票数组（list 或含 list 的 dict）"

    check("GET /market → 200 且返回股票数组", _test_market)

    def _test_login():
        c, b, _ = request("POST", "/auth/login", body={"username": "admin", "password": "admin123"})
        assert c == 200, "期望 200，实际 {}（body: {}）".format(c, b[:200])
        data = parse_json(b, "/auth/login")
        assert data.get("token"), "/auth/login 应返回 token 字段"
        print("         token: {}...".format(str(data.get("token"))[:16]))

    check("POST /auth/login admin/admin123 → 拿到 token", _test_login)

    def _test_admin_ok():
        if not ADMIN_KEY:
            raise NetError("未设置 GIPFEL_ADMIN_KEY，跳过需管理密钥的正向检查")
        c, b, _ = request("GET", "/admin/accounts", headers={"X-Admin-Key": ADMIN_KEY})
        assert c == 200, "期望 200，实际 {}".format(c)
        data = parse_json(b, "/admin/accounts")
        assert isinstance(data, list), "/admin/accounts 应返回列表"

    check("GET /admin/accounts（X-Admin-Key 正确）→ 200 列表", _test_admin_ok)

    def _test_admin_bad():
        c, b, _ = request("GET", "/admin/accounts", headers={"X-Admin-Key": "wrong-key"})
        assert c == 403, "错误 key 应返回 403，实际 {}".format(c)

    check("GET /admin/accounts（X-Admin-Key 错误）→ 403", _test_admin_bad)

    print("")
    passed = sum(1 for _, s, _ in RESULTS if s == "PASS")
    skipped = sum(1 for _, s, _ in RESULTS if s == "SKIP")
    failed = sum(1 for _, s, _ in RESULTS if s == "FAIL")
    print("结果: {} 通过, {} 跳过, {} 失败".format(passed, skipped, failed))
    if failed > 0:
        print("verify-cloud: FAIL")
        sys.exit(1)
    if skipped > 0:
        print("verify-cloud: SKIP（部分检查因网络跳过）")
        sys.exit(2)
    print("verify-cloud: PASS")
    sys.exit(0)


def _test_health(code, body):
    assert code == 200, "期望 200，实际 {}（body: {}）".format(code, body[:200])


if __name__ == "__main__":
    main()
