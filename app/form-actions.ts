"use server";

import { sql } from "@vercel/postgres";

export async function create(
  prevState: {
    message: string;
  },
  formData: FormData
) {
  "use server";

  console.log("Creating waitlist entry");

  try {
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    console.log(formData);
    if (!name || !email) {
      return { message: "Please enter your name and email address" };
    }
    const { rows } = await sql`
          INSERT INTO waitlist (name, email)
          VALUES (${name}, ${email})
        `;
    console.log(rows);
    return { message: "Thank you for signing up!" };
  } catch (err) {
    console.error(err);
    return { message: "Please try again later" };
  }
}
