import { formatEvent, orderedTimeline, playerColor, type RoomState } from '@word-sync/shared';
/** 使用服务器已裁剪的本人视图；默认不导出聊天和提案记录。 */
export async function exportReport(room: RoomState, logs: boolean, owner: any): Promise<string[]> {
  const ctx = uni.createCanvasContext('report', owner);
  const width = 640, height = 1000, padding = 32;
  const lines: { text: string; color: string }[] = [];
  ctx.setFontSize(22);
  function add(text: string, color = '#282038') {
    let line = '';
    for (const char of Array.from(text)) {
      if (ctx.measureText(line + char).width > width - padding * 2 && line) { lines.push({ text: line, color }); line = ''; }
      line += char;
    }
    lines.push({ text: line, color });
  }
  add('同频词 · 回合纪念');
  for (const round of room.history) {
    add(`第 ${round.round} 回合`);
    for (const s of round.submissions) add(`${s.nickname}：${s.timedOut ? '时间到' : s.word || '空白'}`, playerColor(s.colorId, 'light'));
    if (logs) for (const item of orderedTimeline(round.feed)) add(formatEvent(item), playerColor(item.colorId, 'light'));
  }
  const perPage = 24, files: string[] = [];
  for (let start = 0; start < lines.length; start += perPage) {
    ctx.setFillStyle('#faf7ff'); ctx.fillRect(0, 0, width, height); ctx.setFontSize(22);
    lines.slice(start, start + perPage).forEach((line, i) => { ctx.setFillStyle(line.color); ctx.fillText(line.text, padding, 65 + i * 36); });
    ctx.setFillStyle('#666077'); ctx.fillText(`第 ${Math.floor(start / perPage) + 1} / ${Math.ceil(lines.length / perPage)} 页`, padding, 965);
    await new Promise<void>(resolve => ctx.draw(false, () => resolve()));
    const path = await new Promise<string>((resolve, reject) => uni.canvasToTempFilePath({ canvasId: 'report', width, height, destWidth: width, destHeight: height, fileType: 'png', success: r => resolve(r.tempFilePath), fail: reject }, owner));
    files.push(path);
  }
  return files;
}
