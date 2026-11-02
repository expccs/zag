// Self-test for docs/backend/reference modules.
// Run after compiling the .ts files next to this script (tsc, commonjs):
//   node selftest.js
// Needs ws, socket.io, socket.io-client in node_modules; geopoint optional.
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { WebSocketServer } = require('ws');
let GeoPoint = null;
try { GeoPoint = require('geopoint'); } catch { console.log('geopoint not installed, skipping cross-check'); }
const { io: ioClient } = require('socket.io-client');
const { Server } = require('socket.io');

const { haversineDistanceM, GeoFence } = require('./geo-fence');
const { SessionQueue } = require('./session-queue');
const { AppState } = require('./app-state');
const { TouchDesignerClient } = require('./touch-designer-client');
const { FakeCloudClient } = require('./cloud-client');
const { Application } = require('./application');
const { attachSocketApi } = require('./socket-api');
const { loadConfig } = require('./config');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { log() {}, warn() {}, error: console.error };

const testGeo = () => {
  const center = { latitude: 46.4825, longitude: 30.7233 };
  const samples = [
    { latitude: 46.4830, longitude: 30.7240 },
    { latitude: 46.49, longitude: 30.73 },
    { latitude: 40.1947, longitude: 44.5244 },
  ];
  for (const s of samples) {
    const mine = haversineDistanceM(center, s);
    if (!GeoPoint) continue;
    const ref = new GeoPoint(center.latitude, center.longitude).distanceTo(new GeoPoint(s.latitude, s.longitude), true) * 1000;
    assert.ok(Math.abs(mine - ref) / ref < 0.003, `haversine diff ${mine} vs ${ref}`);
  }
  const fence = new GeoFence({ radiusM: 100, accuracyToleranceM: 30 });
  assert.deepEqual(fence.check(samples[0]), { allowed: false, distanceM: -1, reason: 'no-center' });
  fence.setCenter(center);
  const near = fence.check(samples[0]);
  assert.equal(near.allowed, true); assert.ok(near.distanceM > 60 && near.distanceM < 90, String(near.distanceM));
  const far = fence.check({ ...samples[1], accuracy: 500 });
  assert.equal(far.allowed, false); assert.equal(far.reason, 'too-far');
  // accuracy tolerance: 120 m away with 50 m accuracy -> 100 + min(50,30) = 130 -> allowed
  const edge = { latitude: center.latitude + 120 / 111_320, longitude: center.longitude };
  assert.equal(fence.check(edge).allowed, false);
  assert.equal(fence.check({ ...edge, accuracy: 50 }).allowed, true);
  assert.equal(fence.check({ latitude: NaN, longitude: 1 }).reason, 'invalid');
  const locked = new GeoFence({ radiusM: 100, center });
  locked.setCenter({ latitude: 0, longitude: 0 });
  assert.equal(locked.check(samples[0]).allowed, true, 'env center must stay locked');
  console.log('geo ok');
};

const testQueue = async () => {
  const q = new SessionQueue({ gapMs: 40 });
  const log = [];
  q.on('start', (t) => log.push(`start:${t.id}`));
  q.on('finish', (t, r) => log.push(`finish:${t.id}:${r}`));
  q.on('drain', () => log.push('drain'));
  const updates = [];
  q.on('update', (w) => updates.push(w.map((x) => `${x.task.id}@${x.position}`).join(',')));
  const mk = (id, userId, durationMs = 100) => ({ id, userId, durationMs, payload: {} });
  assert.deepEqual(q.enqueue(mk('a', 'u1')), { waitMs: 0, position: 0 });
  const b = q.enqueue(mk('b', 'u2'));
  assert.equal(b.position, 1); assert.ok(b.waitMs > 120 && b.waitMs <= 140, String(b.waitMs));
  const c = q.enqueue(mk('c', 'u3'));
  assert.equal(c.position, 2); assert.ok(c.waitMs > 260 && c.waitMs <= 280, String(c.waitMs));
  assert.throws(() => q.enqueue(mk('x', 'u2')), { code: 'EQUEUED' });
  assert.equal(q.hasUser('u3'), true);
  assert.equal(q.remove('u3'), true);
  assert.equal(q.length, 1);
  await sleep(120); // a finished (100) + inside gap (100..140)
  assert.equal(q.currentTask, null);
  assert.equal(q.isIdle, false, 'gap period is not idle');
  await sleep(40);  // b started at ~140
  assert.equal(q.currentTask.id, 'b');
  q.enqueue(mk('d', 'u4', 50));
  q.remove('u2'); // skip current b -> gap -> d
  await sleep(45);
  assert.equal(q.currentTask.id, 'd');
  await sleep(120);
  assert.deepEqual(log, ['start:a', 'finish:a:completed', 'start:b', 'finish:b:skipped', 'start:d', 'finish:d:completed', 'drain']);
  assert.ok(updates.length >= 2, JSON.stringify(updates));
  assert.equal(q.isIdle, true);
  console.log('queue ok', updates);
};

const testState = () => {
  const programs = { techPause: 'p1', interactive: 'p2', locationRestriction: 'p3', schedule: 'p4' };
  const s = new AppState({ groupID: 'g', programs, initial: { techPause: true, interactive: false, locationRestriction: true, schedule: false }, overrides: { schedule: false }, logger: quiet });
  const events = [];
  s.on('change', (flags, changed) => events.push(changed.join('+')));
  s.on('synced', () => events.push('synced'));
  s.sync([{ _id: 'other', programs: [] }]);
  assert.equal(s.isSynced, false);
  s.sync([{ _id: 'g', programs: [{ _id: 'p1', state: { value: 0 } }, { _id: 'p2', state: { value: 1 } }, { _id: 'p3', state: { value: 1 } }, { _id: 'p4', state: { value: 1 } }, { _id: 'zzz', state: { value: 1 } }] }]);
  assert.deepEqual(s.snapshot, { techPause: false, interactive: true, locationRestriction: true, schedule: false });
  assert.deepEqual(s.apply([{ programID: 'p3', value: 0 }, { programID: 'p3', value: 0 }]), ['locationRestriction']);
  assert.deepEqual(s.apply([{ programID: 'p3', value: 0 }]), []);
  assert.deepEqual(events, ['techPause+interactive+schedule', 'synced', 'locationRestriction']);
  assert.deepEqual(s.reference('proj', 'techPause', true), { projectUID: 'proj', groupID: 'g', programID: 'p1', params: [1] });
  console.log('state ok');
};

const testTouchDesigner = async () => {
  let wss = new WebSocketServer({ port: 0 });
  await once(wss, 'listening');
  const port = wss.address().port;
  const received = [];
  const attach = (server) => server.on('connection', (ws) => ws.on('message', (m) => received.push(JSON.parse(m.toString()))));
  attach(wss);
  const td = new TouchDesignerClient({ url: `ws://127.0.0.1:${port}`, reconnectBaseMs: 30, reconnectMaxMs: 120, pingIntervalMs: 50, logger: quiet });
  td.command({ type: 'session:start', sessionId: 's1' });
  assert.equal(td.stream({ type: 'touch:event', x: 0.1 }), false);
  assert.equal(td.droppedCount, 1);
  td.connect();
  step('td-open');
  await once(td, 'open');
  assert.equal(td.stream({ type: 'touch:event', x: 0.5 }), true);
  await sleep(30);
  assert.deepEqual(received.map((m) => m.type), ['session:start', 'touch:event']);
  assert.ok(received[0].timestamp, 'command gets timestamp');
  // server goes down -> reconnect with backoff -> buffered command flushed on reopen
  for (const c of wss.clients) c.terminate();
  wss.close();
  step('td-close');
  await once(td, 'close');
  td.command({ type: 'session:end', sessionId: 's1' });
  await sleep(100);
  wss = new WebSocketServer({ port });
  attach(wss);
  await once(wss, 'listening');
  step('td-reopen');
  await once(td, 'open');
  await sleep(30);
  assert.equal(received.at(-1).type, 'session:end');
  await sleep(120); // ping/pong cycle survives
  assert.equal(td.isConnected, true);
  td.close();
  wss.close();
  console.log('touchdesigner ok');
};

const testApplication = async () => {
  const env = { CCS_MODE: 'offline', SESSION_MS: '150', SESSION_GAP_MS: '30', DISCONNECT_GRACE_MS: '80', GEO_CENTER: '46.4825,30.7233', GEO_RADIUS_M: '100', PORT: '0' };
  const config = loadConfig(env);
  // offline fake with programs so that stateChange works
  const app = new Application(config, quiet);
  const cloud = app.cloud;
  assert.ok(cloud instanceof FakeCloudClient);
  const httpServer = createServer();
  const io = new Server(httpServer, { transports: ['websocket'] });
  attachSocketApi(io, app, { disconnectGraceMs: config.queue.disconnectGraceMs });
  app.start();
  await new Promise((r) => httpServer.listen(0, r));
  const port = httpServer.address().port;
  const connect = (userId) => ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], auth: { userId } });

  const bad = connect('short');
  step('app-eauth');
  const err = await once(bad, 'connect_error');
  assert.equal(err[0].message, 'EAUTH');
  bad.close();

  const c1 = connect('user-0000000001');
  step('app-state0');
  const [state0] = await once(c1, 'state:update');
  assert.equal(state0.screen, 'interactive'); // offline initial
  assert.equal(state0.synced, false);
  const geoOff = await c1.emitWithAck('geo:check', { latitude: 1, longitude: 1 });
  assert.deepEqual(geoOff, { allowed: true, distanceM: -1, reason: 'disabled' });

  const start1P = once(c1, 'session:start');
  const t1 = await c1.emitWithAck('session:request', { mode: 'comet', params: { color: '#FF4848' } });
  assert.equal(t1.success, true); assert.equal(t1.position, 0); assert.equal(t1.durationMs, 150);
  step('app-start1');
  const [start] = await start1P;
  assert.equal(start.mode, 'comet');
  const dup = await c1.emitWithAck('session:request', { mode: 'comet', params: {} });
  assert.deepEqual(dup, { success: false, code: 'EQUEUED' });
  const badMode = await connectAndRequest('user-0000000002', 'disco');
  assert.deepEqual(badMode.res, { success: false, code: 'EBADMODE' });
  badMode.socket.close();

  const c2 = connect('user-0000000003');
  await once(c2, 'state:update');
  const t2 = await c2.emitWithAck('session:request', { mode: 'palette', params: { palette: 2 } });
  assert.equal(t2.position, 1); assert.ok(t2.waitMs > 100 && t2.waitMs <= 180, String(t2.waitMs));

  // touch only from current user reaches TD (no TD here -> returns true but we test routing)
  assert.equal(app.handleTouch('user-0000000003', { x: 0.1, y: 0.1, touch: 1, swipe: 0, direction: 'none' }), false);
  assert.equal(app.handleTouch('user-0000000001', { x: 0.1, y: 0.1, touch: 1, swipe: 0, direction: 'none' }), true);

  // c2 disconnects briefly and returns within grace -> keeps place
  c2.disconnect();
  await sleep(30);
  assert.equal(app.queue.hasUser('user-0000000003'), true);
  c2.connect();
  await once(c2, 'connect');
  await sleep(100);
  assert.equal(app.queue.hasUser('user-0000000003'), true, 'reconnect within grace keeps the place');

  step('app-end1');
  const [end1] = await once(c1, 'session:end');
  assert.equal(end1.reason, 'completed');
  step('app-start2');
  const [start2] = await once(c2, 'session:start');
  assert.equal(start2.mode, 'palette');

  // techPause from cloud -> everyone gets state + session end, queue cleared
  // need programs configured: offline config has '' ids, so set up state mapping manually
  const c3 = connect('user-0000000004');
  await once(c3, 'state:update');
  const r3 = await c3.emitWithAck('session:request', { mode: 'milky-way', params: {} });
  assert.equal(r3.position, 1);
  const pending = Promise.all([once(c2, 'session:end'), once(c3, 'session:end'), once(c1, 'state:update')]);
  // emulate cloud stateChange for techPause: offline programs ids are '' so apply via flag override path instead
  cloud.setProgramState(config.cloud.programs.techPause, 1);
  step('app-techpause');
  const [[e2], [e3], [st]] = await pending;
  assert.equal(st.screen, 'maintenance');
  assert.equal(e2.reason, 'skipped'); assert.equal(e3.reason, 'skipped');
  assert.equal(app.queue.isIdle, true);
  const denied = await c3.emitWithAck('session:request', { mode: 'comet', params: {} });
  assert.deepEqual(denied, { success: false, code: 'ENOTALLOWED' });

  // grace expiry removes the user
  cloud.setProgramState(config.cloud.programs.techPause, 0);
  await sleep(10);
  const t4 = await c3.emitWithAck('session:request', { mode: 'comet', params: {} });
  assert.equal(t4.success, true);
  c3.disconnect();
  await sleep(120);
  assert.equal(app.queue.hasUser('user-0000000004'), false, 'grace expired -> removed');

  for (const c of [c1, c2]) c.close();
  io.close(); httpServer.close();
  await app.stop();
  console.log('application ok');

  async function connectAndRequest(userId, mode) {
    const socket = connect(userId);
    await once(socket, 'state:update');
    const res = await socket.emitWithAck('session:request', { mode, params: {} });
    return { socket, res };
  }
};

setTimeout(() => { console.error('TIMEOUT at', global.__step); process.exit(2); }, 40000).unref();
const step = (n) => { global.__step = n; console.log('step', n); };
(async () => {
  testGeo();
  testState();
  await testQueue();
  await testTouchDesigner();
  await testApplication();
  console.log('ALL OK');
  process.exit(0);
})().catch((error) => { console.error('FAIL', error); process.exit(1); });
