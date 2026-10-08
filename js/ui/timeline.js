// Data 2 as a quiet line (d3-shape). It is drawn by CSS (stroke-dashoffset) when body gets .is-zoomed.
import { line, curveMonotoneX, scaleLinear, select } from '../../vendor/d3-lite.js';

const W = 360, H = 118, M = { top: 34, right: 8, bottom: 30, left: 8 };

export function createTimeline({ el, series }) {
  const x = scaleLinear().domain([series[0].year, series.at(-1).year]).range([M.left, W - M.right]);
  const ys = series.map((d) => d.minutes);
  const y = scaleLinear().domain([Math.min(...ys) - 10, Math.max(...ys) + 10]).range([H - M.bottom, M.top]);
  const path = line().x((d) => x(d.year)).y((d) => y(d.minutes)).curve(curveMonotoneX)(series);
  const first = series[0], last = series.at(-1);

  return {
    render(i18n) {
      el.replaceChildren();
      const svg = select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
      svg.append('text').attr('class', 'timeline-title').attr('x', M.left).attr('y', 14).text(i18n.t('timeline.title'));
      svg.append('line').attr('class', 'timeline-axis').attr('x1', M.left).attr('x2', W - M.right).attr('y1', H - M.bottom + 8).attr('y2', H - M.bottom + 8);
      svg.append('path').attr('class', 'timeline-line').attr('d', path).attr('pathLength', 1);
      svg.append('circle').attr('class', 'timeline-dot').attr('cx', x(last.year)).attr('cy', y(last.minutes)).attr('r', 3);
      const label = (d, anchor, dx) => svg.append('text').attr('class', 'timeline-label').attr('text-anchor', anchor)
        .attr('x', x(d.year) + dx).attr('y', H - 8).text(`${d.year} · ${d.minutes} ${i18n.t('timeline.unit')}`);
      label(first, 'start', 0);
      label(last, 'end', 0);
    },
  };
}
