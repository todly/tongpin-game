<script setup lang="ts">
import { ref } from 'vue';
import { createContentGuard } from '@word-sync/shared';
import { useRouter } from 'vue-router';
import { useGameStore } from '../stores/game';
const game = useGameStore(); const router = useRouter();
const nickname = ref(''); const code = ref(''); const joining = ref(false);
// 输入即校验：命中敏感词立即清空输入框，避免违规内容停留在输入框里。
const nicknameGuard = createContentGuard({
  check: text => game.check(text, 1),
  onHit: message => { nickname.value = ''; game.error = message; },
});
async function create() { try { await game.create(nickname.value); await router.push('/room'); } catch {} }
async function join() { try { await game.join(code.value, nickname.value); await router.push('/room'); } catch {} }
</script>
<template>
  <section class="home">
    <div class="brand-mark">同</div><p class="eyebrow">一场寻找共同频率的游戏</p>
    <h1>同频<br><span>脑电波</span></h1>
    <p class="lede">不交流，也能想到一起。和朋友写下相同的词，找到所有人共享的那个念头。</p>
    <form class="card home-card" @submit.prevent="joining ? join() : create()">
      <label>你的昵称 <small>可选</small></label><input v-model="nickname" maxlength="20" placeholder="随机昵称也很有趣" @input="nicknameGuard.input(nickname)">
      <label v-if="joining">房间码 <small>加入房间时填写</small></label><input v-if="joining" v-model="code" maxlength="6" class="code-input" placeholder="ABC123" @input="code = code.toUpperCase()">
      <p v-if="game.session">正在恢复已有房间，请等待连接；网络错误不会清除会话。</p><p v-else-if="!game.connected">正在连接服务器…</p>
      <p v-if="game.error" class="error">{{ game.error }}</p>
      <button v-if="joining" class="primary" :disabled="!game.available || (joining && !/^[A-Z0-9]{6}$/.test(code.trim()))">加入房间</button>
      <button v-else class="primary" type="button" :disabled="!game.available || (joining && !/^[A-Z0-9]{6}$/.test(code.trim()))" @click="create">创建房间</button>
      <button v-if="game.session" type="button" class="secondary" @click="router.push('/room')">返回已有房间</button><div class="or"><span>或者</span></div>
      <button v-if="joining" type="button" class="secondary" @click="joining = false; code = ''">改为创建房间</button>
      <button v-else type="button" class="secondary" @click="joining = true">使用房间码加入</button>
    </form>
    <p class="footnote">2–6 人 · 无需账号</p>
  </section>
</template>
