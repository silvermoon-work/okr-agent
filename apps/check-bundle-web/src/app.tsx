import { useState } from "react";
import { CheckBundleViewer } from "@silvermoon-work/check-bundle-viewer";
import { fixtures } from "./fixtures.js";

export function App() {
  const [fixtureId, setFixtureId] = useState("discussion");
  const fixture = fixtures.find((item) => item.id === fixtureId)!;
  return (
    <main>
      <header className="workbench-header">
        <div>
          <h1>Check 定义工作台</h1>
          <p>用于检查设计讨论，不展示执行结果</p>
        </div>
        <label>
          选择示例
          <select
            value={fixtureId}
            onChange={(event) => {
              setFixtureId(event.target.value);
            }}
          >
            {fixtures.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <CheckBundleViewer spec={fixture.spec} />
      <footer>
        所有检查点共享任务参数，按顺序定义为通过继续、不通过即停止。此页面仅展示定义，不连接执行器或远程服务。
      </footer>
    </main>
  );
}
