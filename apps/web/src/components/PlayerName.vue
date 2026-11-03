<script setup lang="ts">
import { playerColor, type ColorId } from '@word-sync/shared';
withDefaults(defineProps<{name:string;colorId?:ColorId;theme?:'dark'|'light'}>(),{colorId:0,theme:'dark'});
</script>
<template><span :style="{color:playerColor(colorId,theme)}">{{ name }}</span></template>
