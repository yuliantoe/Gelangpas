import type { DecryptedQrPayload, TicketTier } from '../types/event.ts';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importAesKey(keyHex: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const raw = hexToBytes(keyHex);
  const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
  return window.crypto.subtle.importKey('raw', buffer, { name: 'AES-GCM' }, false, usages);
}

export async function encryptWristbandPayloadClient(
  payload: Omit<DecryptedQrPayload, 'sig'>,
  keyHex: string
): Promise<string> {
  const sigSource = `${payload.id}|${payload.code}|${payload.ev}|${payload.tier}|${payload.ver}`;
  const encoder = new TextEncoder();
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(sigSource + keyHex));
  const sigBytes = new Uint8Array(hashBuffer).slice(0, 8);
  const sig = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const fullPayload: DecryptedQrPayload = { ...payload, sig };
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(keyHex, ['encrypt']);
  const encoded = encoder.encode(JSON.stringify(fullPayload));

  const encryptedBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return `GP1.${payload.ver}.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(encryptedBuf))}`;
}

export async function decryptWristbandTokenClient(
  token: string,
  keyHex: string
): Promise<{ valid: boolean; payload?: DecryptedQrPayload; reason?: string }> {
  try {
    const parts = token.trim().split('.');
    if (parts.length !== 4 || parts[0] !== 'GP1') {
      return { valid: false, reason: 'Format token QR tidak dikenali (bukan protokol GP1)' };
    }

    const version = Number(parts[1]);
    const iv = base64UrlToBytes(parts[2]);
    const cipherWithTag = base64UrlToBytes(parts[3]);

    if (iv.length !== 12 || cipherWithTag.length < 16) {
      return { valid: false, reason: 'Struktur IV atau tag autentikasi AES-GCM rusak' };
    }

    const key = await importAesKey(keyHex, ['decrypt']);
    const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer;
    const cipherBuffer = cipherWithTag.buffer.slice(
      cipherWithTag.byteOffset,
      cipherWithTag.byteOffset + cipherWithTag.byteLength
    ) as ArrayBuffer;

    const decryptedBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
      key,
      cipherBuffer
    );

    const decoded = new TextDecoder().decode(decryptedBuf);
    const payload = JSON.parse(decoded) as DecryptedQrPayload;

    if (payload.ver !== version) {
      return { valid: false, reason: 'Versi kunci enkripsi token tidak cocok' };
    }

    const sigSource = `${payload.id}|${payload.code}|${payload.ev}|${payload.tier}|${payload.ver}`;
    const hashBuffer = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(sigSource + keyHex)
    );
    const expectedSig = Array.from(new Uint8Array(hashBuffer).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (payload.sig !== expectedSig) {
      return { valid: false, reason: 'Integritas tanda tangan SHA-256 tidak valid' };
    }

    return { valid: true, payload };
  } catch {
    return {
      valid: false,
      reason: 'Dekripsi AES-256-GCM gagal: kunci tidak cocok atau QR dimanipulasi',
    };
  }
}

export function generateTicketCode(tier: TicketTier): string {
  const prefixMap: Record<string, string> = {
    VIP: 'VIP',
    Reguler: 'REG',
    'Early Bird': 'EBD',
    Backstage: 'BKS',
    Media: 'MDA',
  };
  const fallbackPrefix =
    tier
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 3)
      .toUpperCase() || 'TKT';
  const prefix = prefixMap[tier] || fallbackPrefix;
  const rand = window.crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(rand)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `GP-${prefix}-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
