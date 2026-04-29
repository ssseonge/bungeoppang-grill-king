const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const menuOverlay = document.querySelector("#menuOverlay");
const playerNameInput = document.querySelector("#playerName");
const startButton = document.querySelector("#startButton");
const saveNameButton = document.querySelector("#saveNameButton");
const scoresButton = document.querySelector("#scoresButton");
const howButton = document.querySelector("#howButton");
const menuInfo = document.querySelector("#menuInfo");

const W = canvas.width;
const H = canvas.height;
const GAME_FONT = '"BMJUA", "Jua", system-ui, sans-serif';
const BOARD = { x: 42, y: 236, cols: 3, rows: 4, cellW: 112, cellH: 112 };
const BOOST = { x: 8, y: 280, w: 24, h: 330 };
const PUMP_BUTTON = { x: 12, y: 724, w: 232, h: 48 };
const KEY_TO_INDEX = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
  9: 8,
  z: 9,
  "*": 9,
  0: 10,
  x: 11,
  "#": 11,
};
const LABELS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const FISH = [
  "........OOO.....TT...",
  ".....OOOBBBOO..TTT...",
  "...OOBBBBBBBBOOTT....",
  "..OBBEEBBBBBBBBBO....",
  ".OBBBBBBBBBBBBBBBO...",
  "OBBBBBBSBBBSBBBBBOO..",
  ".OBBBBBSSSSSBBBBBO...",
  "..OBBBSBBBBBSBBBO....",
  "...OOBBBBBBBBBBO.....",
  ".....OOOBBBOOO......",
];
const CUSTOMERS = [
  { name: "꼬마", face: "kid", color: "#ffcc21" },
  { name: "아줌마", face: "mom", color: "#f07aa4" },
  { name: "할배", face: "old", color: "#ffffff" },
  { name: "외계인", face: "alien", color: "#9c6bff" },
];
const STORAGE_KEYS = {
  profile: "bungeoppang.profile.v1",
  scores: "bungeoppang.scores.v1",
};
const CLOUD_SCORE_LIMIT = 20;

let audioContext;
let last = performance.now();
let shake = 0;
let result = false;
let gameRunning = false;
let finalSaved = false;
let cloudScoresCache = [];
const profile = loadProfile();

const state = {
  life: 100,
  score: 0,
  combo: 0,
  bestCombo: 0,
  made: 0,
  stock: 0,
  served: 0,
  customer: null,
  customerWait: 0.8,
  fire: 0.03,
  pumpAnim: 0,
  pumpGrace: 0,
  message: "READY",
  messageT: 1.2,
  hitText: [],
  molds: Array.from({ length: 12 }, (_, index) => makeMold(index)),
};

function makeMold(index) {
  return {
    index,
    phase: "empty",
    t: 0,
    rate: heatRate(index),
    snap: 0,
    flash: 0,
    smoke: Math.random() * 3,
  };
}

function heatRate(index) {
  if (index === 4 || index === 7) return 1.58;
  if ([1, 3, 5, 6, 8, 10].includes(index)) return 0.96;
  return 0.62;
}

function reset() {
  result = false;
  gameRunning = true;
  finalSaved = false;
  shake = 0;
  Object.assign(state, {
    life: 100,
    score: 0,
    combo: 0,
    bestCombo: 0,
    made: 0,
    stock: 0,
    served: 0,
    customer: null,
    customerWait: 0.8,
    fire: 0.03,
    pumpAnim: 0,
    pumpGrace: 0,
    message: "READY",
    messageT: 1.2,
    hitText: [],
    molds: Array.from({ length: 12 }, (_, index) => makeMold(index)),
  });
  menuOverlay.classList.add("hidden");
  beep("start");
}

function update(dt) {
  if (!gameRunning || result) return;

  const heatMul = 0.06 + Math.pow(state.fire, 1.18) * 0.64;
  state.pumpGrace = Math.max(0, state.pumpGrace - dt);
  state.fire = Math.max(0, state.fire - dt * (state.pumpGrace > 0 ? 0.06 : 0.42));
  state.pumpAnim = Math.max(0, state.pumpAnim - dt);
  state.messageT = Math.max(0, state.messageT - dt);
  shake = Math.max(0, shake - dt * 16);
  updateCustomer(dt);

  for (const text of state.hitText) {
    text.t -= dt;
    text.y -= dt * 42;
  }
  state.hitText = state.hitText.filter((text) => text.t > 0);

  for (const mold of state.molds) {
    mold.flash = Math.max(0, mold.flash - dt);
    mold.snap = Math.max(0, mold.snap - dt);
    mold.smoke += dt;
    if (mold.phase === "empty" || mold.phase === "burnt") continue;
    mold.t += dt * mold.rate * heatMul;
    if (mold.phase === "batter" && mold.t >= 1.48) burn(mold, "탐!");
    if (mold.phase === "flipped" && mold.t >= 1.42) burn(mold, "탐!");
  }

}

function updateCustomer(dt) {
  if (!state.customer) {
    state.customerWait -= dt;
    if (state.customerWait <= 0) spawnCustomer();
    return;
  }

  state.customer.patience -= dt;
  state.customer.bounce += dt;
  state.customer.buyCooldown = Math.max(0, state.customer.buyCooldown - dt);

  if (state.stock > 0 && state.customer.buyCooldown <= 0) {
    sellFish();
    return;
  }

  if (state.stock <= 0) {
    state.customer.grumble -= dt;
    if (state.customer.patience < state.customer.maxPatience * 0.68 && state.customer.grumble <= 0) {
      const lines = ["빨리줘!", "아직이야?", "배고파!", "타는거아냐?"];
      state.message = lines[Math.floor(Math.random() * lines.length)];
      state.messageT = 0.55;
      state.customer.grumble = 1.7;
      shake = 2;
      beep("bad");
    }
  }

  if (state.customer.patience <= 0) {
    const loss = 22 + state.customer.want * 7;
    state.life = Math.max(0, state.life - loss);
    state.combo = 0;
    state.score = Math.max(0, state.score - 70);
    state.message = "손님감";
    state.messageT = 0.6;
    state.customer = null;
    state.customerWait = 1.3;
    shake = 4;
    beep("bad");
    if (state.life <= 0) {
      finishGame();
    }
  }
}

function spawnCustomer() {
  const base = CUSTOMERS[Math.floor(Math.random() * CUSTOMERS.length)];
  const need = 1 + Math.floor(Math.random() * 3);
  state.customer = {
    ...base,
    need,
    want: need,
    patience: 13 + need * 3,
    maxPatience: 13 + need * 3,
    bounce: 0,
    buyCooldown: 0.3,
    grumble: 2.4,
  };
  state.message = `${need}개`;
  state.messageT = 0.5;
  beep("start");
}

function pumpFire() {
  unlockAudio();
  if (!gameRunning || result) return;
  state.fire = Math.min(1, state.fire + 0.14);
  state.pumpAnim = 0.22;
  state.pumpGrace = 1.05;
  state.score += 2;
  state.message = "펌핑!";
  state.messageT = 0.22;
  popText("슉", 25, 636, "#fff438");
  beep("boost");
}

function pressMold(index) {
  unlockAudio();
  if (!gameRunning || result) return;
  const mold = state.molds[index];
  const cx = BOARD.x + (index % 3) * BOARD.cellW + BOARD.cellW / 2;
  const cy = BOARD.y + Math.floor(index / 3) * BOARD.cellH + BOARD.cellH / 2;
  mold.flash = 0.16;

  if (mold.phase === "empty") {
    mold.phase = "batter";
    mold.t = 0;
    state.message = "촥";
    state.messageT = 0.35;
    popText("촥", cx, cy, "#fff176");
    beep("batter");
    return;
  }

  if (mold.phase === "batter") {
    if (mold.t < 0.38) return bad(mold, "덜익음", cx, cy);
    if (mold.t > 1.28) return burn(mold, "늦음!");
    const perfect = mold.t > 0.74 && mold.t < 1.02;
    mold.phase = "flipped";
    mold.t = 0;
    mold.snap = 0.28;
    state.combo = perfect ? state.combo + 1 : state.combo;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.score += perfect ? 30 : 12;
    state.message = perfect ? "찰칵!" : "착";
    state.messageT = 0.42;
    popText(perfect ? "찰칵!" : "착", cx, cy, perfect ? "#ffe84b" : "#ffffff");
    beep(perfect ? "perfectFlip" : "flip");
    setTimeout(() => beep("land"), 125);
    return;
  }

  if (mold.phase === "flipped") {
    if (mold.t < 0.5) return bad(mold, "물렁", cx, cy);
    if (mold.t > 1.24) return burn(mold, "탐!");
    const perfect = mold.t > 0.86 && mold.t < 1.1;
    const count = perfect ? 2 : 1;
    state.score += perfect ? 28 : 12;
    state.combo += perfect ? 2 : 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.made += count;
    state.stock += count;
    state.message = perfect ? "황금!" : "완성";
    state.messageT = 0.55;
    popText(`재고+${count}`, cx, cy, perfect ? "#ffec27" : "#ffffff");
    Object.assign(mold, makeMold(index));
    beep(perfect ? "gold" : "take");
    return;
  }

  if (mold.phase === "burnt") {
    Object.assign(mold, makeMold(index));
    state.combo = 0;
    state.message = "버림";
    state.messageT = 0.35;
    popText("퍽", cx, cy, "#5c3d2e");
    beep("trash");
  }
}

function sellFish() {
  if (!gameRunning || !state.customer || state.stock <= 0) return;

  state.stock -= 1;
  state.customer.need -= 1;
  state.customer.buyCooldown = 0.22;
  const sale = 120 + state.combo * 7;
  state.score += sale;
  popText(`+${sale}`, 300, 190, "#fff438");
  beep("coin");

  if (state.customer.need <= 0) {
    const tip = Math.round((state.customer.patience / state.customer.maxPatience) * 90);
    state.score += tip;
    state.served += state.customer.want;
    state.life = Math.min(100, state.life + 3);
    state.combo += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.message = "판매!";
    state.messageT = 0.55;
    state.customer = null;
    state.customerWait = 0.8 + Math.random() * 1.2;
    beep("perfect");
  } else {
    state.message = `${state.customer.need}개더`;
    state.messageT = 0.45;
  }
}

function finishGame() {
  if (finalSaved) return;
  result = true;
  gameRunning = false;
  finalSaved = true;
  const record = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    deviceId: profile.deviceId,
    name: profile.name || "무명",
    score: Math.round(state.score),
    made: state.made,
    served: state.served,
    bestCombo: state.bestCombo,
    createdAt: new Date().toISOString(),
  };
  saveLocalScore(record);
  beep("end");
  showMenu("result", record, {
    cloudStatus: cloudApiEnabled() ? "온라인 랭킹 저장 중..." : "로컬 저장 완료",
  });
  syncCloudScore(record);
}

function bad(mold, label, x, y) {
  state.combo = 0;
  state.score = Math.max(0, state.score - 30);
  state.message = label;
  state.messageT = 0.45;
  mold.flash = 0.3;
  shake = 5;
  popText(label, x, y, "#ff4a4a");
  beep("bad");
}

function burn(mold, label) {
  if (mold.phase === "burnt") return;
  mold.phase = "burnt";
  mold.t = 0;
  mold.flash = 0.38;
  state.combo = 0;
  state.message = label;
  state.messageT = 0.45;
  shake = 5;
  const cx = BOARD.x + (mold.index % 3) * BOARD.cellW + BOARD.cellW / 2;
  const cy = BOARD.y + Math.floor(mold.index / 3) * BOARD.cellH + BOARD.cellH / 2;
  popText(label, cx, cy, "#ff4a4a");
  beep("burn");
}

function popText(label, x, y, color) {
  state.hitText.push({ label, x, y, color, t: 0.62 });
}

function draw() {
  ctx.save();
  const sx = shake ? Math.round(Math.random() * shake - shake / 2) : 0;
  const sy = shake ? Math.round(Math.random() * shake - shake / 2) : 0;
  ctx.translate(sx, sy);
  drawScene();
  ctx.restore();
}

function drawScene() {
  drawBackground();
  drawTop();
  drawBoost();
  drawBoard();
  drawBottom();
  drawHitText();
  if (state.messageT > 0) drawMessage();
  if (result) drawResult();
}

function drawBackground() {
  rect(0, 0, W, H, "#87e7ff");
  for (let i = 0; i < 7; i += 1) {
    rect(i * 64 - 20, 116 + (i % 2) * 14, 48, 58, "#5fc4ea", 0.42);
    rect(i * 64 - 12, 104 + (i % 2) * 14, 24, 12, "#5fc4ea", 0.42);
  }
  rect(0, 0, W, 64, "#fff8d1");
  for (let x = 0; x < W; x += 50) {
    rect(x, 0, 28, 58, "#f1252e");
    rect(x + 28, 0, 22, 58, "#ffffff");
    circle(x + 14, 58, 14, "#f1252e");
    circle(x + 39, 58, 11, "#ffffff");
  }
  rect(0, 206, W, H - 206, "#d8e7e7");
}

function drawTop() {
  drawMascot(132, 74);
  bubble(238, 86, 128, 76, "#1c1c1c");
  text("SCORE", 270, 114, "#ffe438", 15, "bold");
  text(scoreText(state.score), 257, 147, "#ffffff", 28, "bold");
  drawLifeGauge(286, 166);
  drawBomb(34, 123);
  text(`COMBO ${state.combo}`, 22, 196, "#ffffff", 17, "bold", "#0a3d82");
  drawCustomerOrder();
}

function drawLifeGauge(x, y) {
  const ratio = Math.max(0, state.life / 100);
  rect(x, y, 88, 33, "#ffffff");
  lineRect(x, y, 88, 33, "#2a496d", 3);
  text("평판", x + 7, y + 16, "#1b2a42", 13, "bold");
  rect(x + 7, y + 20, 74, 7, "#202735");
  rect(x + 9, y + 22, 70 * ratio, 3, ratio < 0.3 ? "#ff2d1f" : ratio < 0.62 ? "#fff438" : "#25c66a");
}

function drawCustomerOrder() {
  if (!state.customer) {
    bubble(222, 166, 136, 46, "#ffffff");
    text("손님대기", 245, 195, "#1b2a42", 20, "bold");
    return;
  }

  const c = state.customer;
  const bob = Math.sin(c.bounce * 8) * 3;
  bubble(206, 162, 122, 52, "#ffffff");
  lineRect(206, 162, 122, 52, "#1b6baa", 3);
  text(`${c.need}개 주세요`, 218, 194, "#1b2a42", 20, "bold");
  const ratio = Math.max(0, c.patience / c.maxPatience);
  rect(214, 201, 100, 7, "#202735");
  rect(216, 203, 96 * ratio, 3, ratio < 0.3 ? "#ff2d1f" : "#25c66a");
  drawCustomer(330, 158 + bob, c.face, c.color);
}

function drawBoard() {
  rect(BOARD.x - 6, BOARD.y - 6, BOARD.cellW * 3 + 12, BOARD.cellH * 4 + 12, "#29313a");
  for (let row = 0; row < BOARD.rows; row += 1) {
    for (let col = 0; col < BOARD.cols; col += 1) {
      const index = row * BOARD.cols + col;
      const x = BOARD.x + col * BOARD.cellW;
      const y = BOARD.y + row * BOARD.cellH;
      drawCell(state.molds[index], x, y, BOARD.cellW, BOARD.cellH);
    }
  }
  const heatAlpha = Math.min(0.68, state.fire * 0.9 + state.pumpAnim * 1.6);
  if (heatAlpha > 0.06) {
    lineRect(BOARD.x - 6, BOARD.y - 6, BOARD.cellW * 3 + 12, BOARD.cellH * 4 + 12, "#ff3a25", 7);
    rect(BOARD.x - 4, BOARD.y - 4, BOARD.cellW * 3 + 8, BOARD.cellH * 4 + 8, "#ff6324", heatAlpha * 0.16);
    for (let i = 0; i < 8; i += 1) {
      const x = BOARD.x + 12 + i * 41;
      const y = BOARD.y + BOARD.cellH * 4 + 3 + ((i % 2) * 5);
      drawMiniHeat(x, y, heatAlpha);
    }
  }
}

function drawCell(mold, x, y, w, h) {
  rect(x, y, w - 3, h - 3, "#565b5f");
  rect(x + 6, y + 6, w - 15, h - 15, "#303337");
  rect(x + 13, y + 13, w - 29, h - 29, "#262a2d");
  line(x + 7, y + h - 10, x + w - 14, y + h - 10, "#1c1f22", 5);
  text(LABELS[mold.index], x + 8, y + 20, "#e8f5ff", 13, "bold", "#192027");

  if (mold.flash > 0) {
    rect(x + 2, y + 2, w - 7, h - 7, mold.phase === "burnt" ? "#ff392e" : "#fff65c", 0.28);
  }

  if (mold.phase === "empty") {
    drawEmptyFish(x + 11, y + 23, "#3d444a");
    return;
  }

  if (mold.phase === "batter") {
    if (mold.t < 0.28) drawBatter(x + 26, y + 40, "#fff4bc");
    else drawBigFish(x + 11, y + 23, batterColor(mold.t), false, "bellyUp");
    return;
  }

  if (mold.phase === "flipped") {
    drawFlipFish(x + 11, y + 23, flippedColor(mold.t), mold.snap);
    return;
  }

  if (mold.phase === "burnt") {
    drawBigFish(x + 11, y + 23, "#242424", true, "bellyDown");
    drawSmoke(x + 40, y + 30, mold.smoke);
  }
}

function drawBottom() {
  rect(0, 712, W, 132, "#122334");
  rect(0, 712, W, 7, "#fff438");
  const down = state.pumpAnim > 0.08 ? 4 : 0;
  rect(PUMP_BUTTON.x, PUMP_BUTTON.y + down, PUMP_BUTTON.w, PUMP_BUTTON.h, "#020202");
  lineRect(PUMP_BUTTON.x, PUMP_BUTTON.y + down, PUMP_BUTTON.w, PUMP_BUTTON.h, state.fire > 0.6 ? "#ff3a25" : "#fff438", 3);
  text("펌핑!", PUMP_BUTTON.x + 16, PUMP_BUTTON.y + 33 + down, "#fff438", 23, "bold");
  text("화력증가!", PUMP_BUTTON.x + 101, PUMP_BUTTON.y + 34 + down, "#ff2d1f", 27, "bold", "#fff438");
  for (let i = 0; i < Math.min(10, state.stock); i += 1) {
    drawTinyFish(18 + i * 18, 784, "#ffc928");
  }
  text(`재고 ${state.stock}`, 205, 800, "#ffffff", 19, "bold");
  text(`판매 ${state.served}`, 292, 800, "#fff438", 18, "bold");
}

function drawBoost() {
  const pumpDown = state.pumpAnim > 0.08 ? 18 : state.pumpAnim > 0 ? 8 : 0;
  rect(BOOST.x, BOOST.y, BOOST.w, BOOST.h, "#1e2835");
  rect(BOOST.x + 4, BOOST.y + 8, BOOST.w - 8, BOOST.h - 16, "#edf4ff");
  const fill = Math.floor((BOOST.h - 28) * state.fire);
  rect(BOOST.x + 7, BOOST.y + BOOST.h - 14 - fill, BOOST.w - 14, fill, state.fire > 0.7 ? "#ff252d" : "#e4202a");

  rect(BOOST.x - 2, BOOST.y - 54 + pumpDown, BOOST.w + 4, 46, "#344c63");
  rect(BOOST.x + 6, BOOST.y - 44 + pumpDown, BOOST.w - 12, 28, "#d9efff");
  rect(BOOST.x + 9, BOOST.y - 8, BOOST.w - 18, 18, "#344c63");
  line(BOOST.x + BOOST.w / 2, BOOST.y - 6, BOOST.x + BOOST.w / 2, BOOST.y + 18, "#1e2835", 5);

  rect(BOOST.x - 4, BOOST.y + BOOST.h + 8, BOOST.w + 8, 48, "#1e2835");
  drawFlame(BOOST.x + 3, BOOST.y + BOOST.h + 16, state.fire > 0.68 ? "#ffef35" : "#ff6330", state.fire);
  if (state.pumpAnim > 0) {
    line(BOOST.x + BOOST.w + 2, BOOST.y + BOOST.h + 15, BOOST.x + BOOST.w + 34, BOOST.y + BOOST.h - 2, "#fff438", 5);
    line(BOOST.x + BOOST.w + 4, BOOST.y + BOOST.h + 30, BOOST.x + BOOST.w + 39, BOOST.y + BOOST.h + 34, "#ff6330", 5);
  }
}

function drawMessage() {
  const w = Math.max(84, state.message.length * 26);
  const x = (W - w) / 2;
  rect(x, 182, w, 42, "#ffffff");
  lineRect(x, 182, w, 42, "#f52973", 3);
  text(state.message, x + 13, 211, "#f52973", 27, "bold");
}

function drawResult() {
  rect(28, 270, 334, 204, "#ffffff", 0.96);
  lineRect(28, 270, 334, 204, "#182e55", 4);
  text("게임오버", 94, 326, "#ff2d1f", 37, "bold");
  text(`SCORE ${scoreText(state.score)}`, 73, 374, "#182e55", 25, "bold");
  text(`FISH ${state.made}   BEST ${state.bestCombo}`, 74, 413, "#182e55", 18, "bold");
  text("화면 터치", 137, 452, "#f52973", 21, "bold");
}

function drawHitText() {
  for (const item of state.hitText) {
    text(item.label, item.x - item.label.length * 9, item.y, item.color, 24, "bold", "#162331");
  }
}

function drawBigFish(x, y, color, burnt, side = "bellyDown") {
  drawTaiyaki(x, y, color, burnt, 1, 1, false, side);
}

function batterColor(t) {
  if (t < 0.42) return "#fff1bd";
  if (t < 0.56) return "#ffe783";
  if (t < 0.76) return "#ffd342";
  if (t < 0.94) return "#f6b238";
  return "#d47a2c";
}

function flippedColor(t) {
  if (t < 0.5) return "#f6b238";
  if (t < 0.7) return "#e8942e";
  if (t < 0.87) return "#ffcb25";
  if (t < 1) return "#b56526";
  return "#5a3224";
}

function drawFlipFish(x, y, color, snap) {
  const step = snap <= 0 ? 4 : 4 - Math.ceil((snap / 0.28) * 4);
  const frames = [
    { dx: 0, dy: 0, sx: 1, sy: 1 },
    { dx: 4, dy: -17, sx: 1, sy: 0.46 },
    { dx: 34, dy: -24, sx: 0.34, sy: 1 },
    { dx: 4, dy: 13, sx: 1, sy: 0.48 },
    { dx: 0, dy: 0, sx: 1, sy: 1 },
  ];
  const f = frames[Math.max(0, Math.min(4, step))];
  const side = step < 3 ? "bellyUp" : "bellyDown";
  drawTaiyaki(x + f.dx, y + f.dy, color, false, f.sx, f.sy, false, side);
  if (step === 3) rect(x - 5, y + 48, 82, 6, "#ffffff", 0.78);
}

function drawEmptyFish(x, y, color) {
  drawTaiyaki(x, y, color, true, 1, 1, true, "bellyUp");
}

function drawBatter(x, y, color) {
  circle(x + 30, y + 20, 26, color);
  circle(x + 53, y + 25, 24, color);
  circle(x + 42, y + 38, 26, color);
  circle(x + 18, y + 35, 16, color);
  rect(x + 28, y + 18, 14, 6, "rgba(255,255,255,0.38)");
}

function drawTinyFish(x, y, color) {
  drawTaiyaki(x, y - 2, color, false, 0.24, 0.24);
}

function drawTaiyaki(x, y, color, burnt = false, sx = 1, sy = 1, imprint = false, side = "bellyDown") {
  const outline = burnt ? "#2b2f32" : shadeColor(color, -42);
  const ridge = burnt ? "#363b3f" : shadeColor(color, -25);
  const eye = burnt ? "#24282b" : "#7a4818";
  const highlight = burnt ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.32)";

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  if (side === "bellyUp") {
    ctx.translate(0, 68);
    ctx.scale(1, -1);
  }
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(10, 35);
  ctx.bezierCurveTo(9, 21, 26, 8, 48, 9);
  ctx.bezierCurveTo(63, 9, 73, 15, 78, 26);
  ctx.bezierCurveTo(84, 22, 89, 17, 95, 14);
  ctx.bezierCurveTo(91, 25, 90, 32, 98, 38);
  ctx.bezierCurveTo(90, 40, 91, 50, 95, 59);
  ctx.bezierCurveTo(87, 56, 82, 52, 77, 47);
  ctx.bezierCurveTo(68, 58, 44, 60, 25, 51);
  ctx.bezierCurveTo(15, 47, 9, 42, 10, 35);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = imprint ? 5 : 6;
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(13, 34);
  ctx.bezierCurveTo(18, 29, 21, 26, 27, 25);
  ctx.strokeStyle = ridge;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(28, 39, 6, 0, Math.PI * 2);
  ctx.strokeStyle = ridge;
  ctx.lineWidth = 3;
  ctx.stroke();

  if (!burnt || !imprint) {
    ctx.beginPath();
    ctx.arc(34, 30, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = eye;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(35.5, 28.4, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff6c8";
    ctx.fill();
    ctx.strokeStyle = eye;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(29, 24);
    ctx.lineTo(26, 20);
    ctx.moveTo(34, 23);
    ctx.lineTo(34, 18);
    ctx.moveTo(39, 24);
    ctx.lineTo(43, 20);
    ctx.stroke();
  }

  ctx.strokeStyle = ridge;
  ctx.lineWidth = 4;
  for (const [sx0, sy0] of [
    [46, 24],
    [57, 23],
    [67, 26],
    [44, 37],
    [55, 38],
    [66, 40],
    [41, 49],
    [53, 50],
  ]) {
    ctx.beginPath();
    ctx.arc(sx0, sy0, 5.5, -0.95, 0.95);
    ctx.stroke();
  }

  if (side === "bellyUp") {
    ctx.beginPath();
    ctx.moveTo(18, 22);
    ctx.bezierCurveTo(32, 15, 55, 14, 74, 23);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(54, 47);
    ctx.bezierCurveTo(58, 42, 64, 38, 71, 37);
    ctx.strokeStyle = ridge;
    ctx.lineWidth = 4;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(59, 13);
    ctx.bezierCurveTo(54, 21, 55, 26, 62, 30);
    ctx.moveTo(60, 54);
    ctx.bezierCurveTo(56, 48, 58, 43, 65, 40);
    ctx.strokeStyle = ridge;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, 50);
    ctx.bezierCurveTo(39, 58, 60, 56, 75, 48);
    ctx.strokeStyle = highlight;
    ctx.lineWidth = 7;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.moveTo(21, 16);
  ctx.bezierCurveTo(31, 11, 44, 12, 54, 15);
  ctx.strokeStyle = highlight;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function shadeColor(hex, amount) {
  const num = Number.parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawMascot(x, y) {
  rect(x + 22, y + 42, 62, 72, "#27354f");
  rect(x + 31, y + 28, 44, 44, "#f6b374");
  rect(x + 22, y + 18, 62, 28, "#fff171");
  rect(x + 68, y + 8, 34, 27, "#ef6b2e");
  rect(x + 38, y + 44, 5, 7, "#1b1d2a");
  rect(x + 61, y + 44, 5, 7, "#1b1d2a");
  rect(x + 47, y + 59, 14, 5, "#e0314f");
  rect(x + 9, y + 62, 14, 45, "#f6b374");
  rect(x + 84, y + 62, 14, 45, "#f6b374");
  rect(x + 3, y + 54, 16, 16, "#ffffff");
  rect(x + 91, y + 54, 16, 16, "#ffffff");
}

function drawCustomer(x, y, face, color) {
  if (face === "alien") {
    rect(x + 9, y + 8, 26, 24, color);
    rect(x + 5, y + 18, 34, 20, "#b793ff");
    rect(x + 12, y + 20, 4, 5, "#111827");
    rect(x + 28, y + 20, 4, 5, "#111827");
    rect(x + 16, y + 32, 14, 4, "#4a237a");
    rect(x + 2, y + 2, 9, 9, color);
    rect(x + 34, y + 2, 9, 9, color);
    return;
  }
  if (face === "old") {
    rect(x + 8, y + 16, 32, 28, "#ffd69a");
    rect(x + 8, y + 10, 32, 10, "#ffffff");
    rect(x + 13, y + 27, 4, 4, "#111827");
    rect(x + 30, y + 27, 4, 4, "#111827");
    rect(x + 18, y + 39, 14, 5, "#ffffff");
    return;
  }
  if (face === "mom") {
    rect(x + 8, y + 15, 32, 29, "#ffd69a");
    rect(x + 5, y + 8, 38, 14, color);
    rect(x + 13, y + 27, 4, 4, "#111827");
    rect(x + 30, y + 27, 4, 4, "#111827");
    rect(x + 18, y + 38, 14, 4, "#de3154");
    return;
  }
  rect(x + 8, y + 16, 32, 28, "#ffd69a");
  rect(x + 9, y + 8, 30, 13, color);
  rect(x + 13, y + 27, 4, 4, "#111827");
  rect(x + 30, y + 27, 4, 4, "#111827");
  rect(x + 18, y + 38, 14, 4, "#de3154");
}

function drawBomb(x, y) {
  circle(x, y, 28, "#0e1620");
  rect(x + 18, y - 29, 34, 11, "#0e1620");
  rect(x + 45, y - 33, 11, 11, "#ffe438");
  line(x - 20, y + 22, x - 48, y + 47, "#0e1620", 7);
  rect(x - 58, y + 43, 18, 18, "#ffe438");
}

function drawClock(x, y) {
  rect(x, y, 36, 42, "#ffffff");
  lineRect(x, y, 36, 42, "#2a496d", 3);
  rect(x + 8, y - 8, 20, 10, "#ff3636");
  rect(x + 9, y + 22, 18, 4, "#2a496d");
  rect(x + 17, y + 8, 4, 17, "#2a496d");
}

function drawMiniHeat(x, y, alpha) {
  rect(x, y + 6, 8, 18, "#ff392e", alpha);
  rect(x + 6, y, 8, 24, "#fff438", alpha);
  rect(x + 13, y + 8, 7, 15, "#ff7a22", alpha);
}

function drawFlame(x, y, color, power = 0.2) {
  const lift = Math.round(power * 16);
  const wide = Math.round(power * 8);
  rect(x + 7, y + 14 - lift, 12 + wide, 17 + lift, color);
  rect(x + 1 - wide / 2, y + 22 - lift, 24 + wide, 16 + lift, "#ff3a25");
  rect(x + 8, y + 26 - lift / 2, 10 + Math.round(power * 4), 12 + Math.round(power * 8), "#fff438");
}

function drawCookBar(x, y, w, ratio, danger) {
  rect(x, y, w, 9, "#161b21");
  rect(x + 2, y + 2, Math.max(0, Math.min(w - 4, Math.floor((w - 4) * ratio))), 5, danger ? "#ff2d1f" : "#fff438");
}

function drawSmoke(x, y, t) {
  for (let i = 0; i < 5; i += 1) {
    const yy = y - ((t * 18 + i * 16) % 62);
    circle(x + i * 11, yy, 10 - i, "#c5c5c5", 0.58);
  }
}

function bubble(x, y, w, h, color) {
  rect(x + 12, y, w - 24, h, color);
  rect(x, y + 12, w, h - 24, color);
  circle(x + 12, y + 12, 12, color);
  circle(x + w - 12, y + 12, 12, color);
  circle(x + 12, y + h - 12, 12, color);
  circle(x + w - 12, y + h - 12, 12, color);
}

function rect(x, y, w, h, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function circle(x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function line(x1, y1, x2, y2, color, width = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(Math.round(x1), Math.round(y1));
  ctx.lineTo(Math.round(x2), Math.round(y2));
  ctx.stroke();
  ctx.restore();
}

function lineRect(x, y, w, h, color, width = 1) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  ctx.restore();
}

function text(value, x, y, color, size, weight = "normal", stroke = null) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${GAME_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.letterSpacing = "0px";
  if (stroke) {
    ctx.lineWidth = Math.max(3, Math.floor(size / 5));
    ctx.strokeStyle = stroke;
    ctx.strokeText(String(value), Math.round(x), Math.round(y));
  }
  ctx.fillStyle = color;
  ctx.fillText(String(value), Math.round(x), Math.round(y));
  ctx.restore();
}

function scoreText(value) {
  return Math.round(value).toLocaleString("ko-KR");
}

function pointToGame(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * W,
    y: ((event.clientY - rect.top) / rect.height) * H,
  };
}

function getCellAt(x, y) {
  if (x < BOARD.x || y < BOARD.y) return -1;
  if (x >= BOARD.x + BOARD.cellW * BOARD.cols || y >= BOARD.y + BOARD.cellH * BOARD.rows) return -1;
  const col = Math.floor((x - BOARD.x) / BOARD.cellW);
  const row = Math.floor((y - BOARD.y) / BOARD.cellH);
  return row * BOARD.cols + col;
}

function inBoost(x, y) {
  return x >= BOOST.x - 8 && x <= BOOST.x + BOOST.w + 12 && y >= BOOST.y - 20 && y <= BOOST.y + BOOST.h + 72;
}

function inPumpButton(x, y) {
  return x >= PUMP_BUTTON.x && x <= PUMP_BUTTON.x + PUMP_BUTTON.w && y >= PUMP_BUTTON.y && y <= PUMP_BUTTON.y + PUMP_BUTTON.h;
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  unlockAudio();
  const p = pointToGame(event);
  if (result) {
    reset();
    return;
  }
  if (inPumpButton(p.x, p.y) || inBoost(p.x, p.y)) {
    pumpFire();
    return;
  }
  const index = getCellAt(p.x, p.y);
  if (index >= 0) pressMold(index);
});

canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
});

canvas.addEventListener("pointerup", (event) => {
  canvas.releasePointerCapture?.(event.pointerId);
});

canvas.addEventListener("pointercancel", (event) => {
  canvas.releasePointerCapture?.(event.pointerId);
});

window.addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === " " || key === "Shift") {
    event.preventDefault();
    pumpFire();
    return;
  }
  if (key === "Enter" && result) {
    event.preventDefault();
    reset();
    return;
  }
  if (key in KEY_TO_INDEX) {
    event.preventDefault();
    pressMold(KEY_TO_INDEX[key]);
  }
});

startButton.addEventListener("click", () => {
  unlockAudio();
  savePlayerName(false);
  reset();
});

saveNameButton.addEventListener("click", () => {
  savePlayerName(true);
});

scoresButton.addEventListener("click", () => {
  showScores();
});

howButton.addEventListener("click", () => {
  showHowTo();
});

function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) || "null");
    if (saved?.deviceId) return { deviceId: saved.deviceId, name: saved.name || "" };
  } catch {}
  const deviceId = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const next = { deviceId, name: "" };
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(next));
  return next;
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
}

function loadScores() {
  try {
    const scores = JSON.parse(localStorage.getItem(STORAGE_KEYS.scores) || "[]");
    return Array.isArray(scores) ? scores : [];
  } catch {
    return [];
  }
}

function savePlayerName(showMessage) {
  const name = playerNameInput.value.trim().slice(0, 10);
  profile.name = name;
  saveProfile();
  if (showMessage) {
    menuInfo.textContent = name ? `${name} 이름으로 저장했어.` : "이름 없이도 플레이 가능해.";
  }
}

function showMenu(mode = "home", record = null, detail = {}) {
  playerNameInput.value = profile.name || "";
  menuOverlay.classList.remove("hidden");
  if (mode === "result" && record) {
    const cloudStatus = detail.cloudStatus ? `\n${detail.cloudStatus}` : "";
    menuInfo.textContent = `기록 저장 완료${cloudStatus}\n${record.name} / ${scoreText(record.score)}점\n구운 수 ${record.made}개, 판매 ${record.served}개, 최고콤보 ${record.bestCombo}`;
    startButton.textContent = "다시 장사하기";
    return;
  }
  startButton.textContent = "장사 시작";
  if (mode === "scores") {
    showScores();
    return;
  }
  if (mode === "how") {
    showHowTo();
    return;
  }
  menuInfo.textContent = `기기 저장 ID: ${profile.deviceId.slice(0, 8)}\n로그인 없이 이름을 쓰고 플레이해. 배포 URL에서는 온라인 랭킹도 같이 저장돼.`;
}

async function showScores() {
  const localScores = loadScores();
  const localLines = formatScoreLines(localScores, 3);

  if (!cloudApiEnabled()) {
    menuInfo.textContent = localLines.length
      ? ["내 기기 기록", ...localLines, "온라인 랭킹은 배포 URL에서 켜져."].join("\n")
      : "아직 저장된 기록이 없어.\n한 판 굽고 게임오버가 되면 자동 저장돼.";
    return;
  }

  menuInfo.textContent = "온라인 랭킹 불러오는 중...\n잠깐만.";
  try {
    cloudScoresCache = await fetchCloudScores();
    const cloudLines = formatScoreLines(cloudScoresCache, 5);
    menuInfo.textContent = [
      "온라인 TOP",
      ...(cloudLines.length ? cloudLines : ["아직 온라인 기록이 없어."]),
      "",
      "내 기기",
      ...(localLines.length ? localLines.slice(0, 2) : ["저장된 기록 없음"]),
    ].join("\n");
  } catch (error) {
    console.warn("Cloud score load failed", error);
    menuInfo.textContent = localLines.length
      ? ["온라인 랭킹 연결 전이야.", "내 기기 기록", ...localLines].join("\n")
      : "온라인 랭킹 연결 전이야.\n아직 저장된 기록도 없어.";
  }
}

function showHowTo() {
  menuInfo.textContent = "철판 칸 터치: 반죽 > 뒤집기 > 꺼내기\n펌핑 버튼: 화력 증가\n재고가 있으면 손님이 자동으로 사가고, 손님을 놓치면 평판이 깎여.";
}

function saveLocalScore(record) {
  const scores = loadScores();
  scores.push(record);
  scores.sort((a, b) => b.score - a.score || b.bestCombo - a.bestCombo || b.served - a.served);
  localStorage.setItem(STORAGE_KEYS.scores, JSON.stringify(scores.slice(0, CLOUD_SCORE_LIMIT)));
}

async function syncCloudScore(record) {
  if (!cloudApiEnabled()) return;

  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.saved) throw new Error(data.error || "Cloud score save failed");
    cloudScoresCache = Array.isArray(data.scores) ? data.scores : [];
    if (result && !gameRunning) {
      showMenu("result", record, { cloudStatus: "온라인 랭킹 저장 완료" });
    }
  } catch (error) {
    console.warn("Cloud score save failed", error);
    if (result && !gameRunning) {
      showMenu("result", record, { cloudStatus: "로컬 저장 완료 / 온라인 연결 대기" });
    }
  }
}

async function fetchCloudScores() {
  const response = await fetch("/api/scores", { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Cloud score load failed");
  return Array.isArray(data.scores) ? data.scores : [];
}

function cloudApiEnabled() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function formatScoreLines(scores, limit) {
  return scores.slice(0, limit).map((score, index) => {
    const name = score.name || "무명";
    return `${index + 1}. ${name} ${scoreText(score.score)}점 / 판매 ${score.served} / 콤보 ${score.bestCombo}`;
  });
}

function unlockAudio() {
  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    audioContext = new AudioCtor();
  }
  if (audioContext.state === "suspended") audioContext.resume();
}

function beep(type) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const map = {
    start: [[420, 0.05], [640, 0.06, 0.05]],
    batter: [[120, 0.045], [82, 0.04, 0.025]],
    flip: [[190, 0.035], [390, 0.04, 0.035]],
    perfectFlip: [[210, 0.03], [520, 0.04, 0.03], [860, 0.055, 0.07]],
    land: [[90, 0.025]],
    take: [[340, 0.04]],
    gold: [[620, 0.04], [980, 0.065, 0.045]],
    coin: [[760, 0.035], [1050, 0.045, 0.035]],
    perfect: [[520, 0.035], [780, 0.045, 0.035], [1040, 0.055, 0.07]],
    bad: [[105, 0.09]],
    burn: [[70, 0.14], [44, 0.12, 0.035]],
    trash: [[160, 0.05]],
    boost: [[260, 0.03], [330, 0.03, 0.03]],
    end: [[280, 0.08], [160, 0.12, 0.08]],
  };
  const tones = map[type] || [[300, 0.04]];
  for (const [freq, len, delay = 0] of tones) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = type === "bad" || type === "burn" ? "sawtooth" : "square";
    osc.frequency.setValueAtTime(freq, now + delay);
    osc.frequency.exponentialRampToValueAtTime(Math.max(32, freq * 0.72), now + delay + len);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(type === "burn" ? 0.045 : 0.026, now + delay + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + len);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(now + delay);
    osc.stop(now + delay + len + 0.02);
  }
}

function loop(now) {
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

draw();
requestAnimationFrame(loop);
showMenu();

document.fonts?.ready.then(() => {
  draw();
});
