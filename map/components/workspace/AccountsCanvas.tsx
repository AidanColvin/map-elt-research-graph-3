"use client";

import AccountsTable from "./AccountsTable";
import { ACCOUNTS } from "./accountsData";
import { CanvasCard, FONT } from "./ui";

// takes: nothing
// does: renders the Accounts module — the shared glassmorphic card shell with
//       the native data table inside its own two-axis scroll region, so the
//       sticky frosted header binds to it and the scroll position persists
//       while the view stays mounted
// returns: the accounts canvas card element
export default function AccountsCanvas() {
  return (
    <CanvasCard
      title="Accounts"
      toolbar={
        <div
          style={{
            padding: "14px 24px 16px",
            fontSize: 13,
            color: "#86868b",
            fontFamily: FONT,
          }}
        >
          {ACCOUNTS.length} partner accounts · UNC Innovate Carolina industry database
        </div>
      }
    >
      <div style={{ height: "100%", overflow: "auto" }}>
        <AccountsTable accounts={ACCOUNTS} />
      </div>
    </CanvasCard>
  );
}
