export function ActivitySparkline({
  bars,
}: {
  bars: [number, number, number, number, number, number];
}) {
  const largest = Math.max(...bars, 1);
  return (
    <span className="activity-bars" aria-hidden="true">
      {bars.map((value, index) => (
        <i
          key={index}
          style={{
            height: `${value === 0 ? 7 : Math.max(12, (value / largest) * 100)}%`,
          }}
        />
      ))}
    </span>
  );
}
