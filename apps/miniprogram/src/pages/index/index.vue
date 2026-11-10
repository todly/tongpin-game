<script setup lang="ts">
import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { playerColor, formatEvent, orderedTimeline, randomNickname, syncInput, SafeMonotonic, StateCountdown, createContentGuard } from '@word-sync/shared';
import { useGameStore } from '../../stores/game';
import { exportReport } from '../../utils/report';
const game = useGameStore(), nickname = ref(randomNickname()), code = ref(''), word = ref(''), chat = ref(''), history = ref(false), logs = ref(false), exporting = ref(false), files = ref<string[]>([]), message = ref(''), tick = ref(0);
const performanceClock = (globalThis as any).wx?.getPerformance?.();
const monotonic = new SafeMonotonic(() => performanceClock?.now?.() ?? Date.now());
const countdown = new StateCountdown(() => monotonic.now());
const owner = getCurrentInstance()!.proxy;
const clock = setInterval(() => { tick.value++; }, 250); onUnmounted(() => clearInterval(clock));
onLoad(query => { code.value = typeof query?.roomCode === 'string' ? query.roomCode.slice(0, 6).toUpperCase() : ''; });
onShareAppMessage(() => ({ title: '来同频词，看看我们能否想到一起', path: '/pages/index/index' + (game.room ? `?roomCode=${encodeURIComponent(game.room.code)}` : '') }));
watch(() => game.me?.nickname, value => { if (value) nickname.value = value; });
watch(() => game.room, (room, previous) => { if (room) { word.value = syncInput(word.value, previous, room, game.session?.playerId || ''); countdown.anchor(room); } if (room?.roundId !== previous?.roundId) { chat.value = ''; history.value = false; } });
const submitted = computed(() => game.room?.submittedPlayerIds.includes(game.me?.id || ''));
const seconds = computed(() => { void tick.value; const remaining = countdown.remaining(game.room?.view === 'reveal' ? 'reveal' : 'writing'); return remaining === undefined ? undefined : Math.max(0, Math.ceil(remaining / 1000)); });
async function act(event: string, data: unknown = null) { try { await game.act(event, data); } catch {} }
// 房主移出玩家前二次确认，避免误触。
function kick(playerId: string, nickname: string) { uni.showModal({ title: '移出玩家', content: `确定将「${nickname}」移出房间吗？`, success: result => { if (result.confirm) act('room:kick', { playerId }); } }); }
// 输入即校验：命中敏感词立即清空输入框，避免违规内容停留在输入框里。
const guards: Record<string, ReturnType<typeof createContentGuard>> = {};
function guard(kind: 'nickname' | 'word' | 'chat') {
  return guards[kind] ??= createContentGuard({
    check: text => game.check(text, kind === 'nickname' ? 1 : 5),
    onHit: tip => {
      if (kind === 'nickname') nickname.value = '';
      else if (kind === 'word') word.value = '';
      else chat.value = '';
      game.error = tip;
    },
  });
}
// 聊天发送前检测敏感词，命中则禁止发送。
async function sendChat() { if (!chat.value.trim()) return; try { await game.act('group:chat', { ...game.round(), text: chat.value }); chat.value = ''; } catch {} }
// 词语提交/候选词提议前检测敏感词，命中则禁止提交。
function submitWord() { act(game.myGroup ? 'group:propose' : 'game:submit', { ...game.round(), word: word.value }); }
// 创建/加入房间与保存昵称前检测昵称敏感词，命中则禁止提交。
function createRoom() { act('room:create', { nickname: nickname.value }); }
function joinRoom() { act('room:join', { code: code.value, nickname: nickname.value }); }
function rename() { act('lobby:rename', nickname.value); }
async function shareImage() {
  if (!game.room || exporting.value) return; exporting.value = true; message.value = '正在生成分页图片…';
  try { files.value = await exportReport(JSON.parse(JSON.stringify(game.room)), logs.value, owner); message.value = `已生成 ${files.value.length} 张图片，可预览或主动保存。`; uni.previewImage({ urls: files.value }); }
  catch { message.value = '图片生成失败，请重试。'; } finally { exporting.value = false; }
}
function toggleLogs(event: any) { logs.value = !!event.detail.value; }
function preview() { uni.previewImage({ urls: files.value }); }
function openSettings() { uni.openSetting({}); }
async function saveImages() {
  try {
    for (const filePath of files.value) await new Promise<void>((resolve, reject) => uni.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject }));
    message.value = '已保存全部图片。';
  } catch { message.value = '保存已取消或相册权限被拒绝。可以在设置中允许相册权限后重试。'; }
}
</script>
<template>
<view class="page">
  <text class="title">同频词</text>
  <text v-if="!game.available" class="hint">连接或身份恢复中，请暂勿操作。</text>
  <text v-if="game.error" class="error">{{ game.error }}</text>
  <template v-if="!game.room">
    <text class="hint">一个词，想到一起。</text>
    <input v-model="nickname" maxlength="20" placeholder="你的昵称" @input="guard('nickname').input($event.detail.value)" />
    <button :disabled="!game.available" @click="createRoom">创建房间</button>
    <input v-model="code" maxlength="6" placeholder="输入六位房间码" />
    <button :disabled="!game.available || code.length !== 6" @click="joinRoom">加入房间</button>
  </template>
  <template v-else>
    <view class="row"><text>房间 {{ game.room.code }}</text><button open-type="share">邀请朋友</button><button @click="history = !history">{{ history ? '关闭历史' : '回合历史' }}</button></view>
    <button v-if="game.canLeave" :disabled="!game.available" @click="act('room:leave')">离开房间</button>
    <template v-if="history">
      <text v-if="!game.room.history.length" class="hint">暂无回合记录。</text>
      <view v-for="round in [...game.room.history].reverse()" :key="round.roundId" class="card">
        <text class="title">第 {{ round.round }} 回合</text>
        <view v-for="entry in round.submissions" :key="entry.playerId"><text :style="{ color: playerColor(entry.colorId) }">{{ entry.nickname }}：{{ entry.timedOut ? '时间到' : entry.word || '空白' }}</text></view>
        <text class="hint">本人可见记录</text><view v-for="item in orderedTimeline(round.feed)" :key="item.id"><text :style="{ color: playerColor(item.colorId) }">{{ formatEvent(item) }}</text></view>
      </view>
    </template>
    <template v-else-if="game.room.view === 'lobby'">
      <text class="title">房间大厅 {{ game.room.players.length }}/6</text>
      <input v-model="nickname" maxlength="20" @input="guard('nickname').input($event.detail.value)" /><button :disabled="!game.available" @click="rename">保存昵称</button>
      <view v-for="p in game.room.players" :key="p.id" class="card"><text :style="{ color: playerColor(p.colorId) }">{{ p.nickname }}{{ p.id === game.room.ownerId ? '（房主）' : '' }}</text><text class="hint">{{ !p.connected ? '离线，可重连' : game.room.phase === 'ended' && !p.returnedToLobby ? '查看结果中' : p.ready ? '已准备' : '等待准备' }}</text><button v-if="game.isOwner && p.id !== game.room.ownerId" class="kick-button" :disabled="!game.available" size="mini" @click="kick(p.id, p.nickname)">移出</button></view>
      <view class="card"><text>回合计时 {{ game.room.settings.timerSeconds }} 秒</text><slider :value="game.room.settings.timerSeconds" :min="10" :max="180" :step="5" :disabled="!game.available || !game.isOwner" @change="act('lobby:settings', { timerSeconds: $event.detail.value })" /><text>最多 {{ game.room.settings.maxRounds }} 回合</text><slider :value="game.room.settings.maxRounds" :min="1" :max="30" :disabled="!game.available || !game.isOwner" @change="act('lobby:settings', { maxRounds: $event.detail.value })" /><text class="hint">只有房主可以修改设置。</text></view>
      <button :disabled="!game.available" @click="act('lobby:ready', !game.me?.ready)">{{ game.me?.ready ? '取消准备' : '我准备好了' }}</button>
      <text class="hint">全员在线、返回大厅并准备后自动开始。</text>
    </template>
    <template v-else-if="game.room.view === 'writing'">
      <text class="title">第 {{ game.room.round }} 回合<template v-if="seconds !== undefined"> · {{ seconds }} 秒</template></text>
      <text>{{ game.myGroup ? '提议一个小组候选词' : '写下你觉得其他人也会写的词' }}</text>
      <input v-model="word" maxlength="40" :disabled="submitted || !game.available || !!game.room.proposals.length" placeholder="相信你的直觉" @input="guard('word').input($event.detail.value)" />
      <button :disabled="submitted || !game.available || !!game.room.proposals.length" @click="submitWord">{{ submitted ? '已锁定' : game.myGroup ? '提出候选词' : '锁定这个词' }}</button>
      <view v-for="group in game.room.currentGroups" :key="group.id" class="card"><text>永久同频小组：</text><text v-for="id in group.members" :key="id" :style="{ color: playerColor(game.room.players.find(p => p.id === id)?.colorId) }">{{ game.room.players.find(p => p.id === id)?.nickname }} </text></view>
      <view class="row"><text v-for="p in game.room.players" :key="p.id" :style="{ color: playerColor(p.colorId) }">{{ p.nickname }}：{{ game.room.submittedPlayerIds.includes(p.id) ? '已提交' : '思考中' }}</text></view>
      <view v-for="proposal in game.room.proposals" :key="proposal.id" class="card"><text class="title">{{ proposal.word }}</text><text>已同意 {{ proposal.confirmations.length }}/{{ proposal.memberIds.length }}</text><button :disabled="!game.available || proposal.confirmations.includes(game.me?.id || '')" @click="act('group:confirm', { ...game.round(), proposalId: proposal.id })">同意候选</button><button :disabled="!game.available" @click="act('group:reject', { ...game.round(), proposalId: proposal.id })">否决候选</button></view>
      <text class="hint">全组同意立即提交；超时采用当前未否决的候选词。游戏中不能离房。</text>
      <view class="card"><text>{{ game.myGroup ? '仅同组可见的聊天' : '仅自己可见的思考' }}</text><view v-for="item in orderedTimeline(game.room.currentFeed)" :key="item.id"><text :style="{ color: playerColor(item.colorId) }">{{ formatEvent(item) }}</text></view><input v-model="chat" maxlength="200" placeholder="记录思考" @input="guard('chat').input($event.detail.value)" /><button :disabled="!game.available || !chat.trim()" @click="sendChat">发送</button></view>
    </template>
    <template v-else>
      <text class="title">{{ game.room.view === 'reveal' ? '本轮揭晓' : game.room.endReason === 'all-same' ? '完美同频' : '游戏结束' }}</text>
      <view v-for="entry in game.room.visibleSubmissions" :key="entry.playerId" class="card"><text :style="{ color: playerColor(entry.colorId) }">{{ entry.nickname }}：{{ entry.timedOut ? '时间到' : entry.word || '空白' }}</text></view>
      <text v-if="game.room.view === 'reveal' && seconds !== undefined" class="hint">{{ seconds }} 秒后自动进入下一回合。</text>
      <template v-else><text class="title">{{ game.room.winnerWord }}</text><button :disabled="!game.available" @click="act('game:rematch', { gameId: game.room.gameId })">再玩一次（仅自己返回大厅）</button><view class="row"><switch :checked="logs" :disabled="exporting" @change="toggleLogs" /><text>授权图片包含本人可见日志</text></view><button :disabled="exporting" @click="shareImage">{{ exporting ? '生成中' : '生成本局游戏记录图' }}</button><button v-if="files.length" @click="preview">预览分页图片</button><button v-if="files.length" @click="saveImages">保存全部图片到相册</button><button v-if="files.length" @click="openSettings">相册权限设置</button><text class="hint">{{ message }}</text></template>
    </template>
  </template>
  <canvas canvas-id="report" id="report" style="position:fixed;left:-2000px;top:0;width:640px;height:1000px" />
</view>
</template>
<style scoped>.page { padding:24px; padding-bottom:60px; } text { line-height:1.8; }
/* 房主在大厅玩家卡片上的移出按钮，右对齐不遮挡状态文本。 */
.card { position:relative; }
.kick-button { position:absolute; right:12px; top:50%; transform:translateY(-50%); margin:0; line-height:2; background:#f3a8b6; color:#30151d; font-size:12px; }</style>
