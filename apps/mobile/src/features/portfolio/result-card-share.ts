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

  // Slightly taller than square so the card feels premium and social-first
  // without becoming a long poster.
  const canvas = documentRef.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1180;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const dark = '#070910';
  const panel = '#101421';
  const panelSoft = '#151a2b';
  const brand = '#7c5cff';
  const brandLight = '#a995ff';
  const success = '#2dd4a8';
  const danger = '#ff667d';
  const white = '#f8f9ff';
  const muted = '#aeb4c6';
  const resultColor = row.result === 'WON' ? success : row.result === 'LOST' ? danger : brand;

  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const topGlow = ctx.createRadialGradient(860, 30, 25, 860, 30, 520);
  topGlow.addColorStop(0, 'rgba(124,92,255,0.42)');
  topGlow.addColorStop(1, 'rgba(124,92,255,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, canvas.width, 620);

  const lowerGlow = ctx.createRadialGradient(110, 1110, 10, 110, 1110, 360);
  lowerGlow.addColorStop(0, row.result === 'WON' ? 'rgba(45,212,168,0.16)' : 'rgba(255,102,125,0.12)');
  lowerGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 760, canvas.width, 420);

  roundRect(ctx, 58, 54, 964, 1072, 38);
  ctx.fillStyle = panel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(169,149,255,0.42)';
  ctx.lineWidth = 2;
  ctx.stroke();

  roundRect(ctx, 76, 72, 928, 1036, 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = brandLight;
  ctx.font = '800 30px system-ui, sans-serif';
  ctx.fillText('VAD', 116, 132);
  ctx.fillStyle = muted;
  ctx.font = '650 19px system-ui, sans-serif';
  ctx.fillText('VERIFIED MARKET RESULT', 186, 130);

  roundRect(ctx, 765, 95, 188, 48, 24);
  ctx.fillStyle = `${resultColor}22`;
  ctx.fill();
  ctx.strokeStyle = resultColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = resultColor;
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(row.result.toUpperCase(), 859, 126);
  ctx.textAlign = 'left';

  const avatarX = 116;
  const avatarY = 176;
  const avatarSize = 104;
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
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(initials(profile.displayName), avatarX + avatarSize / 2, avatarY + 66);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = resultColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = white;
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.fillText(profile.displayName, 252, 214);
  ctx.fillStyle = muted;
  ctx.font = '500 24px system-ui, sans-serif';
  ctx.fillText(profile.handle ? `@${profile.handle}` : 'VAD participant', 252, 252);

  ctx.fillStyle = white;
  ctx.font = '800 44px system-ui, sans-serif';
  const nextY = wrapText(ctx, row.market_title, 116, 355, 848, 53, 4);

  const outcomeY = Math.max(nextY + 30, 555);
  drawMetric(ctx, 'MY PICK', row.selected_outcome, 116, outcomeY, 394, resultColor, white, muted, panelSoft);
  drawMetric(ctx, 'FINAL RESULT', row.final_outcome ?? '—', 554, outcomeY, 394, resultColor, white, muted, panelSoft);

  const financialY = outcomeY + 154;
  drawMetric(ctx, 'STAKE', money(row.stake_amount, row.asset_code), 116, financialY, 260, brand, white, muted, panelSoft);
  drawMetric(
    ctx,
    'NET PAYOUT',
    privacy.showPayout ? money(row.net_payout, row.asset_code) : 'PRIVATE',
    410,
    financialY,
    260,
    privacy.showPayout ? resultColor : brand,
    white,
    muted,
    panelSoft,
  );
  drawMetric(
    ctx,
    'REALIZED P&L',
    privacy.showPnl ? signedMoney(row.realized_pnl, row.asset_code) : 'PRIVATE',
    704,
    financialY,
    244,
    privacy.showPnl ? resultColor : brand,
    white,
    muted,
    panelSoft,
  );

  const footerY = Math.min(financialY + 190, 958);
  ctx.fillStyle = muted;
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText(`VAD trading fee ${money(row.trading_fee, row.asset_code)} · VAD settlement fee ${money(row.settlement_fee, row.asset_code)}`, 116, footerY);
  ctx.fillText(row.settled_at ? `Settled ${new Date(row.settled_at).toLocaleString()}` : 'Final market result', 116, footerY + 34);

  roundRect(ctx, 116, footerY + 62, 832, 76, 20);
  ctx.fillStyle = 'rgba(124,92,255,0.10)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(169,149,255,0.30)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = '650 18px system-ui, sans-serif';
  ctx.fillText('INVITE TO VAD', 142, footerY + 91);
  ctx.fillStyle = white;
  ctx.font = '800 25px system-ui, sans-serif';
  ctx.fillText(profile.inviteCode ?? 'VAD MARKET', 142, footerY + 119);
  ctx.fillStyle = brandLight;
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Make your view. Own your result.', 922, footerY + 107);
  ctx.textAlign = 'left';

  const blob = await new Promise<any>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
  if (!blob) return null;
  return new FileCtor([blob], `vad-${row.result.toLowerCase()}-${row.market_id.slice(0, 8)}.png`, { type: 'image/png' });
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
