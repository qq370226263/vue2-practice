// dependence 依赖 - 收集变量的依赖，比如有变量a，有用到a的地方就有依赖
// 编译模板的时候，就会触发a的getter，当a值变动时，就要触发更新
// 所以在getter中收集依赖，在setter中触发依赖更新。

// 每个属性、对象、数组上都有一个 Dep 类型，Dep 类主要就是收集用于渲染的 watcher 
import config from '../config'
import { DebuggerOptions, DebuggerEventExtraInfo } from 'v3'

let uid = 0

// 正在使用的观察者队列
const pendingCleanupDeps: Dep[] = []

export const cleanupDeps = () => {
  for (let i = 0; i < pendingCleanupDeps.length; i++) {
    const dep = pendingCleanupDeps[i]
    dep.subs = dep.subs.filter(s => s)
    dep._pending = false
  }
  pendingCleanupDeps.length = 0
}

/**
 * @internal
 */
export interface DepTarget extends DebuggerOptions {
  id: number
  addDep(dep: Dep): void
  update(): void
}

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * @internal
 */
export default class Dep {
  static target?: DepTarget | null
  id: number
  subs: Array<DepTarget | null>
  // pending subs cleanup
  _pending = false

  constructor() {
    this.id = uid++
    this.subs = []
  }
  // 添加订阅者
  addSub(sub: DepTarget) {
    this.subs.push(sub)
  }
  // 移除订阅者
  removeSub(sub: DepTarget) {
    // #12696 deps with massive amount of subscribers are extremely slow to
    // clean up in Chromium
    // to workaround this, we unset the sub for now, and clear them on
    // next scheduler flush.
    this.subs[this.subs.indexOf(sub)] = null
    if (!this._pending) {
      this._pending = true
      pendingCleanupDeps.push(this)
    }
  }

  // 添加依赖
  depend(info?: DebuggerEventExtraInfo) {
    if (Dep.target) {
      Dep.target.addDep(this)
      if (__DEV__ && info && Dep.target.onTrack) {
        Dep.target.onTrack({
          effect: Dep.target,
          ...info
        })
      }
    }
  }

  // 通知订阅者
  notify(info?: DebuggerEventExtraInfo) {
    // stabilize the subscriber list first
    const subs = this.subs.filter(s => s) as DepTarget[]
    if (__DEV__ && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 轮询逐个更新订阅者
    for (let i = 0, l = subs.length; i < l; i++) {
      const sub = subs[i]
      if (__DEV__ && info) {
        sub.onTrigger &&
          sub.onTrigger({
            effect: subs[i],
            ...info
          })
      }
      sub.update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack: Array<DepTarget | null | undefined> = []
// 渲染阶段，访问页面上的属性变量时，给对应的 Dep 添加 watcher，标记target
export function pushTarget(target?: DepTarget | null) {
  targetStack.push(target)
  Dep.target = target
}
// 访问结束后删除，并重新标记上一个target
export function popTarget() {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
