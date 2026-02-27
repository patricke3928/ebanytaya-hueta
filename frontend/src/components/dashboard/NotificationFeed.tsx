type Props = {
  notifications: string[];
};

export function NotificationFeed({ notifications }: Props) {
  return (
    <section>
      <h3>Notifications</h3>
      <ul>
        {notifications.map((item, idx) => (
          <li key={`${item}-${idx}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
