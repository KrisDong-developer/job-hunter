// 采集页的状态胶囊：把运行/健康状态枚举翻成中文标签 + 色调。
// 只负责 CrawlState / HealthState 两种枚举到 `jh-tag jh-tone-*` 的映射，不印内部枚举。

import { CRAWL_STATE_LABEL, CRAWL_STATE_TONE, HEALTH_STATE_LABEL, HEALTH_STATE_TONE, type CrawlState, type HealthState } from '../../../shared/contract/enums/crawl.js'

/** 状态胶囊（成功-绿 / 部分成功-黄 / 失败-红 …），中文，不印内部枚举。 */
export function StateTag(props: { state: CrawlState | HealthState; kind: 'run' | 'health' }) {
  const label =
    props.kind === 'run'
      ? CRAWL_STATE_LABEL[props.state as CrawlState]
      : HEALTH_STATE_LABEL[props.state as HealthState]
  const tone =
    props.kind === 'run'
      ? CRAWL_STATE_TONE[props.state as CrawlState]
      : HEALTH_STATE_TONE[props.state as HealthState]
  return <span className={`jh-tag jh-tone-${tone}`}>{label}</span>
}
