/**
 * Admin access for the project editor (the 🛡 icon in the header → #admin).
 *
 * ⚠️ SECURITY NOTE — this is a STATIC site (GitHub Pages, no server). The login
 * is "soft" protection: it keeps casual visitors out, but anyone technical can
 * read the bundled JS and bypass it. Don't store anything sensitive behind it.
 * Admin edits are saved in your browser and exported to works.custom.json, which
 * you commit to the repo. For real auth you'd need a backend.
 *
 * Password-only login.
 *
 * To change it: open the site, run  await __genHash("your-new-password")  in the
 * browser console, and paste the printed hash into `passwordHash` below.
 */
export const adminConfig = {
  // SHA-256 hex of the admin password.
  passwordHash: "d3071fcf4d13ab9082e764eb5f86e6651b8fa794ff561fd4e0f179e82dfb388d",
};
