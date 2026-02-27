type Props = {
  notifications: string[];
};

export function NotificationFeed({ notifications }: Props) {
  return (
    <section className="panel">
      <h3 className="section-title">Notifications</h3>
      {notifications.length === 0 ? (
        <p className="empty">No recent events.</p>
      ) : (
        <ul className="feed-list">
          {notifications.map((item, idx) => (
            <li key={`${item}-${idx}`}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
