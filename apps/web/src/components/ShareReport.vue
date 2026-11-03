<script setup lang="ts">
import type { RoomState } from '@word-sync/shared';
import PlayerName from './PlayerName.vue';
import Timeline from './Timeline.vue';
defineProps<{ room:RoomState; logs:boolean }>();
</script>
<template><div class="share-report"><section data-report-block><h1>同频脑电波</h1><p>一个词，想到一起。</p><p>{{ room.endReason==='all-same' ? '完美同频' : '奇妙旅程结束' }} {{ room.winnerWord }}</p></section><template v-for="round in room.history" :key="round.roundId"><section data-report-block><h2>第 {{ round.round }} 回合</h2><p v-for="entry in round.submissions" :key="entry.playerId"><PlayerName :name="entry.nickname" :color-id="entry.colorId" theme="light" />：{{ entry.timedOut ? '超时空白' : entry.word || '空白' }}</p></section><template v-if="logs"><section v-for="item in round.feed" :key="item.id" data-report-block><Timeline :items="[item]" theme="light" /></section></template></template><section data-report-block><p>每个念头，都被珍藏。</p></section></div></template>
