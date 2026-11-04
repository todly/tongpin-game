type Task = Pick<UniApp.SocketTask, 'onOpen'|'onMessage'|'onClose'|'onError'|'send'|'close'>;
export class Transport {
  private task?: Task;
  private generation = 0;
  private counter = 0;
  private pending = new Map<string, { resolve: (x: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private heartbeat?: ReturnType<typeof setInterval>;
  onState: (state: any) => void = () => {};
  onClose: () => void = () => {};
  async connect(): Promise<void> {
    this.close(); const generation = this.generation;
    const cloud = import.meta.env.VITE_CONNECTION_MODE === 'cloud';
    let task: Task;
    if (cloud) {
      const env = import.meta.env.VITE_CLOUD_ENV, service = import.meta.env.VITE_CLOUD_SERVICE;
      if (!env || !service) throw new Error('请先配置微信云环境和服务名。');
      wx.cloud.init({ env, traceUser: false });
      const result = await wx.cloud.connectContainer({ config: { env }, service, path: '/ws' });
      task = result.socketTask as unknown as Task;
    } else {
      task = uni.connectSocket({ url: import.meta.env.VITE_LOCAL_WS_URL || 'ws://localhost:3000/ws', complete: () => {} });
    }
    if (generation !== this.generation) { task.close({}); throw new Error('连接已取消。'); }
    this.task = task;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('连接超时。')); this.close(); this.onClose(); }, 10000);
      task.onOpen(() => {
        if (generation !== this.generation) return;
        clearTimeout(timeout); this.heartbeat = setInterval(() => { this.request('ping', null).catch(() => { this.close(); this.onClose(); }); }, 20000); resolve();
      });
      task.onMessage(message => {
        if (generation !== this.generation || typeof message.data !== 'string') return;
        let value: any; try { value = JSON.parse(message.data); } catch { return; }
        if (value.event === 'room:state') this.onState(value.data);
        if (value.event === 'ack') {
          const p = this.pending.get(value.requestId); if (!p) return;
          clearTimeout(p.timer); this.pending.delete(value.requestId);
          value.ok ? p.resolve(value.data) : p.reject(new Error(value.error || '请求失败。'));
        }
      });
      const closed = () => {
        clearTimeout(timeout); if (generation !== this.generation) return;
        reject(new Error('连接已断开。')); this.close(); this.onClose();
      };
      task.onClose(closed); task.onError(closed);
    });
  }
  request<T = null>(event: string, data: unknown): Promise<T> {
    if (!this.task) return Promise.reject(new Error('尚未连接。'));
    const requestId = `${Date.now()}-${++this.counter}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('确认超时，结果未知，请等待状态恢复，不要重复提交。')); }, 8000);
      this.pending.set(requestId, { resolve, reject, timer });
      this.task!.send({ data: JSON.stringify({ requestId, event, data }), fail: () => {
        const p = this.pending.get(requestId); if (p) { clearTimeout(p.timer); this.pending.delete(requestId); reject(new Error('消息发送失败。')); }
      } });
    });
  }
  close() {
    this.generation++; clearInterval(this.heartbeat); this.heartbeat = undefined;
    const task = this.task; this.task = undefined; task?.close({});
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('连接中断，操作结果未知。')); }
    this.pending.clear();
  }
}
