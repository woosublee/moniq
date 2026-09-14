import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getOwnerContext } from "@/lib/auth/owner";

export default async function Home() {
  await connection();
  await getOwnerContext();
  redirect("/ledger");
}
