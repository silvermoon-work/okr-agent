# 完成与终态同步

## completion-unsynchronized

全部前序检查点通过后，reducer 必须建立 completed 事实，最终事件及证据已经提交，
工作区无改动且 HEAD 等于观察到的 primary tip。否则不能宣称完成。
前序检查通过但状态映射不一致属于内部执行错误，不可默认通过。
