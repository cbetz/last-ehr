"use server";

import { neon } from "@neondatabase/serverless";

export async function create(
  prevState: { message: string },
  formData: FormData,
) {
  const name = String(formData.get("name") ?? "").trim();
  // Normalize so the same address can't sign up twice with different casing
  // or stray whitespace. The waitlist table has a unique index on email
  // (waitlist_email_key) that assumes this normalization.
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!name || !email) {
    return { message: "Please enter your name and email address." };
  }
  if (name.length > 200 || email.length > 320 || !email.includes("@")) {
    return { message: "Please enter a valid name and email address." };
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("No database connection string configured");
    return { message: "Please try again later." };
  }

  try {
    const sql = neon(connectionString);
    // ON CONFLICT relies on the unique index; RETURNING tells us whether a
    // row was actually inserted (empty result means the email already exists).
    const inserted = await sql`
      INSERT INTO waitlist (name, email)
      VALUES (${name}, ${email})
      ON CONFLICT (email) DO NOTHING
      RETURNING id
    `;
    if (inserted.length === 0) {
      return {
        message: "You're already on the list. We'll be in touch.",
      };
    }
    return { message: "Thank you for signing up!" };
  } catch (err) {
    console.error(err);
    return { message: "Please try again later." };
  }
}
