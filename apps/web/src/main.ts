import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import HomeView from './views/HomeView.vue';
import RoomView from './views/RoomView.vue';
import './style.css';
import { useGameStore } from './stores/game';

const router = createRouter({ history: createWebHistory(), routes: [
  { path: '/', component: HomeView }, { path: '/room', component: RoomView }, { path: '/:pathMatch(.*)*', redirect: '/' }
] });
const pinia = createPinia();
router.beforeEach(to => {
  const game = useGameStore(pinia);
  if (to.path !== '/room' && (game.room?.phase === 'writing' || game.room?.phase === 'reveal')) return '/room';
});
createApp(App).use(pinia).use(router).mount('#app');
