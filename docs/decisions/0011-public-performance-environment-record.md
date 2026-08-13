# ADR 0011：公共性能环境记录

- 状态：accepted
- 日期：2026-08-13
- 相关：[AD-500：可验证的性能证据](../adoption-issues/AD-500-performance.md)
- 前置：[ADR 0008：公共性能证据范围](0008-public-performance-evidence-scope.md)、[ADR
  0009：公共性能测量方法](0009-public-performance-measurement-methodology.md)、[ADR
  0010：公共性能表述的非承诺边界](0010-public-performance-non-guarantees.md)

## 背景

公共性能数字只有关联到具体运行的环境、实现版本和数据规模时，读者才能判断它是否
可复跑或可比较。此前的 ADR 分别规定了证据类别、采样协议和非承诺边界，但尚未规定
这些条件的机器可读记录格式。

本决策只定义一次运行随结果保存的元数据封套。它不产生基准、统计值或公开页面。

## 决策

每个按 ADR 0009 取得的结果序列必须附有一份 JSON 环境记录。记录使用下列顶层
字段；字段不得因暂不适用而省略，必须写入 `null` 或明确的 `"unknown"`。数值使用
表中单位，时间一律使用 ISO 8601 UTC。

| 字段                  | 必填内容                                                                             | 记录目的                         |
| --------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| `schema`              | 固定为 `"einfach.performance-environment/v1"`                                        | 让读取者识别字段语义。           |
| `runId`、`capturedAt` | 唯一运行标识；记录生成时间                                                           | 将环境与一组原始样本关联。       |
| `implementation`      | `sourceRevision`、`buildProfile`、`packageVersions`                                  | 固定被测实现和构建输入。         |
| `machine`             | 操作系统名称/版本/架构；CPU 型号和逻辑核心数；内存 GiB；电源状态；显示刷新率 Hz      | 说明执行与渲染硬件条件。         |
| `browser`             | 浏览器名称/版本；引擎名称/版本；headless 状态；viewport CSS 像素；`devicePixelRatio` | 说明浏览器和显示配置。           |
| `conditions`          | 缓存状态；网络配置；后台负载说明                                                     | 记录会影响一次运行的外部条件。   |
| `workload`            | `scenarioId`、`scenarioRevision`、`dataScaleId`、`dataDefinition`                    | 固定场景与数据规模的可识别引用。 |

`packageVersions` 是名称到版本字符串的对象，至少包含被测入口包及其运行时后端；没有
包版本的源码运行使用 `"source"`。`dataDefinition` 是数据夹具、生成器或工作簿内容的
不可变版本标识，而不是把数据档位、生成算法或夹具本身复制进本记录。

`browser` 对纯包体积运行可以为 `null`，但 `implementation`、`machine`、`conditions`
和 `workload` 仍必须出现。纯包体积运行的 `workload` 各项填写 `"not-applicable"`；
`conditions.network` 也填写 `"not-applicable"`。这样“不适用”与“忘记记录”可以区分。

### 规范模板

```json
{
  "schema": "einfach.performance-environment/v1",
  "runId": "scroll-large-v1-2026-08-13T10:00:00Z",
  "capturedAt": "2026-08-13T10:00:00Z",
  "implementation": {
    "sourceRevision": "<git commit>",
    "buildProfile": "production",
    "packageVersions": {
      "@einfach/solid-excel": "<version>"
    }
  },
  "machine": {
    "os": { "name": "<name>", "version": "<version>", "architecture": "<arch>" },
    "cpu": { "model": "<model>", "logicalCores": 8 },
    "memoryGiB": 16,
    "powerState": "ac",
    "displayRefreshHz": 60
  },
  "browser": {
    "name": "<name>",
    "version": "<version>",
    "engine": { "name": "<name>", "version": "<version>" },
    "headless": false,
    "viewportCssPx": { "width": 1440, "height": 900 },
    "devicePixelRatio": 2
  },
  "conditions": {
    "cacheState": "cold",
    "network": "offline",
    "backgroundLoad": "no-known-competing-workload"
  },
  "workload": {
    "scenarioId": "scroll-large",
    "scenarioRevision": "v1",
    "dataScaleId": "large-v1",
    "dataDefinition": "<fixture-or-generator revision>"
  }
}
```

占位符只能存在于模板中，不能出现在实际记录。实际记录必须使用可观察值；无法取得的
值填写 `"unknown"` 并说明原因。所有文本值以 UTF-8 保存，版本值保留工具报告的完整
字符串，避免把不同修订误归为同一环境。

## 比较规则

两个结果序列只有在相同 `schema`、实现版本、场景修订、数据定义和统计规则下，才可
作为直接比较的候选。机器、浏览器或条件字段不同不会使记录无效，但结果页必须显式
展示差异，不能将它们合并成单一序列。

环境记录描述一次运行的条件，不定义哪些条件构成保证或怎样解释数字；该边界仍由
ADR 0010 负责。它也不定义样本、预热、统计量、数据生成、基准脚本、原始样本导出或
结果发布；这些工作仍分别属于 AD-502、AD-509、AD-510 和 AD-515。

## 后果

后续基准实现必须能生成或要求填入此格式的完整记录，结果发布时必须让读者取得与
结果序列相配的记录。AD-515 就绪前，此 ADR 仅提供记录契约，不能被视为已公开或已
独立验证的性能证据。
