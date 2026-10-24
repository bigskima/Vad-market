import { Platform, Share } from 'react-native';

import type { MarketHistoryRow } from '@/services/market-api';

export type ResultCardProfile = {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  inviteCode: string | null;
};

export type ResultCardPrivacy = {
  showPayout: boolean;
  showPnl: boolean;
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

export function resultShareCopy(row: MarketHistoryRow, profile: ResultCardProfile, privacy: ResultCardPrivacy) {
  const result = row.result.toUpperCase();
  const headline = result === 'WON' ? 'I won this VAD prediction 🎉' : result === 'LOST' ? 'My VAD prediction is settled' : 'My VAD prediction result';
  const financialParts: string[] = [];
  if (privacy.showPayout && result === 'WON') financialParts.push(`Net payout: ${money(row.net_payout, row.asset_code)}`);
  if (privacy.showPnl) financialParts.push(`P&L: ${signedMoney(row.realized_pnl, row.asset_code)}`);
  if (!financialParts.length) financialParts.push('Financial result: private');
  const inviteLine = profile.inviteCode ? `Join VAD with my invite code: ${profile.inviteCode}` : 'VAD Market';

  return `${headline}\n${row.market_title}\nMy pick: ${row.selected_outcome} · Final: ${row.final_outcome ?? '—'}\n${financialParts.join(' · ')}\n${inviteLine}\n— ${profile.displayName}${profile.handle ? ` (@${profile.handle})` : ''}`;
}

export async function shareResultCard(row: MarketHistoryRow, profile: ResultCardProfile, privacy: ResultCardPrivacy) {
  const message = resultShareCopy(row, profile, privacy);
  if (Platform.OS === 'web') {
    const file = await createWebResultCardFile(row, profile, privacy);
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

export async function saveResultCard(row: MarketHistoryRow, profile: ResultCardProfile, privacy: ResultCardPrivacy) {
  if (Platform.OS === 'web') {
    const file = await createWebResultCardFile(row, profile, privacy);
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

  await Share.share({
    title: 'Save my VAD result',
    message: resultShareCopy(row, profile, privacy),
  });
}

async function createWebResultCardFile(row: MarketHistoryRow, profile: ResultCardProfile, privacy: ResultCardPrivacy) {
  const documentRef = (globalThis as any).document;
  const FileCtor = (globalThis as any).File;
  if (!documentRef || !FileCtor) return null;

  // Landscape bank-card proportions (1080 × 680) make the result graphic
  // feel like a premium trading card rather than a square social poster.
  const canvas = documentRef.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 680;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dark = '#070910';
  const panel = '#101421';
  const panelSoft = '#171d2d';
  const brand = '#7c5cff';
  const brandLight = '#b5a4ff';
  const success = '#2dd4a8';
  const danger = '#ff667d';
  const white = '#f8f9ff';
  const muted = '#aeb4c6';
  const result = String(row.result).toUpperCase();
  const resultColor = result === 'WON' ? success : result === 'LOST' ? danger : brandLight;
  const resultLabel = result === 'WON' ? 'WON' : result === 'LOST' ? 'LOST' : result.replaceAll('_', ' ');

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const glow = ctx.createRadialGradient(900, 100, 12, 900, 100, 520);
  glow.addColorStop(0, result === 'WON' ? 'rgba(45,212,168,0.19)' : 'rgba(124,92,255,0.30)');
  glow.addColorStop(1, 'rgba(7,9,16,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const panelGradient = ctx.createLinearGradient(18, 20, 1060, 660);
  panelGradient.addColorStop(0, '#151a2b');
  panelGradient.addColorStop(0.56, panel);
  panelGradient.addColorStop(1, '#101522');
  roundRect(ctx, 20, 20, 1040, 640, 36);
  ctx.fillStyle = panelGradient;
  ctx.fill();
  ctx.strokeStyle = 'rgba(169,149,255,0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundRect(ctx, 35, 35, 1010, 610, 28);
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Restrained circuit arcs give the background a refined fintech feel.
  ctx.save();
  ctx.strokeStyle = 'rgba(169,149,255,0.10)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(948, 255, 146, -1.2, 1.65);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(948, 255, 168, -1.2, 1.65);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = brandLight;
  ctx.font = '800 31px system-ui, sans-serif';
  ctx.fillText('VAD', 64, 78);
  ctx.fillStyle = muted;
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillText('TRADING RESULT', 137, 77);

  roundRect(ctx, 824, 51, 190, 42, 21);
  ctx.fillStyle = `${resultColor}20`;
  ctx.fill();
  ctx.strokeStyle = resultColor;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = resultColor;
  ctx.font = '800 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(resultLabel, 919, 78, 166);
  ctx.textAlign = 'left';

  const avatarX = 64;
  const avatarY = 106;
  const avatarSize = 64;
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
    ctx.fillStyle = 'rgba(124,92,255,0.24)';
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = white;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials(profile.displayName), avatarX + avatarSize / 2, avatarY + 42);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = resultColor;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = white;
  ctx.font = '800 26px system-ui, sans-serif';
  ctx.fillText(profile.displayName, 151, 137, 430);
  ctx.fillStyle = muted;
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText(profile.handle ? `@${profile.handle}` : 'VAD participant', 151, 166, 430);

  ctx.fillStyle = muted;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText('MARKET', 64, 220);
  ctx.fillStyle = white;
  ctx.font = '800 39px system-ui, sans-serif';
  wrapText(ctx, row.market_title, 64, 267, 535, 43, 2);

  const drawOutcomePill = (label: string, value: string, x: number, y: number, width: number) => {
    roundRect(ctx, x, y, width, 49, 14);
    ctx.fillStyle = panelSoft;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(label, x + 14, y + 18);
    ctx.fillStyle = white;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText(value, x + 14, y + 39, width - 28);
  };
  drawOutcomePill('MY PICK', row.selected_outcome, 64, 336, 210);
  drawOutcomePill('FINAL RESULT', row.final_outcome ?? '—', 287, 336, 245);

  roundRect(ctx, 644, 190, 370, 196, 24);
  ctx.fillStyle = 'rgba(7,9,16,0.45)';
  ctx.fill();
  ctx.strokeStyle = `${resultColor}85`;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText('SETTLEMENT STATUS', 672, 225);
  ctx.fillStyle = resultColor;
  ctx.font = '900 49px system-ui, sans-serif';
  ctx.fillText(resultLabel, 672, 286, 315);
  ctx.fillStyle = white;
  ctx.font = '600 17px system-ui, sans-serif';
  const resultCaption = result === 'WON'
    ? 'Your pick matched the final outcome.'
    : result === 'LOST'
      ? 'The final outcome did not match your pick.'
      : 'This result is recorded in your VAD history.';
  ctx.fillText(resultCaption, 672, 322, 310);
  ctx.fillStyle = muted;
  ctx.font = '500 14px system-ui, sans-serif';
  ctx.fillText('Result from your recorded settlement', 672, 353, 310);

  drawMetric(ctx, 'STAKE', money(row.stake_amount, row.asset_code), 64, 416, 280, brand, white, muted, panelSoft);
  drawMetric(
    ctx,
    'NET PAYOUT',
    privacy.showPayout && result === 'WON' ? money(row.net_payout, row.asset_code) : privacy.showPayout ? money(row.net_payout, row.asset_code) : 'PRIVATE',
    365,
    416,
    300,
    privacy.showPayout ? resultColor : brand,
    white,
    muted,
    panelSoft,
  );
  drawMetric(
    ctx,
    'REALIZED P&L',
    privacy.showPnl ? signedMoney(row.realized_pnl, row.asset_code) : 'PRIVATE',
    686,
    416,
    328,
    privacy.showPnl ? resultColor : brand,
    white,
    muted,
    panelSoft,
  );

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(64, 551);
  ctx.lineTo(1014, 551);
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '500 14px system-ui, sans-serif';
  const settledLabel = row.settled_at ? `Settled ${new Date(row.settled_at).toLocaleDateString()}` : 'VAD Market result';
  ctx.fillText(settledLabel, 64, 590, 255);
  ctx.fillStyle = brandLight;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(`INVITE · ${profile.inviteCode ?? 'VAD MARKET'}`, 368, 590, 275);
  ctx.fillStyle = muted;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Make your view. Own your result.', 1014, 590, 325);
  ctx.textAlign = 'left';

  const blob = await new Promise<any>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return null;
  return new FileCtor([blob], `vad-${result.toLowerCase()}-${row.market_id.slice(0, 8)}.png`, { type: 'image/png' });
}

function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawMetric(
  ctx: any,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  accent: string,
  white: string,
  muted: string,
  background: string,
) {
  roundRect(ctx, x, y, width, 118, 22);
  ctx.fillStyle = background;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillText(label, x + 22, y + 34);
  ctx.fillStyle = white;
  ctx.font = '800 29px system-ui, sans-serif';
  ctx.fillText(value, x + 22, y + 82, width - 44);
}

function wrapText(ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1].trimEnd();
    while (last.length && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[maxLines - 1] = `${last}…`;
  }

  lines.forEach((entry, index) => ctx.fillText(entry, x, y + index * lineHeight, maxWidth));
  return y + Math.max(0, lines.length - 1) * lineHeight;
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
