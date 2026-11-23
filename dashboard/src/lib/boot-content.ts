// Procedural generators for dense, varied boot/hacker log content. Each call
// returns a fresh line — streaming these fast makes the boot feel like
// thousands of detailed lines fly by, without hardcoding them.

const r = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const hex = (n: number) => Array.from({ length: n }, () => r(0, 15).toString(16)).join('');
const HEXU = (n: number) => hex(n).toUpperCase();
const ip = () => `${r(10, 250)}.${r(0, 255)}.${r(0, 255)}.${r(1, 254)}`;
const mac = () => Array.from({ length: 6 }, () => hex(2)).join(':');
const b64 = () => {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  return Array.from({ length: r(24, 40) }, () => pick(c.split(''))).join('');
};
const port = () => pick([21, 22, 23, 25, 53, 80, 110, 143, 443, 587, 993, 3306, 5432, 6379, 8080, 8765, 27017]);
const path = () => pick(['/etc', '/var/log', '/usr/lib', '/opt/maow', '/srv/db', '/home/op', '/proc', '/dev']) + pick(['/auth', '/core', '/net', '/cache', '/sess', '/keys', '/audio', '/cfg']) + '/' + pick(['data', 'index', 'shadow', 'token', 'vault', 'node', 'sys', 'mem']) + '.' + pick(['so', 'bin', 'db', 'dat', 'enc', 'key', 'log']);

// ── Generic kernel/system boot lines ─────────────────────────────────────────
export function bootLine(): string {
  return pick([
    () => `[ ${(Math.random() * 9).toFixed(6)} ] ${pick(['ACPI', 'PCI', 'usb', 'ata', 'mem', 'cpu', 'net'])}: ${pick(['probe', 'init', 'reset', 'enabled', 'detected', 'registered'])} ${HEXU(4)}`,
    () => `mounting ${path()} ... ${pick(['ok', 'ok', 'ok', 'done'])}`,
    () => `loading module ${pick(['snd_core', 'distube', 'ytdlp', 'ffmpeg', 'gateway', 'voice', 'crypto'])}.ko @ 0x${HEXU(8)}`,
    () => `alloc ${r(4, 512)}K @ 0x${HEXU(12)} → 0x${HEXU(12)}`,
    () => `${pick(['daemon', 'service', 'worker'])} ${pick(['audio', 'sync', 'cron', 'ws', 'http'])}d started [pid ${r(100, 9999)}]`,
    () => `chk ${HEXU(2)}:${HEXU(2)}:${HEXU(2)} crc=${HEXU(8)} ${pick(['PASS', 'PASS', 'PASS', 'OK'])}`,
  ])();
}

// ── Network / scan lines ─────────────────────────────────────────────────────
export function netLine(): string {
  return pick([
    () => `${ip()}:${port()} → ${pick(['SYN', 'ACK', 'SYN-ACK', 'RST', 'FIN', 'PSH'])} seq=${r(10000, 99999)} win=${r(1024, 65535)}`,
    () => `scanning ${ip()} port ${port()} ... ${pick(['OPEN', 'OPEN', 'closed', 'filtered'])}`,
    () => `route ${ip()} via ${ip()} dev eth0 metric ${r(1, 100)}`,
    () => `tx ${r(40, 1500)}B rx ${r(40, 1500)}B latency ${r(1, 80)}ms`,
    () => `arp ${ip()} is-at ${mac()}`,
    () => `tls handshake ${ip()} cipher ${pick(['AES256-GCM', 'CHACHA20', 'ECDHE-RSA'])} ✓`,
  ])();
}

// ── Hacker intrusion lines ───────────────────────────────────────────────────
export function hackLine(): string {
  return pick([
    () => `[${pick(['EXEC', 'INJECT', 'SCAN', 'CRACK', 'BYPASS'])}] ${HEXU(8)} ${b64().slice(0, r(16, 30))}`,
    () => `0x${HEXU(8)}: ${Array.from({ length: 8 }, () => hex(2)).join(' ')}  ${b64().slice(0, 8)}`,
    () => `${pick(['payload', 'shellcode', 'exploit', 'rootkit'])} → ${ip()}:${port()} [${r(1, 100)}%]`,
    () => `decrypting block ${r(1, 9999)}/${r(9999, 99999)} key=0x${HEXU(16)}`,
    () => `bypassing ${pick(['WAF', 'IDS', 'firewall', '2FA', 'rate-limit', 'honeypot'])} ... ${pick(['EVADED', 'EVADED', 'patched', 'BYPASSED'])}`,
    () => `dumping ${path()} → ${r(1, 999)}KB exfiltrated`,
    () => netLine(),
    () => `hash ${pick(['md5', 'sha256', 'bcrypt'])} ${hex(r(24, 40))} ... ${pick(['MATCH', 'no match', 'no match', 'collision'])}`,
  ])();
}

// Brute-force attempt strings (random gibberish "passwords").
const PW_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
export function pwGuess(len = 12): string {
  return Array.from({ length: len }, () => pick(PW_CHARS.split(''))).join('');
}
export const intrusionTarget = () => ip();
export const sessionHash = () => HEXU(32);
