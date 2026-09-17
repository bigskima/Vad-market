import { Platform, Share } from 'react-native';

import type { MarketHistoryRow } from '@/services/market-api';

export type ResultCardProfile = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
};

function money(value: number | string, assetCode: string) {
  const numeric = Number(value ?? 0);
  const formatted = Math.abs(numeric).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const sign = numeric < 0 ? '-' : '';
  return assetCode === 'NGN' || assetCode === 'TNGN' ? `${sign}₦${formatted}` : `${sign}${formatted} ${assetCode}`;
}

function signedMoney(value: number | string, assetCode: string) {
  const numeric = Number(value ?? 0);
  return `${numeric > 0 ? '+' : ''}${money(numeric, assetCode)}`;
}

export function resultShareCopy(row: MarketHistoryRow, profile: ResultCardProfile) {
  const result = row.result.toUpperCase();
  const headline = result === 'WON' ? 'I won this VAD prediction 🎉' : result === 'LOST' ? 'My VAD prediction is settled' : 'My VAD prediction result';
  const payoutLine = result === 'WON'
    ? `Net payout: ${money(row.net_payout, row.asset_code)} · P&L: ${signedMoney(row.realized_pnl, row.asset_code)}`
    : `Result: ${result} · P&L: ${signedMoney(row.realized_pnl, row.asset_code)}`;
  return `${headline}\n${row.market_title}\nMy pick: ${row.selected_outcome} · Final: ${row.final_outcome ?? '—'}\n${payoutLine}\n— ${profile.displayName}${profile.handle ? ` (@${profile.handle})` : ''} on VAD Market`;
}

export async function shareResultCard(row: MarketHistoryRow, profile: ResultCardProfile) {
  const message = resultShareCopy(row, profile);
  if (Platform.OS === 'web') {
    const file = await createWebResultCardFile(row, profile);
    const nav = (globalThis as any).navigator;
    if (file && nav?.share) {
      try {
        if (!nav.canShare || nav.canShare({ files: [file] })) {
          await nav.share({
            title: `${row.result} · VAD Market`,
            text: message,
            files: [file],
          });
          return;
        }
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
      }
    }
  }
  await Share.share({ title: `${row.result} · VAD Market`, message });
}

export async function saveResultCard(row: MarketHistoryRow, profile: ResultCardProfile) {
  if (Platform.OS === 'web') {
    const file = await createWebResultCardFile(row, profile);
    const documentRef = (globalThis as any).document;
    const urlApi = (globalThis as any).URL;
    if (file && documentRef && urlApi?.createObjectURL) {
      const url = urlApi.createObjectURL(file);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = `vad-${row.result.toLowerCase()}-${row.market_id.slice(0, 8)}.png`;
      documentRef.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => urlApi.revokeObjectURL(url), 1000);
      return;
    }
  }

  // Expo native builds use the system share/save sheet without introducing a
  // second file-storage permission flow. The rendered card remains available
  // permanently in Portfolio even when the OS does not expose a local save target.
  await Share.share({
    title: 'Save my VAD result',
    message: resultShareCopy(row, profile),
  });
}

async function createWebResultCardFile(row: MarketHistoryRow, profile: ResultCardProfile) {
  const documentRef = (globalThis as any).document;
  const FileCtor = (globalThis as any).File;
  if (!documentRef || !FileCtor) return null;

  const canvas = documentRef.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dark = '#080a12';
  const panel = '#111526';
  const brand = '#7c5cff';
  const success = '#2dd4a8';
  const danger = '#ff667d';
  const white = '#f8f9ff';
  const muted = '#aeb4c6';
  const resultColor = row.result === 'WON' ? success : row.result === 'LOST' ? danger : brand;

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createRadialGradient(890, 120, 20, 890, 120, 520);
  gradient.addColorStop(0, 'rgba(124,92,255,0.38)');
  gradient.addColorStop(1, 'rgba(124,92,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, 650);

  roundRect(ctx, 70, 70, 940, 1210, 48);
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(124,92,255,0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = brand;
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText('VAD MARKET', 130, 150);

  const avatarX = 130;
  const avatarY = 205;
  const avatarSize = 120;
  let avatarDrawn = false;
  if (profile.avatarUrl) {
    try {
      const image = await loadImage(profile.avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
      avatarDrawn = true;
    } catch {
      avatarDrawn = false;
    }
  }
  if (!avatarDrawn) {
    ctx.fillStyle = 'rgba(124,92,255,0.22)';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white;
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials(profile.displayName), avatarX + avatarSize / 2, avatarY + 75);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = white;
  ctx.font = '800 40px system-ui, sans-serif';
  ctx.fillText(profile.displayName, 280, 250);
  ctx.fillStyle = muted;
  ctx.font = '500 28px system-ui, sans-serif';
  ctx.fillText(profile.handle ? `@${profile.handle}` : 'VAD participant', 280, 295);

  ctx.fillStyle = resultColor;
  ctx.font = '800 46px system-ui, sans-serif';
  ctx.fillText(row.result.toUpperCase(), 130, 405);

  ctx.fillStyle = white;
  ctx.font = '800 48px system-ui, sans-serif';
  const nextY = wrapText(ctx, row.market_title, 130, 480, 820, 60, 4);

  const outcomeY = Math.max(nextY + 35, 700);
  drawMetric(ctx, 'MY PICK', row.selected_outcome, 130, outcomeY, 370, resultColor, white, muted);
  drawMetric(ctx, 'FINAL RESULT', row.final_outcome ?? '—', 560, outcomeY, 370, resultColor, white, muted);

  const moneyY = outcomeY + 190;
  drawMetric(ctx, 'STAKE', money(row.stake_amount, row.asset_code), 130, moneyY, 370, brand, white, muted);
  drawMetric(ctx, row.result === 'WON' ? 'NET PAYOUT' : 'REALIZED P&L', row.result === 'WON' ? money(row.net_payout, row.asset_code) : signedMoney(row.realized_pnl, row.asset_code), 560, moneyY, 370, resultColor, white, muted);

  ctx.fillStyle = muted;
  ctx.font = '500 25px system-ui, sans-serif';
  ctx.fillText(`Trading fee ${money(row.trading_fee, row.asset_code)} · Settlement fee ${money(row.settlement_fee, row.asset_code)}`, 130, 1130);
  ctx.fillText(row.settled_at ? `Settled ${new Date(row.settled_at).toLocaleString()}` : 'Final market result', 130, 1180);
  ctx.fillStyle = brand;
  ctx.font = '700 26px system-ui, sans-serif';
  ctx.fillText('Make your view. Own your result. · VAD', 130, 1230);

  const blob = await new Promise<any>((resolve) => canvas.toBlob(resolve, 'image/png', 0.94));
  if (!blob) return null;
  return new FileCtor([blob], `vad-${row.result.toLowerCase()}-${row.market_id.slice(0, 8)}.png`, { type: 'image/png' });
}

function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawMetric(ctx: any, label: string, value: string, x: number, y: number, width: number, accent: string, white: string, muted: string) {
  roundRect(ctx, x, y, width, 145, 28);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText(label, x + 28, y + 43);
  ctx.fillStyle = white;
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.fillText(value, x + 28, y + 99, width - 56);
}

function wrapText(ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/);
  let line = '';
  let lineIndex = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineIndex * lineHeight);
      lineIndex += 1;
      line = word;
      if (lineIndex >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && lineIndex < maxLines) ctx.fillText(line, x, y + lineIndex * lineHeight);
  return y + lineIndex * lineHeight;
}

function loadImage(url: string) {
  return new Promise<any>((resolve, reject) => {
    const ImageCtor = (globalThis as any).Image;
    if (!ImageCtor) return reject(new Error('Image unavailable'));
    const image = new ImageCtor();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2)).toUpperCase() || 'V';
}
