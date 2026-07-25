export function ActivitySparkline({ weeks }: { weeks: readonly boolean[] }) {
  return (
    <span className="activity-weeks" aria-hidden="true">
      {weeks.map((active, index) => (
        <i key={index} className={active ? "active" : undefined} />
      ))}
    </span>
  );
}
