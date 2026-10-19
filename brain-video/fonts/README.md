# 字体

成片用到的四个字体家族都来自 Google Fonts，均为 SIL Open Font License 1.1（全文见 [`OFL.txt`](OFL.txt)），可自由使用、嵌入和再分发。

| 文件 | 字体 | 用途 |
|---|---|---|
| `NotoSansSC-500/700/900.woff2` | Noto Sans SC（思源黑体） | 中文标题、字幕、标签 |
| `BarlowCondensed-600/800.woff2` | Barlow Condensed | 英文大标题、章节编号 |
| `Inter-400/600.woff2` | Inter | 英文字幕与说明 |
| `JetBrainsMono-500.woff2` | JetBrains Mono | HUD、文献引用等等宽小字 |

这些文件是**子集**：只含片中实际出现的字符，所以中文字体每个只有约 100 KB。字幕或标题里加入新汉字后，运行下面的命令重新生成子集（需要能访问 fonts.googleapis.com）：

```bash
python3 tools/fetch_fonts.py
```

脚本会收集 `timeline.json` 与 `render/*.js` 中的所有字符，并通过 Google Fonts 的 `text=` 参数下载只含这些字符的字体文件。
