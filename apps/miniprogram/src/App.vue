<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { useGameStore } from './stores/game';
const game = useGameStore();
onLaunch(() => { uni.onNetworkStatusChange(status => { if (status.isConnected) void game.connect(); }); });
onShow(() => game.show());
onHide(() => game.hide());
// 后台不离房，不清除恢复令牌；前台与网络恢复时恢复身份。
</script>
<style>
page { background:#202133; color:#f7f5ff; font-family:sans-serif; }
button { font-size:16px; margin:10px 0; background:#ddd2ff; color:#282038; border-radius:14px; }
button[disabled] { opacity:.45; }
input { padding:14px; background:#34354b; border-radius:12px; margin:12px 0; }
.card { padding:18px; margin:14px 0; background:#2c2d43; border-radius:18px; }
.title { font-size:28px; font-weight:bold; display:block; margin:20px 0; }
.hint { display:block; color:#bbb8cd; margin:10px 0; }
.row { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
.error { color:#ff9fae; display:block; margin:12px 0; }
</style>
