import { Markdown } from "./markdown.js";
import type { CheckBundleSpec, CheckerDefinition } from "./spec.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function Parameters({
  parameter,
}: {
  parameter: CheckerDefinition["parameter"];
}) {
  const properties = isRecord(parameter.schema.properties)
    ? Object.entries(parameter.schema.properties)
    : [];
  const required = Array.isArray(parameter.schema.required)
    ? parameter.schema.required
    : [];
  return (
    <section>
      <h4>Parameters</h4>
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
      <h5>语义前置假设</h5>
      {parameter.preconditions.length ? (
        <ul className="cbv-preconditions">
          {parameter.preconditions.map((text) => (
            <li key={text}>
              <Markdown text={text} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="cbv-caption">未声明语义前置假设。</p>
      )}
    </section>
  );
}

export function ContractDetails({
  spec,
  selected,
  navigate,
}: {
  spec: CheckBundleSpec;
  selected: string;
  navigate: (checker: string) => void;
}) {
  const checker = spec.checkers[selected]!;
  const parents = Object.entries(spec.checkers).flatMap(
    ([parent, definition]) =>
      definition.children.flatMap((edge, index) =>
        edge.checker === selected ? [{ parent, edge, index }] : [],
      ),
  );
  return (
    <>
      <Markdown text={checker.description} />
      <Parameters parameter={checker.parameter} />
      <section>
        <h4>Problems</h4>
        {checker.rules.length === 0 && (
          <p className="cbv-caption">未声明本地规则。</p>
        )}
        {checker.rules.map((rule, index) => (
          <div className="cbv-rule" key={index}>
            <Markdown text={rule.description} />
            {rule.problems.length ? (
              <div
                className="cbv-table-scroll"
                tabIndex={0}
                role="region"
                aria-label={`规则 ${String(index + 1)} 的问题`}
              >
                <table className="cbv-problems">
                  <thead>
                    <tr>
                      <th scope="col">问题码</th>
                      <th scope="col">说明</th>
                      <th scope="col">触发条件</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rule.problems.map((problem, problemIndex) => (
                      <tr key={problemIndex}>
                        <th scope="row">
                          <code>{problem.code}</code>
                        </th>
                        <td>
                          <Markdown text={problem.description} />
                        </td>
                        <td>
                          <Markdown text={problem.when} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="cbv-caption">此规则未声明问题。</p>
            )}
          </div>
        ))}
      </section>
      {checker.children.length > 0 && (
        <section>
          <h4>Children</h4>
          <p className="cbv-caption">
            不通过时只返回问题，不展开 children；本节点通过不代表后代全部通过。
          </p>
          {checker.children.map((child, index) => (
            <div className="cbv-child" key={index}>
              <div>
                <button
                  type="button"
                  className="cbv-link"
                  onClick={() => {
                    navigate(child.checker);
                  }}
                >
                  {spec.checkers[child.checker]!.title}
                </button>
                <code className="cbv-child-id">{child.checker}</code>
              </div>
              <dl>
                <dt>展开条件</dt>
                <dd>
                  <Markdown text={child.when} />
                </dd>
                <dt>参数构造</dt>
                <dd>
                  <Markdown text={child.parameter} />
                </dd>
                {child.forEach && (
                  <>
                    <dt>按对象展开</dt>
                    <dd>
                      <Markdown text={child.forEach} />
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ))}
        </section>
      )}
      {parents.length > 0 && (
        <section className="cbv-parents">
          <h4>Parents</h4>
          <div
            className="cbv-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="父节点展开关系"
          >
            <table className="cbv-parents-table">
              <thead>
                <tr>
                  <th scope="col">父节点</th>
                  <th scope="col">展开条件</th>
                  <th scope="col">参数构造</th>
                </tr>
              </thead>
              <tbody>
                {parents.map(({ parent, edge, index }) => (
                  <tr key={`${parent}/${String(index)}`}>
                    <th scope="row">
                      <button
                        type="button"
                        className="cbv-link"
                        onClick={() => {
                          navigate(parent);
                        }}
                      >
                        {spec.checkers[parent]!.title}
                      </button>
                      <code className="cbv-child-id">{parent}</code>
                    </th>
                    <td>
                      <Markdown text={edge.when} />
                      {edge.forEach && (
                        <>
                          <span className="cbv-caption">按对象展开</span>
                          <Markdown text={edge.forEach} />
                        </>
                      )}
                    </td>
                    <td>
                      <Markdown text={edge.parameter} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
