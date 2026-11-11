<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
import PlayerName from '../components/PlayerName.vue';
import Timeline from '../components/Timeline.vue';
import ShareReport from '../components/ShareReport.vue';
import { syncInput } from '../utils/inputSync';
import { exportReport, shareFiles } from '../utils/shareReport';
import { playerColor, createContentGuard, type RoomState } from '@word-sync/shared';
const includeLogs=ref(false), exporting=ref(false), shareMessage=ref(''), report=ref<HTMLElement>(), snapshot=ref<RoomState>();
async function share(){if(exporting.value||!game.room)return;exporting.value=true;shareMessage.value='正在生成完整图片…';try{snapshot.value=JSON.parse(JSON.stringify(game.room));await nextTick();const files=await exportReport(report.value!);shareMessage.value=await shareFiles(files);}catch{shareMessage.value='图片生成失败，请重试或检查浏览器权限。';}finally{exporting.value=false;}}
const game = useGameStore(); const router = useRouter();
const nickname = ref(''); const word = ref(''); const chat = ref(''); const now = ref(Date.now()); const showHistory = ref(false);
// 输入即校验：命中敏感词立即清空输入框，避免违规内容停留在输入框里。
const guards: Record<string, ReturnType<typeof createContentGuard>> = {};
function guard(kind: 'nickname' | 'word' | 'chat') {
  return guards[kind] ??= createContentGuard({
    check: text => game.check(text, kind === 'nickname' ? 1 : 5),
    onHit: message => {
      if (kind === 'nickname') nickname.value = '';
      else if (kind === 'word') word.value = '';
      else chat.value = '';
      game.error = message;
    },
  });
}
const interval = setInterval(() => now.value = Date.now(), 250); onBeforeUnmount(() => clearInterval(interval));
watch(() => game.me?.nickname, (value) => { if (value) nickname.value = value; }, { immediate: true });
watch(() => game.room, (room, previous) => { if(room)word.value=syncInput(word.value,previous,room,game.session?.playerId??''); if(room?.roundId!==previous?.roundId){chat.value='';showHistory.value=false;} }, { immediate:true });
watch(() => game.room?.phase, () => { showHistory.value = false; });
const seconds = computed(() => Math.max(0, Math.ceil(((game.room?.deadline ?? now.value) - now.value) / 1000)));
// 上轮所有玩家的词语：首回合没有历史时为空，此时保留原提示语。
const lastRound = computed(() => game.room?.history[game.room.history.length - 1]);
const submitted = computed(() => game.room?.submittedPlayerIds.includes(game.me?.id ?? '') ?? false);
// 同组成员放在同一边框内，个人颜色仍保持独立。
const progressGroups = computed(() => {
  const room = game.room;
  if (!room) return [];
  const grouped = new Set(room.currentGroups.flatMap(group => group.members));
  return [
    ...room.currentGroups.map((group, index) => ({ id: group.id, label: `第 ${index + 1} 组`, players: room.players.filter(player => group.members.includes(player.id)) })),
    ...room.players.filter(player => !grouped.has(player.id)).map(player => ({ id: player.id, label: '单人', players: [player] })),
  ];
});
async function act(action: () => Promise<unknown>) { try { await action(); } catch {} }
// 房主移出玩家前二次确认，避免误触。
function kick(playerId: string, nickname: string) { if (window.confirm(`确定将「${nickname}」移出房间吗？`)) act(() => game.kick(playerId)); }
async function leave() { await act(async () => { await game.leave(); await router.push('/'); }); }
async function copyCode() { try { if (game.room) await window.navigator.clipboard.writeText(game.room.code); } catch { game.error = '无法自动复制，请手动复制房间码。'; } }
// 聊天发送前不再本地预检，由服务端统一校验。
async function sendChat() { if (!chat.value.trim()) return; try { await game.chat(chat.value); chat.value = ''; } catch {} }
// 词语提交/候选词提议由服务端统一校验。
function submitWord() { act(() => game.myGroup ? game.propose(word.value) : game.submit(word.value)); }
// 大厅保存昵称由服务端统一校验。
function rename() { act(() => game.rename(nickname.value)); }
</script>
<template>
  <section v-if="game.room" class="room">
    <header><button v-if="game.canLeave" :disabled="!game.available" class="icon" aria-label="离开房间" @click="leave">←</button><div><small>房间</small><button class="room-code" @click="copyCode">{{ game.room.code }} ⧉</button></div><button class="icon" aria-label="历史记录" @click="showHistory = !showHistory">☷</button></header>

    <template v-if="showHistory">
      <div class="section-title"><div><p class="eyebrow">每个念头，都被珍藏</p><h2>回合记录</h2></div><button class="text-button" @click="showHistory=false">关闭</button></div>
      <div v-if="!game.room.history.length" class="empty card">回合记录会显示在这里。</div>
      <article v-for="round in [...game.room.history].reverse()" :key="round.round" class="card history-card">
        <strong>第 {{ round.round }} 回合</strong><small>{{ round.revealReason === 'timeout' ? '计时结束' : '全员提交' }} · {{ Math.max(0, Math.round((round.endedAt-round.startedAt)/1000)) }} 秒</small><div v-for="entry in round.submissions" :key="entry.playerId" class="history-row"><span><PlayerName :name="entry.nickname" :color-id="entry.colorId" /></span><b>{{ entry.timedOut ? '—' : entry.word || '（空白）' }}</b></div>
        <details class="round-records"><summary><span>查看本轮记录</span><span class="record-count">{{ round.feed.length }} 条</span><span class="record-arrow" aria-hidden="true">›</span></summary><Timeline :items="round.feed" /></details>
      </article>
    </template>

    <template v-else-if="game.room.view === 'lobby'">
      <div class="section-title"><div><p class="eyebrow">召集同频伙伴</p><h2>房间大厅</h2></div><span class="count">{{ game.room.players.length }}/6</span></div>
      <div class="card invite"><p>把房间码发给朋友</p><strong>{{ game.room.code }}</strong><button @click="copyCode">复制房间码</button></div>
      <label>你的昵称</label><div class="inline"><input v-model="nickname" maxlength="12" @input="guard('nickname').input(($event.target as HTMLInputElement).value)"><button :disabled="!game.available" @click="rename">保存</button></div>
      <div class="players"><article v-for="player in game.room.players" :key="player.id" class="player"><span class="avatar"><PlayerName :name="player.nickname[0]!" :color-id="player.colorId" /><span v-if="player.id === game.me?.id" class="self-badge">我</span></span><div><strong><PlayerName :name="player.nickname" :color-id="player.colorId" />{{ player.id === game.room.ownerId ? '（房主）' : '' }}</strong><small>{{ player.connected ? '已连接' : '离线，可重连' }}</small></div><span :class="['status', { ready: player.ready }]">{{ game.room.phase==='ended'&&!player.returnedToLobby ? '查看结果中' : player.ready ? '已准备' : '等待中' }}</span><button v-if="game.isOwner && player.id !== game.room.ownerId" class="kick" :disabled="!game.available" :aria-label="`移出 ${player.nickname}`" :title="`移出 ${player.nickname}`" @click="kick(player.id, player.nickname)">✕</button></article></div>
      <div class="card settings"><h3>游戏设置</h3><p>{{ game.isOwner ? '你是房主，可以修改设置。' : '仅房主可修改设置。' }}</p><label>回合计时 <b>{{ game.room.settings.timerSeconds }} 秒</b></label><input :disabled="!game.available || !game.isOwner" type="range" min="10" max="180" step="5" :value="game.room.settings.timerSeconds" @change="act(() => game.settings({ timerSeconds: +($event.target as HTMLInputElement).value }))"><label>最多回合数</label><input :disabled="!game.available || !game.isOwner" type="number" min="1" max="30" :value="game.room.settings.maxRounds" @change="act(() => game.settings({ maxRounds: +($event.target as HTMLInputElement).value }))"></div>
      <button :disabled="!game.available" class="primary sticky" :class="{ active: game.me?.ready }" @click="act(() => game.ready(!game.me?.ready))">{{ game.me?.ready ? '已准备 ✓' : '我准备好了' }}</button><p class="hint">所有仍在房间的伙伴返回大厅、在线并准备好后，游戏自动开始。</p>
    </template>

    <template v-else-if="game.room.view === 'writing'">
      <div class="round-top"><div><p class="eyebrow">第 {{ game.room.round }}/{{ game.room.settings.maxRounds }} 回合</p><h2>en一个词。<br>想到一起。</h2></div><div class="timer">{{ seconds }}<small>秒</small></div></div>
      <div v-if="lastRound" class="card last-round"><p class="eyebrow">上轮词语</p><div v-for="entry in lastRound.submissions" :key="entry.playerId" class="history-row"><span><PlayerName :name="entry.nickname" :color-id="entry.colorId" /></span><b>{{ entry.timedOut ? '—' : entry.word || '（空白）' }}</b></div></div>
      <div v-else class="card prompt"><span>✦</span><p>写下你觉得其他人也会写的那个词。</p></div>
      <form @submit.prevent="submitWord"><label>{{ game.myGroup ? '小组候选词' : '你的词' }}</label><input v-model="word" class="word-input" maxlength="40" :disabled="submitted || !game.available || !!game.room.proposals.length" placeholder="相信你的直觉…" @input="guard('word').input(($event.target as HTMLInputElement).value)"><button class="primary" :disabled="submitted || !game.available || !!game.room.proposals.length">{{ submitted ? '已锁定 ✓' : game.myGroup ? '提出候选词' : '锁定这个词' }}</button></form>
      <div class="submission-progress"><div class="progress-teams"><section v-for="team in progressGroups" :key="team.id" class="progress-team" :aria-label="team.label"><div class="progress-members"><span v-for="player in team.players" :key="player.id" :class="{ done: game.room.submittedPlayerIds.includes(player.id) }" :style="{ color: playerColor(player.colorId), background: playerColor(player.colorId) + '22', border: '1px solid ' + playerColor(player.colorId), opacity: 1 }" :title="player.nickname + (game.room.submittedPlayerIds.includes(player.id) ? '：已提交' : '：未提交')">{{ player.nickname[0] }}<i v-if="game.room.submittedPlayerIds.includes(player.id)" class="progress-check">✓</i></span></div></section></div><p>已有 {{ game.room.submittedPlayerIds.length }}/{{ game.room.players.length }} 人提交</p></div>
      <div class="card group-feed"><h3>{{ game.myGroup ? '小组聊天' : '我的思考' }}</h3><Timeline :items="game.room.currentFeed" /><form class="inline" @submit.prevent="sendChat"><input v-model="chat" maxlength="200" :placeholder="game.myGroup ? '仅同组成员可见' : '仅自己可见，记下你的思考'" @input="guard('chat').input(($event.target as HTMLInputElement).value)"><button :disabled="!game.available || !chat.trim()">发送</button></form></div>
      <div v-if="game.myGroup" class="card group-feed"><p class="eyebrow">候选词与共同确认</p><p>全组同意后立即提交；计时结束采用当前未拒绝的候选词。每组仅有一个未决候选，更换前请先拒绝旧候选。</p><p v-if="!game.room.proposals.length">尚无候选词，超时将记为空白。</p><article v-for="proposal in game.room.proposals" :key="proposal.id"><h3>{{ proposal.word }}</h3><p>提出者：<PlayerName :name="game.room.players.find(p=>p.id===proposal.proposerId)?.nickname||proposal.proposerId" :color-id="game.room.players.find(p=>p.id===proposal.proposerId)?.colorId" /></p><p>已同意 {{ proposal.confirmations.length }}/{{ proposal.memberIds.length }}：<PlayerName v-for="id in proposal.confirmations" :key="id" :name="game.room.players.find(p=>p.id===id)?.nickname||id" :color-id="game.room.players.find(p=>p.id===id)?.colorId" /></p><div class="proposal-actions" v-if="proposal.memberIds.includes(game.me?.id || '')"><button class="secondary" :disabled="!game.available || proposal.confirmations.includes(game.me?.id || '')" @click="act(() => game.confirm(proposal.id))">{{ proposal.confirmations.includes(game.me?.id || '') ? '已同意' : '同意候选' }}</button><button class="reject-button" :disabled="!game.available" @click="act(() => game.reject(proposal.id))">拒绝此候选</button></div></article></div>
      <p class="privacy">所有人提交前，你的词不会公开。</p>
    </template>

    <template v-else-if="game.room.view === 'reveal'">
      <p class="eyebrow center">第 {{ game.room.round }} 回合揭晓</p><h2 class="center">看看大家<br>都想到了什么</h2>
      <div class="reveal-grid"><article v-for="entry in game.room.visibleSubmissions" :key="entry.playerId" :class="['card', 'reveal', { matched: game.room.currentGroups.some(g => g.members.includes(entry.playerId)) }]"><small><PlayerName :name="entry.nickname" :color-id="entry.colorId" /></small><strong>{{ entry.timedOut ? '时间到' : entry.word || '空白' }}</strong></article></div>
      <div v-if="game.myGroup" class="card group-feed"><p class="eyebrow">持久同频小组</p><h3>{{ game.myGroup.word }}</h3><p><PlayerName v-for="id in game.myGroup.members" :key="id" :name="game.room.players.find(p=>p.id===id)?.nickname||id" :color-id="game.room.players.find(p=>p.id===id)?.colorId" /></p></div>
      <p class="hint">{{ Math.max(0, Math.ceil(((game.room.nextRoundAt ?? now) - now) / 1000)) }} 秒后自动进入下一回合或结算</p>
    </template>

    <template v-else>
      <div class="finish"><div class="burst">✦</div><p class="eyebrow">{{ game.room.endReason === 'all-same' ? '完美同频' : '游戏结束' }}</p><h2>{{ game.room.endReason === 'all-same' ? '你们找到了。' : '真是一段奇妙旅程。' }}</h2><div v-if="game.room.winnerWord" class="winning-word">{{ game.room.winnerWord }}</div><p>{{ game.room.endReason === 'all-same' ? `${game.room.players.length} 个人已合并为同一个非空持久小组。` : `${game.room.settings.maxRounds} 个回合，收获了许多精彩而不同的想法。` }}</p><label><input v-model="includeLogs" type="checkbox" :disabled="exporting">包含本人可见回合记录</label><button class="primary" :disabled="exporting" @click="share">{{ exporting ? '正在生成…' : '一键分享' }}</button><p role="status">{{ shareMessage }}</p><button :disabled="!game.available" class="primary" @click="act(game.rematch)">再玩一次</button><button class="secondary" @click="leave">返回首页</button></div>
    </template>
    <div v-if="snapshot" class="report-host" aria-hidden="true"><div ref="report"><ShareReport :room="snapshot" :logs="includeLogs" /></div></div>
    <p v-if="!game.connected" class="error">连接已断开，正在重连；请暂勿操作。</p><p v-if="game.error" role="alert" class="error">{{ game.error }}</p>
  </section>
  <section v-else class="loading"><div class="brand-mark">同</div><p>{{ game.error || '正在恢复你的房间…' }}</p><button class="secondary" @click="router.push('/')">返回首页</button></section>
</template>

<style scoped>
.submission-progress .progress-teams { display:flex; flex-wrap:wrap; justify-content:center; gap:10px; }
.progress-team { margin:0; padding:6px 8px; border:1px solid #55566c; border-radius:14px; background:#ffffff05; }
.submission-progress .progress-members { display:flex; gap:5px; }
.submission-progress .progress-members > span { position:relative; display:inline-flex; align-items:center; justify-content:center; margin:0; width:36px; height:36px; border-radius:10px; font-size:17px; filter:none; }
.progress-check { position:absolute; right:-3px; bottom:-3px; width:14px; height:14px; border-radius:50%; background:#e1ff74; color:#152015; font-size:10px; font-style:normal; line-height:14px; }
</style>
