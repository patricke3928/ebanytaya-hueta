type Props = {
  notifications: string[];
  title: string;
  emptyText: string;
};

export function NotificationFeed({ notifications, title, emptyText }: Props) {
  return (
    <section className="panel">
      <h3 className="section-title">{title}</h3>
      {notifications.length === 0 ? (
        <p className="empty">{emptyText}</p>
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
