"""Shared beat grid + script for the music and the renderer.

140 BPM -> exactly 18900 samples per beat at 44.1 kHz, so every musical event lands on an exact sample.
Every on-screen change is scheduled in bars/beats on this grid, which is what keeps the cuts on the beat.
"""
BPM = 140
SR = 44100
SPB = SR * 60 // BPM          # samples per beat (18900)
BEAT = 60.0 / BPM
BAR = 4 * BEAT
FPS = 30
W, H = 1920, 1080

TOTAL_BARS = 112
TAIL = 4.0
DURATION = TOTAL_BARS * BAR + TAIL


def t_of(bar, beat=0.0):
    return (bar * 4 + beat) * BEAT


# ------------------------------------------------------------------ sections (bars)
INTRO = (0, 8)
P1 = (8, 60)        # 13 regions x 4 bars
BREAK = (60, 68)
P2 = (68, 100)      # PFC overview + 7 subregions, 4 bars each
FINALE = (100, 108)
OUTRO = (108, 112)

# chord per bar: (root pitch class, quality)
_D, _E, _F, _G, _A, _Bb, _B, _C = 2, 4, 5, 7, 9, 10, 11, 0
Dm, Bb, F, C, Gm, A = (_D, "m"), (_Bb, "M"), (_F, "M"), (_C, "M"), (_G, "m"), (_A, "M")
Em, CM, Am, BM = (_E, "m"), (_C, "M"), (_A, "m"), (_B, "M")


def chord_at(bar):
    if bar < 8:
        return [Dm, Dm, Bb, Bb, Gm, Gm, A, A][bar]
    if bar < 60:
        return [Dm, Bb, F, C][(bar - 8) % 4]
    if bar < 68:
        return [Bb, F, C, Dm, Bb, C, A, A][bar - 60]
    if bar < 104:
        return [Dm, Bb, Gm, A][(bar - 68) % 4]
    if bar < 108:
        return [Em, CM, Am, BM][bar - 104]
    return Em


# ------------------------------------------------------------------ dramatic events (bars)
IMPACTS = [(8, 1.0), (60, 0.55), (68, 1.0), (84, 0.6), (100, 1.0), (104, 0.9), (108, 1.0)]
BRAAMS = [68, 100, 104, 108]
RISERS = [(4, 7.75), (64, 67.625), (98, 99.875), (103, 103.875), (106, 107.875)]
GAPS = [(7.75, 8.0), (67.625, 68.0), (83.75, 84.0), (103.875, 104.0), (107.875, 108.0)]

# ------------------------------------------------------------------ script
# Part I blocks: (zh title, en title, tag, [(zh, en) subtitle cue 1, cue 2], view)
# view = (azimuth deg, elevation deg, distance scale, target xyz, cortex alpha, extra flags)
REGIONS = [
    ("额叶", "FRONTAL LOBE", "LOBUS FRONTALIS",
     [("计划、决策与自主运动的指挥部", "Command center for planning, decisions & voluntary movement"),
      ("约占大脑皮层的三分之一", "About one-third of the cerebral cortex")],
     dict(az=150, el=18, dist=1.0, tgt=(0, -12, 8))),
    ("顶叶", "PARIETAL LOBE", "LOBUS PARIETALIS",
     [("整合触觉、痛觉与身体位置感", "Integrates touch, pain & body position"),
      ("构建空间地图，引导注意与动作", "Builds spatial maps that guide attention & action")],
     dict(az=215, el=42, dist=1.0, tgt=(0, -20, 12))),
    ("颞叶", "TEMPORAL LOBE", "LOBUS TEMPORALIS",
     [("听觉与语言理解（韦尼克区）", "Hearing & language comprehension (Wernicke's area)"),
      ("识别面孔与物体，参与记忆", "Recognizes faces & objects, supports memory")],
     dict(az=182, el=-4, dist=0.95, tgt=(0, -18, 0))),
    ("枕叶", "OCCIPITAL LOBE", "LOBUS OCCIPITALIS",
     [("视觉皮层：解析形状、颜色与运动", "Visual cortex: decodes shape, color & motion"),
      ("视觉由此分为“是什么”与“在哪里”两条通路", "Vision splits into 'what' & 'where' streams")],
     dict(az=238, el=12, dist=0.98, tgt=(0, -30, 4))),
    ("岛叶", "INSULA", "LOBUS INSULARIS",
     [("藏于外侧沟深处的“第五脑叶”", "The hidden 'fifth lobe' deep in the lateral sulcus"),
      ("感知心跳与饥饿等内感受，塑造主观感受", "Senses heartbeat & hunger — interoception that shapes feelings")],
     dict(az=180, el=6, dist=0.78, tgt=(-30, 0, 4), cortex=0.22)),
    ("胼胝体", "CORPUS CALLOSUM", "CORPUS CALLOSUM",
     [("约 2 亿根神经纤维", "~200 million nerve fibers"),
      ("连接左右大脑半球的信息高速公路", "The information highway between the two hemispheres")],
     dict(az=160, el=38, dist=0.85, tgt=(0, -8, 14), cortex=0.12)),
    ("丘脑", "THALAMUS", "THALAMUS",
     [("感觉信息的中继枢纽（嗅觉除外）", "Relay hub for the senses (except smell)"),
      ("调控觉醒、注意与意识状态", "Gates arousal, attention & consciousness")],
     dict(az=145, el=24, dist=0.72, tgt=(0, -16, 6), cortex=0.1)),
    ("下丘脑", "HYPOTHALAMUS", "HYPOTHALAMUS",
     [("仅约 4 克，掌控体温、饥渴与睡眠", "Only ~4 g, yet governs temperature, hunger, thirst & sleep"),
      ("经垂体指挥全身内分泌系统", "Commands the endocrine system via the pituitary")],
     dict(az=195, el=-8, dist=0.66, tgt=(0, -8, -6), cortex=0.1)),
    ("基底神经节", "BASAL GANGLIA", "NUCLEI BASALES",
     [("动作选择：“启动”还是“刹车”", "Action selection: 'go' or 'stop'"),
      ("习惯与奖赏学习；帕金森病的核心受累环路", "Habits & reward learning; the circuit hit by Parkinson's disease")],
     dict(az=130, el=30, dist=0.74, tgt=(0, -2, 4), cortex=0.1)),
    ("海马", "HIPPOCAMPUS", "HIPPOCAMPUS",
     [("把经历转化为长期记忆", "Turns experiences into lasting memories"),
      ("位置细胞绘制大脑的“内置 GPS”", "Place cells build the brain's inner GPS")],
     dict(az=212, el=34, dist=0.74, tgt=(0, -22, -8), cortex=0.1)),
    ("杏仁核", "AMYGDALA", "CORPUS AMYGDALOIDEUM",
     [("威胁探测器：快速评估情绪意义", "Threat detector: rapidly tags emotional significance"),
      ("驱动恐惧学习，强化情绪记忆", "Drives fear learning & strengthens emotional memories")],
     dict(az=158, el=10, dist=0.68, tgt=(0, -4, -14), cortex=0.1)),
    ("小脑", "CEREBELLUM", "CEREBELLUM",
     [("协调运动、平衡与动作学习", "Coordinates movement, balance & motor learning"),
      ("约占脑重 10%，却拥有约 80% 的神经元", "~10% of brain mass, yet ~80% of its neurons")],
     dict(az=232, el=-14, dist=0.9, tgt=(0, -50, -26), cortex=0.22)),
    ("脑干", "BRAINSTEM", "TRUNCUS ENCEPHALI",
     [("呼吸、心跳、血压——生命中枢", "Breathing, heartbeat, blood pressure — the core of life"),
      ("12 对脑神经中有 10 对由此发出", "Origin of 10 of the 12 pairs of cranial nerves")],
     dict(az=185, el=-6, dist=0.82, tgt=(0, -26, -30), cortex=0.16)),
]

PFC_OVERVIEW = ("前额叶皮层", "PREFRONTAL CORTEX", "CORTEX PRAEFRONTALIS",
                [("大脑的“首席执行官”：执行控制中枢", "The brain's CEO: the hub of executive control"),
                 ("发育成熟最晚的脑区之一，持续至成年早期", "One of the last regions to mature — into early adulthood")],
                dict(az=138, el=16, dist=0.78, tgt=(0, 26, 12), cortex=0.2))

# medial=True hides the left hemisphere so the medial wall of the right hemisphere is visible
PFC_SUBS = [
    ("背外侧前额叶", "DLPFC", "DORSOLATERAL PFC · BA 9 / 46",
     [("工作记忆：在脑中保持并操作信息", "Working memory: holding & manipulating information"),
      ("制定计划、切换策略、抽象推理", "Planning, strategy switching & abstract reasoning")],
     dict(az=160, el=28, dist=0.7, tgt=(-20, 30, 26), cortex=0.2)),
    ("腹外侧前额叶", "VLPFC", "VENTROLATERAL PFC · BA 44 / 45 / 47",
     [("反应抑制：行为的“刹车”（以右侧为主）", "Response inhibition: the brain's brake (right-lateralized)"),
      ("左侧含布洛卡区：语言产出与语义提取", "Left side hosts Broca's area: speech & semantic retrieval")],
     dict(az=170, el=2, dist=0.7, tgt=(-30, 22, 2), cortex=0.2)),
    ("眶额皮层", "OFC", "ORBITOFRONTAL CORTEX · BA 11 / 13 / 47",
     [("计算奖赏价值：“这值得吗？”", "Computes reward value: 'Is it worth it?'"),
      ("结果改变时迅速更新预期", "Rapidly updates expectations when outcomes change")],
     dict(az=125, el=-52, dist=0.72, tgt=(0, 26, -10), cortex=0.2)),
    ("腹内侧前额叶", "VMPFC", "VENTROMEDIAL PFC · BA 10m / 11m / 25 / 32",
     [("整合情绪与价值，做出个人与社会决策", "Integrates emotion & value for personal and social decisions"),
      ("盖奇（1848）：损伤后人格骤变", "Phineas Gage (1848): personality transformed after injury")],
     dict(az=192, el=-6, dist=0.72, tgt=(4, 30, -2), cortex=0.2, medial=True)),
    ("前扣带皮层", "ACC", "ANTERIOR CINGULATE · BA 24 / 32 / 33",
     [("冲突监测与错误觉察：“出错了！”", "Conflict monitoring & error detection: 'Something's wrong!'"),
      ("权衡努力与回报，驱动动机", "Weighs effort against reward to drive motivation")],
     dict(az=178, el=8, dist=0.72, tgt=(4, 18, 14), cortex=0.2, medial=True)),
    ("背内侧前额叶", "DMPFC", "DORSOMEDIAL PFC · BA 8 / 9 (medial)",
     [("心理理论：推测他人的想法与意图", "Theory of mind: inferring others' thoughts & intentions"),
      ("自我反思：思考“我是谁”", "Self-reflection: thinking about who I am")],
     dict(az=168, el=22, dist=0.72, tgt=(4, 26, 30), cortex=0.2, medial=True)),
    ("额极皮层", "FPC", "FRONTOPOLAR CORTEX · BA 10",
     [("大脑最前端：同时驾驭多个目标", "The frontmost cortex: juggling multiple goals at once"),
      ("元认知：反思自己的思考", "Metacognition: thinking about your own thinking")],
     dict(az=112, el=12, dist=0.7, tgt=(0, 44, 8), cortex=0.2)),
]

# network finale: (P2 source group, g3 target group, zh, en)
NETWORKS = [
    (1, 1, "额顶控制网络", "Frontoparietal control"),
    (5, 2, "突显网络", "Salience network"),
    (4, 3, "情绪调节", "Emotion regulation"),
    (3, 4, "奖赏环路", "Reward circuit"),
    (6, 5, "默认模式网络", "Default mode network"),
    (2, 6, "语言网络", "Language network"),
]

INTRO_CUES = [
    (0.5, 3.75, "约 860 亿个神经元 · 逾百万亿个突触", "~86 billion neurons · 100+ trillion synapses"),
    (4.0, 7.75, "一场穿越大脑的旅程", "A journey through the brain"),
]
BREAK_CUES = [
    (60.0, 62.0, "而在所有脑区之中……", "And among all of them…"),
    (62.0, 64.0, "有一处，承载着人类最高阶的智慧", "one region holds our highest cognition"),
]
FINALE_CUES = [
    (100.0, 102.0, "前额叶从不孤军奋战", "The prefrontal cortex never works alone"),
    (102.0, 104.0, "它通过网络调度整个大脑", "It orchestrates the whole brain through networks"),
]
