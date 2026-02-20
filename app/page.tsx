import { getCurrentUser } from "@/lib/auth/server";

function displayRoles(roles: string[]) {
  if (roles.length === 0) return "No roles assigned";
  return roles.join(", ");
}

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main>
      <section className="hero">
        <h1>Abundant CRM</h1>
        <p>
          Central workspace for Health Systems, Co-Investors, and Companies with role-based access control.
        </p>
      </section>

      <section className="panel">
        <h2>Overview</h2>
        <p className="muted">
          This system tracks pipeline entities, relationship data, research status, and collaboration workflows.
        </p>
        {user ? (
          <p className="muted">
            Signed in as <strong>{user.name || user.email}</strong> with roles: <strong>{displayRoles(user.roles)}</strong>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>With Appreciation</h2>
        <p className="muted">
          Thank you to <strong>Nick Siderys</strong> and <strong>Hanna Helms</strong> for your contributions to
          AbundantCRM.
        </p>
      </section>
    </main>
  );
}
