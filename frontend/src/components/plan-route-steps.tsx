import type { TourismStop } from "@/lib/types";

/**
 * 行程顺序示意图（HTML 版）：
 * 相比固定宽度的 SVG 图片，节点会随容器自动换行/纵向排列，
 * 长地点名会完整换行显示，不会再出现首尾被裁切、名字显示不全的问题。
 */
export function PlanRouteSteps({ stops }: { stops: TourismStop[] }) {
  if (!stops.length) return null;
  return (
    <figure className="plan-route-steps" aria-label="行程顺序示意，非道路导航">
      <figcaption>
        <span>行程顺序示意</span>
        <small>非道路导航 · 按建议到访时间排列</small>
      </figcaption>
      <ol>
        {stops.map((stop, index) => (
          <li key={`${stop.time}-${stop.name}-${index}`} data-category={stop.category}>
            <span className="plan-route-node" aria-hidden="true">{index + 1}</span>
            <div>
              <time>{stop.time}</time>
              <strong>{stop.name}</strong>
              <small>{stop.category}</small>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
