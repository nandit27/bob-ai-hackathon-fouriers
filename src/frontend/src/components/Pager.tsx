export function paginate<T>(list: T[], page: number, per: number): T[] {
  return list.slice(page * per, page * per + per);
}

export function pageCount(listLength: number, per: number): number {
  return Math.max(1, Math.ceil(listLength / per));
}

export function Pager({ page, total, onChange }: { page: number; total: number; onChange: (next: number) => void }) {
  if (total <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-small" disabled={page === 0} onClick={() => onChange(page - 1)}>Prev</button>
      <span>Page {page + 1} of {total}</span>
      <button className="btn btn-small" disabled={page >= total - 1} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}
