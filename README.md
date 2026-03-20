# 工程详情 PDF 导出扩展

用于在立创 EDA Pro 中读取工程详细信息，并在界面中按需勾选后导出 PDF。

## 超简版说明

1. 打开页面，点击“刷新数据”读取当前工程信息。
2. 勾选需要导出的字段，支持拖拽调整顺序。
3. 在右侧预览确认内容后，点击“下载 PDF”。

## 界面截图

![主界面截图](/docs/1.png)
![字段勾选与排序截图](/docs/2.png)
![PDF 预览截图](/docs/3.png)

## 界面功能

- 一键读取当前工程数据，自动按分类展示
- 分类内支持全选/取消勾选字段
- 支持拖拽调整字段顺序
- 支持分类上下移动与折叠/展开
- 右侧实时 PDF 预览
- 支持选择本地字体用于 PDF 输出
- 点击按钮直接下载 PDF

## 页面使用流程

1. 打开扩展页面后点击“刷新数据”。
2. 在左侧按分类勾选你要导出的字段。
3. 按需拖拽字段顺序，或调整分类顺序。
4. 在右侧预览区确认 PDF 内容。
5. 点击“下载 PDF”导出文件。

## 导出内容示例

- EDA 环境信息
- 工程师信息
- 工程信息
- 原理图信息
- PCB 统计信息

## 环境要求

- Node.js `>= 20.5.0`
- `pnpm`

## 本地开发

```bash
pnpm install
pnpm run dev
```

## 打包

```bash
pnpm run build
```

构建完成后会在 `build/dist` 产出 `.eext` 文件，命名规则为：

```text
{extension.name}_v{extension.version}.eext
```

## 开发调试（可选）

`build/check-lceda-auto-install.js` 是开发调试辅助脚本，用于监听新构建产物并自动导入扩展。  
普通用户使用扩展功能不需要执行该脚本。

```bash
pnpm run check-install
```

可选参数示例：

```bash
pnpm run check-install -- --browser chrome
pnpm run check-install -- --browser chromium --dist-dir ./custom-dist
pnpm run check-install -- --browser msedge --user-data-dir ./build/.edge-cdp-profile --cdp-port 9333
```
