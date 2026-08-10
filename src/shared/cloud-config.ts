/**
 * cloud-config.ts — 云端地址统一配置（单点修改）
 *
 * 默认：IP 直连（自签名证书，Electron 特判放行）
 * 升级到域名后：把 CLOUD_HOST 改为 'gipfel.duckdns.org' 并重新打包
 *   - HTTPS 走 Let's Encrypt（浏览器/Electron 原生信任）
 *   - 可删除 src/main/index.ts 中的 setCertificateVerifyProc 特判
 */

/** 云端主机（无协议无端口） */
export const CLOUD_HOST = '106.54.26.86'

/** 云端完整基础地址（主进程/渲染进程通用） */
export const CLOUD_API_BASE = `https://${CLOUD_HOST}`

/** Electron 证书特判放行主机（自签名阶段需要；Let's Encrypt 后改为域名或删除） */
export const TRUSTED_CERT_HOSTS = [CLOUD_HOST]
