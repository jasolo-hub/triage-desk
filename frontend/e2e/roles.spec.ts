import { expect, type APIRequestContext, type Page, test } from "@playwright/test";

// Two flows that prove the parts most likely to regress unnoticed:
// 1. the AGENT sees a restricted admin AND the API refuses the same actions;
// 2. an ADMIN can walk a ticket through its whole status workflow in the UI.
// Needs the API + Vite running and the seeded DB (see playwright.config.ts).

const API = process.env.E2E_API_URL ?? "http://localhost:3000/api";
const PASSWORD = "Password123!";

async function loginInUi(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/tickets/);
}

async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken;
}

test("agent sees a restricted admin, and the API enforces the same limits", async ({ page, request }) => {
  await loginInUi(page, "agent@triage.dev");

  // Sider: no Users entry (menu items come from the permissions map).
  await expect(page.getByRole("menuitem")).toHaveText(["Tickets", "Customers", "Tags", "Logout"]);

  // Tickets list: wait for real rows, then check what is missing.
  const table = page.getByRole("table");
  await expect(table.getByRole("button", { name: "eye" }).first()).toBeVisible(); // a row's Show button
  await expect(page.getByRole("button", { name: /Create/ })).toBeVisible(); // agents log tickets (D25)
  await expect(table.getByRole("checkbox")).toHaveCount(0); // no row selection = no bulk actions
  await expect(table.getByRole("button", { name: "delete" })).toHaveCount(0); // no Delete on any row

  // A hand-typed URL the role may not open shows the 403 page, not a crash.
  await page.goto("/users");
  await expect(page.getByText("Not allowed")).toBeVisible();
  await expect(page.getByText("Your role does not have access to this page.")).toBeVisible();

  // The hiding above is cosmetic; the API must refuse the same actions.
  const token = await apiToken(request, "agent@triage.dev");
  const headers = { Authorization: `Bearer ${token}` };
  // Agent may create (D25); a new ticket starts OPEN and unassigned …
  const created = await request.post(`${API}/tickets`, {
    headers,
    data: { title: `e2e agent-created ${Date.now()}`, description: "logged by an agent", customerId: 1 },
  });
  expect(created.status()).toBe(201);
  const ticket = await created.json();
  expect(ticket.status).toBe("OPEN");
  expect(ticket.assigneeId).toBeNull();
  // … but may not delete, bulk-act or manage users.
  expect((await request.delete(`${API}/tickets/${ticket.id}`, { headers })).status()).toBe(403);
  expect(
    (await request.post(`${API}/tickets/bulk-assign`, { headers, data: { ids: [ticket.id], assigneeId: null } })).status(),
  ).toBe(403);
  expect((await request.get(`${API}/users?_start=0&_end=1`, { headers })).status()).toBe(403);

  // Cleanup needs an admin (agents cannot delete).
  const adminHeaders = { Authorization: `Bearer ${await apiToken(request, "admin@triage.dev")}` };
  expect((await request.delete(`${API}/tickets/${ticket.id}`, { headers: adminHeaders })).status()).toBe(200);
});

test("admin creates a ticket and moves it Open → In progress → Resolved → Closed", async ({ page, request }) => {
  await loginInUi(page, "admin@triage.dev");
  let ticketId: number | undefined;

  try {
    // Create through the UI. The timestamp keeps reruns from colliding.
    const title = `E2E smoke ${Date.now()}`;
    await page.goto("/tickets/create");
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Created by the Playwright smoke test.");
    // Priority is left at the form default (Normal) — asserted on the response below.
    // (role, not label: "customer-service" icons also contain the word)
    await page.getByRole("combobox", { name: /Customer/ }).click();
    // antd renders options in a virtual list without accessible roles, so this
    // is the one CSS locator: the first option of the open dropdown.
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option").first().click();

    const created = page.waitForResponse((r) => r.url() === `${API}/tickets` && r.request().method() === "POST");
    await page.getByRole("button", { name: /Save/ }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const ticket = await response.json();
    ticketId = ticket.id;
    expect(ticket).toMatchObject({ title, status: "OPEN", priority: "NORMAL" });
    await expect(page).toHaveURL(new RegExp(`/tickets/show/${ticketId}$`));

    // One status change: open the menu, pick the target, confirm in the dialog.
    // Scoped to <main>: the dialog's confirm button (a portal outside main)
    // is also called "Change status".
    const changeStatus = page.getByRole("main").getByRole("button", { name: /Change status/ });
    const pickStatus = async (label: string) => {
      await changeStatus.click();
      await page.getByRole("menuitem", { name: label }).click();
      return page.getByRole("dialog", { name: new RegExp(`→ ${label}$`) });
    };

    let dialog = await pickStatus("In progress");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(page.getByText("Status changed to In progress")).toBeVisible();

    // RESOLVED needs a resolution comment: refused empty, accepted with text.
    dialog = await pickStatus("Resolved");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(dialog.getByText("Resolving requires a resolution comment")).toBeVisible();
    const resolution = `Fixed by the smoke test ${Date.now()}`;
    await dialog.getByLabel("Resolution comment").fill(resolution);
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(page.getByText("Status changed to Resolved")).toBeVisible();
    // ...and it shows up in the comments table, marked as the resolution.
    const resolutionRow = page.getByRole("row").filter({ hasText: resolution });
    await expect(resolutionRow).toBeVisible();
    await expect(resolutionRow.getByText("Resolution", { exact: true })).toBeVisible();

    dialog = await pickStatus("Closed");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(page.getByText("Status changed to Closed")).toBeVisible();
    // CLOSED is final: nothing left to change.
    await expect(changeStatus).toHaveCount(0);
  } finally {
    // Cleanup: delete the ticket through the API so the smoke test leaves no
    // data behind, even when an assertion above failed. It reuses the
    // browser session's token instead of logging in again: /auth/login is
    // rate-limited to 10/min per IP and every run already logs in 3 times.
    if (ticketId !== undefined) {
      const token = await page.evaluate(() => localStorage.getItem("triage.accessToken"));
      const res = await request.delete(`${API}/tickets/${ticketId}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(res.status()).toBe(200);
    }
  }
});
