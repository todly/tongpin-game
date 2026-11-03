<script setup lang="ts">
import PlayerName from './PlayerName.vue';
import type { FeedItem } from '@word-sync/shared';
import { orderedTimeline, formatEvent } from '../utils/timeline';
withDefaults(defineProps<{ items: FeedItem[]; theme?: 'dark' | 'light' }>(), { theme: 'dark' });
</script>
<template><div class="timeline" :class="`timeline--${theme}`"><article v-for="item in orderedTimeline(items)" :key="item.id" :class="item.kind === 'chat' ? 'chat-bubble' : 'timeline-event'"><b v-if="item.kind==='chat'"><PlayerName :name="item.nickname" :color-id="item.colorId" :theme="theme" /></b><p v-if="item.kind==='merge'&&item.names"><template v-for="(name,index) in item.names" :key="index">{{ index ? '、' : '' }}<PlayerName :name="name.nickname" :color-id="name.colorId" :theme="theme" /></template>想到了一起，组成同频小组</p><p v-else-if="['submission','proposed','agreed','refused'].includes(item.kind)"><PlayerName :name="item.nickname" :color-id="item.colorId" :theme="theme" />{{ formatEvent(item).slice(item.nickname.length) }}</p><p v-else>{{ formatEvent(item) }}</p></article><p v-if="!items.length" class="hint">还没有记录。</p></div></template>
