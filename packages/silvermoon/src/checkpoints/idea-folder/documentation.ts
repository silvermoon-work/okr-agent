import type { CheckpointDocumentation } from "@silvermoon-work/check-task-sdk";

export const documentation = {
  id: "idea-folder",
  title: "Idea 数据有效",
  description:
    "检查当前 Idea 的协议数据、身份及事件历史有效，并推导后续阶段共用的状态。",
  instructions: `你需要为当前选中的 Idea 建立符合下列 Rules 的可信事实，不能把其他 Idea 的异常混入本检查点。固定 Check CID 缺失、不可信或不支持时按执行错误处理，不猜测最新版替代，也不自动恢复已放弃的 Idea。`,
  rules: [
    {
      code: "idea-folder-identity-immutable",
      description:
        "当前选中的 Idea 必须保留 primary 中已记录 bootstrap 的 version、id、checkCid 和 createdAt 字段值；不校验其他 Idea 的身份，JSON 排版或字段顺序变化不构成身份变化。",
    },
    {
      code: "idea-folder-event-history-append-only",
      description:
        "当前选中的 Idea 必须保留 primary 中已记录事件的原始 UTF-8 字节的准确前缀，只能追加；不校验其他 Idea 的事件历史。",
    },
    {
      code: "idea-folder-data-valid",
      description:
        "Idea 必须能够唯一解析，bootstrap、事件、文件树、用例索引及固定 Check CID 绑定必须符合现有协议、结构、安全与容量约束。",
    },
    {
      code: "idea-folder-active",
      description:
        "Idea 必须处于有效推进状态；显式放弃后，只有授权且有效的 resume 事件才能恢复，Agent 或 CLI 不得自动代写。",
    },
  ],
  output: {
    description:
      "提供从当前内容、有效 events 和准确 primary 快照推导的 Idea 事实，供后续阶段读取同一次 reduce 的结果，不再各自解释事件或维护另一套状态。 CLI 使用 `silvermoon check-idea <idea> --json` 观察； 生命周期 Problem 的 brief 包含 level、可选 next、revisions、 eventDigest、primary 和 subject。前置检查失败时只返回前置问题， 不伪造领域状态；本 Task 全部通过才表示完成。",
    fields: [
      {
        name: "state",
        description:
          "执行期 reducer 结果：revisions 是当前内容版本，signed 是匹配当前版本及前序向量的 signOff 事件 ID，implementation/deployment 是有效验证批次集合的摘要，不是事件 ID。level 表示首个未达成的领域阶段，不是已完成阶段；synchronization 时 next 表示等待同步的共识阶段。阶段键保持 requirements、research、technical、cases、tests。 signed 只包含 reducer 已走到的有效签署；前序阻塞时不能据后序键缺失单独判断后序阶段。",
      },
      {
        name: "brief",
        description:
          "受控的事实摘要字符串，供失败规则的 brief 使用；包含归约状态与版本事实，不包含原始文档全文或整个 Context。",
      },
    ],
  },
} as const satisfies CheckpointDocumentation;
