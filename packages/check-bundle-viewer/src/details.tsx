import { Markdown } from "./markdown.js";
import type { CheckBundleSpec, CheckpointDefinition } from "./spec.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function TaskOverview({
  description,
  parameter,
}: {
  description: string;
  parameter: CheckBundleSpec["parameter"];
}) {
  const properties = isRecord(parameter.schema.properties)
    ? Object.entries(parameter.schema.properties)
    : [];
  const required = Array.isArray(parameter.schema.required)
    ? parameter.schema.required
    : [];
  return (
    <>
      <Markdown text={description} />
      <section>
        <h4>Parameters</h4>
        <p className="cbv-caption">
          Check Task Target · 所有检查点共享同一任务参数。
        </p>
        {properties.length ? (
          <div
            className="cbv-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="参数字段列表"
          >
            <table className="cbv-fields">
              <thead>
                <tr>
                  <th scope="col">参数</th>
                  <th scope="col">类型</th>
                  <th scope="col">说明</th>
                </tr>
              </thead>
              <tbody>
                {properties.map(([name, value]) => {
                  const field = isRecord(value) ? value : {};
                  const type =
                    typeof field.type === "string" ? field.type : "见 Schema";
                  return (
                    <tr key={name}>
                      <th scope="row">
                        <code>{name}</code>
                        <span className="cbv-field-presence">
                          {required.includes(name) ? "必填" : "可选"}
                        </span>
                      </th>
                      <td>
                        <code>{type}</code>
                      </td>
                      <td>
                        {typeof field.description === "string" ? (
                          <Markdown text={field.description} />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cbv-caption">
            此 Schema 未直接列出字段，请查看完整 JSON Schema。
          </p>
        )}
        <p className="cbv-caption">
          字段列表仅反映当前 properties / required 声明，不展开 $ref 或组合
          Schema；完整 Schema 为准。
        </p>
        <details>
          <summary>JSON Schema</summary>
          <pre>
            <code>{JSON.stringify(parameter.schema, null, 2)}</code>
          </pre>
        </details>
      </section>
    </>
  );
}

export function ContractDetails({
  checkpoint,
}: {
  checkpoint: CheckpointDefinition;
}) {
  return (
    <>
      <Markdown text={checkpoint.description} />
      <section>
        <h4>Instructions</h4>
        <Markdown text={checkpoint.instructions} />
      </section>
      <section>
        <h4>Rules</h4>
        <div
          className="cbv-table-scroll"
          tabIndex={0}
          role="region"
          aria-label="检查点规则"
        >
          <table className="cbv-rules">
            <thead>
              <tr>
                <th scope="col">规则码</th>
                <th scope="col">说明</th>
              </tr>
            </thead>
            <tbody>
              {checkpoint.rules.map((rule) => (
                <tr key={rule.code}>
                  <th scope="row">
                    <code>{rule.code}</code>
                  </th>
                  <td>
                    <Markdown text={rule.description} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h4>成功 Context 输出</h4>
        <Markdown text={checkpoint.output.description} />
        {checkpoint.output.fields && (
          <div
            className="cbv-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="成功输出字段"
          >
            <table className="cbv-fields">
              <thead>
                <tr>
                  <th scope="col">字段</th>
                  <th scope="col">含义与使用</th>
                </tr>
              </thead>
              <tbody>
                {checkpoint.output.fields.map((field) => (
                  <tr key={field.name}>
                    <th scope="row">
                      <code>{field.name}</code>
                    </th>
                    <td>
                      <Markdown text={field.description} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="cbv-caption">
          仅描述检查点成功时供本次执行内 Context 使用的值；不是输出 JSON
          Schema， 不验证或序列化运行时输出，也不代表已经执行。
        </p>
      </section>
    </>
  );
}
