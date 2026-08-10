/**
 * usePolling - 轮询执行器（in-flight 守卫 + 失败指数退避）
 *
 * 解决性能审计 P0-2：慢请求叠加 + 断网时固定间隔空转轰炸
 *  - in-flight 守卫：上一轮未结束时不启动新一轮，绝不叠加请求
 *  - 失败指数退避：连续失败时 base → base×2 → … 封顶 maxDelayMs
 *    （30s 基线为 30s → 60s → 5m；15s 基线为 15s → 30s → 5m）
 *  - 成功一次即重置失败计数，恢复常规间隔
 *  - immediate=true（默认）挂载即执行一次
 */
import { useEffect, useRef } from 'react'

export interface UsePollingOptions {
  /** 挂载后立即执行一次（默认 true） */
  immediate?: boolean
  /** 失败退避上限（默认 5 分钟） */
  maxDelayMs?: number
  /** 轮询开关（默认 true） */
  enabled?: boolean
  /** P1-2：页面隐藏（document.hidden，如切到其他标签/最小化）时暂停轮询，恢复可见后继续 */
  pauseWhenHidden?: boolean
}

/**
 * @param fn 轮询任务；返回 false 视为本次失败（触发退避），返回 true/undefined 视为成功
 * @param baseDelayMs 常规轮询间隔（毫秒）
 */
export function usePolling(
  fn: () => Promise<boolean | void>,
  baseDelayMs: number,
  options: UsePollingOptions = {}
): void {
  const { immediate = true, maxDelayMs = 5 * 60 * 1000, enabled = true, pauseWhenHidden = false } = options
  const fnRef = useRef(fn)
  fnRef.current = fn
  const inFlightRef = useRef(false)
  const failCountRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    let scheduled = false

    const run = async (): Promise<void> => {
      if (!alive || inFlightRef.current) return
      if (pauseWhenHidden && document.hidden) return
      inFlightRef.current = true
      try {
        const ok = await fnRef.current()
        failCountRef.current = ok === false ? failCountRef.current + 1 : 0
      } catch {
        failCountRef.current += 1
      } finally {
        inFlightRef.current = false
      }
    }

    const schedule = (): void => {
      if (!alive || scheduled) return
      // P1-2：页面隐藏时不排期下一次；恢复可见由 visibilitychange 重新调度
      if (pauseWhenHidden && document.hidden) return
      scheduled = true
      // 指数退避：0 次失败 → base；1 次 → base×2；≥2 次 → maxDelayMs
      const delay = failCountRef.current === 0
        ? baseDelayMs
        : failCountRef.current === 1
          ? baseDelayMs * 2
          : maxDelayMs
      timer = setTimeout(() => {
        scheduled = false
        void run().then(() => { if (alive) schedule() })
      }, delay)
    }

    const onVisibilityChange = (): void => {
      // 从隐藏恢复可见：若当前没有排期的下一次，立即重新调度
      if (!document.hidden && alive && !scheduled) schedule()
    }

    if (immediate) void run()
    schedule()
    if (pauseWhenHidden) document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      if (pauseWhenHidden) document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [fn, baseDelayMs, immediate, maxDelayMs, enabled, pauseWhenHidden])
}
