# 分镜脚本 · 大脑地图：从脑区到前额叶皮层

> Brain Atlas: From Brain Regions to the Prefrontal Cortex

本文件由 `tools/make_docs.py` 从 `timeline.json` 自动生成；渲染器与配乐生成器读取同一份时间线，因此这里写的每个切点都与成片和 BGM 的节拍一一对应。

## 基本参数

| 项目 | 设定 |
|---|---|
| 时长 | 3:37.6（136 小节） |
| 速度 | 150 BPM，4/4 拍；1 小节 = 1.6 s = 48 帧，1 拍 = 0.4 s = 12 帧 |
| 画面 | 1920×1080，30 fps |
| 旁白 | 无；信息全部由画面文字与中英双语字幕承载 |
| 字幕 | 底部双语：中文在上（Noto Sans SC），英文在下（Inter）；每条 2 小节（3.2 s） |
| 配色 | Loyel 渐变蓝：#F4F7FB · #E8EEF6 · #CCDBEB · #9FBDDA · #6C9AC4 · #497DAE · #376392 · #2E5076 · #2B4868 · #263B54；深色底上的文字用 #FFFFFF |
| BGM | 代码合成（`music/synth.py`），热血电子 + 预告片式打击乐，D 小调 |

## 卡点规则

- **切镜只发生在小节强拍（第 1 拍）**，并伴随白闪、冲击波或横向故障切片；场景长度均为 2/4/8 小节，与音乐乐句对齐。
- **场景内部的动作落在拍点上**：标签、关键词、记忆槽、柱状图等元素每拍弹出一个；军鼓拍有轻微闪光，底鼓拍画面轻微缩放脉动。
- **两次“空拍”**：第 11、67 小节最后半拍全部静音、画面骤暗，下一强拍爆点（标题砸入）。
- 配乐生成器同时导出 `build/beatmap.json`（每个底鼓、军鼓、冲击的精确时间），渲染器据此驱动闪光与震屏，保证声画同步。

## 音乐结构

| 段落 | 小节 | 时间 | 内容 |
|---|---|---|---|
| intro | 0–7 | 0:00.0–0:12.8 | 暗色铺底 + 心跳式低频鼓（每拍“咚-咚”）+ 每 2 小节一次低音冲击；第 4 小节起加入低弦 16 分音符固定音型 |
| build1 | 8–11 | 0:12.8–0:19.2 | 四拍底鼓推进，军鼓滚奏由 8 分→16 分→32 分加速，白噪声上升音效；第 11 小节最后半拍全静音制造“空拍” |
| drop1 | 12–15 | 0:19.2–0:25.6 | 第一次爆点：重低音冲击 + Braam 铜管长音 + 镲片；随后进入半速重鼓律动 |
| grooveA | 16–59 | 0:25.6–1:36.0 | 第一章主律动：半速鼓（1 拍底鼓、3 拍军鼓）、8 分音符贝斯、超锯齿和弦；每 4 小节一次镲片 + 冲击，场景末拍通鼓过门；每 8~16 小节增减声部 |
| breakdown | 60–63 | 1:36.0–1:42.4 | 鼓组撤出，只留铺底、拨弦动机与心跳低频，滤波器关闭，情绪收束 |
| build2 | 64–67 | 1:42.4–1:48.8 | 第二次蓄力：和弦每拍重击、军鼓滚奏加速、上升音效，最后半拍静音 |
| drop2 | 68–75 | 1:48.8–2:01.6 | 第二次爆点（全片最大）：冲击 + Braam + 全速四拍鼓 + 主旋律锯齿合成器 |
| grooveB | 76–123 | 2:01.6–3:18.4 | 第二章主律动：全速鼓（四拍底鼓、2/4 拍军鼓）、16 分音符踩镲；每 8 小节一个亚区乐句，前 4 小节铺陈、后 4 小节加入主旋律 |
| finale | 124–131 | 3:18.4–3:31.2 | 高潮：全部声部 + 额外打击乐；第 130 小节终极重击 + 长和弦 |
| outro | 132–135 | 3:31.2–3:37.6 | 尾声：铺底与混响拖尾，逐渐淡出 |

## 分镜

### 开场

| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |
|---|---|---|---|---|---|
| S01 | 0:00.0–0:03.2 | 0–1 | 开场数据 / — | 深蓝底，一粒光点随心跳鼓脉动；第 1 拍光点炸开成粒子，“1.4 kg”大字随冲击砸入 | [0] 约 1.4 公斤，仅占体重的 2%<br>　 *About 1.4 kg, just 2% of your body weight* |
| S02 | 0:03.2–0:06.4 | 2–3 | 开场数据 / — | 切镜（强拍白闪）；满屏神经元光点按节拍连线成网，数字滚动计数到 860 亿 | [2] 约 860 亿个神经元<br>　 *Around 86 billion neurons* |
| S03 | 0:06.4–0:09.6 | 4–5 | 开场数据 / — | 切镜；环形能量条按拍填充到 20%，外圈光环随低音冲击扩散 | [4] 却消耗全身约 20% 的能量<br>　 *Yet it burns about 20% of your energy* |
| S04 | 0:09.6–0:12.8 | 6–7 | 开场数据 / 侧视图 | 切镜；大脑侧视轮廓第一次出现（线框），各脑叶边界随 8 分音符逐段点亮 | [6] 它依靠分工明确的脑区协同运作<br>　 *It runs on specialised regions working together* |
| S05 | 0:12.8–0:19.2 | 8–11 | 蓄力 / 侧视图 | 蓄力段：大脑线框逐拍描边、脑沟纹理随军鼓滚奏加速生长；每小节强拍闪出一个关键词；第 11 小节末半拍画面骤停变暗 | [8] 感知、记忆、情绪、决策……<br>　 *Sensing, remembering, feeling, deciding…*<br>[10] 分别由谁负责？<br>　 *Who is in charge of what?* |
| S06 | 0:19.2–0:25.6 | 12–15 | 标题爆点 / 侧视图 | **大脑地图 BRAIN ATLAS**<br>爆点：白闪 + 冲击波圆环 + 镜头震动，“大脑地图 / BRAIN ATLAS”标题砸入；大脑整体发光，背景粒子随贝斯律动 | [12] 从脑区到前额叶皮层<br>　 *From brain regions to the prefrontal cortex*<br>[14] 第一章 · 认识大脑的主要脑区<br>　 *Chapter 1 · The major brain regions* |

### 第一章 · 主要脑区

| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |
|---|---|---|---|---|---|
| S07 | 0:25.6–0:32.0 | 16–19 | 总览 / 侧视图 | 侧视图总览：额叶→顶叶→颞叶→枕叶→小脑→脑干按拍依次点亮并弹出名称标签，最后全部同亮 | [16] 大脑皮层分为四个脑叶<br>　 *The cerebral cortex has four lobes*<br>[18] 下方还有小脑与脑干<br>　 *Beneath sit the cerebellum and brainstem* |
| S08 | 0:32.0–0:38.4 | 20–23 | 脑区 / 侧视图 | **额叶 FRONTAL LOBE**<br>切镜推近额叶；额叶高亮发光，标签逐拍弹出；第 3 小节中央前回（运动皮层）条带从上到下扫光<br>标签：初级运动皮层 Primary motor cortex · 布洛卡区 Broca's area · 前额叶皮层 Prefrontal cortex | [20] 思考、计划与自主运动的中枢<br>　 *Hub of thought, planning and voluntary movement*<br>[22] 后缘的初级运动皮层，指挥全身肌肉<br>　 *Its rear strip, the motor cortex, commands your muscles* |
| S09 | 0:38.4–0:44.8 | 24–27 | 脑区 / 侧视图 | **顶叶 PARIETAL LOBE**<br>切镜到顶叶；中央后回感觉条带扫光；右侧准星图标按拍锁定目标<br>标签：躯体感觉皮层 Somatosensory cortex · 空间注意 Spatial attention | [24] 整合触觉、痛觉与身体位置感<br>　 *Integrates touch, pain and body position*<br>[26] 还负责空间注意：知道东西“在哪里”<br>　 *And spatial attention: knowing where things are* |
| S10 | 0:44.8–0:51.2 | 28–31 | 脑区 / 侧视图 | **颞叶 TEMPORAL LOBE**<br>切镜到颞叶；右侧声波随鼓点跳动；第 3 小节韦尼克区小圆点闪烁<br>标签：听觉皮层 Auditory cortex · 韦尼克区 Wernicke's area · 记忆 Memory | [28] 处理声音、理解语言、参与记忆<br>　 *Processes sound, language comprehension and memory*<br>[30] 韦尼克区受损：说话流利，却难以理解<br>　 *Wernicke's area damage: fluent speech, poor comprehension* |
| S11 | 0:51.2–0:57.6 | 32–35 | 脑区 / 侧视图 | **枕叶 OCCIPITAL LOBE**<br>切镜到枕叶；第 3 小节两条光流从枕叶分别射向颞叶（腹侧“是什么”）与顶叶（背侧“在哪里”）<br>标签：初级视皮层 V1 Primary visual cortex · 视觉通路 Visual streams | [32] 视觉中枢：初级视皮层 V1 所在地<br>　 *The visual centre, home of primary visual cortex V1*<br>[34] 视觉信息由此分为“是什么”与“在哪里”两路<br>　 *From here, vision splits into 'what' and 'where' pathways* |
| S12 | 0:57.6–1:04.0 | 36–39 | 脑区 / 侧视图 | **小脑 CEREBELLUM**<br>切镜到小脑；小脑叶片纹理逐层点亮；第 3 小节右侧柱状对比 10% vs 80% 按拍升起<br>标签：运动协调 Coordination · 平衡 Balance · 运动学习 Motor learning | [36] 协调动作、维持平衡、学习运动技能<br>　 *Coordinates movement, balance and motor skill learning*<br>[38] 只占脑重约 10%，却拥有约 80% 的神经元<br>　 *About 10% of brain mass, yet ~80% of its neurons* |
| S13 | 1:04.0–1:10.4 | 40–43 | 脑区 / 侧视图 | **脑干 BRAINSTEM**<br>切镜到脑干；右侧心电/呼吸曲线随底鼓跳动；最后一拍画面横向翻转（转入正中矢状面）<br>标签：中脑 Midbrain · 脑桥 Pons · 延髓 Medulla | [40] 由中脑、脑桥、延髓组成，连接脊髓<br>　 *Midbrain, pons and medulla, linking brain to spinal cord*<br>[42] 自动调控呼吸、心跳与觉醒<br>　 *Runs breathing, heartbeat and wakefulness on autopilot* |
| S14 | 1:10.4–1:16.8 | 44–47 | 脑区 / 内侧视图 | **丘脑 THALAMUS**<br>翻转落地为正中矢状面（内侧视图）；丘脑高亮；第 3 小节视/听/触/味四路信号汇入丘脑，嗅觉箭头绕过<br>标签：感觉中继 Sensory relay · 丘脑—皮层环路 Thalamo-cortical loops | [44] 感觉信息进入皮层前的中继站<br>　 *The relay hub for signals heading to the cortex*<br>[46] 除嗅觉外，几乎所有感觉都先经过这里<br>　 *Nearly every sense except smell passes through here first* |
| S15 | 1:16.8–1:23.2 | 48–51 | 脑区 / 内侧视图 | **下丘脑 HYPOTHALAMUS**<br>切镜推近下丘脑与垂体；第 3 小节激素光点沿垂体柄向下流动<br>标签：体温 Temperature · 饥饿 Hunger · 昼夜节律 Circadian rhythm · 垂体 Pituitary | [48] 仅约 4 克，掌管体温、饥饿与睡眠节律<br>　 *Just ~4 g, it runs temperature, hunger and sleep cycles*<br>[50] 通过垂体，调控全身的激素分泌<br>　 *Through the pituitary, it steers the body's hormones* |
| S16 | 1:23.2–1:29.6 | 52–55 | 脑区 / 内侧视图 | **海马 HIPPOCAMPUS**<br>切镜；海马（投影于内侧颞叶）高亮，形似海马的弯曲结构逐段点亮；第 3 小节“病例卡 H.M. 1953”翻入<br>标签：情景记忆 Episodic memory · 空间导航 Spatial navigation | [52] 把当下的经历写成长期记忆<br>　 *Turns today's experiences into long-term memories*<br>[54] H.M. 双侧海马大部切除后，记不住新经历<br>　 *With most of both hippocampi gone, H.M. formed no new memories* |
| S17 | 1:29.6–1:36.0 | 56–59 | 脑区 / 内侧视图 | **杏仁核 AMYGDALA**<br>切镜；杏仁核高亮，警报环随每拍向外扩散；第 3 小节与海马之间连线闪烁（情绪增强记忆）<br>标签：恐惧 Fear · 威胁侦测 Threat detection · 情绪记忆 Emotional memory | [56] 侦测威胁、触发恐惧的“警报器”<br>　 *The alarm that detects threats and triggers fear*<br>[58] 让带有情绪的事件被记得格外牢<br>　 *It makes emotional events stick in memory* |

### 过渡 · 走向前额叶

| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |
|---|---|---|---|---|---|
| S18 | 1:36.0–1:42.4 | 60–63 | 间奏 / 侧视图 | 间奏：画面回到侧视图并缓慢推向额叶前部，其余脑区渐暗；只有额叶前端呼吸式明灭 | [60] 有一个脑区，与“人之为人”关系最密切<br>　 *One region is most tied to what makes us human*<br>[62] 它最晚发育成熟，一直持续到 20 多岁<br>　 *It is among the last to mature, well into your 20s* |
| S19 | 1:42.4–1:48.8 | 64–67 | 蓄力 / 侧视图 | 蓄力：每小节强拍闪出一个关键词，前额叶区域亮度逐拍上升；第 67 小节和弦每拍重击配合快速推镜，最后半拍黑场 | [64] 计划、专注、克制、抉择<br>　 *Planning, focus, self-control, choice*<br>[66] 都离不开它<br>　 *All of them depend on it* |
| S20 | 1:48.8–1:52.0 | 68–69 | 标题爆点 / 侧视图 | **前额叶皮层 PREFRONTAL CORTEX**<br>全片最大爆点：白闪 + 双层冲击波 + 震屏，“前额叶皮层 / PREFRONTAL CORTEX”砸入，前额叶整体爆亮 | [68] 第二章 · 大脑的指挥中心<br>　 *Chapter 2 · The brain's command centre* |
| S21 | 1:52.0–1:55.2 | 70–71 | 前额叶概览 / 侧视图 | 切镜；侧视图上依次标出初级运动皮层 → 前运动区 → 前额叶皮层三段，箭头指向前方 | [70] 位于额叶前部，运动相关区域之前<br>　 *The front of the frontal lobe, ahead of the motor areas* |
| S22 | 1:55.2–1:58.4 | 72–73 | 前额叶概览 / 侧视图 | 切镜；前额叶发出连线，按拍连接到顶叶（注意）、颞叶/海马（记忆）、杏仁核（情绪） | [72] 统筹注意、记忆与情绪，服务于目标<br>　 *It coordinates attention, memory and emotion toward goals* |
| S23 | 1:58.4–2:01.6 | 74–75 | 亚区地图 / 侧+内侧分屏 | 分屏：左侧视图、右内侧视图；6 个亚区按拍依次亮起并标注缩写 | [74] 它可细分为多个功能亚区<br>　 *It divides into specialised subregions* |

### 第二章 · 前额叶亚区

| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |
|---|---|---|---|---|---|
| S24 | 2:01.6–2:14.4 | 76–83 | 前额叶亚区 / 侧视图 | **背外侧前额叶 DLPFC**（BA 9 · 46）<br>比喻：大脑的工作台 / The brain's workbench<br>切镜大幅推近 DLPFC；第 78 小节 4 个“记忆槽”按拍填入；第 80 小节延迟任务放电图（提示→延迟→反应，延迟期持续放电）；第 82 小节规则切换图标 | [76] 位于额中回，对应布罗德曼 9 区与 46 区<br>　 *Middle frontal gyrus, Brodmann areas 9 and 46*<br>[78] 工作记忆：在脑中暂存并加工信息<br>　 *Working memory: holding and working with information*<br>[80] 延迟任务中，神经元在等待期持续放电<br>　 *In delay tasks, its neurons keep firing through the wait*<br>[82] 认知控制：制定计划，按规则切换任务<br>　 *Cognitive control: making plans and switching rules* |
| S25 | 2:14.4–2:27.2 | 84–91 | 前额叶亚区 / 侧视图 | **腹外侧前额叶 VLPFC**（BA 44 · 45 · 47）<br>比喻：大脑的刹车 / The brain's brake<br>切镜到 VLPFC；第 86 小节停止信号任务：GO 箭头冲出 → STOP 信号亮起 → 反应被截停；第 88 小节布洛卡区（44/45）单独描边 | [84] 位于额下回，紧邻外侧裂<br>　 *Inferior frontal gyrus, just above the lateral fissure*<br>[86] 右侧额下回：叫停冲动，抑制反应<br>　 *Right inferior frontal gyrus: stopping impulsive responses*<br>[88] 左侧 44/45 区即布洛卡区，负责言语产生<br>　 *Left areas 44/45 form Broca's area, for speech production*<br>[90] 还帮助从记忆中挑选、提取所需信息<br>　 *It also selects and retrieves what you need from memory* |
| S26 | 2:27.2–2:40.0 | 92–99 | 前额叶亚区 / 侧视图 | **额极 FRONTAL POLE**（BA 10）<br>比喻：给目标夹上书签 / A bookmark for your goals<br>切镜到额极；第 94 小节分支任务图：主目标挂起（书签）→ 子任务 → 返回；第 96 小节信心刻度条；最后一拍翻转到内侧视图 | [92] 前额叶的最前端，在人类中相对更大<br>　 *The very tip of the PFC, relatively enlarged in humans*<br>[94] 挂起主目标，先处理子任务，再切回来<br>　 *It parks a main goal, handles a subtask, then returns*<br>[96] 元认知：评估“我有多确定”<br>　 *Metacognition: judging how sure you are*<br>[98] 权衡探索新选项，还是利用旧经验<br>　 *Weighing exploring the new against exploiting the known* |
| S27 | 2:40.0–2:52.8 | 100–107 | 前额叶亚区 / 内侧视图 | **眶额皮层 OFC**（BA 11 · 13 · 47/12）<br>比喻：大脑的估价师 / The brain's appraiser<br>翻转落地为内侧视图并推近额叶底面；眼眶位置以虚线弧标出；第 102 小节 A/B 两个选项价值条按拍升降；第 104 小节价值反转 | [100] 位于额叶底面，就在眼眶上方<br>　 *On the frontal lobe's underside, right above the eye sockets*<br>[102] 计算奖励价值：这对我值多少？<br>　 *Computes reward value: what is this worth to me?*<br>[104] 规则一变，迅速更新预期（逆转学习）<br>　 *Rapidly updates when rules flip: reversal learning*<br>[106] 嗅觉与味觉在此汇聚，形成“美味”的感受<br>　 *Smell and taste converge here into the pleasure of flavour* |
| S28 | 2:52.8–3:05.6 | 108–115 | 前额叶亚区 / 内侧视图 | **腹内侧前额叶 VMPFC**（BA 10m · 14 · 25 · 32）<br>比喻：大脑的“直觉”顾问 / The brain's gut-feeling advisor<br>切镜到 VMPFC；第 110 小节“1848”大字 + 铁棍沿盖奇损伤轨迹贯穿额叶（重击帧）；第 112 小节身体信号曲线流向 VMPFC | [108] 位于前额叶内侧下部，与内侧 OFC 部分重叠<br>　 *Lower medial PFC, overlapping with the medial OFC*<br>[110] 1848 年，铁棍贯穿盖奇头颅，他从此性情大变<br>　 *1848: an iron rod changed Phineas Gage's personality*<br>[112] 躯体标记假说：情绪信号引导决策<br>　 *Somatic marker hypothesis: emotional signals guide choices*<br>[114] 还参与调节恐惧，平复负面情绪<br>　 *It also helps regulate fear and calm negative emotion* |
| S29 | 3:05.6–3:18.4 | 116–123 | 前额叶亚区 / 内侧视图 | **前扣带皮层 ACC**（BA 24 · 32 · 33）<br>比喻：大脑的纠错雷达 / The brain's error radar<br>切镜到 ACC（胼胝体膝部周围）；第 118 小节侧翼任务箭头“← ← → ← ←”中间箭头冲突闪烁；第 120 小节脑电波形在错误后约 100 ms 出现负向波谷<br>【争议】严格说属扣带皮层，常被归入内侧前额叶网络 | [116] 环绕胼胝体前部，常被归入内侧前额叶<br>　 *Curves around the front of the corpus callosum*<br>[118] 冲突监测：察觉“冲动”与“目标”打架<br>　 *Conflict monitoring: noticing when impulse and goal collide*<br>[120] 一出错，脑电立刻出现“错误相关负波”<br>　 *Slip up, and an error signal (the ERN) fires within ~100 ms*<br>[122] 还编码疼痛有多“难受”，而不是痛在哪<br>　 *It also encodes how much pain hurts, not where it hurts* |

### 高潮与尾声

| 镜头 | 时间 | 小节 | 类型 / 视图 | 画面与卡点 | 字幕（中 / 英） |
|---|---|---|---|---|---|
| S30 | 3:18.4–3:21.6 | 124–125 | 高潮快切 / 侧+内侧分屏 | 高潮快切：每一拍切到一个亚区 + 关键词（共 6 拍），第 7~8 拍六区同时亮起 | [124] 六个亚区，各司其职<br>　 *Six subregions, each with its own job* |
| S31 | 3:21.6–3:24.8 | 126–127 | 高潮·网络 / 侧+内侧分屏 | 六个亚区之间按 8 分音符依次拉出光线，形成网络 | [126] 但它们并非单打独斗，而是组成网络<br>　 *But none works alone: they form networks* |
| S32 | 3:24.8–3:28.0 | 128–129 | 高潮·深部连接 / 内侧视图 | 内侧视图：前额叶向杏仁核、海马、丘脑射出光束，按拍点亮第一章的深部结构 | [128] 并与杏仁核、海马、丘脑紧密相连<br>　 *And they are wired to the amygdala, hippocampus and thalamus* |
| S33 | 3:28.0–3:31.2 | 130–131 | 终极重击 / 侧视图 | **认识大脑，就是认识自己 KNOW YOUR BRAIN, KNOW YOURSELF**<br>终极重击：全脑所有区域同时爆亮 + 冲击波，标语砸入 | [130] 认识大脑，就是认识自己<br>　 *Know your brain, know yourself* |
| S34 | 3:31.2–3:37.6 | 132–135 | 尾声 / — | 尾声：参考文献滚动列表 + 片名，画面随音乐淡出 | [132] 图示已简化，非精确解剖比例<br>　 *Diagrams are simplified, not to anatomical scale*<br>[134] 谢谢观看<br>　 *Thanks for watching* |

## 科学准确性说明

- 【争议】**ACC 的归属**：前扣带皮层严格说属扣带皮层（边缘叶），但在功能研究中常与内侧前额叶一起讨论，片中以小字注明。
- 【争议】**VMPFC 与内侧 OFC 的边界**：两者在文献中定义重叠，片中明确说“部分重叠”。
- 【争议】**右侧额下回与“抑制”**：Aron 等认为 rIFG 专门实现反应抑制；Hampshire & Sharp (2015) 认为它更多反映注意控制。片中采用主流的“叫停冲动”表述。
- 【争议】**盖奇的损伤范围**：Damasio 等 (1994) 重建为双侧 VMPFC 损伤；Ratiu 等 (2004)、Van Horn 等 (2012) 认为主要是左侧。片中只说“铁棍贯穿头颅、性情大变”，不声称双侧。
- 【争议】**躯体标记假说**：爱荷华赌博任务证据有替代解释（Dunn, Dalgleish & Lawrence, 2006），片中称“假说”。
- 【待确认】“20 多岁才成熟”是对纵向 MRI 研究（Gogtay 2004 等）的通俗概括，不同个体与指标差异较大。
- 海马、杏仁核不在正中矢状面上，片中以“投影”方式画在内侧视图里，是教学示意。

## 参考文献

- Azevedo F.A.C. et al. (2009). Equal numbers of neuronal and nonneuronal cells make the human brain an isometrically scaled-up primate brain. J Comp Neurol 513:532–541.
- Ungerleider L.G. & Mishkin M. (1982). Two cortical visual systems. In Analysis of Visual Behavior, MIT Press.
- Scoville W.B. & Milner B. (1957). Loss of recent memory after bilateral hippocampal lesions. J Neurol Neurosurg Psychiatry 20:11–21.
- O'Keefe J. & Dostrovsky J. (1971). The hippocampus as a spatial map. Brain Res 34:171–175.
- Gogtay N. et al. (2004). Dynamic mapping of human cortical development during childhood through early adulthood. PNAS 101:8174–8179.
- Miller E.K. & Cohen J.D. (2001). An integrative theory of prefrontal cortex function. Annu Rev Neurosci 24:167–202.
- Funahashi S., Bruce C.J. & Goldman-Rakic P.S. (1989). Mnemonic coding of visual space in the monkey's dorsolateral prefrontal cortex. J Neurophysiol 61:331–349.
- Aron A.R., Robbins T.W. & Poldrack R.A. (2004; 2014). Inhibition and the right inferior frontal cortex. Trends Cogn Sci 8:170–177; 18:177–185.
- Badre D. & Wagner A.D. (2007). Left ventrolateral prefrontal cortex and the cognitive control of memory. Neuropsychologia 45:2883–2901.
- Semendeferi K. et al. (2001). Prefrontal cortex in humans and apes: a comparative study of area 10. Am J Phys Anthropol 114:224–241.
- Koechlin E. et al. (1999). The role of the anterior prefrontal cortex in human cognition. Nature 399:148–151.
- Fleming S.M. et al. (2010). Relating introspective accuracy to individual differences in brain structure. Science 329:1541–1543.
- Daw N.D. et al. (2006). Cortical substrates for exploratory decisions in humans. Nature 441:876–879.
- Padoa-Schioppa C. & Assad J.A. (2006). Neurons in the orbitofrontal cortex encode economic value. Nature 441:223–226.
- Rolls E.T. (2004). The functions of the orbitofrontal cortex. Brain Cogn 55:11–29.
- de Araujo I.E.T. et al. (2003). Taste-olfactory convergence, and the representation of the pleasantness of flavour, in the human brain. Eur J Neurosci 18:2059–2068.
- Harlow J.M. (1868). Recovery from the passage of an iron bar through the head. Publ Mass Med Soc 2:327–347.
- Damasio H. et al. (1994). The return of Phineas Gage: clues about the brain from the skull of a famous patient. Science 264:1102–1105.
- Bechara A. et al. (1994). Insensitivity to future consequences following damage to human prefrontal cortex. Cognition 50:7–15.
- Phelps E.A. et al. (2004). Extinction learning in humans: role of the amygdala and vmPFC. Neuron 43:897–905.
- Botvinick M.M. et al. (2001). Conflict monitoring and cognitive control. Psychol Rev 108:624–652.
- Gehring W.J. et al. (1993). A neural system for error detection and compensation. Psychol Sci 4:385–390.
- Rainville P. et al. (1997). Pain affect encoded in human anterior cingulate but not somatosensory cortex. Science 277:968–971.

## 字幕阅读速度自检

| 镜头 | 小节 | 中文 字/秒 | 英文 字符/秒 |
|---|---|---|---|
| S01 | 0 | 4.4 | 12.8 |
| S02 | 2 | 2.8 | 7.8 |
| S03 | 4 | 3.8 | 11.6 |
| S04 | 6 | 4.4 | 14.7 |
| S05 | 8 | 4.1 | 12.5 |
| S05 | 10 | 2.2 | 7.8 |
| S06 | 12 | 2.8 | 13.4 |
| S06 | 14 | 4.1 | 10.9 |
| S07 | 16 | 3.1 | 10.6 |
| S07 | 18 | 2.8 | 12.5 |
| S08 | 20 | 4.1 | 14.7 |
| S08 | 22 | 5.0 | 17.2 |
| S09 | 24 | 4.1 | 12.5 |
| S09 | 26 | 5.3 | 14.7 |
| S10 | 28 | 4.4 | 15.6 |
| S10 | 30 | 5.3 | 17.8 |
| S11 | 32 | 4.7 | 15.9 |
| S11 | 34 | 6.6 | 17.8 |
| S12 | 36 | 5.0 | 16.9 |
| S12 | 38 | 6.2 | 15.0 |
| S13 | 40 | 5.0 | 17.5 |
| S13 | 42 | 3.8 | 16.9 |
| S14 | 44 | 4.1 | 14.7 |
| S14 | 46 | 5.3 | 17.8 |
| S15 | 48 | 5.3 | 17.2 |
| S15 | 50 | 4.4 | 16.2 |
| S16 | 52 | 3.8 | 15.3 |
| S16 | 54 | 6.2 | 19.4 |
| S17 | 56 | 4.7 | 15.0 |
| S17 | 58 | 4.4 | 12.8 |
| S18 | 60 | 5.6 | 14.4 |
| S18 | 62 | 5.3 | 15.6 |
| S19 | 64 | 3.4 | 11.6 |
| S19 | 66 | 1.6 | 7.5 |
| S20 | 68 | 3.4 | 11.9 |
| S21 | 70 | 4.7 | 17.2 |
| S22 | 72 | 5.0 | 17.8 |
| S23 | 74 | 3.4 | 11.9 |
| S24 | 76 | 5.6 | 14.1 |
| S24 | 78 | 4.7 | 16.2 |
| S24 | 80 | 5.3 | 17.5 |
| S24 | 82 | 5.3 | 15.9 |
| S25 | 84 | 3.4 | 16.9 |
| S25 | 86 | 4.7 | 18.1 |
| S25 | 88 | 6.2 | 17.8 |
| S25 | 90 | 5.0 | 17.2 |
| S26 | 92 | 5.0 | 16.9 |
| S26 | 94 | 5.3 | 16.6 |
| S26 | 96 | 4.1 | 12.2 |
| S26 | 98 | 4.7 | 17.2 |
| S27 | 100 | 4.1 | 18.8 |
| S27 | 102 | 4.4 | 15.0 |
| S27 | 104 | 5.3 | 15.6 |
| S27 | 106 | 5.9 | 18.1 |
| S28 | 108 | 6.2 | 15.3 |
| S28 | 110 | 6.9 | 16.2 |
| S28 | 112 | 4.7 | 18.1 |
| S28 | 114 | 4.4 | 16.6 |
| S29 | 116 | 5.3 | 14.4 |
| S29 | 118 | 5.6 | 18.4 |
| S29 | 120 | 5.6 | 18.4 |
| S29 | 122 | 5.6 | 17.2 |
| S30 | 124 | 2.8 | 11.6 |
| S31 | 126 | 5.0 | 12.5 |
| S32 | 128 | 4.7 | 18.8 |
| S33 | 130 | 3.4 | 9.4 |
| S34 | 132 | 4.1 | 15.0 |
| S34 | 134 | 1.2 | 5.9 |
