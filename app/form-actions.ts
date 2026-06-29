"use server";

import { neon } from "@neondatabase/serverless";

export async function create(
  prevState: { message: string },
  formData: FormData,
) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;

  if (!name || !email) {
    return { message: "Please enter your name and email address." };
  }

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("No database connection string configured");
    return { message: "Please try again later." };
  }

  try {
    const sql = neon(connectionString);
    await sql`INSERT INTO waitlist (name, email) VALUES (${name}, ${email})`;
    return { message: "Thank you for signing up!" };
  } catch (err) {
    console.error(err);
    return { message: "Please try again later." };
  }
}
