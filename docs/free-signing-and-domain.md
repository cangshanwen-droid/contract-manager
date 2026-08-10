# 免费代码签名 + 免费域名 + Let's Encrypt 调研（只读调研，不涉及代码改动）

> 目标：为 Gipfel 桌面端（Windows Electron 安装包）和云端（106.54.26.86 / nginx）寻找**零成本**的正式签名与域名方案，替代当前自签名证书 + 自签名 Authenticode。
> 调研日期：2026-08-10。仅调研，未改动任何代码。

---

## 1. SignPath —— 开源项目免费代码签名

### 1.1 是什么

[SignPath](https://signpath.org) 是一家提供**代码签名即服务**（Code Signing as a Service）的厂商，核心卖点：
- **私钥永远不出现在签名机/CI 环境**：证书私钥由 SignPath 托管，签名请求通过 API/GitHub Action 提交，SignPath 用硬件安全模块（HSM）完成签名后返回签名产物。这是它和「自签名证书 + 本地 signtool」的根本区别。
- 支持 Windows Authenticode（signtool / PE 签名）、内核驱动（WHQL）、Mac 签名、jar/apk 等。

### 1.2 免费 OSS 赞助计划（关键）

SignPath 有一个 **OSS Sponsorship（开源赞助）计划**，满足条件可**免费**获得一个代码签名证书并无限签名：

- 项目必须是**公开开源**（GitHub 公开仓库，含 OSI 认可的开源许可证，如 MIT/Apache-2.0）。
- 必须由项目**维护者本人**申请（SignPath 会审核你对该仓库的管理权限）。
- 申请通过后，SignPath 签发一个**非 EV 代码签名证书**（证书主体显示 SignPath OSS 赞助证书）。
- 免费额度：**无限次签名**（有请求速率限制），证书有效期约 1 年，到期自动续。

⚠️ 注意限制（2026-08 调研时点）：
- 免费证书是 **OV 级（组织验证）**，不是 EV。SmartScreen 对 OV 签名的处理：新证书首次出现时仍有「未知发布者」警告，但**积累信誉后**（多次下载、无举报）会逐步信任；EV 才能首日即白。对内部/演示分发足够，对公网正式商业发布体验仍不如 EV。
- 免费证书**不能用于驱动签名**（WHQL 是另一套收费计划）。
- 申请时需要一个**可验证的域名邮箱或项目官网**（见第 2 节 DuckDNS + 邮箱组合）。

### 1.3 接入方式（GitHub Action）

官方 Action：`signpath/oss-sign-action@v2`，流程大致：

```yaml
- name: Sign the binary with SignPath
  uses: signpath/oss-sign-action@v2
  with:
    project-slug: 'gipfel-contract-manager'
    organization-id: '<申请后获得的 org id>'
    signing-policy-slug: 'release-signing'
    artifacts-directory: dist
    artifact-name: 'Gipfel-win-installer'
    output-directory: dist-signed
```

要点：
- 第一次申请通过后，SignPath 会把 `organization-id`、`project-slug`、`signing-policy-slug` 三个标识给你，GitHub Action 里填上即可；**不需要把私钥/密码放进 CI**（这是它最大的安全优势）。
- electron-builder 产物接入：对 `win-unpacked` 里的主 exe 或 NSIS 安装包 exe 做签名（对安装包签名即可，内层文件可不解包分别签——但**推荐**对 `dist/win-unpacked/*.exe` + 安装包都签，体验最好）。
- 替代路径（不想用 GitHub 时）：SignPath 有 CLI（`signpath` npm 包）和 REST API，可从任意 CI 调用。

### 1.4 与当前自签名方案的对比

| 维度 | 现状（自签名 pfx + signtool） | SignPath OSS 免费计划 |
|---|---|---|
| 成本 | 0 | 0（开源项目） |
| SmartScreen | 每台机器都要导入证书，否则「未知发布者」 | OV 信誉积累后不再警告 |
| 私钥安全 | pfx 存本机 certs/（已入 .gitignore） | 私钥在 SignPath HSM，CI 零泄露面 |
| 证书有效期 | 1 年，过期需重新生成 | 约 1 年，自动续 |
| 门槛 | 无 | 公开仓库 + 维护者申请 + 审核 |
| 适合场景 | 内部/演示（当前够用） | 对外正式分发（推荐升级） |

### 1.5 落地建议（若采用）

1. 把仓库设为公开（若需保持私有则此路不通，需买证书）。
2. 维护者注册 signpath.org → 提交 OSS 赞助申请（填仓库 URL + 许可证）。
3. 审核通过后拿 org id，在 GitHub Actions 加一个 `package + sign` workflow。
4. 本地 `npm run package` 产物上传 artifact，Action 签名后回传；或直接改 electron-builder 流程（`signPath` 集成目前官方推荐 Action 方式）。
5. 验证：`Get-AuthenticodeSignature` 显示签发者变为 SignPath OSS 证书；首次分发后观察 SmartScreen 信誉积累。

---

## 2. DuckDNS —— 免费动态域名

### 2.1 是什么

[DuckDNS](https://www.duckdns.org) 提供 **`*.duckdns.org` 免费子域名**（如 `gipfel.duckdns.org`），注册即得、永久免费、支持 A/AAAA/CNAME 记录，专为家庭服务器/动态 IP 设计。配合腾讯云这类**有固定公网 IP** 的服务器也适用（A 记录指到固定 IP 即可，不需要动态更新）。

### 2.2 配置要点

1. 用任意 OAuth（GitHub/Google/Twitter 等）登录 duckdns.org。
2. 创建子域名（如 `gipfel`），得到 `token`（一串 uuid，**等同该域名的管理凭据，勿入库**）。
3. **A 记录**：`gipfel.duckdns.org -> 106.54.26.86`（固定 IP 服务器一次性设置即可；家庭宽带动态 IP 才需要下面的定时更新）。
4. 动态 IP 自动更新（家庭场景才需要）：
   ```bash
   # 每 5 分钟 cron
   */5 * * * * curl -s "https://www.duckdns.org/update?domains=gipfel&token=<TOKEN>&ip=" >/dev/null
   ```
   留空 `ip=` 表示「用我出口 IP」，DuckDNS 自动解析。
5. 域名生效验证：`dig +short gipfel.duckdns.org` / `ping gipfel.duckdns.org`。

### 2.3 与腾讯云/nginx 的结合

- 腾讯云**不需要**做任何备案/白名单操作（域名解析在 DuckDNS，服务器只收包）。
- nginx `server_name` 从 IP 改为域名（自签名证书时代 CN=IP，换成域名后证书要重签，见第 3 节）。
- Electron 桌面端 8 处 `https://106.54.26.86` 硬编码 URL 需要替换为 `https://gipfel.duckdns.org`（`setCertificateVerifyProc` 的放行主机列表同步改）。

### 2.4 限制

- 免费子域名，非自有顶级域：换服务商/停止使用 DuckDNS 时域名不可迁移。
- 用于 Let's Encrypt 证书**完全可行**（HTTP-01 挑战只要求域名能解析到你的服务器）。
- 正式对外产品建议最终升级为付费自有域名（.com 等，年费几十元），DuckDNS 适合验证阶段/演示环境。

---

## 3. Let's Encrypt —— 免费 HTTPS 证书（替换自签名）

### 3.1 为什么需要它

当前云端是自签名证书（`openssl req -x509` 生成的），Electron 靠 `setCertificateVerifyProc` 特判放行 `106.54.26.86` 才能信任。换成 Let's Encrypt 后：
- 浏览器/Electron **原生信任**，删除主进程特判放行代码（更安全，不再「只放行自家 IP」）。
- 证书自动续期，不再每年手工重签。

### 3.2 前置条件（必须先满足）

1. **一个域名**（DuckDNS 免费子域名即可，见第 2 节）。
2. 域名 **A 记录指向 106.54.26.86** 且公网 80 端口可达（Let's Encrypt HTTP-01 挑战需要）。
   - ⚠️ 当前 nginx 80 端口是 `return 301 https://...` —— 挑战期间要让 `/.well-known/acme-challenge/` 路径走 200 而非 301，否则挑战失败（见 3.4）。

### 3.3 签发（certbot）

```bash
# Ubuntu 20.04 服务器
sudo apt update && sudo apt install -y certbot python3-certbot-nginx

# 签发（自动改 nginx 配置 + 配续期钩子）
sudo certbot --nginx -d gipfel.duckdns.org --email you@example.com --agree-tos --no-eff-email

# 测试续期（dry-run 必须成功）
sudo certbot renew --dry-run
```

### 3.4 关键配置要点（本项目的坑位对照）

1. **HTTP-01 挑战路径**：certbot 会临时创建 `/.well-known/acme-challenge/<token>`。若 nginx 80 块有 `return 301` 全站重定向，certbot 的 nginx 插件一般会自动处理（它会在 server 块插入 location），但**手写配置时**必须保留：
   ```nginx
   location /.well-known/acme-challenge/ { root /var/www/certbot; }
   ```
   放在 `return 301` 之前。腾讯云安全组必须放行 `TCP:80 入站`（当前已放行）。
2. **证书路径**：`/etc/letsencrypt/live/gipfel.duckdns.org/fullchain.pem` + `privkey.pem`，nginx 443 server 块改用：
   ```nginx
   ssl_certificate     /etc/letsencrypt/live/gipfel.duckdns.org/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/gipfel.duckdns.org/privkey.pem;
   ```
3. **自动续期**：certbot 自带 systemd timer（`systemctl list-timers | grep certbot`），无需 crontab；续期后自动 reload nginx（`--nginx` 插件安装时已配置 `deploy-hook` 或自动 reload）。
4. **换证书后 Electron 端**：删除 `session.defaultSession.setCertificateVerifyProc` 特判（或把放行主机改为 `gipfel.duckdns.org` 过渡一段时间）；桌面端 8 处硬编码 URL 同步换域名。
5. **证书只有 90 天**：`renew --dry-run` 通过 = 链路正常；续期失败时（域名解析断了/IP 变了）会在到期前 30 天开始邮件提醒。
6. **备选签发工具**：不想装 certbot 可用 `acme.sh`（bash 脚本，非 root 可跑，cron 续期）。acme.sh 对 DuckDNS 有官方 DNS API 插件（`--dns dns_duckdns`），**DNS-01 挑战可以完全不依赖 80 端口**——如果安全组 80 被锁，用这个方式签发更稳。

### 3.5 验证清单

```bash
curl -sk https://gipfel.duckdns.org/api/health          # 200
echo | openssl s_client -connect gipfel.duckdns.org:443 2>/dev/null | grep -i "issuer"  # O = Let's Encrypt
sudo certbot certificates                                 # 到期时间
```

---

## 4. 综合推荐路径（零成本组合）

| 阶段 | 方案 | 成本 |
|---|---|---|
| 演示/内部（现状） | 自签名 Authenticode + 自签名 HTTPS + IP 直连 | ¥0 |
| 对外验证（推荐下一步） | **DuckDNS 域名 + Let's Encrypt HTTPS**（去掉 Electron 特判）+ 保持自签名安装包或先上 SignPath | ¥0 |
| 正式对外 | DuckDNS 升级为付费自有域名（可选）+ **SignPath OSS 免费签名** + Let's Encrypt | ¥0（域名如升级约 ¥50-100/年） |

**最快见效组合**：DuckDNS（10 分钟）→ certbot 签发（10 分钟）→ 桌面端换域名 + 删特判 → SignPath OSS 申请（1-3 天审核）→ CI 签名。全部零成本。

---

## 5. 参考链接

- SignPath: https://signpath.org / https://signpath.io（OSS 赞助说明在 signpath.org 首页）
- SignPath GitHub Action: https://github.com/signpath/oss-sign-action
- DuckDNS: https://www.duckdns.org
- Let's Encrypt / certbot: https://certbot.eff.org
- acme.sh（含 DuckDNS DNS API 插件）: https://github.com/acmesh-official/acme.sh
