export function initialPageSize(title: string) {
  try {
    const saved = Number(localStorage.getItem(`register-page-size:${title}`));
    if ([10, 25, 50, 100].includes(saved)) return saved;
  } catch {
    /* Optional view preferences. */
  }
  return window.matchMedia("(max-width: 760px)").matches ? 10 : 25;
}
