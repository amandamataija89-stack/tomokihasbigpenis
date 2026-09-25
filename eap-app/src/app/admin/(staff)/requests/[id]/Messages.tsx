import type { Message } from "@/lib/messages";
import { messageClient } from "../../../actions";
import { formatDate } from "../../../format";

export function Messages({
  requestId,
  nickname,
  messages,
  flash,
}: {
  requestId: string;
  nickname: string;
  messages: Message[];
  flash?: string;
}) {
  return (
    <section className="card stack" id="messages">
      <h2>Messages with {nickname}</h2>
      <p className="small">
        {nickname} reads and answers these on a private page linked from their emails. Emails only say there&apos;s
        a new message, never what it says.
      </p>
      {messages.length > 0 && (
        <div className="thread">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.sender === "staff" ? "mine" : "theirs"}`}>
              <span className="bubble-meta">
                {m.sender === "client" ? nickname : m.staff_name ?? "Former staff"} · {formatDate(m.created_at)}
              </span>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
      )}
      <form action={messageClient.bind(null, requestId)} className="form" style={{ gap: 10 }}>
        <label htmlFor="message">Message {nickname}</label>
        <textarea
          id="message"
          name="message"
          maxLength={4000}
          placeholder="e.g. Hello, I'm your counsellor. Would Tuesday at 17:00 work for a first session online?"
        />
        {flash === "sent" && <p className="flash" role="status">Sent. {nickname} has been emailed a link to read it.</p>}
        {flash === "empty" && <p className="err" role="alert">Write something before sending.</p>}
        {flash === "emailfailed" && (
          <p className="err" role="alert">The message is saved, but the email to {nickname} couldn&apos;t be sent. Try again, or call them.</p>
        )}
        <div className="actions"><button type="submit">Send message</button></div>
      </form>
    </section>
  );
}
