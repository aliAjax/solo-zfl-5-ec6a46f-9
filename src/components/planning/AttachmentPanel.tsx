import { useMemo } from 'react'
import { Link2, Link2Off } from 'lucide-react'
import { useSceneStore } from '@/store/useSceneStore'
import { useTransitStore } from '@/store/useTransitStore'
import { attachScenes } from '@/services/attachment'
import { formatTimestamp, getWeatherIcon } from '@/utils/sceneHelpers'

export default function AttachmentPanel() {
  const scenes = useSceneStore((s) => s.scenes)
  const network = useTransitStore((s) => s.network)

  const attachments = useMemo(() => attachScenes(scenes, network), [scenes, network])
  const sorted = useMemo(
    () => [...scenes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [scenes],
  )
  const linkedCount = sorted.filter((s) => attachments.get(s.id)?.status === 'linked').length

  if (scenes.length === 0) {
    return (
      <div className="rounded-xl border border-teal-800 bg-teal-900/50 p-8 text-center text-sm text-mist-400">
        还没有窗景记录。去「记录」页写一条,这里会把它挂到线网上。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 rounded-xl border border-teal-800 bg-teal-900/50 px-4 py-3 text-xs text-mist-300">
        <span>共 {scenes.length} 条记录</span>
        <span className="flex items-center gap-1 text-dusk-300">
          <Link2 className="h-3.5 w-3.5" />已挂接 {linkedCount} 条
        </span>
        <span className="flex items-center gap-1 text-red-300/80">
          <Link2Off className="h-3.5 w-3.5" />未关联 {scenes.length - linkedCount} 条
        </span>
        <span className="text-mist-500">挂接只读推导,原记录不做改动</span>
      </div>

      <ul className="space-y-2">
        {sorted.map((scene) => {
          const att = attachments.get(scene.id)
          return (
            <li
              key={scene.id}
              className="rounded-xl border border-teal-800 bg-teal-900/50 p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                {getWeatherIcon(scene.weather)}
                <span className="text-mist-100">{scene.routeName || '(空线路名)'}</span>
                <span className="text-teal-700">·</span>
                <span className="text-mist-300">{scene.segment || '(空区间)'}</span>
                <span className="text-[10px] text-mist-500">{formatTimestamp(scene.timestamp)}</span>
              </div>
              <div className="mt-1.5 text-xs">
                {att?.status === 'linked' ? (
                  <span className="flex items-center gap-1 text-dusk-300">
                    <Link2 className="h-3.5 w-3.5" />
                    已挂到「{att.routeName}」{att.fromName} → {att.toName}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-300/80">
                    <Link2Off className="h-3.5 w-3.5" />
                    未关联:{att?.reason ?? '未知原因'}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
