<script setup lang="ts">
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import { useGameStore } from './stores/game';
const game = useGameStore();
const router = useRouter();
watch(() => [game.room, game.session, game.connecting, router.currentRoute.value.path], () => {
  if (game.room && game.session && !game.connecting && router.currentRoute.value.path !== '/room') void router.replace('/room');
}, { immediate: true });
</script>
<template><main class="shell"><router-view /></main></template>
