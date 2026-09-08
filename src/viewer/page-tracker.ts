export type PageMetric = {
  pageNumber: number;
  intersectionRatio: number;
  centerDistance: number;
};

const SWITCH_ADVANTAGE = 0.08;

export function pageScore(metric: PageMetric, viewportHeight: number): number {
  const distancePenalty = Math.min(1, metric.centerDistance / Math.max(1, viewportHeight));
  return metric.intersectionRatio * 2 - distancePenalty * 0.35;
}

export function selectCurrentPage(
  metrics: PageMetric[],
  currentPage: number,
  viewportHeight: number,
): number {
  if (metrics.length === 0) return currentPage;
  const ranked = [...metrics].sort(
    (left, right) => pageScore(right, viewportHeight) - pageScore(left, viewportHeight),
  );
  const best = ranked[0];
  if (!best) return currentPage;
  const current = metrics.find((metric) => metric.pageNumber === currentPage);
  if (!current) return best.pageNumber;
  return pageScore(best, viewportHeight) > pageScore(current, viewportHeight) + SWITCH_ADVANTAGE
    ? best.pageNumber
    : currentPage;
}

export class PageTracker {
  readonly #root: HTMLElement;
  readonly #onChange: (pageNumber: number) => void;
  readonly #ratios = new Map<number, number>();
  #observer: IntersectionObserver | null = null;
  #currentPage = 1;
  #frame = 0;

  constructor(root: HTMLElement, onChange: (pageNumber: number) => void) {
    this.#root = root;
    this.#onChange = onChange;
  }

  observe(elements: HTMLElement[]): void {
    this.disconnect();
    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (Number.isFinite(pageNumber)) this.#ratios.set(pageNumber, entry.intersectionRatio);
        }
        this.#scheduleUpdate();
      },
      { root: this.#root, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    );
    for (const element of elements) this.#observer.observe(element);
    this.#root.addEventListener("scroll", this.#scheduleUpdate, { passive: true });
  }

  setCurrentPage(pageNumber: number): void {
    this.#currentPage = pageNumber;
  }

  disconnect(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#root.removeEventListener("scroll", this.#scheduleUpdate);
    this.#ratios.clear();
    cancelAnimationFrame(this.#frame);
  }

  readonly #scheduleUpdate = (): void => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#update());
  };

  #update(): void {
    const rootRect = this.#root.getBoundingClientRect();
    const center = rootRect.top + rootRect.height / 2;
    const metrics: PageMetric[] = [];
    for (const child of this.#root.querySelectorAll<HTMLElement>("[data-page-number]")) {
      const rect = child.getBoundingClientRect();
      metrics.push({
        pageNumber: Number(child.dataset.pageNumber),
        intersectionRatio: this.#ratios.get(Number(child.dataset.pageNumber)) ?? 0,
        centerDistance: Math.abs(rect.top + rect.height / 2 - center),
      });
    }
    const next = selectCurrentPage(metrics, this.#currentPage, rootRect.height);
    if (next !== this.#currentPage) {
      this.#currentPage = next;
      this.#onChange(next);
    }
  }
}
