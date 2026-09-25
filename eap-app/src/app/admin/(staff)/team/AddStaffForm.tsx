"use client";

import { useActionState } from "react";
import { addStaff } from "../../actions";

export function AddStaffForm({ canAddAdmin }: { canAddAdmin: boolean }) {
  const [state, action, pending] = useActionState(addStaff, {});
  return (
    <form action={action} className="card form" key={state.done}>
      <h2>Add a team member</h2>
      <p className="small">
        They get an email invitation with a link to choose their own password. You never see or send passwords.
      </p>
      <div className="row">
        <div className="field">
          <label htmlFor="s-name">Name</label>
          <input id="s-name" name="name" type="text" />
        </div>
        <div className="field">
          <label htmlFor="s-email">Email</label>
          <input id="s-email" name="email" type="email" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="s-role">Role</label>
          <select id="s-role" name="role" defaultValue="counsellor">
            <option value="counsellor">Counsellor: sees only their own clients</option>
            <option value="coordinator">Coordinator: sees and assigns all clients</option>
            {canAddAdmin && <option value="admin">Admin: everything, including feedback</option>}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-cap">New clients per month</label>
          <input id="s-cap" name="capacity" type="number" min={0} max={100} defaultValue={5} className="cap-input" />
        </div>
      </div>
      {state.error && <p className="err" role="alert">{state.error}</p>}
      {state.done && <p className="flash" role="status">{state.done}</p>}
      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send invitation"}</button>
      </div>
    </form>
  );
}
