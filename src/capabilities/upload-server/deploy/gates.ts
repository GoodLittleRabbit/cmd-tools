/**
 * 发版并行安全闸门。
 *
 * 为什么需要：
 * - **构建闸（按本地 dir）**：Maven 不支持同一工作区并发构建。`-am` 会把共享
 *   依赖（framework starters）一起编译，两个 mvn 同时写同一批 `target/`，
 *   可能产出交错的 jar——平时全 up-to-date 秒过看不出，真重编时才炸。
 * - **远端钩子闸（按服务器 host）**：after 钩子里的 `docker build`（legacy
 *   builder）中间缓存层是 dangling 镜像，deploy.sh 收尾的 `docker image prune`
 *   会把并行中另一个构建的在途层删掉；同机同时 build 也争抢 CPU/内存。
 *   同一服务器一次只跑一个钩子，先完成者 prune 时后来者还没开工，删不到。
 *
 * 排队期间不阻塞其他阶段：build 闸只包 build 步；upload/remote 照旧并行，
 * after 由钩子闸按到达顺序串行。
 */

type Gate = {
  /** 等到轮到自己（返回时已持有） */
  wait: Promise<void>
  /** 释放，放行下一个 */
  release: () => void
}

type Acquire = (key: string) => Gate

function createGateMap(): Acquire {
  const tails = new Map<string, Promise<void>>()
  return (key: string): Gate => {
    const prev = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const held = new Promise<void>((resolveHold) => {
      release = resolveHold
    })
    // 本轮完全结束 = 先等上一轮，再等持有者释放
    tails.set(key, prev.then(() => held))
    return { wait: prev.then(() => {}), release }
  }
}

// 进程内共享：同一次 cmd-tools 运行里多次发版批次也互斥
const buildGates: Acquire = createGateMap()
const remoteHookGates: Acquire = createGateMap()

/** 同 dir 构建互斥（进程内）。fn 结束（含抛错）自动放行下一个。 */
export async function withBuildGate<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const gate = buildGates(dir)
  await gate.wait
  try {
    return await fn()
  } finally {
    gate.release()
  }
}

/** 同服务器远端钩子互斥（进程内）。fn 结束（含抛错）自动放行。 */
export async function withRemoteHookGate<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const gate = remoteHookGates(host)
  await gate.wait
  try {
    return await fn()
  } finally {
    gate.release()
  }
}
