// Storyboard. Everything is expressed in bars / beats of the 150 BPM grid (1 beat = 12 frames at 30 fps),
// so every cut, caption and hit lands on the music grid.
//
// Logic of the tour (inside-out, low -> high):
//   Ch.1 Life support        brainstem, cerebellum
//   Ch.2 Relay & regulate    thalamus, hypothalamus, basal ganglia
//   Ch.3 Emotion & memory    amygdala, hippocampus, cingulate, insula
//   Ch.4 Cerebral cortex     occipital, parietal, temporal, frontal   (sensation -> integration -> execution)
//   then the prefrontal cortex: lateral (DLPFC, VLPFC) -> polar (FPC) -> ventral (OFC) -> medial (vmPFC, dmPFC, ACC)

export const FPS = 30;
export const BPM = 150;
export const BEAT = 60 / BPM;      // 0.4 s
export const BAR = BEAT * 4;       // 1.6 s
export const TOTAL_BARS = 86;
export const DURATION = TOTAL_BARS * BAR;   // 137.6 s
export const TOTAL_FRAMES = Math.round(DURATION * FPS);

export const barTime = (bar, beat = 1) => (bar - 1) * BAR + (beat - 1) * BEAT;

const C = { c10: '#F4F7FB', c20: '#E8EEF6', c30: '#CCDBEB', c40: '#9FBDDA', c50: '#6C9AC4', c60: '#497DAE', c70: '#376392',
  c80: '#2E5076', c90: '#2B4868', c100: '#263B54' };

export const CHAPTERS = [
  { cn: '生命基石', en: 'LIFE SUPPORT' },
  { cn: '中继与调控', en: 'RELAY & REGULATE' },
  { cn: '情绪与记忆', en: 'EMOTION & MEMORY' },
  { cn: '大脑皮层', en: 'CEREBRAL CORTEX' },
];
export const PFC_PILLS = [
  { cn: '背外侧', en: 'DLPFC' }, { cn: '腹外侧', en: 'VLPFC' }, { cn: '额极', en: 'FPC' }, { cn: '眶额', en: 'OFC' },
  { cn: '腹内侧', en: 'vmPFC' }, { cn: '背内侧', en: 'dmPFC' }, { cn: '前扣带', en: 'ACC' },
];

// ---- structure state helpers: [focus, glow, alpha, colour]
const GHOST = [0, 0, 0.5, C.c60];
const HI = [1, 0.04, 1, C.c40];
const SOLIDDIM = [1, 0, 1, C.c70];
const HIDDEN = [0, 0, 0, C.c60];

// Cortex colouring recipes -> list of [atom, colour, glow, solid]
const ALL_PFC = ['dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc', 'acc'];
const PFC_COL = { dlpfc: C.c40, vlpfc: C.c60, fpc: C.c20, ofc: C.c50, vmpfc: C.c30, dmpfc: C.c70, acc: C.c40 };

function lobeHighlight(which) {
  const lobes = {
    occipital: ['occipital'], parietal: ['parietal'], temporal: ['temporal'],
    frontal: ['frontal', ...ALL_PFC.filter((a) => a !== 'acc')],
  };
  const out = [];
  for (const [name, atoms] of Object.entries(lobes)) {
    const on = name === which;
    for (const a of atoms) out.push([a, on ? C.c40 : C.c80, on ? 0.04 : 0, on ? 1 : 0]);
  }
  return out;
}
function allLobes() {
  const out = [];
  const tone = { occipital: C.c80, parietal: C.c60, temporal: C.c50, frontal: C.c40 };
  for (const [name, c] of Object.entries(tone)) {
    const atoms = name === 'frontal' ? ['frontal', ...ALL_PFC.filter((a) => a !== 'acc')] : [name];
    for (const a of atoms) out.push([a, c, 0, 1]);
  }
  out.push(['insula', C.c50, 0, 1], ['cingulate', C.c60, 0, 1], ['acc', C.c60, 0, 1]);
  return out;
}
function pfcColoured(focus, glowFocus = 0.04) {
  const out = [];
  for (const a of ALL_PFC) {
    if (!focus) out.push([a, PFC_COL[a], 0, 1]);
    else if (a === focus) out.push([a, C.c40, glowFocus, 1]);
    else out.push([a, C.c70, 0, 1]);
  }
  return out;
}

const cap = (s) => s;

export const SCENES = [
  // ------------------------------------------------------------------ intro (bars 1-4)
  { id: 'intro', bar: 1, bars: 4, fx: 'intro', solid: 0, rh: true, hideBrain: true,
    cam: { az: -150, el: 14, dist: 520, tgt: [0, 14, 12], fov: 30, drift: { az: 14 } },
    cortex: C.c70, cues: [{ b0: 8, b1: 15, cn: '一场由内而外、由低到高的脑区之旅', en: 'An inside-out journey from lowest to highest' }] },

  // ------------------------------------------------------------------ overview (bars 5-8)
  { id: 'overview', bar: 5, bars: 4, fx: 'overview', solid: 1, rh: true, cut: { from: barTime(7), to: barTime(8, 3) },
    cam: { az: -150, el: 14, dist: 360, tgt: [0, 14, 12], fov: 30, drift: { az: 0 }, to: { az: -270, el: 8, dist: 330, at: [barTime(5) , barTime(7)] } },
    cortex: C.c60, none: C.c80, outline: 0,
    structs: { all: SOLIDDIM },
    cues: [
      { b0: 1, b1: 7, cn: '约 860 亿个神经元，重约 1.4 公斤', en: '~86 billion neurons in about 1.4 kg of tissue' },
      { b0: 8, b1: 15, cn: '只占体重约 2%，却消耗约 20% 的能量', en: 'Just ~2% of body weight, yet ~20% of the body\'s energy' },
    ] },

  // ------------------------------------------------------------------ Ch.1 life support
  { id: 'brainstem', bar: 9, bars: 2, chapter: 0, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: 62, el: 8, dist: 290, tgt: 'struct:brainstem', fov: 30, drift: { az: -10 } },
    structs: { all: GHOST, brainstem: HI },
    tag: { cn: '脑干', en: 'BRAINSTEM', meta: '中脑 · 脑桥 · 延髓  Midbrain · Pons · Medulla' },
    marker: 'struct:brainstem',
    cues: [{ b0: 1, b1: 8, cn: '生命的底层系统：呼吸、心跳、觉醒', en: 'The life-support layer: breathing, heartbeat, arousal' }] },
  { id: 'cerebellum', bar: 11, bars: 2, chapter: 0, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -28, el: 24, dist: 330, tgt: 'struct:cerebellum', fov: 30, drift: { az: 10 } },
    structs: { all: GHOST, cerebellum: HI },
    tag: { cn: '小脑', en: 'CEREBELLUM', meta: '约占脑体积 10%，却含约 80% 的神经元  ~10% of volume, ~80% of neurons' },
    marker: 'struct:cerebellum',
    cues: [{ b0: 1, b1: 8, cn: '运动协调与精细校准，也参与认知', en: 'Coordinates and fine-tunes movement — and cognition' }] },

  // ------------------------------------------------------------------ Ch.2 relay & regulate
  { id: 'thalamus', bar: 13, bars: 2, chapter: 1, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -62, el: 14, dist: 285, tgt: 'struct:thalamus', fov: 30, drift: { az: -9 } },
    structs: { all: GHOST, thalamus: HI },
    tag: { cn: '丘脑', en: 'THALAMUS', meta: '成对的卵圆形核团  Paired, egg-shaped nuclei' },
    marker: 'struct:thalamus',
    cues: [{ b0: 1, b1: 8, cn: '感觉信息的中继站，向皮层分发信号', en: 'The relay hub that routes signals up to the cortex' }] },
  { id: 'hypothalamus', bar: 15, bars: 2, chapter: 1, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: 78, el: 6, dist: 270, tgt: 'struct:hypothalamus', fov: 30, drift: { az: 8 } },
    structs: { all: GHOST, hypothalamus: HI, thalamus: [0, 0, 0.7, C.c60] },
    tag: { cn: '下丘脑', en: 'HYPOTHALAMUS', meta: '约杏仁大小，经垂体调控内分泌  Almond-sized; steers hormones via the pituitary' },
    marker: 'struct:hypothalamus',
    cues: [{ b0: 1, b1: 8, cn: '稳态总调度：体温、饥渴、节律与内分泌', en: 'Homeostasis: temperature, hunger, rhythms, hormones' }] },
  { id: 'basalganglia', bar: 17, bars: 2, chapter: 1, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -84, el: 12, dist: 285, tgt: [-20, 3, 2], fov: 30, drift: { az: 8 } },
    structs: { all: GHOST, caudate: HI, putamen: HI, pallidum: [1, 0.06, 1, C.c20], accumbens: HI },
    tag: { cn: '基底节', en: 'BASAL GANGLIA', meta: '尾状核 · 壳核 · 苍白球  Caudate · Putamen · Pallidum' },
    marker: 'struct:putamen',
    cues: [{ b0: 1, b1: 8, cn: '动作选择与习惯形成，多巴胺奖赏学习', en: 'Action selection, habits, dopamine reward learning' }] },

  // ------------------------------------------------------------------ Ch.3 emotion & memory
  { id: 'amygdala', bar: 19, bars: 2, chapter: 2, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -108, el: -4, dist: 205, tgt: 'struct:amygdala', fov: 30, drift: { az: -9 } },
    structs: { all: GHOST, amygdala: HI, hippocampus: [0, 0, 0.7, C.c60] },
    tag: { cn: '杏仁核', en: 'AMYGDALA', meta: '颞叶前内侧的杏仁状核团  Almond-shaped, anterior medial temporal lobe' },
    marker: 'struct:amygdala',
    cues: [{ b0: 1, b1: 8, cn: '威胁检测与恐惧，给记忆打上情绪标签', en: 'Threat detection and fear; tags memories with emotion' }] },
  { id: 'hippocampus', bar: 21, bars: 2, chapter: 2, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -92, el: 16, dist: 235, tgt: 'struct:hippocampus', fov: 30, drift: { az: 8 } },
    structs: { all: GHOST, hippocampus: HI, amygdala: [0, 0, 0.7, C.c60] },
    tag: { cn: '海马', en: 'HIPPOCAMPUS', meta: '形似海马的弯曲结构  Seahorse-shaped curved structure' },
    marker: 'struct:hippocampus',
    cues: [{ b0: 1, b1: 8, cn: '把经历巩固为长期记忆，也负责空间导航', en: 'Consolidates memories and supports spatial navigation' }] },
  { id: 'cingulate', bar: 23, bars: 2, chapter: 2, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: 92, el: 2, dist: 300, tgt: [-6, 12, 2], fov: 30, drift: { az: -8 } },
    atoms: [['cingulate', C.c30, 0.06, 1], ['acc', C.c30, 0.06, 1]],
    structs: { all: GHOST, corpusCallosum: [1, 0, 1, C.c70] },
    tag: { cn: '扣带回', en: 'CINGULATE CORTEX', meta: '环绕胼胝体的边缘皮层  Limbic cortex wrapped around the corpus callosum' },
    marker: 'atoms:cingulate',
    cues: [{ b0: 1, b1: 8, cn: '整合情绪、注意与疼痛，监测冲突与错误', en: 'Blends emotion, attention, pain; monitors conflict' }] },
  { id: 'insula', bar: 25, bars: 2, chapter: 2, solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -88, el: 4, dist: 270, tgt: 'insula', fov: 30, drift: { az: 7 } },
    atoms: [['insula', C.c30, 0.06, 1]],
    structs: { all: GHOST },
    tag: { cn: '岛叶', en: 'INSULA', meta: '深藏于外侧裂之中  Hidden deep within the lateral sulcus' },
    marker: 'atoms:insula',
    cues: [{ b0: 1, b1: 8, cn: '内脏感受与情绪觉察：感知身体的状态', en: 'Interoception and emotional awareness of the body' }] },

  // ------------------------------------------------------------------ Ch.4 cerebral cortex
  { id: 'occipital', bar: 27, bars: 2, chapter: 3, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -52, el: 10, dist: 300, tgt: 'lobe:occipital', fov: 30, drift: { az: 8 } },
    atoms: lobeHighlight('occipital'), structs: { all: SOLIDDIM },
    tag: { cn: '枕叶', en: 'OCCIPITAL LOBE', meta: '初级视皮层 V1 所在  Home of primary visual cortex (V1)' },
    marker: 'lobe:occipital',
    cues: [{ b0: 1, b1: 8, cn: '视觉加工的起点：边缘、朝向、颜色、运动', en: 'Where vision begins: edges, orientation, colour, motion' }] },
  { id: 'parietal', bar: 29, bars: 2, chapter: 3, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -78, el: 34, dist: 300, tgt: 'lobe:parietal', fov: 30, drift: { az: -8 } },
    atoms: lobeHighlight('parietal'), structs: { all: SOLIDDIM },
    tag: { cn: '顶叶', en: 'PARIETAL LOBE', meta: '中央后回 · 顶内沟  Postcentral gyrus · Intraparietal sulcus' },
    marker: 'lobe:parietal',
    cues: [{ b0: 1, b1: 8, cn: '躯体感觉与空间整合，引导注意与动作', en: 'Body sense and spatial integration guide attention' }] },
  { id: 'temporal', bar: 31, bars: 2, chapter: 3, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -100, el: -6, dist: 290, tgt: 'lobe:temporal', fov: 30, drift: { az: 8 } },
    atoms: lobeHighlight('temporal'), structs: { all: SOLIDDIM },
    tag: { cn: '颞叶', en: 'TEMPORAL LOBE', meta: '听皮层 · 梭状回 · 内侧颞叶  Auditory cortex · Fusiform · Medial temporal' },
    marker: 'lobe:temporal',
    cues: [{ b0: 1, b1: 8, cn: '听觉、语言理解、物体识别与记忆', en: 'Hearing, language, object recognition, memory' }] },
  { id: 'frontal', bar: 33, bars: 2, chapter: 3, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -122, el: 12, dist: 300, tgt: 'lobe:frontal', fov: 30, drift: { az: -8 } },
    atoms: lobeHighlight('frontal'), structs: { all: SOLIDDIM },
    tag: { cn: '额叶', en: 'FRONTAL LOBE', meta: '运动皮层 → 前额叶皮层  Motor cortex → prefrontal cortex' },
    marker: 'lobe:frontal',
    cues: [{ b0: 1, b1: 8, cn: '运动控制、语言表达，以及计划与决策', en: 'Movement, speech, planning and decision-making' }] },

  // ------------------------------------------------------------------ recap (bars 35-36)
  { id: 'recap', bar: 35, bars: 2, fx: 'recap', solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -76, el: 8, dist: 330, tgt: [-26, 12, 8], fov: 30, drift: { az: 6 } },
    structs: { all: GHOST }, atoms: [],
    banner: { cn: '由内而外 · 由低到高', en: 'INSIDE-OUT · LOW TO HIGH' },
    cues: [{ b0: 3, b1: 8, cn: '越往上，功能越抽象、越灵活……', en: 'The higher up, the more abstract and flexible…' }] },

  // ------------------------------------------------------------------ transition to the PFC (bars 37-44)
  { id: 'top', bar: 37, bars: 2, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 0,
    cam: { az: -92, el: 4, dist: 340, tgt: [-28, 14, -10], fov: 30, drift: { az: 3, dist: -30 } },
    atoms: lobeHighlight('frontal'), structs: { all: HIDDEN }, calm: true,
    cues: [{ b0: 1, b1: 8, cn: '在这条阶梯的顶端，是额叶的最前部', en: 'At the top: the very front of the frontal lobe' }] },
  { id: 'pfcdef', bar: 39, bars: 2, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -96, el: 4, dist: 230, tgt: 'pfc:all', fov: 30, drift: { az: 3, dist: -20 } },
    atoms: pfcColoured(null).map(([a]) => [a, C.c40, 0.1, 1]), structs: { all: HIDDEN }, calm: true,
    tag: { cn: '前额叶皮层', en: 'PREFRONTAL CORTEX', kicker: 'PFC', meta: '额叶前部 · 最晚成熟，可持续至 25 岁左右  Anterior frontal lobe · matures last, into the mid-20s' },
    marker: 'pfc:all',
    cues: [{ b0: 1, b1: 8, cn: '前额叶皮层（PFC）：最晚成熟，约至 25 岁', en: 'The prefrontal cortex (PFC): last to mature, mid-20s' }] },
  { id: 'build', bar: 41, bars: 4, fx: 'build', solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -96, el: 4, dist: 230, tgt: 'pfc:all', fov: 30, drift: {}, to: { az: -168, el: 10, dist: 150, at: [barTime(41), barTime(44, 4)] } },
    atoms: pfcColoured(null).map(([a]) => [a, C.c40, 0.15, 1]), structs: { all: HIDDEN },
    cues: [
      { b0: 0, b1: 7, cn: '它由多个分工不同的亚区组成', en: 'Built from sub-regions, each with its own job' },
      { b0: 8, b1: 15, cn: '让我们逐一拆解', en: 'Let\'s take them apart, one by one' },
    ] },

  // ------------------------------------------------------------------ PFC (bars 45-76)
  { id: 'pfc', bar: 45, bars: 4, fx: 'pfcoverview', solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -100, el: 6, dist: 190, tgt: 'pfc:all', fov: 30, drift: {}, to: { az: -282, el: 4, dist: 200, at: [barTime(45, 2), barTime(48, 4)] } },
    atoms: pfcColoured(null), structs: { all: HIDDEN, corpusCallosum: [1, 0, 1, C.c70] },
    tag: { cn: '前额叶皮层', en: 'PREFRONTAL CORTEX', kicker: 'PFC · 指挥中枢  COMMAND CENTER', meta: '外侧 · 前端 · 腹侧 · 内侧  Lateral · Polar · Ventral · Medial' },
    cues: [
      { b0: 1, b1: 8, cn: '整合目标、规则、情绪与记忆，形成决策', en: 'Binds goals, rules, emotion and memory into decisions' },
      { b0: 9, b1: 16, cn: '七个亚区：外侧、前端、腹侧、内侧', en: 'Seven sub-regions: lateral, polar, ventral, medial' },
    ] },

  { id: 'dlpfc', bar: 49, bars: 4, pfc: 0, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -84, el: 14, dist: 235, tgt: 'pfc:dlpfc', fov: 30, drift: { az: -7 } },
    atoms: pfcColoured('dlpfc'), structs: { all: HIDDEN }, marker: 'pfc:dlpfc',
    tag: { cn: '背外侧前额叶', en: 'DLPFC', kicker: '外侧 · 认知控制  LATERAL · COGNITIVE CONTROL', meta: '额中回 · Brodmann 9/46  Middle frontal gyrus · BA 9/46' },
    chips: [{ b: 4, cn: '工作记忆', en: 'Working memory' }, { b: 8, cn: '计划', en: 'Planning' }, { b: 12, cn: '注意控制', en: 'Attentional control' }],
    cues: [
      { b0: 1, b1: 8, cn: '额叶外侧面中部，与顶叶紧密联结', en: 'Mid-lateral frontal cortex, linked to parietal cortex' },
      { b0: 8, b1: 16, cn: '把目标“挂”在脑中：工作记忆与认知控制', en: 'Keeps goals online: working memory & cognitive control' },
    ] },
  { id: 'vlpfc', bar: 53, bars: 4, pfc: 1, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -102, el: -4, dist: 215, tgt: 'pfc:vlpfc', fov: 30, drift: { az: 7 } },
    atoms: pfcColoured('vlpfc'), structs: { all: HIDDEN }, marker: 'pfc:vlpfc',
    tag: { cn: '腹外侧前额叶', en: 'VLPFC', kicker: '外侧 · 抑制与语言  LATERAL · INHIBITION & LANGUAGE', meta: '下额回 · Brodmann 44/45/47  Inferior frontal gyrus · BA 44/45/47' },
    chips: [{ b: 4, cn: '反应抑制', en: 'Response inhibition' }, { b: 8, cn: '语言生成', en: 'Speech production' }, { b: 12, cn: '信息选择', en: 'Selection' }],
    cues: [
      { b0: 1, b1: 8, cn: '下额回：左侧含布洛卡区（44/45 区）', en: 'Inferior frontal gyrus; Broca\'s area on the left' },
      { b0: 8, b1: 16, cn: '右侧是“刹车”：反应抑制；左侧：语言生成', en: 'Right: the brake (response inhibition). Left: speech' },
    ] },
  { id: 'fpc', bar: 57, bars: 4, pfc: 2, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -166, el: 8, dist: 190, tgt: 'pfc:fpc', fov: 30, drift: { az: -6 } },
    atoms: pfcColoured('fpc'), structs: { all: HIDDEN }, marker: 'pfc:fpc',
    tag: { cn: '额极皮层', en: 'FRONTOPOLAR CORTEX', kicker: '前端 · 整合  POLAR · INTEGRATION', meta: '额极 · Brodmann 10  Frontal pole · BA 10' },
    chips: [{ b: 4, cn: '多任务', en: 'Multitasking' }, { b: 8, cn: '前瞻记忆', en: 'Prospective memory' }, { b: 12, cn: '元认知', en: 'Metacognition' }],
    cues: [
      { b0: 1, b1: 8, cn: '前额叶最前端，在人类中相对更发达', en: 'The tip of the PFC, relatively expanded in humans' },
      { b0: 8, b1: 16, cn: '统筹多个子目标，参与多任务与元认知', en: 'Coordinates sub-goals; multitasking and metacognition' },
    ] },
  { id: 'ofc', bar: 61, bars: 4, pfc: 3, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: -160, el: -62, dist: 225, tgt: 'pfc:ofc', fov: 30, drift: { az: 8 } },
    atoms: pfcColoured('ofc'), structs: { all: HIDDEN }, marker: 'pfc:ofc',
    tag: { cn: '眶额皮层', en: 'ORBITOFRONTAL CORTEX', kicker: '腹侧 · 价值  VENTRAL · VALUE', meta: '眼眶上方 · Brodmann 11/13/47  Above the eyes · BA 11/13/47' },
    chips: [{ b: 4, cn: '价值计算', en: 'Value' }, { b: 8, cn: '反转学习', en: 'Reversal learning' }, { b: 12, cn: '味觉与嗅觉', en: 'Taste & smell' }],
    cues: [
      { b0: 1, b1: 8, cn: '眼眶上方的额叶底面，接收味觉与嗅觉信息', en: 'Underside of the frontal lobe, fed by taste and smell' },
      { b0: 8, b1: 16, cn: '给选项“估价”：权衡奖赏与代价，随规则更新', en: 'Prices options: weighs reward vs. cost, updates with rules' },
    ] },
  { id: 'vmpfc', bar: 65, bars: 4, pfc: 4, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: 84, el: -8, dist: 215, tgt: 'pfc:vmpfc', fov: 30, drift: { az: -7 } },
    atoms: pfcColoured('vmpfc'), structs: { all: HIDDEN, corpusCallosum: [1, 0, 1, C.c60] }, marker: 'pfc:vmpfc',
    tag: { cn: '腹内侧前额叶', en: 'vmPFC', kicker: '腹侧/内侧 · 价值与情绪  VENTRO-MEDIAL · VALUE & EMOTION', meta: '内侧面下部 · Brodmann 10m/14/25  Lower medial surface · BA 10m/14/25' },
    chips: [{ b: 4, cn: '价值整合', en: 'Value integration' }, { b: 8, cn: '情绪调节', en: 'Emotion regulation' }, { b: 12, cn: '恐惧消退', en: 'Fear extinction' }],
    cues: [
      { b0: 1, b1: 8, cn: '额叶内侧面下部，紧密连接杏仁核与下丘脑', en: 'Lower medial surface, wired to amygdala and hypothalamus' },
      { b0: 8, b1: 16, cn: '整合价值与情绪；损伤会使日常决策失常', en: 'Integrates value and emotion; lesions derail decisions' },
    ] },
  { id: 'dmpfc', bar: 69, bars: 4, pfc: 5, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: 96, el: 16, dist: 220, tgt: 'pfc:dmpfc', fov: 30, drift: { az: 7 } },
    atoms: pfcColoured('dmpfc'), structs: { all: HIDDEN, corpusCallosum: [1, 0, 1, C.c60] }, marker: 'pfc:dmpfc',
    tag: { cn: '背内侧前额叶', en: 'dmPFC', kicker: '内侧 · 社会认知  MEDIAL · SOCIAL COGNITION', meta: '内侧面上部 · Brodmann 8/9 内侧  Upper medial surface · medial BA 8/9' },
    chips: [{ b: 4, cn: '心智理论', en: 'Theory of mind' }, { b: 8, cn: '自我与他人', en: 'Self vs. other' }, { b: 12, cn: '社会决策', en: 'Social decisions' }],
    cues: [
      { b0: 1, b1: 8, cn: '额叶内侧面上部，邻近辅助运动区', en: 'Upper medial surface, beside the supplementary motor area' },
      { b0: 8, b1: 16, cn: '社会认知枢纽：推测他人意图，区分自我与他人', en: 'Social-cognition hub: reads others\' intentions' },
    ] },
  { id: 'acc', bar: 73, bars: 4, pfc: 6, solid: 1, rh: false, none: C.c90, cortex: C.c80, outline: 1,
    cam: { az: 90, el: 0, dist: 225, tgt: 'pfc:acc', fov: 30, drift: { az: -6 } },
    atoms: pfcColoured('acc'), structs: { all: HIDDEN, corpusCallosum: [1, 0, 1, C.c60] }, marker: 'pfc:acc',
    tag: { cn: '前扣带皮层', en: 'ANTERIOR CINGULATE', kicker: '内侧 · 监控  MEDIAL · MONITORING', meta: '环绕胼胝体前部 · Brodmann 24/32/33  Around the corpus callosum · BA 24/32/33' },
    chips: [{ b: 4, cn: '冲突监测', en: 'Conflict monitoring' }, { b: 8, cn: '错误检测', en: 'Error detection' }, { b: 12, cn: '努力与动机', en: 'Effort & motivation' }],
    cues: [
      { b0: 1, b1: 8, cn: '环绕胼胝体前部，常被归入广义内侧前额叶', en: 'Wraps the corpus callosum; often counted as medial PFC' },
      { b0: 8, b1: 16, cn: '冲突与错误的“警报器”：监测表现、权衡投入', en: 'The conflict & error alarm: monitors and weighs effort' },
    ] },

  // ------------------------------------------------------------------ network (bars 77-80)
  { id: 'network', bar: 77, bars: 4, fx: 'network', solid: 0, rh: false, none: C.c90, cortex: C.c80,
    cam: { az: -62, el: 10, dist: 265, tgt: [-22, 8, 4], fov: 30, drift: { az: 7 } },
    atoms: pfcColoured(null).map(([a]) => [a, C.c30, 0.25, 1]).concat([['parietal', C.c60, 0.1, 1]]),
    structs: { all: [1, 0.05, 0.9, C.c60] },
    tag: { cn: '控制环路', en: 'CONTROL LOOPS', kicker: 'PFC · 自上而下  TOP-DOWN', meta: '' },
    cues: [
      { b0: 1, b1: 8, cn: '前额叶从不单独工作：与深部结构成环路', en: 'The PFC never works alone: it loops with deep structures' },
      { b0: 8, b1: 16, cn: '自上而下地调节注意、情绪与行为', en: 'Top-down control of attention, emotion and behaviour' },
    ] },

  // ------------------------------------------------------------------ finale (bars 81-86)
  { id: 'finale', bar: 81, bars: 4, fx: 'finale', solid: 1, rh: true, none: C.c90, cortex: C.c80, outline: 0,
    cam: { az: 70, el: 12, dist: 450, tgt: [0, 14, 4], fov: 30, drift: {}, to: { az: 252, el: 10, dist: 420, at: [barTime(81), barTime(85)] } },
    atoms: lobeHighlight('frontal').map(([a, c, g, s]) => (['dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc'].includes(a) ? [a, C.c20, 0.12, 1] : [a, C.c70, 0, 1])),
    structs: { all: SOLIDDIM },
    cues: [{ b0: 8, b1: 16, cn: '三大核心执行功能：抑制、更新、转换', en: 'Three core executive functions: inhibition, updating, shifting' }] },
  { id: 'outro', bar: 85, bars: 2, fx: 'outro', solid: 1, rh: true, none: C.c90, cortex: C.c80, outline: 0,
    cam: { az: 252, el: 10, dist: 420, tgt: [0, 14, 4], fov: 30, drift: { az: -8 } },
    atoms: lobeHighlight('frontal').map(([a, c, g, s]) => (['dlpfc', 'vlpfc', 'fpc', 'ofc', 'vmpfc', 'dmpfc'].includes(a) ? [a, C.c20, 0.12, 1] : [a, C.c70, 0, 1])),
    structs: { all: SOLIDDIM } },
];

for (const s of SCENES) {
  s.t0 = barTime(s.bar);
  s.t1 = barTime(s.bar + s.bars);
}

export const EF_WORDS = [
  { cn: '抑制', en: 'Inhibition' }, { cn: '更新', en: 'Updating' }, { cn: '转换', en: 'Shifting' }, { cn: '规划', en: 'Planning' },
  { cn: '决策', en: 'Decision-making' }, { cn: '情绪调节', en: 'Emotion regulation' }, { cn: '社会认知', en: 'Social cognition' },
  { cn: '元认知', en: 'Metacognition' },
];
export const FINAL_TITLE = { cn: '前额叶皮层\n大脑的指挥中枢', en: 'PREFRONTAL CORTEX\nTHE BRAIN\'S COMMAND CENTER' };
export const CREDITS = [
  { cn: '皮层：HCP S1200 fsLR-32k 平均表面 · Glasser 等 (2016) HCP-MMP1.0 脑区图谱', en: 'Cortex: HCP S1200 fsLR-32k average surface \u00B7 Glasser et al. (2016) HCP-MMP1.0 parcellation' },
  { cn: '皮层下：Desikan–Killiany / aseg 体素图谱；小脑、下丘脑、胼胝体为示意模型', en: 'Subcortex: Desikan\u2013Killiany/aseg volume; cerebellum, hypothalamus, corpus callosum stylised' },
  { cn: '音乐为原创合成；脑区边界为示意。科普内容，不构成医疗建议', en: 'Music: original, synthesized \u00B7 Boundaries are schematic \u00B7 For education only, not medical advice' },
];
