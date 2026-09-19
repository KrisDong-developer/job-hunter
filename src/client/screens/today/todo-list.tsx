import type { TodoDto } from '../../../shared/dto.js'
import { confirmTargetJobIdOf, planIdOf, todoKindLabel, todoLevelLabel } from '../../format/today.js'

/**
 * 待办 / 欠账列表。
 *
 * 四种待办各有自己的动作（立即补跑 / 去登录 / 去处理 / 去确认恢复），
 * 它们全是父组件的回调 —— 这里只按 `todo.kind` 决定摆哪几个按钮。
 */
export function TodoList(props: {
  todos: TodoDto[]
  running: boolean
  readOnly: boolean
  onCatchUp: (planId: number) => Promise<void>
  onLogin: (platformId: string) => Promise<void>
  onResumeConfirm: (todoId: number, jobId: number) => Promise<void>
  onGoCollect: () => void
  onIgnore: (todoId: number) => Promise<void>
}) {
  const todos = props.todos
  return (
    <section className="jh-card">
      <h2 className="jh-card-title">待办</h2>
      {todos.length === 0 ? (
        <p className="jh-muted">没有待办。</p>
      ) : (
        <ul className="jh-todos">
          {todos.map((todo) => {
            const planId = planIdOf(todo)
            const confirmJobId = confirmTargetJobIdOf(todo)
            return (
              <li key={todo.id} className={`jh-todo jh-todo-${todo.level}`}>
                <span className="jh-todo-level">{todoLevelLabel(todo.level)}</span>
                <div className="jh-todo-body">
                  <div className="jh-todo-title">{todo.title}</div>
                  <div className="jh-muted">
                    {todoKindLabel(todo.kind)}
                    {todo.ref === null ? '' : ` · ${todo.ref}`}
                  </div>
                  <div className="jh-todo-actions">
                    {todo.kind === 'catch-up' && planId !== null && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline"
                        disabled={props.running}
                        onClick={() => void props.onCatchUp(planId)}
                      >
                        立即补跑
                      </button>
                    )}
                    {todo.kind === 'login-required' && todo.ref !== null && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline"
                        /* 只读实例不许开浏览器（宿主也会拒绝）—— 与「立即采集」同一条纪律 */
                        disabled={props.running || props.readOnly}
                        onClick={() => void props.onLogin(todo.ref as string)}
                      >
                        去登录
                      </button>
                    )}
                    {todo.kind === 'confirm-action' && confirmJobId !== null && (
                      <button
                        type="button"
                        className="jh-btn jh-btn-inline"
                        disabled={props.running}
                        onClick={() => void props.onResumeConfirm(todo.id, confirmJobId)}
                      >
                        去处理
                      </button>
                    )}
                    {todo.kind === 'blocked' && (
                      <button type="button" className="jh-btn jh-btn-inline" onClick={props.onGoCollect}>
                        去确认恢复
                      </button>
                    )}
                    <button
                      type="button"
                      className="jh-btn jh-btn-inline"
                      disabled={props.running}
                      onClick={() => void props.onIgnore(todo.id)}
                    >
                      忽略
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
